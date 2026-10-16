"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  BookOpen,
  Check,
  ChevronDown,
  CircleOff,
  ExternalLink,
  Globe,
  Menu,
  Play,
  Power,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";

import { sendControlCommand, toggleSymbol, updateSettings } from "@/lib/api";
import type { WsSnapshot } from "@/types/trading";
import EmergencyModal from "./EmergencyModal";
import ConnectionSwitcher from "./ConnectionSwitcher";

interface HeaderProps {
  snapshot: WsSnapshot;
  connected: boolean;
  latencyMs: number | null;
  symbolsCount?: number | null;
  onReconnect: () => void;
  onOpenMenu?: () => void;
  onOpenGuide?: () => void;
  onOpenSymbols?: () => void;
  title?: string;
}

const DEFAULT_AVAILABLE_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  "EURGBP", "EURJPY", "GBPJPY", "GOLD", "XAUUSD", "SILVER", "USOIL",
  "US30", "US100", "US500", "GER40", "BTCUSD", "ETHUSD", "SOLUSD"
];

const QUICK_CATEGORIES = ["Tous", "Forex", "Matières", "Indices", "Crypto"] as const;

export default function Header({
  snapshot,
  connected,
  latencyMs,
  onReconnect,
  onOpenMenu,
  onOpenGuide,
  onOpenSymbols,
  title,
}: HeaderProps) {
  const [showEmergency, setShowEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  
  // Dropdown Univers State
  const [symbolsMenuOpen, setSymbolsMenuOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [catFilter, setCatFilter] = useState<typeof QUICK_CATEGORIES[number]>("Tous");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableSymbols = snapshot.availableSymbols ?? DEFAULT_AVAILABLE_SYMBOLS;
  const activeSymbolsFromSnapshot = snapshot.activeSymbols ?? ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

  // État optimiste local pour réactivité instantanée à chaque clic
  const [localActive, setLocalActive] = useState<string[]>(activeSymbolsFromSnapshot);
  const [togglingSym, setTogglingSym] = useState<string | null>(null);

  useEffect(() => {
    if (snapshot.activeSymbols && snapshot.activeSymbols.length > 0) {
      setLocalActive(snapshot.activeSymbols);
    }
  }, [snapshot.activeSymbols]);

  // Fermeture du dropdown au clic en dehors ou sur Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSymbolsMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSymbolsMenuOpen(false);
    }
    if (symbolsMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [symbolsMenuOpen]);

  // Basculement instantané d'un symbole
  const handleToggleSymbol = async (sym: string) => {
    const isAct = localActive.includes(sym);
    const nextState = !isAct;

    // Optimiste
    setLocalActive((prev) =>
      nextState ? (prev.includes(sym) ? prev : [...prev, sym]) : prev.filter((s) => s !== sym)
    );
    setTogglingSym(sym);

    try {
      const res = await toggleSymbol(sym, nextState);
      if (res && res.success && res.activeSymbols) {
        setLocalActive(res.activeSymbols);
      } else if (!res || !res.success) {
        // Rollback
        setLocalActive((prev) => (isAct ? [...prev, sym] : prev.filter((s) => s !== sym)));
      }
    } catch {
      setLocalActive((prev) => (isAct ? [...prev, sym] : prev.filter((s) => s !== sym)));
    } finally {
      setTogglingSym(null);
    }
  };

  // Actions groupées rapides dans le dropdown
  const handleBatchToggle = async (enable: boolean) => {
    const newActive = enable ? [...availableSymbols] : [];
    setLocalActive(newActive);
    try {
      const res = await updateSettings({ active_symbols: newActive });
      if (res && res.active_symbols) {
        setLocalActive(res.active_symbols);
      }
    } catch {
      // ignore
    }
  };

  // Filtrage des symboles dans le dropdown
  const displayedSymbols = availableSymbols.filter((s) => {
    if (searchFilter.trim() && !s.toLowerCase().includes(searchFilter.toLowerCase().trim())) {
      return false;
    }
    if (catFilter === "Forex" && !["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY"].includes(s)) {
      return false;
    }
    if (catFilter === "Matières" && !["GOLD", "XAUUSD", "SILVER", "USOIL"].includes(s)) {
      return false;
    }
    if (catFilter === "Indices" && !["US30", "US100", "US500", "GER40"].includes(s)) {
      return false;
    }
    if (catFilter === "Crypto" && !["BTCUSD", "ETHUSD", "SOLUSD"].includes(s)) {
      return false;
    }
    return true;
  });

  const { account, killSwitch, isPaused } = snapshot;

  const runAction = async (action: "kill" | "reset_kill" | "pause" | "resume") => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await sendControlCommand(action);
      setActionMsg(res?.message ?? res?.error ?? "Action envoyée");
    } catch {
      setActionMsg("Erreur réseau vers le backend");
    } finally {
      setBusy(false);
      setTimeout(() => setActionMsg(null), 4000);
    }
  };

  const brokerLabel =
    account?.broker === "XM" ? "XMGlobal-MT5" : account?.broker === "EXNESS" ? "Exness-MT5" : (account?.server || "—");

  return (
    <header className="card relative z-40 flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      {/* Marque + état WS */}
      <div className="flex items-center gap-3">
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
          <Activity className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-zinc-100">
            MarketShift
            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-400">
              {title ?? "SUPERBOT"}
            </span>
          </h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            {connected ? (
              <>
                <span className="live-dot bg-emerald-400" />
                <span className="text-emerald-400">WebSocket connecté</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-rose-400">Déconnecté · reconnexion…</span>
              </>
            )}
            {latencyMs !== null && (
              <span className="ml-1 font-mono text-[10px] text-zinc-500">
                <Wifi className="mr-0.5 inline h-3 w-3" />
                {latencyMs} ms
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Indicateurs système & Menu Déroulant Univers Symboles */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
          Broker : <span className="text-zinc-200">{brokerLabel}</span>
        </span>
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
          Cycle : <span className="text-cyan-300">~0.2s</span>
        </span>
        {killSwitch && (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-900 bg-rose-500/10 px-2 py-1 font-semibold text-rose-400">
            <Ban className="h-3 w-3" /> KILL SWITCH ARME
          </span>
        )}
        {isPaused && (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-800 bg-amber-500/10 px-2 py-1 font-semibold text-amber-400">
            <CircleOff className="h-3 w-3" /> PAUSE
          </span>
        )}
        {snapshot.macro?.isAnyEmbargoActive ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-rose-800 bg-rose-500/15 px-2 py-1 font-semibold text-rose-400 animate-pulse text-[11px]"
            title={`Embargo actif sur: ${snapshot.macro.blockedSymbols.join(", ")}`}
          >
            <ShieldAlert className="h-3 w-3" /> EMBARGO ({snapshot.macro.blockedSymbols.length})
          </span>
        ) : (
          <span
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-emerald-900/60 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-400"
            title="Aucun embargo macro en cours"
          >
            <ShieldCheck className="h-3 w-3" /> MACRO LIBRE
          </span>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* BOUTON DÉROULANT DE L'UNIVERS (Fluide, compact, actionable) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setSymbolsMenuOpen((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              symbolsMenuOpen
                ? "border-cyan-500 bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-950/30"
                : "border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800"
            }`}
          >
            <Globe className="h-3.5 w-3.5 text-cyan-400" />
            <span>Univers</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
              {localActive.length}/{availableSymbols.length}
            </span>
            <ChevronDown
              className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${
                symbolsMenuOpen ? "rotate-180 text-cyan-400" : ""
              }`}
            />
          </button>

          {/* Panneau déroulant flottant */}
          {symbolsMenuOpen && (
            <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-[340px] sm:w-[420px] rounded-xl border border-zinc-800 bg-zinc-950/95 p-3.5 shadow-2xl backdrop-blur-xl z-50">
              {/* En-tête du menu */}
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-bold text-zinc-100">
                    Sélecteur d&apos;Actifs
                  </span>
                  <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                    {localActive.length} Actifs
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => handleBatchToggle(true)}
                    className="rounded px-2 py-1 text-emerald-400 hover:bg-emerald-500/10 font-medium transition"
                  >
                    Tout ON
                  </button>
                  <span className="text-zinc-700">|</span>
                  <button
                    type="button"
                    onClick={() => handleBatchToggle(false)}
                    className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 font-medium transition"
                  >
                    Tout Pause
                  </button>
                </div>
              </div>

              {/* Recherche & Filtre rapide */}
              <div className="mt-2.5 flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filtrer (ex: EUR, GOLD, BTC)..."
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900/90 pl-8 pr-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none font-sans"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {QUICK_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatFilter(cat)}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                        catFilter === cat
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          : "bg-zinc-900 text-zinc-400 border border-zinc-800/80 hover:text-zinc-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Liste scrollable des symboles */}
              <div className="mt-3 max-h-56 overflow-y-auto pr-1 flex flex-col gap-1.5 divide-y divide-zinc-900">
                {displayedSymbols.length === 0 ? (
                  <p className="py-4 text-center text-xs text-zinc-500 font-sans">
                    Aucun symbole trouvé pour &quot;{searchFilter}&quot;
                  </p>
                ) : (
                  displayedSymbols.map((sym) => {
                    const isAct = localActive.includes(sym);
                    const isBusy = togglingSym === sym;
                    const isBlocked = snapshot.macro?.blockedSymbols?.includes(sym);

                    return (
                      <div
                        key={sym}
                        className={`flex items-center justify-between py-1.5 px-2 rounded-lg transition ${
                          isAct
                            ? isBlocked
                              ? "bg-amber-500/10 border border-amber-600/30"
                              : "bg-cyan-500/5 hover:bg-cyan-500/10"
                            : "hover:bg-zinc-900/60 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isAct
                                ? isBlocked
                                  ? "bg-amber-400 animate-pulse"
                                  : "bg-cyan-400 shadow-sm shadow-cyan-400"
                                : "bg-zinc-600"
                            }`}
                          />
                          <span className="font-mono text-xs font-bold text-zinc-200">
                            {sym}
                          </span>
                          {isBlocked && (
                            <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[8px] font-bold text-amber-300">
                              EMBARGO
                            </span>
                          )}
                        </div>

                        {/* Switch Interactif */}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleSymbol(sym)}
                          title={isAct ? `Désactiver ${sym}` : `Activer ${sym}`}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isAct ? "bg-cyan-500" : "bg-zinc-700"
                          } ${isBusy ? "opacity-50 cursor-wait" : ""}`}
                        >
                          <span className="sr-only">Toggle {sym}</span>
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isAct ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pied de menu avec lien vers l'onglet dédié */}
              {onOpenSymbols && (
                <div className="mt-3 border-t border-zinc-800/80 pt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSymbolsMenuOpen(false);
                      onOpenSymbols();
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-800/60 bg-cyan-500/10 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                  >
                    <span>Gérer l&apos;univers complet (21 symboles)</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Commandes de sécurité */}
      <div className="flex items-center gap-2">
        <ConnectionSwitcher connected={connected} onReconnect={onReconnect} />
        {onOpenGuide && (
          <button
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-cyan-700 hover:bg-cyan-500/10 hover:text-cyan-300"
            title="Ouvrir le Mode Opératoire"
          >
            <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Guide</span>
          </button>
        )}
        {actionMsg && <span className="text-[11px] text-zinc-500">{actionMsg}</span>}
        {isPaused ? (
          <button
            onClick={() => runAction("resume")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> Reprendre
          </button>
        ) : (
          <button
            onClick={() => runAction("pause")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
          >
            <CircleOff className="h-3.5 w-3.5" /> Pause
          </button>
        )}
        {killSwitch ? (
          <button
            onClick={() => runAction("reset_kill")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Reset Circuit Breaker
          </button>
        ) : (
          <button
            onClick={() => setShowEmergency(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-800 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20"
          >
            <Power className="h-3.5 w-3.5" /> Emergency Kill Switch
          </button>
        )}
        <div className="hidden lg:flex" title="Protection active">
          <ShieldCheck className="h-4 w-4 text-emerald-500/70" />
        </div>
      </div>

      <EmergencyModal
        open={showEmergency}
        onClose={() => setShowEmergency(false)}
        onConfirm={async () => {
          setShowEmergency(false);
          await runAction("kill");
        }}
      />
    </header>
  );
}