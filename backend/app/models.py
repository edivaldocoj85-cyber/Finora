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
    supabase_uid: Mapped[str | None] = mapped_column(String(36), unique=True, index=True)  # auth.users.id do Supabase
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    plan: Mapped[str] = mapped_column(String(20), default="trial")  # trial | free | pro
    # 10 dias corridos a partir do primeiro login, só pra quem se cadastra a partir do teste
    # grátis (contas que já existiam antes disso ficam com NULL = sem limite, "legado").
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime)  # admin pode suspender acesso sem apagar dados
    lgpd_consent_at: Mapped[datetime | None] = mapped_column(DateTime)
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime)
    monthly_goal_savings: Mapped[float] = mapped_column(Float, default=0)
    email_alerts: Mapped[bool] = mapped_column(Boolean, default=True)  # alertas importantes por e-mail
    # empresa/entidade: um "usuário" sem login, dono dos próprios dados, controlado por owner_user_id
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entity_kind: Mapped[str] = mapped_column(String(2), default="pf")  # pf | pj
    document: Mapped[str] = mapped_column(String(20), default="")  # CNPJ da empresa
    investor_profile: Mapped[str | None] = mapped_column(String(12))  # declarado: conservador|moderado|arrojado (vazio = calculado)
    dashboard_layout: Mapped[str | None] = mapped_column(Text)  # JSON: ordem e seções escondidas do painel
    email_digest: Mapped[str] = mapped_column(String(10), default="weekly")  # weekly | none
    last_daily_run_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_digest_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class WaitlistSignup(Base):
    """Pedido de acesso antecipado feito na landing pública — não é dado de um usuário
    autenticado, por isso não usa o mixin Owned (sem user_id)."""
    __tablename__ = "waitlist_signups"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
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
    code: Mapped[str | None] = mapped_column(String(20))  # código no plano de contas (3.1.01…)
    dre_group: Mapped[str | None] = mapped_column(String(25))  # grupo da DRE (services/chart_of_accounts.py)


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
    # milhas, pontos e cashback (só cartão de crédito)
    rewards_program: Mapped[str] = mapped_column(String(40), default="")  # Livelo, Smiles, Esfera, LATAM Pass…
    rewards_rate: Mapped[float | None] = mapped_column(Float)  # pontos por unidade gasta
    rewards_unit: Mapped[str] = mapped_column(String(3), default="usd")  # usd | brl
    cashback_pct: Mapped[float | None] = mapped_column(Float)
    point_value: Mapped[float | None] = mapped_column(Float)  # R$ por 1.000 pontos (padrão 20)
    rewards_balance: Mapped[float | None] = mapped_column(Float)
    rewards_expire: Mapped[date | None] = mapped_column(Date)
    annual_fee: Mapped[float | None] = mapped_column(Float)


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
    # fatura a que pertence (mês do fechamento, "2026-10"); vazio = pela data e o dia de fechamento
    invoice_month: Mapped[str | None] = mapped_column(String(7), index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    external_id: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual | pluggy
    category_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    receipt_path: Mapped[str | None] = mapped_column(String(255))  # comprovante anexado (dar baixa)
    cost_center_id: Mapped[int | None] = mapped_column(ForeignKey("cost_centers.id", ondelete="SET NULL"), index=True)
    # tags livres em texto: ",viagem,casamento," (vírgulas nas pontas pra filtrar com LIKE '%,viagem,%')
    tags: Mapped[str] = mapped_column(String(300), default="")
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime)  # conferido com o extrato do banco

    account = relationship("Account", foreign_keys=[account_id])
    to_account = relationship("Account", foreign_keys=[to_account_id])
    category = relationship("Category")
    cost_center = relationship("CostCenter")


