"""
test_risk_verrouillage_idempotency.py — Verrouillage multi-facteurs des ordres.

Couvre:
  - idem_key -> magic déterministe strictement positif (jamais 0, jamais dupliqué)
  - POST /trade avec idem_key : magic dérivé + commentaire ms_<idem> transmis au broker
  - snapshot pré-ordre indisponible -> 504 INDETERMINATE (aucun ordre envoyé)
  - POST /trade sans idem_key : magic=0 (aucune croyance), comportement historique conservé
  - GET /trade/status/{idem_key} : INDETERMINATE (504) tant qu'aucune position ne satisfait
    strictement les critères a-g, puis CONFIRMED lorsque la position exacte apparaît
  - BrokerRouter : magic=0 interdit (position manuelle jamais adoptée)
  - BrokerRouter : commentaire broker omis/divergent -> refus (critère f strict)
  - /trade fail-closed : volume hors bornes broker -> 422, stops_level trop proche -> 422
"""
import asyncio
import pytest
import time
from itertools import product
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

from fastapi.testclient import TestClient

from core.interfaces import OrderType, PositionInfo, AccountInfo
from infrastructure.broker_router import BrokerRouter
from api.server import (
    app,
    IdempotencyBlockedError,
    _derive_order_magic,
    IdempotencyStore,
    idempotency_store,
)


@pytest.fixture
def client():
    # Herméticité : purge de la table idempotency_records entre chaque run de test.
    # Sans cela, une clé persistée au run précédent (même BDD SQLite) bloquerait le
    # verrouillage strict du run suivant (statut CONFIRMED persistant).
    try:
        from infrastructure.database import SessionLocal
        from infrastructure.models import IdempotencyRecord
        db = SessionLocal()
        try:
            db.query(IdempotencyRecord).delete()
            db.commit()
        finally:
            db.close()
    except Exception:
        pass
    yield TestClient(app)


def make_symbol_info(**overrides):
    """SymbolInfo broker réaliste (champs MT5 nécessaires aux contrôles fail-closed)."""
    defaults = dict(
        spread=10,
        ask=1.0850,
        bid=1.0848,
        point=0.00001,
        trade_tick_size=0.00001,
        trade_tick_value=1.0,
        volume_min=0.01,
        volume_max=100.0,
        volume_step=0.01,
        trade_stops_level=10,
        trade_freeze_level=0,
    )
    defaults.update(overrides)
    return MagicMock(**defaults)


def _account():
    return AccountInfo(
        login=123,
        balance=10000.0,
        equity=10000.0,
        free_margin=9000.0,
        margin_level=500.0,
        currency="USD",
        server="DemoServer",
    )


def _pos(ticket, symbol="EURUSD", order_type=OrderType.BUY, volume=0.01,
         magic=0, comment="", price=1.0850, sl=1.0800, tp=1.0900):
    return PositionInfo(
        ticket=ticket,
        symbol=symbol,
        type=order_type,
        volume=volume,
        open_price=price,
        current_price=price,
        sl=sl,
        tp=tp,
        profit=0.0,
        time=int(time.time()),
        magic=magic,
        comment=comment,
    )


# ---------------------------------------------------------------------------
# 1. Dérivation du magic : strictement positif, déterministe, jamais zéro/dupliqué
# ---------------------------------------------------------------------------

def test_derive_order_magic_strictly_positive_and_deterministic():
    keys = ["op-1", "op-2", "op-3", "a" * 64, "clé-accentuée-é", "123456789"]
    for k in keys:
        m1 = _derive_order_magic(k)
        m2 = _derive_order_magic(k)
        assert isinstance(m1, int)
        assert m1 > 0, f"magic {m1} doit être > 0 (magic 0 = position manuelle)"
        assert m2 == m1, "le magic doit être déterministe pour un même idem_key"


def test_derive_order_magic_distinct_for_distinct_keys():
    magics = {_derive_order_magic(f"idem-{g}") for g in product("ab", repeat=2)}
    # 4 clés distinctes => 4 magics distincts (collision SHA-256 31 bits virtuellement impossible)
    assert len(magics) == 4
    assert 0 not in magics


