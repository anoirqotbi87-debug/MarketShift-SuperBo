import logging
import threading

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
    def __init__(self, login: int, password: str, server: str):
        self.login = login
        self.password = password
        self.server = server
        self.connected = False
        self._lock = threading.Lock()

    def connect(self) -> bool:
        if mt5 is None:
            logging.error("MT5 connector disabled (MetaTrader5 not available).")
            return False
            
        with self._lock:
            if not mt5.initialize():
                logging.error(f"Echec initialisation MT5, code: {mt5.last_error()}")
                return False
                
            if self.login > 0 and self.password and self.server:
                authorized = mt5.login(self.login, password=self.password, server=self.server)
                if not authorized:
                    logging.error(f"Echec de connexion MT5 au compte {self.login}")
                    return False
                    
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

    def get_positions(self, symbol: Optional[str] = None) -> List[PositionInfo]:
        if not self.connected: return []
        
        with self._lock:
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
                magic=p.magic
            ) for p in positions
        ]

    def execute_order(self, symbol: str, order_type: OrderType, volume: float, sl: float = 0.0, tp: float = 0.0, magic: int = 0) -> Optional[Dict[str, Any]]:
        if not self.connected: return None
        
        with self._lock:
            symbol_info = mt5.symbol_info(symbol)
            if symbol_info is None or not symbol_info.visible:
                logging.error(f"Symbol {symbol} non visible/invalide")
                return None
                
            action_type = mt5.ORDER_TYPE_BUY if order_type == OrderType.BUY else mt5.ORDER_TYPE_SELL
            price = mt5.symbol_info_tick(symbol).ask if order_type == OrderType.BUY else mt5.symbol_info_tick(symbol).bid
            
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
            "comment": "MarketShift SuperBot",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        with self._lock:
            result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error(f"Erreur envoi ordre: {result.retcode} - {result.comment}")
            return None
            
        return {"ticket": result.order, "price": result.price, "volume": result.volume}

    def close_position(self, ticket: int) -> bool:
        if not self.connected: return False
        
        with self._lock:
            position = mt5.positions_get(ticket=ticket)
            if position is None or len(position) == 0:
                return False
                
            pos = position[0]
            order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
            price = mt5.symbol_info_tick(pos.symbol).bid if pos.type == mt5.POSITION_TYPE_BUY else mt5.symbol_info_tick(pos.symbol).ask
        
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
        
        with self._lock:
            result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error(f"Erreur clôture position: {result.retcode} - {result.comment}")
            return False
            
        return True

    def modify_position(self, ticket: int, symbol: str, new_sl: float) -> bool:
        """Modifie le Stop Loss d'une position existante."""
        if not self.connected: return False

        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": symbol,
            "position": ticket,
            "sl": float(new_sl)
        }

        with self._lock:
            result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error(f"Erreur modif SL position {ticket}: {result.retcode} - {result.comment}")
            return False

        return True

    def get_historical_data(self, symbol: str, timeframe: int, num_candles: int) -> Optional[pd.DataFrame]:
        """Récupère l'historique OHLCV (Open, High, Low, Close, Volume) pour un symbole donné"""
        if not self.connected: 
            return None
            
        with self._lock:
            # S'assurer que le symbole est visible dans le Market Watch
            mt5.symbol_select(symbol, True)
                
            # timeframe MT5 (ex: mt5.TIMEFRAME_M15)
            rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, num_candles)
        
        if rates is None or len(rates) == 0:
            logging.error(f"Impossible de récupérer l'historique pour {symbol}")
            return None
            
        # Conversion en DataFrame Pandas
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        return df

