import React, { useState, useMemo } from 'react';
import { NewsItem } from '../types';
import { 
  Newspaper, RefreshCw, Sparkles, Filter, TrendingUp, TrendingDown, 
  Minus, Zap, Search, Globe, ChevronRight, AlertCircle, ExternalLink, Info, CheckCircle2, X
} from 'lucide-react';

interface MarketNewsProps {
  onApplyNewsWeightToML?: (boostPct: number, reason: string) => void;
}

export const INITIAL_MARKET_NEWS: NewsItem[] = [
  {
    id: 'mn-1',
    title: 'FED: Powell évoque une trajectoire assouplie si l’inflation confirme sa décélération à 2.1%',
    source: 'Reuters Macro',
    timestamp: 'Il y a 3 min',
    relatedSymbol: 'EURUSD',
    sentiment: 'BULLISH',
    score: 0.85,
    summary: 'Discours interprété comme très dovish par les marchés de taux. Pression immédiate à la baisse sur l’indice Dollar (DXY).',
    impactLevel: 'HIGH',
    mlWeightMultiplier: 0.18,
  },
  {
    id: 'mn-2',
    title: 'Or (XAU/USD): Demande physique record des banques centrales et tensions géopolitiques au Moyen-Orient',
    source: 'Bloomberg Markets',
    timestamp: 'Il y a 12 min',
    relatedSymbol: 'XAUUSD',
    sentiment: 'BULLISH',
    score: 0.92,
    summary: 'Rupture de résistance majeure à $2,400. Influx massifs de capitaux institutionnels sur les trackers or.',
    impactLevel: 'HIGH',
    mlWeightMultiplier: 0.22,
  },
  {
    id: 'mn-3',
    title: 'Royaume-Uni: Dégradation inattendue des ventes au détail (-1.4% m/m)',
    source: 'Financial Times',
    timestamp: 'Il y a 28 min',
    relatedSymbol: 'GBPUSD',
    sentiment: 'BEARISH',
    score: -0.76,
    summary: 'Chiffres de consommation britannique nettement inférieurs aux prévisions du consensus Reuters.',
    impactLevel: 'HIGH',
    mlWeightMultiplier: -0.16,
  },
  {
    id: 'mn-4',
    title: 'S&P 500 / US500: Rebond du secteur technologique mené par les semi-conducteurs',
    source: 'CNBC Pro',
    timestamp: 'Il y a 45 min',
    relatedSymbol: 'US500',
    sentiment: 'BULLISH',
    score: 0.64,
    summary: 'Résultats trimestriels solides au-dessus des attentes. Les contrats futures US sont orientés au vert.',
    impactLevel: 'MEDIUM',
    mlWeightMultiplier: 0.10,
  },
  {
    id: 'mn-5',
    title: 'Bitcoin: Prises de bénéfices modérées sous les $68,000 en séance asiatique',
    source: 'CoinDesk Daily',
    timestamp: 'Il y a 1h',
    relatedSymbol: 'BTCUSD',
    sentiment: 'BEARISH',
    score: -0.32,
    summary: 'Correction technique mineure après le rally de la veille. Les volumes restent soutenus.',
    impactLevel: 'MEDIUM',
    mlWeightMultiplier: -0.05,
  },
  {
    id: 'mn-6',
    title: 'BCE: Stabilité des taux directeurs confirmée lors de la déclaration du Conseil des Gouverneurs',
    source: 'Euronews Business',
    timestamp: 'Il y a 2h',
    relatedSymbol: 'EURUSD',
    sentiment: 'NEUTRAL',
    score: 0.05,
    summary: 'Décision conforme aux anticipations. La BCE maintient une approche dépendante des données économiques.',
    impactLevel: 'LOW',
    mlWeightMultiplier: 0.0,
  }
];

