import { ArchitectureDocSection } from '../types';

export const ARCHITECTURE_SECTIONS: ArchitectureDocSection[] = [
  {
    id: 'sec-1',
    number: 1,
    title: 'Architecture Globale & Design Système',
    summary: 'Analyse comparative, recommandation d\'architecture Hybride Client-Serveur et flux de données en temps réel.',
    subsections: [
      {
        title: '1.1 Comparatif : Tout-en-un sur l\'Appareil vs. Architecture Client-Serveur',
        content: `Pour construire le meilleur bot de trading mobile-first, le choix architectural entre un traitement local sur le téléphone Android et une architecture distribuée (Client-Serveur) est crucial.

- **Approche Tout-en-un (On-Device)** :
  - *Avantages* : Aucune infrastructure serveur à payer, souveraineté totale des données sur le smartphone.
  - *Inconvénients majeurs* : La batterie d'un smartphone s'épuise très vite avec des calculs ML continus ; Android ferme fréquemment les processus en arrière-plan (Doze Mode) ce qui coupe les trades ; l'API native MetaTrader 5 (DLL Windows/C++) ne s'exécute pas nativement sur Android ARM sans émulation complexe.

- **Approche Client-Serveur Hybride (Recommandée)** :
  - *Architecture* : Le "Cerveau" du Bot (Collecteur de tics, moteur de signaux ML, gestionnaire de risque) tourne 24/7 sur un serveur VPS Linux basse latence à proximité des serveurs MT5 (ex: Londres LD4 ou Francfort NY4). L'application Android agit comme une **Tour de Contrôle Mobile Ultra-Réactive** (Client Lourd d'affichage et de pilotage).
  - *Bénéfices* : Latence d'exécution ultra-faible (<10ms), disponibilité 99.99%, zéro consommation excessive de batterie, notifications push instantanées via Firebase Cloud Messaging.`,
        highlights: [
          'VPS Linux dédié (Python 3.11 / PyTorch / ZeroMQ) proche du courtier MT5',
          'Application Android Kotlin / Jetpack Compose comme contrôleur temps réel',
          'Bridge MQL5 ZeroMQ / WebSockets pour l\'exécution des ordres',
          'Uptime garanti à 99.99% sans être impacté par la mise en veille Android'
        ]
      },
      {
        title: '1.2 Composants Principaux du Système',
        content: `Le système est découpé en 5 modules haute disponibilité à responsabilité unique :

1. **Market Data Collector (Serveur VPS)** : Récupère les flux Ticks et Bougies M1/M5/H1 en temps réel via l'API MT5 ou un socket WebSocket ZeroMQ.
2. **ML Signal Engine (Serveur VPS)** : Normalise les données, calcule les features techniques (RSI, ATR, Order Flow) et exécute l'inférence des modèles (XGBoost + LSTM).
3. **Risk & Circuit Breaker Engine (VPS + Android)** : Valide chaque signal avant envoi. Vérifie le drawdown du jour, la taille de position (Kelly), et contrôle le bouton d'urgence (Kill Switch).
4. **MT5 Order Router (Serveur VPS / EA MQL5)** : Transmet les ordres d'achat/vente avec Stop Loss et Take Profit garantis au terminal MT5.
5. **Android Control Hub (Mobile App)** : Affiche les métriques de performance en temps réel, pousse les notifications push d'alerte, permet de modifier les paramètres de risque et déclenche le mode Paper Trading / Réel.`,
        codeSnippet: {
          language: 'json',
          caption: 'Schéma du Flux de Données Système (JSON Schema)',
          code: `{
  "system_pipeline": {
    "step_1_market_tick": "MT5 Broker -> MQL5 ZeroMQ EA -> VPS Python Engine (Latency < 2ms)",
    "step_2_feature_pipeline": "Tick/Bar -> Technical Features + OrderBook -> Tensor (Latency < 3ms)",
    "step_3_ml_inference": "ONNX Runtime (XGBoost + LSTM) -> Signal (BUY/SELL, Prob=0.87)",
    "step_4_risk_validation": "Check Daily Loss < 3% && Margin OK -> Calculate Kelly Lot (Latency < 1ms)",
    "step_5_order_execution": "Order Router -> MT5 TradeSend -> Fill Confirmation (Latency < 8ms)",
    "step_6_android_sync": "WebSocket / FCM Push -> Android Kotlin App State Updated (Latency < 40ms)"
  }
}`
        }
      }
    ]
  },
  {
    id: 'sec-2',
    number: 2,
    title: 'Choix Technologiques (Tech Stack)',
    summary: 'Stack technique haut de gamme : Python pour le ML/VPS, Kotlin/Jetpack Compose pour Android, et ZeroMQ pour le bridge MT5.',
    subsections: [
      {
        title: '2.1 Backend / Logique Métier',
        content: `Le backend d'exécution et de prédiction est développé en **Python 3.11** hébergé sur un serveur VPS sous Debian Linux.

- **Pourquoi Python sur le backend VPS ?**
  Python est le standard incontesté pour le Machine Learning et le Data Science (PyTorch, XGBoost, Scikit-Learn, Pandas, ONNX).
- **Déploiement Android Mobile** :
  Bien que le backend lourd soit sur le VPS, pour le mode local hors-ligne ou les tests embarqués sur Android, nous compilons les modèles ML au format **ONNX Runtime Mobile** accessible directement en Kotlin via la librairie \`onnxruntime-android\`.`,
        highlights: [
          'Backend : Python 3.11, FastAPI, AsyncIO, PyTorch, XGBoost',
          'Inference Engine : ONNX Runtime C++ / Python (Inférence < 2ms)',
          'Android Native : Kotlin, Coroutines, Flow, Jetpack Compose'
        ]
      },
      {
        title: '2.2 Base de Données & Persistence',
        content: `La gestion des données repose sur un stockage à deux niveaux :

- **Sur l'Application Android (Client Mobile)** :
  - **Room Database (SQLite)** : Stockage des journaux de trades locaux, des configurations utilisateur, des caches de métriques et des préférences.
  - **EncryptedSharedPreferences (Android Keystore)** : Stockage hautement sécurisé des clés d'API et identifiants MT5 chiffrés en AES-256-GCM.
- **Sur le Backend VPS** :
  - **TimescaleDB (PostgreSQL)** : Base de données temporelle optimisée pour stocker des millions de Ticks et chandeliers historiques.
  - **Redis** : Cache en mémoire ultra-rapide pour les cours de bourse en direct et l'état des positions.`,
        codeSnippet: {
          language: 'sql',
          caption: 'Schéma Table Trade History (Room SQL / PostgreSQL)',
          code: `CREATE TABLE trade_history (
    ticket BIGINT PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    trade_type VARCHAR(4) CHECK (trade_type IN ('BUY', 'SELL')),
    open_price DOUBLE PRECISION NOT NULL,
    close_price DOUBLE PRECISION,
    lots DOUBLE PRECISION NOT NULL,
    stop_loss DOUBLE PRECISION NOT NULL,
    take_profit DOUBLE PRECISION NOT NULL,
    pnl DOUBLE PRECISION,
    ml_confidence DOUBLE PRECISION,
    signal_reason TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);`
        }
      },
      {
        title: '2.3 Communication avec MetaTrader 5 (MT5 Bridge)',
        content: `Il existe deux méthodes principales pour faire communiquer le bot avec MT5 :

1. **Méthode A : Bibliothèque Python \`MetaTrader5\` (Si MT5 tourne sur le même VPS Windows)**
   - *Avantage* : Extrêmement simple à coder.
   - *Inconvénient* : Nécessite un serveur Windows (plus coûteux) ou l'exécution de Wine.

2. **Méthode B : Bridge ZeroMQ (MQL5 Expert Advisor + Socket TCP/WebSockets) - Recommandée**
   - Un Expert Advisor (EA) ultra-léger développé en **MQL5** tourne directement dans la plateforme MT5.
   - Il ouvre un serveur **ZeroMQ (ZMQ)** ou WebSocket.
   - Le backend Python / App Android envoie des requêtes JSON structurées (\`PUB/SUB\` pour les tics, \`REQ/REP\` pour les ordres).
   - *Avantage* : Latence minimale (<5ms), compatible VPS Linux/Windows, découplage total.`,
        codeSnippet: {
          language: 'mql5',
          caption: 'Extrait EA MQL5 (Bridge ZeroMQ / Order Routing)',
          code: `//+------------------------------------------------------------------+
//| MT5 MQL5 ZeroMQ Bridge Order Execution Listener                 |
//+------------------------------------------------------------------+
#include <Zmq/Zmq.mqh>

void OnTick() {
   // Publish current tick to Python/Android engine
   MqlTick last_tick;
   if(SymbolInfoTick(_Symbol, last_tick)) {
      string jsonTick = StringFormat("{\\"symbol\\":\\"%s\\",\\"bid\\":%.5f,\\"ask\\":%.5f,\\"time\\":%d}",
                                     _Symbol, last_tick.bid, last_tick.ask, last_tick.time);
      zmq_socket_send(pubSocket, jsonTick);
   }
}

bool ExecuteOrder(string symbol, int cmd, double lots, double sl, double tp) {
   MqlTradeRequest request={0};
   MqlTradeResult  result={0};
   
   request.action   = TRADE_ACTION_DEAL;
   request.symbol   = symbol;
   request.volume   = lots;
   request.type     = (cmd == 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   request.price    = (cmd == 0) ? SymbolInfoDouble(symbol, SYMBOL_ASK) : SymbolInfoDouble(symbol, SYMBOL_BID);
   request.sl       = sl;
   request.tp       = tp;
   request.deviation= 10;
   
   return OrderSend(request, result);
}`
        }
      }
    ]
  },
  {
    id: 'sec-3',
    number: 3,
    title: 'Modèles d\'Apprentissage Automatique (ML)',
    summary: 'Ensemble XGBoost + LSTM, calcul de probabilités calibrées, inférence ONNX et Stop Loss dynamique basé sur l\'ATR.',
    subsections: [
      {
        title: '3.1 Ensemble de Modèles ML (XGBoost + LSTM)',
        content: `Pour surpasser les stratégies basiques d'indicateurs techniques, nous combinons deux architectures complémentaires :

1. **XGBoost (Modèle Tabulaire)** :
   - *Features d'entrée* : RSI(14), MACD, ATR(14), Bandes de Bollinger, Ratio de déséquilibre du carnet d'ordres (Order Book Imbalance), Volatilité historique.
   - *Rôle* : Prédit la direction à très court terme (Achat/Vente/Neutre) avec un taux de précision élevé sur les caractéristiques tabulaires.

2. **LSTM / Transformer Temporal (Séries Temporelles)** :
   - *Features d'entrée* : Séquence glissante des 60 dernières bougies M1 (Prix de clôture, Volume Tick, Ampleur de mèche).
   - *Rôle* : Capte la dynamique de tendance contextuelle à plus long terme et filtre les faux cassures (Fakeouts).

3. **Inférence d'Ensemble** :
   - Un méta-classifieur combine les scores de probabilité des deux modèles.
   - Un trade n'est déclenché que si le score de confiance combiné dépasse un seuil strict (ex: **Confiance > 75%**).`,
        codeSnippet: {
          language: 'python',
          caption: 'Pipeline d\'Inférence Machine Learning (Python / PyTorch)',
          code: `import xgboost as xgb
import torch
import numpy as np

class MLTradingEnsemble:
    def __init__(self, xgb_model_path, lstm_model_path):
        self.xgb_model = xgb.Booster()
        self.xgb_model.load_model(xgb_model_path)
        self.lstm_model = torch.jit.load(lstm_model_path)
        self.lstm_model.eval()

    def predict_signal(self, tabular_features, sequence_candles):
        # 1. Prediction XGBoost
        dmatrix = xgb.DMatrix(np.array([tabular_features]))
        xgb_prob = self.xgb_model.predict(dmatrix)[0] # e.g. [p_sell, p_hold, p_buy]

        # 2. Prediction LSTM
        seq_tensor = torch.tensor([sequence_candles], dtype=torch.float32)
        with torch.no_grad():
            lstm_logits = self.lstm_model(seq_tensor)
            lstm_prob = torch.softmax(lstm_logits, dim=1).numpy()[0]

        # 3. Decision d'Ensemble Ponderee
        ensemble_prob = 0.6 * xgb_prob + 0.4 * lstm_prob
        signal_idx = np.argmax(ensemble_prob)
        confidence = ensemble_prob[signal_idx]

        signals = ['SELL', 'HOLD', 'BUY']
        return signals[signal_idx], float(confidence)`
        }
      },
      {
        title: '3.2 Intégration Concrète de la Gestion du Risque avec le ML',
        content: `Un modèle ML ne doit jamais passer un ordre sans gestion dynamique du risque :

- **Calcul Dynamic Stop Loss / Take Profit basé sur l'ATR (Average True Range)** :
  - $\\text{SL} = \\text{Prix d'entrée} \\pm (1.8 \\times \\text{ATR}_{14})$
  - $\\text{TP} = \\text{Prix d'entrée} \\mp (3.2 \\times \\text{ATR}_{14})$ (Ratio Risque/Rendement minimum de 1:1.77)
- **Taille de Lot basée sur la Formule du Critère de Kelly Modifié** :
  - $f^* = \\frac{p \\times b - q}{b} \\times \\text{Factor de sécurité (0.25)}$
  - Où $p$ est la confiance de la prédiction ML, $b$ est le ratio gain/perte, $q = 1-p$.
  - Si la confiance ML est de 82%, le lot est augmenté modérément dans la limite stricte de 1% du capital par trade.`,
        highlights: [
          'Calcul du Stop Loss adapté à la volatilité instantanée du marché (ATR)',
          'Dimensionnement de lot Kelly fractionné proportionnel à la confiance du modèle ML',
          'Ajustement automatique du Trailing Stop dès que le trade atteint 1.5x l\'ATR de gain'
        ]
      }
    ]
  },
  {
    id: 'sec-4',
    number: 4,
    title: 'Interface Utilisateur (UI/UX) Android Native',
    summary: 'Design mobile-first moderne sous Jetpack Compose, gestion du mode hors-ligne et notifications d\'urgence.',
    subsections: [
      {
        title: '4.1 Écrans Principaux & Ergonomie',
        content: `L'application Android est développée avec **Jetpack Compose** et respecte les lignes directrices Material Design 3 :

1. **Dashboard principal** :
   - Graphique interactif de la courbe d'équité (Equity Curve) avec suivi PnL en temps réel.
   - Jauge de statut du Bot (Actif / En Pause / Circuit Breaker Déclenché).
   - Liste déroulante des positions MT5 ouvertes avec boutons de clôture rapide en 1-tap.
2. **Centre d'Inférence ML** :
   - Graphique d'importance des fonctionnalités (Feature Importance).
   - Jauge de confiance en direct sur le symbole sélectionné (EURUSD, XAUUSD, BTCUSD).
3. **Module de Gestion du Risque & Sécurité** :
   - Sliders de réglage du Risque par Trade (0.5% à 2.0%), Perte Maximale Journalière (3%), et Stop Loss ATR.
   - Interrupteur général "Emergency Kill Switch".
4. **Console de Logs & Diagnostics MT5** :
   - Stream de logs filtrable par niveau d'urgence (INFO, MT5_EXEC, RISK_ALERT).`,
        highlights: [
          'UI Jetpack Compose fluide à 120Hz',
          'Mode Sombre (Dark Mode) optimisé pour les écrans OLED',
          'Widgets Android sur l\'écran d\'accueil pour suivre l\'équité sans ouvrir l\'app',
          'Notifications Push d\'urgence avec son d\'alerte personnalisé via Firebase Cloud Messaging'
        ]
      },
      {
        title: '4.2 Gestion des États de Connexion Réseau (Online / Offline)',
        content: `En cas de perte du réseau mobile (tunnel, métro, zone blanche) :
- L'application bascule instantanément en mode **Lecture Seule (Offline Mode)** sans planter.
- Les ordres manuels en attente sont mis en file d'attente sécurisée dans **Room DB** et synchronisés dès le rétablissement de la connexion via **Android WorkManager**.
- Le bot d'arrière-plan sur le VPS continue d'exécuter la stratégie sans être perturbé par l'état réseau du téléphone.`,
        codeSnippet: {
          language: 'kotlin',
          caption: 'Monitoring Réseau avec StateFlow (Kotlin Android)',
          code: `class NetworkMonitorRepository(private val context: Context) {
    private val connectivityManager = 
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    val isOnline: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override onAvailable(network: Network) { trySend(true) }
            override onLost(network: Network) { trySend(false) }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}`
        }
      }
    ]
  },
  {
    id: 'sec-5',
    number: 5,
    title: 'Sécurité et Gestion des Risques',
    summary: 'Chiffrement Android Keystore AES-256, mécanismes de Circuit Breaker et simulation Paper Trading.',
    subsections: [
      {
        title: '5.1 Stockage Sécurisé des Identifiants (Android Keystore)',
        content: `Les identifiants de connexion MetaTrader 5 (numéro de compte, mot de passe investisseur, serveur broker) et les clés d'API ne sont **jamais stockés en clair**.

- Utilisation d'**EncryptedSharedPreferences** s'appuyant sur l'**Android Keystore Hardware Security Module (HSM)**.
- Chiffrement symétrique **AES-256-GCM** avec clé maître générée dans la puce de sécurité du téléphone (Titan M ou équivalent ARM TrustZone).`,
        codeSnippet: {
          language: 'kotlin',
          caption: 'Chiffrement Android Keystore (Kotlin)',
          code: `val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val securePreferences = EncryptedSharedPreferences.create(
    context,
    "mt5_credentials_encrypted",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SKEY,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Sauvegarde securisee des identifiants MT5
securePreferences.edit().apply {
    putString("mt5_account", "84920412")
    putString("mt5_password", "SuperSecretPass123!")
    apply()
}`
        }
      },
      {
        title: '5.2 Algorithme de Circuit Breaker (Coupe-Circuit Automatique)',
        content: `Le système intègre un coupe-circuit d'urgence multi-niveaux pour protéger le capital contre le Krach boursier ou un disfonctionnement de l'algorithme :

- **Condition 1 (Drawdown Journalier)** : Si la perte cumulée de la journée atteint **3.0% du capital**, le bot clôture toutes les positions ouvertes et désactive tout nouveau trade pendant 24 heures.
- **Condition 2 (Perte Consécutive)** : Si 4 trades consécutifs se soldent par un Stop Loss, le bot passe automatiquement en mode pause et réclame une confirmation manuelle.
- **Condition 3 (Déconnexion MT5)** : Si la latence du ping MT5 dépasse 5000ms ou si le heartbeat est rompu pendant plus de 10 secondes, le bot annule les ordres en attente et verrouille le système.`,
        codeSnippet: {
          language: 'python',
          caption: 'Algorithme de Circuit Breaker (Python VPS / Risk Engine)',
          code: `class CircuitBreaker:
    def __init__(self, max_daily_loss_pct=3.0, max_consecutive_losses=4):
        self.max_daily_loss_pct = max_daily_loss_pct
        self.max_consecutive_losses = max_consecutive_losses
        self.consecutive_losses = 0
        self.daily_start_balance = 10000.0

    def check_safety(self, current_equity, daily_pnl):
        daily_loss_pct = (abs(daily_pnl) / self.daily_start_balance) * 100.0
        
        if daily_pnl < 0 and daily_loss_pct >= self.max_daily_loss_pct:
            return False, f"CIRCUIT BREAKER: Perte journaliere ({daily_loss_pct:.2f}%) >= Limite ({self.max_daily_loss_pct}%)"
            
        if self.consecutive_losses >= self.max_consecutive_losses:
            return False, f"CIRCUIT BREAKER: {self.consecutive_losses} pertes consecutives. Verification requise."

        return True, "SYSTEM_HEALTHY"`
        }
      },
      {
        title: '5.3 Mode Paper Trading (Simulation Intégrée)',
        content: `L'application propose un basculement instantané en 1-tap entre :
- **Paper Trading Mode** : Exécution sur un compte Demo MT5 ou simulation interne sans risque financier.
- **Real Trading Mode** : Exécution sur le compte Réel avec confirmation biométrique (Android Fingerprint / FaceID).`,
        highlights: [
          'Switch Demo / Réel ultra-sécurisé avec authentification biométrique obligatoire',
          'Calculateur de slippage et commissions réelles pour des simulations réalistes'
        ]
      }
    ]
  },
  {
    id: 'sec-6',
    number: 6,
    title: 'Déploiement, Surveillance et Maintenance',
    summary: 'Pipeline CI/CD, suivi de télémétrie en production avec Sentry et ré-entraînement continu des modèles ML.',
    subsections: [
      {
        title: '6.1 Pipeline de Déploiement CI/CD',
        content: `Le déploiement est automatisé via **GitHub Actions** :

1. **Mobile Android** :
   - À chaque push sur \`main\`, GitHub Actions exécute les tests unitaires (\`./gradlew test\`), compile le fichier \`app-release.aab\` signé avec la clé Keystore CI, et déploie l'application sur le canal **Google Play Console Internal Testing**.
2. **Backend VPS & Modèles ML** :
   - Déploiement automatisé du conteneur **Docker** sur le VPS Linux.
   - Invalidation du cache ONNX et rechargement à chaud (Hot-reload sans coupure de service).`,
        codeSnippet: {
          language: 'bash',
          caption: 'Extrait Pipeline GitHub Actions (.github/workflows/deploy.yml)',
          code: `name: Build & Deploy Android Bot Control Hub

on:
  push:
    branches: [ main ]

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up JDK 17
        uses: actions/setup-java@v3
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Build Release Bundle
        run: ./gradlew bundleRelease
      - name: Upload to Play Console Internal
        uses: rslota/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: \${{ secrets.PLAY_CONSOLE_JSON_KEY }}
          packageName: com.bottrading.mt5.ml
          releaseFiles: app/build/outputs/bundle/release/app-release.aab
          track: internal`
        }
      },
      {
        title: '6.2 Surveillance Télémétrique & Maintenance des Modèles ML',
        content: `Pour garantir la pérennité du bot en environnement réel :

- **Suivi des erreurs** : Intégration de **Sentry** (sur le backend Python) et **Firebase Crashlytics** (sur l'application Android).
- **Monitoring de dérive des modèles ML (Concept Drift)** :
  Le marché financier évolue constamment. Un script hebdomadaire évalue le F1-Score et la dérive de distribution des features (KS-test).
- **Walk-Forward Optimization** : Ré-entraînement automatique hebdomadaire du modèle XGBoost sur les 6 derniers mois de données pour s'adapter à la volatilité actuelle.`,
        highlights: [
          'Alertes instantanées Telegram / FCM en cas d\'anomalie de marché',
          'Sentry + Firebase Crashlytics pour zéro crash non détecté',
          'Ré-entraînement hebdomadaire des modèles avec Walk-Forward Backtesting'
        ]
      }
    ]
  }
];
