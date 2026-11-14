"""EXEC-01 — Barrière d'émission atomique KillSwitch / file d'ordres.

Tests adversariaux déterministes : ils couvrent les interleavings critiques entre
l'activation du KillSwitch et le démarrage de ``connector.execute_order()``
(ordre en file, ordre dépilé non engagé, appel engagé, timeout), ainsi que
l'absence de réémission après ``reset()``.

Aucun test ne touche un broker réel : les connecteurs sont des doubles.
"""

import asyncio
import threading
import time
from unittest.mock import MagicMock

import pytest

from agents.kill_switch import KillSwitch
from application.engine import Engine


# ── Doubles de test ──────────────────────────────────────────────────────────


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
    """Connecteur dont ``execute_order`` bloque jusqu'à libération explicite."""

    connected = False

    def __init__(self):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.calls = []

    def execute_order(self, *args, **kwargs):
        self.calls.append(args)
        self.entered.set()
        self.release.wait(5.0)
        return {"ticket": 42, "price": 1.1000, "volume": args[2]}


class _TimeoutConnector:
    """Connecteur simulant un timeout de l'appel broker (résultat incertain)."""

    connected = False

    def __init__(self):
        self.calls = 0

    def execute_order(self, *args, **kwargs):
        self.calls += 1
        raise asyncio.TimeoutError("timeout broker simulé")


async def _run_worker_until(engine, predicate, timeout=2.0):
    """Lance le worker et attend ``predicate()`` (ou le timeout)."""
    task = asyncio.create_task(engine._order_routing_worker())
    deadline = time.time() + timeout
    try:
        while time.time() < deadline:
            if predicate():
                return task
            await asyncio.sleep(0.01)
        return task
    finally:
        engine.running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# ── Scénario A : ordre encore en file au moment de l'activation ─────────────


def test_A_ordre_en_file_non_transmis_apres_activation():
    eng = _make_engine()
    eng.connector.execute_order = MagicMock(return_value={"ticket": 1, "price": 1.1, "volume": 0.01})

    epoch_avant_activation = eng.kill_switch.emission_epoch
    eng.kill_switch.activate("TEST_SCENARIO_A")

    async def scenario():
        await eng.order_queue.put(_payload(epoch=epoch_avant_activation))
        await _run_worker_until(eng, lambda: len(eng._neutralized_orders) == 1)

    asyncio.run(scenario())

    assert eng.connector.execute_order.called is False
    assert len(eng._neutralized_orders) == 1
    assert eng._neutralized_orders[0]["neutralized_reason"] == "KILL_SWITCH_ACTIVE"


# ── Scénario B : ordre dépilé mais non engagé ───────────────────────────────


def test_B_ordre_depile_mais_non_engage_refuse_par_la_barriere():
    eng = _make_engine()
    eng.connector.execute_order = MagicMock(return_value={"ticket": 1, "price": 1.1, "volume": 0.01})

    # Le payload est estampillé avant l'activation, puis l'activation survient
    # entre le dépilement et l'admission : la génération est devenue périmée.
    payload = _payload(epoch=eng.kill_switch.emission_epoch)
    eng.kill_switch.activate("TEST_SCENARIO_B")

    admis, verdict = eng.kill_switch.try_begin_emission(payload["emission_epoch"])
    assert admis is False
    assert verdict == "KILL_SWITCH_ACTIVE"

    # Et même hors KillSwitch actif, un payload de génération antérieure est refusé.
    eng.kill_switch.activated_at = time.time() - 120.0
    assert eng.kill_switch.reset(confirm_token="RESET_KILL_SWITCH", min_cooldown_seconds=60.0) is True

    admis_apres_reset, verdict_apres_reset = eng.kill_switch.try_begin_emission(
        payload["emission_epoch"]
    )
    assert admis_apres_reset is False
    assert verdict_apres_reset == "STALE_EPOCH"


# ── Scénario C : appel broker déjà engagé lors de l'activation ──────────────


def test_C_appel_engage_survit_a_l_activation_sans_etre_presente_comme_annule():
    connector = _BlockingConnector()
    eng = _make_engine(connector)
    payload = _payload(epoch=eng.kill_switch.emission_epoch)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        await eng.order_queue.put(payload)

        # Attendre que l'appel broker soit réellement engagé dans son thread.
        for _ in range(200):
            if connector.entered.is_set():
                break
            await asyncio.sleep(0.01)
        assert connector.entered.is_set()

        # Activation pendant l'appel engagé.
        eng.kill_switch.activate("TEST_SCENARIO_C")
        assert eng.kill_switch.in_flight_at_activation == 1

        # L'appel broker va jusqu'au bout : il n'est pas « annulé ».
        connector.release.set()
        for _ in range(200):
            if len(connector.calls) == 1 and eng.kill_switch.in_flight_emissions == 0:
                break
            await asyncio.sleep(0.01)

        eng.running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(scenario())

    assert len(connector.calls) == 1, "l'appel déjà engagé doit être unique et non annulé"
    assert eng.kill_switch.in_flight_emissions == 0
    assert eng._neutralized_orders == []


