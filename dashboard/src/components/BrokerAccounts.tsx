"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  connectBrokerAccount,
  deleteBrokerAccount,
  fetchBrokerAccounts,
  switchActiveBroker,
  testBrokerConnection,
} from "@/lib/api";
import type { AccountInfo, BrokerAccount, BrokerTestResult } from "@/types/trading";

interface BrokerAccountsProps {
  accountInfo: AccountInfo;
}

const PRESETS = [
  { name: "XM Global", server: "XMGlobal-MT5 9", demo: "XMGlobal-MT5 Demo" },
  { name: "Exness", server: "Exness-Real", demo: "Exness-Trial" },
  { name: "IC Markets", server: "ICMarkets-Live", demo: "ICMarkets-Demo" },
  { name: "FTMO", server: "FTMO-Demo", demo: "FTMO-Demo" },
  { name: "Custom", server: "", demo: "" },
];

interface AccountCard {
  id: number;
  brokerName: string;
  server: string;
  login: number;
  accountType: "DEMO" | "REAL";
  isActive: boolean;
  balance: number;
  equity: number;
  currency: string;
  lastResult: string;
  // État local UI : en cours de test / activation
  busy?: "test" | "switch" | null;
}

/** Convertit un compte backend en carte locale (le mot de passe n'existe jamais ici). */
function toCard(acc: BrokerAccount): AccountCard {
  return {
    id: acc.id,
    brokerName: acc.broker_name,
    server: acc.server,
    login: acc.login,
    accountType: acc.account_type,
    isActive: acc.is_active,
    balance: acc.balance,
    equity: acc.equity,
    currency: acc.currency,
    lastResult: acc.last_result,
  };
}

/**
 * URL officielle du WebTrader MT5 selon le courtier.
 * Fallback MetaQuotes : pré-remplit la connexion avec le serveur/login.
 */
export function getWebTraderUrl(brokerName: string, server: string, login: number): string {
  const name = brokerName.toLowerCase();
  if (name.includes("xm")) return "https://webtrader.xm.com/";
  if (name.includes("exness")) return "https://my.exness.com/webtrading/";
  return `https://trade.mql5.com/trade?servers=${encodeURIComponent(server)}&trade_server=${encodeURIComponent(server)}&login=${encodeURIComponent(String(login))}`;
}

/**
 * Vue "Comptes Broker" — gestion multi-comptes MT5 (connexion, bascule, test).
 * Le mot de passe est uniquement saisi dans le modal d'enregistrement et transmis
 * au backend (chiffré TLS, persisté chiffré). Il n'est jamais stocké côté frontend.
 */
