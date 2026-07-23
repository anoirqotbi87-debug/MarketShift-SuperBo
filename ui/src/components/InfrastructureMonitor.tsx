import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Server, Activity, Clock, Zap } from 'lucide-react';
import { MT5AccountState } from '../types';

interface InfraDataPoint {
  time: string;
  latency: number;
  throughput: number;
}

export const InfrastructureMonitor: React.FC<{ accountState: MT5AccountState }> = ({ accountState }) => {
  const [data, setData] = useState<InfraDataPoint[]>([]);
  const [uptime, setUptime] = useState(0); // in seconds
  
  useEffect(() => {
    // Generate initial data
    const initial = [];
    const now = new Date();
    for (let i = 20; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 1000);
      initial.push({
        time: t.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
        latency: 14 + Math.random() * 5,
        throughput: 120 + Math.random() * 40
      });
    }
    setData(initial);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(prev => prev + 1);
      
      setData(prev => {
        const newData = [...prev.slice(1)];
        const last = prev[prev.length - 1];
        
        let newLatency = accountState.pingMs + (Math.random() * 6 - 3);
        if (newLatency < 5) newLatency = 5;
        
        const newThroughput = 120 + Math.random() * 50;
        
        newData.push({
          time: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
          latency: Number(newLatency.toFixed(1)),
          throughput: Number(newThroughput.toFixed(0))
        });
        
        return newData;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [accountState.pingMs]);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const avgLatency = data.length > 0 ? (data.reduce((acc, curr) => acc + curr.latency, 0) / data.length).toFixed(1) : '0.0';
  const avgThroughput = data.length > 0 ? (data.reduce((acc, curr) => acc + curr.throughput, 0) / data.length).toFixed(0) : '0';

  return (
    <div className="glass-card rounded-2xl p-3.5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
        <Server className="w-5 h-5 text-emerald-400" />
        <h3 className="font-bold uppercase tracking-wider text-sm text-white">MT5 Bridge Infrastructure</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold tracking-wider uppercase">Uptime Session</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {formatUptime(uptime)}
          </div>
        </div>
        
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold tracking-wider uppercase">Avg Latency (Ping)</span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {avgLatency} <span className="text-xs text-emerald-600">ms</span>
          </div>
        </div>
        
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold tracking-wider uppercase">Avg Throughput</span>
          </div>
          <div className="text-xl font-bold font-mono text-indigo-400">
            {avgThroughput} <span className="text-xs text-indigo-600">req/s</span>
          </div>
        </div>
      </div>
      
      <div className="bg-slate-900/40 rounded-xl border border-slate-800 p-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Real-time Network Jitter & Throughput</h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#475569" fontSize={10} tickMargin={8} minTickGap={20} />
              <YAxis yAxisId="left" stroke="#34d399" fontSize={10} domain={['dataMin - 2', 'dataMax + 2']} />
              <YAxis yAxisId="right" orientation="right" stroke="#818cf8" fontSize={10} domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', fontSize: '12px' }}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="latency" 
                name="Latency (ms)"
                stroke="#34d399" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#latencyGradient)"
                isAnimationActive={false}
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="throughput" 
                name="Throughput (req/s)"
                stroke="#818cf8" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#throughputGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
