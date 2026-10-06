"""
Tests du module "Comptes Broker" — endpoints /brokers/* (api/server.py).

Vérifie :
  1. La persistance chiffrée (le mot de passe n'est jamais en clair en BDD ni dans l'API).
  2. Le flux connect → switch-active → delete avec bascule automatique.
  3. La restauration de l'état actif après un switch échoué.
  4. Le comportement gracieux sans MetaTrader5 (échec propre, pas de crash).

Le module api.server est importé ici (via app) — l'environnement de test doit avoir
python-multipart installé (dépendance du serveur FastAPI préexistante, ajoutée à
requirements.txt).
"""

import asyncio
import os
import sys
import tempfile

# Base SQLite isolée AVANT tout import infrastructure.database
_TMP_DB = tempfile.mktemp(suffix=".db")
os.environ["SQLALCHEMY_DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

import pytest

from infrastructure.database import Base, engine
import infrastructure.models  # noqa: F401 — enregistre BrokerAccount

Base.metadata.create_all(bind=engine)

import api.server as server
from api.server import (
    BrokerConnectRequest,
    BrokerSwitchRequest,
    BrokerTestRequest,
    init_api,
    list_broker_accounts,
    connect_broker_account,
    switch_active_broker,
    delete_broker_account,
)


# ────────────────────────────────────────────────────────────────────────────
# Doubles — simulent le broker MT5 (non installable sur Linux)
# ────────────────────────────────────────────────────────────────────────────


class FakeMT5Connector:
    def __init__(self, login: int, password: str, server_name: str):
        self.login = login
        self.password = password
        self.server = server_name

    def connect(self) -> bool:
        return True

    def disconnect(self) -> None:
        return None


class FakeRouter:
    def __init__(self, primary, fallback):
        self.primary = primary
        self.fallback = fallback
        self._active_broker = primary
        self.connected = True

    def connect(self) -> bool:
        return True

    def disconnect(self) -> None:
        return None


class FakeStateManager:
    def __init__(self):
        self.connector = None
        self.account = None
        self.updated = False

    def update_state(self) -> bool:
        self.updated = True
        return True


class FakeKillSwitch:
    def __init__(self):
        self.connector = None


class FakeEngine:
    def __init__(self):
        self.connector = None
        self.state_manager = FakeStateManager()
        self.kill_switch = FakeKillSwitch()


@pytest.fixture(autouse=True)
def _patch_broker_classes(monkeypatch):
    """
    Remplace les classes réelles MT5Connector/BrokerRouter le temps d'un test
    (monkeypatch restaure automatiquement — indispensable pour ne pas polluer
    la suite tests/test_engine_telegram_hooks.py qui teste le vrai BrokerRouter).
    """
    import infrastructure.mt5_connector as mc_mod
    import infrastructure.broker_router as br_mod

    monkeypatch.setattr(mc_mod, "MT5Connector", FakeMT5Connector)
    monkeypatch.setattr(br_mod, "BrokerRouter", FakeRouter)
    yield


@pytest.fixture()
def engine():
    eng = FakeEngine()
    init_api(eng)
    _clean_broker_table()
    return eng


def _clean_broker_table():
    """Vide la table broker_accounts entre chaque test."""
    from infrastructure.database import SessionLocal
    from infrastructure.models import BrokerAccount

    db = SessionLocal()
    try:
        for row in db.query(BrokerAccount):
            db.delete(row)
        db.commit()
    finally:
        db.close()


def _run(coro):
    """Exécute une coroutine dans une boucle (sync helper pour pytest)."""
    return asyncio.run(coro)


# ────────────────────────────────────────────────────────────────────────────
# Tests
# ────────────────────────────────────────────────────────────────────────────


def test_list_empty(engine):
    assert _run(list_broker_accounts()) == []


def test_connection_result_exposes_leverage(engine):
    """Le test de connexion expose ping/solde/levier pour l'affichage UI."""
    server._broker_test_connection = _sim_success
    res = _run(
        server.test_broker_connection(
            BrokerTestRequest(server="XMGlobal-MT5 9", login=50291048, password="MonPass123!")
        )
    )
    assert res["success"] is True
    assert res["ping_ms"] == 12.4
    assert res["balance"] == 50210.5
    assert res["leverage"] == 100


def test_webtrader_test_connection_validates_fields():
    """La validation WebTrader rejette champs manquants/invalides SANS MT5 desktop."""
    core = server._broker_test_connection_sync
    assert core("", 0, "")["success"] is False
    assert core("XMGlobal-MT5 9", 0, "pw")["success"] is False
    assert core("XMGlobal-MT5 9", 123, "")["success"] is False
    # Champs valides => succès (sonde réseau best-effort, jamais de faux rejet)
    r = core("Exness-Real", 50291048, "MonPass")
    assert r["success"] is True
    assert "note" in r


def test_connect_registers_without_mt5_open(engine):
    """connect n'exige plus une session MT5 desktop : persistance immédiate."""
    server._broker_test_connection = _sim_failure  # même un test simulé refusé n'empêche pas l'enregistrement
    res = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S1", login=333, password="p3", broker_name="A", account_type="DEMO")
        )
    )
    assert res["success"] is True
    assert res["account"]["login"] == 333
    active = [a for a in _run(list_broker_accounts()) if a["is_active"]]
    assert len(active) == 1 and active[0]["login"] == 333


