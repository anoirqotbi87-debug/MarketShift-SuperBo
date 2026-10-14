# Runbook Opérationnel — Connecteur MetaApi Cloud (B-03)

> Dernière mise à jour : Phase T2 — `feat/T2-metaapi-cloud-connector`

---

## 1. Pourquoi MetaApi ?

MetaApi permet d'exécuter des ordres MT5 (XM, Exness…) **depuis n'importe quel serveur Linux/Cloud** sans avoir besoin d'un PC Windows ou de `MetaTrader5` installé localement. Le connecteur principal `MetaApiConnector` implémente `IBrokerConnector` et co-existe avec le connecteur local `MT5Connector` via le flag `BROKER_MODE`.

---

## 2. Créer un compte MetaApi et connecter un compte MT5

### 2.1 Création du compte Free Tier

1. Rendez-vous sur [https://app.metaapi.cloud](https://app.metaapi.cloud)
2. Inscrivez-vous avec votre email (compte Google accepté)
3. Choisissez le plan **Free** (1 compte MT5, 750h de streaming/mois)

### 2.2 Connecter un compte MT5 Demo (XM ou Exness)

1. Dans le tableau de bord MetaApi → **"Add account"**
2. Remplissez les champs :
   - **Platform** : `MetaTrader 5`
   - **Broker** : `XM Global` ou `Exness`
   - **Server** : ex. `XMGlobal-MT5Demo5` (Demo) ou `XMGlobal-MT5Real` (Réel)
   - **Login** / **Password** : identifiants MT5
3. Cliquez **"Add account"**
4. Attendez le statut **"DEPLOYED"** (30 s à 2 min)
5. Copiez l'`Account ID` affiché (format UUID)
6. Récupérez le **Token d'accès** dans **Settings → API Access Tokens**

> [!WARNING]
> Ne jamais copier le Token MetaApi dans le code source, README ou en clair dans Git.
> Injectez-le **exclusivement** via le fichier `.env` ou le tableau de bord "Comptes Broker".

---

## 3. Configuration locale (`.env`)

```dotenv
# Mode broker : "local_mt5" | "metaapi" | "hybrid"
BROKER_MODE=metaapi

# Token et Account ID MetaApi (jamais dans le code)
METAAPI_TOKEN=votre_token_ici
METAAPI_ACCOUNT_ID=votre_account_id_uuid_ici
METAAPI_REGION=vint-hill    # ou "new-york" selon votre broker

# Timeouts Cloud (B-02) — déjà configurés dans AppConfig
ORDER_EXECUTION_TIMEOUT_CLOUD=12.0
DATA_FETCH_TIMEOUT_CLOUD=15.0
```

Ou, via le tableau de bord MarketShift → onglet **"Comptes Broker"** → champ **MetaApi Token** et **Account ID**.

---

## 4. Limites du Free Tier & Économie de Crédits

| Ressource | Limite Free |
|---|---|
| Comptes MT5 connectés | 1 |
| Streaming actif | 750 h / mois |
| REST API calls | illimitées |
| Déploiements | illimités |

**Recommandations pour rester dans le Free Tier :**
- Utilisez `undeploy()` hors des heures de trading (appel via Dashboard ou API)
- Le connecteur utilise **RPC synchronisé** (cache état) — pas de polling REST excessif
- Activez `SIMULATION_MODE=True` en dehors des sessions de trading

---

## 5. Monitoring via `/status` → `execution_metrics`

Le collecteur M-15 expose dans `GET /status` :

```json
{
  "execution_metrics": {
    "avg_routing_latency_ms": 245.3,
    "last_routing_latency_ms": 231.0,
    "fill_rate_pct": 98.5,
    "avg_slippage_pips": 0.3,
    "pretrade_rejections": {
      "total": 2,
      "reasons": {"NO_SIGNAL": 1, "CIRCUIT_BREAKER": 1}
    }
  }
}
```

En mode `metaapi`, attendez des latences de **200–400 ms** (réseau Cloud vs. 10–50 ms en local).

---

## 6. Procédure de Failover → Mode Local MT5

Si MetaApi Cloud est indisponible :

```dotenv
# Dans .env — bascule immédiate sans redémarrage du serveur
BROKER_MODE=local_mt5
```

Ou, activer le mode `hybrid` pour failover automatique :

```dotenv
BROKER_MODE=hybrid
# MetaApiConnector sera Primary, MT5Connector sera Fallback automatique
```

Le `BrokerRouter` gère le failover transparent via `_switch_to_fallback()` et notifie via Telegram (`BROKER_FAILOVER`).

---

## 7. Sécurité — Règles Non Négociables

- **Stop Loss obligatoire (M-01)** : `MetaApiConnector.execute_order()` lève `ValueError` si `sl ≤ 0`
- **Clé API robuste (M-13)** : en `ENVIRONMENT=production` ou avec un compte réel, `API_SECRET_KEY` ≥ 32 caractères est exigée (fail-fast au démarrage)
- **Validation ticket (M-14)** : l'endpoint `/close` vérifie l'appartenance du ticket avant fermeture
- **Aucun secret dans Git** : `.env` est dans `.gitignore`, tokens uniquement via env vars

---

## 8. Vérification Post-Installation

```powershell
# 1. Vérifier la configuration
python -c "from infrastructure.config import Config; print(Config.BROKER_MODE)"

# 2. Vérifier l'import tolérant du connecteur
python -c "from infrastructure.metaapi_connector import MetaApiConnector, METAAPI_AVAILABLE; print('MetaApi disponible:', METAAPI_AVAILABLE)"

# 3. Lancer la suite de tests T2
pytest tests/test_broker_t2_metaapi_connector.py -v

# 4. Suite complète
pytest tests/ -v --tb=short
```
