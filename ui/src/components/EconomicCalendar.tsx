import React, { useState, useMemo } from 'react';
import { EconomicEvent } from '../types';
import { 
  Calendar, ShieldAlert, ShieldCheck, Filter, Clock, Flame, AlertTriangle, 
  Search, RefreshCw, CheckCircle2, PauseCircle, PlayCircle, Globe2, ArrowUpRight, ArrowDownRight, Info, Zap
} from 'lucide-react';

interface EconomicCalendarProps {
  onAutoTradingGuardChange?: (isPaused: boolean, reason?: string) => void;
}

const INITIAL_EVENTS: EconomicEvent[] = [
  {
    id: 'eco-1',
    title: 'Indice des Prix à la Consommation (CPI YoY)',
    country: 'États-Unis',
    currency: 'USD',
    flagEmoji: '🇺🇸',
    time: '14:30',
    date: 'Aujourd\'hui',
    impact: 'HIGH',
    actual: '3.0%',
    forecast: '3.1%',
    previous: '3.3%',
    category: 'INFLATION',
    autoTradingPaused: true
  },
  {
    id: 'eco-2',
    title: 'Décision sur les Taux d\'Intérêt de la BCE',
    country: 'Zone Euro',
    currency: 'EUR',
    flagEmoji: '🇪🇺',
    time: '15:15',
    date: 'Aujourd\'hui',
    impact: 'HIGH',
    actual: '4.25%',
    forecast: '4.25%',
    previous: '4.50%',
    category: 'CENTRAL_BANK',
    autoTradingPaused: true
  },
  {
    id: 'eco-3',
    title: 'Créations d\'Emplois Non-Agricoles (NFP)',
    country: 'États-Unis',
    currency: 'USD',
    flagEmoji: '🇺🇸',
    time: '14:30',
    date: 'Demain',
    impact: 'HIGH',
    forecast: '185K',
    previous: '206K',
    category: 'EMPLOYMENT',
    autoTradingPaused: true
  },
  {
    id: 'eco-4',
    title: 'Discours du Président de la Fed (Jerome Powell)',
    country: 'États-Unis',
    currency: 'USD',
    flagEmoji: '🇺🇸',
    time: '18:00',
    date: 'Demain',
    impact: 'HIGH',
    category: 'CENTRAL_BANK',
    autoTradingPaused: true
  },
  {
    id: 'eco-5',
    title: 'Produit Intérieur Brut (PIB MoM)',
    country: 'Royaume-Uni',
    currency: 'GBP',
    flagEmoji: '🇬🇧',
    time: '08:00',
    date: 'Aujourd\'hui',
    impact: 'MEDIUM',
    actual: '+0.4%',
    forecast: '+0.2%',
    previous: '0.0%',
    category: 'GROWTH',
    autoTradingPaused: false
  },
  {
    id: 'eco-6',
    title: 'Indice des Prix à la Consommation (CPI Tokyo)',
    country: 'Japon',
    currency: 'JPY',
    flagEmoji: '🇯🇵',
    time: '01:30',
    date: 'Demain',
    impact: 'MEDIUM',
    forecast: '2.3%',
    previous: '2.1%',
    category: 'INFLATION',
    autoTradingPaused: false
  },
  {
    id: 'eco-7',
    title: 'Ventes au Détail (Retail Sales MoM)',
    country: 'Canada',
    currency: 'CAD',
    flagEmoji: '🇨🇦',
    time: '14:30',
    date: 'Demain',
    impact: 'LOW',
    forecast: '-0.2%',
    previous: '+0.7%',
    category: 'TRADE',
    autoTradingPaused: false
  }
];

