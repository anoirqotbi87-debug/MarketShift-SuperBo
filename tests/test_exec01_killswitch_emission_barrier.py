"""EXEC-01 — Barrière d'émission atomique KillSwitch / file d'ordres.

Tests adversariaux déterministes autour du point de linéarisation réel :
le démarrage de ``connector.execute_order()`` DANS le thread d'exécution.

Couverts :
  - activation entre soumission au pool et admission logique dans le thread ;
  - activation pendant un appel réellement engagé ;
  - timeout réel de ``asyncio.wait_for()`` avec thread bloqué (compteur conservé) ;
  - activation pendant ce thread bloqué (aucune nouvelle émission) ;
  - clôture du suivi seulement à la terminaison réelle du thread ;
  - annulation du worker pendant un appel thread (aucune fausse clôture) ;
  - réarmement : aucun ancien payload réémis ;
  - générations : estampillage atomique, invalidation par activation/réarmement ;
  - concurrence multi-threads : invariants déterministes.

Aucun broker réel : les connecteurs sont des doubles pilotés par ``threading.Event``.
"""

import asyncio
import threading
import time
import uuid
from unittest.mock import MagicMock

import pytest

from agents.kill_switch import KillSwitch
from application.engine import Engine


# ── Doubles et utilitaires ───────────────────────────────────────────────────


def _payload(symbol="EURUSD", volume=0.01, epoch=0):
    return {
        "symbol": symbol,
        "direction": "BUY",
        "volume": volume,
        "sl_price": 1.0900,
        "tp_price": 1.1100,
        "magic": 12345,
        "order_comment": "ms_12345_abcdef01",
        "pre_snapshot_ok": True,
        "pre_existing_tickets": [],
        "metadata": {},
        "emission_epoch": epoch,
    }


def _make_engine(connector=None):
    """Engine minimal (sans __init__) : uniquement l'état nécessaire au worker."""
    eng = Engine.__new__(Engine)
    eng.connector = connector if connector is not None else MagicMock()
    eng.notifier = None
    eng.kill_switch = KillSwitch(eng.connector, notifier=None)
    eng.state_manager = MagicMock()
    eng.state_manager.positions = []
    eng.running = True
    eng.order_queue = asyncio.Queue()
    eng._pending_reconciliation = []
    eng._known_position_tickets = set()
    eng._neutralized_orders = []
    eng._abandoned_emissions = []
    eng._loop = None
    return eng


class _BlockingConnector:
    """``execute_order`` bloque jusqu'à libération explicite (thread réel)."""

    connected = False

    def __init__(self, accept=True):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.calls = []
        self.accept = accept

    def execute_order(self, *args, **kwargs):
        self.calls.append(args)
        self.entered.set()
        self.release.wait(10.0)
        if not self.accept:
            raise RuntimeError("broker en échec simulé")
        return {"ticket": 42, "price": 1.1000, "volume": args[2]}

    def get_positions(self, *a, **k):
        return []


async def _await_until(predicate, timeout=5.0, interval=0.01):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(interval)
    return predicate()


async def _stop_worker(eng, task):
    eng.running = False
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):
        pass


# ── 1. Activation entre admission worker et démarrage du thread ─────────────


def test_1_activation_apres_soumission_avant_demarrage_thread(monkeypatch):
    """Le thread est soumis mais pas démarré : l'activation passe avant le
    toute admission logique, donc ``execute_order()`` ne doit jamais être appelée."""
    connector = _BlockingConnector()
    eng = _make_engine(connector)
    eng._order_execution_timeout = 5.0

    submitted = asyncio.Event()
    allow_start = asyncio.Event()
    real_to_thread = asyncio.to_thread

    async def fake_to_thread(func, *args, **kwargs):
        submitted.set()
        await allow_start.wait()
        return await real_to_thread(func, *args, **kwargs)

    monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            await asyncio.wait_for(submitted.wait(), timeout=5.0)

            # L'ordre est dépilé et soumis, mais le thread n'a pas démarré.
            eng.kill_switch.activate("TEST_1_AVANT_DEMARRAGE")
            assert connector.entered.is_set() is False

            allow_start.set()
            await _await_until(lambda: len(eng._neutralized_orders) == 1, timeout=5.0)
        finally:
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    assert connector.calls == [], "aucun appel broker ne doit démarrer après l'activation"
    assert len(eng._neutralized_orders) == 1
    assert eng._neutralized_orders[0]["neutralized_reason"] in {
        "KILL_SWITCH_ACTIVE",
        "STALE_EPOCH",
    }
    assert eng.kill_switch.in_flight_emissions == 0


