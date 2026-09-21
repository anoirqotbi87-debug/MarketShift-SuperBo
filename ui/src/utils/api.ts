export function getApiBaseUrl(): string {
  try {
    const saved = localStorage.getItem('marketshift_risk_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.localBridgeIp) {
        let ip = parsed.localBridgeIp;
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) {
          ip = 'http://' + ip;
        }
        // Remove trailing slash if any
        return ip.replace(/\/+$/, '');
      }
    }
  } catch (e) {}
  return "http://192.168.8.139:8000"; // Fallback par défaut
}
