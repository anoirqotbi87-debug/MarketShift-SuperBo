import React from 'react';
import { Home, LineChart, Settings, FileText } from 'lucide-react';
import { ViewMode, ActiveTabSimulator } from '../types';

interface BottomNavigationProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  activeTab: ActiveTabSimulator;
  setActiveTab: (tab: ActiveTabSimulator) => void;
}

export function BottomNavigation({ viewMode, setViewMode, activeTab, setActiveTab }: BottomNavigationProps) {
  const handleOpenSettings = () => {
    setViewMode('simulator');
    setActiveTab('mt5_bridge');
    window.dispatchEvent(new Event('open-settings'));
  };

  const handleGoHome = () => {
    setViewMode('simulator');
    setActiveTab('dashboard');
  };

  const handleGoTrading = () => {
    setViewMode('simulator');
    setActiveTab('ml_engine');
  };

  const handleGoDoc = () => {
    setViewMode('doc');
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex items-center justify-around py-3 px-4 z-50 shadow-2xl">
      <button 
        onClick={handleGoHome}
        className={`flex flex-col items-center gap-1 transition-colors ${viewMode === 'simulator' && activeTab === 'dashboard' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Home className="w-5 h-5" />
        <span className="text-[10px] font-medium">Dashboard</span>
      </button>

      <button 
        onClick={handleGoTrading}
        className={`flex flex-col items-center gap-1 transition-colors ${viewMode === 'simulator' && activeTab === 'ml_engine' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <LineChart className="w-5 h-5" />
        <span className="text-[10px] font-medium">Trading</span>
      </button>

      <button 
        onClick={handleGoDoc}
        className={`flex flex-col items-center gap-1 transition-colors ${viewMode === 'doc' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <FileText className="w-5 h-5" />
        <span className="text-[10px] font-medium">Doc</span>
      </button>

      <button 
        onClick={handleOpenSettings}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'mt5_bridge' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Settings className="w-5 h-5" />
        <span className="text-[10px] font-medium">Réglages</span>
      </button>
    </div>
  );
}
