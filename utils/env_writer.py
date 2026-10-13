"""
utils/env_writer.py — Écriture atomique et thread-safe du fichier .env
"""
import os
import tempfile
import threading
import logging
from typing import Dict

_env_lock = threading.Lock()

def atomic_update_env(updates: Dict[str, str], env_path: str = ".env") -> bool:
    """
    Met à jour de façon atomique et thread-safe les variables dans le fichier .env.
    Préserve l'intégrité du fichier contre les écrasements concurrents et les crashs d'écriture.
    """
    with _env_lock:
        temp_path = None
        try:
            abs_env_path = os.path.abspath(env_path)
            lines = []
            if os.path.exists(abs_env_path):
                with open(abs_env_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()

            updated_keys = set(updates.keys())
            found_keys = set()
            new_lines = []

            for line in lines:
                replaced = False
                for key, val in updates.items():
                    if line.startswith(f"{key}="):
                        new_lines.append(f"{key}={val}\n")
                        found_keys.add(key)
                        replaced = True
                        break
                if not replaced:
                    new_lines.append(line)

            # Ajout des clés manquantes à la fin
            for key in updated_keys - found_keys:
                new_lines.append(f"{key}={updates[key]}\n")

            # Écriture dans un fichier temporaire dans le même répertoire
            env_dir = os.path.dirname(abs_env_path)
            with tempfile.NamedTemporaryFile("w", dir=env_dir, encoding="utf-8", delete=False) as tf:
                tf.writelines(new_lines)
                temp_path = tf.name

            # Remplacement atomique
            os.replace(temp_path, abs_env_path)
            logging.info(f"[EnvWriter] ✅ Fichier .env mis à jour atomiquement pour {list(updates.keys())}")
            return True
        except Exception as e:
            logging.error(f"[EnvWriter] Erreur lors de l'écriture atomique de .env: {e}")
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            raise
