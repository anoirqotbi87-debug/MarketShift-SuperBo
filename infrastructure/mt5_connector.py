import logging
import threading
import time

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None
    logging.warning("MetaTrader5 not available (likely Linux OS). MT5 Connector will be disabled.")
from typing import Optional, List, Dict, Any
import datetime
import pandas as pd

from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType

class MT5Connector(IBrokerConnector):
    ALIAS_MAP = {
        "XAUUSD": ["GOLD", "XAUUSD#", "GOLDmicro", "GOLD#", "XAUUSD"],
        "GOLD": ["GOLD", "XAUUSD", "GOLDmicro", "GOLD#"],
        "SILVER": ["SILVER", "XAGUSD", "SILVERmicro", "SILVER#"],
        "XAGUSD": ["SILVER", "XAGUSD", "SILVERmicro", "SILVER#"],
        "USOIL": ["OIL", "OILCash", "USOILCash", "USOIL#", "USOIL", "WTI"],
        "GER40": ["GER40Cash", "DE40Cash", "GER40#", "GER40", "GER30", "DE40"],
        "US500": ["US500Cash", "US500#", "SPX500Cash", "US500"],
        "US100": ["US100Cash", "US100#", "NAS100Cash", "US100", "USTEC"],
        "US30": ["US30Cash", "US30#", "DJ30Cash", "US30", "WALLSTREET"],
        "BTCUSD": ["BTCUSD", "BTCUSD#", "BITCOIN", "BTCUSDmicro"],
        "ETHUSD": ["ETHUSD", "ETHUSD#", "ETHEREUM", "ETHUSDmicro"],
        "SOLUSD": ["SOLUSD", "SOLUSD#", "SOLANA", "SOLUSDmicro"],
    }

    def __init__(self, login: int, password: str, server: str):
        self.login = login
        self.password = password
        self.server = server
        self.connected = False
        self._lock = threading.Lock()
        self._resolved_symbols: Dict[str, Optional[str]] = {}

    def resolve_symbol(self, symbol: str) -> Optional[str]:
        """Résout dynamiquement les alias du broker (ex: XM nomme XAUUSD -> GOLD, GER40 -> GER40Cash)."""
        if not self.connected or mt5 is None:
            return symbol

        sym_clean = symbol.strip().upper()
        if sym_clean in self._resolved_symbols:
            return self._resolved_symbols[sym_clean]

        with self._lock:
            mt5.initialize()
            # 1. Tester le symbole brut
            info = mt5.symbol_info(sym_clean)
            if info is not None:
                mt5.symbol_select(sym_clean, True)
                self._resolved_symbols[sym_clean] = sym_clean
                return sym_clean

            # 2. Tester les alias connus
            candidates = list(self.ALIAS_MAP.get(sym_clean, []))
            for base in [sym_clean, sym_clean.replace("#", "")]:
                for suffix in ["#", "micro", "Cash", "m", ".raw"]:
                    cand = f"{base}{suffix}"
                    if cand not in candidates:
                        candidates.append(cand)

            for cand in candidates:
                c_info = mt5.symbol_info(cand)
                if c_info is not None:
                    mt5.symbol_select(cand, True)
                    logging.info(f"[MT5Connector] 🎯 Symbole {sym_clean} résolu en alias broker : '{cand}'")
                    self._resolved_symbols[sym_clean] = cand
                    return cand

        # 3. Non disponible sur ce broker
        self._resolved_symbols[sym_clean] = None
        logging.warning(f"[MT5Connector] ⚠️ Symbole '{sym_clean}' non disponible dans le catalogue de ce broker ({self.server}). Scan ignoré.")
        return None

    def connect(self) -> bool:
        if mt5 is None:
            logging.error("MT5 connector disabled (MetaTrader5 not available).")
            return False
            
        with self._lock:
            # We must pass the credentials to initialize() as well. 
            if self.login > 0 and self.password and self.server:
                init_res = mt5.initialize(login=self.login, password=self.password, server=self.server)
            else:
                init_res = mt5.initialize()

            if not init_res:
                logging.error(f"Echec initialisation MT5, code: {mt5.last_error()}")
                return False
                
            # mt5.initialize with credentials already authorizes the account.
            # Calling mt5.login() again immediately after hangs the terminal.
                    
        self.connected = True
        logging.info(f"Connecté à MT5 avec succès (Serveur: {self.server})")
        return True

    def disconnect(self) -> None:
        if mt5 is not None:
            with self._lock:
                mt5.shutdown()
        self.connected = False
        logging.info("MT5 déconnecté.")

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self.connected: return None
        
        with self._lock:
            mt5.initialize()
            info = mt5.account_info()
        if info is None: return None
        
        return AccountInfo(
            login=info.login,
            balance=info.balance,
            equity=info.equity,
            free_margin=info.margin_free,
            margin_level=info.margin_level,
            currency=info.currency,
            server=info.server
        )

    def get_symbol_info(self, symbol: str) -> Optional[Any]:
        if not self.connected: return None
        real_sym = self.resolve_symbol(symbol)
        if not real_sym: return None
        with self._lock:
            mt5.initialize()
            info = mt5.symbol_info(real_sym)
        return info

    def get_history_deals(self, from_date: Any, to_date: Any) -> Optional[Any]:
        if not self.connected: return None
        with self._lock:
            mt5.initialize()
            deals = mt5.history_deals_get(from_date, to_date)
        return deals

    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        if not self.connected: return []
        
        with self._lock:
            mt5.initialize()
            if symbol:
                positions = mt5.positions_get(symbol=symbol)
            else:
                positions = mt5.positions_get()
            
        if positions is None: return []
        
        return [
            PositionInfo(
                ticket=p.ticket,
                symbol=p.symbol,
                type=OrderType.BUY if p.type == mt5.POSITION_TYPE_BUY else OrderType.SELL,
                volume=p.volume,
                open_price=p.price_open,
                current_price=p.price_current,
                sl=p.sl,
                tp=p.tp,
                profit=p.profit,
                time=p.time,
                magic=p.magic,
                comment=getattr(p, "comment", "") or ""
            ) for p in positions
        ]

    def execute_order(self, symbol: str, order_type: OrderType, volume: float, sl: float = 0.0, tp: float = 0.0, magic: int = 0, comment: str = "") -> Optional[Dict[str, Any]]:
        if not self.connected: return None
        real_sym = self.resolve_symbol(symbol)
        if not real_sym:
            logging.error(f"[MT5Connector] Impossible d'exécuter l'ordre: symbole {symbol} non résolu")
            return None
        symbol = real_sym
        
        with self._lock:
            mt5.initialize()
            symbol_info = mt5.symbol_info(symbol)
            if symbol_info is None or not symbol_info.visible:
                logging.error(f"Symbol {symbol} non visible/invalide")
                return None
                
            # Sécurisation du volume : Clamp et Arrondi
            if volume < symbol_info.volume_min:
                logging.warning(f"[MT5Connector] Volume {volume} trop petit. Ajusté à {symbol_info.volume_min}")
                volume = symbol_info.volume_min
            elif volume > symbol_info.volume_max:
                logging.warning(f"[MT5Connector] Volume {volume} trop grand. Ajusté à {symbol_info.volume_max}")
                volume = symbol_info.volume_max
            
            # Arrondi selon le step autorisé (ex: 0.01)
            step = symbol_info.volume_step
            if step > 0:
                volume = round(volume / step) * step
                
            action_type = mt5.ORDER_TYPE_BUY if order_type == OrderType.BUY else mt5.ORDER_TYPE_SELL
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                logging.error(f"[MT5Connector] Impossible d'obtenir le tick pour {symbol}")
                return None
            price = tick.ask if order_type == OrderType.BUY else tick.bid
            
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": float(volume),
                "type": action_type,
                "price": price,
            "sl": float(sl),
            "tp": float(tp),
            "deviation": 20,
            "magic": magic,
            "comment": comment or "MarketShift SuperBot",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        with self._lock:
            mt5.initialize()
            result = mt5.order_send(request)
            
            # --- CORRECTION ANOMALIE : FALLBACK FOK ---
            # Si le broker refuse le remplissage IOC (code 10030), on retente en FOK
            if result.retcode == mt5.TRADE_RETCODE_INVALID_FILL:
                logging.warning(f"[MT5Connector] Remplissage IOC refusé sur {symbol} (Code 10030), fallback en FOK...")
                request["type_filling"] = mt5.ORDER_FILLING_FOK
                result = mt5.order_send(request)

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error(f"Erreur envoi ordre: {result.retcode} - {result.comment}")
            return None
            
        return {"ticket": result.order, "price": result.price, "volume": result.volume}

    def close_position(self, ticket: int) -> bool:
        if not self.connected: return False
        
        with self._lock:
            mt5.initialize()
            position = mt5.positions_get(ticket=ticket)
            if position is None or len(position) == 0:
                return False
                
            pos = position[0]
            order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
            tick = mt5.symbol_info_tick(pos.symbol)
            if tick is None:
                logging.error(f"[MT5Connector] Impossible d'obtenir le tick pour clôture de {pos.symbol}")
                return False
            price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": pos.volume,
            "type": order_type,
            "position": ticket,
            "price": price,
            "deviation": 20,
            "magic": pos.magic,
            "comment": "MarketShift Close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        # Mécanisme de Retry (jusqu'à 3 tentatives)
        for attempt in range(3):
            with self._lock:
                mt5.initialize()
                result = mt5.order_send(request)
                
            if result.retcode == mt5.TRADE_RETCODE_DONE:
                return True
                
            logging.error(f"[Retry {attempt+1}/3] Erreur clôture position {ticket}: {result.retcode} - {result.comment}")
            time.sleep(0.5)
            
        return False

    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        """Modifie le Stop Loss d'une position existante avec vérification du Stops Level."""
        if not self.connected: return False
        real_sym = self.resolve_symbol(symbol) or symbol
        symbol = real_sym

        # Mécanisme de Retry
        for attempt in range(3):
            with self._lock:
                mt5.initialize()
                symbol_info = mt5.symbol_info(symbol)
                position = mt5.positions_get(ticket=ticket)
                tick = mt5.symbol_info_tick(symbol)
                
                if symbol_info is None or not position or tick is None:
                    continue # On retente si l'API est lente
                    
                pos = position[0]
                min_dist = getattr(symbol_info, 'trade_stops_level', 0) * symbol_info.point
                
                # Ajustement de sécurité (StopsLevel protection)
                if pos.type == mt5.POSITION_TYPE_BUY:
                    if (tick.bid - new_sl) < min_dist:
                        new_sl = tick.bid - min_dist
                else:
                    if (new_sl - tick.ask) < min_dist:
                        new_sl = tick.ask + min_dist
                
                request = {
                    "action": mt5.TRADE_ACTION_SLTP,
                    "symbol": symbol,
                    "position": ticket,
                    "sl": round(float(new_sl), symbol_info.digits),
                    "tp": pos.tp  # Préserver le TP existant !
                }
                result = mt5.order_send(request)
                
            if result.retcode == mt5.TRADE_RETCODE_DONE:
                return True
                
            logging.error(f"[Retry {attempt+1}/3] Erreur modif SL position {ticket}: {result.retcode} - {result.comment}")
            time.sleep(0.5)

        return False

    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[pd.DataFrame]:
        """Récupère l'historique OHLCV (Open, High, Low, Close, Volume) pour un symbole donné"""
        if not self.connected or mt5 is None: 
            return None

        real_sym = self.resolve_symbol(symbol)
        if not real_sym:
            return None
            
        with self._lock:
            mt5.initialize()
            mt5.symbol_select(real_sym, True)
                
            rates = None
            for _ in range(3):
                rates = mt5.copy_rates_from_pos(real_sym, timeframe, 0, num_candles)
                if rates is not None and len(rates) > 0:
                    break
                time.sleep(0.05)
        
        if rates is None or len(rates) == 0:
            logging.debug(f"[MT5Connector] Aucune donnée reçue pour {real_sym} ({symbol})")
            return None
            
        # Conversion en DataFrame Pandas
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        return df

