import React, { useState } from 'react';
import { LogEntry } from '../../types';
import { Terminal, Search, Trash2, Filter, Download } from 'lucide-react';
import { exportLogsToCSV } from '../../utils/csvExport';

interface LogsTabProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogsTab: React.FC<LogsTabProps> = ({ logs, onClearLogs }) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || log.module.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'bg-emerald-950 text-emerald-400 border-emerald-800';
      case 'WARN': return 'bg-amber-950 text-amber-400 border-amber-800';
      case 'ERROR': return 'bg-red-950 text-red-400 border-red-800';
      case 'ML_PRED': return 'bg-purple-950 text-purple-400 border-purple-800';
      case 'CIRCUIT_BREAKER': return 'bg-red-950 text-red-300 border-red-700 font-bold animate-pulse';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-3 text-slate-100 text-xs">
      
      {/* Controls */}
      <div className="glass-card p-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white uppercase tracking-tight font-mono">
            <Terminal className="w-4 h-4 text-indigo-400" />
            Journal Logs MT5 ({logs.length})
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => exportLogsToCSV(logs)}
              className="flex items-center gap-1 text-indigo-300 hover:text-white px-2 py-1 rounded-lg transition-colors bg-indigo-950/80 border border-indigo-700/60 font-mono text-[10px] font-bold shadow-sm"
              title="Exporter les logs au format CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter CSV</span>
            </button>

            <button
              onClick={onClearLogs}
              className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg transition-colors bg-slate-900/60 border border-slate-800"
              title="Effacer les logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] no-scrollbar font-mono">
          {['ALL', 'ML_PRED', 'MT5_EXEC', 'RISK_ALERT', 'CIRCUIT_BREAKER'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded-xl border transition-colors shrink-0 font-bold ${
                filterLevel === lvl
                  ? 'bg-indigo-950/80 border-indigo-600 text-indigo-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Stream */}
      <div className="bg-slate-950/90 border border-slate-800/80 rounded-2xl p-3.5 font-mono text-[10px] space-y-2.5 max-h-80 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-6 text-slate-500">Aucun log correspondant.</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="border-b border-slate-900/80 pb-2 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{log.timestamp}</span>
                <span className={`px-1.5 py-0.2 rounded-md border text-[9px] font-bold ${getLevelBadgeClass(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-indigo-400 font-bold">[{log.module}]</span>
              </div>
              <div className="text-slate-200 pl-2 border-l border-indigo-900/60 font-sans">
                {log.message}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