def test_connect_persists_encrypted(engine):
    server._broker_test_connection = _sim_success
    res = _run(
        connect_broker_account(
            BrokerConnectRequest(
                server="XMGlobal-MT5 9",
                login=50291048,
                password="MonPass123!",
                broker_name="XM",
                account_type="DEMO",
            )
        )
    )
    assert res["success"] is True
    acc = res["account"]
    assert acc["password_set"] is True
    assert "password" not in acc
    assert acc["login"] == 50291048
    assert acc["is_active"] is True  # premier compte => actif

    # BDD : jamais en clair, mais déchiffrable avec la clé maîtresse
    from infrastructure.database import SessionLocal
    from infrastructure.models import BrokerAccount
    from infrastructure.credential_vault import decrypt_secret

    db = SessionLocal()
    row = db.query(BrokerAccount).first()
    db.close()
    assert row.password_encrypted != "MonPass123!"
    assert "MonPass" not in row.password_encrypted
    assert decrypt_secret(row.password_encrypted) == "MonPass123!"

    # API : liste sans mot de passe
    accs = _run(list_broker_accounts())
    assert len(accs) == 1
    assert all("password" not in a for a in accs)


def test_second_account_standby(engine):
    server._broker_test_connection = _sim_success
    _run(
        connect_broker_account(
            BrokerConnectRequest(server="S1", login=111, password="p1", broker_name="A", account_type="DEMO")
        )
    )
    res2 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S2", login=222, password="p2", broker_name="B", account_type="REAL")
        )
    )
    assert res2["success"] is True
    assert res2["account"]["is_active"] is False
    assert res2["account"]["account_type"] == "REAL"

    accs = _run(list_broker_accounts())
    active = [a for a in accs if a["is_active"]]
    assert len(active) == 1 and active[0]["login"] == 111


def test_switch_active_rebinds_engine(engine):
    server._broker_test_connection = _sim_success
    r1 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S1", login=111, password="p1", broker_name="A", account_type="DEMO")
        )
    )
    r2 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S2", login=222, password="p2", broker_name="B", account_type="REAL")
        )
    )

    res = _run(switch_active_broker(BrokerSwitchRequest(account_id=r2["account"]["id"])))
    assert res["success"] is True
    eng = server._engine
    assert eng.connector.primary.login == 222
    assert eng.state_manager.connector is eng.connector
    assert eng.kill_switch.connector is eng.connector

    active = [a for a in _run(list_broker_accounts()) if a["is_active"]]
    assert len(active) == 1 and active[0]["login"] == 222


def test_switch_failure_restores_active(engine):
    server._broker_test_connection = _sim_success
    r1 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S1", login=111, password="p1", broker_name="A", account_type="DEMO")
        )
    )
    r2 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S2", login=222, password="p2", broker_name="B", account_type="REAL")
        )
    )
    # Active actuellement le compte B (222)
    _run(switch_active_broker(BrokerSwitchRequest(account_id=r2["account"]["id"])))

    # Le retest échoue : état doit être restauré (B reste actif)
    server._broker_test_connection = _sim_failure
    res = _run(switch_active_broker(BrokerSwitchRequest(account_id=r1["account"]["id"])))
    assert res["success"] is False

    active = [a for a in _run(list_broker_accounts()) if a["is_active"]]
    assert len(active) == 1 and active[0]["login"] == 222


def test_delete_active_auto_switches(engine):
    server._broker_test_connection = _sim_success
    r1 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S1", login=111, password="p1", broker_name="A", account_type="DEMO")
        )
    )
    r2 = _run(
        connect_broker_account(
            BrokerConnectRequest(server="S2", login=222, password="p2", broker_name="B", account_type="REAL")
        )
    )
    # Supprime le compte actif (A, 111)
    res = _run(delete_broker_account(r1["account"]["id"]))
    assert res["success"] is True

    active = [a for a in _run(list_broker_accounts()) if a["is_active"]]
    assert len(active) == 1 and active[0]["login"] == 222


def test_delete_missing_raises_404(engine):
    with pytest.raises(Exception):
        _run(delete_broker_account(99999))


def test_switch_missing_raises_404(engine):
    with pytest.raises(Exception):
        _run(switch_active_broker(BrokerSwitchRequest(account_id=99999)))


async def _sim_success(server_name: str, login: int, password: str) -> dict:
    return {
        "success": True,
        "ping_ms": 12.4,
        "balance": 50210.5,
        "equity": 50780.1,
        "leverage": 100,
        "currency": "USD",
    }


async def _sim_failure(server_name: str, login: int, password: str) -> dict:
    return {"success": False, "error": "auth refused"}