# ── 2. Activation pendant un appel réellement engagé ────────────────────────


def test_2_activation_pendant_appel_engage():
    connector = _BlockingConnector()
    eng = _make_engine(connector)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(connector.entered.is_set, timeout=5.0)
            assert eng.kill_switch.in_flight_emissions == 1

            eng.kill_switch.activate("TEST_2_APPEL_ENGAGE")
            assert eng.kill_switch.in_flight_at_activation == 1

            connector.release.set()
            assert await _await_until(
                lambda: eng.kill_switch.in_flight_emissions == 0, timeout=5.0
            )
        finally:
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    assert len(connector.calls) == 1, "l'appel engagé est unique et non annulé"
    assert eng._neutralized_orders == []
    assert eng.kill_switch.finished_after_abandon == 0


# ── 3. Timeout réel de wait_for() avec thread bloqué ────────────────────────


def test_3_timeout_reel_conserve_le_suivi_jusqu_a_terminaison_thread():
    connector = _BlockingConnector()
    eng = _make_engine(connector)
    eng._order_execution_timeout = 0.3  # vrai timeout de asyncio.wait_for

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(connector.entered.is_set, timeout=5.0)

            # Timeout réel : le worker abandonne l'attente, PAS le thread.
            assert await _await_until(
                lambda: len(eng._pending_reconciliation) == 1, timeout=5.0
            )
            assert eng.kill_switch.in_flight_emissions == 1, (
                "un timeout de coroutine ne doit pas clôturer un thread encore actif"
            )
            assert eng.kill_switch.abandoned_in_flight == 1
            assert eng.kill_switch.finished_after_abandon == 0
            assert eng._abandoned_emissions[0]["emission_state"] == "INDETERMINATE_IN_FLIGHT"
        finally:
            connector.release.set()
            assert await _await_until(
                lambda: eng.kill_switch.in_flight_emissions == 0, timeout=5.0
            )
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    assert eng.kill_switch.finished_after_abandon == 1
    assert eng.kill_switch.abandoned_in_flight == 0
    assert len(connector.calls) == 1, "aucune réémission après timeout"


# ── 4. Activation pendant le thread bloqué après timeout ────────────────────


def test_4_activation_pendant_thread_bloque_apres_timeout():
    connector = _BlockingConnector()
    eng = _make_engine(connector)
    eng._order_execution_timeout = 0.3

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(connector.entered.is_set, timeout=5.0)
            assert await _await_until(
                lambda: len(eng._pending_reconciliation) == 1, timeout=5.0
            )

            # Thread toujours bloqué : l'activation ne doit ouvrir aucune émission.
            eng.kill_switch.activate("TEST_4_APRES_TIMEOUT")
            await eng.order_queue.put(_payload(epoch=0))

            assert await _await_until(
                lambda: len(eng._neutralized_orders) == 1, timeout=5.0
            )
            assert eng.kill_switch.in_flight_emissions == 1
        finally:
            connector.release.set()
            assert await _await_until(
                lambda: eng.kill_switch.in_flight_emissions == 0, timeout=5.0
            )
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    assert len(connector.calls) == 1, "aucune nouvelle émission malgré la file non vide"


# ── 5. Clôture seulement après terminaison réelle (thread en échec) ─────────


def test_5_cloture_apres_terminaison_reelle_avec_echec_broker():
    connector = _BlockingConnector(accept=False)
    eng = _make_engine(connector)
    eng._order_execution_timeout = 0.3

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(connector.entered.is_set, timeout=5.0)
            assert await _await_until(
                lambda: len(eng._pending_reconciliation) == 1, timeout=5.0
            )
            assert eng.kill_switch.in_flight_emissions == 1
        finally:
            connector.release.set()
            assert await _await_until(
                lambda: eng.kill_switch.in_flight_emissions == 0, timeout=5.0
            )
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    # L'échec du broker est bien survenu APRÈS le timeout, sans fausse clôture.
    assert len(connector.calls) == 1
    assert eng.kill_switch.finished_after_abandon == 1


