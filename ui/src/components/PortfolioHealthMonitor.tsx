import React, { useMemo } from 'react';
import { ActivePosition, MT5AccountState } from '../types';
import { 
  ShieldCheck, AlertTriangle, PieChart, Layers, DollarSign, Activity, Sparkles, TrendingUp, Compass, CheckCircle2, Info
} from 'lucide-react';

interface PortfolioHealthMonitorProps {
  positions: ActivePosition[];
  accountState: MT5AccountState;
}

interface SectorExposure {
  sector: string;
  label: string;
  value: number; // position value in USD
  percentage: number;
  color: string;
  positionCount: number;
}

interface CurrencyExposure {
  currency: string;
  exposureValue: number;
  percentage: number;
}

export const PortfolioHealthMonitor: React.FC<PortfolioHealthMonitorProps> = ({
  positions,
  accountState
}) => {
  // Map symbol to sector & currencies
  const portfolioAnalysis = useMemo(() => {
    if (!positions || positions.length === 0) {
      return {
        healthScore: 100,
        scoreCategory: 'EXCELLENT',
        statusMessage: 'Aucune position ouverte. Capital 100% liquide.',
        sectorExposures: [
          { sector: 'FOREX', label: 'Forex Majors', value: 0, percentage: 0, color: 'bg-indigo-500', positionCount: 0 },
          { sector: 'METALS', label: 'Precious Metals (Or/Argent)', value: 0, percentage: 0, color: 'bg-amber-400', positionCount: 0 },
          { sector: 'CRYPTO', label: 'Cryptomonnaies', value: 0, percentage: 0, color: 'bg-purple-500', positionCount: 0 },
          { sector: 'INDICES', label: 'Indices & Actions', value: 0, percentage: 0, color: 'bg-emerald-400', positionCount: 0 },
        ],
        currencyExposures: [] as CurrencyExposure[],
        longShortRatio: { longPct: 50, shortPct: 50, longCount: 0, shortCount: 0 },
        recommendations: [
          'Prêt pour de nouvelles opportunités de trading ML.',
          'Maintenez un risque maximum de 1 à 2% par position.'
        ]
      };
    }

    // Calculate total position value in USD
    let totalExposureUSD = 0;
    const sectorMap: Record<string, { value: number; count: number }> = {
      FOREX: { value: 0, count: 0 },
      METALS: { value: 0, count: 0 },
      CRYPTO: { value: 0, count: 0 },
      INDICES: { value: 0, count: 0 }
    };

    const currencyMap: Record<string, number> = {};
    let longCount = 0;
    let shortCount = 0;

    positions.forEach(pos => {
      // Estimate position nominal value in USD
      // 1 lot Forex standard ~ 100,000 USD
      // 1 lot Gold ~ 100 oz (~ $230,000)
      // 1 lot BTC ~ 1 BTC (~ $65,000)
      let notionalUSD = pos.lots * 100000;
      const sym = pos.symbol.toUpperCase();

      let sectorKey = 'FOREX';
      let baseCurr = 'USD';
      let quoteCurr = 'USD';

      if (sym.includes('XAU') || sym.includes('GOLD') || sym.includes('XAG')) {
        sectorKey = 'METALS';
        notionalUSD = pos.lots * pos.currentPrice * 100;
        baseCurr = sym.includes('XAU') ? 'XAU' : 'XAG';
        quoteCurr = 'USD';
      } else if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('SOL')) {
        sectorKey = 'CRYPTO';
        notionalUSD = pos.lots * pos.currentPrice;
        baseCurr = sym.replace('USD', '');
        quoteCurr = 'USD';
      } else if (sym.includes('US500') || sym.includes('NAS') || sym.includes('GER')) {
        sectorKey = 'INDICES';
        notionalUSD = pos.lots * pos.currentPrice * 10;
        baseCurr = sym;
        quoteCurr = 'USD';
      } else if (sym.length === 6) {
        baseCurr = sym.substring(0, 3);
        quoteCurr = sym.substring(3, 6);
        notionalUSD = pos.lots * 100000 * (pos.currentPrice > 10 ? 1 : pos.currentPrice);
      }

      totalExposureUSD += notionalUSD;
      sectorMap[sectorKey].value += notionalUSD;
      sectorMap[sectorKey].count += 1;

      // Currency exposure mapping
      currencyMap[baseCurr] = (currencyMap[baseCurr] || 0) + notionalUSD;
      currencyMap[quoteCurr] = (currencyMap[quoteCurr] || 0) + notionalUSD * 0.8;

      if (pos.type === 'BUY') longCount++;
      if (pos.type === 'SELL') shortCount++;
    });

    const safeTotalExp = totalExposureUSD > 0 ? totalExposureUSD : 1;

    // Sector exposures array
    const sectorExposures: SectorExposure[] = [
      {
        sector: 'FOREX',
        label: 'Forex Majors',
        value: sectorMap.FOREX.value,
        percentage: Math.round((sectorMap.FOREX.value / safeTotalExp) * 100),
        color: 'bg-indigo-500',
        positionCount: sectorMap.FOREX.count
      },
      {
        sector: 'METALS',
        label: 'Matières Premières / Or',
        value: sectorMap.METALS.value,
        percentage: Math.round((sectorMap.METALS.value / safeTotalExp) * 100),
        color: 'bg-amber-400',
        positionCount: sectorMap.METALS.count
      },
      {
        sector: 'CRYPTO',
        label: 'Cryptomonnaies',
        value: sectorMap.CRYPTO.value,
        percentage: Math.round((sectorMap.CRYPTO.value / safeTotalExp) * 100),
        color: 'bg-purple-500',
        positionCount: sectorMap.CRYPTO.count
      },
      {
        sector: 'INDICES',
        label: 'Indices / Actions',
        value: sectorMap.INDICES.value,
        percentage: Math.round((sectorMap.INDICES.value / safeTotalExp) * 100),
        color: 'bg-emerald-400',
        positionCount: sectorMap.INDICES.count
      }
    ];

    // Currency exposures sorted
    const currencyExposures: CurrencyExposure[] = Object.entries(currencyMap)
      .map(([currency, exposureValue]) => ({
        currency,
        exposureValue,
        percentage: Math.round((exposureValue / safeTotalExp) * 100)
      }))
      .sort((a, b) => b.exposureValue - a.exposureValue)
      .slice(0, 5);

    // Calculate Long/Short ratio
    const totalPos = positions.length;
    const longPct = Math.round((longCount / totalPos) * 100);
    const shortPct = 100 - longPct;

    // Calculate Diversification Score (0-100)
    let healthScore = 100;
    const recommendations: string[] = [];

    // Sector Concentration Penalty
    const maxSectorPct = Math.max(...sectorExposures.map(s => s.percentage));
    if (maxSectorPct > 70) {
      healthScore -= 25;
      const topSector = sectorExposures.find(s => s.percentage === maxSectorPct);
      recommendations.push(`Forte sur-exposition dans le secteur ${topSector?.label} (${maxSectorPct}%).`);
    } else if (maxSectorPct > 50) {
      healthScore -= 12;
      recommendations.push(`Concentration importante sur un seul secteur (${maxSectorPct}%).`);
    }

    // Currency Concentration Penalty
    const topCurr = currencyExposures[0];
    if (topCurr && topCurr.percentage > 60) {
      healthScore -= 15;
      recommendations.push(`Exposition excessive sur la devise ${topCurr.currency} (${topCurr.percentage}% du portefeuille).`);
    }

    // Directional Bias Penalty
    if (totalPos >= 3 && (longPct === 100 || shortPct === 100)) {
      healthScore -= 15;
      recommendations.push(`Biais directionnel unilatéral (100% ${longPct === 100 ? 'ACHAT' : 'VENTE'}). Envisagez de vous couvrir.`);
    }

    // Single Position Size Penalty
    const maxSingleLots = Math.max(...positions.map(p => p.lots));
    if (maxSingleLots >= 1.0) {
      healthScore -= 10;
      recommendations.push(`Position volumineuse détectée (${maxSingleLots} lot). Réduisez la taille de lot pour étaler le risque.`);
    }

    // Multi-Sector Bonus
    const activeSectorsCount = sectorExposures.filter(s => s.positionCount > 0).length;
    if (activeSectorsCount >= 3) {
      healthScore = Math.min(100, healthScore + 10);
      recommendations.push(`Bonne répartition multi-actifs (${activeSectorsCount} classes d'actifs actives).`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Excellente répartition du risque global. Diversification optimale.');
      recommendations.push('Corrélation entre actifs sous contrôle.');
    }

    healthScore = Math.max(15, Math.min(100, healthScore));

    let scoreCategory: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL' = 'EXCELLENT';
    let statusMessage = 'Santé du Portefeuille Excellente';

    if (healthScore < 50) {
      scoreCategory = 'CRITICAL';
      statusMessage = 'Alerte: Portefeuille Très Concentré';
    } else if (healthScore < 75) {
      scoreCategory = 'WARNING';
      statusMessage = 'Attention: Modérément Diversifié';
    } else if (healthScore < 90) {
      scoreCategory = 'GOOD';
      statusMessage = 'Portefeuille Bien Équilibré';
    }

    return {
      healthScore,
      scoreCategory,
      statusMessage,
      sectorExposures,
      currencyExposures,
      longShortRatio: { longPct, shortPct, longCount, shortCount },
      recommendations
    };
  }, [positions]);

  const { healthScore, scoreCategory, statusMessage, sectorExposures, currencyExposures, longShortRatio, recommendations } = portfolioAnalysis;

  const getScoreColor = () => {
    switch (scoreCategory) {
      case 'EXCELLENT':
        return { text: 'text-emerald-400', bg: 'bg-emerald-950/80', border: 'border-emerald-700/60', bar: 'from-emerald-500 to-teal-400' };
      case 'GOOD':
        return { text: 'text-indigo-400', bg: 'bg-indigo-950/80', border: 'border-indigo-700/60', bar: 'from-indigo-500 to-blue-400' };
      case 'WARNING':
        return { text: 'text-amber-400', bg: 'bg-amber-950/80', border: 'border-amber-700/60', bar: 'from-amber-500 to-orange-400' };
      case 'CRITICAL':
        return { text: 'text-red-400', bg: 'bg-red-950/80', border: 'border-red-700/60', bar: 'from-red-600 to-pink-500' };
    }
  };

  const theme = getScoreColor();

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-400 status-glow">
            <PieChart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Moniteur de Santé & Diversification</span>
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full font-mono">
                IA Risk Engine
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Analyse en temps réel de l'exposition par devise, secteur et biais directionnel
            </p>
          </div>
        </div>

        {/* Global Score Pill Badge */}
        <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${theme.bg} ${theme.border}`}>
          <Compass className={`w-4 h-4 ${theme.text}`} />
          <div className="font-mono text-xs">
            <span className="text-slate-400">Score Health : </span>
            <span className={`font-extrabold text-sm ${theme.text}`}>{healthScore}/100</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Score Gauge + Directional Ratio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        
        {/* Score Gauge Card */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 uppercase">Indice de Diversification</span>
            <span className={`font-bold ${theme.text}`}>{healthScore}%</span>
          </div>

          <div className="space-y-1.5 my-1">
            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div 
                className={`h-full rounded-full bg-gradient-to-r ${theme.bar} transition-all duration-500`}
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <p className="text-[11px] font-semibold text-slate-200">
              {statusMessage}
            </p>
          </div>

          {/* Long / Short Balance Bar */}
          <div className="pt-2 border-t border-slate-900 text-[10px] font-mono space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Biais Directionnel:</span>
              <span>{longShortRatio.longCount} BUY / {longShortRatio.shortCount} SELL</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden flex border border-slate-800">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${longShortRatio.longPct}%` }} title={`Achats: ${longShortRatio.longPct}%`} />
              <div className="bg-red-500 h-full transition-all" style={{ width: `${longShortRatio.shortPct}%` }} title={`Ventes: ${longShortRatio.shortPct}%`} />
            </div>
          </div>
        </div>

        {/* Sector Exposure Breakdown */}
        <div className="md:col-span-2 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2.5">
          <div className="text-xs font-bold text-white uppercase tracking-wide font-mono flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Répartition par Secteur / Classe d'Actifs
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              {positions.length} position(s) actives
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {sectorExposures.map(s => (
              <div key={s.sector} className="p-2 bg-slate-900/80 rounded-lg border border-slate-800/60 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="font-medium text-slate-300">{s.label}</span>
                  <span className="font-mono font-bold text-white">{s.percentage}%</span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} transition-all`} style={{ width: `${s.percentage}%` }} />
                </div>
                <div className="text-[9px] text-slate-500 font-mono">
                  {s.positionCount} position(s) ouverte(s)
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Currency Exposure Heatmap & Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        
        {/* Top Currency Exposures */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
          <div className="text-xs font-bold text-white uppercase tracking-wide font-mono flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
            Exposition Majeure par Devise
          </div>

          <div className="space-y-1.5 pt-1">
            {currencyExposures.length === 0 ? (
              <div className="text-[11px] text-slate-500 italic py-2">
                Aucune exposition de devise active.
              </div>
            ) : (
              currencyExposures.map(c => (
                <div key={c.currency} className="flex items-center justify-between text-xs font-mono bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800/50">
                  <span className="font-bold text-indigo-300">{c.currency}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-950 h-1.5 rounded-full overflow-hidden hidden sm:block">
                      <div className="bg-indigo-400 h-full rounded-full" style={{ width: `${c.percentage}%` }} />
                    </div>
                    <span className="text-white font-bold">{c.percentage}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI Health Recommendations List */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
          <div className="text-xs font-bold text-white uppercase tracking-wide font-mono flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Recommandations IA & Risque
          </div>

          <ul className="space-y-1.5 pt-1 text-[11px] font-sans">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>

    </div>
  );
};
