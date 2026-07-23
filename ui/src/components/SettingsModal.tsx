import React, { useState } from 'react';
import { X, Settings2, Sliders, Shield, Zap, Database, Smartphone } from 'lucide-react';
import { PushNotificationManager } from './PushNotificationManager';
import { RiskConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  riskConfig: RiskConfig;
  setRiskConfig: React.Dispatch<React.SetStateAction<RiskConfig>>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  riskConfig,
  setRiskConfig
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'trading' | 'connection'>('trading');
  
  // Local state for edits
  const [localRisk, setLocalRisk] = useState<RiskConfig>(riskConfig);

  if (!isOpen) return null;

  const handleSave = () => {
    setRiskConfig(localRisk);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Paramètres de l'Application</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
          {/* Tabs / Sidebar */}
          <div className="w-full sm:w-48 bg-slate-900/50 border-b sm:border-b-0 sm:border-r border-slate-800 p-3 flex flex-row sm:flex-col gap-2 overflow-x-auto shrink-0">
            <button
              onClick={() => setActiveTab('trading')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                activeTab === 'trading' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              Trading & Risque
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                activeTab === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Général
            </button>
            <button
              onClick={() => setActiveTab('connection')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                activeTab === 'connection' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              Connexion MT5
            </button>
          </div>

          {/* Main Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
            {activeTab === 'trading' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-indigo-400 mb-4 uppercase tracking-wider">Limites de Risque (Hard Limits)</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="flex items-center justify-between text-sm text-slate-300 mb-1">
                        <span>Max Drawdown Journalier (%)</span>
                        <span className="font-mono text-slate-100">{localRisk.maxDailyLossPct || 3}%</span>
                      </label>
                      <input 
                        type="range" 
                        min="1" max="20" step="0.5"
                        value={localRisk.maxDailyLossPct || 3}
                        onChange={(e) => setLocalRisk({...localRisk, maxDailyLossPct: parseFloat(e.target.value)})}
                        className="w-full accent-red-500"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center justify-between text-sm text-slate-300 mb-1">
                        <span>Perte Maximale par Trade (%)</span>
                        <span className="font-mono text-slate-100">{localRisk.maxRiskPerTradePct || 1}%</span>
                      </label>
                      <input 
                        type="range" 
                        min="0.5" max="10" step="0.1"
                        value={localRisk.maxRiskPerTradePct || 1}
                        onChange={(e) => setLocalRisk({...localRisk, maxRiskPerTradePct: parseFloat(e.target.value)})}
                        className="w-full accent-orange-500"
                      />
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-sm text-slate-300 mb-1">
                        <span>Max Drawdown Total (%)</span>
                        <span className="font-mono text-slate-100">{(localRisk.maxTotalDrawdownPct || 8).toFixed(2)}%</span>
                      </label>
                      <input 
                        type="range" 
                        min="1" max="50" step="1"
                        value={localRisk.maxTotalDrawdownPct || 8}
                        onChange={(e) => setLocalRisk({...localRisk, maxTotalDrawdownPct: parseFloat(e.target.value)})}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-emerald-400 mb-4 uppercase tracking-wider">Trading Automatique</h3>
                  <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                    <div>
                      <div className="text-sm font-bold text-slate-200">Activer le coupe-circuit auto</div>
                      <div className="text-xs text-slate-400">Coupe les trades si l'anomalie réseau est &gt; 500ms</div>
                    </div>
                    <div className="relative">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Interface & Affichage</h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer">
                      <div>
                        <div className="text-sm font-bold text-slate-200">Mode Compact</div>
                        <div className="text-xs text-slate-400">Réduit l'espacement dans les tableaux</div>
                      </div>
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-indigo-500" />
                    </label>
                    <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer">
                      <div>
                        <div className="text-sm font-bold text-slate-200">Animations Avancées</div>
                        <div className="text-xs text-slate-400">Transitions fluides (utilise plus de GPU)</div>
                      </div>
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-indigo-500" />
                    </label>
                    <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700 cursor-pointer">
                      <div>
                        <div className="text-sm font-bold text-slate-200">Sons de Notification</div>
                        <div className="text-xs text-slate-400">Alerte sonore sur exécution d'ordre</div>
                      </div>
                      <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-600 bg-slate-700 accent-indigo-500" />
                    </label>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">App Mobile (Capacitor)</h3>
                  <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Smartphone className="w-5 h-5 text-indigo-400" />
                      <span className="text-sm font-bold text-slate-200">Statut PWA / APK</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Capacitor est configuré. Vous pouvez exécuter <code>npx cap sync android</code> pour générer le projet natif Android.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'connection' && (
            <div className="space-y-6">

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    Alertes Push (Appareil)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Activez les notifications pour recevoir les alertes critiques (Stop Loss, Drawdown, Déconnexions) directement sur votre écran, même si l'application est en arrière-plan.
                  </p>
                  <PushNotificationManager logs={[]} />
                </div>
  
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Passerelle MT5</h3>
                    <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setLocalRisk({...localRisk, useLocalBridge: false})}
                        className={`px-3 py-1 text-xs font-bold transition-colors ${!localRisk.useLocalBridge ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                      >
                        Cloud MetaApi
                      </button>
                      <button
                        onClick={() => setLocalRisk({...localRisk, useLocalBridge: true})}
                        className={`px-3 py-1 text-xs font-bold transition-colors ${localRisk.useLocalBridge ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                      >
                        Local Python
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {!localRisk.useLocalBridge ? (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-1">MetaApi Token (JWT)</label>
                          <input 
                            type="password" 
                            value={localRisk.metaApiToken || ''}
                            onChange={(e) => setLocalRisk({...localRisk, metaApiToken: e.target.value})}
                            placeholder="eyJhbGciOi..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-1">Account ID (MT4/MT5)</label>
                          <input 
                            type="text" 
                            value={localRisk.metaApiAccountId || ''}
                            onChange={(e) => setLocalRisk({...localRisk, metaApiAccountId: e.target.value})}
                            placeholder="f8c739ea-..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-1">IP Locale du Serveur Python</label>
                          <input 
                            type="text" 
                            value={localRisk.localBridgeIp || ''}
                            onChange={(e) => setLocalRisk({...localRisk, localBridgeIp: e.target.value})}
                            placeholder="ex: 192.168.1.50:8000"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            L'application va se connecter directement à votre PC via le réseau Wi-Fi local.
                          </p>
                        </div>
                      </>
                    )}
                    
                    <div className="pt-4 mt-2 border-t border-slate-800">
                      <button 
                        onClick={handleSave}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        Enregistrer et Connecter au Broker
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
          >
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
};
