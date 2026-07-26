import logging
import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from core.interfaces import Signal, OrderType, AccountInfo
from strategies.smc_ict import SMCStrategy
from application.position_sizer import PositionSizer
from ml.trainer import MLTrainer
from ml.predictor import MLPredictor

class BacktestOrder:
    def __init__(self, ticket: int, symbol: str, type: OrderType, volume: float, open_price: float, sl: float, tp: float, open_time: str):
        self.ticket = ticket
        self.symbol = symbol
        self.type = type
        self.volume = volume
        self.open_price = open_price
        self.sl = sl
        self.tp = tp
        self.open_time = open_time
        self.close_time = None
        self.close_price = None
        self.profit = 0.0
        self.is_open = True

class Backtester:
    """
    Simulateur de trading historique orienté événements (Event-Driven).
    Il parcourt le DataFrame ligne par ligne et simule les décisions de la stratégie et du ML.
    """
    def __init__(self, initial_balance: float = 10000.0, pip_value: float = 10.0):
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.pip_value = pip_value
        
        self.strategy = SMCStrategy()
        self.trainer = MLTrainer()
        self.predictor = MLPredictor(self.trainer)
        self.sizer = PositionSizer()
        
        self.orders: List[BacktestOrder] = []
        self.closed_trades: List[dict] = []
        self.equity_curve: List[float] = []
        
        # Le seuil ML par défaut est 0.60
        self.predictor.set_confidence_threshold(0.60)
        
    def run(self, df: pd.DataFrame, symbol: str) -> dict:
        logging.info(f"[Backtester] Lancement de la simulation sur {symbol} ({len(df)} bougies)...")
        
        if len(df) < 50:
            logging.error("[Backtester] Pas assez de données pour backtester.")
            return {}

        # 1. Optionnel: Entraîner le ML sur le premier tiers des données pour avoir un modèle initial
        train_size = int(len(df) * 0.3)
        train_df = df.iloc[:train_size].copy()
        test_df = df.iloc[train_size:].copy().reset_index(drop=True)
        
        logging.info(f"[Backtester] Entraînement initial de l'IA sur {train_size} bougies...")
        self.trainer.train(train_df)
        
        order_counter = 1
        window_size = 50 # Fenêtre de données pour la stratégie et le ML
        
        logging.info(f"[Backtester] Début de la boucle temporelle sur {len(test_df)} bougies...")
        for i in range(window_size, len(test_df)):
            current_bar = test_df.iloc[i]
            history_window = test_df.iloc[i-window_size:i+1].copy()
            
            # --- Mise à jour de l'équité ---
            self.equity_curve.append(self.balance)
            
            # --- 1. Gestion des ordres ouverts (SL / TP) ---
            for order in self.orders:
                if not order.is_open:
                    continue
                    
                high = current_bar['high']
                low = current_bar['low']
                
                # Check Stop Loss / Take Profit
                close_trade = False
                close_price = 0.0
                
                if order.type == OrderType.BUY:
                    if low <= order.sl:
                        close_trade = True
                        close_price = order.sl
                    elif high >= order.tp:
                        close_trade = True
                        close_price = order.tp
                else: # SELL
                    if high >= order.sl:
                        close_trade = True
                        close_price = order.sl
                    elif low <= order.tp:
                        close_trade = True
                        close_price = order.tp
                        
                if close_trade:
                    order.is_open = False
                    order.close_time = current_bar['time'] if 'time' in current_bar else str(i)
                    order.close_price = close_price
                    
                    # Calcul du PnL
                    # Distance en pips = abs(open - close) * 10000 (simplifié Forex)
                    distance = abs(order.open_price - close_price) * 10000
                    profit = distance * order.volume * self.pip_value
                    
                    # Déterminer si c'est un gain ou une perte
                    if (order.type == OrderType.BUY and close_price > order.open_price) or \
                       (order.type == OrderType.SELL and close_price < order.open_price):
                        pass # profit est positif
                    else:
                        profit = -profit # perte
                        
                    order.profit = profit
                    self.balance += profit
                    self.closed_trades.append({'pnl': profit})
                    self.sizer.update_history(self.closed_trades)
                    
            # --- 2. Recherche de nouveaux signaux si aucun trade ouvert ---
            open_orders = [o for o in self.orders if o.is_open]
            if len(open_orders) == 0:
                self.strategy.update_data(history_window)
                signal = self.strategy.analyze(symbol)
                
                if signal:
                    # Filtre ML
                    filtered_signal = self.predictor.filter_signal(signal, history_window)
                    
                    if filtered_signal:
                        # Calcul du volume via Kelly
                        account = AccountInfo(login=1, balance=self.balance, equity=self.balance, free_margin=self.balance, margin_level=100.0, currency="USD", server="Test")
                        volume = self.sizer.compute_volume(filtered_signal, account, pip_value=self.pip_value, sl_pips=filtered_signal.sl_pips)
                        
                        # Exécution de l'ordre (au prix de clôture de la bougie actuelle)
                        open_price = current_bar['close']
                        sl_price = open_price - (filtered_signal.sl_pips / 10000) if signal.direction == OrderType.BUY else open_price + (filtered_signal.sl_pips / 10000)
                        tp_price = open_price + (filtered_signal.tp_pips / 10000) if signal.direction == OrderType.BUY else open_price - (filtered_signal.tp_pips / 10000)
                        
                        new_order = BacktestOrder(
                            ticket=order_counter,
                            symbol=symbol,
                            type=signal.direction,
                            volume=volume,
                            open_price=open_price,
                            sl=sl_price,
                            tp=tp_price,
                            open_time=current_bar['time'] if 'time' in current_bar else str(i)
                        )
                        self.orders.append(new_order)
                        order_counter += 1

        # --- 3. Clôturer les trades restants à la fin ---
        last_price = test_df.iloc[-1]['close']
        for order in self.orders:
            if order.is_open:
                order.is_open = False
                distance = abs(order.open_price - last_price) * 10000
                profit = distance * order.volume * self.pip_value
                if (order.type == OrderType.BUY and last_price > order.open_price) or \
                   (order.type == OrderType.SELL and last_price < order.open_price):
                    pass
                else:
                    profit = -profit
                order.profit = profit
                self.balance += profit
                self.closed_trades.append({'pnl': profit})
                
        return self._generate_report(symbol)
        
    def _generate_report(self, symbol: str) -> dict:
        total_trades = len(self.orders)
        if total_trades == 0:
            return {"error": "Aucun trade exécuté."}
            
        winning_trades = [o for o in self.orders if o.profit > 0]
        losing_trades = [o for o in self.orders if o.profit <= 0]
        
        gross_profit = sum(o.profit for o in winning_trades)
        gross_loss = abs(sum(o.profit for o in losing_trades))
        net_profit = gross_profit - gross_loss
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 999.0
        
        win_rate = (len(winning_trades) / total_trades) * 100
        
        # Max Drawdown
        equity_series = pd.Series(self.equity_curve)
        rolling_max = equity_series.expanding().max()
        drawdown = (equity_series - rolling_max) / rolling_max
        max_drawdown_pct = abs(drawdown.min() * 100) # positif en pourcentage
        
        max_drawdown_dollar = (rolling_max - equity_series).max()
        
        # Sharpe Ratio (simplifié)
        returns = equity_series.pct_change().dropna()
        if returns.std() != 0:
            sharpe_ratio = (returns.mean() / returns.std()) * np.sqrt(252 * 24 * 60)
        else:
            sharpe_ratio = 0.0

        avg_win = gross_profit / len(winning_trades) if winning_trades else 0
        avg_loss = gross_loss / len(losing_trades) if losing_trades else 0

        # Construction de l'equity curve frontend
        eq_curve = []
        peak = self.initial_balance
        for i, eq in enumerate(self.equity_curve):
            if eq > peak: peak = eq
            dd_pct = ((peak - eq) / peak) * 100
            eq_curve.append({
                "bar": i,
                "date": f"Bar {i}",
                "equity": round(eq, 2),
                "peak": round(peak, 2),
                "drawdownPct": round(dd_pct, 2)
            })

        # Construction des trades
        trade_history = []
        eq_tracker = self.initial_balance
        for o in self.orders:
            eq_tracker += o.profit
            trade_history.append({
                "id": o.ticket,
                "date": str(o.open_time),
                "type": o.type.name,
                "entryPrice": round(o.open_price, 5),
                "exitPrice": round(o.close_price if o.close_price else 0.0, 5),
                "pnl": round(o.profit, 2),
                "pnlPct": round((o.profit / self.initial_balance) * 100, 2),
                "equityAfter": round(eq_tracker, 2),
                "drawdownPct": 0.0,
                "reason": "Signal SMC+ML"
            })

        return {
            "symbol": symbol,
            "strategyName": "SMC + XGBoost WFO",
            "initialCapital": self.initial_balance,
            "finalCapital": round(self.balance, 2),
            "netProfit": round(net_profit, 2),
            "returnPct": round((net_profit / self.initial_balance) * 100, 2),
            "totalTrades": total_trades,
            "winningTrades": len(winning_trades),
            "losingTrades": len(losing_trades),
            "winRate": round(win_rate, 2),
            "profitFactor": round(profit_factor, 2),
            "sharpeRatio": round(sharpe_ratio, 2),
            "maxDrawdownPct": round(max_drawdown_pct, 2),
            "maxDrawdownDollar": round(max_drawdown_dollar, 2),
            "avgWin": round(avg_win, 2),
            "avgLoss": round(avg_loss, 2),
            "maxConsecutiveWins": 0,
            "maxConsecutiveLosses": 0,
            "equityCurve": eq_curve,
            "trades": trade_history,
            "sourceName": "CSV Backtest"
        }
