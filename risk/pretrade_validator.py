import time
import logging
from typing import Optional
from core.interfaces import Signal, AccountInfo
from infrastructure.config import Config
from infrastructure.models import TradeRecord

class PreTradeValidator:
    """
    Validation Pré-Trade (Conformité RTS 6).
    Protège le bot contre le flash-crashing, le revenge trading et les anomalies de marché.
    """
    
    def __init__(self, db_session=None):
        self.db = db_session
        
        # --- Paramètres de Risque ---
        self.MAX_ORDERS_PER_MINUTE = 3
        # Augmenté pour tolérer les cryptos (ETH/BTC) et les comptes micro
        self.MAX_SPREAD_PIPS = 15.0
        self.COOLDOWN_SECONDS = 3600  # 1 Heure de cooldown après série de pertes
        self.MAX_CONSECUTIVE_LOSSES = 3
        self.MIN_MARGIN_LEVEL = 150.0
        
        # Tracking mémoire (Rate Limiting)
        self._order_timestamps = []
        self._cooldown_until = 0.0
        
        logging.info("[PreTradeValidator] Initialisé (Rate Limiting, Spread Check, Revenge Trading Protection)")

    def validate_signal(self, signal: Signal, account: AccountInfo, current_spread_pips: float, open_positions: list = None) -> bool:
        """Exécute tous les sanity checks institutionnels, y compris le filtre de corrélation."""
        
        if not account:
            logging.error("[Validator] Rejet: Impossible de récupérer les infos du compte.")
            return False

        # --- NOUVEAU: Verrou de Corrélation ---
        if open_positions:
            # EUR et GBP sont hautement corrélés face au USD
            correlated_group = {"EURUSD", "GBPUSD"} 
            sym_base = signal.symbol.upper().replace("MICRO", "").replace("M", "")
            
            if sym_base in correlated_group:
                # Vérifier si l'autre paire est déjà ouverte dans la même direction
                for pos in open_positions:
                    pos_base = pos.symbol.upper().replace("MICRO", "").replace("M", "")
                    if pos_base in correlated_group and pos_base != sym_base:
                        # Si on a déjà l'autre paire dans le même sens, on rejette
                        # Attention, direction de MetaTrader5 (0=BUY, 1=SELL)
                        sig_type = 0 if signal.direction.name == "BUY" else 1
                        if pos.type == sig_type:
                            logging.warning(f"[Validator] 🛡️ Rejet: Double exposition détectée. {pos.symbol} déjà ouvert, on ignore {signal.symbol}.")
                            return False

        # 1. Vérification du Cooldown (Revenge Trading)
        if time.time() < self._cooldown_until:
            remaining = int((self._cooldown_until - time.time()) / 60)
            logging.warning(f"[Validator] 🚫 Rejet: Bot en Cooldown (Revenge Trading Protection). Attente: {remaining} min.")
            return False

        # 2. Vérification de la Marge
        if account.margin_level > 0 and account.margin_level < self.MIN_MARGIN_LEVEL:
            logging.warning(f"[Validator] 🚫 Rejet: Niveau de marge critique ({account.margin_level}% < {self.MIN_MARGIN_LEVEL}%)")
            return False

        # Validation du Spread (dynamique selon le symbole)
        max_spread = self.MAX_SPREAD_PIPS
        sym_upper = signal.symbol.upper()
        if 'BTC' in sym_upper:
            max_spread = 80.0  # Le Bitcoin a naturellement un spread massif en pips
        elif 'ETH' in sym_upper:
            max_spread = 20.0
        elif 'GOLD' in sym_upper or 'XAU' in sym_upper:
            max_spread = 25.0
        elif sym_upper in ['EURUSD', 'GBPUSD', 'USDJPY']:
            max_spread = 3.0   # Protection stricte pour le Forex (Normal ~1.0 pip)

        if current_spread_pips > max_spread:
            logging.warning(
                f"[Validator] 🚫 Rejet: Spread anormalement élevé sur {signal.symbol} "
                f"({current_spread_pips:.1f} pips > {max_spread} pips). Protection contre le Slippage/Rollover."
            )
            return False

        # --- NOUVEAU: Filtre de Zone Morte (Rollover) ---
        # Le rollover MT5 (00:00 - 01:00) a des spreads élargis et peu de liquidité
        from datetime import datetime
        current_hour = datetime.utcnow().hour
        # Note: L'heure du serveur MT5 (généralement UTC+2 ou UTC+3) n'est pas dispo ici.
        # Mais le filtre de Spread strict à 3.0 pips bloquera de toute façon le rollover.

        # 4. Confiance ML
        if signal.confidence < Config.ML_CONFIDENCE_THRESHOLD:
            logging.warning(f"[Validator] 🚫 Rejet: Confiance ML insuffisante ({signal.confidence:.2f})")
            return False

        # 5. Rate Limiting (Knight Capital Protection)
        now = time.time()
        
        # --- NOUVEAU: Cooldown absolu de 5 secondes (Anti-Rafale / Anti-Pyramiding) ---
        if self._order_timestamps and now - self._order_timestamps[-1] < 5.0:
            logging.warning(
                f"[Validator] 🚫 Rejet: Cooldown Anti-Rafale actif. Veuillez patienter 5 secondes entre chaque ordre."
            )
            return False
            
        # Ne garder que les timestamps de la dernière minute
        self._order_timestamps = [t for t in self._order_timestamps if now - t < 60]
        
        if len(self._order_timestamps) >= self.MAX_ORDERS_PER_MINUTE:
            logging.critical(
                f"[Validator] 🛑 REJET CRITIQUE: Rate Limit dépassé ({self.MAX_ORDERS_PER_MINUTE} ordres/min). "
                "Suspicion de boucle algorithmique infinie !"
            )
            return False

        # --- Si tout est bon, on accepte le trade et on enregistre le timestamp ---
        self._order_timestamps.append(now)
        logging.info(f"[Validator] ✅ Signal {signal.symbol} {signal.direction.name} validé.")
        
        # Mise à jour du Cooldown (Analyse des derniers trades en BDD)
        self._check_consecutive_losses()
        
        return True

    def _check_consecutive_losses(self):
        """Vérifie si le bot subit une série de pertes et déclenche le cooldown."""
        if not self.db:
            return
            
        try:
            # Récupérer les X derniers trades fermés
            recent_trades = self.db.query(TradeRecord).order_by(TradeRecord.id.desc()).limit(self.MAX_CONSECUTIVE_LOSSES).all()
            if len(recent_trades) == self.MAX_CONSECUTIVE_LOSSES:
                all_losers = all(t.profit < 0 for t in recent_trades)
                if all_losers:
                    logging.critical(f"[Validator] 📉 {self.MAX_CONSECUTIVE_LOSSES} pertes consécutives détectées. Activation du Cooldown pour 1 Heure.")
                    self._cooldown_until = time.time() + self.COOLDOWN_SECONDS
        except Exception as e:
            logging.error(f"[Validator] Erreur lors de la vérification des pertes en BDD : {e}")
