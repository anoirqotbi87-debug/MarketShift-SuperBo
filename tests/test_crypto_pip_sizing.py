import unittest
import pandas as pd
from strategies.base import StrategyBase
from core.interfaces import OrderType

class TestCryptoPipSizing(unittest.TestCase):
    def test_pip_sizes(self):
        self.assertEqual(StrategyBase.get_pip_size("SOLUSD"), 0.01)
        self.assertEqual(StrategyBase.get_pip_size("ETHUSD"), 0.1)
        self.assertEqual(StrategyBase.get_pip_size("BTCUSD"), 1.0)
        self.assertEqual(StrategyBase.get_pip_size("EURUSD"), 0.0001)
        self.assertEqual(StrategyBase.get_pip_size("GOLD"), 0.1)

    def test_solana_sl_tp_realistic(self):
        class DummyStrategy(StrategyBase):
            def analyze(self, symbol):
                return None

        strat = DummyStrategy("TestStrat", sl_multiplier=2.5, tp_multiplier=2.5)
        # 20 bars of SOL data with ATR ~ 0.42
        df = pd.DataFrame({
            'high': [101.5 + 0.4] * 20,
            'low':  [101.5 - 0.4] * 20,
            'close': [101.5] * 20,
        })
        pip_size = StrategyBase.get_pip_size("SOLUSD")
        sl_pips, tp_pips, atr = strat.compute_sl_tp_pips(df, pip_size, symbol="SOLUSD")

        # ATR should be ~0.8
        # SL in USD should be sl_pips * pip_size
        sl_dist_usd = sl_pips * pip_size
        tp_dist_usd = tp_pips * pip_size

        # Verify SL distance in USD is sane (between 0.5$ and 5.0$, NOT 50.0$!)
        self.assertLess(sl_dist_usd, 6.0)
        self.assertGreater(sl_dist_usd, 0.4)
        self.assertLess(tp_dist_usd, 12.0)
        self.assertGreater(tp_dist_usd, 0.8)

if __name__ == '__main__':
    unittest.main()