export const EconomicCalendar: React.FC<EconomicCalendarProps> = ({ onAutoTradingGuardChange }) => {
  const [events, setEvents] = useState<EconomicEvent[]>(INITIAL_EVENTS);
  const [selectedImpact, setSelectedImpact] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Auto Trading Volatility Guard settings
  const [guardEnabled, setGuardEnabled] = useState<boolean>(true);
  const [pauseWindowMinutes, setPauseWindowMinutes] = useState<number>(30); // 15, 30, 60 mins

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchImpact = selectedImpact === 'ALL' || e.impact === selectedImpact;
      const matchCurrency = selectedCurrency === 'ALL' || e.currency === selectedCurrency;
      const matchSearch = searchQuery.trim() === '' || 
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        e.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.currency.toLowerCase().includes(searchQuery.toLowerCase());

      return matchImpact && matchCurrency && matchSearch;
    });
  }, [events, selectedImpact, selectedCurrency, searchQuery]);

  // High Impact count today
  const highImpactTodayCount = useMemo(() => {
    return events.filter(e => e.impact === 'HIGH' && e.date === "Aujourd'hui").length;
  }, [events]);

  // Determine if Auto-Trading is currently paused due to an upcoming high-impact event
  const isAutoTradingCurrentlyPaused = useMemo(() => {
    if (!guardEnabled) return false;
    // Check if any HIGH impact event today is marked autoTradingPaused
    return events.some(e => e.impact === 'HIGH' && e.date === "Aujourd'hui" && e.autoTradingPaused);
  }, [events, guardEnabled]);

  // Toggle Guard globally
  const handleToggleGuard = () => {
    const nextState = !guardEnabled;
    setGuardEnabled(nextState);
    if (onAutoTradingGuardChange) {
      onAutoTradingGuardChange(!nextState, nextState ? undefined : 'Guard Volatilité Désactivé');
    }
  };

  // Toggle single event guard
  const handleToggleEventGuard = (id: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, autoTradingPaused: !e.autoTradingPaused } : e));
  };

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-950 border border-rose-700/60 text-rose-400 status-glow">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Calendrier Économique Macro & Volatility Guard</span>
              <span className="px-2 py-0.2 bg-rose-950 text-rose-300 border border-rose-700 text-[9px] rounded-full font-mono">
                MT5 News Guard
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Événements macroéconomiques majeurs et coupure automatique des robots de trading lors des annonces à fort impact
            </p>
          </div>
        </div>

        {/* Guard Live Status Badge */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
            isAutoTradingCurrentlyPaused
              ? 'bg-rose-950/90 border-rose-600 text-rose-300 animate-pulse'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
          }`}>
            {isAutoTradingCurrentlyPaused ? (
              <>
                <PauseCircle className="w-4 h-4 text-rose-400" />
                <div>
                  <div className="text-[9px] text-rose-300 uppercase font-bold">Auto-Trading Suspendu</div>
                  <div className="text-[10px] font-bold">Fenetre News Haute Volatilité</div>
                </div>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[9px] text-emerald-400 uppercase font-bold">Auto-Trading Actif</div>
                  <div className="text-[10px] font-bold">Guard Actif (Fenêtre de Protection)</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Volatility Guard Control Panel */}
      <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            {/* Toggle Guard Button */}
            <button
              onClick={handleToggleGuard}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all border flex items-center gap-2 ${
                guardEnabled
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-amber-300" />
              <span>{guardEnabled ? 'Filtre Volatilité: ACTIVÉ' : 'Filtre Volatilité: DÉSACTIVÉ'}</span>
            </button>

            {/* Pause Buffer Window Selector */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-slate-400">Fenêtre de Pause:</span>
              {[15, 30, 60].map(mins => (
                <button
                  key={mins}
                  onClick={() => setPauseWindowMinutes(mins)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all ${
                    pauseWindowMinutes === mins
                      ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                      : 'bg-slate-900 text-slate-500 border border-slate-800 hover:text-white'
                  }`}
                >
                  ±{mins} min
                </button>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-slate-400 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Pause automatique des ordres MT5 ±{pauseWindowMinutes} minutes autour des annonces <strong>HIGH</strong>.</span>
          </div>

        </div>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs font-mono">
        
        {/* Impact Level Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="text-slate-400 text-[10px] flex items-center gap-1 mr-1">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Impact:</span>
          </span>
          <button
            onClick={() => setSelectedImpact('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selectedImpact === 'ALL'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setSelectedImpact('HIGH')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selectedImpact === 'HIGH'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            🔥 Élevé (HIGH)
          </button>
          <button
            onClick={() => setSelectedImpact('MEDIUM')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selectedImpact === 'MEDIUM'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            ⚡ Moyen (MED)
          </button>
          <button
            onClick={() => setSelectedImpact('LOW')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selectedImpact === 'LOW'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            🟢 Faible (LOW)
          </button>
        </div>

        {/* Currency Filter & Search */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <select
            value={selectedCurrency}
            onChange={e => setSelectedCurrency(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-[10px] font-bold rounded-lg px-2 py-1 focus:outline-none"
          >
            <option value="ALL">Toutes Devises</option>
            <option value="USD">🇺🇸 USD (Dollar)</option>
            <option value="EUR">🇪🇺 EUR (Euro)</option>
            <option value="GBP">🇬🇧 GBP (Livre Sterling)</option>
            <option value="JPY">🇯🇵 JPY (Yen)</option>
            <option value="CAD">🇨🇦 CAD (Dollar Ca)</option>
          </select>

          <div className="relative w-36">
            <input
              type="text"
              placeholder="Chercher news..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white text-[10px] rounded-lg pl-6 pr-2 py-1 focus:outline-none focus:border-indigo-500"
            />
            <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1.5" />
          </div>
        </div>

      </div>

      {/* Events Table / List */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-8 bg-slate-950/40 rounded-xl border border-slate-800 text-xs font-mono text-slate-500">
          Aucun événement macroéconomique ne correspond aux critères de recherche.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEvents.map(event => (
            <div
              key={event.id}
              className={`p-3 rounded-xl border transition-all font-mono text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                event.impact === 'HIGH'
                  ? 'bg-slate-950/90 border-rose-900/60 hover:border-rose-700'
                  : event.impact === 'MEDIUM'
                  ? 'bg-slate-950/80 border-amber-900/40 hover:border-amber-700'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              {/* Event Main Info */}
              <div className="flex items-center gap-3">
                <span className="text-xl shrink-0" title={event.country}>{event.flagEmoji}</span>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">{event.title}</span>
                    <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-800 text-slate-300 font-bold text-[9px] rounded">
                      {event.currency}
                    </span>

                    {/* Impact Badge */}
                    <span className={`px-2 py-0.2 rounded-full font-bold text-[9px] border ${
                      event.impact === 'HIGH'
                        ? 'bg-rose-950 text-rose-300 border-rose-700'
                        : event.impact === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border-amber-700'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    }`}>
                      {event.impact === 'HIGH' ? '🔥 HIGH' : event.impact === 'MEDIUM' ? '⚡ MED' : '🟢 LOW'}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-indigo-300 font-bold">
                      <Clock className="w-3 h-3" />
                      {event.date} à {event.time}
                    </span>
                    <span className="text-slate-500">| Catégorie: {event.category}</span>
                  </div>
                </div>
              </div>

              {/* Data Values: Actual vs Forecast vs Previous */}
              <div className="flex items-center gap-4 text-right">
                <div className="grid grid-cols-3 gap-3 text-[10px]">
                  <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[9px]">Actuel</div>
                    <div className={`font-bold ${event.actual ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {event.actual || '--'}
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[9px]">Prévision</div>
                    <div className="font-bold text-indigo-300">
                      {event.forecast || '--'}
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
                    <div className="text-slate-500 text-[9px]">Précédent</div>
                    <div className="font-bold text-slate-400">
                      {event.previous || '--'}
                    </div>
                  </div>
                </div>

                {/* Individual Guard Toggle */}
                {event.impact === 'HIGH' && (
                  <button
                    onClick={() => handleToggleEventGuard(event.id)}
                    title="Basculer la coupure de trading pour cet événement"
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1 shrink-0 ${
                      event.autoTradingPaused
                        ? 'bg-rose-950/90 text-rose-300 border-rose-700 hover:bg-rose-900'
                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-white'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>{event.autoTradingPaused ? 'Guard: PAUSE' : 'Guard: OFF'}</span>
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};
