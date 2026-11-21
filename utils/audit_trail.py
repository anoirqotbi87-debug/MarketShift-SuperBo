import os
import csv
import hashlib
import hmac
import sqlite3
import tempfile
import datetime
import logging
from typing import Dict, Any

GENESIS_ROOT_SIGNATURE = "GENESIS_ROOT_CHAIN"


def write_external_anchor(db_path: str, anchor_path: str, hmac_secret: str) -> str:
    """
    Scelle cryptographiquement la tête du journal d'audit SQLite dans un fichier d'ancre externe.
    Utilise HMAC-SHA256 pour garantir l'inaltérabilité de la chaîne d'audit (Palier A - Réserve 6).
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Base SQLite introuvable: {db_path}")

    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT sha256_signature FROM audit_trail_events ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()

    if not row or not row[0]:
        raise ValueError("Aucun événement d'audit trouvé pour sceller l'ancre externe.")

    head_hash = str(row[0]).strip()
    hmac_sig = hmac.new(hmac_secret.encode("utf-8"), head_hash.encode("utf-8"), hashlib.sha256).hexdigest()

    content = f"{head_hash}|{hmac_sig}\n"
    anchor_dir = os.path.dirname(os.path.abspath(anchor_path))
    if anchor_dir:
        os.makedirs(anchor_dir, exist_ok=True)

    # Écriture atomique avec fichier temporaire dans le même répertoire
    temp_fd, temp_file = tempfile.mkstemp(dir=anchor_dir or None, prefix="anchor_", suffix=".tmp")
    try:
        with open(temp_fd, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_file, anchor_path)
    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass

    return head_hash


class AuditTrail:
    """
    Journalisation Inaltérable (Conformité MiFID II).
    Sauvegarde chaque exécution d'ordre en CSV avec un Hash SHA-256 de la ligne.
    """
    def __init__(self, output_dir: str = "logs"):
        self.output_dir = output_dir
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
            
        self.filename = os.path.join(self.output_dir, f"audit_trail_{datetime.datetime.utcnow().strftime('%Y-%m-%d')}.csv")
        self._init_file()

    def _init_file(self):
        if not os.path.exists(self.filename):
            with open(self.filename, mode='w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    "timestamp_utc", "ticket", "symbol", "direction", 
                    "volume", "price", "sl", "tp", "ml_confidence", "sha256_signature"
                ])

    def log_order(self, order_data: Dict[str, Any]):
        """Enregistre l'ordre avec une signature cryptographique."""
        try:
            timestamp = datetime.datetime.utcnow().isoformat()
            
            raw_string = (
                f"{timestamp}|{order_data.get('ticket')}|{order_data.get('symbol')}|"
                f"{order_data.get('direction')}|{order_data.get('volume')}|{order_data.get('price')}"
            )
            
            signature = hashlib.sha256(raw_string.encode('utf-8')).hexdigest()
            
            with open(self.filename, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    timestamp,
                    order_data.get('ticket'),
                    order_data.get('symbol'),
                    order_data.get('direction'),
                    order_data.get('volume'),
                    order_data.get('price'),
                    order_data.get('sl'),
                    order_data.get('tp'),
                    order_data.get('ml_confidence'),
                    signature
                ])
            logging.debug(f"[AuditTrail] Ordre {order_data.get('ticket')} tracé avec signature {signature[:8]}...")
        except Exception as e:
            logging.error(f"[AuditTrail] Échec de la journalisation MiFID II : {e}")
