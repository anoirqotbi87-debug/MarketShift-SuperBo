"""
MetaApiConnector — Connecteur Cloud MetaApi pour MarketShift-SuperBot.

B-01 : Implémentation complète du connecteur MetaApi Cloud.
B-02 : Timeouts adaptatifs déjà gérés dans AppConfig (order_execution_timeout / data_fetch_timeout).

Règles de sécurité :
- Aucun token ou secret hardcodé : les credentials sont récupérés via AppConfig.get_metaapi_credentials().
- RÈGLE M-01 : Tout ordre sans Stop Loss valide (sl <= 0) est rejeté par ValueError.
- Import tolérant : pas de crash si metaapi_cloud_sdk n'est pas installé.
- Compatible Linux ARM64 (aucune dépendance à MetaTrader5).
"""

import asyncio
import logging
import datetime
from typing import Any, Dict, List, Optional

from core.interfaces import (
    IBrokerConnector,
    AccountInfo,
    PositionInfo,
    OrderType,
)

# ── Import tolérant ────────────────────────────────────────────────────────────
try:
    from metaapi_cloud_sdk import MetaApi  # type: ignore
    METAAPI_AVAILABLE = True
except ImportError:
    MetaApi = None  # type: ignore
    METAAPI_AVAILABLE = False
    logging.warning(
        "[MetaApiConnector] Package 'metaapi_cloud_sdk' non installé. "
        "Le connecteur MetaApi est désactivé (mode stub). "
        "Installez-le avec : pip install metaapi-cloud-sdk"
    )


def _get_or_create_event_loop() -> asyncio.AbstractEventLoop:
    """Récupère ou crée une boucle d'événements asyncio (compatibilité Python 3.10+)."""
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        pass
    try:
        return asyncio.get_event_loop_policy().get_event_loop()
    except Exception:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _run_async(coro: Any) -> Any:
    """Exécute une coroutine asyncio depuis un contexte synchrone."""
    loop = _get_or_create_event_loop()
    if loop.is_running():
        # Dans un contexte asyncio (ex: serveur ASGI), on crée une nouvelle loop dans un thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result(timeout=30)
    return loop.run_until_complete(coro)


