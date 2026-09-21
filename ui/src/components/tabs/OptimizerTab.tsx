import React, { useState, useRef } from 'react';
import { Play, TrendingUp, AlertTriangle, Save, CheckCircle2 } from 'lucide-react';
import { getApiBaseUrl } from '../../utils/api';

export const OptimizerTab: React.FC = () => {
  const [symbol, setSymbol] = useState<string>('EURUSD');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadHistory = () => {
    // Determine a reasonable timeframe (we use M15 by default for grid search)
    const url = `${getApiBaseUrl()}/export-history?symbol=${symbol}&timeframe=M15&num_bars=50000`;
    window.open(url, '_blank');
  };

  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  const applyOptimalSettings = async () => {
    if (!result || !result.bestParams) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/apply-optimal-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slMult: result.bestParams.slMult,
          confThreshold: result.bestParams.confThreshold,
          symbol: result.symbol || symbol
        })
      });
      const data = await res.json();
      if (data.success) {
        setApplySuccess(true);
        setTimeout(() => setApplySuccess(false), 3000);
      } else {
        alert("Erreur lors de l'application: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Erreur de connexion avec le serveur.");
    }
  };

  const runOptimizer = async () => {
    if (!fileInputRef.current?.files?.[0]) {
      alert("Veuillez d'abord uploader un fichier CSV contenant l'historique MT5.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setApplySuccess(false);
    
    try {
      const formData = new FormData();
      formData.append('file', fileInputRef.current.files[0]);
      formData.append('symbol', symbol);
      formData.append('initial_capital', initialCapital.toString());

      const res = await fetch(`${getApiBaseUrl()}/optimize`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (!res.ok || data.error) {
        alert(`Erreur Optimizer: ${data.error || 'Erreur serveur inconnue'}`);
        setIsLoading(false);
        return;
      }

      // If async job returned
      if (data.job_id) {
        const jobId = data.job_id;
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${getApiBaseUrl()}/optimize/status/${jobId}`);
            const statusData = await statusRes.json();
            
            if (statusData.status === 'completed') {
              clearInterval(pollInterval);
              setResult(statusData.result);
              setIsLoading(false);
            } else if (statusData.status === 'error') {
              clearInterval(pollInterval);
              alert(`Erreur Optimizer: ${statusData.error}`);
              setIsLoading(false);
            }
          } catch (e) {
            console.error("Polling error", e);
          }
        }, 2000); // Check every 2 seconds
      } else {
        // Fallback for synchronous backend
        setResult(data);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Optimizer Error:", err);
      alert("Impossible de contacter le serveur Python FastAPI.");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Auto-Optimizer (Grid Search)</h2>
          <p className="text-sm text-slate-400 mt-1">Recherche des meilleurs hyperparamètres (Take Profit / Stop Loss) via Backtests successifs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Paire de devises</label>
                <select 
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                >
                  <option value="EURUSD">EUR/USD</option>
                  <option value="GBPUSD">GBP/USD</option>
                  <option value="USDJPY">USD/JPY</option>
                  <option value="XAUUSD">XAU/USD (Or)</option>
                  <option value="BTCUSD">BTC/USD (Bitcoin)</option>
                  <option value="ETHUSD">ETH/USD (Ethereum)</option>
                  <option value="US30Cash">US30 (Dow Jones)</option>
                  <option value="US100Cash">US100 (Nasdaq)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Capital Initial ($)</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Fichier CSV (Historique MT5)</label>
                <input 
                  type="file" 
                  accept=".csv"
                  ref={fileInputRef}
                  className="w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-400 hover:file:bg-blue-500/30 transition-all mb-2"
                />
                <button
                  onClick={downloadHistory}
                  className="w-full text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 py-2 rounded-xl transition-all border border-white/5 flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Extraire l'Historique MT5 en direct ({symbol})
                </button>
              </div>

              <button
                onClick={runOptimizer}
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-6 py-4 rounded-xl font-semibold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                <span>{isLoading ? 'Optimisation en cours...' : 'Lancer Grid Search'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <>
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                    <h3 className="text-xl font-bold text-white">Meilleurs Paramètres Trouvés</h3>
                  </div>
                  
                  <button
                    onClick={applyOptimalSettings}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg ${
                      applySuccess 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' 
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/50'
                    }`}
                  >
                    {applySuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Paramètres appliqués !</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Appliquer au Bot en direct</span>
                      </>
                    )}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                    <p className="text-sm text-slate-400">SL Multiplier Optimal</p>
                    <p className="text-2xl font-bold text-white">{result.bestParams.slMult} x ATR</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                    <p className="text-sm text-slate-400">ML Conf. Optimal</p>
                    <p className="text-2xl font-bold text-white">{result.bestParams.confThreshold.toFixed(0)}%</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                    <p className="text-sm text-slate-400">Max Sharpe Ratio</p>
                    <p className="text-2xl font-bold text-emerald-400">{result.bestReport.sharpeRatio}</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                    <p className="text-sm text-slate-400">Net Profit</p>
                    <p className="text-2xl font-bold text-emerald-400">${result.bestReport.netProfit}</p>
                  </div>
                </div>
                
                <h4 className="text-md font-semibold text-white mb-3 mt-8">Matrice de Sensibilité Heatmap (SL vs ML Conf)</h4>
                <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5 mb-8">
                  <div className="flex flex-col gap-1">
                    <div className="flex text-xs text-slate-500 mb-2">
                      <div className="w-16"></div>
                      <div className="flex-1 flex justify-between px-2">
                        <span>ML Confidence Threshold →</span>
                      </div>
                    </div>
                    
                    {Array.from(new Set(result.gridResults.map((r: any) => r.slMult))).sort((a: any, b: any) => Number(a) - Number(b)).map((sl: any) => (
                      <div key={`row-${sl}`} className="flex items-center gap-2">
                        <div className="w-16 text-xs text-slate-400 text-right pr-2">SL x{sl}</div>
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          {Array.from(new Set(result.gridResults.map((r: any) => r.confThreshold))).sort((a: any, b: any) => Number(a) - Number(b)).map((tp: any) => {
                            const cell = result.gridResults.find((r: any) => r.slMult === sl && r.confThreshold === tp);
                            if (!cell) return <div key={`cell-${sl}-${tp}`} className="bg-slate-800 rounded p-2 h-16"></div>;
                            
                            // Define color intensity based on Sharpe
                            const isBest = cell.sharpeRatio === result.bestReport.sharpeRatio;
                            const isPositive = cell.sharpeRatio > 0;
                            const isZero = cell.sharpeRatio === 0;
                            
                            let bgClass = "bg-slate-800/80"; // Default
                            if (isBest) bgClass = "bg-emerald-500 hover:bg-emerald-400 border-2 border-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.5)] cursor-pointer scale-105 z-10 transition-all";
                            else if (isPositive) bgClass = "bg-emerald-500/40 hover:bg-emerald-500/60 cursor-pointer transition-all";
                            else if (isZero) bgClass = "bg-slate-700/80 hover:bg-slate-600 cursor-pointer transition-all";
                            else bgClass = "bg-rose-500/20 hover:bg-rose-500/40 cursor-pointer transition-all";
                            
                            return (
                              <div key={`cell-${sl}-${tp}`} className={`${bgClass} rounded-lg p-2 flex flex-col items-center justify-center relative group min-h-[4rem]`}>
                                {isBest && <span className="absolute -top-2 -right-2 text-lg">⭐</span>}
                                <span className={`font-bold ${isBest ? 'text-slate-900' : 'text-white'}`}>{cell.sharpeRatio.toFixed(2)}</span>
                                <span className={`text-[10px] ${isBest ? 'text-slate-800' : 'text-slate-400'}`}>Conf {tp.toFixed(0)}%</span>
                                
                                {/* Tooltip */}
                                <div className="absolute opacity-0 group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-white text-xs p-2 rounded shadow-xl border border-slate-700 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                                  <p className="font-bold mb-1">SL x{sl} | Conf {tp.toFixed(0)}%</p>
                                  <p>Sharpe: {cell.sharpeRatio.toFixed(2)}</p>
                                  <p>WinRate: {cell.winRate.toFixed(1)}%</p>
                                  <p>Net Profit: ${cell.netProfit}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex text-xs text-slate-500 mt-2">
                      <div className="w-16"></div>
                      <div className="flex-1 text-center">
                        💡 Survolez les cases pour voir les détails (Couleur = Sharpe Ratio)
                      </div>
                    </div>
                  </div>
                </div>

                <h4 className="text-md font-semibold text-white mb-3">Tableau Détaillé</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">SL Multiplier</th>
                        <th className="px-4 py-3">ML Confidence</th>
                        <th className="px-4 py-3">Win Rate</th>
                        <th className="px-4 py-3">Max DD</th>
                        <th className="px-4 py-3 rounded-tr-lg">Sharpe Ratio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {result.gridResults.map((r: any, idx: number) => (
                        <tr key={idx} className={r.sharpeRatio === result.bestReport.sharpeRatio ? "bg-emerald-500/10" : ""}>
                          <td className="px-4 py-3">x{r.slMult} ATR</td>
                          <td className="px-4 py-3">{r.confThreshold.toFixed(0)}%</td>
                          <td className="px-4 py-3">{r.winRate.toFixed(2)}%</td>
                          <td className="px-4 py-3">{r.maxDrawdownPct.toFixed(2)}%</td>
                          <td className="px-4 py-3 font-semibold">{r.sharpeRatio.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-900/80 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Aucune Optimisation</h3>
              <p className="text-slate-400 max-w-md">
                Uploadez votre fichier CSV MT5 et lancez la Grid Search. Le système testera de multiples combinaisons de SL et TP pour trouver le sweet spot mathématique.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
