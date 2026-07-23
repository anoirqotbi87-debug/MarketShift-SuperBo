import React, { useState, useEffect } from 'react';
import { Bell, BellRing, BellOff, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import { PriceAlert, LogEntry } from '../types';

interface PushNotificationManagerProps {
  logs: LogEntry[];
  priceAlerts?: PriceAlert[];
}

export const PushNotificationManager: React.FC<PushNotificationManagerProps> = ({ logs, priceAlerts }) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert("Ce navigateur ne supporte pas les notifications desktop.");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  // Listen for new high-priority logs or alerts and trigger a real push notification
  useEffect(() => {
    if (permission !== 'granted' || logs.length === 0) return;

    const latestLog = logs[0];
    // Check if it's recent (simulated by checking if it's an ERROR or WARNING)
    // In a real app we'd compare timestamps
    if (latestLog.level === 'ERROR' || latestLog.level === 'WARNING') {
      const title = latestLog.level === 'ERROR' ? 'Alerte Critique (Bot)' : 'Avertissement Bot';
      try {
        new Notification(title, {
          body: latestLog.message,
          icon: '/vite.svg'
        });
      } catch (e) {
        console.error("Erreur Notification:", e);
      }
    }
  }, [logs, permission]);

  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
        <BellRing className="w-4 h-4" />
        <span>Notifications Push Activées</span>
      </div>
    );
  }

  return (
    <button
      onClick={requestPermission}
      className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/20 transition-colors"
    >
      <Bell className="w-4 h-4" />
      <span>Activer les Notifications Push</span>
    </button>
  );
};
