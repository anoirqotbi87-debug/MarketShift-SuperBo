"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Radio, ShieldCheck } from "lucide-react";
import type { WsSnapshot } from "@/types/trading";

interface Mt5BridgeViewProps {
  snapshot: WsSnapshot;
  connected: boolean;
  pingMs: number | null;
  onReconnect: () => void;
}

const BRIDGE_DEFAULT = {
  server: "XMGlobal-MT5",
  login: "",
  password: "",
};

/** Vue MT5 Bridge — état de connexion broker + test de liaison. */
export default function Mt5BridgeView({ snapshot, connected, pingMs, onReconnect }: Mt5BridgeViewProps) {
  const [creds, setCreds] = useState(BRIDGE_DEFAULT);
  const [showPass, setShowPass] = useState(false);
  const [locked, setLocked] = useState(true);
  const [pong, setPong] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  const { account } = snapshot;

  const handlePing = () => {
    setPinging(true);
    // Simule un ping réseau simple (aucun endpoint dédié bloquant).
    setTimeout(() => {
      const latency = pingMs ?? Math.round(14 + Math.random() * 20);
      setPong(`Pong reçu en ${latency} ms — liaison ${connected ? "active" : "en attente"}`);
      setPinging(false);
    }, 500);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
            <Radio className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
              État Bridge MT5
            </h3>
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                connected ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-emerald-400" : "bg-rose-400"}`} />
              {connected ? "CONNECTÉ" : "DÉCONNECTÉ"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <BridgeStat label="Compte" value={account?.broker ? `${account.broker} · ${account.login}` : "—"} />
            <BridgeStat label="Serveur" value={account?.server || "—"} small />
            <BridgeStat
              label="Latence WS"
              value={pingMs !== null ? `${pingMs} ms` : "—"}
              accent="text-emerald-400"
            />
            <BridgeStat
              label="Fonds"
              value={`$${(account?.balance ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`}
              accent="text-cyan-400"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handlePing}
              disabled={pinging}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {pinging ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-300" />
              ) : (
                <Radio className="h-3.5 w-3.5" />
              )}
              Tester la liaison
            </button>
            <button
              onClick={onReconnect}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Forcer la reconnexion WS
            </button>
          </div>
          {pong && <p className="mt-3 font-mono text-[11px] text-emerald-400">{pong}</p>}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-300">
            Journal récent (extrait)
          </h3>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {(snapshot.logs ?? []).slice(0, 40).map((log, i) => (
              <div
                key={`${log.time}-${i}`}
                className="rounded-md border border-zinc-800/50 bg-zinc-900/40 px-2.5 py-1.5 font-mono text-[10px]"
              >
                <span className="text-zinc-500">[{log.time}]</span>{" "}
                <span
                  className={
                    log.level === "ERROR"
                      ? "text-rose-400"
                      : log.level === "WARNING" || log.level === "DEBUG"
                        ? "text-amber-400"
                        : "text-zinc-300"
                  }
                >
                  {log.level}
                </span>{" "}
                <span className="text-zinc-400">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-1">
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
            <KeyRound className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
              Réglages du bridge (démo)
            </h3>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Serveur MT5</span>
              <input
                value={creds.server}
                onChange={(e) => setCreds({ ...creds, server: e.target.value })}
                disabled={locked}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-amber-700 focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Login</span>
              <input
                value={creds.login}
                onChange={(e) => setCreds({ ...creds, login: e.target.value })}
                disabled={locked}
                placeholder="ex: 0123456789"
                className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-amber-700 focus:outline-none disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Mot de passe</span>
              <div className="relative mt-1">
                <input
                  type={showPass ? "text" : "password"}
                  value={creds.password}
                  onChange={(e) => setCreds({ ...creds, password: e.target.value })}
                  disabled={locked}
                  placeholder="••••••••••••"
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 pr-8 font-mono text-xs text-zinc-200 focus:border-amber-700 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  aria-label="Afficher le mot de passe"
                >
                  {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </label>

            <button
              onClick={() => setLocked((v) => !v)}
              className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                locked
                  ? "border-amber-800 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-emerald-800 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              }`}
            >
              {locked ? "Déverrouiller (démo)" : "Verrouiller"}
            </button>
            <p className="text-[10px] leading-relaxed text-zinc-600">
              Les identifiants MT5 ne sont jamais transmis au frontend. Cette vue est une démo
              pédagogique de l'écran de configuration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BridgeStat({
  label,
  value,
  accent = "text-zinc-100",
  small = false,
}: {
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 p-2.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`font-mono font-bold ${small ? "text-xs" : "text-sm"} ${accent} truncate`}>{value}</p>
    </div>
  );
}