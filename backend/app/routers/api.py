import csv
import hashlib
import hmac
import io
import secrets
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import create_token, current_user, hash_password, rate_limit, verify_google_credential, verify_password
from ..config import get_settings
from ..db import get_db, SessionLocal
from ..models import (Account, AdvisorReport, Alert, Category, CategoryRule, Contract, Goal,
                      Income, PluggyItem, Transaction, User)
from ..services import advisor, analytics, assistant, market, pluggy, storage
from ..services.categorizer import categorize, seed_categories

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- auth
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    lgpd_consent: bool


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def user_out(u: User):
    return {"id": u.id, "name": u.name, "email": u.email, "plan": u.plan,
            "monthly_goal_savings": u.monthly_goal_savings, "avatar_url": u.avatar_url,
            "has_google": bool(u.google_id), "onboarded": bool(u.onboarded_at)}


@router.post("/auth/register", dependencies=[Depends(rate_limit("register", 8, 3600))])
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if not data.lgpd_consent:
        raise HTTPException(400, "É necessário aceitar os termos e a política de privacidade.")
    if db.query(User).filter_by(email=data.email.lower()).first():
        raise HTTPException(400, "E-mail já cadastrado.")
    u = User(name=data.name, email=data.email.lower(), password_hash=hash_password(data.password),
             lgpd_consent_at=datetime.utcnow())
    db.add(u)
    db.commit()
    seed_categories(db, u.id)
    return {"token": create_token(u.id), "user": user_out(u)}


@router.post("/auth/login", dependencies=[Depends(rate_limit("login", 10, 300))])
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=data.email.lower()).first()
    if not u or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "E-mail ou senha incorretos.")
    return {"token": create_token(u.id), "user": user_out(u)}


class GoogleIn(BaseModel):
    credential: str = Field(min_length=10)


@router.post("/auth/google", dependencies=[Depends(rate_limit("google", 20, 300))])
def auth_google(data: GoogleIn, db: Session = Depends(get_db)):
    claims = verify_google_credential(data.credential)
    google_id = claims["sub"]
    email = (claims.get("email") or "").lower()
    u = db.query(User).filter_by(google_id=google_id).first()
    if not u and email:
        u = db.query(User).filter_by(email=email).first()  # vincula conta já criada por e-mail
    is_new = False
    if not u:
        u = User(name=claims.get("name") or email.split("@")[0] or "Usuário", email=email,
                 password_hash=hash_password(secrets.token_urlsafe(32)),
                 lgpd_consent_at=datetime.utcnow())
        db.add(u)
        db.flush()
        is_new = True
    u.google_id = google_id
    u.avatar_url = claims.get("picture") or u.avatar_url
    db.commit()
    if is_new:
        seed_categories(db, u.id)
    return {"token": create_token(u.id), "user": user_out(u)}


@router.get("/me")
def me(u: User = Depends(current_user)):
    return user_out(u)


class MeIn(BaseModel):
    name: Optional[str] = None
    monthly_goal_savings: Optional[float] = None


