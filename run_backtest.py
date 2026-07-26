import argparse
import pandas as pd
import numpy as np
import logging
from application.backtester import Backtester

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def generate_synthetic_data(num_bars=1000):
    """
    Génère un historique synthétique (Random Walk) pour tester le backtester
    sans avoir besoin d'un historique MT5 massif.
    """
    logging.info(f"Génération de {num_bars} bougies synthétiques...")
    dates = pd.date_range(start='2026-01-01', periods=num_bars, freq='1min')
    
    # Random walk
    returns = np.random.normal(loc=0, scale=0.0005, size=num_bars)
    prices = 1.1000 * np.exp(np.cumsum(returns))
    
    # Création OHLC
    highs = prices + abs(np.random.normal(loc=0, scale=0.0002, size=num_bars))
    lows = prices - abs(np.random.normal(loc=0, scale=0.0002, size=num_bars))
    opens = np.roll(prices, 1)
    opens[0] = 1.1000
    
    df = pd.DataFrame({
        'time': dates,
        'open': opens,
        'high': highs,
        'low': lows,
        'close': prices,
        'tick_volume': np.random.randint(100, 1000, size=num_bars)
    })
    return df

def main():
    parser = argparse.ArgumentParser(description="Backtester MarketShift-SuperBot")
    parser.add_argument('--symbol', type=str, default='EURUSD', help='Symbole à backtester')
    parser.add_argument('--bars', type=int, default=5000, help='Nombre de bougies (synthétiques)')
    args = parser.parse_args()

    print(f"=== Lancement du Backtest ({args.symbol}) ===")
    
    df = generate_synthetic_data(num_bars=args.bars)
    
    tester = Backtester(initial_balance=10000.0)
    report = tester.run(df, args.symbol)
    
    print("\n" + "="*40)
    print("RAPPORT DE BACKTEST")
    print("="*40)
    
    if "error" in report:
        print(f"Erreur : {report['error']}")
    else:
        print(f"Capital Initial   : ${report['initial_balance']:,.2f}")
        print(f"Capital Final     : ${report['final_balance']:,.2f}")
        print(f"Net Profit        : ${report['net_profit']:,.2f}")
        print(f"Profit Factor     : {report['profit_factor']:.2f}")
        print(f"Win Rate          : {report['win_rate']:.1%}")
        print(f"Nombre de trades  : {report['total_trades']}")
        print(f"Max Drawdown      : {report['max_drawdown_pct']:.2f}%")
        print(f"Ratio de Sharpe   : {report['sharpe_ratio']:.2f}")
    print("="*40)

if __name__ == '__main__':
    main()
