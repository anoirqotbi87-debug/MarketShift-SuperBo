@echo off
echo Lancement du Backend...
set PYTHONIOENCODING=utf-8
start cmd /k "set PYTHONIOENCODING=utf-8 && .venv\Scripts\python.exe main.py"

echo Lancement du Frontend...
start cmd /k "cd ui && npm run dev"

echo Lancement termine ! Vous pourrez voir les fenetres ouvertes.