@router.patch("/me")
def update_me(data: MeIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(u, k, v)
    db.merge(u)
    db.commit()
    return user_out(u)


@router.post("/me/onboarded")
def mark_onboarded(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Marca o assistente de primeiro acesso como concluído (ou pulado)."""
    u.onboarded_at = datetime.utcnow()
    db.merge(u)
    db.commit()
    return user_out(u)


@router.delete("/me")
def delete_me(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Direito de exclusão (LGPD): remove o usuário, seus dados e os itens na Pluggy."""
    for it in db.query(PluggyItem).filter_by(user_id=u.id):
        pluggy.delete_item(it.item_id)
    for M in (Transaction, CategoryRule, Contract, Income, Goal, Alert, AdvisorReport, PluggyItem,
              Account, Category):
        db.query(M).filter_by(user_id=u.id).delete()
    db.query(User).filter_by(id=u.id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- CRUD genérico
def to_dict(obj):
    d = {}
    for c in obj.__table__.columns:
        v = getattr(obj, c.name)
        d[c.name] = v.isoformat() if isinstance(v, (date, datetime)) else v
    return d


class AccountIn(BaseModel):
    name: str
    kind: str = "checking"
    institution: str = ""
    balance: float = 0
    credit_limit: float = 0
    closing_day: Optional[int] = Field(None, ge=1, le=31)
    due_day: Optional[int] = Field(None, ge=1, le=31)
    color: str = "#0ea5e9"
    archived: bool = False
    import_reminder: str = "none"  # none|daily|weekly|monthly


class CategoryIn(BaseModel):
    name: str
    kind: str = "expense"
    color: str = "#6366f1"
    icon: str = "tag"
    monthly_budget: float = 0
    essential: bool = False


class RuleIn(BaseModel):
    pattern: str = Field(min_length=2)
    category_id: int
    priority: int = 0
    apply_existing: bool = True


class ContractIn(BaseModel):
    name: str
    provider: str = ""
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    amount: float
    due_day: int = Field(10, ge=1, le=31)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_installments: Optional[int] = None
    interest_rate_month: float = 0
    adjustment_index: str = ""
    active: bool = True
    notes: str = ""


class IncomeIn(BaseModel):
    name: str
    kind: str = "salary"
    person_type: str = "PF"
    gross_amount: float = 0
    net_amount: float
    pay_day: int = Field(5, ge=1, le=31)
    recurring: bool = True
    active: bool = True


class GoalIn(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0
    deadline: Optional[date] = None


class TransactionIn(BaseModel):
    account_id: int
    to_account_id: Optional[int] = None  # obrigatório quando type="transfer"
    category_id: Optional[int] = None
    date: date
    description: str
    amount: float = Field(gt=0)
    type: str = "expense"
    installments: int = Field(1, ge=1, le=48)  # compra parcelada no cartão
    notes: str = ""


def _check_fk(db, user_id, model, id_):
    if id_ is not None and not db.query(model).filter_by(id=id_, user_id=user_id).first():
        raise HTTPException(400, f"{model.__name__} inválido")


def _adjust_balance(db, account_id, tx_date, delta, sign=1):
    """Aplica (sign=1) ou reverte (sign=-1) um efeito de caixa no saldo de uma conta.
    Cartão de crédito não guarda saldo por transação manual (fatura é calculada à parte);
    contas conectadas via Open Finance têm o saldo corrigido a cada sincronização com o
    banco, então ajustes manuais aqui seriam sobrescritos de qualquer forma — não fazem mal,
    mas também não são a fonte de verdade. Lançamento com data futura (parcela ainda não
    vencida) não deve afetar o saldo hoje."""
    if not account_id or delta == 0 or tx_date > date.today():
        return
    acc = db.get(Account, account_id)
    if not acc or acc.kind == "credit_card":
        return
    acc.balance += sign * delta


def _tx_balance_effect(t) -> list[tuple[int, float]]:
    """(account_id, delta) de cada perna de uma transação: receita credita, despesa
    debita, transferência debita a origem e credita o destino."""
    if t.type == "income":
        return [(t.account_id, t.amount)]
    if t.type == "expense":
        return [(t.account_id, -t.amount)]
    if t.type == "transfer" and t.to_account_id:
        return [(t.account_id, -t.amount), (t.to_account_id, t.amount)]
    return []


def _apply_tx_effect(db, t, sign=1):
    for account_id, delta in _tx_balance_effect(t):
        _adjust_balance(db, account_id, t.date, delta, sign)


def crud(path: str, Model, Schema, fks: dict | None = None, order=None):
    fks = fks or {}

    @router.get(f"/{path}", name=f"list_{path}")
    def _list(u: User = Depends(current_user), db: Session = Depends(get_db)):
        q = db.query(Model).filter_by(user_id=u.id)
        if order is not None:
            q = q.order_by(order)
        return [to_dict(o) for o in q.all()]

    @router.post(f"/{path}", name=f"create_{path}")
    def _create(data: Schema, u: User = Depends(current_user), db: Session = Depends(get_db)):
        vals = data.model_dump()
        for f, M in fks.items():
            _check_fk(db, u.id, M, vals.get(f))
        o = Model(user_id=u.id, **vals)
        db.add(o)
        db.commit()
        return to_dict(o)

    @router.put(f"/{path}/{{oid}}", name=f"update_{path}")
    def _update(oid: int, data: Schema, u: User = Depends(current_user), db: Session = Depends(get_db)):
        o = db.query(Model).filter_by(id=oid, user_id=u.id).first()
        if not o:
            raise HTTPException(404, "Não encontrado")
        vals = data.model_dump()
        for f, M in fks.items():
            _check_fk(db, u.id, M, vals.get(f))
        for k, v in vals.items():
            setattr(o, k, v)
        db.commit()
        return to_dict(o)

    @router.delete(f"/{path}/{{oid}}", name=f"delete_{path}")
    def _delete(oid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
        n = db.query(Model).filter_by(id=oid, user_id=u.id).delete()
        db.commit()
        if not n:
            raise HTTPException(404, "Não encontrado")
        return {"ok": True}


crud("accounts", Account, AccountIn, order=Account.name)
crud("categories", Category, CategoryIn, order=Category.name)
crud("contracts", Contract, ContractIn, {"category_id": Category, "account_id": Account}, order=Contract.due_day)
crud("incomes", Income, IncomeIn, order=Income.pay_day)
crud("goals", Goal, GoalIn)


class ConfirmPaymentIn(BaseModel):
    date: Optional[date] = None
    amount: Optional[float] = None


@router.post("/contracts/{cid}/confirm-payment")
def confirm_contract_payment(cid: int, data: ConfirmPaymentIn, u: User = Depends(current_user),
                             db: Session = Depends(get_db)):
    """Lança o pagamento de uma conta fixa com um clique — nunca automático e silencioso,
    porque isso mexe no saldo real; a pessoa confirma valor e data (ambos vêm preenchidos
    com o previsto no contrato, editáveis antes de enviar)."""
    c = db.query(Contract).filter_by(id=cid, user_id=u.id).first()
    if not c:
        raise HTTPException(404, "Contrato não encontrado")
    if not c.account_id:
        raise HTTPException(400, "Defina a conta de pagamento do contrato antes de confirmar.")
    pay_date = data.date or date.today()
    amount = data.amount if data.amount is not None else c.amount
    ext = "contract-" + hashlib.sha1(f"{cid}{pay_date}{amount}".encode()).hexdigest()[:20]
    if db.query(Transaction.id).filter_by(user_id=u.id, external_id=ext).first():
        raise HTTPException(400, "Este pagamento já foi lançado.")
    t = Transaction(user_id=u.id, account_id=c.account_id, category_id=c.category_id,
                    date=pay_date, description=c.name, amount=amount, type="expense",
                    external_id=ext, source="manual", category_locked=bool(c.category_id))
    db.add(t)
    _apply_tx_effect(db, t, +1)
    db.commit()
    return tx_out(t)


@router.post("/transactions/{tid}/receipt")
async def upload_receipt(tid: int, file: UploadFile, u: User = Depends(current_user),
                         db: Session = Depends(get_db)):
    """Anexa o comprovante de pagamento a um lançamento — "dar baixa" com prova em mãos."""
    t = db.query(Transaction).filter_by(id=tid, user_id=u.id).first()
    if not t:
        raise HTTPException(404, "Lançamento não encontrado")
    ext = storage.ext_for(file.content_type)
    if not ext:
        raise HTTPException(400, "Envie uma imagem (JPG/PNG/WEBP/HEIC) ou PDF.")
    s = get_settings()
    data = await file.read()
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(400, f"Arquivo maior que {s.max_upload_mb} MB.")
    old = t.receipt_path
    t.receipt_path = storage.save(u.id, tid, ext, data)
    db.commit()
    storage.delete(old)
    return tx_out(t)


@router.get("/transactions/{tid}/receipt")
def get_receipt(tid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.id).first()
    resolved = storage.resolve(t.receipt_path) if t and t.receipt_path else None
    if not resolved:
        raise HTTPException(404, "Sem comprovante para este lançamento.")
    kind, value = resolved
    return RedirectResponse(value) if kind == "url" else FileResponse(value)


@router.delete("/transactions/{tid}/receipt")
def delete_receipt(tid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.id).first()
    if not t:
        raise HTTPException(404, "Lançamento não encontrado")
    if t.receipt_path:
        storage.delete(t.receipt_path)
        t.receipt_path = None
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- regras de categoria
@router.get("/rules")
def list_rules(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(r) for r in db.query(CategoryRule).filter_by(user_id=u.id)
            .order_by(CategoryRule.priority.desc())]


@router.post("/rules")
def create_rule(data: RuleIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_fk(db, u.id, Category, data.category_id)
    r = CategoryRule(user_id=u.id, pattern=data.pattern, category_id=data.category_id, priority=data.priority)
    db.add(r)
    db.commit()
    updated = 0
    if data.apply_existing:
        for t in db.query(Transaction).filter(Transaction.user_id == u.id,
                                              Transaction.category_locked.is_(False),
                                              Transaction.description.ilike(f"%{data.pattern}%")):
            t.category_id = data.category_id
            updated += 1
        db.commit()
    return {**to_dict(r), "updated": updated}


@router.delete("/rules/{rid}")
def delete_rule(rid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(CategoryRule).filter_by(id=rid, user_id=u.id).delete()
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- transações
def tx_out(t: Transaction):
    d = to_dict(t)
    d["account_name"] = t.account.name if t.account else ""
    d["to_account_name"] = t.to_account.name if t.to_account else ""
    d["category_name"] = t.category.name if t.category else ""
    d["category_color"] = t.category.color if t.category else "#94a3b8"
    d["has_receipt"] = bool(t.receipt_path)
    del d["receipt_path"]  # caminho no servidor não vai pro cliente; use GET .../receipt
    return d


@router.get("/transactions")
def list_transactions(start: Optional[date] = None, end: Optional[date] = None,
                      account_id: Optional[int] = None, category_id: Optional[int] = None,
                      type: Optional[str] = None, q: Optional[str] = None,
                      min_amount: Optional[float] = None, max_amount: Optional[float] = None,
                      source: Optional[str] = None,
                      limit: int = 500, u: User = Depends(current_user), db: Session = Depends(get_db)):
    qry = db.query(Transaction).filter(Transaction.user_id == u.id)
    if start: qry = qry.filter(Transaction.date >= start)
    if end: qry = qry.filter(Transaction.date <= end)
    if account_id: qry = qry.filter(Transaction.account_id == account_id)
    if category_id: qry = qry.filter(Transaction.category_id == category_id)
    if type: qry = qry.filter(Transaction.type == type)
    if source: qry = qry.filter(Transaction.source == source)
    if min_amount is not None: qry = qry.filter(Transaction.amount >= min_amount)
    if max_amount is not None: qry = qry.filter(Transaction.amount <= max_amount)
    if q: qry = qry.filter(or_(Transaction.description.ilike(f"%{q}%"), Transaction.notes.ilike(f"%{q}%")))
    rows = qry.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(min(limit, 5000)).all()
    return [tx_out(t) for t in rows]


@router.post("/transactions")
def create_transaction(data: TransactionIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_fk(db, u.id, Account, data.account_id)
    _check_fk(db, u.id, Category, data.category_id)
    if data.type == "transfer":
        if not data.to_account_id:
            raise HTTPException(400, "Informe a conta de destino da transferência.")
        if data.to_account_id == data.account_id:
            raise HTTPException(400, "A conta de destino deve ser diferente da conta de origem.")
        _check_fk(db, u.id, Account, data.to_account_id)
    cat = data.category_id or categorize(db, u.id, data.description, data.type)
    created = []
    per = round(data.amount / data.installments, 2)
    for i in range(data.installments):
        amt = per if i < data.installments - 1 else round(data.amount - per * (data.installments - 1), 2)
        t = Transaction(user_id=u.id, account_id=data.account_id,
                        to_account_id=data.to_account_id if data.type == "transfer" else None,
                        category_id=cat, date=analytics.add_months(data.date, i), description=data.description,
                        amount=amt, type=data.type, notes=data.notes,
                        installment=f"{i + 1}/{data.installments}" if data.installments > 1 else None,
                        category_locked=bool(data.category_id))
        db.add(t)
        created.append(t)
        _apply_tx_effect(db, t, +1)
    db.commit()
    return [tx_out(t) for t in created]


class TxPatch(BaseModel):
    category_id: Optional[int] = None
    to_account_id: Optional[int] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    date: Optional[date] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    create_rule: bool = False


@router.patch("/transactions/{tid}")
def patch_transaction(tid: int, data: TxPatch, u: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.id).first()
    if not t:
        raise HTTPException(404, "Não encontrado")
    _apply_tx_effect(db, t, -1)  # desfaz o efeito de caixa atual antes de editar

    vals = data.model_dump(exclude_none=True, exclude={"create_rule"})
    if "category_id" in vals:
        _check_fk(db, u.id, Category, vals["category_id"])
        t.category_locked = True
    if "to_account_id" in vals:
        _check_fk(db, u.id, Account, vals["to_account_id"])
    for k, v in vals.items():
        setattr(t, k, v)
    if t.type == "transfer" and not t.to_account_id:
        raise HTTPException(400, "Informe a conta de destino da transferência.")
    if t.type == "transfer" and t.to_account_id == t.account_id:
        raise HTTPException(400, "A conta de destino deve ser diferente da conta de origem.")

    if data.create_rule and data.category_id:
        pattern = " ".join(t.description.split()[:2])[:60]
        if pattern:
            db.add(CategoryRule(user_id=u.id, pattern=pattern, category_id=data.category_id, priority=1))
    _apply_tx_effect(db, t, +1)  # reaplica com os valores (possivelmente novos)
    db.commit()
    return tx_out(t)


@router.delete("/transactions/{tid}")
def delete_transaction(tid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Transaction).filter_by(id=tid, user_id=u.id).first()
    if not t:
        raise HTTPException(404, "Não encontrado")
    _apply_tx_effect(db, t, -1)
    storage.delete(t.receipt_path)
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/transactions/import")
async def import_csv(account_id: int, file: UploadFile, u: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    """CSV com colunas: data;descricao;valor (valor negativo = gasto). Aceita , ou ; e data dd/mm/aaaa."""
    acc = db.query(Account).filter_by(id=account_id, user_id=u.id).first()
    if not acc:
        raise HTTPException(400, "Account inválido")
    raw = (await file.read()).decode("utf-8-sig", errors="ignore")
    dialect = csv.Sniffer().sniff(raw[:2000], delimiters=";,")
    n = 0
    for row in csv.DictReader(io.StringIO(raw), dialect=dialect):
        row = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        try:
            ds = row.get("data") or row.get("date")
            d = datetime.strptime(ds, "%d/%m/%Y").date() if "/" in ds else date.fromisoformat(ds)
            vs = row.get("valor") or row.get("amount")
            v = float(vs.replace("R$", "").replace(".", "").replace(",", ".")) if "," in vs else float(vs)
        except (ValueError, TypeError, AttributeError):
            continue
        desc = row.get("descricao") or row.get("descrição") or row.get("description") or "Lançamento"
        typ = "expense" if v < 0 else "income"
        ext = "csv-" + hashlib.sha1(f"{account_id}{d}{desc}{v}".encode()).hexdigest()[:20]
        if db.query(Transaction.id).filter_by(user_id=u.id, external_id=ext).first():
            continue
        db.add(Transaction(user_id=u.id, account_id=account_id, date=d, description=desc[:255],
                           amount=abs(v), type=typ, external_id=ext, source="manual",
                           category_id=categorize(db, u.id, desc, typ)))
        _adjust_balance(db, account_id, d, v, +1)
        n += 1
    acc.last_import_at = datetime.utcnow()
    db.commit()
    return {"imported": n}


def _csv_safe(v: str) -> str:
    """Neutraliza injeção de fórmula: Excel/Sheets executam células que começam com
    =, +, -, @, tab ou CR quando o CSV é aberto direto na planilha."""
    v = v or ""
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


@router.get("/transactions/export")
def export_csv(u: User = Depends(current_user), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["data", "descricao", "valor", "tipo", "conta", "categoria", "parcela", "obs"])
    for t in db.query(Transaction).filter_by(user_id=u.id).order_by(Transaction.date):
        w.writerow([t.date.strftime("%d/%m/%Y"), _csv_safe(t.description), f"{t.amount:.2f}".replace(".", ","),
                    t.type, t.account.name if t.account else "", t.category.name if t.category else "",
                    t.installment or "", _csv_safe(t.notes)])
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=finora-lancamentos.csv"})


# ---------------------------------------------------------------- painel, alertas, mercado, IA
@router.get("/dashboard")
def get_dashboard(ref: Optional[date] = None, months: int = Query(6, ge=1, le=24),
                  u: User = Depends(current_user), db: Session = Depends(get_db)):
    analytics.run_alerts(db, u.id, ref)
    return analytics.dashboard(db, u.id, ref, months)


@router.get("/installments")
def get_installments(ref: Optional[date] = None, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return analytics.installment_plans(db, u.id, ref or date.today())


@router.get("/alerts")
def list_alerts(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(a) for a in db.query(Alert).filter_by(user_id=u.id)
            .order_by(Alert.created_at.desc()).limit(100)]


@router.post("/alerts/read")
def read_alerts(u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Alert).filter_by(user_id=u.id, read=False).update({"read": True})
    db.commit()
    return {"ok": True}


@router.get("/market")
def get_market(u: User = Depends(current_user)):
    return market.indicators()


class SimIn(BaseModel):
    monthly: float = Field(ge=0)
    months: int = Field(ge=1, le=600)
    annual_rate: float = Field(ge=0, le=100)
    initial: float = 0


@router.post("/simulate")
def simulate(data: SimIn, u: User = Depends(current_user)):
    return market.simulate(data.monthly, data.months, data.annual_rate, data.initial)


class AdvisorIn(BaseModel):
    question: Optional[str] = Field(None, max_length=1000)


@router.post("/advisor")
def ask_advisor(data: AdvisorIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    dash = analytics.dashboard(db, u.id)
    content = advisor.generate(dash, data.question)
    rep = AdvisorReport(user_id=u.id, content=content,
                        snapshot={"question": data.question, "ref": dash["ref"]})
    db.add(rep)
    db.commit()
    return to_dict(rep)


@router.get("/advisor")
def list_reports(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(r) for r in db.query(AdvisorReport).filter_by(user_id=u.id)
            .order_by(AdvisorReport.created_at.desc()).limit(20)]


# ---------------------------------------------------------------- assistente de uso
class AssistantIn(BaseModel):
    message: str = Field(max_length=500)


@router.post("/assistant", dependencies=[Depends(rate_limit("assistant", 30, 60))])
def ask_assistant(data: AssistantIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return assistant.answer(db, u, data.message)


@router.get("/assistant/nudges")
def assistant_nudges(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """O que o assistente lembraria por conta própria (ex.: conta vencendo hoje) —
    checado quando o app abre, não precisa perguntar."""
    return assistant.nudges(db, u)


# ---------------------------------------------------------------- Pluggy
@router.get("/pluggy/status")
def pluggy_status(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"enabled": pluggy.enabled(),
            "items": [to_dict(i) for i in db.query(PluggyItem).filter_by(user_id=u.id)]}


@router.post("/pluggy/connect-token")
def pluggy_token(item_id: Optional[str] = None, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if item_id and not db.query(PluggyItem).filter_by(user_id=u.id, item_id=item_id).first():
        raise HTTPException(404, "Conexão não encontrada")
    try:
        return {"accessToken": pluggy.connect_token(u.id, item_id)}
    except pluggy.PluggyError as e:
        raise HTTPException(400, str(e))


class ItemIn(BaseModel):
    item_id: str = Field(min_length=10, max_length=64)


@router.post("/pluggy/items")
def pluggy_add_item(data: ItemIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        res = pluggy.sync_item(db, u.id, data.item_id)
    except pluggy.PluggyError as e:
        raise HTTPException(400, str(e))
    analytics.run_alerts(db, u.id)
    return res


@router.post("/pluggy/sync")
def pluggy_sync_all(u: User = Depends(current_user), db: Session = Depends(get_db)):
    out = []
    for it in db.query(PluggyItem).filter_by(user_id=u.id).all():
        try:
            out.append(pluggy.sync_item(db, u.id, it.item_id))
        except pluggy.PluggyError as e:
            out.append({"item_id": it.item_id, "error": str(e)})
    analytics.run_alerts(db, u.id)
    return out


@router.delete("/pluggy/items/{item_id}")
def pluggy_remove(item_id: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(PluggyItem).filter_by(user_id=u.id, item_id=item_id).first()
    if not row:
        raise HTTPException(404, "Não encontrado")
    pluggy.delete_item(item_id)
    db.delete(row)
    db.query(Account).filter_by(user_id=u.id, pluggy_item_id=item_id).update({"archived": True})
    db.commit()
    return {"ok": True}


def _webhook_sync(item_id: str):
    db = SessionLocal()
    try:
        row = db.query(PluggyItem).filter_by(item_id=item_id).first()
        if row:
            pluggy.sync_item(db, row.user_id, item_id, days=30)
            analytics.run_alerts(db, row.user_id)
    except Exception:
        pass
    finally:
        db.close()


@router.post("/pluggy/webhook")
async def pluggy_webhook(request: Request, bg: BackgroundTasks):
    secret = get_settings().pluggy_webhook_secret
    if secret and not hmac.compare_digest(request.query_params.get("secret", ""), secret):
        raise HTTPException(401, "invalid")
    body = await request.json()
    item_id = body.get("itemId") or (body.get("item") or {}).get("id")
    if item_id and body.get("event") in {"item/updated", "item/created", "transactions/created",
                                         "transactions/updated"}:
        bg.add_task(_webhook_sync, item_id)
    return {"ok": True}