# ---------------------------------------------------------------------------
# 2. POST /trade avec idem_key : magic + commentaire ms_ transmis, puis statut
# ---------------------------------------------------------------------------

def _post_trade(client, **overrides):
    headers = {"X-API-Key": "verrou_key"}
    payload = {
        "symbol": "EURUSD",
        "direction": "BUY",
        "volume": 0.01,
        "sl_price": 1.0810,
        "tp_price": 1.0920,
        **overrides,
    }
    return client.post("/trade", json=payload, headers=headers)


def test_store_blocks_key_already_processing():
    """Une clé déjà PROCESSING (requête concurrente) ne peut jamais repartir en exécution."""
    store = IdempotencyStore()
    store._records["k-processing"] = {"status": "PROCESSING", "sfx": 1}
    with pytest.raises(IdempotencyBlockedError):
        store.create_process("k-processing", {"symbol": "EURUSD"})


def test_store_allows_retry_after_failed():
    """Un statut FAILED (ordre explicitement rejeté/introuvable) autorise une nouvelle
    tentative avec la même clé (magic/commentaire préservés par l'uniité du magic)."""
    store = IdempotencyStore()
    with patch("api.server._persist_idempotency_record", return_value=True):
        store.create_process("k-failed-init", {"symbol": "EURUSD"})
    store.update_status("k-failed-init", "FAILED", reason="introuvable")
    with patch("api.server._fetch_idempotency_row", return_value=None):
        with patch("api.server._persist_idempotency_record", return_value=True):
            # Ne lève pas : retry autorisé après FAILED
            store.create_process("k-failed-init", {"symbol": "EURUSD"})


def test_trade_with_idem_key_uses_derived_magic_and_ms_comment(client):
    with patch.object(idempotency_store, "create_process", wraps=idempotency_store.create_process), \
            patch("api.server._engine") as mock_engine:
            mock_engine.kill_switch.is_triggered = False
            mock_engine.connector.execute_order.return_value = {
                "ticket": 424242,
                "price": 1.0850,
                "volume": 0.01,
            }
            mock_engine.pretrade_validator.validate_signal.return_value = True
            mock_engine.state_manager.account = _account()
            mock_engine.state_manager.positions = []
            mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
            mock_engine._get_pip_size.return_value = 0.0001
            mock_engine._get_pip_value.return_value = 10.0
            # La position apparaît immédiatement (broker confirmé) avec tous les critères a-g
            mock_engine.connector.get_positions.side_effect = [
                [],  # snapshot pré-ordre
                [_pos(424242, magic=1234567, comment="ms_op-abc123")],  # post-ordre
            ]

            res = _post_trade(client, idem_key="op-abc123")
            assert res.status_code == 200, res.text
            data = res.json()
            assert data.get("ticket") == 424242

            # Le broker doit avoir reçu un magic dérivé (jamais 0) et le commentaire ms_
            call = mock_engine.connector.execute_order.call_args
            magic_sent = call.kwargs["magic"]
            comment_sent = call.kwargs["comment"]
            assert magic_sent > 0
            assert magic_sent == _derive_order_magic("op-abc123")
            assert comment_sent == "ms_op-abc123"

            # L'enregistrement d'idempotence est bien persisté
            rec = idempotency_store.get("op-abc123")
            assert rec is not None
            assert rec["magic"] == magic_sent
            assert rec["order_comment"] == "ms_op-abc123"
            assert rec["pre_existing_tickets"] == []
            assert rec["pre_snapshot_ok"] is True


