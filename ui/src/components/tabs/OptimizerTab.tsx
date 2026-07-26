import React, { useState, useRef } from 'react';
import { Play, TrendingUp, AlertTriangle } from 'lucide-react';

export const OptimizerTab: React.FC = () => {
  const [symbol, setSymbol] = useState<string>('EURUSD');
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runOptimizer = async () => {
    if (!fileInputRef.current?.files?.[0]) {
      alert("Veuillez d'abord uploader un fichier CSV contenant l'historique MT5.");
      return;
    }

    setIsLoading(true);
    
    try {
      const file = fileInputRef.current.files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('symbol', symbol);
      formData.append('initial_capital', initialCapital.toString());

      const res = await fetch('http://localhost:8000/optimize', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (!res.ok || data.error) {
        alert(`Erreur Optimizer: ${data.error || 'Erreur serveur inconnue'}`);
        setIsLoading(false);
        return;
      }

      setResult(data);
    } catch (err) {
      console.error("Optimizer Error:", err);
      alert("Impossible de contacter le serveur Python FastAPI.");
    } finally {
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
                  className="w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-400 hover:file:bg-blue-500/30 transition-all"
                />
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
                <div className="flex items-center space-x-3 mb-6">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-xl font-bold text-white">Meilleurs Paramètres Trouvés</h3>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                    <p className="text-sm text-slate-400">Stop Loss Optimal</p>
                    <p className="text-2xl font-bold text-white">{result.bestParams.sl} pips</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                    <p className="text-sm text-slate-400">Take Profit Optimal</p>
                    <p className="text-2xl font-bold text-white">{result.bestParams.tp} pips</p>
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
                
                <h4 className="text-md font-semibold text-white mb-3">Résultats de la Grid</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/80 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Stop Loss</th>
                        <th className="px-4 py-3">Take Profit</th>
                        <th className="px-4 py-3">Win Rate</th>
                        <th className="px-4 py-3">Max DD</th>
                        <th className="px-4 py-3 rounded-tr-lg">Sharpe Ratio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {result.gridResults.map((r: any, idx: number) => (
                        <tr key={idx} className={r.sharpeRatio === result.bestReport.sharpeRatio ? "bg-emerald-500/10" : ""}>
                          <td className="px-4 py-3">{r.sl}</td>
                          <td className="px-4 py-3">{r.tp}</td>
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
