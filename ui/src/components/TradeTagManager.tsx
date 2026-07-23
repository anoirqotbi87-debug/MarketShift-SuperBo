import React, { useState } from 'react';
import { Tag, Plus, X, Filter, Check } from 'lucide-react';

interface TradeTagManagerProps {
  tags?: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  readOnly?: boolean;
}

export const PRESET_TAGS = [
  '#Scalp',
  '#DayTrade',
  '#Swing',
  '#AlgoML',
  '#Breakout',
  '#Hedge',
  '#News',
  '#TrendFollow'
];

export const getTagStyle = (tag: string) => {
  const normalized = tag.toLowerCase();
  if (normalized.includes('scalp')) {
    return 'bg-amber-950/80 text-amber-300 border-amber-700/80 hover:bg-amber-900';
  }
  if (normalized.includes('day')) {
    return 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80 hover:bg-indigo-900';
  }
  if (normalized.includes('swing')) {
    return 'bg-purple-950/80 text-purple-300 border-purple-700/80 hover:bg-purple-900';
  }
  if (normalized.includes('ml') || normalized.includes('algo')) {
    return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900';
  }
  if (normalized.includes('breakout')) {
    return 'bg-rose-950/80 text-rose-300 border-rose-700/80 hover:bg-rose-900';
  }
  if (normalized.includes('hedge')) {
    return 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80 hover:bg-cyan-900';
  }
  if (normalized.includes('gold') || normalized.includes('xau')) {
    return 'bg-yellow-950/80 text-yellow-300 border-yellow-700/80 hover:bg-yellow-900';
  }
  if (normalized.includes('forex') || normalized.includes('eur')) {
    return 'bg-blue-950/80 text-blue-300 border-blue-700/80 hover:bg-blue-900';
  }
  return 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700';
};

export const TradeTagPill: React.FC<{
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
  isActive?: boolean;
}> = ({ tag, onRemove, onClick, isActive }) => {
  const baseStyle = getTagStyle(tag);

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-all ${baseStyle} ${
        isActive ? 'ring-1 ring-white shadow-md' : ''
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <Tag className="w-2.5 h-2.5 opacity-80" />
      <span>{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:text-red-400 p-0.5 rounded-full transition-colors"
          title={`Supprimer le tag ${tag}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
};

export const TradeTagManager: React.FC<TradeTagManagerProps> = ({
  tags = [],
  onAddTag,
  onRemoveTag,
  readOnly = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    const clean = customInput.trim();
    const formatted = clean.startsWith('#') ? clean : `#${clean}`;
    onAddTag(formatted);
    setCustomInput('');
    setIsOpen(false);
  };

  const handleSelectPreset = (preset: string) => {
    onAddTag(preset);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-1 flex-wrap">
      {tags.map((tag) => (
        <TradeTagPill
          key={tag}
          tag={tag}
          onRemove={!readOnly ? () => onRemoveTag(tag) : undefined}
        />
      ))}

      {!readOnly && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80 transition-all"
            title="Ajouter une catégorie (#Tag)"
          >
            <Plus className="w-3 h-3 text-indigo-400" />
            <span>Tag</span>
          </button>

          {/* Dropdown Popup */}
          {isOpen && (
            <div className="absolute left-0 mt-1 z-30 w-52 bg-slate-900 border border-indigo-500/50 rounded-xl shadow-2xl p-2.5 text-xs font-mono space-y-2 text-slate-100 backdrop-blur-md">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 border-b border-slate-800 pb-1">
                <span>Catégoriser le trade</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1">
                <span className="text-[9px] text-slate-500 uppercase font-bold">Tags Suggérés :</span>
                <div className="flex flex-wrap gap-1">
                  {PRESET_TAGS.map((preset) => {
                    const isAlreadyAdded = tags.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={isAlreadyAdded}
                        onClick={() => handleSelectPreset(preset)}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${
                          isAlreadyAdded 
                            ? 'opacity-40 bg-slate-950 text-slate-600 border-slate-800 cursor-not-allowed'
                            : 'bg-slate-950 hover:bg-indigo-950 text-slate-300 hover:text-indigo-300 border-slate-800 hover:border-indigo-700'
                        }`}
                      >
                        {preset} {isAlreadyAdded && '✓'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Tag Input */}
              <form onSubmit={handleAddCustom} className="pt-1 border-t border-slate-800 flex gap-1">
                <input
                  type="text"
                  placeholder="#NomTag"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] rounded"
                >
                  +
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