# ── 6. Annulation du worker pendant un appel thread ─────────────────────────


def test_6_annulation_worker_pendant_appel_thread():
    connector = _BlockingConnector()
    eng = _make_engine(connector)
    eng._order_execution_timeout = 5.0

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(connector.entered.is_set, timeout=5.0)

            task.cancel()
            # Le worker absorbe l'annulation (break) : on ne suppose pas qu'elle
            # remonte, seul le suivi de l'émission compte.
            try:
                await task
            except asyncio.CancelledError:
                pass
            eng.running = False

            assert eng.kill_switch.in_flight_emissions == 1, (
                "l'annulation du worker ne doit pas clôturer un thread actif"
            )
            assert eng.kill_switch.abandoned_in_flight == 1
            assert len(eng._abandoned_emissions) == 1
            assert eng._abandoned_emissions[0]["emission_state"] == "INDETERMINATE_IN_FLIGHT"
        finally:
            connector.release.set()
            assert await _await_until(
                lambda: eng.kill_switch.in_flight_emissions == 0, timeout=5.0
            )

    asyncio.run(scenario())

    assert eng.kill_switch.finished_after_abandon == 1
    assert len(connector.calls) == 1


# ── 7. Réarmement : aucun ancien payload réémis ─────────────────────────────


def test_7_rearmement_ne_reemet_aucun_payload_ancien():
    connector = _BlockingConnector()
    eng = _make_engine(connector)

    async def scenario():
        epoch_avant = eng.kill_switch.stamp_emission_epoch()
        await eng.order_queue.put(_payload(epoch=epoch_avant))
        eng.kill_switch.activate("TEST_7_REARMEMENT")
        neutralises = await eng._neutralize_pending_orders()

        eng.kill_switch.activated_at = time.time() - 120.0
        assert eng.kill_switch.reset(
            confirm_token="RESET_KILL_SWITCH", min_cooldown_seconds=60.0
        )

        # Réarmement effectué : un payload de l'ancienne génération ne part jamais.
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=epoch_avant))
            assert await _await_until(
                lambda: len(eng._neutralized_orders) == 2, timeout=5.0
            )
        finally:
            await _stop_worker(eng, task)
        return neutralises

    neutralises = asyncio.run(scenario())

    assert neutralises == 1
    assert connector.calls == [], "aucun ordre antérieur au réarmement ne doit partir"
    assert eng._neutralized_orders[-1]["neutralized_reason"] == "STALE_EPOCH"


# ── 8. Générations : estampillage atomique et invalidation ───────────────────


def test_8_estampillage_atomique_et_invalidation_de_generation():
    ks = KillSwitch(connector=MagicMock(), notifier=None)
    epoch_initial = ks.stamp_emission_epoch()

    # Activation + réarmement entre l'estampillage et la mise en file :
    # le signal produit avant l'arrêt ne peut pas obtenir une génération fraîche.
    ks.activate("TEST_8_ATOMIQUE")
    assert ks.stamp_emission_epoch() is None, "plus aucune estampille pendant l'arrêt"

    ks.activated_at = time.time() - 120.0
    assert ks.reset(confirm_token="RESET_KILL_SWITCH", min_cooldown_seconds=60.0)
    epoch_rearme = ks.stamp_emission_epoch()
    assert epoch_rearme != epoch_initial

    # Démarrage avec l'ancienne estampille : refusé, jamais appelé.
    admis, verdict = ks.begin_emission_in_thread("em_old", epoch_initial)
    assert (admis, verdict) == (False, "STALE_EPOCH")
    assert ks.in_flight_emissions == 0

    # Démarrage avec la génération courante : accepté, puis clôturé.
    admis, verdict = ks.begin_emission_in_thread("em_new", epoch_rearme)
    assert (admis, verdict) == (True, "STARTED")
    assert ks.in_flight_emissions == 1
    ks.finish_emission("em_new", "TERMINATED")
    assert ks.in_flight_emissions == 0


def test_8b_emission_abandonnee_avant_demarrage_ne_part_jamais():
    ks = KillSwitch(connector=MagicMock(), notifier=None)
    ks.mark_abandoned("em_late")  # le worker a renoncé avant tout démarrage

    admis, verdict = ks.begin_emission_in_thread("em_late", None)
    assert (admis, verdict) == (False, "ABANDONED_BEFORE_START")
    assert ks.in_flight_emissions == 0