export const MarketNews: React.FC<MarketNewsProps> = ({ onApplyNewsWeightToML }) => {
  const [newsList, setNewsList] = useState<NewsItem[]>(INITIAL_MARKET_NEWS);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);

  // Filter headlines
  const filteredNews = useMemo(() => {
    return newsList.filter(item => {
      const matchesSymbol = selectedSymbol === 'ALL' || item.relatedSymbol === selectedSymbol;
      const matchesSearch = searchQuery.trim() === '' || 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSymbol && matchesSearch;
    });
  }, [newsList, selectedSymbol, searchQuery]);

  // Aggregate Sentiment Score mapped strictly from -1.0 to +1.0
  const avgSentimentScore = useMemo(() => {
    if (filteredNews.length === 0) return 0.0;
    const sum = filteredNews.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round((sum / filteredNews.length) * 100) / 100;
  }, [filteredNews]);

  // Handle live refresh simulation
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      // Slightly fluctuate scores to simulate real-time feed updates
      setNewsList(prev => prev.map(item => ({
        ...item,
        score: Math.max(-1.0, Math.min(1.0, Math.round((item.score + (Math.random() * 0.1 - 0.05)) * 100) / 100))
      })));
      setIsRefreshing(false);
    }, 600);
  };

  // Simulate incoming breaking news headline
  const handleSimulateBreakingNews = () => {
    const breakingTemplates: Partial<NewsItem>[] = [
      {
        title: 'FLASH MACRO: NFP US +290k créations d\'emplois, salaire horaire +0.4%',
        source: 'Dow Jones Wire',
        relatedSymbol: 'EURUSD',
        sentiment: 'BEARISH',
        score: -0.88,
        summary: 'Resserrement fort du marché du travail américain. Le Dollar s\'apprécie fortement face à l\'Euro.',
        impactLevel: 'HIGH',
        mlWeightMultiplier: -0.25
      },
      {
        title: 'BÂLE III: Nouvelles normes de réserve bancaire favorables aux métaux précieux',
        source: 'World Gold Council',
        relatedSymbol: 'XAUUSD',
        sentiment: 'BULLISH',
        score: 0.95,
        summary: 'Poussée haussière violente sur les cours de l\'Or. Signal d\'achat confirmé par les modèles ML.',
        impactLevel: 'HIGH',
        mlWeightMultiplier: 0.28
      },
      {
        title: 'SEC: Approbation officielle de nouveaux instruments ETF Crypto Spot',
        source: 'Bloomberg Crypto',
        relatedSymbol: 'BTCUSD',
        sentiment: 'BULLISH',
        score: 0.82,
        summary: 'Afflux massif de capitaux institutionnels prévus sur le marché spot des cryptomonnaies.',
        impactLevel: 'HIGH',
        mlWeightMultiplier: 0.20
      }
    ];

    const randomTemplate = breakingTemplates[Math.floor(Math.random() * breakingTemplates.length)];
    const newItem: NewsItem = {
      id: `news-${Date.now()}`,
      title: randomTemplate.title || 'Dépêche Financière Urgente',
      source: randomTemplate.source || 'AISTUDIO Wire',
      timestamp: 'À l\'instant',
      relatedSymbol: randomTemplate.relatedSymbol || 'EURUSD',
      sentiment: randomTemplate.sentiment || 'BULLISH',
      score: randomTemplate.score ?? 0.75,
      summary: randomTemplate.summary || 'Nouvelle analyse macro-économique en direct.',
      impactLevel: randomTemplate.impactLevel || 'HIGH',
      mlWeightMultiplier: randomTemplate.mlWeightMultiplier ?? 0.15
    };

    setNewsList(prev => [newItem, ...prev]);
  };

  // Convert -1.0 to +1.0 score to percentage for UI needle gauge (0% to 100%)
  const gaugePercentage = Math.round(((avgSentimentScore + 1.0) / 2.0) * 100);

  // Score label text & theme styling
  const getSentimentLabel = (score: number) => {
    if (score >= 0.6) return { text: 'HAUSSIER TRÈS FORT', color: 'text-emerald-400', bg: 'bg-emerald-950/80', border: 'border-emerald-700/60' };
    if (score >= 0.2) return { text: 'MODÉRÉMENT HAUSSIER', color: 'text-teal-400', bg: 'bg-teal-950/80', border: 'border-teal-700/60' };
    if (score >= -0.2) return { text: 'NEUTRE / ÉQUILIBRÉ', color: 'text-slate-300', bg: 'bg-slate-900', border: 'border-slate-700' };
    if (score >= -0.6) return { text: 'MODÉRÉMENT BAISSIER', color: 'text-amber-400', bg: 'bg-amber-950/80', border: 'border-amber-700/60' };
    return { text: 'BAISSIER TRÈS FORT', color: 'text-red-400', bg: 'bg-red-950/80', border: 'border-red-700/60' };
  };

  const sentimentTheme = getSentimentLabel(avgSentimentScore);

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/60 text-indigo-400 status-glow">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Market News & Sentiment Indicator</span>
              <span className="px-2 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700 text-[9px] rounded-full font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Feed
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Flux d'actualités financières avec cartographie du score de sentiment (-1.0 à +1.0)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateBreakingNews}
            className="px-2.5 py-1.5 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono font-bold transition-all shadow-md flex items-center gap-1.5"
            title="Simuler une nouvelle dépêche financière d'urgence"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-300" />
            <span>+ Dépêche Flash</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition-colors"
            title="Rafraîchir le flux de news"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dynamic Sentiment Score Gauge Indicator (-1.00 to +1.00) */}
      <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Indicateur Dynamique de Sentiment Global (Échelle -1.00 à +1.00)
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-black font-mono tracking-tight ${sentimentTheme.color}`}>
                {avgSentimentScore > 0 ? `+${avgSentimentScore.toFixed(2)}` : avgSentimentScore.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-slate-400">/ 1.00</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md border font-mono ${sentimentTheme.bg} ${sentimentTheme.color} ${sentimentTheme.border}`}>
                {sentimentTheme.text}
              </span>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 text-right">
            <span>{filteredNews.length} dépêche(s) analysée(s)</span>
            <div className="text-[10px] text-slate-500">Mise à jour NLP en temps réel</div>
          </div>
        </div>

        {/* Visual Gauge Bar (-1.0 to +1.0) */}
        <div className="space-y-1">
          <div className="relative w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-800 p-0.5 flex">
            {/* Bearish zone -1.0 to -0.3 */}
            <div className="w-[35%] h-full bg-gradient-to-r from-red-600 to-amber-600 opacity-60 rounded-l-full" />
            {/* Neutral zone -0.3 to +0.3 */}
            <div className="w-[30%] h-full bg-slate-800 opacity-80" />
            {/* Bullish zone +0.3 to +1.0 */}
            <div className="w-[35%] h-full bg-gradient-to-r from-teal-500 to-emerald-500 opacity-60 rounded-r-full" />

            {/* Dynamic Needle Pointer */}
            <div 
              className="absolute top-0 bottom-0 w-1.5 bg-white shadow-[0_0_10px_#ffffff] rounded-full transition-all duration-500 transform -translate-x-1/2"
              style={{ left: `${gaugePercentage}%` }}
              title={`Score exact: ${avgSentimentScore}`}
            />
          </div>

          {/* Scale Legend Ticks */}
          <div className="flex justify-between text-[9px] font-mono text-slate-400 px-1 pt-0.5">
            <span className="text-red-400 font-bold">-1.00 (Extrême Baisse)</span>
            <span className="text-amber-400 font-bold">-0.50</span>
            <span className="text-slate-300 font-bold">0.00 (Neutre)</span>
            <span className="text-teal-400 font-bold">+0.50</span>
            <span className="text-emerald-400 font-bold">+1.00 (Extrême Hausse)</span>
          </div>
        </div>
      </div>

      {/* Filtering & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
        
        {/* Symbol Filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs font-mono">
          <span className="text-slate-400 text-[10px] flex items-center gap-1 pr-1">
            <Filter className="w-3 h-3 text-indigo-400" />
            <span>Paire:</span>
          </span>
          {['ALL', 'EURUSD', 'XAUUSD', 'GBPUSD', 'BTCUSD', 'US500'].map(sym => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all ${
                selectedSymbol === sym
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {sym === 'ALL' ? 'TOUTES' : sym}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-48">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher dépêche..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
      </div>

      {/* Headlines List */}
      <div className="space-y-2.5">
        {filteredNews.length === 0 ? (
          <div className="text-center py-8 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-500 font-mono">
            Aucune dépêche trouvée pour les critères sélectionnés.
          </div>
        ) : (
          filteredNews.map(item => {
            const isBullish = item.score > 0.1;
            const isBearish = item.score < -0.1;

            return (
              <div 
                key={item.id}
                onClick={() => setSelectedArticle(item)}
                className="bg-slate-950/80 hover:bg-slate-900/90 p-3.5 rounded-xl border border-slate-800/80 hover:border-indigo-700/60 transition-all cursor-pointer space-y-2 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                      <span className="font-bold text-slate-300">{item.source}</span>
                      <span>•</span>
                      <span>{item.timestamp}</span>
                      <span>•</span>
                      <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-700 text-indigo-300 rounded font-bold">
                        {item.relatedSymbol}
                      </span>
                      {item.impactLevel === 'HIGH' && (
                        <span className="px-1.5 py-0.2 bg-red-950 text-red-300 border border-red-800 rounded font-bold text-[9px]">
                          IMPACT FORT
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2 leading-relaxed">
                      {item.title}
                    </h4>
                  </div>

                  {/* Explicit Sentiment Score Badge (-1.0 to +1.0) */}
                  <div className={`shrink-0 px-2.5 py-1 rounded-xl border font-mono font-bold text-xs flex items-center gap-1 ${
                    isBullish 
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60' 
                      : isBearish 
                      ? 'bg-red-950/80 text-red-400 border-red-700/60' 
                      : 'bg-slate-900 text-slate-300 border-slate-700'
                  }`}>
                    {isBullish ? <TrendingUp className="w-3.5 h-3.5" /> : isBearish ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    <span>{item.score > 0 ? `+${item.score.toFixed(2)}` : item.score.toFixed(2)}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-normal">
                  {item.summary}
                </p>

                {/* Individual Article Progress Heatbar (-1.0 to +1.0) */}
                <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <div className="flex items-center gap-1">
                    <span>Impact ML Signal :</span>
                    <span className={`font-bold ${item.mlWeightMultiplier >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.mlWeightMultiplier >= 0 ? `+${Math.round(item.mlWeightMultiplier * 100)}%` : `${Math.round(item.mlWeightMultiplier * 100)}%`}
                    </span>
                  </div>
                  <span className="text-indigo-400 group-hover:underline flex items-center gap-0.5">
                    Détails analyse <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Article Detail Inspection Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl max-w-lg w-full p-5 space-y-4 font-sans text-slate-100 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setSelectedArticle(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-indigo-400">
                <span>{selectedArticle.source}</span>
                <span>•</span>
                <span>{selectedArticle.timestamp}</span>
              </div>
              <h3 className="text-sm font-bold text-white leading-snug">
                {selectedArticle.title}
              </h3>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Score de Sentiment NLP :</span>
                <span className={`font-extrabold text-sm ${
                  selectedArticle.score > 0 ? 'text-emerald-400' : selectedArticle.score < 0 ? 'text-red-400' : 'text-slate-300'
                }`}>
                  {selectedArticle.score > 0 ? `+${selectedArticle.score}` : selectedArticle.score} / 1.00
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Paire Concernée :</span>
                <span className="font-bold text-white">{selectedArticle.relatedSymbol}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Pondération Modèle ML :</span>
                <span className="font-bold text-indigo-300">
                  {selectedArticle.mlWeightMultiplier >= 0 ? `+${selectedArticle.mlWeightMultiplier * 100}%` : `${selectedArticle.mlWeightMultiplier * 100}%`}
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <h5 className="font-bold text-slate-300 font-mono text-[11px] uppercase">Résumé & Analyse :</h5>
              <p className="text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                {selectedArticle.summary}
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              {onApplyNewsWeightToML && (
                <button
                  onClick={() => {
                    onApplyNewsWeightToML(selectedArticle.mlWeightMultiplier, selectedArticle.title);
                    setSelectedArticle(null);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Intégrer au ML
                </button>
              )}
              <button
                onClick={() => setSelectedArticle(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono font-bold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
