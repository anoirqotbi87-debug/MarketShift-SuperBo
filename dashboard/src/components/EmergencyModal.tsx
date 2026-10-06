"use client";

import { AlertTriangle, Power, X } from "lucide-react";

interface EmergencyModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function EmergencyModal({ open, onClose, onConfirm }: EmergencyModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirmation arrêt d'urgence"
      >
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10">
            <AlertTriangle className="h-6 w-6 text-rose-400" />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h2 className="mt-4 text-lg font-semibold text-zinc-100">Activer le Kill Switch ?</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Cette action <span className="font-semibold text-rose-400">clôture immédiatement toutes
          les positions ouvertes</span> et <span className="font-semibold text-rose-400">fige le
          moteur de trading</span>. Le bot ne négociera plus tant que le circuit breaker n'est pas
          réinitialisé.
        </p>

        <div className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/40 p-3 font-mono text-xs text-rose-300">
          POST /control {"{ \"action\": \"kill\" }"}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
          >
            <Power className="h-4 w-4" />
            Confirmer l&apos;arrêt
          </button>
        </div>
      </div>
    </div>
  );
}