import MetaTrader5 as mt5
import pandas as pd
import datetime
from dotenv import load_dotenv
import os

def export_mt5_data_to_csv(symbol="EURUSD", timeframe=mt5.TIMEFRAME_M15, num_bars=50000):
    print(f"🔄 Initialisation de la connexion à MetaTrader 5...")
    
    # Charger les identifiants depuis .env
    load_dotenv()
    login = int(os.getenv("XM_LOGIN", 0))
    password = os.getenv("XM_PASSWORD", "")
    server = os.getenv("XM_SERVER", "")

    # Initialiser MT5
    if not mt5.initialize(login=login, password=password, server=server):
        print(f"❌ Échec de l'initialisation de MT5, erreur: {mt5.last_error()}")
        return

    print(f"✅ Connecté au compte {mt5.account_info().login} chez {mt5.account_info().company}")
    
    # S'assurer que le symbole est visible
    if not mt5.symbol_select(symbol, True):
        print(f"❌ Impossible de sélectionner le symbole {symbol}")
        mt5.shutdown()
        return

    print(f"📥 Téléchargement de {num_bars} bougies pour {symbol}...")
    
    # Récupérer les données historiques (copy_rates_from_pos récupère depuis 'maintenant' vers le passé)
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, num_bars)
    
    if rates is None or len(rates) == 0:
        print(f"❌ Aucune donnée récupérée, erreur: {mt5.last_error()}")
        mt5.shutdown()
        return

    # Convertir en DataFrame Pandas (Format Tableau)
    df = pd.DataFrame(rates)
    
    # Convertir le timestamp en format de date lisible
    df['time'] = pd.to_datetime(df['time'], unit='s')
    
    # Sauvegarder en fichier CSV
    filename = f"{symbol}_historical_data.csv"
    df.to_csv(filename, index=False)
    
    print(f"🎉 SUCCÈS ! Les données ont été sauvegardées dans le fichier : {filename}")
    print(f"📊 Vous pouvez maintenant importer ce fichier dans l'Auto-Optimizer de MarketShift.")
    
    mt5.shutdown()

if __name__ == "__main__":
    # Vous pouvez changer la paire ici (ex: BTCUSD, XAUUSD)
    export_mt5_data_to_csv(symbol="EURUSD", timeframe=mt5.TIMEFRAME_M15, num_bars=50000)
