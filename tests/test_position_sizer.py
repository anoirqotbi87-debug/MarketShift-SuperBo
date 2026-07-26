import pytest
from application.position_sizer import PositionSizer
from core.interfaces import Signal, AccountInfo, OrderType

@pytest.fixture
def sizer():
    return PositionSizer()

@pytest.fixture
def dummy_signal():
    return Signal(
        symbol="EURUSD",
        direction=OrderType.BUY,
        confidence=0.9,
        source="test",
        timestamp="2026-07-25T12:00:00Z"
    )

@pytest.fixture
def dummy_account():
    return AccountInfo(
        login=123456,
        balance=10000.0,
        equity=10000.0,
        margin=0.0,
        free_margin=10000.0,
        margin_level=100.0,
        currency="USD",
        server="TestServer"
    )

def test_kelly_fraction_default(sizer):
    # Default is 50% win rate and 1.5 R/R
    # raw_kelly = (0.5 * 1.5 - 0.5) / 1.5 = 0.25 / 1.5 = 0.1666
    # fractional_kelly = 0.1666 * 0.25 = 0.0416
    # capped at MAX_RISK_PCT (0.02)
    fraction = sizer.compute_kelly_fraction()
    assert fraction == 0.02

def test_kelly_fraction_low_winrate(sizer):
    # If winrate is below MIN_WIN_RATE (0.40)
    # Generate 100 trades with 30% winrate
    trades = [{'pnl': 100.0} for _ in range(30)] + [{'pnl': -100.0} for _ in range(70)]
    sizer.update_history(trades)
    
    assert sizer.win_rate == 0.30
    # Should fallback to minimum sizing
    assert sizer.compute_kelly_fraction() == 0.005

def test_kelly_fraction_high_winrate(sizer):
    # 60% winrate, 2.0 RR
    trades = [{'pnl': 200.0} for _ in range(60)] + [{'pnl': -100.0} for _ in range(40)]
    sizer.update_history(trades)
    
    assert sizer.win_rate == 0.60
    assert sizer.rr_ratio == 2.0
    
    # raw_kelly = (0.6 * 2.0 - 0.4) / 2.0 = 0.8 / 2.0 = 0.4
    # fractional_kelly = 0.4 * 0.25 = 0.1
    # capped at 0.02
    fraction = sizer.compute_kelly_fraction()
    assert fraction == 0.02

def test_compute_volume(sizer, dummy_signal, dummy_account):
    # Default fraction is 0.02
    # Capital at risk = 10000 * 0.02 = 200
    # sl_pips = 20, pip_value = 10
    # raw_volume = 200 / (20 * 10) = 1.0 lot
    volume = sizer.compute_volume(dummy_signal, dummy_account, pip_value=10.0, sl_pips=20.0)
    assert volume == 1.0

def test_compute_volume_low_balance(sizer, dummy_signal):
    small_account = AccountInfo(
        login=123456,
        balance=100.0, # Very small balance
        equity=100.0,
        margin=0.0,
        free_margin=100.0,
        margin_level=100.0,
        currency="USD",
        server="TestServer"
    )
    # Fraction is 0.02
    # Capital at risk = 100 * 0.02 = 2.0
    # raw_volume = 2.0 / (20 * 10) = 0.01
    volume = sizer.compute_volume(dummy_signal, small_account, pip_value=10.0, sl_pips=20.0)
    assert volume == 0.01 # MIN_VOLUME
