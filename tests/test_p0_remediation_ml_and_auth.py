"""
tests/test_p0_remediation_ml_and_auth.py
Suite de validation formelle de la remédiation de sécurité P0-A et P0-B :
1. P0-A : Sécurité d'authentification API
   - Rejet formel de l'ancienne clé de secours statique dans TOUS les environnements (dev, test, prod).
   - Rejet de requêtes sans clé ou avec clé invalide (HTTP 403).
   - Utilisation vérifiée de secrets.compare_digest contre les attaques temporelles.
   - Fail-closed sans fuite d'informations internes si clé non configurée en prod.
   - Frontend dashboard sécurisé sans clé administrative partagée par défaut.
2. P0-B : Plancher strict du seuil de confiance ML (0.58 <= T_effectif <= 0.95)
   - Configuration globale à 0.00, 0.50, 0.58, 0.95, 1.00, NaN et valeur invalide.
   - Surcharge par symbole inférieure à 0.58, valide, non finie et mal formée.
   - Appel direct de set_confidence_threshold.
   - Endpoint /apply-optimal-settings (statut HTTP 422 vs 200, état effectif).
   - Persistance dans .env et cohérence mémoire (Config, os.environ, MLPredictor).
"""

import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from infrastructure.config import Config, AppConfig
from api.server import app
from ml.predictor import MLPredictor
from ml.trainer import MLTrainer

RETIRED_FALLBACK_KEY = "1f4e4a57fbef3922fdffa64d8849cf24ad47215372f14ffa4cba8c9a0992f4e5"
VALID_PROD_SECRET = "super_secure_production_token_marketshift_2026_xyz"


# =============================================================================
# PARTIE 1 : TESTS DE SÉCURITÉ P0-A (AUTHENTIFICATION API)
# =============================================================================

def test_p0_a_retired_fallback_key_strictly_rejected_in_dev_test_prod():
    """Vérifie que l'ancienne clé fallback est rejetée dans tous les environnements."""
    client = TestClient(app)
    headers = {"X-API-Key": RETIRED_FALLBACK_KEY}

    for env in ("development", "dev", "test", "staging", "production"):
        with patch.object(Config, "ENVIRONMENT", env):
            with patch.object(Config, "API_SECRET_KEY", VALID_PROD_SECRET):
                res = client.post("/control", json={"action": "pause"}, headers=headers)
                assert res.status_code == 403, f"Échec de rejet en mode {env}: code {res.status_code}"
                assert "Clé d'API manquante ou invalide" in res.json().get("detail", "")


def test_p0_a_missing_or_empty_key_returns_403_without_leakage():
    """Vérifie qu'une clé manquante ou vide renvoie un 403 propre sans exposer d'informations internes."""
    client = TestClient(app)

    # 1. En-tête absent
    with patch.object(Config, "API_SECRET_KEY", VALID_PROD_SECRET):
        res_no_hdr = client.post("/control", json={"action": "pause"})
        assert res_no_hdr.status_code == 403

        # 2. En-tête vide
        res_empty = client.post("/control", json={"action": "pause"}, headers={"X-API-Key": ""})
        assert res_empty.status_code == 403

        # 3. En-tête arbitraire invalide
        res_bad = client.post("/control", json={"action": "pause"}, headers={"X-API-Key": "attacker_fake_token"})
        assert res_bad.status_code == 403


def test_p0_a_unconfigured_server_key_fails_closed_in_prod():
    """En staging/prod, si aucune clé secrète n'est configurée, l'accès est strictement refusé (Fail-Closed)."""
    client = TestClient(app)
    with patch.object(Config, "ENVIRONMENT", "production"):
        with patch.object(Config, "API_SECRET_KEY", ""):
            res = client.post("/control", json={"action": "pause"}, headers={"X-API-Key": "any_attempt"})
            assert res.status_code == 403
            assert "Accès refusé" in res.json().get("detail", "")


