import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MT5AccountState, LogEntry } from '../types';
import { 
  X, ArrowDownLeft, ArrowUpRight, Copy, Check, ShieldCheck, Wallet, 
  QrCode, AlertTriangle, RefreshCw, Zap, DollarSign, Info, CheckCircle2, History
} from 'lucide-react';

interface DepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountState: MT5AccountState;
  setAccountState: React.Dispatch<React.SetStateAction<MT5AccountState>>;
  setLogs?: React.Dispatch<React.SetStateAction<LogEntry[]>>;
}

interface CryptoNetworkOption {
  id: string;
  name: string;
  symbol: string;
  networkName: string;
  address: string;
  minDeposit: number;
  confirmationTime: string;
  fee: string;
  badgeColor: string;
}

const CRYPTO_NETWORKS: CryptoNetworkOption[] = [
  {
    id: 'usdt-trc20',
    name: 'Tether USD',
    symbol: 'USDT',
    networkName: 'Tron (TRC-20)',
    address: 'T9yD14Nj9j7x8Pq2M1sR5wU4vK3zY6x7A2',
    minDeposit: 10,
    confirmationTime: '~ 1-2 mins',
    fee: '1.00 USDT',
    badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-700'
  },
  {
    id: 'usdt-erc20',
    name: 'Tether USD',
    symbol: 'USDT',
    networkName: 'Ethereum (ERC-20)',
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    minDeposit: 50,
    confirmationTime: '~ 3-5 mins',
    fee: '4.50 USDT',
    badgeColor: 'bg-indigo-950 text-indigo-300 border-indigo-700'
  },
  {
    id: 'btc-mainnet',
    name: 'Bitcoin',
    symbol: 'BTC',
    networkName: 'Bitcoin Mainnet',
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    minDeposit: 100,
    confirmationTime: '~ 10-20 mins',
    fee: '0.0001 BTC',
    badgeColor: 'bg-amber-950 text-amber-300 border-amber-700'
  },
  {
    id: 'eth-mainnet',
    name: 'Ethereum',
    symbol: 'ETH',
    networkName: 'Ethereum (ERC-20)',
    address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
    minDeposit: 50,
    confirmationTime: '~ 3-5 mins',
    fee: '0.002 ETH',
    badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-700'
  },
  {
    id: 'usdc-solana',
    name: 'USD Coin',
    symbol: 'USDC',
    networkName: 'Solana (SPL)',
    address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    minDeposit: 10,
    confirmationTime: '~ 15 secondes',
    fee: '0.10 USDC',
    badgeColor: 'bg-teal-950 text-teal-300 border-teal-700'
  }
];

interface TransactionRecord {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amountUsd: number;
  cryptoSymbol: string;
  network: string;
  txHash: string;
  status: 'COMPLETED' | 'PENDING';
  timestamp: string;
}