export default function BrokerAccounts({ accountInfo }: BrokerAccountsProps) {
  const [accounts, setAccounts] = useState<AccountCard[]>([]);
  const [backendUp, setBackendUp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const notify = useCallback((kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const list = await fetchBrokerAccounts();
      setBackendUp(true);
      setAccounts((list || []).map(toCard));
    } catch {
      setBackendUp(false);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Rafraîchissement léger toutes les 20s pour suivre le solde du compte actif
    const id = window.setInterval(() => void refresh(true), 20000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleSwitch = async (card: AccountCard) => {
    setAccounts((prev) => prev.map((a) => (a.id === card.id ? { ...a, busy: "switch" } : a)));
    try {
      const res = await switchActiveBroker(card.id);
      if (res?.success) {
        notify("ok", `Bot basculé sur ${card.brokerName} #${card.login}`);
        setAccounts((prev) =>
          prev.map((a) => ({ ...a, isActive: a.id === card.id, busy: null })),
        );
      } else {
        notify("err", res?.error || "Échec de la bascule");
        setAccounts((prev) => prev.map((a) => (a.busy === "switch" ? { ...a, busy: null } : a)));
      }
    } catch {
      notify("err", "Backend injoignable — impossible de basculer");
      setAccounts((prev) => prev.map((a) => (a.busy === "switch" ? { ...a, busy: null } : a)));
    }
  };

  const handleDelete = async (card: AccountCard) => {
    if (!window.confirm(`Supprimer le compte ${card.brokerName} #${card.login} ?`)) return;
    try {
      const res = await deleteBrokerAccount(card.id);
      if (res?.success !== false) {
        notify("ok", `Compte ${card.login} supprimé`);
        setAccounts((prev) => prev.filter((a) => a.id !== card.id));
        void refresh(true);
      } else {
        notify("err", res?.error || "Impossible de supprimer");
      }
    } catch {
      notify("err", "Backend injoignable — suppression impossible");
    }
  };

  const active = accounts.find((a) => a.isActive);

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* En-tête — résumé du compte actif */}
      <div className="card relative overflow-hidden p-4">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-transparent" />
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Landmark className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
                Comptes Broker
              </h3>
              <p className="text-[10px] text-zinc-500">Multi-comptes MT5 · bascule à chaud</p>
            </div>
          </div>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
              backendUp ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${backendUp ? "bg-emerald-400" : "bg-amber-400"}`} />
            {backendUp ? "BACKEND OK" : "BACKEND INJOIGNABLE"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat
            label="Compte actif"
            value={
              active
                ? `${active.brokerName} · #${active.login}`
                : accountInfo.broker && accountInfo.login
                  ? `${accountInfo.broker} · #${accountInfo.login}`
                  : "—"
            }
            accent="text-emerald-400"
          />
          <SummaryStat
            label="Serveur"
            value={active?.server || accountInfo.server || "—"}
            small
          />
          <SummaryStat
            label="Équité"
            value={`${active?.currency ?? accountInfo.currency ?? "USD"} ${(
              active?.equity ?? accountInfo.equity ?? 0
            ).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`}
            accent="text-cyan-400"
          />
          <SummaryStat
            label="Solde"
            value={`${active?.currency ?? accountInfo.currency ?? "USD"} ${(
              active?.balance ?? accountInfo.balance ?? 0
            ).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`}
            accent="text-zinc-100"
          />
        </div>

        <button
          onClick={() => void refresh()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </button>
      </div>

      {/* Grille des comptes enregistrés */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Comptes enregistrés ({accounts.length})
        </h2>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Connecter un nouveau compte
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Chargement des comptes…
        </div>
      ) : accounts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Building2 className="h-8 w-8 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            Aucun compte broker configuré. Cliquez sur «&nbsp;+ Connecter un compte&nbsp;» pour lier
            votre compte de trading réel.
          </p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-600">
            Le bot s&apos;appuie sur le compte XM défini dans l&apos;environnement tant qu&apos;aucun
            compte n&apos;est ajouté ici. Le mot de passe est chiffré côté backend et jamais restitué.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-1 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Connecter un compte
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((card) => (
            <AccountCardView
              key={card.id}
              card={card}
              onSwitch={() => void handleSwitch(card)}
              onDelete={() => void handleDelete(card)}
            />
          ))}
        </div>
      )}

      {/* Note sécurité */}
      <div className="flex items-start gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <p className="text-[10px] leading-relaxed text-zinc-600">
          Les mots de passe sont chiffrés au repos (PBKDF2 + chiffrement de flux authentifié,
          clé dérivée du secret API) et jamais restitués par l&apos;API. Les appels de test MT5
          sont bornés à 4 secondes pour ne jamais bloquer la boucle du bot.
        </p>
      </div>

      {/* Modal de connexion */}
      {modalOpen && (
        <ConnectModal
          onClose={() => setModalOpen(false)}
          onSaved={(acc) => {
            setModalOpen(false);
            notify("ok", `Compte ${acc.login} enregistré et connecté`);
            void refresh();
          }}
          notify={notify}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-2xl ${
            toast.kind === "ok"
              ? "border-emerald-800 bg-emerald-950/90 text-emerald-200"
              : "border-rose-800 bg-rose-950/90 text-rose-200"
          }`}
        >
          {toast.kind === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="text-xs">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sous-composants
// ────────────────────────────────────────────────────────────────────────────

function SummaryStat({
  label,
  value,
  accent = "text-zinc-100",
  small = false,
}: {
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 p-2.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`font-mono font-bold ${small ? "text-xs" : "text-sm"} ${accent} truncate`} title={value}>
        {value}
      </p>
    </div>
  );
}

function AccountCardView({
  card,
  onSwitch,
  onDelete,
}: {
  card: AccountCard;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`card relative p-4 transition ${
        card.isActive ? "ring-1 ring-emerald-800/60" : "hover:border-zinc-700"
      }`}
    >
      {card.isActive && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-emerald-500 to-cyan-500" />
      )}

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              card.isActive ? "bg-emerald-500/10" : "bg-zinc-800/80"
            }`}
          >
            <Building2 className={`h-4 w-4 ${card.isActive ? "text-emerald-400" : "text-zinc-500"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">{card.brokerName}</p>
            <p className="font-mono text-[10px] text-zinc-500">#{card.login}</p>
          </div>
        </div>
        <StatusBadge active={card.isActive} type={card.accountType} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <MiniStat label="Serveur" value={card.server} />
        <MiniStat
          label="Solde"
          value={`${card.currency} ${card.balance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`}
        />
        <MiniStat
          label="Équité"
          value={`${card.currency} ${card.equity.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`}
        />
        <MiniStat label="Dernier test" value={card.lastResult || "—"} accent="text-amber-300" />
      </div>

      <div className="flex flex-wrap gap-2">
        {card.isActive ? (
          <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            <Zap className="h-3.5 w-3.5" />
            Actif sur le bot
          </span>
        ) : (
          <button
            onClick={onSwitch}
            disabled={card.busy === "switch"}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
              card.busy === "switch"
                ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                : "border-cyan-800 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
            }`}
          >
            {card.busy === "switch" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Server className="h-3.5 w-3.5" />
            )}
            {card.busy === "switch" ? "Bascule…" : "Basculer sur ce compte"}
          </button>
        )}
        <button
          onClick={() => window.open(getWebTraderUrl(card.brokerName, card.server, card.login), "_blank")}
          title="Ouvrir le WebTrader MT5 du courtier"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-cyan-800 hover:bg-cyan-500/10 hover:text-cyan-300"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ouvrir WebTrader
        </button>
        <button
          onClick={onDelete}
          title="Supprimer ce compte"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-400 transition hover:border-rose-900 hover:bg-rose-950/40 hover:text-rose-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ active, type }: { active: boolean; type: "DEMO" | "REAL" }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
        🟢 Actif
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 font-mono text-[10px] font-bold text-zinc-400">
      ⚪ En veille
      {type === "REAL" && <span className="text-[9px] normal-case text-amber-400">· Réel</span>}
    </span>
  );
}

