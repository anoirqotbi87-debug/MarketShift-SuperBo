"""
tests/test_mt5_symbol_resolution.py
Unit tests for MT5Connector symbol resolution and case-preservation.
"""
from unittest.mock import MagicMock, patch

from infrastructure.mt5_connector import MT5Connector


def make_mock_mt5(available_symbols: set):
    """Creates a mock mt5 module where only available_symbols exist."""
    mock = MagicMock()
    mock.initialize.return_value = True
    mock.symbol_select.return_value = True

    def symbol_info(sym):
        if sym in available_symbols:
            m = MagicMock()
            m.name = sym
            m.digits = 5 if "EUR" in sym else 3
            m.point = 0.00001 if "EUR" in sym else 0.001
            m.spread = 10
            return m
        return None

    mock.symbol_info.side_effect = symbol_info
    return mock


class TestMT5SymbolResolution:
    def test_resolve_exact_case_preserved_eurusdm(self):
        """a) resolve_symbol('EURUSDm') renvoie 'EURUSDm' et get_symbol_info('EURUSDm') réussit sans altérer la casse."""
        mock_mt5 = make_mock_mt5({"EURUSDm", "XAUUSDm"})
        with patch("infrastructure.mt5_connector.mt5", mock_mt5):
            connector = MT5Connector(login=12345, password="fake", server="Exness-MT5Trial16")
            connector.connected = True

            resolved = connector.resolve_symbol("EURUSDm")
            assert resolved == "EURUSDm", f"Expected 'EURUSDm', got '{resolved}'"
            assert "EURUSDm" in connector._resolved_symbols
            assert connector._resolved_symbols["EURUSDm"] == "EURUSDm"

            info = connector.get_symbol_info("EURUSDm")
            assert info is not None
            assert info.name == "EURUSDm"

    def test_resolve_gold_standard_and_cent(self):
        """b) resolve_symbol('GOLD') renvoie 'XAUUSDm' sur Standard et 'XAUUSDc' sur Cent."""
        # Standard server
        mock_standard = make_mock_mt5({"EURUSDm", "XAUUSDm"})
        with patch("infrastructure.mt5_connector.mt5", mock_standard):
            conn_std = MT5Connector(login=12345, password="fake", server="Exness-MT5Trial16")
            conn_std.connected = True
            res_gold_std = conn_std.resolve_symbol("GOLD")
            assert res_gold_std == "XAUUSDm", f"Standard expected 'XAUUSDm', got '{res_gold_std}'"

        # Cent server
        mock_cent = make_mock_mt5({"EURUSDc", "XAUUSDc"})
        with patch("infrastructure.mt5_connector.mt5", mock_cent):
            conn_cent = MT5Connector(login=12345, password="fake", server="Exness-MT5Real19")
            conn_cent.connected = True
            res_gold_cent = conn_cent.resolve_symbol("GOLD")
            assert res_gold_cent == "XAUUSDc", f"Cent expected 'XAUUSDc', got '{res_gold_cent}'"

    def test_resolve_eurusd_standard_and_cent(self):
        """c) resolve_symbol('EURUSD') renvoie 'EURUSDm' sur Standard et 'EURUSDc' sur Cent."""
        # Standard server
        mock_standard = make_mock_mt5({"EURUSDm", "XAUUSDm"})
        with patch("infrastructure.mt5_connector.mt5", mock_standard):
            conn_std = MT5Connector(login=12345, password="fake", server="Exness-MT5Trial16")
            conn_std.connected = True
            res_eur_std = conn_std.resolve_symbol("EURUSD")
            assert res_eur_std == "EURUSDm", f"Standard expected 'EURUSDm', got '{res_eur_std}'"

        # Cent server
        mock_cent = make_mock_mt5({"EURUSDc", "XAUUSDc"})
        with patch("infrastructure.mt5_connector.mt5", mock_cent):
            conn_cent = MT5Connector(login=12345, password="fake", server="Exness-MT5Real19")
            conn_cent.connected = True
            res_eur_cent = conn_cent.resolve_symbol("EURUSD")
            assert res_eur_cent == "EURUSDc", f"Cent expected 'EURUSDc', got '{res_eur_cent}'"

    def test_resolve_xauusdc_direct(self):
        """Verify exact case preservation for cent symbol XAUUSDc directly."""
        mock_cent = make_mock_mt5({"EURUSDc", "XAUUSDc"})
        with patch("infrastructure.mt5_connector.mt5", mock_cent):
            conn_cent = MT5Connector(login=12345, password="fake", server="Exness-MT5Real19")
            conn_cent.connected = True
            res = conn_cent.resolve_symbol("XAUUSDc")
            assert res == "XAUUSDc"
            info = conn_cent.get_symbol_info("XAUUSDc")
            assert info is not None
            assert info.name == "XAUUSDc"
