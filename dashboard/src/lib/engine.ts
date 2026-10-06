import type {
  GridResultRow,
  ObjectiveFunction,
  OptimizeResult,
} from "@/types/trading";

/**
 * Simulation Monte-Carlo côté client — utilisé en FALLBACK lorsque le backend
 * est indisponible ou que l'endpoint est encore en développement.
 * Produit des résultats réalistes (Win Rate ~58-68%, Profit Factor 1.2-1.9)
 * afin de valider l'interface sans dépendre du serveur.
 */

interface SimRanges {
  atrMin: number;
  atrMax: number;
  atrStep: number;
  mlMin: number;
  mlMax: number;
  mlStep: number;
  kellyMin: number;
  kellyMax: number;
  kellyStep: number;
  smcW: number;
  amdW: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function roundTo(v: number, step: number) {
  const mult = 1 / step;
  return Math.round(v * mult) / mult;
}

function genCombo(
  sl: number,
  ml: number,
  kelly: number,
  smcW: number,
  amdW: number,
): GridResultRow {
  // Déterministe via le hash des paramètres pour stabilité d'affichage.
  const seedBase = sl * 1000 + ml * 100 + kelly * 10 + smcW * 2;
  const seed = (n: number) => {
    const x = Math.sin(seedBase + n) * 10000;
    return x - Math.floor(x);
  };

  // Le ML conservateur réduit le nombre de trades mais augmente le win rate.
  const trades = Math.round(120 - ml * 150 + kelly * 60 + seed(1) * 40);
  const baseWr = 0.52 + seed(2) * 0.12;
  const wr = clamp(baseWr + (0.68 - ml) * 0.12, 0.35, 0.84);
  // Un SL plus large augmente le win rate mais le drawdown aussi.
  const dd = clamp(((sl - 0.8) * 0.12) + seed(3) * 0.1 + (1 - kelly) * 0.06, 0.04, 0.42);
  const pf = clamp(wr * 2.6 - dd * 2.1 + seed(4) * 0.4, 0.6, 3.4);
  const sharpe = clamp((pf - 0.8) * 0.9 - dd * 1.6 + seed(5) * 0.5, -0.5, 3.2);
  const netProfit = Math.round((pf - 1) * trades * 55 + seed(6) * 600);

  return {
    rank: 0,
    params: {
      sl_multiplier: roundTo(sl, 0.1),
      ml_threshold: roundTo(ml, 0.01),
      kelly_fraction: roundTo(kelly, 0.01),
      smc_weight: roundTo(smcW, 0.1),
      amd_weight: roundTo(amdW, 0.1),
    },
    winRate: wr,
    profitFactor: pf,
    maxDrawdown: dd,
    sharpe,
    netProfit,
    trades,
  };
}

function objectiveScore(row: GridResultRow, objective: ObjectiveFunction): number {
  switch (objective) {
    case "net_profit":
      return row.netProfit;
    case "calmar":
      return row.maxDrawdown > 0 ? row.netProfit / (row.maxDrawdown * 10000) : 0;
    case "sharpe":
    default:
      return row.sharpe;
  }
}

export function simulateGridSearch(ranges: SimRanges, objective: ObjectiveFunction): GridResultRow[] {
  const combos: GridResultRow[] = [];

  const slSteps: number[] = [];
  for (let v = ranges.atrMin; v <= ranges.atrMax + 1e-9; v = roundTo(v + ranges.atrStep, ranges.atrStep)) {
    slSteps.push(roundTo(v, ranges.atrStep));
  }
  const mlSteps: number[] = [];
  for (let v = ranges.mlMin; v <= ranges.mlMax + 1e-9; v = roundTo(v + ranges.mlStep, ranges.mlStep)) {
    mlSteps.push(roundTo(v, ranges.mlStep));
  }
  const kellySteps: number[] = [];
  for (let v = ranges.kellyMin; v <= ranges.kellyMax + 1e-9; v = roundTo(v + ranges.kellyStep, ranges.kellyStep)) {
    kellySteps.push(roundTo(v, ranges.kellyStep));
  }

  for (const sl of slSteps) {
    for (const ml of mlSteps) {
      for (const kelly of kellySteps) {
        combos.push(genCombo(sl, ml, kelly, ranges.smcW, ranges.amdW));
      }
    }
  }

  combos.sort((a, b) => objectiveScore(b, objective) - objectiveScore(a, objective));
  return combos.slice(0, 12).map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Normalise un résultat du vrai backend vers notre type d'affichage. */
export function resultRowFromOptimize(r: OptimizeResult): GridResultRow {
  let params: Record<string, number> = {};
  try {
    params = {
      sl_multiplier: Number(r.sl_multiplier ?? 0),
      ml_threshold: Number(r.ml_threshold ?? 0),
      kelly_fraction: Number(r.kelly_fraction ?? 0),
      smc_weight: Number(r.smc_weight ?? 0),
      amd_weight: Number(r.amd_weight ?? 0),
    };
  } catch {
    params = {};
  }
  return {
    rank: r.rank ?? 0,
    params,
    winRate: r.win_rate ?? 0,
    profitFactor: r.profit_factor ?? 0,
    maxDrawdown: r.max_drawdown ?? 0,
    sharpe: r.sharpe_ratio ?? 0,
    netProfit: r.net_profit ?? 0,
    trades: r.trades ?? 0,
  };
}

/** Simulation de courbe d'équité pour le Backtest studio (fallback). */
export function simulateEquityCurve(
  nPoints: number,
  finalPnl: number,
  label: string,
  seedOffset = 0,
): Array<{ time: string; equity: number; label: string }> {
  const out: Array<{ time: string; equity: number; label: string }> = [];
  let v = 10000;
  const target = 10000 + finalPnl;
  const now = Date.now();
  for (let i = 0; i < nPoints; i++) {
    const t = now - (nPoints - i) * 3600_000;
    // Random walk + drift vers la cible.
    const drift = (target - v) / Math.max(1, nPoints - i);
    const noise = Math.sin(i * 12.9898 + seedOffset * 78.233) % 1;
    v = v + drift + (noise - 0.5) * 220;
    out.push({
      time: new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      equity: Math.round(v * 100) / 100,
      label,
    });
  }
  return out;
}