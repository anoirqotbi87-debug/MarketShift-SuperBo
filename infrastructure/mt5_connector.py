import MetaTrader5 as mt5
import logging
from typing import Optional, List, Dict, Any
import datetime

from core.interfaces import IBrokerConnector, AccountInfo, PositionInfo, OrderType

class MT5Connector(IBrokerConnector):
    def __init__(self, login: int, password: str, server: str):
        self.login = login
        self.password = password
        self.server = server
        self.connected = false

    def connect(self) -> bool:
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
        mt5.shutdown()
        self.connected = False
        logging.info("MT5 déconnecté.")

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self.connected: return None
        
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
        
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error(f"Erreur envoi ordre: {result.retcode} - {result.comment}")
            return None
            
        return {"ticket": result.order, "price": result.price, "volume": result.volume}

    def close_position(self, ticket: int) -> bool:
        if not self.connected: return False
        
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
        
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logging.error(f"Erreur clôture position: {result.retcode} - {result.comment}")
            return False
            
        return True