def test_trade_blocks_reuse_of_confirmed_idem_key_without_resending(client):
    """Une clé déjà CONFIRMED ne peut JAMAIS déclencher une seconde exécution."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.connector.execute_order.return_value = {
            "ticket": 424243,
            "price": 1.0850,
            "volume": 0.01,
        }
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0
        expected_magic = _derive_order_magic("op-c1")
        expected_comment = "ms_op-c1"
        mock_engine.connector.get_positions.side_effect = [
            [],  # snapshot pré-ordre du 1er POST
            [_pos(424243, magic=expected_magic, comment=expected_comment)],  # post-ordre 1er POST
            [],  # snapshot pré-ordre du 2e POST (bloqué ensuite par le verrou)
        ]

        # Premier envoi : succès + confirmation immédiate
        res1 = _post_trade(client, idem_key="op-c1")
        assert res1.status_code == 200, res1.text
        assert idempotency_store.get("op-c1")["status"] == "CONFIRMED"

        calls_before = len(mock_engine.connector.execute_order.call_args_list)

        # Réutilisation de la même clé : 409 CONFLIT, aucun second envoi au broker
        res2 = _post_trade(client, idem_key="op-c1")
        assert res2.status_code == 409, res2.text
        assert "CONFLIT" in res2.json().get("detail", "")
        assert "déjà confirmé" in res2.json().get("detail", "")
        assert len(mock_engine.connector.execute_order.call_args_list) == calls_before, (
            "execute_order ne doit PAS être rappelé pour une clé déjà confirmée"
        )


def test_trade_blocks_reuse_of_persisted_key_after_restart(client):
    """Simule un redémarrage : mémoire vidée, mais ligne persistée → 409 (jamais ré-exécuté)."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.connector.execute_order.return_value = None  # timeout : résultat incertain
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0
        mock_engine.connector.get_positions.return_value = []

        # 1. Premier envoi, mais execute_order retourne None → INDETERMINATE persisté
        res1 = _post_trade(client, idem_key="op-restart")
        assert res1.status_code == 504, res1.text
        assert idempotency_store.get("op-restart")["status"] == "INDETERMINATE"

        # 2. Simuler un redémarrage : vider la mémoire du store (la table SQLite persiste)
        idempotency_store._records.clear()

        # 3. Réutilisation : la ligne persistée INDETERMINATE doit bloquer (409), jamais ré-exécuter
        mock_engine.connector.execute_order.reset_mock()
        res2 = _post_trade(client, idem_key="op-restart")
        assert res2.status_code == 409, res2.text
        assert "CONFLIT" in res2.json().get("detail", "")
        mock_engine.connector.execute_order.assert_not_called()


def test_trade_fails_closed_when_persistence_unavailable(client):
    """Si la persistance (SQLite) échoue, l'ordre est REFUSÉ (503) — jamais envoyé."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0
        mock_engine.connector.get_positions.return_value = []

        with patch("api.server._persist_idempotency_record", return_value=False):
            res = _post_trade(client, idem_key="op-db-down")
            assert res.status_code == 503, res.text
            assert "FAIL-CLOSED" in res.json().get("detail", "") or "persistance" in res.json().get("detail", "")
            mock_engine.connector.execute_order.assert_not_called()


def test_trade_without_idem_key_sends_magic_zero_and_no_ms_comment(client):
    """Sans idem_key, aucun magic n'est inventé (magic=0, pas de croyance sur une position robot)."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.connector.execute_order.return_value = {
            "ticket": 999123,
            "price": 1.0850,
            "volume": 0.05,
        }
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0

        res = _post_trade(client)
        assert res.status_code == 200, res.text
        call = mock_engine.connector.execute_order.call_args
        assert call.kwargs["magic"] == 0
        assert call.kwargs["comment"] == ""


