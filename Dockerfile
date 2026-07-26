# Image de base légère et sécurisée pour Python 3.11
FROM python:3.11-slim

# Empêche Python d'écrire des fichiers .pyc sur le disque
ENV PYTHONDONTWRITEBYTECODE=1
# Force Python à ne pas bufferiser stdout/stderr
ENV PYTHONUNBUFFERED=1

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Installation des dépendances système requises pour compiler certains paquets (ex: pandas, numpy)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copier le fichier des dépendances
COPY requirements.txt .

# Mettre à jour pip et installer les dépendances
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copier le reste du code source du projet
COPY . .

# Exposer le port de l'API (FastAPI)
EXPOSE 8000

# Commande par défaut pour démarrer le bot et l'API
CMD ["python", "main.py"]
