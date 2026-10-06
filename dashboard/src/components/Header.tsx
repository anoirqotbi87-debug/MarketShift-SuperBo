"use client";

import { useState } from "react";
import {
  Activity,
  Ban,
  CircleOff,
  Menu,
  Play,
  Power,
  RefreshCcw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { sendControlCommand } from "@/lib/api";
import type { WsSnapshot } from "@/types/trading";
import EmergencyModal from "./EmergencyModal";
import ConnectionSwitcher from "./ConnectionSwitcher";

interface HeaderProps {
  snapshot: WsSnapshot;
  connected: boolean;
  latencyMs: number | null;
  symbolsCount: number | null;
  onReconnect: () => void;
  onOpenMenu?: () => void;
  title?: string;
}

export default function Header({
  snapshot,
  connected,
  latencyMs,
  symbolsCount,
  onReconnect,
  onOpenMenu,
  title,
}: HeaderProps) {
  const [showEmergency, setShowEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

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
    <header className="card relative z-50 flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
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
              {title ?? "SUPERVERBOT"}
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

      {/* Indicateurs système */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
          Broker : <span className="text-zinc-200">{brokerLabel}</span>
        </span>
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
          Symboles : <span className="text-zinc-200">{symbolsCount ?? 0}</span>
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
      </div>

      {/* Commandes de sécurité */}
      <div className="flex items-center gap-2">
        <ConnectionSwitcher connected={connected} onReconnect={onReconnect} />
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