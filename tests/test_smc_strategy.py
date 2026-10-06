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
    Combinaison MSS + FVG + Order Block requise par la stratégie.
    """
    # 15 bougies (0 à 14)
    # Bougies 0-10 : structuration (swing high/low) + premier bloc OB
    # Bougies 11-14 : action (FVG, MSS)
    
    # Valeurs de fond : petites bougies légèrement baissières/plates non significatives
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
        
        # Order Block bullish : bougie baissière significative (10) puis 2 haussières (11, 12)
        df.loc[10, 'open'] = 1.0000
        df.loc[10, 'close'] = 0.9990
        df.loc[10, 'low'] = 0.9985
        df.loc[10, 'high'] = 1.0005
        df.loc[11, 'open'] = 0.9990
        df.loc[11, 'close'] = 1.0010
        df.loc[11, 'low'] = 0.9985
        df.loc[11, 'high'] = 1.0025
        df.loc[12, 'open'] = 1.0010
        df.loc[12, 'close'] = 1.0030
        df.loc[12, 'low'] = 1.0005
        df.loc[12, 'high'] = 1.0040
        
        # FVG bullish entre c11(low) et c13(high) : low(13)=1.0035 > high(11)=1.0025
        df.loc[13, 'low'] = 1.0035  # middle candle
        df.loc[13, 'high'] = 1.0065
        df.loc[14, 'low'] = 1.0060
        
        # MSS bullish: c14(close) > swing_high (1.0050)
        df.loc[14, 'close'] = 1.0070
        
    elif trend_type == 'bearish':
        # Bougies 0-10: Swing high = 1.0050, Swing low = 0.9950
        df.loc[5, 'high'] = 1.0050
        df.loc[5, 'low'] = 0.9950
        
        # Order Block bearish : bougie haussière significative (6) puis 2 baissières (7, 8)
        # (la fenêtre OB est recent[-10:-1] = indices 5..13)
        df.loc[6, 'open'] = 1.0000
        df.loc[6, 'close'] = 1.0010
        df.loc[6, 'low'] = 0.9995
        df.loc[6, 'high'] = 1.0020
        df.loc[7, 'open'] = 1.0010
        df.loc[7, 'close'] = 0.9995
        df.loc[7, 'low'] = 0.9985
        df.loc[7, 'high'] = 1.0015
        df.loc[8, 'open'] = 0.9995
        df.loc[8, 'close'] = 0.9980
        df.loc[8, 'low'] = 0.9975
        df.loc[8, 'high'] = 1.0000
        
        # FVG bearish entre c11(high) et c13(low) : high(13)=0.9920 < low(11)=0.9975
        df.loc[13, 'high'] = 0.9945  # middle candle
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
    assert signal.confidence == 0.95

def test_analyze_bearish_smc(smc):
    df = create_market_df('bearish')
    smc.update_data(df)
    
    smc.get_pip_size = lambda x: 0.0001
    
    signal = smc.analyze("EURUSD")
    
    assert signal is not None
    assert signal.direction == OrderType.SELL
    assert signal.confidence == 0.95

def test_analyze_no_trend(smc):
    # Marché plat, pas de signal
    df = create_market_df('flat')
    smc.update_data(df)
    
    smc.get_pip_size = lambda x: 0.0001
    
    signal = smc.analyze("EURUSD")
    
    # Doit retourner None
    assert signal is None
