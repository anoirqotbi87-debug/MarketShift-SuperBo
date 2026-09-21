import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
import json
import urllib.request
from urllib.error import URLError

class NewsFilter:
    """
    Filtre Macro-Économique (News Filter).
    Se connecte à l'API publique de ForexFactory (FairEconomy) pour récupérer
    le calendrier économique de la semaine.
    Met en pause le trading autour des annonces à fort impact (Rouge).
    """
    
    URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    
    def __init__(self, pause_before_min: int = 30, pause_after_min: int = 30):
        self.pause_before = timedelta(minutes=pause_before_min)
        self.pause_after = timedelta(minutes=pause_after_min)
        self.news_events: List[Dict[str, Any]] = []
        self.last_fetch: datetime = datetime.min.replace(tzinfo=timezone.utc)
        self.is_running = False
        
    async def _fetch_loop(self):
        """Worker asynchrone pour mettre à jour le calendrier toutes les 4 heures."""
        self.is_running = True
        while self.is_running:
            try:
                await self.fetch_news()
            except Exception as e:
                logging.error(f"[NewsFilter] Erreur de récupération des news : {e}")
            
            # Attendre 4 heures avant la prochaine mise à jour
            await asyncio.sleep(4 * 3600)

    def start(self):
        """Démarre la boucle de récupération asynchrone."""
        if not self.is_running:
            asyncio.create_task(self._fetch_loop())
            logging.info(f"[NewsFilter] 📰 Démarreur asynchrone activé (Pause: -{self.pause_before.seconds//60}m / +{self.pause_after.seconds//60}m)")

    def stop(self):
        self.is_running = False

    def _download_news_sync(self):
        """Téléchargement synchrone via urllib (exécuté dans un thread séparé)."""
        req = urllib.request.Request(self.URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                return json.loads(response.read().decode())
            return None

    async def fetch_news(self):
        """Télécharge et parse le JSON du calendrier économique."""
        logging.info("[NewsFilter] 📥 Téléchargement du calendrier économique...")
        try:
            data = await asyncio.to_thread(self._download_news_sync)
            if data:
                # Filtrer uniquement les news High Impact
                high_impact_news = []
                for item in data:
                    if item.get("impact") == "High":
                        try:
                            # Le format est ISO 8601, ex: 2026-09-16T14:00:00-04:00
                            news_time = datetime.fromisoformat(item["date"]).astimezone(timezone.utc)
                            item["parsed_date"] = news_time
                            high_impact_news.append(item)
                        except Exception:
                            pass
                            
                self.news_events = high_impact_news
                self.last_fetch = datetime.now(timezone.utc)
                logging.info(f"[NewsFilter] ✅ {len(self.news_events)} annonces High Impact chargées pour cette semaine.")
            else:
                logging.error("[NewsFilter] ❌ Échec API News, réponse vide.")
        except Exception as e:
            logging.error(f"[NewsFilter] ❌ Erreur réseau lors du téléchargement : {e}")

    def is_news_embargo(self, symbol: str) -> bool:
        """
        Vérifie si on est actuellement dans la fenêtre de pause d'une news majeure
        qui concerne le symbole donné.
        """
        if not self.news_events:
            return False
            
        now = datetime.now(timezone.utc)
        
        # Extraire les devises du symbole (ex: EURUSD -> EUR, USD / BTCUSD -> USD)
        currencies_to_check = []
        if "USD" in symbol: currencies_to_check.append("USD")
        if "EUR" in symbol: currencies_to_check.append("EUR")
        if "GBP" in symbol: currencies_to_check.append("GBP")
        if "JPY" in symbol: currencies_to_check.append("JPY")
        if "CAD" in symbol: currencies_to_check.append("CAD")
        if "AUD" in symbol: currencies_to_check.append("AUD")
        if "NZD" in symbol: currencies_to_check.append("NZD")
        if "CHF" in symbol: currencies_to_check.append("CHF")
        
        # Si cryptos ou Gold, le USD est roi
        if symbol in ["BTCUSD", "ETHUSD", "XAUUSD", "GOLD"]:
            if "USD" not in currencies_to_check:
                currencies_to_check.append("USD")
                
        if not currencies_to_check:
            return False # Fallback si format inconnu
            
        for news in self.news_events:
            if news["country"] in currencies_to_check:
                news_time = news["parsed_date"]
                window_start = news_time - self.pause_before
                window_end = news_time + self.pause_after
                
                if window_start <= now <= window_end:
                    time_until = (news_time - now).total_seconds() / 60.0
                    if time_until > 0:
                        logging.warning(f"[NewsFilter] 🚨 EMBARGO: Annonce '{news['title']}' dans {time_until:.0f} mins pour {news['country']}.")
                    else:
                        logging.warning(f"[NewsFilter] 🚨 EMBARGO: L'annonce '{news['title']}' est sortie il y a {abs(time_until):.0f} mins ({news['country']}).")
                    return True
                    
        return False
