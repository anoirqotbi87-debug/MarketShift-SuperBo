import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LogEntry, AccountState, Position } from '../../types';
import { Terminal, Search, Trash2, Filter, Download, Activity, DollarSign, Briefcase, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { exportLogsToCSV } from '../../utils/csvExport';

interface LogsTabProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  accountState?: AccountState | null;
  positions?: Position[];
}

export const LogsTab: React.FC<LogsTabProps> = ({ logs, onClearLogs, accountState, positions = [] }) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le haut quand les logs changent (car les plus récents sont en haut)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  // Filtrage initial
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
      const matchesSearch = (log.message || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (log.module || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesLevel && matchesSearch;
    });
  }, [logs, filterLevel, searchTerm]);

  // Groupement par Cycle (Timestamp = seconde près)
  const groupedLogs = useMemo(() => {
    const groups: Record<string, LogEntry[]> = {};
    // Parcourir les logs filtrés
    filteredLogs.forEach(log => {
      const timeKey = log.timestamp; // Ex: "03:00:25"
      if (!groups[timeKey]) {
        groups[timeKey] = [];
      }
      groups[timeKey].push(log);
    });
    // Trier les clés (timestamps) du plus récent au plus ancien (En haut)
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    
    // Convertir en array
    return sortedKeys.map(timeKey => ({
      time: timeKey,
      logs: groups[timeKey]
    }));
  }, [filteredLogs]);

  const toggleCycle = (time: string) => {
    setExpandedCycles(prev => ({ ...prev, [time]: prev[time] === undefined ? false : !prev[time] }));
  };

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50';
      case 'WARN': return 'bg-amber-950/80 text-amber-400 border-amber-800/50';
      case 'ERROR': return 'bg-red-950/80 text-red-400 border-red-800/50';
      case 'ML_PRED': return 'bg-purple-950/80 text-purple-400 border-purple-800/50';
      case 'CIRCUIT_BREAKER': return 'bg-red-950/80 text-red-300 border-red-700 font-bold animate-pulse';
      case 'DEBUG': return 'bg-slate-800/80 text-slate-400 border-slate-700/50';
      default: return 'bg-indigo-950/40 text-indigo-300 border-indigo-900/50';
    }
  };

  const getLogIcon = (log: LogEntry) => {
    if (log.message.includes('✅')) return <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />;
    if (log.message.includes('❌')) return <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />;
    return <ChevronRight className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />;
  };

  // Calculs pour le résumé
  const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);

  return (
    <div className="space-y-4 text-slate-100 text-xs flex flex-col h-full">
      
      {/* 1. SUMMARY DASHBOARD HEADER */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card p-3 rounded-2xl border border-indigo-900/30 flex flex-col items-center justify-center text-center shadow-lg">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
            <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
            <span>Balance</span>
          </div>
          <div className="text-sm font-bold text-white font-mono">
            {accountState ? `$${accountState.balance.toFixed(2)}` : '---'}
          </div>
        </div>
        
        <div className="glass-card p-3 rounded-2xl border border-indigo-900/30 flex flex-col items-center justify-center text-center shadow-lg">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>PnL Flottant</span>
          </div>
          <div className={`text-sm font-bold font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
          </div>
        </div>

        <div className="glass-card p-3 rounded-2xl border border-indigo-900/30 flex flex-col items-center justify-center text-center shadow-lg">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
            <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
            <span>Trades Actifs</span>
          </div>
          <div className="text-sm font-bold text-white font-mono">
            {positions.length}
          </div>
        </div>
      </div>

      {/* 2. CONTROLS */}
      <div className="glass-card p-3 rounded-2xl space-y-3 shrink-0 border border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white tracking-tight font-mono">
            <Terminal className="w-4 h-4 text-indigo-400" />
            CYCLES D'ANALYSE ({filteredLogs.length} logs)
          </div>

          <div className="flex items-center gap-1.5">
             <button
              onClick={() => exportLogsToCSV(logs)}
              className="flex items-center gap-1 text-indigo-300 hover:text-white px-2 py-1 rounded-lg transition-colors bg-indigo-950/80 border border-indigo-700/60 font-mono text-[10px] font-bold shadow-sm"
              title="Exporter les logs au format CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={onClearLogs}
              className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg transition-colors bg-slate-900/60 border border-slate-800"
              title="Effacer l'historique"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          {['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded-xl border transition-colors shrink-0 font-bold ${
                filterLevel === lvl
                  ? 'bg-indigo-950/80 border-indigo-600 text-indigo-300'
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* 3. GROUPED LOGS STREAM */}
      <div ref={scrollRef} className="flex-1 min-h-[300px] overflow-y-auto space-y-3 pb-4 no-scrollbar scroll-smooth">
        {groupedLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 mt-10">
             <Terminal className="w-8 h-8 opacity-20" />
             <p>Aucun cycle détecté.</p>
          </div>
        ) : (
          groupedLogs.map((group, idx) => {
            const isExpanded = expandedCycles[group.time] !== false; // expanded by default
            
            // Compter les actions clés du cycle
            const mlDecisions = group.logs.filter(l => l.message.includes('par ML')).length;
            const errors = group.logs.filter(l => l.level === 'ERROR').length;
            const cycleStatusClass = errors > 0 ? 'border-red-900/50 bg-red-950/10' : 
                                     mlDecisions > 0 ? 'border-indigo-900/40 bg-indigo-950/10' : 
                                     'border-slate-800/80 bg-slate-900/20';

            return (
              <div key={group.time} className={`rounded-xl border ${cycleStatusClass} overflow-hidden transition-all duration-300`}>
                {/* En-tête du Cycle */}
                <div 
                  className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 select-none"
                  onClick={() => toggleCycle(group.time)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-300">
                      ⏱️ {group.time}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({group.logs.length} actions)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {mlDecisions > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-purple-950/50 text-purple-400 text-[9px] font-bold border border-purple-900/50">
                        {mlDecisions} ML
                      </span>
                    )}
                    {errors > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-red-950/50 text-red-400 text-[9px] font-bold border border-red-900/50">
                        ERR
                      </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                  </div>
                </div>

                {/* Contenu du Cycle */}
                {isExpanded && (
                  <div className="p-2 pt-0 border-t border-slate-800/50 space-y-1.5 bg-slate-950/40">
                    {group.logs.map((log, i) => (
                      <div key={log.id || `${group.time}-${i}`} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-slate-800/30 group">
                        {getLogIcon(log)}
                        <div className="flex-1 min-w-0 font-mono space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${getLevelBadgeClass(log.level)}`}>
                              {log.module || 'SYS'}
                            </span>
                          </div>
                          <div className={`text-[10.5px] leading-relaxed break-words ${
                            log.message.includes('✅') ? 'text-emerald-300' :
                            log.message.includes('❌') ? 'text-red-300' :
                            log.level === 'DEBUG' ? 'text-slate-500' :
                            log.level === 'WARN' ? 'text-amber-300' :
                            log.level === 'ERROR' ? 'text-red-400' :
                            'text-slate-300'
                          }`}>
                            {/* Nettoyage du tag en début de message car on a déjà le badge */}
                            {log.message.replace(/^\[.*?\]\s*/, '')}
                          </div>
                        </div>
                        <span className="text-[9px] text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          {log.level}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
