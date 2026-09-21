import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from .config import get_settings
from .db import Base, SessionLocal, engine
from .models import Category, PluggyItem, User
from .routers.api import router
from .services import analytics, pluggy
from .services.categorizer import DEFAULT_CATEGORIES

log = logging.getLogger("finora")
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
# A Vercel define essa variável em toda função serverless. Sem processo contínuo lá, não
# existe tarefa em segundo plano nem faz sentido montar o frontend (a Vercel serve os
# arquivos estáticos direto, sem passar pela função Python) — ver vercel.json.
ON_VERCEL = bool(os.environ.get("VERCEL"))


def _migrate(engine):
    """Adiciona colunas novas em tabelas já existentes (create_all só cria tabelas novas)."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        if "users" in tables:
            cols = {c["name"] for c in insp.get_columns("users")}
            if "google_id" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(64)"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"))
            if "avatar_url" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)"))
            if "onboarded_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMP"))
            if "is_admin" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE"))
            if "suspended_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN suspended_at TIMESTAMP"))
            if "supabase_uid" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN supabase_uid VARCHAR(36)"))
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_supabase_uid ON users (supabase_uid)"))
            # Autenticação migrou pro Supabase Auth — essas colunas guardavam credenciais
            # do sistema de login caseiro (senha aleatória, segredo TOTP, códigos de backup)
            # e não têm mais uso; removidas para não deixar segredo morto no banco.
            for legacy_col in ("password_hash", "google_id", "mfa_secret", "mfa_enabled_at", "mfa_backup_codes"):
                if legacy_col in cols:
                    conn.execute(text(f"ALTER TABLE users DROP COLUMN {legacy_col}"))
        if "accounts" in tables:
            cols = {c["name"] for c in insp.get_columns("accounts")}
            if "import_reminder" not in cols:
                conn.execute(text("ALTER TABLE accounts ADD COLUMN import_reminder VARCHAR(10) DEFAULT 'none'"))
            if "last_import_at" not in cols:
                conn.execute(text("ALTER TABLE accounts ADD COLUMN last_import_at TIMESTAMP"))
        if "transactions" in tables:
            cols = {c["name"] for c in insp.get_columns("transactions")}
            if "to_account_id" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN to_account_id INTEGER"))
            if "receipt_path" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN receipt_path VARCHAR(255)"))
        if "contracts" in tables:
            cols = {c["name"] for c in insp.get_columns("contracts")}
            if "account_id" not in cols:
                conn.execute(text("ALTER TABLE contracts ADD COLUMN account_id INTEGER"))


def _backfill_default_categories():
    """Novas categorias padrão adicionadas depois do cadastro de um usuário não chegam
    sozinhas (seed_categories só roda no registro); preenche o que falta, sem duplicar."""
    db = SessionLocal()
    try:
        for user_id, in db.query(User.id).all():
            existing = {n for n, in db.query(Category.name).filter_by(user_id=user_id).all()}
            for name, kind, color, icon, essential, _keywords in DEFAULT_CATEGORIES:
                if name not in existing:
                    db.add(Category(user_id=user_id, name=name, kind=kind, color=color,
                                    icon=icon, essential=essential))
        db.commit()
    finally:
        db.close()


async def periodic_sync():
    """Sincroniza todas as conexões Pluggy periodicamente (complementa os webhooks)."""
    interval = get_settings().sync_interval_minutes * 60
    while True:
        await asyncio.sleep(interval)
        if not pluggy.enabled():
            continue
        db = SessionLocal()
        try:
            for it in db.query(PluggyItem).all():
                try:
                    await asyncio.to_thread(pluggy.sync_item, db, it.user_id, it.item_id, 15)
                    analytics.run_alerts(db, it.user_id)
                except Exception as e:  # noqa: BLE001
                    log.warning("sync %s falhou: %s", it.item_id, e)
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if s.public_url.startswith("https://") and (s.secret_key == "troque-esta-chave" or len(s.secret_key) < 32):
        raise RuntimeError("Defina SECRET_KEY com pelo menos 32 caracteres antes de ir para produção.")
    Base.metadata.create_all(engine)
    _migrate(engine)
    _backfill_default_categories()
    task = None if ON_VERCEL else asyncio.create_task(periodic_sync())
    yield
    if task:
        task.cancel()


app = FastAPI(title="Finora API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins.split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request, call_next):
    """Cabeçalhos de defesa em profundidade — o Caddy já os define na borda em produção,
    mas o app responde igual quando acessado direto (dev, healthcheck, outro proxy)."""
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return resp


app.include_router(router)


@app.get("/api/health")
def health():
    return {"ok": True, "pluggy": pluggy.enabled(), "ai": bool(get_settings().anthropic_api_key)}


@app.get("/api/public-config")
def public_config():
    """Configuração pública (sem segredos) que o frontend precisa antes do login."""
    s = get_settings()
    return {"google_client_id": s.google_client_id, "supabase_url": s.supabase_url,
            "supabase_anon_key": s.supabase_anon_key}


@app.get("/api/cron/sync")
async def cron_sync(request: Request):
    """Chamado pela Vercel Cron no lugar da tarefa em segundo plano (ver vercel.json)."""
    s = get_settings()
    if s.cron_secret and request.headers.get("authorization") != f"Bearer {s.cron_secret}":
        raise HTTPException(401, "Não autorizado")
    if not pluggy.enabled():
        return {"synced": 0}
    db = SessionLocal()
    n = 0
    try:
        for it in db.query(PluggyItem).all():
            try:
                await asyncio.to_thread(pluggy.sync_item, db, it.user_id, it.item_id, 15)
                analytics.run_alerts(db, it.user_id)
                n += 1
            except Exception as e:  # noqa: BLE001
                log.warning("cron sync %s falhou: %s", it.item_id, e)
    finally:
        db.close()
    return {"synced": n}


if not ON_VERCEL:
    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = FRONTEND / path
        if path and f.is_file() and FRONTEND in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(FRONTEND / "index.html")
