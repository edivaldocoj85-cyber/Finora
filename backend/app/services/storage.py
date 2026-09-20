"""Armazenamento de comprovantes de pagamento.

Dois modos, escolhidos automaticamente pela configuração:
- **Disco local** (`upload_dir`, padrão): usado no deploy via Docker Compose, onde o
  volume `uploads` é persistente entre reinícios.
- **Supabase Storage**: usado quando `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` estão
  definidos — necessário na Vercel, onde o sistema de arquivos de cada função é
  temporário e não sobrevive entre chamadas.

`Transaction.receipt_path` guarda um identificador opaco: um caminho absoluto de
disco no primeiro modo, ou `supabase:<chave-do-objeto>` no segundo. Nada fora deste
módulo precisa saber qual dos dois está em uso.
"""
import uuid
from pathlib import Path

import httpx

from ..config import get_settings

RECEIPT_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
                 "image/heic": ".heic", "application/pdf": ".pdf"}
_CONTENT_TYPE_BY_EXT = {v: k for k, v in RECEIPT_TYPES.items()}


def ext_for(content_type: str) -> str | None:
    return RECEIPT_TYPES.get(content_type)


def _using_supabase() -> bool:
    s = get_settings()
    return bool(s.supabase_url and s.supabase_service_key)


def _headers() -> dict:
    s = get_settings()
    return {"Authorization": f"Bearer {s.supabase_service_key}", "apikey": s.supabase_service_key}


def save(user_id: int, tid: int, ext: str, data: bytes) -> str:
    """Salva o arquivo e devolve o identificador a guardar em Transaction.receipt_path."""
    key = f"{user_id}/{tid}-{uuid.uuid4().hex[:8]}{ext}"
    s = get_settings()
    if _using_supabase():
        r = httpx.post(
            f"{s.supabase_url}/storage/v1/object/{s.supabase_bucket}/{key}",
            headers={**_headers(), "Content-Type": _CONTENT_TYPE_BY_EXT.get(ext, "application/octet-stream")},
            content=data, timeout=30,
        )
        if r.status_code >= 300:
            raise RuntimeError(f"Falha ao enviar comprovante ao Supabase: {r.status_code} {r.text[:200]}")
        return f"supabase:{key}"
    dest = Path(s.upload_dir) / str(user_id)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / key.split("/", 1)[1]
    path.write_bytes(data)
    return str(path)


def delete(path: str | None) -> None:
    if not path:
        return
    if path.startswith("supabase:"):
        key = path.split(":", 1)[1]
        s = get_settings()
        httpx.delete(f"{s.supabase_url}/storage/v1/object/{s.supabase_bucket}/{key}",
                     headers=_headers(), timeout=15)
        return
    Path(path).unlink(missing_ok=True)


def resolve(path: str) -> tuple[str, str] | None:
    """('file', caminho_local) ou ('url', link_assinado) — o endpoint decide entre
    FileResponse e RedirectResponse a partir disso. None se o arquivo não existe mais."""
    if path.startswith("supabase:"):
        key = path.split(":", 1)[1]
        s = get_settings()
        r = httpx.post(f"{s.supabase_url}/storage/v1/object/sign/{s.supabase_bucket}/{key}",
                       headers=_headers(), json={"expiresIn": 120}, timeout=15)
        if r.status_code >= 300:
            return None
        signed = r.json().get("signedURL")
        return ("url", f"{s.supabase_url}/storage/v1{signed}") if signed else None
    p = Path(path)
    return ("file", str(p)) if p.is_file() else None
