import pytest
from infrastructure.config import AppConfig


def test_m13_failfast_on_real_broker_weak_secret(monkeypatch):
    """M-13: Rejet immédiat si un compte réel est configuré avec une clé API faible ou placeholder."""
    monkeypatch.setenv("ACTIVE_BROKER", "XM")
    monkeypatch.setenv("XM_LOGIN", "12345678")
    monkeypatch.setenv("XM_PASSWORD", "SuperSecureBrokerPass123!")
    monkeypatch.setenv("XM_SERVER", "XMGlobal-MT5Real")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("API_SECRET_KEY", "short_weak_key")

    cfg = AppConfig()
    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
        cfg.validate_security_failfast()


def test_m13_failfast_in_production_weak_secret(monkeypatch):
    """M-13: Rejet immédiat en environnement de production/staging si la clé API est faible ou placeholder."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ACTIVE_BROKER", "XM")
    monkeypatch.setenv("XM_LOGIN", "0")
    monkeypatch.setenv("XM_PASSWORD", "")
    monkeypatch.setenv("XM_SERVER", "MetaQuotes-Demo")
    monkeypatch.setenv("API_SECRET_KEY", "your_api_secret_key_here")

    cfg = AppConfig()
    with pytest.raises(ValueError, match="CRITICAL SECURITY ERROR"):
        cfg.validate_security_failfast()


def test_m13_allow_in_development_demo_account(monkeypatch):
    """M-13: Tolérance en pur environnement de développement local avec broker de démo."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("ACTIVE_BROKER", "XM")
    monkeypatch.setenv("XM_LOGIN", "123456")
    monkeypatch.setenv("XM_PASSWORD", "demo_pass")
    monkeypatch.setenv("XM_SERVER", "XMGlobal-Demo")
    monkeypatch.setenv("API_SECRET_KEY", "dev_secret")

    cfg = AppConfig()
    # Ne doit pas lever d'exception
    cfg.validate_security_failfast()
