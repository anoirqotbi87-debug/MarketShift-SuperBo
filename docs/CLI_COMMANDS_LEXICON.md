# 📚 SuperBot : Manuel CLI & Lexique Institutionnel

Ce document centralise toutes les commandes utilisables hors de l'interface graphique (en ligne de commande), ainsi que le lexique officiel du MarketShift SuperBot.

---

## 🛠️ Index des Commandes (CLI)

Toutes ces commandes doivent être exécutées depuis la racine du dossier `MarketShift-SuperBot`, après avoir activé l'environnement virtuel.

### 1. Démarrage
| Commande | Rôle |
|----------|------|
| `.\.venv\Scripts\activate` | Active l'environnement virtuel isolé (Indispensable avant toute autre commande). |
| `python main.py` | Lance le moteur complet du SuperBot (Engine + API FastAPI + Connexion MT5). |

### 2. Dépendances & Mise à jour
| Commande | Rôle |
|----------|------|
| `pip install -r requirements.txt` | Installe ou met à jour les bibliothèques requises par le bot. |
| `pip freeze > requirements.txt` | Sauvegarde les versions exactes des bibliothèques actuellement installées. |

### 3. API & Contrôle Manuel (Requêtes HTTP)
Si l'interface React n'est pas disponible, vous pouvez piloter le bot via l'API locale (Postman ou curl) :
| Méthode & Endpoint | Action |
|--------------------|--------|
| `GET http://127.0.0.1:8000/status` | Retourne l'état complet du bot (Positions, Balance, Statut des agents). |
| `POST http://127.0.0.1:8000/control` avec JSON `{"action": "kill"}` | Déclenche manuellement le Kill Switch global. |
| `POST http://127.0.0.1:8000/control` avec JSON `{"action": "pause"}` | Met le bot en pause (plus aucune prise de position). |

---

## 📖 Lexique SuperBot (Terminologie RTS 6 / Institutionnelle)

Pour bien piloter le bot, il est crucial de maîtriser ce vocabulaire de niveau institutionnel :

### A. Sécurité & Protection (Boucliers)
- **Kill Switch (Article 12 RTS 6) :** L'arme nucléaire de la gestion des risques. Lorsqu'il est déclenché, il coupe immédiatement la connexion aux algorithmes et envoie un ordre de marché massif pour fermer (liquider) **toutes** les positions ouvertes, sans exception.
- **Circuit Breaker :** Un coupe-circuit automatique basé sur le capital. Si la perte flottante journalière atteint le seuil critique (ex: `MAX_DAILY_LOSS_PCT = 5%`), le Circuit Breaker coupe le bot pour la journée.
- **OrderPreChecker (Sanity Check) :** Un Agent douanier. Avant qu'un ordre ne soit envoyé au broker, cet agent vérifie que l'ordre est logique (Le spread n'est-il pas trop grand ? Le volume est-il respecté ? Le margin level est-il sécuritaire ?).
- **SymbolBreachCounter :** Un compteur de "fraudes" ou d'erreurs pour un symbole spécifique (ex: EURUSD). Si EURUSD renvoie trop d'erreurs MT5 de suite, ce symbole est bloqué ("Blacklisté") pour éviter une hémorragie (Protection Knight Capital).

### B. Moteur Mathématique
- **Aggregator (Advisory Mode) :** Le cerveau décisionnel. Il récolte l'avis de toutes les stratégies (EMA, RSI, MACD). Si tout le monde est d'accord (Consensus Fort), il valide le signal. S'il y a conflit, il annule.
- **Kelly Criterion :** Formule mathématique utilisée par les hedge funds pour calculer la taille *parfaite* d'un lot (volume) à parier sur un trade, en fonction du taux de victoire historique du bot (Winrate) et de son ratio Gain/Perte.
- **Curve-fitting (Sur-optimisation) :** Le piège mortel en trading. C'est quand un bot est tellement optimisé pour le passé qu'il échoue lamentablement dans le futur. Nous combattons cela avec la simulation de Monte Carlo.

### C. Machine Learning
- **ML Confidence Threshold :** Le seuil de confiance exigé par l'IA. Si fixé à 0.58, cela signifie que le modèle de Machine Learning doit être sûr à 58% que le marché va monter pour autoriser un ordre d'achat. Valeur par défaut calibrée sur l'accuracy globale du modèle (~62.7%), surchargeable via `ML_CONFIDENCE_THRESHOLD` (global) ou `ML_CONFIDENCE_THRESHOLD_<SYMBOL>` (par symbole) dans `.env`.
- **Look-ahead Bias :** Erreur fatale en backtesting où l'algorithme "triche" en voyant une donnée du futur pour prendre une décision au présent. Notre architecture événementielle (Event-Driven) empêche cela.
