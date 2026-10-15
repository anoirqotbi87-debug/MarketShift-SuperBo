@echo off
echo Lancement du Backend...
set PYTHONIOENCODING=utf-8
start cmd /k "set PYTHONIOENCODING=utf-8 && .venv\Scripts\python.exe main.py"

echo Lancement du Frontend Dashboard...
start cmd /k "cd dashboard && npm run dev"

echo Lancement termine ! Vous pourrez voir les fenetres ouvertes.
