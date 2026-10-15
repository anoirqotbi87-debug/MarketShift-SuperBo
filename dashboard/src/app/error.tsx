"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for easy developer debugging
    console.error("Dashboard caught client error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="card w-full max-w-md border-rose-900/50 bg-rose-950/20 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-bold uppercase tracking-wider text-zinc-100">
          Erreur d&apos;affichage de la vue
        </h2>
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
          Une anomalie de rendu s&apos;est produite. Les flux du backend continuent de tourner normalement.
        </p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/90 p-3 text-left font-mono text-[11px] text-rose-300">
          {error.message || "Erreur client non spécifiée"}
        </pre>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-mono text-xs font-semibold text-white transition hover:bg-cyan-500"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Recharger la vue
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-300 transition hover:bg-zinc-800"
          >
            Accueil Live
          </button>
        </div>
      </div>
    </div>
  );
}
