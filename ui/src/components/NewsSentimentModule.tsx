import React, { useState } from 'react';
import { NewsItem, NewsSentimentSummary } from '../types';
import { 
  Newspaper, TrendingUp, TrendingDown, RefreshCw, Filter, Zap, ArrowUpRight, ArrowDownRight, ShieldAlert, Sparkles, Scale 
} from 'lucide-react';

interface NewsSentimentModuleProps {
  onApplyNewsWeightToML?: (boostPct: number, reason: string) => void;
}

export const initialNewsFeed: NewsItem[] = [
  {
    id: 'news-1',
    title: 'FED: Powell évoque une baisse des taux de 50 bps si l’inflation recule à 2.1%',
    source: 'Reuters Financial',
    timestamp: 'Il y a 4 min',
    relatedSymbol: 'EURUSD',
    sentiment: 'BULLISH',
    score: 0.85,
    summary: 'Projections dovish sur le dollar américain. Pression haussière immédiate sur EUR/USD et XAU/USD.',
    impactLevel: 'HIGH',
    mlWeightMultiplier: 0.15,
  },
  {
    id: 'news-2',
    title: 'BCE: Lagarde garde une posture neutre face à la volatilité de l’énergie',
    source: 'Bloomberg Markets',
    timestamp: 'Il y a 18 min',
    relatedSymbol: 'EURUSD',
    sentiment: 'NEUTRAL',
    score: 0.05,
    summary: 'Pas de changement direct sur les taux européens. Marché en consolidation range court terme.',
    impactLevel: 'MEDIUM',
    mlWeightMultiplier: 0.0,
  },
  {
    id: 'news-3',
    title: 'Or (XAU/USD): Demande record des banques centrales et risque géopolitique',
    source: 'Financial Times',
    timestamp: 'Il y a 32 min',
    relatedSymbol: 'XAUUSD',
    sentiment: 'BULLISH',
    score: 0.92,
    summary: 'Influx massif de capitaux refuge sur l’Or. Signal fort pour cassure de résistance technique.',
    impactLevel: 'HIGH',
    mlWeightMultiplier: 0.20,
  },
  {
    id: 'news-4',
    title: 'Royaume-Uni: Ventes au détail inférieures aux attentes (-1.2% m/m)',
    source: 'ForexFactory',
    timestamp: 'Il y a 1h',
    relatedSymbol: 'GBPUSD',
    sentiment: 'BEARISH',
    score: -0.74,
    summary: 'Chute des ventes au détail britanniques. Pression vendeuse sur le Sterling.',
    impactLevel: 'HIGH',
    mlWeightMultiplier: -0.18,
  },
  {
    id: 'news-5',
    title: 'Bitcoin: Accumulation des Whales au-dessus du support des $65,000',
    source: 'CoinDesk Pro',
    timestamp: 'Il y a 2h',
    relatedSymbol: 'BTCUSD',
    sentiment: 'BULLISH',
    score: 0.68,
    summary: 'Flux d’entrées nets positifs sur les ETF Bitcoin Spot.',
    impactLevel: 'MEDIUM',
    mlWeightMultiplier: 0.10,
  }
];

export const initialSentimentSummary: NewsSentimentSummary = {
  overallScore: 42,
  overallSentiment: 'BULLISH',
  articlesAnalyzedCount: 38,
  lastUpdated: 'En temps réel (WebSocket)',
  symbolSentiments: {
    'EURUSD': { score: 65, sentiment: 'BULLISH', newsCount: 14 },
    'XAUUSD': { score: 88, sentiment: 'BULLISH', newsCount: 12 },
    'GBPUSD': { score: -45, sentiment: 'BEARISH', newsCount: 7 },
    'BTCUSD': { score: 52, sentiment: 'BULLISH', newsCount: 5 },
  }
};

