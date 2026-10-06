import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Autoriser les sources d'images distantes (aucune utilisée pour l'instant,
  // mais prêt pour des icônes/avatars externes).
  images: {
    remotePatterns: [],
  },
  // Le dashboard est un client total (REST + WS vers le backend FastAPI).
  // Pas de besoins server-side à l'exécution.
  output: "standalone",
};

export default nextConfig;