# MarketShift SuperBot 🤖📈

Bienvenue dans le dépôt officiel de **MarketShift SuperBot**, un algorithme de trading institutionnel combinant :
- **Smart Money Concepts (SMC) & ICT** : Détection des Fair Value Gaps (FVG) et Market Structure Shifts (MSS).
- **Intelligence Artificielle (Ensemble)** : Modèle Deep Learning (PyTorch LSTM) couplé à un arbre de décision gradient (XGBoost).
- **Architecture Asynchrone** : Zéro-latence pour l'exécution des ordres sur le marché via `asyncio`.
- **Gestion de Risque** : Kelly Criterion fractionnaire intégré, avec Stop Loss dynamiques basés sur l'ATR.

---

## 🚀 Mode Opératoire : Installation & Déploiement

Ce guide vous expliquera comment lancer le bot sur votre environnement local ou sur un serveur cloud (VPS) via Docker.

### Option 1 : Déploiement Local (Sans Docker)
Si vous souhaitez développer ou faire tourner le bot directement sur votre machine Windows avec MetaTrader 5 installé :

1. **Installer les dépendances :**
   ```bash
   pip install -r requirements.txt
   ```
2. **Configurer l'environnement :**
   Copiez le fichier `.env.example` vers `.env` et remplissez vos informations (API Key, Identifiants Broker).
3. **Lancer le backtester (Recommandé avant tout trading en direct) :**
   ```bash
   python run_backtest.py --symbol EURUSD --bars 5000
   ```
4. **Lancer le Bot en direct :**
   ```bash
   python main.py
   ```

---

### Option 2 : Déploiement Cloud (Docker & VPS)
*Idéal pour faire tourner la logique d'analyse, l'IA et le serveur API 24h/24.*

⚠️ **Attention / Limites :** MetaTrader 5 ne fonctionne nativement que sous Windows. Ce conteneur Docker (basé sur Linux) est conçu pour héberger l'**API Backend**, le **Backtester** et le **Moteur d'IA**. Il nécessitera un relais ou un VPS Windows si vous souhaitez y lier le terminal MT5 réel de production.

1. **Prérequis :** Avoir [Docker](https://www.docker.com/) et `docker-compose` installés sur votre serveur.
2. **Cloner le projet :**
   ```bash
   git clone https://github.com/anoirqotbi87-debug/MarketShift-SuperBot.git
   cd MarketShift-SuperBot
   ```
3. **Lancer le conteneur en arrière-plan :**
   ```bash
   docker-compose up -d
   ```
4. **Vérifier les logs du bot :**
   ```bash
   docker-compose logs -f
   ```
5. **Arrêter le bot :**
   ```bash
   docker-compose down
   ```

---

## 🧪 Tests Unitaires & CI/CD
Le projet intègre un framework de tests professionnels `pytest` pour garantir l'infaillibilité mathématique du code.
- Pour lancer les tests manuellement :
  ```bash
  pytest tests/ -v
  ```
- **CI/CD** : À chaque `push` sur la branche principale, GitHub Actions exécute automatiquement les tests. Aucun code altérant le Risk Manager ne pourra être déployé accidentellement.
