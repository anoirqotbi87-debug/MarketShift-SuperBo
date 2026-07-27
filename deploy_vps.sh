#!/bin/bash
set -e

echo "===================================================="
echo "🚀 MARKETSHIFT SUPERBOT - SCRIPT DE DÉPLOIEMENT VPS"
echo "===================================================="

# 1. Vérification de Docker
if ! command -v docker &> /dev/null; then
    echo "[!] Docker n'est pas installé. Installation en cours..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "[+] Docker installé. Vous devrez peut-être vous reconnecter."
fi

if ! command -v docker-compose &> /dev/null; then
    echo "[!] Docker Compose n'est pas installé. Installation en cours..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "[+] Docker Compose installé."
fi

# 2. Vérification du terminal MT5
# Le broker XM fournit généralement un exécutable terminal64.exe
# S'il n'est pas présent dans le projet, il faut le télécharger
if [ ! -f "terminal64.exe" ]; then
    echo "[!] terminal64.exe introuvable."
    echo "⚠️ Assurez-vous de copier 'terminal64.exe' de votre PC Windows vers la racine de ce dossier sur le VPS."
    echo "⚠️ Sans ce fichier, l'API MetaTrader5 de Python plantera dans le conteneur."
    exit 1
fi

# 3. Lancement des conteneurs
echo "[+] Build des conteneurs Docker (Backend & Frontend)..."
docker-compose build

echo "[+] Démarrage de MarketShift SuperBot..."
docker-compose up -d

echo "===================================================="
echo "✅ DÉPLOIEMENT TERMINÉ !"
echo "🌐 Interface Web : http://<IP_DE_VOTRE_VPS>"
echo "📡 Logs Backend : docker-compose logs -f marketshift-backend"
echo "===================================================="