class MetaApiConnector(IBrokerConnector):
    """
    Connecteur broker utilisant l'API Cloud MetaApi.

    Toutes les méthodes IBrokerConnector sont synchrones (compatibilité Engine),
    mais internalisent les appels async via _run_async().

    Paramètres :
        token       : MetaApi Access Token (fourni par AppConfig, jamais hardcodé)
        account_id  : MetaApi MT5 Account ID
        region      : Région MetaApi (ex: "vint-hill", "new-york")
    """

    def __init__(
        self,
        token: str,
        account_id: str,
        region: str = "vint-hill",
        execution_metrics: Optional[Any] = None,
    ) -> None:
        self._token = token
        self._account_id = account_id
        self._region = region
        self._api: Optional[Any] = None          # MetaApi instance
        self._connection: Optional[Any] = None   # MetaApiConnection / RPC connection
        self._account: Optional[Any] = None      # MetaApi account object
        self.connected = False
        self._execution_metrics = execution_metrics  # M-15 integration (optionnel)
        self._logger = logging.getLogger(self.__class__.__name__)

    # ── Connexion / Déconnexion ────────────────────────────────────────────────

    def connect(self) -> bool:
        """Se connecte à MetaApi et attend la synchronisation du compte."""
        if not METAAPI_AVAILABLE:
            self._logger.error("[MetaApi] Impossible de se connecter : SDK non installé.")
            return False
        if not self._token or not self._account_id:
            self._logger.error("[MetaApi] Token ou Account ID manquant. Connexion annulée.")
            return False
        try:
            result = _run_async(self._async_connect())
            return result
        except Exception as exc:
            self._logger.error(f"[MetaApi] Erreur lors de la connexion : {exc}")
            self.connected = False
            return False

    async def _async_connect(self) -> bool:
        """Coroutine de connexion MetaApi."""
        self._api = MetaApi(self._token, {"region": self._region})
        self._account = await self._api.metatrader_account_api.get_account(self._account_id)

        state = self._account.state
        if state not in ("DEPLOYING", "DEPLOYED"):
            self._logger.info("[MetaApi] Déploiement du compte MT5...")
            await self._account.deploy()

        self._logger.info("[MetaApi] Attente de la synchronisation du compte...")
        await self._account.wait_connected()

        self._connection = self._account.get_rpc_connection()
        await self._connection.connect()
        await self._connection.wait_synchronized()

        self.connected = True
        self._logger.info("[MetaApi] Connecté et synchronisé avec succès.")
        return True

    def disconnect(self) -> None:
        """Déconnecte et undeploy le compte MetaApi."""
        if not self.connected or not METAAPI_AVAILABLE:
            return
        try:
            _run_async(self._async_disconnect())
        except Exception as exc:
            self._logger.warning(f"[MetaApi] Erreur lors de la déconnexion : {exc}")
        finally:
            self.connected = False

    async def _async_disconnect(self) -> None:
        if self._connection:
            try:
                await self._connection.close()
            except Exception:
                pass
        if self._account:
            try:
                await self._account.undeploy()
            except Exception:
                pass
        if self._api:
            try:
                self._api.close()
            except Exception:
                pass
        self._logger.info("[MetaApi] Déconnecté.")

    # ── Informations Compte ────────────────────────────────────────────────────

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self._is_ready():
            return None
        try:
            return _run_async(self._async_get_account_info())
        except Exception as exc:
            self._logger.error(f"[MetaApi] get_account_info erreur : {exc}")
            return None

    async def _async_get_account_info(self) -> Optional[AccountInfo]:
        info = await self._connection.get_account_information()
        if info is None:
            return None
        return AccountInfo(
            login=int(info.get("login", 0)),
            balance=float(info.get("balance", 0.0)),
            equity=float(info.get("equity", 0.0)),
            free_margin=float(info.get("freeMargin", 0.0)),
            margin_level=float(info.get("marginLevel", 0.0)),
            currency=str(info.get("currency", "USD")),
            server=str(info.get("broker", "MetaApi")),
        )

    # ── Positions ──────────────────────────────────────────────────────────────

    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        if not self._is_ready():
            return []
        try:
            return _run_async(self._async_get_positions(symbol))
        except Exception as exc:
            self._logger.error(f"[MetaApi] get_positions erreur : {exc}")
            return []

    async def _async_get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        raw_positions = await self._connection.get_positions()
        result: List[PositionInfo] = []
        for pos in (raw_positions or []):
            if symbol and pos.get("symbol") != symbol:
                continue
            pos_type_str = str(pos.get("type", "")).upper()
            pos_type = OrderType.BUY if "BUY" in pos_type_str else OrderType.SELL
            result.append(PositionInfo(
                ticket=int(pos.get("id", 0)),
                symbol=str(pos.get("symbol", "")),
                type=pos_type,
                volume=float(pos.get("volume", 0.0)),
                open_price=float(pos.get("openPrice", 0.0)),
                current_price=float(pos.get("currentPrice", 0.0)),
                sl=float(pos.get("stopLoss", 0.0)),
                tp=float(pos.get("takeProfit", 0.0)),
                profit=float(pos.get("profit", 0.0)),
                time=int(pos.get("time", datetime.datetime.now()).timestamp()
                          if not isinstance(pos.get("time"), (int, float))
                          else pos.get("time", 0)),
                magic=int(pos.get("magic", 0)),
                comment=str(pos.get("comment") or ""),
            ))
        return result

    # ── Exécution d'Ordre ──────────────────────────────────────────────────────

    def execute_order(
        self,
        symbol: str,
        order_type: OrderType,
        volume: float,
        sl: float = 0.0,
        tp: float = 0.0,
        magic: int = 0,
        comment: str = "",
    ) -> Optional[Dict[str, Any]]:
        """
        Exécute un ordre de marché via MetaApi.

        RÈGLE M-01 : Rejette immédiatement tout ordre sans Stop Loss valide.
        """
        # ── VALIDATION STOP LOSS OBLIGATOIRE (M-01) ─────────────────────────
        if sl is None or sl <= 0.0:
            raise ValueError(
                f"[MetaApiConnector] Stop Loss obligatoire (M-01) : "
                f"sl={sl!r} invalide pour {symbol}. Tout ordre sans SL est interdit."
            )

        if not self._is_ready():
            self._logger.error("[MetaApi] execute_order : connecteur non prêt.")
            return None

        try:
            return _run_async(self._async_execute_order(symbol, order_type, volume, sl, tp, magic, comment))
        except ValueError:
            raise  # Re-raise ValueError (M-01) sans encapsuler
        except Exception as exc:
            self._logger.error(f"[MetaApi] execute_order erreur : {exc}")
            return None

    async def _async_execute_order(
        self,
        symbol: str,
        order_type: OrderType,
        volume: float,
        sl: float,
        tp: float,
        magic: int,
        comment: str = "",
    ) -> Optional[Dict[str, Any]]:
        import time
        start_ts = time.perf_counter()

        action_type = "ORDER_TYPE_BUY" if order_type == OrderType.BUY else "ORDER_TYPE_SELL"
        order_params: Dict[str, Any] = {
            "symbol": symbol,
            "actionType": action_type,
            "volume": volume,
            "stopLoss": sl,
            "comment": comment or f"MSB-magic{magic}",
        }
        if tp and tp > 0.0:
            order_params["takeProfit"] = tp

        result = await self._connection.create_market_buy_order(**order_params) \
            if order_type == OrderType.BUY \
            else await self._connection.create_market_sell_order(**order_params)

        latency_ms = (time.perf_counter() - start_ts) * 1000.0

        # Alimentation des métriques M-15 si disponible
        if self._execution_metrics is not None:
            try:
                self._execution_metrics.record_order(
                    success=(result is not None),
                    latency_ms=latency_ms,
                    requested_price=None,
                    filled_price=float(result.get("openPrice", 0)) if result else None,
                )
            except Exception:
                pass  # Métriques non bloquantes

        if result:
            return {
                "ticket": result.get("positionId"),
                "symbol": symbol,
                "order_type": order_type.value,
                "volume": volume,
                "sl": sl,
                "tp": tp,
                "latency_ms": latency_ms,
            }
        return None

    # ── Clôture de Position ────────────────────────────────────────────────────

    def close_position(self, ticket: int) -> bool:
        if not self._is_ready():
            return False
        try:
            return _run_async(self._async_close_position(ticket))
        except Exception as exc:
            self._logger.error(f"[MetaApi] close_position erreur : {exc}")
            return False

    async def _async_close_position(self, ticket: int) -> bool:
        result = await self._connection.close_position(str(ticket))
        return result is not None

    # ── Modification de Position ───────────────────────────────────────────────

    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        if not self._is_ready():
            return False
        try:
            return _run_async(self._async_modify_position(ticket, symbol, new_sl))
        except Exception as exc:
            self._logger.error(f"[MetaApi] modify_position erreur : {exc}")
            return False

    async def _async_modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        result = await self._connection.modify_position(str(ticket), stopLoss=new_sl)
        return result is not None

    # ── Données Historiques ────────────────────────────────────────────────────

    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[Any]:
        if not self._is_ready():
            return None
        try:
            return _run_async(self._async_get_historical_data(symbol, timeframe, num_candles))
        except Exception as exc:
            self._logger.error(f"[MetaApi] get_historical_data erreur : {exc}")
            return None

    async def _async_get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[Any]:
        # Conversion timeframe entier → chaîne MetaApi (ex: 60 → "1h")
        tf_map = {1: "1m", 5: "5m", 15: "15m", 30: "30m", 60: "1h", 240: "4h", 1440: "1d"}
        tf_str = tf_map.get(timeframe, "1h")
        end_time = datetime.datetime.utcnow()
        candles = await self._connection.get_candles(symbol, tf_str, num_candles, end_time)
        if not candles:
            return None
        try:
            import pandas as pd
            df = pd.DataFrame(candles)
            df.rename(columns={
                "time": "time",
                "open": "Open",
                "high": "High",
                "low": "Low",
                "close": "Close",
                "tickVolume": "Volume",
            }, inplace=True)
            return df
        except ImportError:
            return candles

    # ── Informations Symbole ───────────────────────────────────────────────────

    def get_symbol_info(self, symbol: str) -> Optional[Any]:
        if not self._is_ready():
            return None
        try:
            return _run_async(self._async_get_symbol_info(symbol))
        except Exception as exc:
            self._logger.error(f"[MetaApi] get_symbol_info erreur : {exc}")
            return None

    async def _async_get_symbol_info(self, symbol: str) -> Optional[Any]:
        info = await self._connection.get_symbol_specification(symbol)
        return info

    # ── Historique des Deals ───────────────────────────────────────────────────

    def get_history_deals(self, from_date: Any, to_date: Any) -> Optional[Any]:
        if not self._is_ready():
            return None
        try:
            return _run_async(self._async_get_history_deals(from_date, to_date))
        except Exception as exc:
            self._logger.error(f"[MetaApi] get_history_deals erreur : {exc}")
            return None

    async def _async_get_history_deals(self, from_date: Any, to_date: Any) -> Optional[Any]:
        deals = await self._connection.get_deals_by_time_range(from_date, to_date)
        return deals

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _is_ready(self) -> bool:
        """Vérifie que le connecteur est connecté et que le SDK est disponible."""
        if not METAAPI_AVAILABLE:
            self._logger.warning("[MetaApi] SDK non disponible — opération ignorée.")
            return False
        if not self.connected or self._connection is None:
            self._logger.warning("[MetaApi] Connecteur non connecté — opération ignorée.")
            return False
        return True
