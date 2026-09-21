"""Modelos multi-inquilino: todo registro pertence a um usuário (user_id)."""
from datetime import datetime, date
from sqlalchemy import (String, Integer, Float, Boolean, Date, DateTime, ForeignKey,
                        Text, JSON, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    plan: Mapped[str] = mapped_column(String(20), default="free")  # free | pro
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime)  # admin pode suspender acesso sem apagar dados
    lgpd_consent_at: Mapped[datetime | None] = mapped_column(DateTime)
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime)
    mfa_secret: Mapped[str | None] = mapped_column(String(64))  # base32, TOTP
    mfa_enabled_at: Mapped[datetime | None] = mapped_column(DateTime)  # null = setup ainda não confirmado
    mfa_backup_codes: Mapped[str | None] = mapped_column(Text)  # JSON: lista de hashes bcrypt, um por código
    monthly_goal_savings: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Owned:
    """Mixin para dados do usuário."""
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Category(Owned, Base):
    __tablename__ = "categories"
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(10), default="expense")  # expense | income
    color: Mapped[str] = mapped_column(String(9), default="#6366f1")
    icon: Mapped[str] = mapped_column(String(40), default="tag")
    monthly_budget: Mapped[float] = mapped_column(Float, default=0)
    essential: Mapped[bool] = mapped_column(Boolean, default=False)


class CategoryRule(Owned, Base):
    """Regra personalizada: se a descrição contém `pattern`, aplica a categoria."""
    __tablename__ = "category_rules"
    pattern: Mapped[str] = mapped_column(String(120))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    priority: Mapped[int] = mapped_column(Integer, default=0)


class Account(Owned, Base):
    __tablename__ = "accounts"
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default="checking")  # checking|savings|investment|cash|credit_card
    institution: Mapped[str] = mapped_column(String(120), default="")
    balance: Mapped[float] = mapped_column(Float, default=0)
    credit_limit: Mapped[float] = mapped_column(Float, default=0)
    closing_day: Mapped[int | None] = mapped_column(Integer)
    due_day: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String(9), default="#0ea5e9")
    pluggy_account_id: Mapped[str | None] = mapped_column(String(64), index=True)
    pluggy_item_id: Mapped[str | None] = mapped_column(String(64))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    import_reminder: Mapped[str] = mapped_column(String(10), default="none")  # none|daily|weekly|monthly
    last_import_at: Mapped[datetime | None] = mapped_column(DateTime)


class Transaction(Owned, Base):
    __tablename__ = "transactions"
    __table_args__ = (UniqueConstraint("user_id", "external_id", name="uq_tx_external"),)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))  # só em transferências
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float)  # sempre positivo
    type: Mapped[str] = mapped_column(String(10))  # expense | income | transfer
    installment: Mapped[str | None] = mapped_column(String(20))  # "3/10"
    notes: Mapped[str] = mapped_column(Text, default="")
    external_id: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual | pluggy
    category_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    receipt_path: Mapped[str | None] = mapped_column(String(255))  # comprovante anexado (dar baixa)

    account = relationship("Account", foreign_keys=[account_id])
    to_account = relationship("Account", foreign_keys=[to_account_id])
    category = relationship("Category")


class Contract(Owned, Base):
    """Contratos e contas recorrentes: aluguel, financiamento, assinaturas, seguros..."""
    __tablename__ = "contracts"
    name: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str] = mapped_column(String(120), default="")
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    amount: Mapped[float] = mapped_column(Float)
    due_day: Mapped[int] = mapped_column(Integer, default=10)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    total_installments: Mapped[int | None] = mapped_column(Integer)
    interest_rate_month: Mapped[float] = mapped_column(Float, default=0)
    adjustment_index: Mapped[str] = mapped_column(String(20), default="")  # IPCA, IGP-M...
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class Income(Owned, Base):
    """Fontes de renda: salário, pró-labore, aluguel recebido, freelas."""
    __tablename__ = "incomes"
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default="salary")  # salary|freelance|rent|dividends|other
    person_type: Mapped[str] = mapped_column(String(2), default="PF")  # PF | PJ
    gross_amount: Mapped[float] = mapped_column(Float, default=0)
    net_amount: Mapped[float] = mapped_column(Float)
    pay_day: Mapped[int] = mapped_column(Integer, default=5)
    recurring: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Goal(Owned, Base):
    __tablename__ = "goals"
    name: Mapped[str] = mapped_column(String(120))
    target_amount: Mapped[float] = mapped_column(Float)
    current_amount: Mapped[float] = mapped_column(Float, default=0)
    deadline: Mapped[date | None] = mapped_column(Date)


class PluggyItem(Owned, Base):
    __tablename__ = "pluggy_items"
    item_id: Mapped[str] = mapped_column(String(64), index=True)
    connector_name: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(40), default="")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_error: Mapped[str] = mapped_column(Text, default="")


class Alert(Owned, Base):
    __tablename__ = "alerts"
    level: Mapped[str] = mapped_column(String(10), default="info")  # info|warning|danger
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    key: Mapped[str] = mapped_column(String(120), index=True)  # evita duplicados
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class AdvisorReport(Owned, Base):
    __tablename__ = "advisor_reports"
    content: Mapped[str] = mapped_column(Text)
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