function MiniStat({ label, value, accent = "text-zinc-200" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border border-zinc-800/60 bg-zinc-900/40 px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className={`truncate font-mono text-[11px] font-semibold ${accent}`} title={value}>
        {value}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal de connexion
// ────────────────────────────────────────────────────────────────────────────

function ConnectModal({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: (acc: BrokerAccount) => void;
  notify: (kind: "ok" | "err", msg: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [broker, setBroker] = useState<string>(PRESETS[0].name);
  const [server, setServer] = useState(PRESETS[0].server);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isReal, setIsReal] = useState(false);
  const [openWebTrader, setOpenWebTrader] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<BrokerTestResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const filtered = PRESETS.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const loginNum = Number(login);
  const canTest = server.trim() !== "" && loginNum > 0 && password !== "";
  const canSave = canTest;

  const selectBroker = (name: string) => {
    setBroker(name);
    setSearch("");
    setListOpen(false);
    const preset = PRESETS.find((p) => p.name === name);
    if (preset) setServer(isReal ? preset.server : preset.demo || preset.server);
  };

  const toggleReal = (v: boolean) => {
    setIsReal(v);
    const preset = PRESETS.find((p) => p.name === broker);
    if (preset) setServer(v ? preset.server : preset.demo || preset.server);
  };

  const handleTest = async () => {
    setValidationError(null);
    if (server.trim() === "" || loginNum <= 0 || password === "") {
      setValidationError(
        "Veuillez renseigner le serveur, le numéro de compte et le mot de passe avant de tester.",
      );
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testBrokerConnection({
        server,
        login: loginNum,
        password,
      });
      if (res === null) {
        setTestResult({ success: false, error: "Serveur backend injoignable" });
      } else {
        setTestResult(res);
      }
    } catch {
      setTestResult({ success: false, error: "Serveur backend injoignable" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    // Validation explicite (même erreur que le bouton "Tester").
    if (server.trim() === "" || loginNum <= 0 || password === "") {
      setValidationError(
        "Veuillez renseigner le serveur, le numéro de compte et le mot de passe avant d'enregistrer.",
      );
      return;
    }

    // Anti-popup : ouvre le WebTrader IMMÉDIATEMENT (avant tout await) pour que
    // le navigateur n'applique pas son blocage des popups sur appel asynchrone.
    const brokerName = broker === "Custom" ? String(loginNum) : broker;
    const webTraderUrl = getWebTraderUrl(brokerName, server, loginNum);
    const newTab = openWebTrader ? window.open(webTraderUrl, "_blank", "noopener,noreferrer") : null;

    setSaving(true);
    try {
      const res = await connectBrokerAccount({
        server,
        login: loginNum,
        password,
        broker_name: brokerName,
        account_type: isReal ? "REAL" : "DEMO",
      });
      if (res?.success && res.account) {
        onSaved(res.account);
      } else {
        notify("err", res?.error || "Échec de l'enregistrement");
      }
    } catch {
      notify("err", "Backend injoignable — impossible d'enregistrer");
    } finally {
      setSaving(false);
      if (openWebTrader && newTab === null) {
        notify("err", "Pop-up bloquée — autorisez les popups pour ouvrir le WebTrader.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10 lg:pt-16">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Connecter un compte broker</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Courtier (autocomplétion) */}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Courtier</span>
            <input
              value={search || broker}
              onChange={(e) => {
                setSearch(e.target.value);
                setListOpen(true);
              }}
              onFocus={() => {
                setListOpen(true);
                setSearch("");
              }}
              placeholder="XM Global, Exness, IC Markets…"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            />
            {listOpen && search.trim() !== "" && (
              <div className="mt-1 space-y-0.5 rounded-md border border-zinc-800 bg-zinc-900 p-1">
                {filtered.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-zinc-600">Aucun courtier trouvé</p>
                )}
                {filtered.map((p) => (
                  <button
                    key={p.name}
                    onMouseDown={() => selectBroker(p.name)}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </label>

          {/* Serveur */}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Serveur MT5</span>
            <input
              value={server}
              onChange={(e) => {
                setServer(e.target.value);
                setValidationError(null);
              }}
              placeholder="ex: XMGlobal-MT5 9, Exness-Real"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            />
          </label>

          {/* Login */}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Numéro de compte (Login)</span>
            <input
              value={login}
              onChange={(e) => {
                setLogin(e.target.value.replace(/\D/g, ""));
                setValidationError(null);
              }}
              inputMode="numeric"
              placeholder="ex: 0123456789"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
            />
          </label>

          {/* Mot de passe */}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Mot de passe de trading</span>
            <div className="relative mt-1">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setValidationError(null);
                }}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 pr-9 font-mono text-xs text-zinc-200 focus:border-cyan-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label={showPass ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </label>

          {/* Type de compte */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <span className="text-xs text-zinc-300">
              {isReal ? (
                <>
                  Compte <span className="font-semibold text-amber-400">Réel (Live)</span>
                </>
              ) : (
                <>
                  Compte <span className="font-semibold text-emerald-400">Démo / Paper Trading</span>
                </>
              )}
            </span>
            <div
              className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                isReal ? "justify-end bg-amber-500/60" : "justify-start bg-zinc-700"
              }`}
              onClick={() => toggleReal(!isReal)}
              role="switch"
              aria-checked={isReal}
              tabIndex={0}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow" />
            </div>
          </div>

          {/* Ouverture WebTrader */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <input
              type="checkbox"
              checked={openWebTrader}
              onChange={(e) => setOpenWebTrader(e.target.checked)}
              className="h-4 w-4 accent-cyan-600"
            />
            <span className="text-xs text-zinc-300">
              Ouvrir le WebTrader MT5 dans un nouvel onglet après la connexion
            </span>
          </label>

          {/* Erreur de validation (champs manquants) */}
          {validationError && (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-300">
              ⚠️ {validationError}
            </div>
          )}

          {/* Résultat du test */}
          {testResult && (
            <div
              className={`rounded-md border px-3 py-2 font-mono text-[11px] ${
                testResult.success
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                  : "border-rose-800 bg-rose-950/40 text-rose-300"
              }`}
            >
              {testResult.success ? (
                testResult.ping_ms != null ? (
                  <span>
                    ✅ Compte validé — Ping {testResult.ping_ms} ms ·{" "}
                    {testResult.balance != null
                      ? `Solde ${testResult.balance.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${testResult.currency ?? ""} · Levier 1:${testResult.leverage ?? "—"}`
                      : "fonds lus directement dans le WebTrader"}
                  </span>
                ) : (
                  <span>✅ {testResult.note || "Compte validé en mode WebTrader"}</span>
                )
              ) : (
                <span>❌ {testResult.error || "Échec de connexion"}</span>
              )}
            </div>
          )}

          {/* Boutons */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
                testResult?.success
                  ? "border-emerald-800 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {testing
                ? "Connexion au serveur MT5 en cours... (max 4s)"
                : testResult?.success
                  ? "Re-tester la connexion"
                  : "Tester la connexion d'abord"}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {saving ? "Enregistrement…" : "Enregistrer et Connecter"}
            </button>
          </div>

          <p className="text-[10px] leading-relaxed text-zinc-600">
            Le test tente une authentification réelle auprès du serveur MT5 (timeout 4 s) puis
            renvoie la latence, le solde et le levier détectés. Le mot de passe est chiffré par le
            backend et jamais restitué.
          </p>
        </div>
      </div>
    </div>
  );
}