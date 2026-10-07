"use client";

import { Layers, ShieldCheck } from "lucide-react";
import type { WsPosition } from "@/types/trading";

interface ActivePositionsProps {
  positions: WsPosition[];
}

const fmtPrice = (v: number) => v.toFixed(v >= 100 ? 1 : 5);
const fmtUsd = (v: number) =>
  `${v < 0 ? "-" : "+"}$${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;

export default function ActivePositions({ positions }: ActivePositionsProps) {
  if (positions.length === 0) {
    return (
      <section className="card flex h-full min-h-[180px] flex-col items-center justify-center gap-3 p-6">
        <Layers className="h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-500">Aucune position active</p>
        <p className="font-mono text-[11px] text-zinc-600">En attente d&apos;un setup SMC / AMD validé par le ML</p>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Positions actives
        </h2>
        <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
          {positions.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800/60 text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2 font-medium">Ticket</th>
              <th className="px-3 py-2 font-medium">Symbole</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium text-right">Volume</th>
              <th className="px-3 py-2 font-medium text-right">Prix ouvert</th>
              <th className="px-3 py-2 font-medium text-right">Prix actuel</th>
              <th className="px-3 py-2 font-medium text-right">SL (élastique)</th>
              <th className="px-3 py-2 font-medium text-right">P&L</th>
              <th className="px-3 py-2 font-medium text-right">Breakeven</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40">
            {positions.map((p) => {
              const isBuy = p.type === "BUY";
              const pnlColor = p.pnl >= 0 ? "text-emerald-400" : "text-rose-400";
              const sym = p.symbol.toUpperCase();
              let beTolerance = p.openPrice * 0.0005; // 0.05% de base
              if (sym.includes("BTC")) beTolerance = 50.0;
              else if (sym.includes("GOLD") || sym.includes("XAU")) beTolerance = 1.0;
              else if (sym.includes("JPY")) beTolerance = 0.05;
              else if (sym.includes("EUR") || sym.includes("GBP")) beTolerance = 0.0003;

              const breakeven =
                p.stopLoss > 0 &&
                (isBuy ? p.currentPrice - p.openPrice >= 0 : p.openPrice - p.currentPrice >= 0) &&
                Math.abs(p.stopLoss - p.openPrice) <= beTolerance;
              return (
                <tr key={p.ticket} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{p.ticket}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-medium text-zinc-200">{p.symbol}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        isBuy ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {p.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">{p.lots}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">{fmtPrice(p.openPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">
                    {fmtPrice(p.currentPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-cyan-300">
                    {p.stopLoss > 0 ? fmtPrice(p.stopLoss) : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono text-xs font-semibold ${pnlColor}`}>
                    {fmtUsd(p.pnl)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {breakeven ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" /> SL Bé
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}