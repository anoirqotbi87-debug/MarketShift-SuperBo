import pytest
import pandas as pd
import numpy as np
from strategies.smc_ict import SMCStrategy
from core.interfaces import OrderType

@pytest.fixture
def smc():
    return SMCStrategy()

def create_market_df(trend_type='bullish'):
    """
    Crée un DataFrame de 15 bougies minimum pour passer la validation de SMCStrategy.
    """
    # 15 bougies (0 à 14)
    # Bougies 0-10 : structuration (swing high/low)
    # Bougies 11-14 : action (FVG, MSS)
    
    # On initialise avec des valeurs plates
    data = {
        'time': pd.date_range(start='2026-07-25 12:00:00', periods=15, freq='1min'),
        'open': [1.0000] * 15,
        'high': [1.0005] * 15,
        'low':  [0.9995] * 15,
        'close':[1.0000] * 15,
        'tick_volume': [100] * 15
    }
    df = pd.DataFrame(data)
    
    if trend_type == 'bullish':
        # Bougies 0-10: Swing high = 1.0050, Swing low = 0.9950
        df.loc[5, 'high'] = 1.0050
        df.loc[5, 'low'] = 0.9950
        
        # FVG bullish entre i-2 et i (ex: entre 12 et 14)
        # c12(high)=1.0040, c14(low)=1.0060 -> gap = 20 pips
        df.loc[12, 'high'] = 1.0040
        df.loc[13, 'low'] = 1.0035  # middle candle
        df.loc[13, 'high'] = 1.0065
        df.loc[14, 'low'] = 1.0060
        
        # MSS bullish: c14(close) > swing_high (1.0050)
        df.loc[14, 'close'] = 1.0070
        
    elif trend_type == 'bearish':
        # Bougies 0-10: Swing high = 1.0050, Swing low = 0.9950
        df.loc[5, 'high'] = 1.0050
        df.loc[5, 'low'] = 0.9950
        
        # FVG bearish entre i-2 et i (12 et 14)
        # c12(low)=0.9940, c14(high)=0.9920
        df.loc[12, 'low'] = 0.9940
        df.loc[13, 'high'] = 0.9945 # middle candle
        df.loc[13, 'low'] = 0.9915
        df.loc[14, 'high'] = 0.9920
        
        # MSS bearish: c14(close) < swing_low (0.9950)
        df.loc[14, 'close'] = 0.9910
        
    return df

def test_analyze_bullish_smc(smc):
    df = create_market_df('bullish')
    smc.update_data(df)
    
    # Mock des pip_size et ATR pour simplifier (car la stratégie appelle get_pip_size)
    # SMCStrategy hérite de StrategyBase, on mock get_pip_size
    smc.get_pip_size = lambda x: 0.0001
    
    signal = smc.analyze("EURUSD")
    
    assert signal is not None
    assert signal.direction == OrderType.BUY
    assert signal.confidence == 0.92

def test_analyze_bearish_smc(smc):
    df = create_market_df('bearish')
    smc.update_data(df)
    
    smc.get_pip_size = lambda x: 0.0001
    
    signal = smc.analyze("EURUSD")
    
    assert signal is not None
    assert signal.direction == OrderType.SELL
    assert signal.confidence == 0.92

def test_analyze_no_trend(smc):
    # Marché plat, pas de signal
    df = create_market_df('flat')
    smc.update_data(df)
    
    smc.get_pip_size = lambda x: 0.0001
    
    signal = smc.analyze("EURUSD")
    
    # Doit retourner None
    assert signal is None
