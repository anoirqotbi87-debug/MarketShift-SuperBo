import React from 'react';
import { PriceAlert } from '../types';
import { BellRing, X, ArrowUpRight, ArrowDownRight, Zap, CheckCircle2 } from 'lucide-react';

export interface ActiveToastAlert {
  id: string;
  alert: PriceAlert;
  triggeredPrice: number;
  timestamp: string;
}

interface PriceAlertToastOverlayProps {
  toasts: ActiveToastAlert[];
  onDismiss: (id: string) => void;
}

export const PriceAlertToastOverlay: React.FC<PriceAlertToastOverlayProps> = ({
  toasts,
  onDismiss
}) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-50 max-w-sm w-full space-y-2 pointer-events-none font-mono">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-slate-900/95 border-2 border-amber-500/90 text-slate-100 p-3.5 rounded-2xl shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 duration-300 space-y-1.5 relative overflow-hidden group"
        >
          {/* Subtle glowing bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-400 animate-pulse" />

          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-amber-950 border border-amber-500 text-amber-400 status-glow shrink-0">
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-white text-sm">{toast.alert.symbol}</span>
                  <span className="px-2 py-0.2 bg-amber-950 text-amber-300 border border-amber-700 text-[9px] rounded-full font-bold">
                    ALERTE FRANCHIE
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">{toast.timestamp}</div>
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs space-y-1 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-[10px] text-slate-400">Condition:</span>
              <span className={`font-bold flex items-center gap-1 ${
                toast.alert.condition === 'ABOVE' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {toast.alert.condition === 'ABOVE' ? (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>≥ AU-DESSUS ({toast.alert.targetPrice})</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>≤ EN-DESSOUS ({toast.alert.targetPrice})</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400">Prix de franchissement:</span>
              <span className="font-extrabold text-amber-300 text-sm">{toast.triggeredPrice}</span>
            </div>

            {toast.alert.note && (
              <div className="text-[10px] text-slate-300 italic pt-0.5 border-t border-slate-800">
                Note: "{toast.alert.note}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