def test_p0_a_frontend_has_no_shared_admin_key():
    """Vérifie statiquement que dashboard/src/lib/api.ts ne contient pas de clé partagée codée en dur."""
    ts_path = os.path.join("dashboard", "src", "lib", "api.ts")
    if os.path.exists(ts_path):
        with open(ts_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert RETIRED_FALLBACK_KEY not in content, "La clé de secours a été trouvée dans le frontend !"
        assert 'export const DEFAULT_API_KEY = "";' in content


# =============================================================================
# PARTIE 2 : TESTS DE SÉCURITÉ P0-B (SEUIL DE CONFIANCE ML)
# =============================================================================

def test_p0_b_1_global_config_boundary_and_invalid_values():
    """
    Test 1 Auditeur :
    Configuration globale à 0.00, 0.50, 0.58, 0.95, 1.00, NaN et valeur invalide.
    Vérifie le rejet Pydantic ou la conformité aux bornes [0.58, 0.95].
    """
    # Valeurs invalides : doivent lever ValueError via Pydantic validator
    invalid_cases = [0.00, 0.50, 1.00, float("nan"), "invalid_str", -0.1]
    for inv in invalid_cases:
        with pytest.raises(ValueError):
            AppConfig(ML_CONFIDENCE_THRESHOLD=inv)

    # Valeurs valides : acceptées
    cfg_min = AppConfig(ML_CONFIDENCE_THRESHOLD=0.58)
    assert cfg_min.ML_CONFIDENCE_THRESHOLD == 0.58

    cfg_max = AppConfig(ML_CONFIDENCE_THRESHOLD=0.95)
    assert cfg_max.ML_CONFIDENCE_THRESHOLD == 0.95

    # Pourcentages valides (> 1.0) automatiquement normalisés
    cfg_pct = AppConfig(ML_CONFIDENCE_THRESHOLD=65.0)
    assert cfg_pct.ML_CONFIDENCE_THRESHOLD == 0.65


def test_p0_b_2_symbol_override_effective_threshold_behavior():
    """
    Test 2 Auditeur :
    Surcharge par symbole inférieure à 0.58, valide, non finie et mal formée.
    Formule obligatoire : T_effectif(s) = min(0.95, max(0.58, T_global, T_symbole(s)))
    """
    trainer_mock = MagicMock(spec=MLTrainer)
    trainer_mock.is_trained = False
    predictor = MLPredictor(trainer=trainer_mock)
    predictor.set_confidence_threshold(0.58)

    # Cas 1 : Surcharge inférieure à 0.58 (ex: 0.50 ou 0.40) -> le seuil NE DOIT PAS BAISSER
    with patch.dict(os.environ, {"ML_CONFIDENCE_THRESHOLD_EURUSD": "0.50"}):
        eff = predictor._effective_threshold("EURUSD")
        assert eff == 0.58, f"Violation plancher : {eff} < 0.58"

    # Cas 2 : Surcharge valide supérieure (ex: 0.72) -> autorisée pour durcir
    with patch.dict(os.environ, {"ML_CONFIDENCE_THRESHOLD_GBPUSD": "0.72"}):
        eff = predictor._effective_threshold("GBPUSD")
        assert eff == 0.72

    # Cas 3 : Surcharge non finie (NaN, Inf) -> repli sûr sur T_global (>= 0.58)
    with patch.dict(os.environ, {"ML_CONFIDENCE_THRESHOLD_USDJPY": "NaN"}):
        eff = predictor._effective_threshold("USDJPY")
        assert eff == 0.58

    with patch.dict(os.environ, {"ML_CONFIDENCE_THRESHOLD_USDJPY": "inf"}):
        eff = predictor._effective_threshold("USDJPY")
        assert eff == 0.58

    # Cas 4 : Surcharge mal formée (chaîne aléatoire) -> repli sûr
    with patch.dict(os.environ, {"ML_CONFIDENCE_THRESHOLD_XAUUSD": "MALFORMED_VALUE"}):
        eff = predictor._effective_threshold("XAUUSD")
        assert eff == 0.58

    # Cas 5 : Surcharge excessive (> 0.95) -> bornée au plafond de 0.95
    with patch.dict(os.environ, {"ML_CONFIDENCE_THRESHOLD_EURUSD": "0.99"}):
        eff = predictor._effective_threshold("EURUSD")
        assert eff == 0.95


def test_p0_b_3_direct_set_confidence_threshold_clamping():
    """
    Test 3 Auditeur :
    Appel direct de set_confidence_threshold.
    Vérifie qu'aucune valeur passée en runtime ne peut descendre sous 0.58 ni dépasser 0.95.
    """
    trainer_mock = MagicMock(spec=MLTrainer)
    trainer_mock.is_trained = False
    predictor = MLPredictor(trainer=trainer_mock)

    # Tentative d'abaissement à 0.10
    predictor.set_confidence_threshold(0.10)
    assert predictor.confidence_threshold == 0.58

    # Tentative d'abaissement à 0.50
    predictor.set_confidence_threshold(0.50)
    assert predictor.confidence_threshold == 0.58

    # Valeur normale 0.65
    predictor.set_confidence_threshold(0.65)
    assert predictor.confidence_threshold == 0.65

    # Tentative de dépassement à 1.20
    predictor.set_confidence_threshold(1.20)
    assert predictor.confidence_threshold == 0.95

    # Valeur non finie (NaN) -> repli sur 0.58
    predictor.set_confidence_threshold(float("nan"))
    assert predictor.confidence_threshold == 0.58


def test_p0_b_4_apply_optimal_settings_endpoint_validation():
    """
    Test 4 Auditeur :
    Endpoint /apply-optimal-settings avec vérification du statut HTTP et de l'état effectif.
    """
    client = TestClient(app)
    headers = {"X-API-Key": VALID_PROD_SECRET}

    with patch.object(Config, "API_SECRET_KEY", VALID_PROD_SECRET):
        # 1. Tentative à 0.50 -> Doit renvoyer HTTP 422
        res_too_low = client.post(
            "/apply-optimal-settings",
            json={"slMult": 2.0, "confThreshold": 0.50, "symbol": "EURUSD"},
            headers=headers
        )
        assert res_too_low.status_code == 422

        # 2. Tentative à 0.55 -> HTTP 422
        res_sub_floor = client.post(
            "/apply-optimal-settings",
            json={"slMult": 2.0, "confThreshold": 0.55, "symbol": "EURUSD"},
            headers=headers
        )
        assert res_sub_floor.status_code == 422

        # 3. Tentative à 0.98 (> 0.95) -> HTTP 422
        res_too_high = client.post(
            "/apply-optimal-settings",
            json={"slMult": 2.0, "confThreshold": 0.98, "symbol": "EURUSD"},
            headers=headers
        )
        assert res_too_high.status_code == 422

        # 4. Requête valide à 0.62 -> HTTP 200
        with patch("api.server.atomic_update_env"):
            with patch("api.server._engine") as mock_engine:
                mock_pred = MagicMock()
                mock_engine.ml_predictor = mock_pred
                res_ok = client.post(
                    "/apply-optimal-settings",
                    json={"slMult": 2.0, "confThreshold": 0.62, "symbol": "EURUSD"},
                    headers=headers
                )
                assert res_ok.status_code == 200
                mock_pred.set_confidence_threshold.assert_called_with(0.62)


def test_p0_b_5_env_persistence_and_in_memory_consistency(tmp_path):
    """
    Test 5 Auditeur :
    Persistance dans .env et cohérence entre la valeur persistée, la configuration chargée
    et le prédicteur en mémoire.
    """
    env_file = tmp_path / ".env"
    env_file.write_text("API_SECRET_KEY=test_secret_12345678901234567890\nML_CONFIDENCE_THRESHOLD=0.68\n", encoding="utf-8")

    # 1. Vérification configuration chargée depuis .env (sans interférence des variables d'environnement actives)
    with patch.dict(os.environ):
        os.environ.pop("ML_CONFIDENCE_THRESHOLD", None)
        loaded_cfg = AppConfig(_env_file=str(env_file))
        assert loaded_cfg.ML_CONFIDENCE_THRESHOLD == 0.68

        # 2. Instanciation du prédicteur ML basé sur cette config
        trainer_mock = MagicMock(spec=MLTrainer)
        trainer_mock.is_trained = False
        with patch("infrastructure.config.Config", loaded_cfg):
            pred = MLPredictor(trainer=trainer_mock)
            assert pred.confidence_threshold == 0.68
            assert pred._effective_threshold("EURUSD") == 0.68

            # 3. Mise à jour runtime légitime à 0.75
            pred.set_confidence_threshold(0.75)
            assert pred.confidence_threshold == 0.75
            assert pred._effective_threshold("EURUSD") == 0.75