class CostCenter(Owned, Base):
    """Centro de custo: pra quem é ou de onde vem o gasto (Casa, Filhos, Empresa X, Obra…).
    Atravessa as categorias: "Mercado" pode ser da Casa ou da Empresa."""
    __tablename__ = "cost_centers"
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(9), default="#6366f1")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


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
    kind: Mapped[str] = mapped_column(String(20), default="contract")  # contract|subscription|rent|financing|insurance|service
    adjustment_month: Mapped[int | None] = mapped_column(Integer)  # mês do reajuste (vazio = mês do início)
    last_adjusted_at: Mapped[date | None] = mapped_column(Date)
    renewal_date: Mapped[date | None] = mapped_column(Date)  # fim do período / renovação automática
    cancel_notice_days: Mapped[int] = mapped_column(Integer, default=0)  # aviso prévio pra cancelar sem multa
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class Receivable(Owned, Base):
    """Contas a receber: cobrança de cliente, prestação de serviço — pontual, não recorrente
    como as fontes de Income. Autônomo/pequeno negócio usa pra acompanhar o que falta cair."""
    __tablename__ = "receivables"
    client_name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(200), default="")
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[date] = mapped_column(Date)
    received_at: Mapped[datetime | None] = mapped_column(DateTime)
    notes: Mapped[str] = mapped_column(Text, default="")


class SharedAccess(Base):
    """Convite de acesso compartilhado: um usuário aceito passa a ver e editar os dados
    de `owner_id` em vez dos próprios (sócio(a), cônjuge ou contador acompanhando a mesma
    conta). Cada pessoa só pode estar em UM workspace emprestado por vez — sem hierarquia,
    sem mesclar dados de dois donos diferentes."""
    __tablename__ = "shared_access"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    member_email: Mapped[str] = mapped_column(String(180), index=True)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10), default="editor")  # editor | viewer
    cost_center_ids: Mapped[str | None] = mapped_column(String(200))  # "3,7": só vê e lança nesses centros de custo
    invited_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


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
    kind: Mapped[str] = mapped_column(String(20), default="custom")  # custom | emergency_fund
    # só usados quando kind="emergency_fund": target_amount vira months_target × monthly_cost
    months_target: Mapped[float | None] = mapped_column(Float)
    monthly_cost: Mapped[float | None] = mapped_column(Float)


class Asset(Owned, Base):
    """Bens que entram no patrimônio líquido mas não são contas conectadas — imóvel,
    veículo, etc. Cadastrados à mão, com consulta opcional à tabela FIPE pra veículos."""
    __tablename__ = "assets"
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default="outro")  # imovel | veiculo | outro
    value: Mapped[float] = mapped_column(Float, default=0)
    vehicle_fipe_code: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str] = mapped_column(String(300), default="")


class Investment(Owned, Base):
    """Um ativo da carteira. Renda variável/cripto: quantidade × cotação. Renda fixa e Tesouro:
    cada aporte rende pelo indexador (% do CDI, prefixado ou IPCA+), como nas caixinhas."""
    __tablename__ = "investments"
    name: Mapped[str] = mapped_column(String(120))
    ticker: Mapped[str] = mapped_column(String(30), default="")  # PETR4, HGLG11, BTC…
    asset_class: Mapped[str] = mapped_column(String(15))  # acao|fii|etf|bdr|cripto|internacional|cdb|lci_lca|tesouro|debenture|fundo|outro
    broker: Mapped[str] = mapped_column(String(80), default="")
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    # renda fixa
    index_type: Mapped[str | None] = mapped_column(String(10))  # cdi | selic | pre | ipca
    index_rate: Mapped[float | None] = mapped_column(Float)  # % do CDI, ou % a.a. (pre / spread do IPCA+)
    maturity: Mapped[date | None] = mapped_column(Date)
    tax_free: Mapped[bool] = mapped_column(Boolean, default=False)
    # cotação informada à mão (sem API pra esse ativo, ou fundo)
    manual_price: Mapped[float | None] = mapped_column(Float)
    manual_price_at: Mapped[date | None] = mapped_column(Date)
    target_pct: Mapped[float | None] = mapped_column(Float)  # % alvo na carteira (rebalanceamento)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    trades: Mapped[list["InvestmentTrade"]] = relationship(cascade="all, delete-orphan", order_by="InvestmentTrade.date")
    events: Mapped[list["InvestmentEvent"]] = relationship(cascade="all, delete-orphan", order_by="InvestmentEvent.date")


