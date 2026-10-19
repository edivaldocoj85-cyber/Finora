"""Cliente mínimo da UAZAPI (WhatsApp): enviar texto, "digitando…" e marcar como lida.
Nunca levanta exceção — falha de envio vira log, como Pluggy/e-mail."""
import logging

import httpx

from ..config import get_settings

log = logging.getLogger("finora.uazapi")
TIMEOUT = 15


def _call(method: str, path: str, body: dict) -> None:
    s = get_settings()
    try:
        r = httpx.request(method, f"{s.uazapi_base_url.rstrip('/')}{path}", json=body,
                          headers={"token": s.uazapi_instance_token}, timeout=TIMEOUT)
        if r.status_code >= 400:
            log.warning("%s %s -> HTTP %s: %s", method, path, r.status_code, r.text[:120])
    except httpx.HTTPError as e:
        log.warning("%s %s falhou: %s", method, path, e)


def send_text(number: str, text: str) -> None:
    _call("POST", "/send/text", {"number": number, "text": text})


def send_presence(number: str, presence: str) -> None:
    """presence: composing | recording | paused"""
    _call("POST", "/send/presence", {"number": number, "presence": presence})


def mark_read(number: str, message_id: str) -> None:
    _call("PUT", "/send/read", {"number": number, "messageId": message_id})
