"use client";

import { useEffect, useState } from "react";
import { Activity, Clock, Cpu, MemoryStick, Server, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchSystemHealth } from "@/lib/api";

interface InfraPoint {
  time: string;
  latency: number;
  throughput: number;
  cpu: number;
  ram: number;
}

/** Moniteur d'infrastructure MT5 — backend /system-health, polling 2s. */
export default function InfraMonitor() {
  const [points, setPoints] = useState<InfraPoint[]>(() => seed(60));
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now() / 1000;

    const tick = async () => {
      if (!cancelled) setUptime(Math.floor(Date.now() / 1000 - start));

      const h = await fetchSystemHealth();
      if (!h || cancelled) return;

      setPoints((prev) => {
        const next = [...prev.slice(1)];
        next.push({
          time: h.time,
          latency: h.latency,
          throughput: h.throughput,
          cpu: h.cpu_usage,
          ram: h.ram_usage,
        });
        return next;
      });
    };

    tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const avg =
    points.reduce((acc, p) => acc + p.latency, 0) / Math.max(1, points.length);
  const avgTp =
    points.reduce((acc, p) => acc + p.throughput, 0) / Math.max(1, points.length);
  const last = points[points.length - 1];

  const fmtUptime = (s: number) =>
    [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center gap-2 border-b border-zinc-800/70 pb-3">
        <Server className="h-4 w-4 text-emerald-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          MT5 Bridge Infrastructure
        </h3>
        <span className="ml-auto font-mono text-[10px] text-zinc-500">
          {fmtUptime(uptime)}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Metric icon={<Clock className="h-3.5 w-3.5" />} label="Ping MT5" value={`${avg.toFixed(1)}`} unit="ms" accent="text-emerald-400" />
        <Metric icon={<Zap className="h-3.5 w-3.5" />} label="Throughput" value={`${avgTp.toFixed(0)}`} unit="req/s" accent="text-indigo-400" />
        <Metric
          icon={<Activity className="h-3.5 w-3.5" />}
          label="CPU / RAM"
          value={`${Math.round(last?.cpu ?? 0)}% / ${Math.round(last?.ram ?? 0)}%`}
          unit=""
          accent="text-cyan-400"
        />
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 5, right: 0, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="infraLat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="infraTp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" vertical={false} />
            <XAxis dataKey="time" stroke="#52525b" fontSize={9} tickLine={false} minTickGap={24} />
            <YAxis yAxisId="l" stroke="#34d399" fontSize={9} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} />
            <YAxis yAxisId="r" orientation="right" stroke="#818cf8" fontSize={9} tickLine={false} domain={["dataMin - 10", "dataMax + 10"]} />
            <Tooltip
              contentStyle={{ backgroundColor: "#101012", borderColor: "#27272a", fontSize: "12px" }}
              itemStyle={{ fontWeight: "bold" }}
            />
            <Area yAxisId="l" type="monotone" dataKey="latency" name="Latence (ms)" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#infraLat)" isAnimationActive={false} />
            <Area yAxisId="r" type="monotone" dataKey="throughput" name="Throughput" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#infraTp)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3 w-3" /> CPU {Math.round(last?.cpu ?? 0)}%
        </span>
        <span className="inline-flex items-center gap-1">
          <MemoryStick className="h-3 w-3" /> RAM {Math.round(last?.ram ?? 0)}%
        </span>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-zinc-500">
        {icon}
        <span className="font-mono text-[9px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono text-lg font-bold text-zinc-100">
        {value} <span className={`text-xs ${accent}`}>{unit}</span>
      </div>
    </div>
  );
}

function seed(n: number): InfraPoint[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now - (n - i) * 2000);
    return {
      time: d.toLocaleTimeString("fr-FR", { hour12: false }),
      latency: 0,
      throughput: 0,
      cpu: 0,
      ram: 0,
    };
  });
}