def test_trade_with_unreliable_pre_snapshot_is_indeterminate_and_not_sent(client):
    """Snapshot pré-ordre indisponible => INDETERMINATE 504, et execute_order jamais appelé."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0
        mock_engine.connector.get_positions.side_effect = RuntimeError("MT5 indisponible")

        res = _post_trade(client, idem_key="op-snap")
        assert res.status_code == 504, res.text
        assert "INDETERMINATE" in res.json().get("detail", "")
        mock_engine.connector.execute_order.assert_not_called()

        rec = idempotency_store.get("op-snap")
        assert rec is not None
        assert rec["pre_snapshot_ok"] is False
        assert rec["status"] == "INDETERMINATE"


def test_trade_status_progression_indeterminate_then_confirmed(client):
    """Réconciliation : tant qu'aucune position ne satisfait a-g => 504 INDETERMINATE ;
    dès que la position exacte apparaît => CONFIRMED."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.connector.execute_order.return_value = None  # timeout : ordre incertain
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0
        # Snapshot pré-ordre OK (vide), mais execute_order -> None (timeout)
        mock_engine.connector.get_positions.return_value = []

        res = _post_trade(client, idem_key="op-progress")
        assert res.status_code == 504, res.text
        assert "INDETERMINATE" in res.json().get("detail", "")

        idem = "op-progress"
        rec = idempotency_store.get(idem)
        magic = rec["magic"]
        comment = rec["order_comment"]

        # 1. Aucune position : 504 INDETERMINATE
        mock_engine.connector.get_positions.return_value = []
        r1 = client.get(f"/trade/status/{idem}", headers={"X-API-Key": "verrou_key"})
        assert r1.status_code == 504, r1.text

        # 2. Position au magic seul, sans commentaire : refus (critère f)
        mock_engine.connector.get_positions.return_value = [_pos(7001, magic=magic, comment="")]
        r2 = client.get(f"/trade/status/{idem}", headers={"X-API-Key": "verrou_key"})
        assert r2.status_code == 504, r2.text

        # 3. Position au magic OK + commentaire OK mais ticket pré-existant : refus (critère a)
        rec2 = dict(rec)
        rec2["pre_existing_tickets"] = [7002]
        idempotency_store.update_status(idem, "INDETERMINATE", pre_existing_tickets=[7002])
        mock_engine.connector.get_positions.return_value = [
            _pos(7002, magic=magic, comment=comment)
        ]
        r3 = client.get(f"/trade/status/{idem}", headers={"X-API-Key": "verrou_key"})
        assert r3.status_code == 504, r3.text

        # 4. Position parfaitement conforme (ticket nouveau, magic, volume, direction, commentaire) : CONFIRMED
        idempotency_store.update_status(
            idem, "INDETERMINATE",
            pre_existing_tickets=[],
        )
        mock_engine.connector.get_positions.return_value = [
            _pos(7003, magic=magic, comment=comment)
        ]
        r4 = client.get(f"/trade/status/{idem}", headers={"X-API-Key": "verrou_key"})
        assert r4.status_code == 200, r4.text
        body = r4.json()
        assert body["status"] == "CONFIRMED"
        assert body["ticket"] == 7003
        assert body["idem_key"] == idem


