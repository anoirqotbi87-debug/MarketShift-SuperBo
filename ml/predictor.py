"""
ml/predictor.py — Filtre ML pour les signaux de trading MarketShift SuperBot

Utilise le modèle entraîné par MLTrainer pour filtrer les signaux techniques.
Si la confidence ML < seuil configuré, le signal est ignoré.
Palier C2 : Pool d'inférence borné (2 workers, 4 queue, 500ms max) et disjoncteurs.
"""

import asyncio
import logging
import math
import os
import threading
import time
from typing import TYPE_CHECKING, Any, Dict, Optional, Tuple
import uuid

import numpy as np

try:
    import pandas as pd
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore
    TORCH_AVAILABLE = False

from ml.circuit_breaker import (
    CircuitState,
    GlobalCircuitBreaker,
    SymbolCircuitBreaker,
)
from ml.inference_pool import DedicatedInferencePool
from ml.model_bundle import InferenceInput, InferenceResult, ModelBundle

if TYPE_CHECKING:
    from core.interfaces import Signal
    from ml.trainer import MLTrainer


class MLPredictor:
    """
    Filtre les signaux de trading via le modèle entraîné (ensemble XGBoost + LSTM).
    Garde-fous Palier C2 intégrés : pool dédié borné et disjoncteurs automatiques.
    """

    # Seuil par défaut calibré sur l'accuracy globale du modèle (~62.7%).
    DEFAULT_CONFIDENCE_THRESHOLD = 0.58

    def __init__(self, trainer: 'MLTrainer'):
        from infrastructure.config import Config
        self._trainer = trainer
        try:
            init_val = float(Config.ML_CONFIDENCE_THRESHOLD)
            if math.isnan(init_val) or math.isinf(init_val):
                init_val = 0.58
            elif init_val > 1.0:
                init_val = init_val / 100.0
        except (TypeError, ValueError):
            init_val = 0.58
        self._confidence_threshold = min(0.95, max(0.58, init_val))

        # Palier C2 : Pool d'inférence dédié borné et disjoncteurs
        self._pool = DedicatedInferencePool(max_workers=2, max_queue=4)
        self._circuit_breakers: Dict[str, SymbolCircuitBreaker] = {}
        self._global_breaker = GlobalCircuitBreaker()
        self._breaker_lock = threading.RLock()

        logging.info(
            f"[MLPredictor] Initialisé (seuil de confidence global: {self._confidence_threshold:.0%}, pool C2 borné max_workers=2, max_queue=4)"
        )

    def __del__(self):
        try:
            self.shutdown(wait=False)
        except Exception:
            pass

    def shutdown(self, wait: bool = False) -> None:
        """Arrête proprement le pool d'inférence dédié (Palier C2)."""
        if hasattr(self, "_pool") and self._pool is not None:
            self._pool.shutdown(wait=wait)

    @property
    def circuit_breakers(self) -> Dict[str, SymbolCircuitBreaker]:
        return self._circuit_breakers

    @property
    def global_breaker(self) -> GlobalCircuitBreaker:
        return self._global_breaker

    @property
    def pool(self) -> DedicatedInferencePool:
        return self._pool

    def set_confidence_threshold(self, threshold: float) -> None:
        """Met à jour le seuil de confidence (borné entre 0.58 et 0.95) global en runtime."""
        try:
            val = float(threshold)
        except (TypeError, ValueError):
            val = 0.58
        if math.isnan(val) or math.isinf(val):
            val = 0.58

        self._confidence_threshold = min(0.95, max(0.58, val))
        logging.info(f"[MLPredictor] Seuil global mis à jour: {self._confidence_threshold:.0%}")

    def _effective_threshold(self, symbol: str) -> float:
        """
        Seuil effectif pour un symbole :
        Formule inviolable : min(0.95, max(0.58, T_global, T_symbole(s)))
        """
        sym_val: Optional[float] = None
        env_val = os.getenv(f"ML_CONFIDENCE_THRESHOLD_{symbol}")
        if env_val is not None:
            try:
                parsed = float(env_val)
                if not (math.isnan(parsed) or math.isinf(parsed)):
                    sym_val = parsed
                else:
                    logging.warning(f"[MLPredictor] ML_CONFIDENCE_THRESHOLD_{symbol} non fini: {env_val!r}")
            except ValueError:
                logging.warning(f"[MLPredictor] ML_CONFIDENCE_THRESHOLD_{symbol} invalide: {env_val!r}")

        base_val = max(0.58, self._confidence_threshold)
        if sym_val is not None:
            return min(0.95, max(base_val, sym_val))
        return min(0.95, base_val)

    @staticmethod
    def validate_ohlcv_dataframe(df: Any) -> Tuple[bool, Optional[str]]:
        """
        Valide la structure et l'intégrité du DataFrame OHLCV (Palier C2).
        Règles :
        - len(df) >= 45 (INSUFFICIENT_BARS)
        - open, high, low, close > 0 et sans NaN/Inf (NON_POSITIVE_PRICE_VALUES)
        - timestamps sans doublons (DUPLICATE_TIMESTAMPS)
        - timestamps strictement croissants (NON_MONOTONIC_TIMESTAMPS)
        """
        if df is None or not isinstance(df, pd.DataFrame):
            return False, "INVALID_DATAFRAME: df is None or not a DataFrame"

        if len(df) < 45:
            return False, f"INSUFFICIENT_BARS: Got {len(df)} bars, required >= 45"

        price_cols = [c for c in ["open", "high", "low", "close"] if c in df]
        if len(price_cols) < 4:
            return False, "MISSING_PRICE_COLUMNS: Missing required OHLC columns in dataframe"

        for col in ["open", "high", "low", "close"]:
            vals = df[col].to_numpy()
            if np.isnan(vals).any() or np.isinf(vals).any() or (vals <= 0).any():
                return False, f"NON_POSITIVE_PRICE_VALUES: Column {col} contains non-positive, NaN or Inf values"

        time_series = None
        if "time" in df:
            time_series = df["time"]
        elif isinstance(df.index, pd.DatetimeIndex):
            time_series = pd.Series(df.index)

        if time_series is not None:
            if time_series.duplicated().any():
                return False, "DUPLICATE_TIMESTAMPS: DataFrame contains duplicate timestamps"
            if not time_series.is_monotonic_increasing:
                return False, "NON_MONOTONIC_TIMESTAMPS: DataFrame timestamps are not monotonic increasing"

        return True, None

    @staticmethod
    def compute_isolated_inference(inp: InferenceInput, bundle: ModelBundle) -> InferenceResult:
        """
        Exécute l'inférence isolée dans un worker dédié sans référence mutable à l'objet Signal (Palier C2).
        """
        start_mono = time.monotonic()
        try:
            if time.monotonic() > inp.deadline:
                return InferenceResult(
                    request_id=inp.request_id,
                    symbol=inp.symbol,
                    predicted_direction="WAIT",
                    confidence=0.0,
                    feature_importances={},
                    engine_mode="UNKNOWN",
                    duration_ms=(time.monotonic() - start_mono) * 1000.0,
                    model_version=getattr(bundle, "version_id", "unknown"),
                    is_valid=False,
                    error_reason="EXPIRED_BEFORE_EXECUTION",
                )

            features_array = inp.features_array
            if features_array is None or len(features_array) == 0:
                return InferenceResult(
                    request_id=inp.request_id,
                    symbol=inp.symbol,
                    predicted_direction="WAIT",
                    confidence=0.0,
                    feature_importances={},
                    engine_mode="UNKNOWN",
                    duration_ms=(time.monotonic() - start_mono) * 1000.0,
                    model_version=getattr(bundle, "version_id", "unknown"),
                    is_valid=False,
                    error_reason="EMPTY_FEATURES_ARRAY",
                )

            scaled = bundle.scaler.transform(features_array)

            xgb_proba = bundle.xgb_model.predict_proba([scaled[-1]])[0]
            xgb_buy_conf = float(xgb_proba[1])
            xgb_sell_conf = float(xgb_proba[0])

            lstm_model = bundle.lstm_model
            if lstm_model is not None and TORCH_AVAILABLE and torch is not None:
                seq_tensor = torch.tensor(np.array([scaled]), dtype=torch.float32)
                lstm_model.eval()
                with torch.no_grad():
                    lstm_out = lstm_model(seq_tensor).item()
                lstm_buy_conf = float(lstm_out)
                lstm_sell_conf = float(1.0 - lstm_out)

                buy_confidence = (xgb_buy_conf * 0.6) + (lstm_buy_conf * 0.4)
                sell_confidence = (xgb_sell_conf * 0.6) + (lstm_sell_conf * 0.4)
                engine_mode = "ENSEMBLE_XGB_LSTM"
            else:
                buy_confidence = xgb_buy_conf
                sell_confidence = xgb_sell_conf
                engine_mode = "XGBOOST_ONLY"

            if buy_confidence >= sell_confidence:
                predicted_direction = "BUY"
                confidence = buy_confidence
            else:
                predicted_direction = "SELL"
                confidence = sell_confidence

            feature_importances: Dict[str, float] = {}
            if hasattr(bundle.xgb_model, "feature_importances_"):
                try:
                    fi_vals = bundle.xgb_model.feature_importances_
                    cols = bundle.feature_columns
                    if cols and len(cols) == len(fi_vals):
                        feature_importances = {col: float(val) for col, val in zip(cols, fi_vals)}
                except Exception:
                    feature_importances = {}

            duration_ms = (time.monotonic() - start_mono) * 1000.0

            return InferenceResult(
                request_id=inp.request_id,
                symbol=inp.symbol,
                predicted_direction=predicted_direction,
                confidence=float(confidence),
                feature_importances=feature_importances,
                engine_mode=engine_mode,
                duration_ms=duration_ms,
                model_version=getattr(bundle, "version_id", "unknown"),
                is_valid=True,
                error_reason=None,
            )
        except Exception as exc:
            logging.error(f"[MLPredictor] Erreur compute_isolated_inference pour {inp.symbol}: {exc}")
            return InferenceResult(
                request_id=inp.request_id,
                symbol=inp.symbol,
                predicted_direction="WAIT",
                confidence=0.0,
                feature_importances={},
                engine_mode="UNKNOWN",
                duration_ms=(time.monotonic() - start_mono) * 1000.0,
                model_version=getattr(bundle, "version_id", "unknown"),
                is_valid=False,
                error_reason=f"EXCEPTION: {exc}",
            )

    async def filter_signal_async(
        self, signal: 'Signal', df: 'pd.DataFrame', timeout_seconds: float = 0.500
    ) -> Optional['Signal']:
        """
        Filtre un signal de manière asynchrone non-bloquante avec isolation C2 (Pool borné & disjoncteurs).
        """
        # 1. Vérification entraînement (Fail-closed si non entraîné)
        if not ML_AVAILABLE or not getattr(self._trainer, 'is_trained', False):
            logging.debug("[MLPredictor] Modèle non entraîné ou ML indisponible -> Rejet fail-closed (C1/C2).")
            return None

        # 2. Récupération du bundle actif atomique
        bundle = None
        if hasattr(self._trainer, "get_active_bundle"):
            bundle = self._trainer.get_active_bundle()
        else:
            xgb = getattr(self._trainer, 'xgb_model', None)
            scaler = getattr(self._trainer, 'scaler', None)
            cols = tuple(getattr(self._trainer, 'FEATURE_COLUMNS', ()))
            if xgb is not None and scaler is not None and cols:
                bundle = ModelBundle(
                    version_id="legacy_bundle",
                    xgb_model=xgb,
                    scaler=scaler,
                    lstm_model=getattr(self._trainer, 'lstm_model', None),
                    feature_columns=cols,
                    accuracy=0.62,
                    sample_count=1000,
                    loaded_at=time.time()
                )

        if bundle is None:
            logging.warning("[MLPredictor] Aucun ModelBundle actif disponible -> Rejet fail-closed.")
            return None

        if hasattr(bundle, "validate") and not bundle.validate():
            logging.error("[MLPredictor] Bundle ML invalide ou incohérent -> Rejet fail-closed.")
            return None

        # 3. Validation OHLCV
        valid_df, ohlcv_reason = self.validate_ohlcv_dataframe(df)
        if not valid_df:
            logging.warning(f"[MLPredictor] Rejet OHLCV {signal.symbol}: {ohlcv_reason}")
            return None

        # 4. Vérification Disjoncteur Global
        if self._global_breaker.state == CircuitState.OPEN:
            logging.warning(f"[MLPredictor] 🛑 Disjoncteur GLOBAL OUVERT. Signal {signal.symbol} rejeté en 0ms.")
            return None

        # 5. Vérification Disjoncteur Symbole
        symbol = signal.symbol
        with self._breaker_lock:
            if symbol not in self._circuit_breakers:
                self._circuit_breakers[symbol] = SymbolCircuitBreaker(symbol)
            sym_breaker = self._circuit_breakers[symbol]

        allowed, reason = sym_breaker.allow_request()
        if not allowed:
            logging.warning(f"[MLPredictor] 🛑 Disjoncteur [{symbol}] REFUS ({reason}). Signal rejeté en 0ms.")
            return None

        # 6. Extraction des features
        try:
            processed_df = self._trainer._build_features(df)
            if processed_df is None or len(processed_df) < 10:
                was_open = sym_breaker.state == CircuitState.OPEN
                sym_breaker.record_failure("INSUFFICIENT_FEATURES")
                if not was_open and sym_breaker.state == CircuitState.OPEN:
                    self._global_breaker.record_symbol_trip(symbol)
                return None

            feat_cols = list(bundle.feature_columns)
            features_vals = processed_df[feat_cols].values[-10:].astype(float)
            features_vals.flags.writeable = False
        except Exception as exc:
            logging.error(f"[MLPredictor] Erreur extraction features pour {symbol}: {exc}")
            was_open = sym_breaker.state == CircuitState.OPEN
            sym_breaker.record_failure(f"FEATURE_EXTRACTION_ERROR: {exc}")
            if not was_open and sym_breaker.state == CircuitState.OPEN:
                self._global_breaker.record_symbol_trip(symbol)
            return None

        # 7. Création de l'InferenceInput immuable
        req_id = f"inf_{uuid.uuid4().hex[:12]}"
        deadline = time.monotonic() + timeout_seconds
        inp = InferenceInput(
            request_id=req_id,
            symbol=symbol,
            direction=signal.direction.name,
            features_array=features_vals,
            deadline=deadline
        )

        # 8. Soumission au pool d'inférence borné
        compute_fn = getattr(self, "compute_isolated_inference", MLPredictor.compute_isolated_inference)
        res, err = await self._pool.execute_async(
            inp=inp,
            bundle=bundle,
            compute_fn=compute_fn,
            timeout_seconds=timeout_seconds
        )

        # 9. Traitement des erreurs et SLA
        if err == "QUEUE_SATURATED":
            sym_breaker.record_queue_saturated()
            logging.warning(
                f"[MLPredictor] ⚠️ Saturation pool C2 pour {symbol}. Signal rejeté sans pénalité."
            )
            return None

        if err or res is None or not res.is_valid:
            fail_reason = err or (res.error_reason if res else None) or "INVALID_RESULT"
            was_open = sym_breaker.state == CircuitState.OPEN
            sym_breaker.record_failure(fail_reason)
            if not was_open and sym_breaker.state == CircuitState.OPEN:
                self._global_breaker.record_symbol_trip(symbol)
            logging.warning(f"[MLPredictor] 🚫 Échec inférence pour {symbol}: {fail_reason}. Rejet du signal.")
            return None

        # 10. Succès technique : enregistrer auprès du disjoncteur
        sym_breaker.record_success()

        # 11. Décision métier (Veto / Validation)
        direction = res.predicted_direction
        confidence = res.confidence
        confidence_threshold = self._effective_threshold(symbol)
        signal_dir = signal.direction.name

        logging.debug(
            f"[MLPredictor] [{symbol}] Signal {signal_dir} | "
            f"IA→{direction} @ {confidence:.1%} | seuil={confidence_threshold:.1%} | "
            f"accord={'OUI' if direction == signal_dir else 'NON ⛔'}"
        )

        if direction == signal_dir:
            if confidence >= confidence_threshold:
                signal.metadata['ml_confidence'] = confidence
                signal.metadata['ml_validated'] = True
                signal.metadata['ml_engine_mode'] = res.engine_mode
                logging.info(
                    f"[MLPredictor] ✅ Signal {signal_dir} sur {symbol} validé par ML "
                    f"(haute confiance: {confidence:.1%} >= {confidence_threshold:.1%}, mode: {res.engine_mode})"
                )
                return signal
            else:
                logging.warning(
                    f"[MLPredictor] 🚫 Signal {signal_dir} sur {symbol} REJETÉ. "
                    f"Confiance insuffisante ({confidence:.1%} < {confidence_threshold:.1%})."
                )
                return None
        else:
            logging.warning(
                f"[MLPredictor] 🚫 VETO ML : Signal {signal_dir} sur {symbol} REJETÉ "
                f"(L'IA veut {direction} à {confidence:.1%})"
            )
            return None

    def predict(self, df: 'pd.DataFrame') -> Tuple[str, float, dict]:
        """
        Prédit la direction du marché à partir des données OHLCV.
        """
        if not ML_AVAILABLE or not getattr(self._trainer, 'is_trained', False) or df is None:
            return 'WAIT', 0.0, {}

        if not isinstance(df, pd.DataFrame) or df.empty or len(df) < 10:
            return 'WAIT', 0.0, {}

        try:
            xgb_model = getattr(self._trainer, 'xgb_model', None)
            lstm_model = getattr(self._trainer, 'lstm_model', None)
            scaler = getattr(self._trainer, 'scaler', None)

            if xgb_model is None or scaler is None:
                return 'WAIT', 0.0, {}

            processed_df = self._trainer._build_features(df)
            if processed_df is None or not isinstance(processed_df, pd.DataFrame) or len(processed_df) < 10:
                return 'WAIT', 0.0, {}

            feat_cols = getattr(self._trainer, 'FEATURE_COLUMNS', None)
            if not feat_cols or not all(c in processed_df.columns for c in feat_cols):
                return 'WAIT', 0.0, {}

            last_10 = processed_df[feat_cols].values[-10:]
            # Rejet strict des valeurs non finies (NaN / Inf) dans les features (Contrat C1)
            if np.isnan(last_10).any() or np.isinf(last_10).any():
                logging.warning("[MLPredictor] Features contiennent des valeurs non finies (NaN/Inf) -> Rejet C1.")
                return 'WAIT', 0.0, {}

            last_10_scaled = scaler.transform(last_10)

            # Validation stricte des probabilités XGBoost (Contrat C1)
            xgb_proba_raw = xgb_model.predict_proba([last_10_scaled[-1]])[0]
            xgb_buy_conf = float(xgb_proba_raw[1])
            xgb_sell_conf = float(xgb_proba_raw[0])

            if (
                math.isnan(xgb_buy_conf)
                or math.isnan(xgb_sell_conf)
                or math.isinf(xgb_buy_conf)
                or math.isinf(xgb_sell_conf)
                or xgb_buy_conf < 0.0
                or xgb_buy_conf > 1.0
                or xgb_sell_conf < 0.0
                or xgb_sell_conf > 1.0
            ):
                logging.warning(f"[MLPredictor] Probabilités XGBoost hors bornes [0, 1] ou non finies: {xgb_proba_raw}")
                return 'WAIT', 0.0, {}

            if lstm_model is not None and TORCH_AVAILABLE and torch is not None:
                seq_tensor = torch.tensor(np.array([last_10_scaled]), dtype=torch.float32)
                lstm_model.eval()
                with torch.no_grad():
                    lstm_out = float(lstm_model(seq_tensor).item())

                if (
                    math.isnan(lstm_out)
                    or math.isinf(lstm_out)
                    or lstm_out < 0.0
                    or lstm_out > 1.0
                ):
                    logging.warning(f"[MLPredictor] Sortie LSTM hors bornes [0, 1]: {lstm_out}")
                    return 'WAIT', 0.0, {}

                lstm_buy_conf = lstm_out
                lstm_sell_conf = 1.0 - lstm_out

                buy_confidence = (xgb_buy_conf * 0.6) + (lstm_buy_conf * 0.4)
                sell_confidence = (xgb_sell_conf * 0.6) + (lstm_sell_conf * 0.4)
            else:
                buy_confidence = xgb_buy_conf
                sell_confidence = xgb_sell_conf

            feature_importances: Dict[str, float] = {}
            if hasattr(self._trainer, 'get_feature_importances'):
                try:
                    feature_importances = self._trainer.get_feature_importances()
                except Exception:
                    feature_importances = {}

            if buy_confidence >= sell_confidence:
                return 'BUY', buy_confidence, feature_importances
            else:
                return 'SELL', sell_confidence, feature_importances

        except Exception as e:
            logging.error(f"[MLPredictor] Erreur de prédiction: {e}")
            return 'WAIT', 0.0, {}

    def filter_signal(self, signal: 'Signal', df: 'pd.DataFrame') -> Optional['Signal']:
        """
        Filtre un signal technique via le modèle ML (synchrone historique).

        Garanties Palier C1 :
        - Rejet immédiat si signal is None ou df is None / incomplet.
        - Fail-Closed absolu si le modèle n'est pas entraîné.
        - Rejet strict si confidence < seuil effectif (aucun bypass [0.52, 0.58[).
        - Renseigne 'ml_engine_mode' ('XGBOOST_ONLY' ou 'ENSEMBLE_XGB_LSTM').
        """
        if signal is None:
            return None

        if not ML_AVAILABLE or not getattr(self._trainer, 'is_trained', False):
            logging.debug(
                "[MLPredictor] Modèle non entraîné ou ML indisponible -> Rejet fail-closed (C1)."
            )
            return None

        if df is None or not isinstance(df, pd.DataFrame) or df.empty or len(df) < 10:
            logging.warning(
                f"[MLPredictor] Données OHLCV insuffisantes pour {getattr(signal, 'symbol', 'UNKNOWN')} -> Rejet fail-closed."
            )
            return None

        confidence_threshold = self._effective_threshold(signal.symbol)

        direction, confidence, _ = self.predict(df)
        signal_dir = signal.direction.name

        logging.debug(
            f"[MLPredictor] [{signal.symbol}] Signal {signal_dir} | "
            f"IA→{direction} @ {confidence:.1%} | seuil={confidence_threshold:.1%} | "
            f"accord={'OUI' if direction == signal_dir else 'NON ⛔'}"
        )

        if direction == signal_dir:
            if confidence >= confidence_threshold:
                engine_mode = (
                    "ENSEMBLE_XGB_LSTM"
                    if (getattr(self._trainer, 'lstm_model', None) is not None and TORCH_AVAILABLE and torch is not None)
                    else "XGBOOST_ONLY"
                )
                signal.metadata['ml_confidence'] = confidence
                signal.metadata['ml_validated'] = True
                signal.metadata['ml_engine_mode'] = engine_mode
                logging.info(
                    f"[MLPredictor] ✅ Signal {signal_dir} sur {signal.symbol} validé par ML "
                    f"(haute confiance: {confidence:.1%} >= {confidence_threshold:.1%}, mode: {engine_mode})"
                )
                return signal
            else:
                logging.warning(
                    f"[MLPredictor] 🚫 Signal {signal_dir} sur {signal.symbol} REJETÉ. "
                    f"Confiance insuffisante ({confidence:.1%} < {confidence_threshold:.1%})."
                )
                return None
        else:
            logging.warning(
                f"[MLPredictor] 🚫 VETO ML : Signal {signal_dir} sur {signal.symbol} REJETÉ "
                f"(L'IA veut {direction} à {confidence:.1%})"
            )
            return None

    @property
    def confidence_threshold(self) -> float:
        return self._confidence_threshold
