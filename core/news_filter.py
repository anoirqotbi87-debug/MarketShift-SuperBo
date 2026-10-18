import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
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

    def get_currencies_for_symbol(self, symbol: str) -> List[str]:
        """Extrait les devises associées à un symbole de trading."""
        currencies = []
        sym_clean = symbol.upper().replace("#", "").replace(".", "").replace("MICRO", "").replace("CASH", "")
        for curr in ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF"]:
            if curr in sym_clean:
                currencies.append(curr)
        # Actifs cotés en USD (Cryptos, Or, Argent, Pétrole, Indices US)
        if any(c in sym_clean for c in ["BTC", "ETH", "SOL", "XAU", "GOLD", "SILVER", "XAG", "OIL", "WTI", "US30", "US100", "US500", "SPX", "NAS", "DJ30"]):
            if "USD" not in currencies:
                currencies.append("USD")
        # Actifs cotés en EUR (Indices Européens)
        if any(c in sym_clean for c in ["GER40", "DAX", "DE40"]):
            if "EUR" not in currencies:
                currencies.append("EUR")
        return currencies

    def get_affected_symbols_for_currency(self, currency: str, all_symbols: List[str]) -> List[str]:
        """Retourne la liste des symboles affectés par une devise donnée."""
        return [s for s in all_symbols if currency in self.get_currencies_for_symbol(s)]

    def get_detailed_events(self, all_symbols: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Retourne la liste détaillée et horodatée des annonces High Impact
        avec statut d'embargo précis pour chaque événement.
        """
        now = datetime.now(timezone.utc)
        symbols = all_symbols or [
            "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
            "EURGBP", "EURJPY", "GBPJPY", "GOLD", "XAUUSD", "SILVER", "USOIL",
            "US30", "US100", "US500", "GER40", "BTCUSD", "ETHUSD", "SOLUSD"
        ]
        results = []

        for item in self.news_events:
            news_time = item.get("parsed_date")
            if not news_time:
                continue

            window_start = news_time - self.pause_before
            window_end = news_time + self.pause_after
            time_until_sec = (news_time - now).total_seconds()
            time_until_min = round(time_until_sec / 60.0, 1)

            is_in_embargo = window_start <= now <= window_end
            
            if is_in_embargo:
                status = "IN_EMBARGO"
            elif now > window_end:
                status = "PASSED"
            else:
                status = "UPCOMING"

            currency = item.get("country", "")
            affected = self.get_affected_symbols_for_currency(currency, symbols)

            results.append({
                "id": f"{currency}_{item.get('date')}_{item.get('title')}".replace(" ", "_"),
                "title": item.get("title", "Annonce Inconnue"),
                "country": currency,
                "impact": item.get("impact", "High"),
                "date": item.get("date", ""),
                "timestampUtc": news_time.isoformat(),
                "timeUntilMinutes": time_until_min,
                "windowStartUtc": window_start.isoformat(),
                "windowEndUtc": window_end.isoformat(),
                "isInEmbargo": is_in_embargo,
                "status": status,
                "affectedSymbols": affected
            })

        # Trier chronologiquement
        results.sort(key=lambda x: x["timestampUtc"])
        return results

    def get_embargo_summary(self, all_symbols: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Retourne un résumé de l'état global de l'embargo macro pour le dashboard.
        """
        now = datetime.now(timezone.utc)
        symbols = all_symbols or [
            "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
            "EURGBP", "EURJPY", "GBPJPY", "GOLD", "XAUUSD", "SILVER", "USOIL",
            "US30", "US100", "US500", "GER40", "BTCUSD", "ETHUSD", "SOLUSD"
        ]
        events = self.get_detailed_events(symbols)

        active_events = [e for e in events if e["isInEmbargo"]]
        blocked_symbols = sorted(list(set(s for e in active_events for s in e["affectedSymbols"])))
        
        # Trouver la prochaine annonce future (status == UPCOMING)
        upcoming_events = [e for e in events if e["status"] == "UPCOMING"]
        next_event = upcoming_events[0] if upcoming_events else None

        return {
            "isAnyEmbargoActive": len(active_events) > 0,
            "activeEventsCount": len(active_events),
            "activeEvents": active_events,
            "blockedSymbols": blocked_symbols,
            "nextEvent": next_event,
            "totalHighImpactLoaded": len(self.news_events),
            "pauseBeforeMinutes": int(self.pause_before.total_seconds() // 60),
            "pauseAfterMinutes": int(self.pause_after.total_seconds() // 60),
            "lastFetchUtc": self.last_fetch.isoformat() if self.last_fetch else None,
            "serverTimeUtc": now.isoformat()
        }

    def is_news_embargo(self, symbol: str) -> bool:
        """
        Vérifie si on est actuellement dans la fenêtre de pause d'une news majeure
        qui concerne le symbole donné. Évite le spam de logs cycliques.
        """
        if not self.news_events:
            return False

        now = datetime.now(timezone.utc)
        currencies_to_check = self.get_currencies_for_symbol(symbol)
        if not currencies_to_check:
            return False

        for news in self.news_events:
            if news.get("country") in currencies_to_check:
                news_time = news.get("parsed_date")
                if not news_time:
                    continue
                window_start = news_time - self.pause_before
                window_end = news_time + self.pause_after
                
                if window_start <= now <= window_end:
                    time_until = (news_time - now).total_seconds() / 60.0
                    if time_until > 0:
                        logging.warning(
                            f"[NewsFilter] 🚨 EMBARGO ACTIF sur {symbol} : Annonce '{news['title']}' "
                            f"dans {time_until:.0f} mins ({news['country']}). Trades suspendus."
                        )
                    else:
                        logging.warning(
                            f"[NewsFilter] 🚨 EMBARGO ACTIF sur {symbol} : Annonce '{news['title']}' "
                            f"sortie il y a {abs(time_until):.0f} mins ({news['country']}). Trades suspendus."
                        )
                    return True
                    
        return False