def test_C2_aucune_nouvelle_emission_apres_activation_meme_si_file_non_vide():
    connector = _BlockingConnector()
    eng = _make_engine(connector)

    async def scenario():
        task = asyncio.create_task(eng._order_routing_worker())
        await eng.order_queue.put(_payload(epoch=eng.kill_switch.emission_epoch))

        for _ in range(200):
            if connector.entered.is_set():
                break
            await asyncio.sleep(0.01)
        assert connector.entered.is_set()

        eng.kill_switch.activate("TEST_SCENARIO_C2")
        # Un second ordre arrive après l'activation : il ne doit jamais partir.
        await eng.order_queue.put(_payload(epoch=eng.kill_switch.emission_epoch - 1))

        connector.release.set()
        for _ in range(200):
            if len(eng._neutralized_orders) == 1:
                break
            await asyncio.sleep(0.01)

        eng.running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(scenario())

    assert len(connector.calls) == 1, "seul l'ordre admis avant l'activation est parti"
    assert len(eng._neutralized_orders) == 1
    assert eng._neutralized_orders[0]["neutralized_reason"] in {"KILL_SWITCH_ACTIVE", "STALE_EPOCH"}


# ── Scénario E : timeout pendant l'appel broker ─────────────────────────────


def test_E_timeout_classe_indeterminate_et_non_rejete():
    connector = _TimeoutConnector()
    eng = _make_engine(connector)

    async def scenario():
        await eng.order_queue.put(_payload(epoch=eng.kill_switch.emission_epoch))
        await _run_worker_until(
            eng,
            lambda: len(eng._pending_reconciliation) == 1 and len(eng._abandoned_emissions) == 1,
        )

    asyncio.run(scenario())

    assert connector.calls == 1
    assert len(eng._pending_reconciliation) == 1
    assert eng._pending_reconciliation[0]["timeout_at"] > 0
    assert eng._abandoned_emissions[0]["emission_state"] == "INDETERMINATE_IN_FLIGHT"
    assert eng.kill_switch.in_flight_emissions == 0


def test_E2_timeout_pendant_killswitch_reste_indeterminate_sans_reemission():
    connector = _TimeoutConnector()
    eng = _make_engine(connector)
    eng.kill_switch.activate("TEST_SCENARIO_E2")

    async def scenario():
        await eng.order_queue.put(_payload(epoch=eng.kill_switch.emission_epoch - 1))
        await _run_worker_until(eng, lambda: len(eng._neutralized_orders) == 1)

    asyncio.run(scenario())

    # L'ordre estampillé avant l'activation n'est jamais parti : aucun timeout,
    # aucun rejet assimilé, aucune réémission.
    assert connector.calls == 0
    assert eng._pending_reconciliation == []
    assert len(eng._neutralized_orders) == 1


# ── Scénario F : réarmement et neutralisation persistante ───────────────────


def test_F_reset_ne_reemet_pas_les_ordres_neutralises():
    eng = _make_engine()
    eng.connector.execute_order = MagicMock(return_value={"ticket": 1, "price": 1.1, "volume": 0.01})

    async def scenario():
        await eng.order_queue.put(_payload(epoch=eng.kill_switch.emission_epoch))
        eng.kill_switch.activate("TEST_SCENARIO_F")
        neutralises = await eng._neutralize_pending_orders()

        eng.kill_switch.activated_at = time.time() - 120.0
        assert eng.kill_switch.reset(confirm_token="RESET_KILL_SWITCH", min_cooldown_seconds=60.0)

        # Après réarmement, le worker tourne mais la file est vide.
        await _run_worker_until(eng, lambda: False, timeout=0.2)
        return neutralises

    neutralises = asyncio.run(scenario())

    assert neutralises == 1
    assert eng.order_queue.empty()
    assert eng.connector.execute_order.called is False
    assert len(eng._neutralized_orders) == 1


# ── Atomicité de la barrière sous concurrence ───────────────────────────────


def test_G_barriere_atomique_sous_concurrence():
    ks = KillSwitch(connector=MagicMock(), notifier=None)
    resultats = []
    resultats_lock = threading.Lock()
    start = threading.Barrier(41)

    def tentative():
        start.wait(5.0)
        admis, verdict = ks.try_begin_emission(None)
        with resultats_lock:
            resultats.append((admis, verdict))

    threads = [threading.Thread(target=tentative) for _ in range(40)]
    for t in threads:
        t.start()

    start.wait(5.0)
    ks.activate("TEST_SCENARIO_G")

    for t in threads:
        t.join(5.0)

    assert ks.is_triggered is True
    # Invariant : aucune émission n'a pu être admise après le point de
    # linéarisation de l'activation — le compteur en vol est celui figé à
    # l'activation, et tous les refus portent le motif attendu.
    total_admis = sum(1 for admis, _ in resultats if admis)
    assert ks.in_flight_emissions == ks.in_flight_at_activation
    assert total_admis == ks.in_flight_at_activation
    for admis, verdict in resultats:
        if not admis:
            assert verdict == "KILL_SWITCH_ACTIVE"


def test_H_epoch_invalide_les_payloads_apres_activation_et_reset():
    ks = KillSwitch(connector=MagicMock(), notifier=None)
    epoch_initial = ks.emission_epoch

    ks.activate("TEST_SCENARIO_H")
    epoch_active = ks.emission_epoch
    assert epoch_active > epoch_initial

    ks.activated_at = time.time() - 120.0
    assert ks.reset(confirm_token="RESET_KILL_SWITCH", min_cooldown_seconds=60.0) is True
    epoch_rearme = ks.emission_epoch
    assert epoch_rearme > epoch_active

    admis_vieille_generation, verdict = ks.try_begin_emission(epoch_initial)
    assert (admis_vieille_generation, verdict) == (False, "STALE_EPOCH")

    admis_courante, verdict_courante = ks.try_begin_emission(epoch_rearme)
    assert (admis_courante, verdict_courante) == (True, "ADMITTED")
    ks.end_emission()
    assert ks.in_flight_emissions == 0
