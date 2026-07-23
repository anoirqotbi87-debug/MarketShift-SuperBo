import React, { useState } from 'react';
import { ARCHITECTURE_SECTIONS } from '../data/architectureDocs';
import { 
  BookOpen, Search, Copy, Check, Code, Shield, Cpu, Database, 
  Server, Smartphone, ArrowRight, Download, CheckCircle2, AlertTriangle, Layers, Zap 
} from 'lucide-react';

export const ArchitectureDocView: React.FC = () => {
  const [activeSectionId, setActiveSectionId] = useState<string>('sec-1');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<string | null>(null);

  const activeSection = ARCHITECTURE_SECTIONS.find(s => s.id === activeSectionId) || ARCHITECTURE_SECTIONS[0];

  const handleCopyCode = (code: string, indexKey: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(indexKey);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  const handleDownloadPlan = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ARCHITECTURE_SECTIONS, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "Plan_Action_Bot_Trading_MT5_Android_ML.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredSections = ARCHITECTURE_SECTIONS.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sec.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sec.subsections.some(sub => sub.title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Top Banner & Call to Action */}
      <div className="glass-card rounded-2xl p-6 md:p-8 mb-8 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-950/80 border border-indigo-700/60 rounded-full text-indigo-300 text-xs font-mono font-bold mb-3 uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              Spécification Technique MarketShift Pro V3.4
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight uppercase">
              Plan d'Action Technique : MarketShift Pro V3.4
            </h1>
            <p className="text-slate-300 text-sm mt-2 max-w-3xl leading-relaxed">
              Guide complet d'architecture logicielle, spécifications de l'application mobile Kotlin Jetpack Compose, pipeline de prédiction Machine Learning d'ensemble et bridge MT5 ZeroMQ à haute fréquence.
            </p>
          </div>

          <button
            onClick={handleDownloadPlan}
            className="flex items-center gap-2.5 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs font-mono rounded-xl shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 shrink-0 uppercase tracking-wide"
          >
            <Download className="w-4 h-4" />
            Télécharger Plan (JSON)
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar + Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Search Box */}
          <div className="relative font-mono">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une section, un code..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Section List */}
          <div className="glass-card rounded-2xl p-3 space-y-2">
            <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
              Sections Architecture ({filteredSections.length}/6)
            </div>

            {filteredSections.map((sec) => {
              const isActive = sec.id === activeSection.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-indigo-950/80 border-indigo-600/80 text-white shadow-md'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs font-mono font-bold shrink-0 ${
                      isActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {sec.number}
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold leading-tight">{sec.title}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2">{sec.summary}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Diagram Widget */}
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Architecture Globale Recommandée
            </h4>
            <div className="bg-slate-950/90 p-3 rounded-xl text-xs space-y-2 border border-slate-800 font-mono">
              <div className="flex items-center justify-between text-slate-300 text-[11px]">
                <span>[VPS Linux Python]</span>
                <span className="text-indigo-400 font-bold">ZeroMQ Socket</span>
                <span>[MT5 EA MQL5]</span>
              </div>
              <div className="text-center text-slate-500 text-[10px]">↕ WebSockets (mTLS TLS 1.3) ↕</div>
              <div className="bg-indigo-950/80 border border-indigo-700/60 p-2 rounded-lg text-center text-indigo-300 font-bold text-[11px]">
                📱 Android Kotlin UI (Control Hub)
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Active Section Specification Detail */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Active Section Header */}
          <div className="glass-card rounded-2xl p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-600 text-white font-black font-mono text-sm shadow-md indigo-glow">
                0{activeSection.number}
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight">{activeSection.title}</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-indigo-500 pl-4 py-1">
              {activeSection.summary}
            </p>
          </div>

          {/* Special Architecture Diagram Comparison for Section 1 */}
          {activeSection.id === 'sec-1' && (
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <Layers className="w-5 h-5 text-indigo-400" />
                Matrice Comparative des Architectures
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* On Device */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-red-900/40 space-y-2">
                  <div className="flex items-center justify-between font-bold text-red-400 font-mono">
                    <span>❌ Everything On-Device (Mobile)</span>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <ul className="space-y-1.5 text-slate-400">
                    <li>• Coupure du bot en veille Android (Doze mode)</li>
                    <li>• Surchauffe et batterie épuisée en ~2h</li>
                    <li>• Pas d'exécution MT5 Windows native sur ARM</li>
                    <li>• Latence instable sur réseau 4G/5G mobile</li>
                  </ul>
                </div>

                {/* Hybrid Client-Server */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-emerald-700/60 space-y-2">
                  <div className="flex items-center justify-between font-bold text-emerald-400 font-mono">
                    <span>✅ Client-Serveur Hybride (Recommandé)</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <ul className="space-y-1.5 text-slate-300">
                    <li>• Serveur VPS Linux 24/7 près du Broker MT5</li>
                    <li>• Latence d'ordre ultra-faible (&lt; 10ms)</li>
                    <li>• App Android comme contrôleur d'urgence léger</li>
                    <li>• Notifications Push d'urgence via Firebase</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Subsections List */}
          <div className="space-y-6">
            {activeSection.subsections.map((sub, idx) => {
              const codeIndexKey = `${activeSection.id}-${idx}`;
              return (
                <div key={idx} className="glass-card rounded-2xl p-6 space-y-4 shadow-md">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 status-glow" />
                    {sub.title}
                  </h3>

                  <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                    {sub.content}
                  </div>

                  {/* Highlights Bullet List if present */}
                  {sub.highlights && sub.highlights.length > 0 && (
                    <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">Points Clés de Conduite</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                        {sub.highlights.map((item, hIdx) => (
                          <div key={hIdx} className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Code Snippet Box if present */}
                  {sub.codeSnippet && (
                    <div className="bg-slate-950/90 rounded-xl border border-slate-800/80 overflow-hidden font-mono">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400">
                        <span className="text-indigo-400 font-bold flex items-center gap-2">
                          <Code className="w-3.5 h-3.5 text-indigo-400" />
                          {sub.codeSnippet.caption || `Code Example (${sub.codeSnippet.language.toUpperCase()})`}
                        </span>
                        <button
                          onClick={() => handleCopyCode(sub.codeSnippet!.code, codeIndexKey)}
                          className="flex items-center gap-1.5 text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          {copiedCodeIndex === codeIndexKey ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 text-[11px]">Copié!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Copier</span>
                            </>
                          )}
                        </button>
                      </div>

                      <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                        <code>{sub.codeSnippet.code}</code>
                      </pre>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* Bottom Navigation between Sections */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
            {activeSection.number > 1 ? (
              <button
                onClick={() => {
                  const prevSection = ARCHITECTURE_SECTIONS.find(s => s.number === activeSection.number - 1);
                  if (prevSection) setActiveSectionId(prevSection.id);
                }}
                className="px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 text-slate-300 rounded-xl text-xs font-mono font-bold transition-colors"
              >
                ← SECTION PRÉCÉDENTE
              </button>
            ) : <div />}

            {activeSection.number < 6 ? (
              <button
                onClick={() => {
                  const nextSection = ARCHITECTURE_SECTIONS.find(s => s.number === activeSection.number + 1);
                  if (nextSection) setActiveSectionId(nextSection.id);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono font-bold transition-all shadow-md shadow-indigo-600/30 uppercase"
              >
                <span>SECTION SUIVANTE ({activeSection.number + 1}/6)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : <div />}
          </div>

        </div>

      </div>

    </div>
  );
};
