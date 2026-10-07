"""AES-256-GCM encryption at rest for KYC documents and ownership proofs."""
import base64
import hashlib
import os
import uuid
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings


def _key() -> bytes:
    if settings.KYC_ENCRYPTION_KEY:
        key = base64.b64decode(settings.KYC_ENCRYPTION_KEY)
        if len(key) != 32:
            raise ValueError("KYC_ENCRYPTION_KEY must be 32 bytes, base64-encoded")
        return key
    return hashlib.sha256(("kyc:" + settings.SECRET_KEY).encode()).digest()


def encrypt_bytes(data: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(_key()).encrypt(nonce, data, None)


def decrypt_bytes(blob: bytes) -> bytes:
    return AESGCM(_key()).decrypt(blob[:12], blob[12:], None)


def encrypt_text(text: str) -> str:
    return base64.b64encode(encrypt_bytes(text.encode())).decode()


def decrypt_text(token: str) -> str:
    return decrypt_bytes(base64.b64decode(token)).decode() if token else ""


def store_private_file(upload, folder: str) -> str:
    """Encrypt an uploaded file into PRIVATE_ROOT. Returns 'folder/<uuid>.bin|<name>|<type>'."""
    root = Path(settings.PRIVATE_ROOT) / folder
    root.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.bin"
    (root / name).write_bytes(encrypt_bytes(upload.read()))
    content_type = getattr(upload, "content_type", "") or "application/octet-stream"
    original = os.path.basename(getattr(upload, "name", "file"))[:120].replace("|", "_")
    return f"{folder}/{name}|{original}|{content_type}"


def read_private_file(ref: str):
    """Returns (bytes, original_name, content_type) for a ref made by store_private_file."""
    path, original, content_type = ref.split("|", 2)
    full = (Path(settings.PRIVATE_ROOT) / path).resolve()
    if Path(settings.PRIVATE_ROOT).resolve() not in full.parents:
        raise FileNotFoundError(ref)
    return decrypt_bytes(full.read_bytes()), original, content_type
