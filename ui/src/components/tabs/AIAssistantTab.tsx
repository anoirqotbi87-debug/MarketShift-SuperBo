import React, { useState } from 'react';
import { Sparkles, Send, RefreshCw, Cpu, CheckCircle2 } from 'lucide-react';

export const AIAssistantTab: React.FC = () => {
  const [symbol, setSymbol] = useState<string>('EURUSD');
  const [promptText, setPromptText] = useState<string>('Fournis une synthèse du biais technique H1 et propose un Stop Loss / Take Profit optimal.');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setAnalysisResult(null);

    try {
      const res = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe: 'H1',
          promptText
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Erreur lors de l\'appel API Gemini.');
      } else {
        setAnalysisResult(data.analysis);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur réseau vers le serveur Gemini.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-100 text-xs">
      
      {/* Header */}
      <div className="glass-card rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-600 rounded-xl text-white font-bold shadow-md shadow-indigo-600/30 indigo-glow">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-white text-sm uppercase font-mono tracking-tight">Assistant Contexte Gemini AI</div>
            <div className="text-[10px] text-slate-400 font-sans">Analyse sentiment de marché & validation signaux MT5</div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="glass-card rounded-2xl p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 font-sans">Symbole MT5</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2 text-xs text-white font-mono font-bold mt-1 focus:border-indigo-500 outline-none"
            >
              <option value="EURUSD">EURUSD</option>
              <option value="XAUUSD">XAUUSD (Gold)</option>
              <option value="BTCUSD">BTCUSD</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-sans">Modèle AI Serveur</label>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 text-xs text-indigo-400 font-mono font-bold mt-1">
              Gemini 2.5 Flash
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 font-sans">Question / Prompt pour le Bot</label>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={2}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 text-xs text-white mt-1 focus:outline-none focus:border-indigo-500 font-sans"
          />
        </div>

        {/* Quick Prompts */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] no-scrollbar">
          <span className="text-slate-500 shrink-0 font-sans">Prompts Rapides:</span>
          {[
            'Analyse du biais EURUSD',
            'Calcul Stop Loss ATR Gold',
            'Risque Annonce NFP'
          ].map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => setPromptText(`Donne moi ton analyse pour: ${prompt}`)}
              className="px-2.5 py-1 bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-white rounded-lg shrink-0 transition-colors font-mono"
            >
              {prompt}
            </button>
          ))}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold font-mono text-xs transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 disabled:opacity-50 uppercase tracking-wide"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>{isLoading ? 'Analyse Gemini AI...' : 'GÉNÉRER ANALYSE MARCHÉ'}</span>
        </button>
      </div>

      {/* Error Box if any */}
      {errorMsg && (
        <div className="bg-red-950/80 border border-red-800 text-red-200 p-3 rounded-xl text-xs space-y-1">
          <div className="font-bold text-red-300">Information Clé API / Serveur</div>
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Result View */}
      {analysisResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 animate-fadeIn">
          <div className="font-bold text-cyan-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Analyse Synthétique Gemini AI ({symbol})
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 leading-relaxed whitespace-pre-line text-xs font-sans">
            {analysisResult}
          </div>
        </div>
      )}

    </div>
  );
};
