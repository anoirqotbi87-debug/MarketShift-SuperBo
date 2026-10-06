"use client";

import { useEffect, useState } from "react";
import { Globe, Wifi, WifiOff } from "lucide-react";
import { DEFAULT_PROFILES, getConnection, setConnection } from "@/lib/api";
import type { ConnectionProfile } from "@/types/trading";

interface ConnectionSwitcherProps {
  connected: boolean;
  onReconnect: () => void;
}

export default function ConnectionSwitcher({ connected, onReconnect }: ConnectionSwitcherProps) {
  const [profile, setProfile] = useState<ConnectionProfile>(() => getConnection());
  const [open, setOpen] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setProfile(getConnection());
  }, []);

  const applyProfile = (p: ConnectionProfile) => {
    setConnection(p);
    setProfile(p);
    setOpen(false);
    setMsg(`Connexion basculée vers ${p.apiUrl}`);
    setTimeout(() => setMsg(null), 3000);
    // Force la reconnexion WS immédiate vers la nouvelle URL.
    setTimeout(onReconnect, 150);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          connected
            ? "border-emerald-800 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800"
        }`}
        title="Gérer la connexion hybride"
      >
        {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        <Globe className="h-3.5 w-3.5 opacity-60" />
        <span className="hidden max-w-[160px] truncate sm:inline">{profile.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Connexion hybride
            </p>

            <div className="space-y-1.5">
              {DEFAULT_PROFILES.map((p) => (
                <button
                  key={p.apiUrl}
                  onClick={() => applyProfile(p)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                    profile.apiUrl === p.apiUrl
                      ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-800"
                      : "text-zinc-400 hover:bg-zinc-800/60"
                  }`}
                >
                  <p className="font-medium">{p.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{p.apiUrl}</p>
                </button>
              ))}
            </div>

            <div className="mt-3 border-t border-zinc-800/70 pt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                URL publique (tunnel HTTPS)
              </p>
              <div className="flex gap-2">
                <input
                  value={tunnelUrl}
                  onChange={(e) => setTunnelUrl(e.target.value)}
                  placeholder="https://mon-tunnel.vercel.app"
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-700 focus:outline-none"
                />
                <button
                  onClick={() => {
                    const cleaned = tunnelUrl.trim().replace(/\/$/, "");
                    if (!/^https?:\/\//.test(cleaned)) {
                      setMsg("URL invalide (doit commencer par http(s).");
                      return;
                    }
                    const wsUrl = cleaned.replace(/^http/, "ws").replace(/\/+$/, "");
                    applyProfile({
                      label: "Tunnel personnalisé",
                      apiUrl: cleaned,
                      wsUrl: `${wsUrl}/ws`,
                    });
                  }}
                  className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
                >
                  OK
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                La sélection est persistée en localStorage. Le WebSocket se reconnecte automatiquement.
              </p>
            </div>

            {msg && <p className="mt-2 text-center text-[11px] text-emerald-400">{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}