"""Envio de e-mail transacional via Resend (https://resend.com — grátis até 3.000/mês,
100/dia, sem cartão). Sem RESEND_API_KEY configurada, todo envio vira um no-op silencioso —
mesmo padrão de Pluggy/Anthropic/brapi: funcionalidade opcional, nunca quebra o resto."""
import httpx

from ..config import get_settings


def enabled() -> bool:
    return bool(get_settings().resend_api_key)


def send(to: str, subject: str, html: str) -> bool:
    s = get_settings()
    if not s.resend_api_key or not to:
        return False
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {s.resend_api_key}", "Content-Type": "application/json"},
            json={"from": s.resend_from, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
        return r.status_code < 300
    except httpx.HTTPError:
        return False
