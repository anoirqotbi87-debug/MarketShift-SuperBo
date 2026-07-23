import React, { useState } from 'react';
import { PriceAlert } from '../types';
import { 
  BellRing, Bell, Plus, Trash2, CheckCircle2, AlertTriangle, ArrowUpRight, 
  ArrowDownRight, RefreshCw, Zap, Play, ToggleLeft, ToggleRight, Sparkles, Filter, Info
} from 'lucide-react';

interface PriceAlertsConfigProps {
  alerts: PriceAlert[];
  setAlerts: React.Dispatch<React.SetStateAction<PriceAlert[]>>;
  currentPrices?: Record<string, number>;
  onTriggerAlertToast?: (alert: PriceAlert, currentPrice: number) => void;
}

const AVAILABLE_SYMBOLS = [
  { symbol: 'EURUSD', name: 'Euro / US Dollar', defaultPrice: 1.0878 },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', defaultPrice: 2390.55 },
  { symbol: 'GBPUSD', name: 'British Pound / USD', defaultPrice: 1.2980 },
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', defaultPrice: 64250.00 },
  { symbol: 'US500', name: 'S&P 500 Index', defaultPrice: 5580.20 },
  { symbol: 'USDJPY', name: 'US Dollar / Yen', defaultPrice: 156.40 },
];