# ── 9. Concurrence multi-threads ────────────────────────────────────────────


def test_9_invariants_sous_concurrence():
    ks = KillSwitch(connector=MagicMock(), notifier=None)
    resultats = []
    lock = threading.Lock()
    start = threading.Barrier(41)

    def tentative(i):
        start.wait(10.0)
        admis, verdict = ks.begin_emission_in_thread(f"em_{i}", None)
        with lock:
            resultats.append((admis, verdict))

    threads = [threading.Thread(target=tentative, args=(i,)) for i in range(40)]
    for t in threads:
        t.start()

    start.wait(10.0)
    ks.activate("TEST_9_CONCURRENCE")

    for t in threads:
        t.join(10.0)

    total_demarres = sum(1 for admis, _ in resultats if admis)
    assert ks.is_triggered is True
    assert ks.in_flight_emissions == ks.in_flight_at_activation
    assert total_demarres == ks.in_flight_at_activation, (
        "aucun appel ne doit démarrer après le point de linéarisation de l'activation"
    )
    for admis, verdict in resultats:
        if not admis:
            assert verdict == "KILL_SWITCH_ACTIVE"


# ── 10. Fenêtre entre barrière logique et entrée dans le connecteur ─────────


def test_10_fenetre_barriere_vers_connecteur_mesuree_et_documentee(monkeypatch):
    """Contrat de sécurité retenu (option B) : le point de non-retour est le
    franchissement LOGIQUE de la barrière. Ce test démontre explicitement qu'un
    appel physique au connecteur peut démarrer APRÈS l'activation si son
    admission logique la précède, et que l'écart est mesuré, pas supposé nul.
    """
    class _DispatchProbeConnector(_BlockingConnector):
        """Note la valeur de la télémétrie au moment où l'appel CONNECTEUR entre."""

        def __init__(self):
            super().__init__()
            self.dispatch_ts_at_entry = "ABSENT"
            self.ks = None

        def execute_order(self, *args, **kwargs):
            self.dispatch_ts_at_entry = self.ks.last_gate_to_dispatch_ms
            return super().execute_order(*args, **kwargs)

    connector = _DispatchProbeConnector()
    eng = _make_engine(connector)
    connector.ks = eng.kill_switch
    eng._order_execution_timeout = 5.0

    gate_passed = threading.Event()
    allow_entry = threading.Event()
    original_note = KillSwitch.note_call_dispatch

    def gated_note(self, emission_id, gate_exit_at=None):
        # Bloque exactement entre la sortie de la barrière et le dispatch
        # pré-invocation : c'est la fenêtre résiduelle à caractériser.
        gate_passed.set()
        allow_entry.wait(10.0)
        return original_note(self, emission_id, gate_exit_at)

    monkeypatch.setattr(KillSwitch, "note_call_dispatch", gated_note)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(gate_passed.is_set, timeout=5.0)

            # Activation pendant la fenêtre : aucune barrière ne s'y oppose plus.
            eng.kill_switch.activate("TEST_10_FENETRE")
            assert eng.kill_switch.in_flight_at_activation == 1
            # Aucune télémétrie de dispatch n'existe encore, et le connecteur
            # n'a pas été invoqué : la mesure est bien PRÉ-invocation.
            assert connector.calls == []
            assert eng.kill_switch.last_gate_to_dispatch_ms is None
            await asyncio.sleep(0.2)   # fenêtre volontairement élargie
            allow_entry.set()

            assert await _await_until(connector.entered.is_set, timeout=5.0), (
                "avec le contrat B, l'appel physique démarre bien après l'activation"
            )

            connector.release.set()
            assert await _await_until(
                lambda: eng.kill_switch.in_flight_emissions == 0, timeout=5.0
            )
        finally:
            allow_entry.set()
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    info = [e for e in eng._abandoned_emissions]
    assert len(connector.calls) == 1
    # La télémétrie est déjà renseignée quand le connecteur commence : elle est
    # écrite AVANT l'invocation, elle ne prétend donc pas mesurer l'entrée dans
    # execute_order() (contrat B, mesure de dispatch).
    assert connector.dispatch_ts_at_entry != "ABSENT"
    gap = eng.kill_switch.last_gate_to_dispatch_ms
    assert gap is not None and gap >= 100.0, f"écart de dispatch non mesuré : {gap}ms"
    assert info == []


