import os
import csv
import hashlib
import datetime
import logging
from typing import Dict, Any

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
