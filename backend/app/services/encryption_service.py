from __future__ import annotations

from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet, InvalidToken


class EncryptionService:
    PREFIX = "enc:v1:"

    def __init__(self, encryption_secret: str | None) -> None:
        if not encryption_secret or not encryption_secret.strip():
            raise ValueError("Missing ENCRYPTION_KEY in environment.")
        derived_key = urlsafe_b64encode(sha256(encryption_secret.encode("utf-8")).digest())
        self._fernet = Fernet(derived_key)

    def encrypt(self, plaintext: str) -> str:
        raw = plaintext.strip()
        if not raw:
            return ""
        token = self._fernet.encrypt(raw.encode("utf-8")).decode("utf-8")
        return f"{self.PREFIX}{token}"

    def decrypt_if_encrypted(self, value: str | None) -> str | None:
        if value is None:
            return None

        raw = str(value).strip()
        if not raw:
            return None

        if not raw.startswith(self.PREFIX):
            # Backward compatibility for previously stored plaintext keys.
            return raw

        token = raw[len(self.PREFIX) :]
        try:
            return self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Stored API key cannot be decrypted. Check ENCRYPTION_KEY.") from exc
