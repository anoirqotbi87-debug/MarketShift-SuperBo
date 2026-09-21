"""
position_sizer.py — Calcul du volume optimal via le Critère de Kelly (Fractionnaire)

Formule de Kelly : f* = (p * b - q) / b
  p = taux de victoire (win rate)
  q = 1 - p (taux de défaite)
  b = ratio gain/perte moyen (reward / risk)

On utilise une fraction de Kelly de 25% pour rester prudent (Kelly fractionnaire).
Le volume est également plafonné à MAX_RISK_PER_TRADE_PCT du capital.
"""

import logging
from typing import List, Optional
from core.interfaces import Signal, AccountInfo


class PositionSizer:
    """
    Calcule la taille de position optimale selon le Critère de Kelly Fractionnaire.
    """

    KELLY_FRACTION = 0.25       # Utiliser 25% du Kelly complet (prudent)
    MIN_WIN_RATE = 0.40         # Win rate minimum pour trader (40%)
    DEFAULT_WIN_RATE = 0.50     # Win rate par défaut si pas assez de données
    DEFAULT_RR_RATIO = 1.5      # Risk/Reward par défaut
    MIN_VOLUME = 0.01           # Volume minimum (micro-lot)
    MAX_RISK_PCT = 0.02         # Max 2% du capital par trade
    MIN_HISTORY_TRADES = 20     # Nombre minimum de trades pour calculer le Kelly

    def __init__(self, db_session=None):
        self._trade_history: List[dict] = []
        self._win_rate: float = self.DEFAULT_WIN_RATE
        self._rr_ratio: float = self.DEFAULT_RR_RATIO
        self.db = db_session
        logging.info("[PositionSizer] Initialisé avec Kelly Fractionnaire (25%)")
        
        if self.db:
            # self._load_from_db() # Désactivé pour éviter de mélanger les comptes. L'Engine injectera l'historique MT5 réel au démarrage.
            pass

    def _load_from_db(self):
        try:
            from infrastructure.models import TradeRecord
            records = self.db.query(TradeRecord).filter(TradeRecord.profit != None).all()
            if records:
                self._trade_history = [{'pnl': r.profit} for r in records]
                self._recalculate_stats()
                logging.info(f"[PositionSizer] {len(records)} trades historiques chargés depuis la base de données.")
        except Exception as e:
            logging.error(f"[PositionSizer] Erreur lors du chargement de la base de données : {e}")

    def update_history(self, closed_trades: List[dict]) -> None:
        """
        Met à jour l'historique des trades fermés.
        Chaque trade doit avoir un champ 'pnl' (float).
        """
        self._trade_history = closed_trades
        self._recalculate_stats()

    def _recalculate_stats(self) -> None:
        """Recalcule le win rate et le ratio R/R à partir de l'historique."""
        if len(self._trade_history) < self.MIN_HISTORY_TRADES:
            logging.warning(
                f"[PositionSizer] Historique insuffisant ({len(self._trade_history)} trades). "
                f"DÉSACTIVATION DU KELLY. Utilisation du volume minimal de sécurité."
            )
            self._win_rate = 0.0 # Force le Kelly à 0
            self._rr_ratio = 1.0
            return

        winners = [t for t in self._trade_history if t.get('pnl', 0) > 0]
        losers  = [t for t in self._trade_history if t.get('pnl', 0) <= 0]

        if not winners or not losers:
            return

        self._win_rate = len(winners) / len(self._trade_history)

        avg_win  = sum(t['pnl'] for t in winners) / len(winners)
        avg_loss = abs(sum(t['pnl'] for t in losers) / len(losers))

        if avg_loss > 0:
            self._rr_ratio = avg_win / avg_loss

        logging.info(
            f"[PositionSizer] Stats recalculées — Win Rate: {self._win_rate:.1%} | "
            f"R/R: {self._rr_ratio:.2f} | Trades: {len(self._trade_history)}"
        )

    def compute_kelly_fraction(self) -> float:
        """
        Calcule la fraction de Kelly optimale.
        Retourne la fraction du capital à risquer (ex: 0.015 = 1.5%).
        """
        p = self._win_rate
        q = 1.0 - p
        b = self._rr_ratio

        if p < self.MIN_WIN_RATE:
            logging.warning(
                f"[PositionSizer] Win rate trop faible ({p:.1%} < {self.MIN_WIN_RATE:.1%}), "
                "sizing réduit au minimum."
            )
            return 0.005  # 0.5% du capital seulement

        raw_kelly = (p * b - q) / b
        raw_kelly = max(0.0, raw_kelly)  # Ne jamais être négatif

        fractional_kelly = raw_kelly * self.KELLY_FRACTION
        
        # --- NOUVEAU: Plancher de 1% pour forcer le trading actif ---
        capped_kelly = min(max(fractional_kelly, 0.01), self.MAX_RISK_PCT)

        logging.info(
            f"[PositionSizer] Kelly brut={raw_kelly:.3f} | "
            f"Kelly fractionnaire={fractional_kelly:.3f} | "
            f"Appliqué={capped_kelly:.3f} ({capped_kelly:.1%} du capital)"
        )
        return capped_kelly

    def compute_volume(
        self,
        signal: Signal,
        account: AccountInfo,
        pip_value: float = 10.0,
        sl_pips: Optional[float] = None,
        min_vol: float = 0.01,
        max_vol: float = 100.0,
        vol_step: float = 0.01
    ) -> float:
        """
        Calcule le volume de lots à trader.

        Args:
            signal: Le signal de trading
            account: Les informations du compte
            pip_value: Valeur d'un pip par lot standard (défaut: 10$ pour Forex majeurs)
            sl_pips: Stop Loss en pips (issu du calcul ATR). Si None, utilise un SL fixe de 20 pips.

        Returns:
            float: Le volume en lots
        """
        from decimal import Decimal, ROUND_DOWN
        
        kelly_pct = Decimal(str(self.compute_kelly_fraction()))
        # Si la balance renvoyée par le courtier est 0.0, on utilise l'équité
        base_capital = account.balance if account.balance > 0 else account.equity
        balance = Decimal(str(base_capital))
        capital_at_risk = balance * kelly_pct

        effective_sl_pips = Decimal(str(sl_pips if sl_pips and sl_pips > 0 else 20.0))
        d_pip_value = Decimal(str(pip_value))

        # Volume = Capital risqué / (SL en pips × Valeur du pip)
        if d_pip_value > Decimal('0') and effective_sl_pips > Decimal('0'):
            raw_volume = capital_at_risk / (effective_sl_pips * d_pip_value)
        else:
            raw_volume = Decimal(str(min_vol))

        # Arrondir selon vol_step
        step_d = Decimal(str(vol_step))
        if step_d > Decimal('0'):
            volume = (raw_volume / step_d).quantize(Decimal('1'), rounding=ROUND_DOWN) * step_d
        else:
            volume = raw_volume

        # Clamping (min_vol <= volume <= max_vol)
        d_min = Decimal(str(min_vol))
        d_max = Decimal(str(max_vol))
        
        # --- NOUVEAU: Bridage spécifique pour GOLDmicro ---
        if "GOLD" in signal.symbol.upper():
            d_max = min(d_max, Decimal('0.10'))
            
        volume = max(d_min, min(d_max, volume))
        
        volume = float(volume)  # Conversion finale pour MT5 qui attend un float

        logging.info(
            f"[PositionSizer] Signal={signal.source} | "
            f"Balance={account.balance:.2f} | "
            f"Capital risqué={capital_at_risk:.2f} ({kelly_pct:.1%}) | "
            f"SL={effective_sl_pips:.1f} pips | "
            f"Volume calculé={volume} lots"
        )
        return volume

    @property
    def win_rate(self) -> float:
        return self._win_rate

    @property
    def rr_ratio(self) -> float:
        return self._rr_ratio

    @property
    def trade_count(self) -> int:
        return len(self._trade_history)
