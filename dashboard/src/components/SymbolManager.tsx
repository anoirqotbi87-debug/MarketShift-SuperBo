"use client";

import { useMemo, useState, useEffect } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  DollarSign,
  Filter,
  Flame,
  Globe,
  Layers,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Sliders,
  TrendingUp,
  Zap,
} from "lucide-react";

import { toggleSymbol, updateSettings } from "@/lib/api";
import type { WsSnapshot } from "@/types/trading";

interface SymbolManagerProps {
  snapshot: WsSnapshot;
}

interface SymbolMeta {
  symbol: string;
  name: string;
  category: "Forex Majeurs" | "Forex Croisés" | "Matières Premières" | "Indices" | "Cryptos";
  description: string;
  typicalSpread: string;
  pipUnit: string;
}

export const SYMBOL_METADATA: Record<string, SymbolMeta> = {
  EURUSD: { symbol: "EURUSD", name: "Euro / US Dollar", category: "Forex Majeurs", description: "Paire la plus liquide au monde, faible spread.", typicalSpread: "0.2 - 0.6 pips", pipUnit: "0.0001" },
  GBPUSD: { symbol: "GBPUSD", name: "Livre Sterling / US Dollar", category: "Forex Majeurs", description: "Forte volatilité intra-journalière, idéal sessions Londres/NY.", typicalSpread: "0.6 - 1.2 pips", pipUnit: "0.0001" },
  USDJPY: { symbol: "USDJPY", name: "US Dollar / Yen Japonais", category: "Forex Majeurs", description: "Sensible aux rendements des bons du Trésor US.", typicalSpread: "0.4 - 0.9 pips", pipUnit: "0.01" },
  AUDUSD: { symbol: "AUDUSD", name: "Dollar Australien / US Dollar", category: "Forex Majeurs", description: "Paire liée aux matières premières et à l'économie asiatique.", typicalSpread: "0.5 - 1.0 pips", pipUnit: "0.0001" },
  USDCAD: { symbol: "USDCAD", name: "US Dollar / Dollar Canadien", category: "Forex Majeurs", description: "Corrélation étroite avec les cours du pétrole brut.", typicalSpread: "0.8 - 1.5 pips", pipUnit: "0.0001" },
  USDCHF: { symbol: "USDCHF", name: "US Dollar / Franc Suisse", category: "Forex Majeurs", description: "Valeur refuge européenne par excellence.", typicalSpread: "0.7 - 1.4 pips", pipUnit: "0.0001" },
  NZDUSD: { symbol: "NZDUSD", name: "Dollar Néo-Zélandais / US Dollar", category: "Forex Majeurs", description: "Devise à rendement, corrélée aux exportations agricoles.", typicalSpread: "0.8 - 1.6 pips", pipUnit: "0.0001" },
  EURGBP: { symbol: "EURGBP", name: "Euro / Livre Sterling", category: "Forex Croisés", description: "Paire de range européen à volatilité modérée.", typicalSpread: "0.8 - 1.5 pips", pipUnit: "0.0001" },
  EURJPY: { symbol: "EURJPY", name: "Euro / Yen Japonais", category: "Forex Croisés", description: "Très dynamique en tendance avec de grands mouvements de pips.", typicalSpread: "0.8 - 1.8 pips", pipUnit: "0.01" },
  GBPJPY: { symbol: "GBPJPY", name: "Livre Sterling / Yen Japonais", category: "Forex Croisés", description: "Surnommée 'Le Dragon', volatilité maximale.", typicalSpread: "1.2 - 2.5 pips", pipUnit: "0.01" },
  GOLD:   { symbol: "GOLD",   name: "Or Métal Spot (XAUUSD)", category: "Matières Premières", description: "Hedge contre l'inflation et valeur refuge institutionnelle.", typicalSpread: "1.5 - 3.0 pips", pipUnit: "0.01" },
  XAUUSD: { symbol: "XAUUSD", name: "Or Spot Dollar", category: "Matières Premières", description: "Alias standardisé de l'Or selon les brokers.", typicalSpread: "1.5 - 3.0 pips", pipUnit: "0.01" },
  SILVER: { symbol: "SILVER", name: "Argent Spot (XAGUSD)", category: "Matières Premières", description: "Métal industriel et précieux à forte amplitude.", typicalSpread: "2.0 - 4.5 pips", pipUnit: "0.001" },
  USOIL:  { symbol: "USOIL",  name: "Pétrole WTI Brut Spot", category: "Matières Premières", description: "Baril de pétrole US, réagit aux stocks EIA et OPEP.", typicalSpread: "2.0 - 5.0 pips", pipUnit: "0.01" },
  US30:   { symbol: "US30",   name: "Dow Jones Industrial Average", category: "Indices", description: "Les 30 plus grandes capitalisations industrielles US.", typicalSpread: "1.5 - 3.5 pts", pipUnit: "1.0" },
  US100:  { symbol: "US100",  name: "Nasdaq 100 Tech", category: "Indices", description: "100 géants technologiques, réactivité extrême au scalping.", typicalSpread: "1.0 - 2.5 pts", pipUnit: "0.1" },
  US500:  { symbol: "US500",  name: "S&P 500 Index", category: "Indices", description: "Indice de référence mondial de Wall Street.", typicalSpread: "0.4 - 0.8 pts", pipUnit: "0.01" },
  GER40:  { symbol: "GER40",  name: "DAX 40 Index Allemagne", category: "Indices", description: "Leader de la zone Euro, session 09h00 - 17h30 Paris.", typicalSpread: "0.8 - 1.5 pts", pipUnit: "1.0" },
  BTCUSD: { symbol: "BTCUSD", name: "Bitcoin / US Dollar", category: "Cryptos", description: "Actif digital numéro 1, trading 24/7 selon les brokers.", typicalSpread: "15 - 35 $", pipUnit: "1.0" },
  ETHUSD: { symbol: "ETHUSD", name: "Ethereum / US Dollar", category: "Cryptos", description: "Plateforme Smart Contracts, haute volatilité crypto.", typicalSpread: "1.5 - 4.0 $", pipUnit: "0.1" },
  SOLUSD: { symbol: "SOLUSD", name: "Solana / US Dollar", category: "Cryptos", description: "Blockchain ultra-rapide, forte réactivité de momentum.", typicalSpread: "0.10 - 0.30 $", pipUnit: "0.01" },
};

