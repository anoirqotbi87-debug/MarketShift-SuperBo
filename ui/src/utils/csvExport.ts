import { ActivePosition, ClosedTrade, LogEntry, MT5AccountState } from '../types';

/**
 * Escapes CSV field value to handle commas, quotes, and newlines safely.
 */
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Trigger file download in browser
 */
export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports trade history (Active positions & Closed trades) to CSV file
 */
export function exportTradesToCSV(
  positions: ActivePosition[], 
  closedTrades: ClosedTrade[], 
  filename: string = `MarketShift_Trades_${new Date().toISOString().slice(0, 10)}.csv`
) {
  const headers = [
    'Ticket',
    'Statut',
    'Symbole',
    'Type',
    'Lots',
    'Prix Ouverture',
    'Prix Clôture/Actuel',
    'Stop Loss',
    'Take Profit',
    'PnL ($)',
    'PnL (%)',
    'Heure Ouverture',
    'Heure Clôture',
    'Magic Number',
    'Confiance ML (%)',
    'Raison du Signal'
  ];

  const rows: string[][] = [];

  // Active positions
  positions.forEach(p => {
    rows.push([
      escapeCSV(p.ticket),
      escapeCSV('EN COURS'),
      escapeCSV(p.symbol),
      escapeCSV(p.type),
      escapeCSV(p.lots),
      escapeCSV(p.openPrice),
      escapeCSV(p.currentPrice),
      escapeCSV(p.stopLoss),
      escapeCSV(p.takeProfit),
      escapeCSV(p.pnl.toFixed(2)),
      escapeCSV(p.pnlPct.toFixed(2)),
      escapeCSV(p.openTime),
      escapeCSV('-'),
      escapeCSV(p.magicNumber),
      escapeCSV(p.mlConfidence),
      escapeCSV(p.signalReason)
    ]);
  });

  // Closed trades
  closedTrades.forEach(c => {
    rows.push([
      escapeCSV(c.ticket),
      escapeCSV(`FERMÉ (${c.closeReason})`),
      escapeCSV(c.symbol),
      escapeCSV(c.type),
      escapeCSV(c.lots),
      escapeCSV(c.openPrice),
      escapeCSV(c.closePrice),
      escapeCSV(c.stopLoss),
      escapeCSV(c.takeProfit),
      escapeCSV(c.pnl.toFixed(2)),
      escapeCSV(c.pnlPct.toFixed(2)),
      escapeCSV(c.openTime),
      escapeCSV(c.closeTime),
      escapeCSV(c.magicNumber),
      escapeCSV(c.mlConfidence),
      escapeCSV(c.signalReason)
    ]);
  });

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  downloadCSV(filename, csvContent);
}

/**
 * Exports system logs to CSV file
 */
export function exportLogsToCSV(
  logs: LogEntry[], 
  filename: string = `MarketShift_Logs_${new Date().toISOString().slice(0, 10)}.csv`
) {
  const headers = ['ID', 'Horodatage', 'Niveau', 'Module', 'Message'];

  const rows = logs.map(l => [
    escapeCSV(l.id),
    escapeCSV(l.timestamp),
    escapeCSV(l.level),
    escapeCSV(l.module),
    escapeCSV(l.message)
  ]);

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  downloadCSV(filename, csvContent);
}

/**
 * Exports complete account summary, trade history and system logs in a single CSV file
 */
export function exportFullReportToCSV(
  accountState: MT5AccountState,
  positions: ActivePosition[],
  closedTrades: ClosedTrade[],
  logs: LogEntry[],
  filename: string = `MarketShift_Rapport_Complet_${new Date().toISOString().slice(0, 10)}.csv`
) {
  const sections: string[] = [];

  // 1. Account Summary Header
  sections.push('=== COMPTE MT5 MARKETSHIFT PRO ===');
  sections.push(['Compte', 'Courtier', 'Serveur', 'Solde ($)', 'Équité ($)', 'Marge Libre ($)', 'PnL Jour ($)', 'Mode'].map(escapeCSV).join(','));
  sections.push([
    accountState.accountNumber,
    accountState.broker,
    accountState.server,
    accountState.balance.toFixed(2),
    accountState.equity.toFixed(2),
    accountState.freeMargin.toFixed(2),
    accountState.dailyPnL.toFixed(2),
    accountState.isPaperTrading ? 'Paper Trading' : 'MT5 Réel'
  ].map(escapeCSV).join(','));

  sections.push('\n=== HISTORIQUE DES TRADES (EN COURS ET FERMÉS) ===');
  const tradeHeaders = [
    'Ticket', 'Statut', 'Symbole', 'Type', 'Lots', 'Prix Ouvert', 'Prix Clôturé/Actuel', 
    'SL', 'TP', 'PnL ($)', 'PnL (%)', 'Heure Ouvert', 'Heure Fermé', 'Confiance ML (%)', 'Raison'
  ];
  sections.push(tradeHeaders.map(escapeCSV).join(','));

  positions.forEach(p => {
    sections.push([
      p.ticket, 'EN COURS', p.symbol, p.type, p.lots, p.openPrice, p.currentPrice,
      p.stopLoss, p.takeProfit, p.pnl.toFixed(2), p.pnlPct.toFixed(2), p.openTime, '-', p.mlConfidence, p.signalReason
    ].map(escapeCSV).join(','));
  });

  closedTrades.forEach(c => {
    sections.push([
      c.ticket, `FERMÉ (${c.closeReason})`, c.symbol, c.type, c.lots, c.openPrice, c.closePrice,
      c.stopLoss, c.takeProfit, c.pnl.toFixed(2), c.pnlPct.toFixed(2), c.openTime, c.closeTime, c.mlConfidence, c.signalReason
    ].map(escapeCSV).join(','));
  });

  sections.push('\n=== JOURNAL DES LOGS ET ÉVÉNEMENTS MT5 ===');
  sections.push(['ID', 'Horodatage', 'Niveau', 'Module', 'Message'].map(escapeCSV).join(','));
  logs.forEach(l => {
    sections.push([l.id, l.timestamp, l.level, l.module, l.message].map(escapeCSV).join(','));
  });

  const fullCSV = sections.join('\n');
  downloadCSV(filename, fullCSV);
}
