import React, { useState } from 'react';
import { MT5AccountState, ActivePosition, ClosedTrade, LogEntry } from '../types';
import { exportTradesToCSV, exportLogsToCSV, exportFullReportToCSV } from '../utils/csvExport';
import { Download, FileSpreadsheet, X, CheckCircle, Table, FileText, Database, ShieldCheck } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountState: MT5AccountState;
  positions: ActivePosition[];
  closedTrades: ClosedTrade[];
  logs: LogEntry[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  accountState,
  positions,
  closedTrades,
  logs,
}) => {
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportTrades = () => {
    exportTradesToCSV(positions, closedTrades);
    setDownloadedFormat('trades');
    setTimeout(() => setDownloadedFormat(null), 3000);
  };

  const handleExportLogs = () => {
    exportLogsToCSV(logs);
    setDownloadedFormat('logs');
    setTimeout(() => setDownloadedFormat(null), 3000);
  };

  const handleExportFull = () => {
    exportFullReportToCSV(accountState, positions, closedTrades, logs);
    setDownloadedFormat('full');
    setTimeout(() => setDownloadedFormat(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl relative text-slate-100">
        
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/60 border border-slate-700/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/80 border border-indigo-700/60 rounded-xl text-indigo-400">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase font-mono tracking-tight">
              Exportation Données CSV
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              Exportation hors-ligne pour Excel, Python, MetaTrader & R
            </p>
          </div>
        </div>

        {/* Info stats pill */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-[10px] font-mono">
          <div className="text-center">
            <div className="text-slate-400">Positions</div>
            <div className="font-bold text-indigo-400">{positions.length} actives</div>
          </div>
          <div className="text-center border-x border-slate-800">
            <div className="text-slate-400">Historique</div>
            <div className="font-bold text-emerald-400">{closedTrades.length} fermées</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">Logs</div>
            <div className="font-bold text-purple-400">{logs.length} entrées</div>
          </div>
        </div>

        {/* Success message banner */}
        {downloadedFormat && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-600/80 text-emerald-300 text-xs rounded-xl flex items-center gap-2 font-mono">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Fichier CSV généré et téléchargé avec succès !</span>
          </div>
        )}

        {/* Export Options list */}
        <div className="space-y-2 font-sans text-xs">
          
          {/* Option 1: Trades only */}
          <button
            onClick={handleExportTrades}
            className="w-full text-left p-3 rounded-xl bg-slate-950/60 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-600/60 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 rounded-lg text-indigo-400 group-hover:text-indigo-300">
                <Table className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-white group-hover:text-indigo-200">
                  Historique des Trades (CSV)
                </div>
                <div className="text-[10px] text-slate-400">
                  {positions.length + closedTrades.length} ordres (Tickets, Prix SL/TP, PnL, Raisons ML)
                </div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
          </button>

          {/* Option 2: Logs only */}
          <button
            onClick={handleExportLogs}
            className="w-full text-left p-3 rounded-xl bg-slate-950/60 hover:bg-purple-950/50 border border-slate-800 hover:border-purple-600/60 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-900 rounded-lg text-purple-400 group-hover:text-purple-300">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-white group-hover:text-purple-200">
                  Journal des Logs Systèmes (CSV)
                </div>
                <div className="text-[10px] text-slate-400">
                  {logs.length} entrées (Horodatages, ZeroMQ, Inférences ML, Exécutions)
                </div>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-500 group-hover:text-purple-400" />
          </button>

          {/* Option 3: Full combined report */}
          <button
            onClick={handleExportFull}
            className="w-full text-left p-3 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/90 border border-indigo-600/80 hover:border-indigo-500 transition-all flex items-center justify-between group shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-900/80 rounded-lg text-indigo-200">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-white group-hover:text-white">
                  Rapport Complet & Unifié (CSV)
                </div>
                <div className="text-[10px] text-indigo-200/80">
                  Résumé du compte + Historique complet des trades + Journal des logs
                </div>
              </div>
            </div>
            <Download className="w-4 h-4 text-indigo-300 group-hover:text-white" />
          </button>

        </div>

        {/* Footer info */}
        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Format standard UTF-8 (BOM inclus pour compatibilité Excel instantanée).</span>
        </div>

      </div>
    </div>
  );
};
