"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  GaugeCircle,
  Globe,
  HelpCircle,
  Landmark,
  Layers,
  LineChart,
  Newspaper,
  Radio,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SquareTerminal,
  Zap,
} from "lucide-react";
import type { DashboardView } from "./Sidebar";

interface UserGuideProps {
  onNavigate?: (view: DashboardView) => void;
}

type GuideSection = "quickstart" | "modules" | "risk" | "faq";

export default function UserGuide({ onNavigate }: UserGuideProps) {
  const [section, setSection] = useState<GuideSection>("quickstart");
  const [search, setSearch] = useState("");

  const sections = [
    { id: "quickstart" as const, label: "1. Démarrage Rapide", icon: Zap },
    { id: "modules" as const, label: "2. Guide des Modules (10 vues)", icon: Activity },
    { id: "risk" as const, label: "3. Sécurité & Risque", icon: ShieldCheck },
    { id: "faq" as const, label: "4. FAQ & Dépannage", icon: HelpCircle },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Bannière d'en-tête */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-800/40 bg-gradient-to-br from-zinc-900 via-zinc-950 to-cyan-950/30 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs font-semibold text-cyan-300">
              <BookOpen className="h-3.5 w-3.5" />
              DOCUMENTATION OFFICIELLE V2.0
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Mode Opératoire du SuperBot
            </h1>
            <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
              Guide complet d&apos;exploitation, architecture Multi-Timeframe (MTF), filtre macro ForexFactory et gestion du risque.
            </p>
          </div>

          {/* Recherche rapide */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Rechercher un concept, indicateur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
            />
          </div>
        </div>

        {/* Navigation des sous-sections du guide */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition ${
                  active
                    ? "bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20"
                    : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1 : DÉMARRAGE RAPIDE */}
      {section === "quickstart" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="card p-5 border-l-4 border-l-cyan-500">
              <span className="font-mono text-xs font-bold text-cyan-400">ÉTAPE 1</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-100">Ouvrir MetaTrader 5</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Lancez votre terminal XM ou Exness (<code className="text-zinc-300">terminal64.exe</code>). Le compte de trading doit être connecté avec le statut &quot;Trading algorithmique autorisé&quot; (icône verte).
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-violet-500">
              <span className="font-mono text-xs font-bold text-violet-400">ÉTAPE 2</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-100">Démarrer le Bot</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Double-cliquez sur <code className="text-zinc-300">lancer_app.bat</code> ou lancez <code className="text-zinc-300">.venv\Scripts\python.exe main.py</code>. L&apos;API FastAPI démarre sur le port 8000 et initialise le moteur dual-timeframe.
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-emerald-500">
              <span className="font-mono text-xs font-bold text-emerald-400">ÉTAPE 3</span>
              <h3 className="mt-2 text-sm font-bold text-zinc-100">Contrôler le Dashboard</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Accédez à <code className="text-zinc-300">http://localhost:3000</code> ou à votre URL Vercel. Vérifiez les indicateurs dans le Header : le voyant &quot;CONNECTÉ&quot; et le badge de statut &quot;MACRO LIBRE&quot;.
              </p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-200">
              <Server className="h-4 w-4 text-cyan-400" />
              Comprendre l&apos;Architecture Système
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
                <h4 className="font-mono text-xs font-bold uppercase text-emerald-400">
                  ⚙️ Le Moteur Backend (Python / Machine Locale ou VPS)
                </h4>
                <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span><b>Trading Loop Asyncio (2s) :</b> Analyse 5 symboles (EURUSD, GBPUSD, USDJPY, GOLD, BTCUSD) à haute fréquence.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span><b>Architecture Multi-Timeframe (MTF) :</b> Synchronise les bougies primaires (LTF) avec la tendance institutionnelle supérieure (HTF H1/H4).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span><b>Filtre Embargo ForexFactory :</b> Gèle automatiquement le trading ±30 minutes autour des annonces High Impact (rouges).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span><b>Consensus Institutionnel SMC + AMD :</b> Détecte Order Blocks, Fair Value Gaps et cycles Accumulation/Manipulation/Distribution.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span><b>Filtre IA (VETO Machine Learning) :</b> XGBoost + LSTM valident obligatoirement la direction avant tout passage d&apos;ordre.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
                <h4 className="font-mono text-xs font-bold uppercase text-cyan-400">
                  🖥️ L&apos;Interface Dashboard (Next.js / Vercel ou Local)
                </h4>
                <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span><b>Observabilité Zero-Latency :</b> Reçoit chaque tick, position, log et signal par WebSocket bidirectionnel.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span><b>Pilotage Hot-Reload des Profils :</b> Basculez instantanément entre Scalping M5, Day M15, MTF H1+M5 et Swing H1 avec sauvegarde atomique dans le fichier <code>.env</code>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span><b>Suivi Macroéconomique en Direct :</b> Calendrier complet des annonces économiques et statut d&apos;embargo par paire.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span><b>Télécommande d&apos;Urgence :</b> Kill Switch matériel, mise en pause et clôture totale des positions en un clic.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2 : GUIDE DÉTAILLÉ DES 9 MODULES */}
      {section === "modules" && (
        <div className="space-y-4">
          {[
            {
              id: "live" as DashboardView,
              title: "1. Live Monitoring (Surveillance Temps Réel)",
              icon: Activity,
              desc: "Centre névralgique du bot avec KPI financiers, courbe d'équité, statut macro et journal de télémétrie.",
              details: [
                "KpiGrid : Solde, Équité, Marge Libre, P&L Journalier, Ratio Win Rate et Expectancy.",
                "Courbe d'équité interactive : Vues 1 Jour (1D), 1 Mois (1M) et comparaison avec l'actif de référence.",
                "Télémétrie IA : Affiche les calculs du consensus, les détections SMC/AMD et les décisions de l'IA (accord ou Veto).",
                "Positions Ouvertes : Liste chaque position avec SL, TP, P&L flottant en USD et bouton de clôture rapide d'urgence.",
                "Header Status : Badge en direct 'MACRO LIBRE' ou 'EMBARGO NEWS [PAIRE]' indiquant l'état du filtre macroéconomique.",
                "Menu Déroulant Univers : Bouton compact 'Univers : X/21 Actifs' pour filtrer et basculer instantanément les actifs sans encombrer la barre supérieure.",
                "Bouton d'Urgence : Déclenche le Kill Switch immédiat (fermeture de tous les ordres et verrouillage des entrées).",
              ],
            },
            {
              id: "symbols" as DashboardView,
              title: "2. Univers Symboles & Actifs (Gestion de Portefeuille)",
              icon: Globe,
              desc: "Gérez votre univers de trading complet parmi les 21 actifs supportés avec filtres, recherche et switches réactifs.",
              details: [
                "Vue Dédiée et Menu Déroulant Header : Accédez à vos 21 actifs soit depuis la barre supérieure via le menu compact 'Univers : X/21 Actifs', soit via l'onglet dédié.",
                "Activation Instantanée Sans Rechargement : Cliquez sur le switch interactif d'un actif pour l'activer ou le désactiver immédiatement avec mise à jour optimiste et persistance atomique dans le fichier .env.",
                "Filtres par Catégorie : Onglets rapides Forex Majeurs, Forex Croisés, Matières Premières, Indices Boursiers et Cryptomonnaies.",
                "Actions Groupées : Boutons 'Tout Activer (21)', 'Tout Désactiver' et 'Activer la catégorie' pour adapter rapidement votre stratégie à l'ouverture des marchés.",
                "Indicateur d'Embargo ForexFactory : Tout symbole temporairement bloqué par une annonce High Impact affiche un badge clignotant 'EMBARGO NEWS'.",
              ],
            },
            {
              id: "analytics" as DashboardView,
              title: "3. Analytics & Calendrier Macro (Analytique Avancée)",
              icon: LineChart,
              desc: "Fournit une radiographie complète du marché et la surveillance des annonces économiques ForexFactory.",
              details: [
                "Sous-vue Marché (24h) : Prix actuels, variation en % sur 24h et sparklines pour les 5 symboles.",
                "Carnet d'Ordres (Depth) : Profondeur de marché DOM (Bid/Ask) visualisée par paliers de volume.",
                "Module Calendrier Macro & Embargo : Interroge le calendrier ForexFactory en temps réel et applique un embargo automatique de ±30 minutes autour des annonces High Impact.",
                "Liste des Actualités Filtrées : Affiche les événements de la semaine avec devises concernées, date/heure précise et statut d'embargo direct.",
                "Infra Monitor : Temps de réponse ping MT5 (en ms), débit requêtes/seconde et utilisation CPU/RAM du système.",
                "Répartition des Positions : Graphique circulaire de concentration des lots par symbole.",
              ],
            },
            {
              id: "ml" as DashboardView,
              title: "4. ML Engine (Intelligence Artificielle & Modèles)",
              icon: BrainCircuit,
              desc: "Supervise la précision, la latence et les inférences de l'intelligence artificielle.",
              details: [
                "État du modèle : Modèle entraîné (précision ~61.3% sur +24 000 échantillons réels).",
                "Prédiction Live : Testez un signal à la demande sur n'importe quel symbole (retourne la direction BUY/SELL/WAIT et le % de confiance).",
                "Feature Importances : Graphique des indicateurs ayant le plus fort impact décisionnel (RSI-14, ATR, EMA-Cross, OBV, etc.).",
                "Latence d'inférence ONNX : Mesure en direct le temps de prétraitement, d'inférence GPU/CPU et de post-traitement.",
                "Bouton Ré-entraîner : Permet de déclencher un ré-entraînement asynchrone du modèle sur l'historique récent.",
              ],
            },
            {
              id: "mt5" as DashboardView,
              title: "5. MT5 Bridge (Passerelle MetaTrader 5)",
              icon: Radio,
              desc: "Diagnostique la liaison matérielle entre le bot Python et le terminal MetaTrader 5.",
              details: [
                "Statut de liaison : Affiche si l'IPC (Inter-Process Communication) MT5 est actif.",
                "Serveur de courtier : XMGlobal-MT5 9, Exness ou serveur de démo.",
                "Test Ping : Permet de tester la réactivité de la passerelle en temps réel.",
                "Protection des identifiants : Vos mots de passe restent chiffrés et ne sont jamais visibles en clair dans le frontend.",
              ],
            },
            {
              id: "brokers" as DashboardView,
              title: "6. Comptes Broker (Gestion Multi-Courtiers)",
              icon: Landmark,
              desc: "Basculez facilement entre différents comptes de trading et lancez le WebTrader.",
              details: [
                "Cartes de comptes : Vos comptes XM, Exness ou personnalisés sont listés avec leur type (DEMO ou REAL).",
                "Changement de courtier actif : Cliquez sur 'Activer' pour router instantanément les ordres vers un autre compte.",
                "Bouton WebTrader Direct : Ouvre le terminal officiel MetaTrader WebTrader avec votre serveur et login pré-remplis.",
                "Mode Cloud MetaApi : Compatible avec la Phase T2 pour trader sans ouvrir le terminal de bureau.",
              ],
            },
            {
              id: "config" as DashboardView,
              title: "7. Stratégies, Profils & MTF (Configuration Dynamique)",
              icon: Settings2,
              desc: "Sélectionnez vos profils de trading, ajustez les timeframes MTF et modifiez les paramètres sans redémarrer le bot.",
              details: [
                "Matrice des 4 Profils : Basculez en un clic entre Scalping M5, Day Trading M15, Institutional MTF (H1+M5 recommandé) et Swing Trading H1.",
                "Univers Étendu de 21 Actifs : Support complet sur 4 classes : Forex Majeurs & Crosses (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, EURGBP, EURJPY, GBPJPY), Métaux & Énergie (GOLD, XAUUSD, SILVER, USOIL), Indices (US30, US100, US500, GER40) et Cryptos (BTCUSD, ETHUSD, SOLUSD).",
                "Filtres par Catégorie & Recherche : Onglets 'Tous', 'Forex', 'Matières Premières', 'Indices', 'Cryptos' avec actions groupées 'Activer / Pause catégorie' et recherche instantanée.",
                "Sélecteurs de Symboles ON/OFF : Activez ou mettez en pause chaque actif individuellement (pilules scrollables dans le Header et grille responsive dans l'onglet Stratégies).",
                "Curseurs Timeframe : Réglez le Timeframe Primaire (LTF de M1 à H4) et le Timeframe Supérieur (HTF de M15 à D1).",
                "Toggle MTF Confluence : Active ou désactive le filtre de biais macroéconomique H1 sur les entrées LTF.",
                "Multiplicateurs SL/TP & Trailing : Ajustez dynamiquement vos multiplicateurs ATR et le suivi du profit.",
                "Sauvegarde Atomique .env : Les modifications sont immédiatement injectées dans le moteur en mémoire et écrites de façon atomique dans le fichier .env.",
              ],
            },
            {
              id: "grid" as DashboardView,
              title: "8. Grid Search (Optimiseur d'Hyperparamètres)",
              icon: GaugeCircle,
              desc: "Explorez des milliers de combinaisons de paramètres pour maximiser votre ratio de Sharpe.",
              details: [
                "Plages de recherche : ATR Min/Max, seuil de confiance ML, fraction Kelly et poids SMC/AMD.",
                "Fonction objectif : Maximisez le Ratio de Sharpe, le Profit Net ou le Ratio de Calmar.",
                "Heatmap interactive : Visualisez les zones de rentabilité optimale.",
                "Application en un clic : Cliquez sur 'Appliquer au robot' pour charger les meilleurs réglages directement dans le moteur.",
              ],
            },
            {
              id: "backtest" as DashboardView,
              title: "9. Backtest Studio (Simulation Historique)",
              icon: BarChart3,
              desc: "Testez vos stratégies sur des données passées avant de les déployer avec de l'argent réel.",
              details: [
                "Upload de CSV : Importez vos données M15 ou H1 exportées depuis MT5.",
                "Simulations intégrées : Testez instantanément sur 1 mois, 3 mois ou 1 an avec simulation Monte-Carlo.",
                "Stratégie vs Buy & Hold : Comparez la courbe du bot avec un simple achat passif.",
                "Export CSV : Téléchargez le rapport complet des résultats pour votre journal de trading.",
              ],
            },
            {
              id: "logs" as DashboardView,
              title: "10. Terminal Logs (Journal d'Événements Live)",
              icon: SquareTerminal,
              desc: "Console de développement affichant jusqu'à 200 logs avec recherche instantanée.",
              details: [
                "Filtres par niveau : ALL, INFO (vert), WARNING (jaune), ERROR (rouge), DEBUG (gris).",
                "Recherche textuelle : Tapez un symbole ('BTCUSD'), un module ('NewsFilter', 'Engine') ou une décision pour filtrer les lignes.",
                "Fusion WebSocket : Reçoit les nouveaux événements en direct dès qu'une action est exécutée par le bot.",
              ],
            },
          ].map((mod) => {
            const Icon = mod.icon;
            return (
              <div key={mod.id} className="card p-5 transition hover:border-zinc-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100">{mod.title}</h3>
                      <p className="text-xs text-zinc-400">{mod.desc}</p>
                    </div>
                  </div>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate(mod.id)}
                      className="inline-flex items-center gap-1.5 self-start rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-cyan-300 transition hover:bg-cyan-500/10 hover:border-cyan-700 sm:self-auto"
                    >
                      Ouvrir la vue
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <ul className="mt-4 grid grid-cols-1 gap-2 border-t border-zinc-800/60 pt-3 text-xs text-zinc-300 sm:grid-cols-2">
                  {mod.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 3 : SÉCURITÉ & RISQUE */}
      {section === "risk" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-5 border-l-4 border-l-rose-500">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <h3 className="text-sm font-bold text-zinc-100">Règle M-01 : Stop Loss Obligatoire</h3>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Le SuperBot intègre une règle de sécurité absolue : <b>aucun trade ne peut être envoyé au courtier sans Stop Loss strictement défini (&gt; 0)</b>. Si un calcul de SL échoue ou est manquant, l&apos;ordre est immédiatement annulé par le <code>PreTradeValidator</code>.
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-amber-500">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">Circuit Breaker &amp; Drawdown Journalier</h3>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Si la perte journalière dépasse le seuil de sécurité (par défaut 5%), le <b>Circuit Breaker</b> se déclenche automatiquement : toutes les positions en cours sont fermées et le trading est suspendu jusqu&apos;au lendemain 00:00 (rollover automatique).
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-rose-600">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-rose-400" />
                <h3 className="text-sm font-bold text-zinc-100">Règle M-02 : Embargo Macro ForexFactory (±30m)</h3>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Les annonces économiques majeures (CPI, NFP, taux des banques centrales) provoquent des écarts de spread et du slippage dévastateurs. Le bot suspend automatiquement les entrées <b>30 minutes avant et 30 minutes après</b> chaque annonce High Impact sur les devises concernées.
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-zinc-100">Règle M-03 : Confluence Multi-Timeframe (HTF Bias)</h3>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                En mode Institutional MTF, les signaux d&apos;entrée M5 sont systématiquement confrontés à la tendance H1 (EMA 20/50 et structure institutionnelle). Un signal d&apos;achat M5 est rejeté sans appel si le biais macro H1 est baissier, éliminant plus de 65% des faux signaux.
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-cyan-500">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-zinc-100">Filtre VETO Machine Learning</h3>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Même si l&apos;analyse technique institutionnelle (SMC + AMD) détecte un signal d&apos;achat ou de vente fort (ex: 95%), l&apos;Intelligence Artificielle analyse le contexte macro et peut opposer un <b>VETO ferme</b> si la probabilité statistique de réussite est inférieure au seuil de confiance (60%).
              </p>
            </div>

            <div className="card p-5 border-l-4 border-l-emerald-500">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Dimensionnement par Kelly Fractionnaire</h3>
              </div>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Le volume de chaque position n&apos;est jamais laissé au hasard. Le module <code>PositionSizer</code> utilise la formule de Kelly fractionnaire (25% du Kelly optimal) basée sur votre historique réel de Win Rate et de Risk/Reward pour maximiser la croissance tout en évitant la ruine statistique.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4 : FAQ & DÉPANNAGE */}
      {section === "faq" && (
        <div className="space-y-4">
          {[
            {
              q: "Comment fonctionnent les 4 profils de trading et le mode MTF ?",
              r: "Dans l'onglet 'Stratégies & Risque', vous pouvez choisir entre Scalping M5 (haute vélocité), Day Trading M15 (équilibre standard), Institutional MTF (recommandé : analyse H1 pour la tendance + entrée chirurgicale M5) et Swing Trading H1 (grands mouvements). En un clic, le profil met à jour la mémoire du bot et s'enregistre dans votre fichier .env.",
            },
            {
              q: "Comment activer ou mettre en pause un actif spécifique (Forex, Or, Indices, Cryptos) ?",
              r: "Vous disposez d'un univers étendu de 21 actifs organisés en 4 catégories (Forex, Matières Premières, Indices, Cryptos). Vous pouvez les piloter via les badges cliquables et scrollables dans le Header ou via la grille détaillée avec recherche et filtres de catégorie dans l'onglet 'Stratégies & Risque'. Cliquez sur un symbole pour le basculer entre 'ON' (Trading Actif) et 'OFF' (En Pause). La mise en pause bloque instantanément toute nouvelle entrée sur cet actif, tandis que vos positions existantes restent protégées par leurs SL/TP jusqu'à leur clôture.",
            },
            {
              q: "Pourquoi le statut indique-t-il 'EMBARGO NEWS' et bloque-t-il mes trades ?",
              r: "C'est une protection vitale contre les chocs de volatilité : si une annonce High Impact (rouge) figure sur ForexFactory, le bot bloque toute prise de position sur les devises concernées 30 minutes avant et après l'événement. Vous pouvez consulter les détails de l'annonce et l'heure de levée dans l'onglet 'Analytics' > sous-onglet 'Actualités & Embargo'.",
            },
            {
              q: "Mes modifications de paramètres dans le Dashboard sont-elles conservées au redémarrage ?",
              r: "Oui ! Toute modification validée via 'Sauvegarder les Paramètres' met à jour le moteur en direct (hot-reload en RAM) et est écrite de manière atomique dans le fichier .env sur le serveur grâce au module EnvWriter.",
            },
            {
              q: "Pourquoi le statut reste-t-il 'DÉCONNECTÉ' sur le Dashboard ?",
              r: "Vérifiez que votre backend Python est bien en cours d'exécution ('main.py' lancé sur le port 8000). Vérifiez également dans la boîte de connexion (icône en haut à droite) que votre URL est bien 'http://localhost:8000' et que votre 'API_SECRET_KEY' correspond à celle inscrite dans votre fichier .env.",
            },
            {
              q: "Comment puis-je surveiller mon bot depuis mon smartphone ?",
              r: "Votre site Vercel (ex: dashboard-two-psi-24.vercel.app) est accessible sur mobile. Pour que votre téléphone puisse communiquer avec le bot tournant sur votre PC, vous pouvez utiliser un tunnel sécurisé gratuit (comme Cloudflare Tunnel ou ngrok) et renseigner l'URL publique générée dans la boîte de connexion du Dashboard.",
            },
            {
              q: "Le bot tourne mais ne prend aucun trade, pourquoi ?",
              r: "C'est normal et sain : le bot attend la triple confluence : 1) Signal institutionnel SMC/AMD validé, 2) Accord du modèle IA (pas de VETO ML), 3) Biais HTF aligné si le mode MTF est actif, et 4) Absence d'embargo économique sur la paire.",
            },
            {
              q: "Que faire en cas d'urgence absolue sur le marché ?",
              r: "Cliquez sur le bouton rouge 'KILL SWITCH' situé tout en haut à droite du Dashboard. Le bot ferme immédiatement toutes les positions ouvertes chez le courtier et verrouille les nouvelles entrées.",
            },
          ].map((item, i) => (
            <div key={i} className="card p-4">
              <h4 className="flex items-start gap-2 text-xs font-bold text-zinc-100 sm:text-sm">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <span>{item.q}</span>
              </h4>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed pl-6">
                {item.r}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