const CATEGORIES = [
  "Tous",
  "Forex Majeurs",
  "Forex Croisés",
  "Matières Premières",
  "Indices",
  "Cryptos",
] as const;

export default function SymbolManager({ snapshot }: SymbolManagerProps) {
  const DEFAULT_AVAILABLE = Object.keys(SYMBOL_METADATA);
  const availableSymbols = snapshot.availableSymbols ?? DEFAULT_AVAILABLE;
  const activeSymbolsFromSnapshot = snapshot.activeSymbols ?? ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

  // État optimiste local pour une réactivité instantanée à chaque clic
  const [localActive, setLocalActive] = useState<string[]>(activeSymbolsFromSnapshot);
  const [togglingSym, setTogglingSym] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<typeof CATEGORIES[number]>("Tous");
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  // Synchronisation avec les snapshots backend distants
  useEffect(() => {
    if (snapshot.activeSymbols && snapshot.activeSymbols.length > 0) {
      setLocalActive(snapshot.activeSymbols);
    }
  }, [snapshot.activeSymbols]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Basculement individuel instantané avec mise à jour optimiste
  const handleToggle = async (sym: string) => {
    const isCurrentlyActive = localActive.includes(sym);
    const nextState = !isCurrentlyActive;

    // Mise à jour optimiste immédiate dans l'UI
    setLocalActive((prev) =>
      nextState ? (prev.includes(sym) ? prev : [...prev, sym]) : prev.filter((s) => s !== sym)
    );
    setTogglingSym(sym);

    try {
      const res = await toggleSymbol(sym, nextState);
      if (res && res.success) {
        if (res.activeSymbols) {
          setLocalActive(res.activeSymbols);
        }
        showToast(`Symbole ${sym} ${nextState ? "activé" : "mis en pause"} avec succès`);
      } else {
        // Rollback si le serveur a refusé
        setLocalActive((prev) =>
          isCurrentlyActive ? [...prev, sym] : prev.filter((s) => s !== sym)
        );
        showToast(`Échec de la modification pour ${sym}`, "error");
      }
    } catch {
      setLocalActive((prev) =>
        isCurrentlyActive ? [...prev, sym] : prev.filter((s) => s !== sym)
      );
      showToast(`Erreur réseau lors de l'envoi pour ${sym}`, "error");
    } finally {
      setTogglingSym(null);
    }
  };

  // Actions groupées (Tout Activer, Tout Désactiver, Activer par catégorie)
  const handleBatchToggle = async (targetSymbols: string[], enable: boolean) => {
    setBatchBusy(true);
    let newActiveList: string[];
    if (enable) {
      const set = new Set([...localActive, ...targetSymbols]);
      newActiveList = Array.from(set);
    } else {
      const targetSet = new Set(targetSymbols);
      newActiveList = localActive.filter((s) => !targetSet.has(s));
    }

    setLocalActive(newActiveList);

    try {
      const res = await updateSettings({ active_symbols: newActiveList });
      if (res && res.active_symbols) {
        setLocalActive(res.active_symbols);
        showToast(
          enable
            ? `✅ ${targetSymbols.length} symboles activés et synchronisés (.env)`
            : `⏸️ ${targetSymbols.length} symboles désactivés et synchronisés (.env)`
        );
      } else {
        showToast("Paramètres sauvegardés avec succès");
      }
    } catch {
      showToast("Erreur lors de la mise à jour groupée", "error");
    } finally {
      setBatchBusy(false);
    }
  };

  // Filtrage combiné : catégorie + recherche
  const filteredSymbols = useMemo(() => {
    return availableSymbols.filter((sym) => {
      const meta = SYMBOL_METADATA[sym] || {
        symbol: sym,
        name: sym,
        category: "Forex Majeurs",
        description: "",
      };

      if (selectedCategory !== "Tous" && meta.category !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSym = sym.toLowerCase().includes(q);
        const matchName = meta.name.toLowerCase().includes(q);
        const matchCat = meta.category.toLowerCase().includes(q);
        if (!matchSym && !matchName && !matchCat) return false;
      }

      return true;
    });
  }, [availableSymbols, selectedCategory, searchQuery]);

  const blockedSymbols = snapshot.macro?.blockedSymbols ?? [];
  const activeCount = localActive.length;
  const pausedCount = Math.max(0, availableSymbols.length - activeCount);
  const embargoCount = blockedSymbols.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Toast de notification flottant */}
      {toastMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-xs font-semibold shadow-xl border transition-all duration-300 ${
            toastMsg.type === "success"
              ? "border-emerald-500/40 bg-zinc-900 text-emerald-300"
              : "border-rose-500/40 bg-zinc-900 text-rose-300"
          }`}
        >
          {toastMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* En-tête KPI de l'Univers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4 border-zinc-800 bg-zinc-900/60">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Total Univers</span>
            <p className="font-mono text-xl font-bold text-zinc-100">{availableSymbols.length} Actifs</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 p-4 border-emerald-900/40 bg-emerald-950/20">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Symboles Actifs</span>
            <p className="font-mono text-xl font-bold text-emerald-300">{activeCount} en scan</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 p-4 border-zinc-800 bg-zinc-900/60">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
            <Power className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">En Pause</span>
            <p className="font-mono text-xl font-bold text-zinc-400">{pausedCount} ignorés</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 p-4 border-amber-900/40 bg-amber-950/20">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Embargos Macro</span>
            <p className="font-mono text-xl font-bold text-amber-300">{embargoCount} bloqués</p>
          </div>
        </div>
      </div>

      {/* Barre d'outils & Contrôles groupés */}
      <div className="card flex flex-col gap-4 p-4 border-zinc-800 bg-zinc-900/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Recherche textuelle */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par symbole, nom (ex: Gold, EUR, Bitcoin)..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Boutons d'actions groupées */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBatchToggle(availableSymbols, true)}
              disabled={batchBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Tout Activer (21)
            </button>
            <button
              onClick={() => handleBatchToggle(availableSymbols, false)}
              disabled={batchBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" /> Tout Désactiver
            </button>
            {selectedCategory !== "Tous" && (
              <button
                onClick={() => {
                  const catSyms = availableSymbols.filter(
                    (s) => SYMBOL_METADATA[s]?.category === selectedCategory
                  );
                  handleBatchToggle(catSyms, true);
                }}
                disabled={batchBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-700/60 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <Layers className="h-3.5 w-3.5" /> Activer {selectedCategory}
              </button>
            )}
          </div>
        </div>

        {/* Onglets de catégories */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-zinc-800/80 pt-3">
          <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0 mr-1" />
          {CATEGORIES.map((cat) => {
            const isSel = selectedCategory === cat;
            const countInCat =
              cat === "Tous"
                ? availableSymbols.length
                : availableSymbols.filter((s) => SYMBOL_METADATA[s]?.category === cat).length;
            const activeInCat =
              cat === "Tous"
                ? activeCount
                : availableSymbols.filter(
                    (s) => SYMBOL_METADATA[s]?.category === cat && localActive.includes(s)
                  ).length;

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isSel
                    ? "bg-cyan-500/20 border border-cyan-500/60 text-cyan-300 font-semibold"
                    : "bg-zinc-800/50 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    isSel ? "bg-cyan-500/30 text-cyan-200" : "bg-zinc-900 text-zinc-500"
                  }`}
                >
                  {activeInCat}/{countInCat}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grille des Symboles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredSymbols.map((sym) => {
          const meta = SYMBOL_METADATA[sym] || {
            symbol: sym,
            name: sym,
            category: "Forex Majeurs",
            description: "Actif de marché",
            typicalSpread: "Standard",
            pipUnit: "—",
          };
          const isActive = localActive.includes(sym);
          const isBusy = togglingSym === sym;
          const isEmbargo = blockedSymbols.includes(sym);

          return (
            <div
              key={sym}
              className={`card flex flex-col justify-between p-4 transition-all duration-200 border ${
                isActive
                  ? isEmbargo
                    ? "border-amber-600/60 bg-gradient-to-br from-zinc-900 via-amber-950/20 to-zinc-900 shadow-amber-950/20"
                    : "border-cyan-500/30 bg-gradient-to-br from-zinc-900 via-cyan-950/15 to-zinc-900 shadow-cyan-950/20"
                  : "border-zinc-800/80 bg-zinc-900/40 opacity-70 hover:opacity-100"
              }`}
            >
              {/* En-tête de carte : Titre + Switch interactif */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-extrabold tracking-tight text-zinc-100">
                      {sym}
                    </span>
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider ${
                        isActive
                          ? isEmbargo
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}
                    >
                      {isEmbargo ? "EMBARGO NEWS" : isActive ? "ACTIF · SCAN" : "EN PAUSE"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-zinc-400 line-clamp-1">{meta.name}</p>
                </div>

                {/* Bouton Toggle Actionable (Switch) */}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleToggle(sym)}
                  title={isActive ? `Cliquer pour désactiver ${sym}` : `Cliquer pour activer ${sym}`}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isActive ? "bg-cyan-500" : "bg-zinc-700"
                  } ${isBusy ? "opacity-50 cursor-wait" : ""}`}
                >
                  <span className="sr-only">Toggle {sym}</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Description & Détails techniques */}
              <div className="mt-3 flex flex-col gap-1.5 border-t border-zinc-800/80 pt-2.5">
                <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{meta.description}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>Spread : <span className="text-zinc-300 font-semibold">{meta.typicalSpread}</span></span>
                  <span>Unité : <span className="text-zinc-300 font-semibold">{meta.pipUnit}</span></span>
                </div>
              </div>

              {/* Statut d'embargo si actif */}
              {isEmbargo && (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-md border border-amber-700/60 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
                  <ShieldAlert className="h-3 w-3 shrink-0 text-amber-400" />
                  <span>Ordres bloqués par le filtre macro ForexFactory.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
