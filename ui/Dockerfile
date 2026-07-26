# Étape 1 : Build de l'application React / Vite
FROM node:18-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste du code source
COPY . .

# Compiler l'application pour la production
RUN npm run build

# Étape 2 : Servir avec Nginx (serveur web léger)
FROM nginx:alpine

# Copier le build généré depuis l'étape 1 vers le dossier web de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Optionnel : si vous avez un fichier de configuration nginx personnalisé
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port HTTP par défaut
EXPOSE 80

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
