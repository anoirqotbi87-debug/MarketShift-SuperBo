import React from 'react';
import { ReconnectionState } from '../types';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReconnectionToastProps {
  reconnectionState?: ReconnectionState;
}

export const ReconnectionToast: React.FC<ReconnectionToastProps> = ({ reconnectionState }) => {
  return (
    <AnimatePresence>
      {reconnectionState?.isReconnecting && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 w-80 max-w-[calc(100vw-2rem)]"
        >
          <div className="bg-slate-900 border border-amber-500/50 rounded-xl shadow-2xl shadow-amber-900/20 overflow-hidden flex flex-col">
            <div className="p-4 flex gap-3 items-start">
              <div className="p-2 bg-amber-500/10 rounded-lg shrink-0">
                <WifiOff className="w-5 h-5 text-amber-500 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  Connexion MT5 Perdue
                  <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
                </h4>
                <p className="text-xs text-slate-400 mt-1 truncate" title={reconnectionState.lastDisconnectReason}>
                  {reconnectionState.lastDisconnectReason || 'Réseau instable...'}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-medium text-amber-400">
                    Tentative {reconnectionState.attempt} / {reconnectionState.maxAttempts}
                  </span>
                  <span className="text-xs font-mono text-slate-300">
                    {reconnectionState.nextAttemptInSec.toFixed(1)}s
                  </span>
                </div>
              </div>
            </div>
            {/* Progress bar for time remaining */}
            <div className="h-1.5 w-full bg-slate-800">
              <div 
                className="h-full bg-amber-500 transition-all duration-75 ease-linear"
                style={{ width: `${100 - reconnectionState.progressPct}%` }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