export const PriceAlertsConfig: React.FC<PriceAlertsConfigProps> = ({
  alerts,
  setAlerts,
  currentPrices = {},
  onTriggerAlertToast
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');
  const [targetPrice, setTargetPrice] = useState<string>('1.0890');
  const [note, setNote] = useState<string>('');
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');

  // Helper to get current price for selected symbol
  const getCurrentSymbolPrice = (sym: string): number => {
    if (currentPrices[sym]) return currentPrices[sym];
    const found = AVAILABLE_SYMBOLS.find(s => s.symbol === sym);
    return found ? found.defaultPrice : 1.0000;
  };

  // When symbol selection changes, adjust default target price
  const handleSymbolChange = (sym: string) => {
    setSelectedSymbol(sym);
    const currPrice = getCurrentSymbolPrice(sym);
    if (condition === 'ABOVE') {
      const offset = sym.includes('XAU') ? 10.0 : sym.includes('BTC') ? 500 : 0.0020;
      setTargetPrice((currPrice + offset).toFixed(sym.includes('BTC') || sym.includes('US500') ? 2 : 4));
    } else {
      const offset = sym.includes('XAU') ? 10.0 : sym.includes('BTC') ? 500 : 0.0020;
      setTargetPrice((currPrice - offset).toFixed(sym.includes('BTC') || sym.includes('US500') ? 2 : 4));
    }
  };

  // Add new price alert
  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(targetPrice);
    if (isNaN(priceNum) || priceNum <= 0) return;

    const newAlert: PriceAlert = {
      id: `alert-${Date.now()}`,
      symbol: selectedSymbol,
      condition,
      targetPrice: priceNum,
      note: note.trim() || undefined,
      enabled: true,
      isTriggered: false,
      createdAt: new Date().toLocaleTimeString()
    };

    setAlerts(prev => [newAlert, ...prev]);
    setNote('');
  };

  // Toggle active/paused state
  const handleToggleEnabled = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  // Re-arm triggered alert
  const handleResetAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isTriggered: false, triggeredAt: undefined, triggeredPrice: undefined } : a));
  };

  // Delete alert
  const handleDeleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Simulate Trigger (Manual Test)
  const handleSimulateTrigger = (alert: PriceAlert) => {
    const triggerPrice = alert.condition === 'ABOVE' 
      ? alert.targetPrice + (alert.symbol.includes('BTC') ? 50 : 0.0005)
      : alert.targetPrice - (alert.symbol.includes('BTC') ? 50 : 0.0005);
    
    const timeStr = new Date().toLocaleTimeString();

    setAlerts(prev => prev.map(a => a.id === alert.id ? {
      ...a,
      isTriggered: true,
      triggeredAt: timeStr,
      triggeredPrice: triggerPrice
    } : a));

    if (onTriggerAlertToast) {
      onTriggerAlertToast(alert, triggerPrice);
    }
  };

  // Filtered alerts
  const filteredAlerts = alerts.filter(a => filterSymbol === 'ALL' || a.symbol === filterSymbol);

  const activeAlertsCount = alerts.filter(a => a.enabled && !a.isTriggered).length;
  const triggeredAlertsCount = alerts.filter(a => a.isTriggered).length;

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 font-sans text-slate-100 shadow-xl border border-slate-800">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-950 border border-amber-700/60 text-amber-400 status-glow">
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Gestionnaire d'Alertes de Prix Personnalisables</span>
              <span className="px-2 py-0.2 bg-amber-950 text-amber-300 border border-amber-700 text-[9px] rounded-full font-mono">
                Seuils Temps Réel
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Définissez des seuils d'alerte haut/bas pour vos symboles. Notification toast instantanée au franchissement.
            </p>
          </div>
        </div>

        {/* Counter Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-slate-400 text-[10px]">Alertes Actives: </span>
            <span className="font-bold text-emerald-400">{activeAlertsCount}</span>
          </div>
          <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl">
            <span className="text-slate-400 text-[10px]">Déclenchées: </span>
            <span className="font-bold text-amber-400">{triggeredAlertsCount}</span>
          </div>
        </div>
      </div>

      {/* Creation Form */}
      <form onSubmit={handleAddAlert} className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
        <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wide flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-indigo-400" />
          <span>Configurer une Nouvelle Alerte de Prix</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          
          {/* Symbol Select */}
          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400">Symbole Cible</label>
            <select
              value={selectedSymbol}
              onChange={e => handleSymbolChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500 font-bold"
            >
              {AVAILABLE_SYMBOLS.map(s => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol} - {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Condition Select */}
          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400">Condition de Seuil</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setCondition('ABOVE')}
                className={`py-1 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                  condition === 'ABOVE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3 h-3" />
                <span>≥ AU-DESSUS</span>
              </button>
              <button
                type="button"
                onClick={() => setCondition('BELOW')}
                className={`py-1 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                  condition === 'BELOW'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ArrowDownRight className="w-3 h-3" />
                <span>≤ EN-DESSOUS</span>
              </button>
            </div>
          </div>

          {/* Target Price */}
          <div className="sm:col-span-3 space-y-1">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400">Prix Cible ($)</span>
              <span className="text-slate-500">
                Actuel: <strong className="text-indigo-300">{getCurrentSymbolPrice(selectedSymbol)}</strong>
              </span>
            </div>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={e => setTargetPrice(e.target.value)}
              placeholder="ex: 1.0890"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Optional Note */}
          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400">Note / Libellé (Optionnel)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="ex: Résistance H4"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Créer l'Alerte</span>
          </button>
        </div>
      </form>

      {/* Filter & List Bar */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Alertes Programmées ({filteredAlerts.length})</span>
          </div>

          {/* Symbol Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[10px]">
            <span className="text-slate-500">Filtrer:</span>
            <button
              onClick={() => setFilterSymbol('ALL')}
              className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                filterSymbol === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Tous
            </button>
            {['EURUSD', 'XAUUSD', 'GBPUSD', 'BTCUSD'].map(sym => (
              <button
                key={sym}
                onClick={() => setFilterSymbol(sym)}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                  filterSymbol === sym
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts List */}
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-6 bg-slate-950/40 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-500">
            Aucune alerte de prix configurée pour ce filtre.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredAlerts.map(alert => {
              const livePrice = getCurrentSymbolPrice(alert.symbol);

              return (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border transition-all font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    alert.isTriggered
                      ? 'bg-amber-950/30 border-amber-500/80 shadow-amber-500/10'
                      : alert.enabled
                      ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Status icon badge */}
                    <div className={`p-2 rounded-xl border shrink-0 ${
                      alert.isTriggered
                        ? 'bg-amber-950 border-amber-500 text-amber-400 animate-bounce'
                        : alert.condition === 'ABOVE'
                        ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                        : 'bg-rose-950 border-rose-800 text-rose-400'
                    }`}>
                      {alert.condition === 'ABOVE' ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-sm">{alert.symbol}</span>
                        <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold border ${
                          alert.condition === 'ABOVE'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border-rose-800'
                        }`}>
                          {alert.condition === 'ABOVE' ? '≥ AU-DESSUS' : '≤ EN-DESSOUS'} {alert.targetPrice}
                        </span>

                        {alert.isTriggered && (
                          <span className="px-2 py-0.2 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full animate-pulse">
                            DÉCLENCHÉE ({alert.triggeredAt})
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center gap-3">
                        <span>Prix Actuel: <strong className="text-indigo-300">{livePrice}</strong></span>
                        {alert.note && (
                          <span className="text-slate-300 italic">"{alert.note}"</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side controls */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Simulate Trigger Test */}
                    <button
                      onClick={() => handleSimulateTrigger(alert)}
                      title="Tester le déclenchement immédiat (génère un toast)"
                      className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-700/80 text-amber-300 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>Tester Toast</span>
                    </button>

                    {/* Reset button if triggered */}
                    {alert.isTriggered && (
                      <button
                        onClick={() => handleResetAlert(alert.id)}
                        title="Réarmer l'alerte"
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3 text-indigo-400" />
                        <span>Réarmer</span>
                      </button>
                    )}

                    {/* Enable/Disable Toggle */}
                    <button
                      onClick={() => handleToggleEnabled(alert.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                        alert.enabled
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}
                    >
                      {alert.enabled ? 'ACTIF' : 'PAUSE'}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/50 rounded-lg border border-transparent hover:border-red-900 transition-all"
                      title="Supprimer l'alerte"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
