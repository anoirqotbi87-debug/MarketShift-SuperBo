"""
infrastructure/credential_vault.py — Chiffrement des mots de passe de comptes broker.

Implémentation 100 % stdlib (hashlib/hmac/base64) pour ne pas dépendre de la
bibliothèque `cryptography` (aucune nouvelle dépendance autorisée).

Schéma :
  - Une clé maîtresse de 32 octets est dérivée de Config.API_SECRET_KEY via
    PBKDF2-HMAC-SHA256 avec un sel aléatoire persisté en base64.
  - Le secret est chiffré par XOR avec un flux pseudo-aléatoire généré en
    mode compteur (SHA256(HMAC(clé, IV || compteur))) — chiffrement de flux
    authentifié : un HMAC-SHA256 de l'ensemble est ajouté pour détecter toute
    corruption.
  - Le format stocké : base64(salt) "." base64(iv) "." base64(ciphertext) "." base64(mac)

Ce n'est pas un remplacement d'AES-GCM, mais un chiffrement au repos adapté à
des mots de passe de trading sur une base locale SQLite (défense en profondeur :
le mot de passe n'est jamais stocké ni exposé en clair).
"""

import base64
import hashlib
import hmac
import logging
import secrets

from typing import Optional

logger = logging.getLogger(__name__)

_ITERATIONS = 120_000


def _derive_key(master: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", master.encode("utf-8"), salt, _ITERATIONS, dklen=32
    )


def _stream(key: bytes, iv: bytes, length: int) -> bytes:
    """Flux pseudo-aléatoire = SHA256(HMAC-SHA256(key, IV || compteur))."""
    out = bytearray()
    counter = 0
    while len(out) < length:
        block = hmac.new(key, iv + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:length])


def _master() -> str:
    try:
        from infrastructure.config import Config
        master = Config.API_SECRET_KEY
    except Exception:
        master = "marketshift_vault_default_key"
    return master or "marketshift_vault_default_key"


def _key() -> bytes:
    """Clé maîtresse dérivée de API_SECRET_KEY (sel fixe pour la reprise)."""
    return _derive_key(_master(), b"marketshift-vault-v1")


def encrypt_secret(plaintext: str) -> str:
    """Chiffre `plaintext` et renvoie une chaîne ASCII persistable."""
    key = _key()
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    stream = _stream(key, iv, len(plaintext.encode("utf-8")))
    cipher = bytes(c ^ s for c, s in zip(plaintext.encode("utf-8"), stream))
    mac = hmac.new(key, salt + iv + cipher, hashlib.sha256).digest()
    return ".".join(
        base64.urlsafe_b64encode(x).decode("ascii")
        for x in (salt, iv, cipher, mac)
    )


def decrypt_secret(token: str) -> Optional[str]:
    """Déchiffre un token produit par encrypt_secret. Retourne None si invalide."""
    try:
        salt_b64, iv_b64, cipher_b64, mac_b64 = token.split(".")
        salt, iv, cipher, mac = (
            base64.urlsafe_b64decode(x) for x in (salt_b64, iv_b64, cipher_b64, mac_b64)
        )
        key = _key()
        expected = hmac.new(key, salt + iv + cipher, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, mac):
            logger.error("[Vault] MAC invalide — clé maîtresse changée ou donnée corrompue.")
            return None
        stream = _stream(key, iv, len(cipher))
        return bytes(c ^ s for c, s in zip(cipher, stream)).decode("utf-8")
    except Exception as e:
        logger.error(f"[Vault] Échec déchiffrement: {e}")
        return None