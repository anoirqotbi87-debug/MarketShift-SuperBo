# MarketShift Dashboard — Command Center

Dashboard temps réel **Next.js (App Router)** du bot de trading algorithmique MarketShift.
Interface « Dark Terminal » pour surveiller positions, équité, télémétrie IA et commandes de sécurité.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS (dark mode natif `zinc-950`)
- Recharts (courbe d'équité), Lucide React (icônes)
- WebSocket temps réel (`/ws`) avec reconnexion exponentielle

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis ajuster les URLs
npm run typecheck
npm run dev
```

Ouvrir `http://localhost:3000`.

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend FastAPI (REST) |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws` | Flux WebSocket temps réel |
| `NEXT_PUBLIC_API_KEY` | `marketshift_dev_secret_key_2026` | Clé d'auth (doit matcher `API_SECRET_KEY` du backend) |

> ⚠️ `NEXT_PUBLIC_*` sont embarquées dans le bundle client. Pour une clé sensible utilisez
> une vraie clé d'API dont la fuite dans le navigateur est acceptable (ou ajoutez un proxy
> côté backend si vous voulez masquer la clé).

## Déploiement Vercel (3 étapes)

1. **Commit & push** du dossier `dashboard/` :
   ```bash
   git add dashboard/
   git commit -m "feat(dashboard): setup modern real-time Next.js trading dashboard"
   git push
   ```

2. **Import Vercel** : `Add New… > Project` → sélectionner le dépôt GitHub
   → **Root Directory : `dashboard`**.

3. **Variables d'environnement** dans *Settings > Environment Variables* :
   - `NEXT_PUBLIC_API_URL` : URL HTTPS du backend (tunnel Cloudflare/ngrok, IP du VPS…)
   - `NEXT_PUBLIC_WS_URL` : `wss://…/ws` correspondant
   - `NEXT_PUBLIC_API_KEY` : votre clé

   Puis **Deploy**.

Le backend doit autoriser les CORS depuis l'origine `.vercel.app`.
Côté backend FastAPI (`api/server.py`), le middleware CORS doit inclure l'URL Vercel du dashboard.

## Structure

```
dashboard/
├── src/
│   ├── app/            # page.tsx (dashboard unifié), layout.tsx, globals.css
│   ├── components/     # Header, KpiGrid, ActivePositions, EquityChart, TelemetryConsole, EmergencyModal
│   ├── hooks/          # useMarketShiftWS (WS + reconnexion)
│   ├── types/          # trading.ts (payloads alignés sur api/server.py)
│   └── lib/            # api.ts (fetchers REST)
├── .env.example
├── next.config.ts
└── tailwind.config.ts
```