# ── 11/12. Course mark_abandoned() / terminaison du thread ──────────────────


def test_11_mark_abandoned_apres_terminaison_thread_ne_laisse_pas_d_entree(monkeypatch):
    """Le thread se termine AVANT que le worker ne traite le timeout :
    ``mark_abandoned()`` ne doit laisser aucune entrée terminale."""
    connector = _BlockingConnector()
    connector.release.set()          # le thread se termine immédiatement
    eng = _make_engine(connector)
    eng._order_execution_timeout = 5.0

    async def fake_wait_for(aw, timeout=None):
        await aw                     # le thread va jusqu'au bout...
        raise asyncio.TimeoutError  # ... puis le worker "subit" un timeout

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(
                lambda: len(eng._pending_reconciliation) == 1, timeout=5.0
            )
        finally:
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    assert len(connector.calls) == 1
    assert eng.kill_switch.in_flight_emissions == 0
    assert eng.kill_switch._abandoned_ids == set(), (
        "aucun identifiant terminal ne doit rester mémorisé"
    )
    assert eng.kill_switch.abandoned_in_flight == 0


def test_12_mark_abandoned_avant_demarrage_refuse_le_demarrage_ensuite(monkeypatch):
    """Timeout avant tout démarrage : l'identifiant est mémorisé, puis le
    démarrage est refusé et l'entrée est nettoyée (pas de fuite)."""
    connector = _BlockingConnector()
    eng = _make_engine(connector)
    eng._order_execution_timeout = 5.0

    async def fake_wait_for(aw, timeout=None):
        aw.close()                   # le thread n'est jamais lancé
        raise asyncio.TimeoutError

    monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        try:
            await eng.order_queue.put(_payload(epoch=eng.kill_switch.stamp_emission_epoch()))
            assert await _await_until(
                lambda: len(eng._pending_reconciliation) == 1, timeout=5.0
            )
        finally:
            await _stop_worker(eng, task)

    asyncio.run(scenario())

    emission_id = eng._pending_reconciliation[0]["emission_id"]
    assert emission_id in eng.kill_switch._abandoned_ids

    admis, verdict = eng.kill_switch.begin_emission_in_thread(emission_id, None)
    assert (admis, verdict) == (False, "ABANDONED_BEFORE_START")
    assert emission_id not in eng.kill_switch._abandoned_ids, "entrée nettoyée au démarrage"
    assert connector.calls == []


# ── 13. activate() ne tient pas le verrou pendant les opérations externes ───


def test_13_activate_ne_tient_pas_le_verrou_pendant_operations_externes():
    class _SlowPositionsConnector:
        connected = True

        def __init__(self):
            self.entered = threading.Event()
            self.release = threading.Event()

        def get_positions(self, *a, **k):
            self.entered.set()
            self.release.wait(10.0)
            return []

        def execute_order(self, *a, **k):  # ne doit jamais être appelé
            raise AssertionError("aucune émission attendue")

    connector = _SlowPositionsConnector()
    ks = KillSwitch(connector=connector, notifier=None)

    t = threading.Thread(target=ks.activate, args=("TEST_13",))
    t.start()
    try:
        assert connector.entered.wait(5.0), "activate() doit atteindre les appels externes"

        # Le verrou doit être libre pendant l'appel externe : une tentative
        # d'émission répond immédiatement, pas après la libération.
        _t0 = time.perf_counter()
        admis, verdict = ks.begin_emission_in_thread("probe", None)
        elapsed = time.perf_counter() - _t0

        assert (admis, verdict) == (False, "KILL_SWITCH_ACTIVE")
        assert elapsed < 0.5, f"verrou encore tenu pendant l'opération externe ({elapsed:.3f}s)"

        # Et une clôture d'émission depuis un thread broker ne bloque pas non plus.
        _t0 = time.perf_counter()
        ks.finish_emission("inconnu", "TERMINATED")
        assert time.perf_counter() - _t0 < 0.5
    finally:
        connector.release.set()
        t.join(5.0)

    assert ks.is_triggered is True
    assert ks.in_flight_at_activation == 0
