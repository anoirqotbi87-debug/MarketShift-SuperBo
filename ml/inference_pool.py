"""
ml/inference_pool.py — Pool d'inférence borné et isolé pour le Palier C2.

Garanties Palier C2 :
- 2 workers maximum, 4 requêtes en attente maximum.
- Capacité totale stricte : 6 requêtes (2 actives + 4 en attente).
- Au-delà de 6 requêtes, rejet atomique immédiat avec QUEUE_SATURATED (0 thread soumis).
- Vérification monotone de deadline avant et après calcul.
- Les workers ne reçoivent jamais l'objet Signal mutable du moteur.
- Isolation thread-safe des compteurs sous RLock.
"""

import time
import uuid
import logging
import threading
import asyncio
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Callable, Optional, Tuple, Any

from ml.model_bundle import InferenceInput, InferenceResult, ModelBundle


class DedicatedInferencePool:
    """
    Gestionnaire de pool d'exécution d'inférence borné.
    """
    def __init__(self, max_workers: int = 2, max_queue: int = 4):
        self.max_workers = max_workers
        self.max_queue = max_queue
        self.max_total_capacity = max_workers + max_queue

        self._lock = threading.RLock()
        self._active_workers = 0
        self._pending_tasks = 0
        self._executor = ThreadPoolExecutor(
            max_workers=self.max_workers,
            thread_name_prefix="ML-Inference-Worker"
        )
        self._closed = False

    @property
    def active_workers(self) -> int:
        with self._lock:
            return self._active_workers

    @property
    def pending_tasks(self) -> int:
        with self._lock:
            return self._pending_tasks

    @property
    def total_in_flight(self) -> int:
        with self._lock:
            return self._active_workers + self._pending_tasks

    def submit(
        self,
        inp: InferenceInput,
        bundle: ModelBundle,
        compute_fn: Callable[[InferenceInput, ModelBundle], InferenceResult]
    ) -> Tuple[Optional[Future], Optional[str]]:
        """
        Soumet une tâche d'inférence de manière atomiquement bornée.
        Retourne (Future, None) si acceptée, ou (None, "QUEUE_SATURATED") si saturée.
        """
        with self._lock:
            if self._closed:
                return None, "POOL_CLOSED"

            if self._active_workers + self._pending_tasks >= self.max_total_capacity:
                logging.warning(
                    f"[DedicatedInferencePool] 🛑 Saturation du pool ({self._active_workers} actifs, {self._pending_tasks} en attente, max={self.max_total_capacity}). "
                    f"Rejet immédiat de la requête {inp.request_id} pour {inp.symbol}."
                )
                return None, "QUEUE_SATURATED"

            self._pending_tasks += 1

        def _worker_wrapper() -> InferenceResult:
            # Transition de la file d'attente vers l'exécution active
            with self._lock:
                self._pending_tasks -= 1
                self._active_workers += 1

            start_mono = time.monotonic()
            try:
                # 1. Vérification pré-calcul de l'échéance monotone
                if time.monotonic() > inp.deadline:
                    return InferenceResult(
                        request_id=inp.request_id,
                        symbol=inp.symbol,
                        predicted_direction="WAIT",
                        confidence=0.0,
                        feature_importances={},
                        engine_mode="UNKNOWN",
                        duration_ms=(time.monotonic() - start_mono) * 1000.0,
                        model_version=bundle.version_id,
                        is_valid=False,
                        error_reason="EXPIRED_BEFORE_EXECUTION"
                    )

                # 2. Exécution du calcul isolé
                result = compute_fn(inp, bundle)

                # 3. Vérification post-calcul de l'échéance monotone
                if time.monotonic() > inp.deadline:
                    return InferenceResult(
                        request_id=inp.request_id,
                        symbol=inp.symbol,
                        predicted_direction="WAIT",
                        confidence=0.0,
                        feature_importances={},
                        engine_mode=result.engine_mode,
                        duration_ms=(time.monotonic() - start_mono) * 1000.0,
                        model_version=bundle.version_id,
                        is_valid=False,
                        error_reason="EXPIRED_DURING_EXECUTION"
                    )

                return result

            except Exception as exc:
                logging.error(f"[DedicatedInferencePool] Erreur inattendue dans le worker {inp.request_id}: {exc}")
                return InferenceResult(
                    request_id=inp.request_id,
                    symbol=inp.symbol,
                    predicted_direction="WAIT",
                    confidence=0.0,
                    feature_importances={},
                    engine_mode="UNKNOWN",
                    duration_ms=(time.monotonic() - start_mono) * 1000.0,
                    model_version=bundle.version_id,
                    is_valid=False,
                    error_reason=f"EXCEPTION: {exc}"
                )
            finally:
                with self._lock:
                    self._active_workers -= 1

        future = self._executor.submit(_worker_wrapper)
        return future, None

    async def execute_async(
        self,
        inp: InferenceInput,
        bundle: ModelBundle,
        compute_fn: Callable[[InferenceInput, ModelBundle], InferenceResult],
        timeout_seconds: float = 0.500
    ) -> Tuple[Optional[InferenceResult], Optional[str]]:
        """
        Pont asynchrone pour le moteur de trading avec délai d'attente strict.
        """
        future, err = self.submit(inp, bundle, compute_fn)
        if err:
            return None, err

        try:
            loop = asyncio.get_running_loop()
            result: InferenceResult = await asyncio.wait_for(
                loop.run_in_executor(None, future.result),
                timeout=timeout_seconds
            )
            return result, None
        except asyncio.TimeoutError:
            logging.warning(
                f"[DedicatedInferencePool] ⏱️ Timeout asynchrone ({timeout_seconds * 1000:.0f}ms) dépassé pour {inp.symbol} (Req: {inp.request_id})."
            )
            return None, "TIMEOUT"
        except Exception as e:
            logging.error(f"[DedicatedInferencePool] Erreur d'attente asynchrone pour {inp.symbol}: {e}")
            return None, f"EXCEPTION: {e}"

    def shutdown(self, wait: bool = False) -> None:
        with self._lock:
            self._closed = True
        self._executor.shutdown(wait=wait)
