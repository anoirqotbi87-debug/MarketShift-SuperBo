"""
ml/model_bundle.py — Conteneur immuable et publication atomique des modèles ML.

Garanties Palier C2 :
- Publication atomique : aucun worker ne peut observer un état intermédiaire ou incompatible
  entre le modèle (XGBoost/LSTM) et le normalisateur (StandardScaler).
- DTOs immuables pour l'inférence : découplage strict entre les données de calcul et l'objet Signal.
"""

from dataclasses import dataclass
from typing import Any, Optional, Dict, Tuple
import numpy as np
import time


@dataclass(frozen=True)
class ModelBundle:
    """
    Bundle immuable représentant une génération complète et cohérente d'artefacts ML.
    """
    version_id: str
    xgb_model: Any
    scaler: Any
    lstm_model: Any
    feature_columns: Tuple[str, ...]
    accuracy: float
    sample_count: int
    loaded_at: float

    def validate(self) -> bool:
        """Vérifie la cohérence interne du bundle avant publication."""
        if self.xgb_model is None or self.scaler is None:
            return False
        if not self.feature_columns or len(self.feature_columns) == 0:
            return False
        # Vérification de compatibilité dimensionnelle si le scaler a n_features_in_
        n_features = len(self.feature_columns)
        scaler_features = getattr(self.scaler, 'n_features_in_', n_features)
        if isinstance(scaler_features, int) and scaler_features != n_features:
            return False
        return True


@dataclass(frozen=True)
class InferenceInput:
    """
    Données d'entrée isolées transmises au worker d'inférence.
    Ne contient AUCUNE référence à l'objet Signal du moteur de trading.
    """
    request_id: str
    symbol: str
    direction: str              # 'BUY' ou 'SELL'
    features_array: np.ndarray  # Matrice 2D (dernières barres) avec arr.flags.writeable = False
    deadline: float             # time.monotonic() de péremption stricte


@dataclass(frozen=True)
class InferenceResult:
    """
    Résultat d'inférence immuable retourné par le worker.
    """
    request_id: str
    symbol: str
    predicted_direction: str    # 'BUY', 'SELL', 'WAIT'
    confidence: float           # Flottant fini dans [0.0, 1.0]
    feature_importances: Dict[str, float]
    engine_mode: str            # 'XGBOOST_ONLY' ou 'ENSEMBLE_XGB_LSTM'
    duration_ms: float
    model_version: str
    is_valid: bool
    error_reason: Optional[str] = None