export const NewsSentimentModule: React.FC<NewsSentimentModuleProps> = ({ onApplyNewsWeightToML }) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [newsList, setNewsList] = useState<NewsItem[]>(initialNewsFeed);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [selectedNewsDetail, setSelectedNewsDetail] = useState<NewsItem | null>(null);

  const filteredNews = selectedSymbol === 'ALL' 
    ? newsList 
    : newsList.filter(n => n.relatedSymbol === selectedSymbol);

  // Compute live average sentiment score
  const avgScore = Math.round(
    filteredNews.reduce((acc, curr) => acc + curr.score * 100, 0) / (filteredNews.length || 1)
  );

  const handleRefreshFeed = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      // Simulate live incoming headline
      const newArticle: NewsItem = {
        id: `news-${Date.now()}`,
        title: `Flash MT5: Rupture de tendance détectée suite à publication IPC US`,
        source: 'Live Algorithmic Stream',
        timestamp: 'À l’instant',
        relatedSymbol: 'EURUSD',
        sentiment: 'BULLISH',
        score: 0.88,
        summary: 'Inflation US sous les prévisions. Ajustement immédiat de la pondération du modèle ML (+14.0%).',
        impactLevel: 'HIGH',
        mlWeightMultiplier: 0.14,
      };
      setNewsList(prev => [newArticle, ...prev]);
      setIsRefreshing(false);
    }, 800);
  };

  const handleAiDeepAnalysis = () => {
    setAiAnalyzing(true);
    setTimeout(() => {
      setAiAnalyzing(false);
      if (onApplyNewsWeightToML) {
        onApplyNewsWeightToML(0.12, 'Pondération Sentiment Actualités (Fed Dovish + Influx Or)');
      }
    }, 1200);
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 border border-slate-800/80 shadow-xl font-sans">
      
      {/* Module Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-indigo-950/90 border border-indigo-700/60 rounded-xl text-indigo-400 status-glow">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Analyse de Sentiment Actualités Financières
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/90 border border-emerald-700/80 text-emerald-400 font-mono animate-pulse">
                • FLUX LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Pondération en temps réel des signaux ML via NLP (Natural Language Processing)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto font-mono text-[11px]">
          <button
            onClick={handleRefreshFeed}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-all"
            title="Rafraîchir les flux RSS & API de news"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleAiDeepAnalysis}
            disabled={aiAnalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold transition-all shadow-md active:scale-95"
            title="Calculer l'impact du sentiment sur la décision ML"
          >
            <Sparkles className={`w-3.5 h-3.5 ${aiAnalyzing ? 'animate-spin' : ''}`} />
            <span>{aiAnalyzing ? 'Analyse NLP...' : 'Injecter au ML'}</span>
          </button>
        </div>
      </div>

      {/* Asset Sentiment Gauges Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        {Object.entries(initialSentimentSummary.symbolSentiments).map(([symbol, data]) => {
          const isBull = data.sentiment === 'BULLISH';
          const isBear = data.sentiment === 'BEARISH';
          return (
            <div 
              key={symbol}
              onClick={() => setSelectedSymbol(symbol === selectedSymbol ? 'ALL' : symbol)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                selectedSymbol === symbol 
                  ? 'bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500/50' 
                  : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-bold text-white">{symbol}</span>
                <span>{data.newsCount} dépêches</span>
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className={`font-bold flex items-center gap-0.5 text-xs ${
                  isBull ? 'text-emerald-400' : isBear ? 'text-red-400' : 'text-slate-300'
                }`}>
                  {isBull ? <TrendingUp className="w-3 h-3" /> : isBear ? <TrendingDown className="w-3 h-3" /> : null}
                  {data.sentiment}
                </span>

                <span className={`font-mono text-xs font-bold ${
                  data.score > 0 ? 'text-emerald-400' : data.score < 0 ? 'text-red-400' : 'text-slate-400'
                }`}>
                  {data.score > 0 ? '+' : ''}{data.score}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden flex">
                <div 
                  className={`h-full ${isBull ? 'bg-emerald-500' : isBear ? 'bg-red-500' : 'bg-slate-400'}`}
                  style={{ width: `${Math.abs(data.score)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ML Decision Weight Impact Box */}
      <div className="bg-indigo-950/40 border border-indigo-700/50 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-900/80 rounded-lg text-indigo-300 shrink-0">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-indigo-200">
              Pondération ML par Sentiment Actualités : <span className="text-emerald-400">+12.0% Confidence Boost</span>
            </div>
            <div className="text-[10px] font-sans text-slate-300">
              Le modèle ML combine le signal technique XGBoost (78.5%) avec le NLP de l’actualité (+12.0%) = <span className="font-bold text-white">90.5% Confiance Finale</span>.
            </div>
          </div>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-indigo-900/90 border border-indigo-600/80 text-[10px] font-bold text-indigo-100 self-end sm:self-auto shrink-0">
          Ajustement Automatique Activé
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
        <span className="text-slate-400 text-[10px] flex items-center gap-1 pr-1">
          <Filter className="w-3 h-3 text-indigo-400" />
          Filtrer:
        </span>
        {['ALL', 'EURUSD', 'XAUUSD', 'GBPUSD', 'BTCUSD'].map(sym => (
          <button
            key={sym}
            onClick={() => setSelectedSymbol(sym)}
            className={`px-2.5 py-1 rounded-lg transition-all font-bold ${
              selectedSymbol === sym 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {sym}
          </button>
        ))}
      </div>

      {/* News Feed Stream List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
        {filteredNews.map((item) => {
          const isBull = item.sentiment === 'BULLISH';
          const isBear = item.sentiment === 'BEARISH';
          const isSelected = selectedNewsDetail?.id === item.id;

          return (
            <div 
              key={item.id}
              onClick={() => setSelectedNewsDetail(isSelected ? null : item)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected 
                  ? 'bg-slate-900 border-indigo-500 shadow-md' 
                  : 'bg-slate-950/70 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 bg-slate-800 text-indigo-300 font-bold rounded border border-slate-700">
                      {item.relatedSymbol}
                    </span>
                    <span className="text-slate-400">{item.source}</span>
                    <span className="text-slate-500">• {item.timestamp}</span>
                    
                    <span className={`px-1.5 py-0.2 rounded font-bold ${
                      item.impactLevel === 'HIGH' 
                        ? 'bg-red-950/80 text-red-300 border border-red-800' 
                        : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                    }`}>
                      IMPACT {item.impactLevel}
                    </span>
                  </div>

                  <h4 className="text-xs font-semibold text-slate-100 hover:text-white transition-colors">
                    {item.title}
                  </h4>

                  <p className="text-[11px] text-slate-400 font-sans line-clamp-2">
                    {item.summary}
                  </p>
                </div>

                <div className="text-right shrink-0 font-mono space-y-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[10px] ${
                    isBull 
                      ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-700/80' 
                      : isBear 
                      ? 'bg-red-950/90 text-red-400 border border-red-700/80' 
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    {isBull ? <ArrowUpRight className="w-3 h-3" /> : isBear ? <ArrowDownRight className="w-3 h-3" /> : null}
                    {item.sentiment} ({(item.score * 100).toFixed(0)}%)
                  </span>

                  <div className="text-[9px] text-indigo-300">
                    Ajust. ML: {item.mlWeightMultiplier > 0 ? '+' : ''}{(item.mlWeightMultiplier * 100).toFixed(0)}%
                  </div>
                </div>
              </div>

              {/* Expanded Detail view */}
              {isSelected && (
                <div className="mt-2.5 pt-2 border-t border-slate-800 text-[11px] text-slate-300 space-y-2 bg-slate-900/90 p-2.5 rounded-lg">
                  <div className="font-bold text-indigo-300 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Impact Analytique NLP sur l'Algorithme MT5 :
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    Cet événement accroît la probabilité du signal <span className="font-bold text-white">{item.relatedSymbol}</span> de <span className="font-bold text-emerald-400">{(item.mlWeightMultiplier * 100).toFixed(1)}%</span>. Le moteur de gestion de risque ajuste automatiquement le lotissement de la position.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};
