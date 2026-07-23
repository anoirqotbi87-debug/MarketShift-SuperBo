import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  contentClassName?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  defaultExpanded = false,
  children,
  headerRight,
  contentClassName = "p-3.5 space-y-3"
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="glass-card rounded-2xl overflow-hidden mb-3 border border-slate-800 transition-all duration-300">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3.5 flex items-center justify-between transition-colors ${
          isExpanded ? 'bg-slate-900/80 border-b border-slate-800/80' : 'bg-slate-900/40 hover:bg-slate-900/60'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {icon && <div className="text-indigo-400">{icon}</div>}
          <span className="font-bold text-slate-200 text-sm tracking-wide uppercase">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {headerRight}
          <div className={`text-slate-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </button>
      
      <div 
        className={`transition-all duration-300 ease-in-out origin-top ${
          isExpanded ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className={contentClassName}>
          {children}
        </div>
      </div>
    </div>
  );
};
