"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { fetchKelly } from "@/lib/api";
import type { KellyApiResponse, KellyPositionSize, WsSnapshot } from "@/types/trading";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "GOLD", "BTCUSD"];

interface KellySizerProps {
  snapshot: WsSnapshot;
}

/** Position Sizer Kelly — calcule la taille de position recommandée (porté du 5173). */
export default function KellySizer({ snapshot }: KellySizerProps) {
  const [kelly, setKelly] = useState<KellyApiResponse | null>(null);
  const [symbol, setSymbol] = useState("EURUSD");
  const [riskPct, setRiskPct] = useState(1.0);
  const [slPips, setSlPips] = useState(20);

  useEffect(() => {
    let cancelled = false;
    fetchKelly().then((k) => {
      if (!cancelled && k) setKelly(k);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const size = useMemo<KellyPositionSize | null>(() => {
    const balance = snapshot.account?.balance || 10000;
    const kellyPct = (kelly?.kellyPct ?? 0) || 25;

    // Hypothèse pip value standard pour les paires forexs (approx).
    const pipValPerLot = symbol.startsWith("GOLD") || symbol.startsWith("BTC") ? 1 : 8;
    const effectiveRisk = Math.min(riskPct, kellyPct / 5); // cap Kelly-recommandé

    const riskAmount = (balance * effectiveRisk) / 100;
    const lots = riskAmount / (slPips * pipValPerLot);
    const positionSize = lots * 100000;
    return {
      kellyPct: kellyPct,
      riskPct: effectiveRisk,
      positionSize: positionSize,
      lots: Math.round(lots * 100) / 100,
      pipValuePerLot: pipValPerLot,
      accountBalance: balance,
    };
  }, [kelly, snapshot.account.balance, riskPct, slPips, symbol]);

  const maxRisk = kelly ? Math.max(1, Math.min(5, kelly.kellyPct / 5)) : 1.5;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
        <Calculator className="h-4 w-4 text-amber-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          Kelly Position Sizer
        </h3>
        {kelly && (
          <span className="ml-auto font-mono text-[10px] text-zinc-500">
            Kelly {kelly.kellyPct.toFixed(1)}% · WR {((kelly.winRate ?? 0) * 100).toFixed(0)}% · RR {kelly.rrRatio.toFixed(1)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Symbole</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-amber-700 focus:outline-none"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Risque / trade ({riskPct.toFixed(1)}%)
          </span>
          <input
            type="range"
            min="0.25"
            max={String(maxRisk)}
            step="0.25"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="mt-2 w-full accent-amber-500"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">SL (pips)</span>
          <input
            type="number"
            min="5"
            max="100"
            value={slPips}
            onChange={(e) => setSlPips(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200 focus:border-amber-700 focus:outline-none"
          />
        </label>
      </div>

      {size && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResultBox label="Kelly" value={`${size.kellyPct.toFixed(1)}%`} accent="text-amber-400" />
          <ResultBox label="Risque appliqué" value={`${size.riskPct.toFixed(2)}%`} accent="text-emerald-400" />
          <ResultBox label="Taille (lots)" value={size.lots.toFixed(2)} accent="text-cyan-400" bold />
          <ResultBox label="Exposition" value={`$${size.positionSize.toLocaleString("fr-FR")}`} accent="text-violet-400" />
        </div>
      )}

      {!kelly && (
        <p className="mt-3 text-[10px] text-zinc-600">
          Backend indisponible — Kelly simulé (défauts).
        </p>
      )}
    </div>
  );
}

function ResultBox({
  label,
  value,
  accent,
  bold = false,
}: {
  label: string;
  value: string;
  accent: string;
  bold?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 p-2.5 text-center">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`font-mono ${bold ? "text-lg" : "text-base"} font-bold ${accent}`}>{value}</p>
    </div>
  );
}