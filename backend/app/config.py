from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Finora"
    database_url: str = "sqlite:///./finora.db"
    secret_key: str = "troque-esta-chave"  # assina os tokens de login — defina em produção
    token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "*"
    public_url: str = "http://localhost:8000"

    # Pluggy (plano pago necessário para uso comercial)
    pluggy_client_id: str = ""
    pluggy_client_secret: str = ""
    pluggy_base_url: str = "https://api.pluggy.ai"
    pluggy_webhook_secret: str = ""

    # IA (Anthropic)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"

    # Login com Google (Google Cloud Console -> OAuth Client ID, tipo "Web application")
    google_client_id: str = ""

    # Mercado
    brapi_token: str = ""

    sync_interval_minutes: int = 360

    # Comprovantes de pagamento: disco local (Docker) por padrão. Se supabase_url e
    # supabase_service_key estiverem definidos, usa Supabase Storage (necessário na Vercel,
    # onde o sistema de arquivos das funções é temporário).
    upload_dir: str = "/srv/uploads"
    max_upload_mb: int = 8
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_bucket: str = "receipts"

    # Autenticação (Supabase Auth / GoTrue): o backend só verifica o JWT de sessão (via
    # JWKS público de supabase_url, sem segredo nenhum); o frontend precisa de supabase_url
    # + supabase_anon_key (chave pública, segura de expor) pra abrir o client supabase-js.
    supabase_anon_key: str = ""

    # Vercel Cron chama /api/cron/sync no lugar da tarefa em segundo plano (que não existe
    # em ambiente serverless); a Vercel manda esse valor como "Authorization: Bearer <valor>"
    # automaticamente quando CRON_SECRET está configurado — https://vercel.com/docs/cron-jobs
    cron_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
