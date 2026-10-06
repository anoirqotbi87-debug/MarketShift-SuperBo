# Mode Opératoire : Backtest & Monte Carlo

Ce document décrit la procédure stricte pour valider une stratégie avant son passage en production (Live / Paper Trading).

## 1. Le Framework de Backtest (Priorité 4)

Le module de backtest (`ml/backtest.py`) est conçu pour être **Event-Driven** (orienté événement), ce qui simule exactement les conditions du marché en temps réel et évite le biais de "look-ahead" (regarder dans le futur).

### Processus de Backtest Standard
1. **Extraction des Données :** Télécharger l'historique OHLCV 1M (Tick par Tick si possible) via MT5.
2. **Initialisation de l'Engine :** L'Engine de backtest charge la stratégie (ex: `EMACrossover`).
3. **Simulation :** L'Engine rejoue l'historique minute par minute.
4. **Frictions :** Intégration stricte du spread, du slippage (glissement) et des commissions du broker.

## 2. Validation de la Robustesse (Monte Carlo)

Un backtest simple ne suffit pas. Nous appliquons des simulations de **Monte Carlo** pour tester la stratégie sous contrainte.

### Les 3 Tests de Stress (Monte Carlo)
1. **Randomisation des Trades (Séquence) :** Mélanger l'ordre d'exécution des trades gagnants/perdants du backtest pour s'assurer que la stratégie survit à la pire série de pertes possible (Drawdown maximum).
2. **Bruit sur les Prix (Price Noise) :** Ajouter ou soustraire aléatoirement 1 à 3 pips à chaque tick historique. Si la stratégie s'effondre avec du bruit, elle est sur-optimisée (curve-fitted).
3. **Slippage Aléatoire :** Simuler des conditions de marché ultra-volatiles (NFP, CPI) en injectant un slippage aléatoire de 5 à 15 pips sur les entrées.

## 3. Déploiement Machine Learning (Filtre ML)

Le modèle Machine Learning (XGBoost/LightGBM) n'est **jamais utilisé pour générer des signaux**, mais uniquement pour les **filtrer** (Rôle d'Advisory).

1. La stratégie mathématique (ex: RSI) génère un signal d'Achat.
2. Le signal est passé au modèle ML.
3. Le modèle ML évalue la probabilité de succès en fonction des 10 dernières bougies, de la volatilité et de l'heure de la journée.
4. Si la confiance ML est `< 0.58` (défaut calibré sur l'accuracy du modèle ~62.7%, surchargeable dans `.env` via `ML_CONFIDENCE_THRESHOLD`), le trade est **bloqué**.