class InvestmentTrade(Owned, Base):
    __tablename__ = "investment_trades"
    investment_id: Mapped[int] = mapped_column(ForeignKey("investments.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(5))  # buy | sell
    quantity: Mapped[float] = mapped_column(Float)  # renda fixa: 1 (o valor vai em price)
    price: Mapped[float] = mapped_column(Float)
    fees: Mapped[float] = mapped_column(Float, default=0)
    day_trade: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(String(200), default="")


class InvestmentEvent(Owned, Base):
    """Proventos e eventos: dividendo, JCP, rendimento de FII, juros/amortização de título."""
    __tablename__ = "investment_events"
    investment_id: Mapped[int] = mapped_column(ForeignKey("investments.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)  # data de pagamento
    kind: Mapped[str] = mapped_column(String(12))  # dividend | jcp | income | interest | amortization
    amount: Mapped[float] = mapped_column(Float)  # valor líquido recebido (total)
    per_unit: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(200), default="")


class PortfolioSnapshot(Owned, Base):
    """Foto diária da carteira (rotina diária): base do TWRR e do gráfico de evolução."""
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_portfolio_snapshot_day"),)
    date: Mapped[date] = mapped_column(Date, index=True)
    value: Mapped[float] = mapped_column(Float)
    invested: Mapped[float] = mapped_column(Float)
    net_flow: Mapped[float] = mapped_column(Float, default=0)  # aportes − resgates − proventos do dia
    net_worth: Mapped[float | None] = mapped_column(Float)


class Pot(Owned, Base):
    """Caixinha com rendimento (Nubank, Inter, PicPay…). O saldo não é guardado: sai dos
    movimentos + taxa diária do índice (ver services/pots.py)."""
    __tablename__ = "pots"
    name: Mapped[str] = mapped_column(String(120))
    institution: Mapped[str] = mapped_column(String(120), default="")
    color: Mapped[str] = mapped_column(String(9), default="#10b981")
    yield_type: Mapped[str] = mapped_column(String(10), default="cdi")  # cdi | selic | pre
    yield_rate: Mapped[float] = mapped_column(Float, default=100)  # % do índice, ou % a.a. se pre
    tax_free: Mapped[bool] = mapped_column(Boolean, default=False)  # LCI/LCA/poupança: sem IR e IOF
    goal_amount: Mapped[float | None] = mapped_column(Float)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    moves: Mapped[list["PotMove"]] = relationship(cascade="all, delete-orphan", order_by="PotMove.date")


class PotMove(Owned, Base):
    __tablename__ = "pot_moves"
    pot_id: Mapped[int] = mapped_column(ForeignKey("pots.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(10))  # deposit | withdraw | adjust (acerto, pode ser negativo)
    amount: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(200), default="")


class PluggyItem(Owned, Base):
    __tablename__ = "pluggy_items"
    item_id: Mapped[str] = mapped_column(String(64), index=True)
    connector_name: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(40), default="")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_error: Mapped[str] = mapped_column(Text, default="")


class WhatsAppLink(Owned, Base):
    """Número de WhatsApp vinculado a um usuário (um por pessoa). O vínculo só vale depois
    que a própria pessoa manda, desse número, o código gerado no app — assim ninguém liga
    um número que não é seu. user_id é sempre o login (dados pessoais), nunca uma empresa."""
    __tablename__ = "whatsapp_links"
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)  # só dígitos, como chega da UAZAPI
    verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    code_hash: Mapped[str | None] = mapped_column(String(64))  # sha256 do código pendente
    code_expires_at: Mapped[datetime | None] = mapped_column(DateTime)


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
