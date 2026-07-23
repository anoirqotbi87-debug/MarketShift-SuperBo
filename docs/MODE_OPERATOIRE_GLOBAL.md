# Mode Opératoire Global - MarketShift SuperBot

Bienvenue dans la documentation officielle de **MarketShift SuperBot**. Ce bot est conçu selon les principes de l'Architecture Clean (Domain-Driven Design) pour garantir la robustesse institutionnelle, la scalabilité, et la rentabilité.

## 1. Architecture du Projet

Le projet est divisé en modules hermétiques :
- `core/` : Contient les interfaces de base, les entités abstraites, et les définitions de types. Aucune dépendance externe (MT5, FastAPI) ne doit se trouver ici.
- `infrastructure/` : Le seul endroit autorisé à communiquer avec le monde extérieur (Connecteur MetaTrader 5, Base de données SQLite/JSON, Chargement du `.env`).
- `application/` : Le chef d'orchestre (`StateManager`, `Engine`). Il coordonne l'infrastructure et la logique métier.
- `agents/` : L'implémentation de la conformité institutionnelle (RTS 6, Kill Switch, Data Validation).
- `strategies/` : L'implémentation mathématique des algorithmes (EMA, RSI, MACD).
- `ml/` : Les pipelines de Machine Learning (Entraînement, Validation, Backtest, Monte Carlo).
- `api/` : L'interface réseau (FastAPI) pour communiquer avec l'application mobile React (`PROV3.4os`).

## 2. Processus de Démarrage (Workflow)

1. **Chargement de l'environnement :** `infrastructure/config.py` charge le `.env` (XM ou Exness).
2. **Initialisation MT5 :** `infrastructure/mt5_connector.py` se connecte au terminal.
3. **Validation de Sécurité :** L'`OrderPreCheckerAgent` s'assure que le capital est suffisant et que les conditions de marché sont stables.
4. **Boucle Principale (Tick/Minute) :** Le `StateManager` récupère les prix.
5. **Machine Learning & Stratégies :** L' `Aggregator` demande aux stratégies si cest le moment d'acheter/vendre, puis passe le signal au filtre ML.
6. **Exécution :** Si tout est vert, l'ordre est envoyé. S'il y a le moindre problème, le `Kill Switch` est prêt à s'activer.

---
*Ce mode opératoire sera complété au fur et à mesure du développement des modules complexes (Backtest, Monte Carlo, etc).*