export const DepositWithdrawModal: React.FC<DepositWithdrawModalProps> = ({
  isOpen,
  onClose,
  accountState,
  setAccountState,
  setLogs
}) => {
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW' | 'HISTORY'>('DEPOSIT');
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>('usdt-trc20');
  const [copied, setCopied] = useState<boolean>(false);

  // Form states for deposit simulation / withdrawal request
  const [amountUsd, setAmountUsd] = useState<string>('500');
  const [withdrawalAddress, setWithdrawalAddress] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // History state
  const [txHistory, setTxHistory] = useState<TransactionRecord[]>([
    {
      id: 'tx-101',
      type: 'DEPOSIT',
      amountUsd: 1000,
      cryptoSymbol: 'USDT',
      network: 'Tron (TRC-20)',
      txHash: '0x8f4d...3e9a',
      status: 'COMPLETED',
      timestamp: 'Aujourd\'hui 09:15'
    },
    {
      id: 'tx-100',
      type: 'DEPOSIT',
      amountUsd: 5000,
      cryptoSymbol: 'USDT',
      network: 'Ethereum (ERC-20)',
      txHash: '0x2a1c...9b8f',
      status: 'COMPLETED',
      timestamp: 'Hier 14:30'
    }
  ]);

  if (!isOpen) return null;

  const currentNetwork = CRYPTO_NETWORKS.find(n => n.id === selectedNetworkId) || CRYPTO_NETWORKS[0];

  // Handle Copy Wallet Address
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(currentNetwork.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simulate Instant Deposit
  const handleSimulateDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountUsd);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    setIsProcessing(true);
    setSuccessMessage(null);

    setTimeout(() => {
      // Update account state
      setAccountState(prev => {
        const newBal = prev.balance + parsedAmount;
        const newEq = prev.equity + parsedAmount;
        const newFreeMarg = prev.freeMargin + parsedAmount;
        return {
          ...prev,
          balance: Math.round(newBal * 100) / 100,
          equity: Math.round(newEq * 100) / 100,
          freeMargin: Math.round(newFreeMarg * 100) / 100
        };
      });

      // Add to tx history
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newTx: TransactionRecord = {
        id: `tx-${Date.now()}`,
        type: 'DEPOSIT',
        amountUsd: parsedAmount,
        cryptoSymbol: currentNetwork.symbol,
        network: currentNetwork.networkName,
        txHash: `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`,
        status: 'COMPLETED',
        timestamp: `Aujourd'hui ${nowStr}`
      };
      setTxHistory(prev => [newTx, ...prev]);

      // Add system log
      if (setLogs) {
        setLogs(prev => [
          {
            id: `log-dep-${Date.now()}`,
            timestamp: nowStr,
            level: 'INFO',
            module: 'MT5_BRIDGE',
            message: `💰 DÉPÔT CRYPTO CONFIRMÉ: +$${parsedAmount.toLocaleString('fr-FR')} USDT via ${currentNetwork.networkName}. Nouveau solde: $${(accountState.balance + parsedAmount).toLocaleString('fr-FR')}`
          },
          ...prev
        ]);
      }

      setIsProcessing(false);
      setSuccessMessage(`Dépôt de $${parsedAmount} crédité avec succès sur votre compte MT5 !`);
      setTimeout(() => setSuccessMessage(null), 5000);
    }, 1200);
  };

  // Handle Withdrawal Request
  const handleRequestWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountUsd);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (parsedAmount > accountState.freeMargin) {
      alert(`Marge libre insuffisante ($${accountState.freeMargin.toLocaleString()}) pour ce retrait.`);
      return;
    }

    setIsProcessing(true);
    setSuccessMessage(null);

    setTimeout(() => {
      // Deduct from account state
      setAccountState(prev => {
        const newBal = prev.balance - parsedAmount;
        const newEq = prev.equity - parsedAmount;
        const newFreeMarg = prev.freeMargin - parsedAmount;
        return {
          ...prev,
          balance: Math.round(newBal * 100) / 100,
          equity: Math.round(newEq * 100) / 100,
          freeMargin: Math.round(newFreeMarg * 100) / 100
        };
      });

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newTx: TransactionRecord = {
        id: `tx-${Date.now()}`,
        type: 'WITHDRAW',
        amountUsd: parsedAmount,
        cryptoSymbol: currentNetwork.symbol,
        network: currentNetwork.networkName,
        txHash: `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`,
        status: 'COMPLETED',
        timestamp: `Aujourd'hui ${nowStr}`
      };
      setTxHistory(prev => [newTx, ...prev]);

      if (setLogs) {
        setLogs(prev => [
          {
            id: `log-wd-${Date.now()}`,
            timestamp: nowStr,
            level: 'INFO',
            module: 'MT5_BRIDGE',
            message: `💸 RETRAIT CRYPTO EXÉCUTÉ: -$${parsedAmount.toLocaleString('fr-FR')} vers ${withdrawalAddress || currentNetwork.address}.`
          },
          ...prev
        ]);
      }

      setIsProcessing(false);
      setSuccessMessage(`Retrait de $${parsedAmount} envoyé sur votre portefeuille crypto !`);
      setWithdrawalAddress('');
      setTimeout(() => setSuccessMessage(null), 5000);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden font-sans text-slate-100 my-auto">
        
        {/* Top Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700/80 text-indigo-400 status-glow">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <span>Financement Crypto & Gestion de Solde</span>
                <span className="px-2 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] rounded-full">
                  Instant QR
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Solde Actuel: <strong className="text-emerald-400">${accountState.balance.toLocaleString('fr-FR')}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Tabs: Deposit | Withdraw | History */}
        <div className="grid grid-cols-3 bg-slate-950 p-1 border-b border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab('DEPOSIT')}
            className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'DEPOSIT'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Dépôt (QR)</span>
          </button>

          <button
            onClick={() => setActiveTab('WITHDRAW')}
            className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'WITHDRAW'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Retrait</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historique</span>
          </button>
        </div>

        {/* Success Alert Banner */}
        {successMessage && (
          <div className="p-3 bg-emerald-950/90 border-b border-emerald-700 text-emerald-200 text-xs font-mono flex items-center gap-2 animate-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: DEPOSIT WITH QR CODE */}
        {activeTab === 'DEPOSIT' && (
          <div className="p-4 space-y-4 font-mono text-xs">
            
            {/* Select Crypto Network */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider">
                1. Sélectionner le Réseau Crypto
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CRYPTO_NETWORKS.map(net => (
                  <button
                    key={net.id}
                    onClick={() => setSelectedNetworkId(net.id)}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedNetworkId === net.id
                        ? 'bg-indigo-950/90 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{net.symbol}</span>
                      <span className={`text-[8px] px-1.5 py-0.2 rounded border ${net.badgeColor}`}>
                        {net.networkName.split(' ')[0]}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{net.networkName}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* QR Code & Wallet Address Display Box */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 flex flex-col items-center text-center">
              
              <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>Scannez le QR Code pour créditer en {currentNetwork.symbol}</span>
              </div>

              {/* QR Code Canvas/SVG */}
              <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-slate-800">
                <QRCodeSVG
                  value={currentNetwork.address}
                  size={160}
                  level="H"
                  includeMargin={false}
                />
              </div>

              {/* Wallet Address String & Copy Button */}
              <div className="w-full space-y-1">
                <div className="text-[10px] text-slate-400">Adresse de dépôt unique :</div>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-xl">
                  <span className="text-[10px] font-mono font-bold text-indigo-300 break-all select-all flex-1 text-left">
                    {currentNetwork.address}
                  </span>
                  <button
                    onClick={handleCopyAddress}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shrink-0 flex items-center gap-1 ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copié !' : 'Copier'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between w-full text-[10px] text-slate-400 border-t border-slate-800/80 pt-2">
                <span>Min Dépôt : <strong className="text-white">${currentNetwork.minDeposit}</strong></span>
                <span>Confirmation : <strong className="text-emerald-400">{currentNetwork.confirmationTime}</strong></span>
              </div>
            </div>

            {/* Instant Simulation Deposit Form */}
            <form onSubmit={handleSimulateDeposit} className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simuler un Crédit Immédiat (Mode Test)</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="10"
                    step="50"
                    value={amountUsd}
                    onChange={e => setAmountUsd(e.target.value)}
                    placeholder="Montant $"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-none focus:border-emerald-500 pl-7"
                  />
                  <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center gap-1.5 text-xs shrink-0"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )}
                  <span>Créditer Solde</span>
                </button>
              </div>
            </form>

          </div>
        )}

        {/* TAB 2: WITHDRAWAL FORM */}
        {activeTab === 'WITHDRAW' && (
          <form onSubmit={handleRequestWithdrawal} className="p-4 space-y-4 font-mono text-xs">
            
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400">Marge Disponible pour Retrait</div>
              <div className="text-xl font-black text-emerald-400">
                ${accountState.freeMargin.toLocaleString('fr-FR')}
              </div>
            </div>

            {/* Select Network for Withdrawal */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider">
                Réseau Crypto de Réception
              </label>
              <select
                value={selectedNetworkId}
                onChange={e => setSelectedNetworkId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none"
              >
                {CRYPTO_NETWORKS.map(net => (
                  <option key={net.id} value={net.id}>
                    {net.name} ({net.symbol}) - {net.networkName} (Frais: {net.fee})
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider">
                Montant du Retrait (USD)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="10"
                  max={accountState.freeMargin}
                  value={amountUsd}
                  onChange={e => setAmountUsd(e.target.value)}
                  placeholder="ex: 500"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-rose-500 pl-7"
                />
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
              </div>
            </div>

            {/* Destination Wallet Address */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase tracking-wider">
                Adresse du Portefeuille Crypto Bénéficiaire
              </label>
              <input
                type="text"
                value={withdrawalAddress}
                onChange={e => setWithdrawalAddress(e.target.value)}
                placeholder={`Adresse ${currentNetwork.networkName}`}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-[10px] text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>Vérifiez attentivement l'adresse et le réseau. Les transactions blockchain sont irréversibles.</span>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-xs"
            >
              {isProcessing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpRight className="w-4 h-4" />
              )}
              <span>Demander le Retrait Immédiat</span>
            </button>

          </form>
        )}

        {/* TAB 3: TRANSACTION HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="p-4 space-y-3 font-mono text-xs">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              Historique des Mouvements de Fonds ({txHistory.length})
            </div>

            {txHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                Aucune transaction récente enregistrée.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {txHistory.map(tx => (
                  <div
                    key={tx.id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg border ${
                        tx.type === 'DEPOSIT'
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                          : 'bg-rose-950 border-rose-800 text-rose-400'
                      }`}>
                        {tx.type === 'DEPOSIT' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{tx.type === 'DEPOSIT' ? 'DÉPÔT' : 'RETRAIT'} {tx.cryptoSymbol}</span>
                          <span className="text-[9px] text-slate-400">{tx.network}</span>
                        </div>
                        <div className="text-[9px] text-slate-500">Hash: {tx.txHash} • {tx.timestamp}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-bold text-sm ${
                        tx.type === 'DEPOSIT' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {tx.type === 'DEPOSIT' ? '+' : '-'}${tx.amountUsd.toLocaleString('fr-FR')}
                      </div>
                      <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800 text-[8px] rounded">
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

// Helper Plus Icon
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
  </svg>
);
