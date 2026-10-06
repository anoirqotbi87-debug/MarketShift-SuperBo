"use client";

import { useState } from "react";
import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import type { PriceAlertItem } from "@/types/trading";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

/** Alertes de prix client-side (porté du 5173 PriceAlertsConfig). */
export default function PriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlertItem[]>([]);
  const [symbol, setSymbol] = useState("EURUSD");
  const [condition, setCondition] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [target, setTarget] = useState(1.1);
  const [note, setNote] = useState("");

  const addAlert = () => {
    if (!target || target <= 0) return;
    const alert: PriceAlertItem = {
      id: `pa-${Date.now()}`,
      symbol,
      condition,
      targetPrice: target,
      note: note.trim() || undefined,
      enabled: true,
      isTriggered: false,
      createdAt: new Date().toLocaleTimeString("fr-FR", { hour12: false }),
    };
    setAlerts((prev) => [alert, ...prev]);
    setNote("");
  };

  const toggleEnabled = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );
  };

  const removeAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
        <Bell className="h-4 w-4 text-cyan-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          Alertes de prix
        </h3>
        <span className="ml-auto font-mono text-[10px] text-zinc-500">{alerts.length} active(s)</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as "ABOVE" | "BELOW")}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
        >
          <option value="ABOVE">Passe au-dessus</option>
          <option value="BELOW">Passe en-dessous</option>
        </select>
        <input
          type="number"
          step="0.0001"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (option)"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-700 focus:outline-none"
        />
        <button
          onClick={addAlert}
          className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {alerts.length === 0 && (
          <p className="py-6 text-center text-xs text-zinc-600">
            Aucune alerte configurée. Ajoutez-en une ci-dessus.
          </p>
        )}
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="font-mono text-xs text-zinc-200">
                {a.symbol} {a.condition === "ABOVE" ? "▲" : "▼"} {a.targetPrice.toFixed(4)}
              </p>
              {a.note && <p className="truncate font-mono text-[10px] text-zinc-500">{a.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${
                  a.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-700/40 text-zinc-500"
                }`}
              >
                {a.enabled ? "ARMÉE" : "DÉSARMÉE"}
              </span>
              <button
                onClick={() => toggleEnabled(a.id)}
                title={a.enabled ? "Désarmer" : "Armer"}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-cyan-400"
              >
                {a.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => removeAlert(a.id)}
                title="Supprimer"
                className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}