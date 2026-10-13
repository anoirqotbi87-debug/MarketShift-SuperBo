# Spécification et Matrice de Sécurité de l'API MarketShift SuperBot

## 1. Principes Directeurs
- **Zero Trust** : Tous les endpoints modifiant la configuration, déclenchant des ordres, effectuant des ré-entraînements ML ou exécutant des tâches calculatoires (backtests/optimiseurs) requièrent obligatoirement une clé d'API valide via l'en-tête HTTP `X-API-Key` ou le paramètre WebSocket `?api_key=`.
- **Fail-Fast** : En environnement non-développement (`production`, `staging`), le démarrage du serveur ou l'accès aux endpoints mutateurs sans `API_SECRET_KEY` configurée est strictement interdit.
- **Protection DoS / Resource Exhaustion** : Les uploads de données de backtest et d'optimisation sont strictement limités à 20 Mo.

## 2. Matrice d'Authentification par Endpoint

| Méthode | Route | Rôle | Authentification Requise (`X-API-Key`) |
|---|---|---|---|
| `GET` | `/status` | État global du serveur & trading | Non (Lecture publique / Monitoring) |
| `GET` | `/kpi` | Métriques de performance | Non (Lecture publique) |
| `GET` | `/equity-curve` | Courbe d'équité historique | Non (Lecture publique) |
| `GET` | `/market-overview` | Snapshot de marché | Non (Lecture publique) |
| `GET` | `/symbols` | Liste des symboles surveillés | Non (Lecture publique) |
| `GET` | `/system-health` | Diagnostic santé système | Non (Lecture publique / Liveness) |
| `GET` | `/market-depth` | Données de carnet / spread | Non (Lecture publique) |
| `GET` | `/logs` | Logs récents de l'AuditTrail | Non (Lecture publique) |
| `GET` | `/optimize/status/{id}` | Statut d'un job d'optimisation | Non (Lecture par ID opaque) |
| `WS` | `/ws` | Flux temps réel WebSocket | **Oui** (`?api_key=` validée sur `API_SECRET_KEY`) |
| `POST` | `/control` | Démarrage, arrêt, kill-switch | **Oui** (`X-API-Key`) |
| `POST` | `/trade` | Exécution d'ordre manuel | **Oui** (`X-API-Key`) |
| `POST` | `/close` | Clôture d'une position active | **Oui** (`X-API-Key`) |
| `POST` | `/settings` | Modification des paramètres runtime | **Oui** (`X-API-Key`) |
| `POST` | `/apply-optimal-settings` | Application des réglages WFO au `.env` | **Oui** (`X-API-Key`) |
| `POST` | `/backtest` | Exécution d'un backtest historique (CSV) | **Oui** (`X-API-Key` + max 20 Mo) |
| `POST` | `/optimize` | Démarrage d'un job Grid Search | **Oui** (`X-API-Key` + max 20 Mo) |
| `POST` | `/ml/retrain` | Déclenchement de ré-entraînement ML | **Oui** (`X-API-Key`) |
| `GET` | `/brokers/accounts` | Liste des comptes enregistrés | **Oui** (`X-API-Key`) |
| `POST` | `/brokers/test` | Test de connexion broker | **Oui** (`X-API-Key`) |
| `POST` | `/brokers/connect` | Enregistrement/chiffrement compte | **Oui** (`X-API-Key`) |
| `POST` | `/brokers/switch` | Basculement de broker actif | **Oui** (`X-API-Key`) |
| `DELETE` | `/brokers/accounts/{id}` | Suppression de compte | **Oui** (`X-API-Key`) |