def test_trade_status_confirmed_after_restart_without_resending(client):
    """Après redémarrage (mémoire vidée), /trade/status renvoie CONFIRMED et tout nouveau
    POST avec la même clé est bloqué (409) — jamais double exécution."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.connector.execute_order.return_value = {
            "ticket": 424245,
            "price": 1.0850,
            "volume": 0.01,
        }
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0
        magic = _derive_order_magic("op-rest2")
        comment = "ms_op-rest2"
        mock_engine.connector.get_positions.side_effect = [
            [],  # snapshot pré-ordre du 1er POST
            [_pos(424245, magic=magic, comment=comment)],  # post-ordre 1er POST (confirmé)
        ]

        # 1. Premier envoi : CONFIRMED immédiat
        res1 = _post_trade(client, idem_key="op-rest2")
        assert res1.status_code == 200, res1.text
        assert idempotency_store.get("op-rest2")["status"] == "CONFIRMED"

        # 2. Redémarrage : mémoire vidée
        idempotency_store._records.clear()

        # 3. /trade/status retrouve CONFIRMED depuis la table persistée (200, ticket)
        r = client.get("/trade/status/op-rest2", headers={"X-API-Key": "verrou_key"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "CONFIRMED"
        assert body["ticket"] == 424245

        # 4. Nouveau POST avec la même clé : 409, execute_order non rappelé
        mock_engine.connector.execute_order.reset_mock()
        res2 = _post_trade(client, idem_key="op-rest2")
        assert res2.status_code == 409, res2.text
        mock_engine.connector.execute_order.assert_not_called()


def test_crash_after_broker_fill_before_ticket_save_is_reconciled_without_resend(client):
    """Point de revue (persistance après panne) : le broker exécute l'ordre mais le
    processus meurt avant la sauvegarde du ticket (statut persisté = INDETERMINATE,
    sans ticket). Après redémarrage, /trade/status doit retrouver la position réelle
    du broker (magic + commentaire) et la confirmer AVEC le ticket réel, sans JAMAIS
    renvoyer l'ordre (execute_order non rappelé)."""
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info()
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0

        # Le broker exécute (le timeout côté processus fait retourner None), la
        # position réelle existe mais n'est pas encore visible au moment du POST.
        mock_engine.connector.execute_order.return_value = None
        mock_engine.connector.get_positions.return_value = []

        res = _post_trade(client, idem_key="op-crash")
        assert res.status_code == 504, res.text
        rec = idempotency_store.get("op-crash")
        assert rec["status"] == "INDETERMINATE"
        assert "ticket" not in rec  # ticket jamais sauvegardé avant le crash

        # Crash / redémarrage : mémoire vidée (la BDD garde INDETERMINATE sans ticket)
        idempotency_store._records.clear()

        # Après redémarrage, la position exécutée par le broker est visible
        magic = rec["magic"]
        comment = rec["order_comment"]
        mock_engine.connector.get_positions.return_value = [
            _pos(77701, magic=magic, comment=comment)
        ]

        # /trade/status réconcilie AVEC la position réelle : CONFIRMED + ticket réel
        r = client.get("/trade/status/op-crash", headers={"X-API-Key": "verrou_key"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "CONFIRMED"
        assert body["ticket"] == 77701

        # Jamais renvoyé : execute_order n'a été appelé qu'AU POST initial, jamais
        # par /trade/status ni par un nouveau POST.
        assert mock_engine.connector.execute_order.call_count == 1

        # Tout nouveau POST avec la même clé reste bloqué (409)
        mock_engine.connector.execute_order.reset_mock()
        res2 = _post_trade(client, idem_key="op-crash")
        assert res2.status_code == 409, res2.text
        mock_engine.connector.execute_order.assert_not_called()


def test_trade_status_unknown_key_404(client):
    with patch("api.server._engine"):
        r = client.get("/trade/status/cle-inconnue", headers={"X-API-Key": "verrou_key"})
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3. BrokerRouter : magic=0 jamais adopté ; commentaire omis/divergent jamais adopté
# ---------------------------------------------------------------------------

def _make_router():
    primary = MagicMock()
    fallback = MagicMock()
    primary.connected = True
    fallback.connected = True
    router = BrokerRouter(primary=primary, fallback=fallback)
    router._active_broker = primary
    return router, primary, fallback


def test_router_never_adopts_manual_position_magic_zero():
    router, primary, _fallback = _make_router()
    primary.execute_order.return_value = None  # timeout
    # Apparition d'une position pendant le timeout : magic=0 (position manuelle !)
    manual = _pos(55, magic=0, comment="manual-trade")
    primary.get_positions.side_effect = [[], [manual]]

    res = router.execute_order("EURUSD", OrderType.BUY, 0.01, 1.0800, 1.0900, magic=0, comment="")
    # magic=0 => la position manuelle ne doit JAMAIS être adoptée comme résultat
    assert res is None or res.get("ticket") != 55


def test_router_never_adopts_position_with_mismatched_comment():
    router, primary, _fallback = _make_router()
    primary.execute_order.return_value = None
    # Position avec le bon magic mais un commentaire différent -> refus (critère f)
    ghost = _pos(66, magic=98765, comment="ms_other")
    primary.get_positions.side_effect = [[], [ghost]]

    res = router.execute_order("EURUSD", OrderType.BUY, 0.01, 1.0800, 1.0900, magic=98765, comment="ms_expected")
    assert res is None or res.get("ticket") != 66


def test_router_never_adopts_position_with_missing_comment():
    router, primary, _fallback = _make_router()
    primary.execute_order.return_value = None
    # Position avec le bon magic mais commentaire absent -> doute -> refus
    ghost = _pos(67, magic=98766, comment="")
    primary.get_positions.side_effect = [[], [ghost]]

    res = router.execute_order("EURUSD", OrderType.BUY, 0.01, 1.0800, 1.0900, magic=98766, comment="ms_expected")
    assert res is None or res.get("ticket") != 67


def test_router_adopts_exact_new_position_with_full_multi_factor_match():
    router, primary, _fallback = _make_router()
    primary.execute_order.return_value = None
    new_pos = _pos(88, magic=123456, comment="ms_ident")
    primary.get_positions.side_effect = [[], [new_pos]]

    res = router.execute_order("EURUSD", OrderType.BUY, 0.01, 1.0800, 1.0900, magic=123456, comment="ms_ident")
    assert res is not None
    assert res["ticket"] == 88


def test_metaapi_positions_restore_comment():
    """Contrat commentaire (critère f) côté MetaApi : la position lue doit
    restituer le commentaire broker. Sans cette restitution, la réconciliation
    ne pourrait jamais confirmer nos propres ordres (INDETERMINATE à vie)."""
    from infrastructure.metaapi_connector import MetaApiConnector

    connector = MetaApiConnector(token="tok-meta", account_id="acc-com", region="vint-hill")
    connector._connection = MagicMock()
    broker_pos = {
        "id": "9001", "symbol": "EURUSD", "type": "POSITION_TYPE_BUY",
        "volume": 0.01, "openPrice": 1.0800, "currentPrice": 1.0900,
        "stopLoss": 0.0, "takeProfit": 0.0, "profit": 11.0,
        "time": 1700000000, "magic": 4242, "comment": "ms_4242_ab12cd34",
    }
    connector._connection.get_positions = AsyncMock(return_value=[broker_pos])

    positions = asyncio.run(connector._async_get_positions("EURUSD"))
    assert len(positions) == 1
    # Le commentaire broker doit être restitué pour satisfaire le critère f)
    assert positions[0].comment == "ms_4242_ab12cd34"
    assert positions[0].magic == 4242


def test_metaapi_position_missing_comment_is_not_restored():
    """Si le broker ne renvoie pas de commentaire, la position lue porte
    comment='' : la réconciliation la refusera (fail-closed, critère f)."""
    from infrastructure.metaapi_connector import MetaApiConnector

    connector = MetaApiConnector(token="tok-meta", account_id="acc-com", region="vint-hill")
    connector._connection = MagicMock()
    connector._connection.get_positions = AsyncMock(return_value=[{
        "id": "9002", "symbol": "EURUSD", "type": "POSITION_TYPE_SELL",
        "volume": 0.02, "openPrice": 1.0800, "currentPrice": 1.0700,
        "stopLoss": 0.0, "takeProfit": 0.0, "profit": 1.0,
        "time": 1700000001, "magic": 4321,
    }])
    positions = asyncio.run(connector._async_get_positions("EURUSD"))
    assert positions[0].comment == ""


# ---------------------------------------------------------------------------
# 4. /trade fail-closed : contrôles broker (P2)
# ---------------------------------------------------------------------------

def test_trade_rejects_volume_outside_broker_bounds_422(client):
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info(
            volume_min=0.10, volume_max=10.0, volume_step=0.10
        )
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0

        res = _post_trade(client, volume=0.05)
        assert res.status_code == 422, res.text
        assert "INVALID_VOLUME" in res.json().get("detail", "")
        mock_engine.connector.execute_order.assert_not_called()


def test_trade_rejects_stops_level_too_close_422(client):
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        # stops_level = 1000 * 0.00001 point = 0.01 => SL placé à 1.0810 doit être à >= 0.01 de l'ask
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info(
            trade_stops_level=1000, point=0.00001
        )
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0

        # SL à 1.0810 vs ask 1.0850 => distance 0.004 < 0.01 => rejet
        res = _post_trade(client, sl_price=1.0810)
        assert res.status_code == 422, res.text
        assert "INVALID_STOPS_DISTANCE" in res.json().get("detail", "")
        mock_engine.connector.execute_order.assert_not_called()


def test_trade_rejects_invalid_symbol_quote_422(client):
    with patch("api.server._engine") as mock_engine:
        mock_engine.kill_switch.is_triggered = False
        mock_engine.pretrade_validator.validate_signal.return_value = True
        mock_engine.state_manager.account = _account()
        mock_engine.state_manager.positions = []
        mock_engine.connector.get_symbol_info.return_value = make_symbol_info(ask=0.0, bid=0.0)
        mock_engine._get_pip_size.return_value = 0.0001
        mock_engine._get_pip_value.return_value = 10.0

        res = _post_trade(client)
        assert res.status_code == 422, res.text
        mock_engine.connector.execute_order.assert_not_called()