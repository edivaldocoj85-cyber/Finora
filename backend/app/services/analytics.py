"""Cálculos do painel, projeções e alertas."""
from collections import defaultdict
from datetime import date, datetime, timedelta
import calendar
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Account, Asset, Transaction, Category, Contract, Income, Goal, Alert, Receivable, User
from . import email as email_service

_INSTALLMENT_RE = re.compile(r"^(\d+)/(\d+)$")


def month_bounds(ref: date) -> tuple[date, date]:
    start = ref.replace(day=1)
    end = ref.replace(day=calendar.monthrange(ref.year, ref.month)[1])
    return start, end


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def totals_by_month(db: Session, user_id: int, months: int = 6, ref: date | None = None):
    ref = ref or date.today()
    out = []
    for i in range(months - 1, -1, -1):
        s, e = month_bounds(add_months(ref.replace(day=1), -i))
        rows = (db.query(Transaction.type, func.sum(Transaction.amount))
                .filter(Transaction.user_id == user_id, Transaction.date >= s, Transaction.date <= e)
                .group_by(Transaction.type).all())
        d = {t: v or 0 for t, v in rows}
        out.append({"month": s.strftime("%Y-%m"), "income": round(d.get("income", 0), 2),
                    "expense": round(d.get("expense", 0), 2)})
    return out


def by_category(db: Session, user_id: int, start: date, end: date, kind="expense"):
    rows = (db.query(Category.id, Category.name, Category.color, Category.monthly_budget,
                     Category.essential, func.sum(Transaction.amount))
            .join(Transaction, Transaction.category_id == Category.id)
            .filter(Transaction.user_id == user_id, Transaction.type == kind,
                    Transaction.date >= start, Transaction.date <= end)
            .group_by(Category.id).order_by(func.sum(Transaction.amount).desc()).all())
    return [{"id": i, "name": n, "color": c, "budget": b or 0, "essential": ess,
             "total": round(t or 0, 2)} for i, n, c, b, ess, t in rows]


def card_invoices(db: Session, user_id: int, ref: date):
    """Fatura aberta de cada cartão, respeitando o dia de fechamento."""
    out = []
    for acc in db.query(Account).filter_by(user_id=user_id, kind="credit_card", archived=False):
        closing = acc.closing_day or 1
        # período: do dia seguinte ao fechamento anterior até o próximo fechamento
        if ref.day > closing:
            start = ref.replace(day=min(closing, calendar.monthrange(ref.year, ref.month)[1])) + timedelta(days=1)
            end = add_months(start, 1) - timedelta(days=1)
        else:
            prev = add_months(ref.replace(day=1), -1)
            start = prev.replace(day=min(closing, calendar.monthrange(prev.year, prev.month)[1])) + timedelta(days=1)
            end = ref.replace(day=min(closing, calendar.monthrange(ref.year, ref.month)[1]))
        total = (db.query(func.sum(Transaction.amount))
                 .filter(Transaction.account_id == acc.id, Transaction.type == "expense",
                         Transaction.date >= start, Transaction.date <= end).scalar() or 0)
        due_month = add_months(end.replace(day=1), 0 if (acc.due_day or 10) > closing else 1)
        due = due_month.replace(day=min(acc.due_day or 10, calendar.monthrange(due_month.year, due_month.month)[1]))
        # Saldo devedor real: cartões conectados via Open Finance reportam o total que o
        # banco cobra (inclui faturas anteriores não pagas / rotativo); a fatura do ciclo
        # aberto sozinha subestimaria a dívida nesse caso. Cartão manual não tem outra fonte.
        outstanding = abs(acc.balance) if acc.pluggy_account_id else total
        out.append({"account_id": acc.id, "name": acc.name, "limit": acc.credit_limit,
                    "total": round(total, 2), "outstanding_balance": round(outstanding, 2),
                    "period_start": start.isoformat(), "period_end": end.isoformat(), "due_date": due.isoformat(),
                    "usage_pct": round(total / acc.credit_limit * 100, 1) if acc.credit_limit else None})
    return out


def installment_plans(db: Session, user_id: int, ref: date):
    """Agrupa lançamentos parcelados (cartão) em planos: o que foi comprado, quantas
    parcelas já foram pagas, quantas faltam e quanto ainda vai pesar na fatura."""
    rows = (db.query(Transaction).filter(
        Transaction.user_id == user_id, Transaction.type == "expense",
        Transaction.installment.isnot(None)).order_by(Transaction.date).all())
    groups = defaultdict(list)
    for t in rows:
        m = _INSTALLMENT_RE.match(t.installment or "")
        if not m:
            continue
        groups[(t.account_id, t.description, int(m.group(2)))].append((int(m.group(1)), t))

    accounts = {a.id: a for a in db.query(Account).filter_by(user_id=user_id)}
    out = []
    for (account_id, desc, total), items in groups.items():
        items.sort(key=lambda x: x[0])
        acc = accounts.get(account_id)
        if not acc or acc.archived:
            continue
        past = [(n, t) for n, t in items if t.date <= ref]
        future = [(n, t) for n, t in items if t.date > ref]
        this_month = next((t for n, t in items if t.date.year == ref.year and t.date.month == ref.month), None)
        current_num = max((n for n, t in past), default=0)
        remaining = max(total - current_num, 0)
        avg_amount = sum(t.amount for _, t in items) / len(items)
        remaining_amount = (round(sum(t.amount for _, t in future), 2) if future
                            else round(avg_amount * remaining, 2))
        if remaining <= 0 and not this_month:
            continue  # já quitado e sem cobrança neste mês
        out.append({
            "account_id": account_id, "account_name": acc.name,
            "description": desc, "total_installments": total,
            "current_installment": current_num, "remaining_installments": remaining,
            "this_month_amount": this_month.amount if this_month else None,
            "purchase_date": items[0][1].date.isoformat(),
            "next_due_date": future[0][1].date.isoformat() if future else None,
            "total_amount": round(sum(t.amount for _, t in items), 2),
            "paid_amount": round(sum(t.amount for _, t in past), 2),
            "remaining_amount": remaining_amount,
        })
    return sorted(out, key=lambda x: (x["this_month_amount"] is None, x.get("next_due_date") or "9999-99-99"))


def upcoming_bills(db: Session, user_id: int, ref: date, days: int = 10):
    out = []
    for c in db.query(Contract).filter_by(user_id=user_id, active=True):
        if c.end_date and c.end_date < ref:
            continue
        for m in (0, 1):
            base = add_months(ref.replace(day=1), m)
            due = base.replace(day=min(c.due_day, calendar.monthrange(base.year, base.month)[1]))
            if ref <= due <= ref + timedelta(days=days):
                out.append({"name": c.name, "amount": c.amount, "due_date": due.isoformat(),
                            "days_left": (due - ref).days, "kind": "contract",
                            "contract_id": c.id, "account_id": c.account_id})
    for card in card_invoices(db, user_id, ref):
        due = date.fromisoformat(card["due_date"])
        if ref <= due <= ref + timedelta(days=days) and card["total"] > 0:
            out.append({"name": f"Fatura {card['name']}", "amount": card["total"],
                        "due_date": card["due_date"], "days_left": (due - ref).days, "kind": "card"})
    return sorted(out, key=lambda x: x["due_date"])


def receivables_summary(db: Session, user_id: int, ref: date, days: int = 30):
    pending = db.query(Receivable).filter_by(user_id=user_id, received_at=None).all()
    total = sum(r.amount for r in pending)
    upcoming = sorted(
        [{"id": r.id, "client_name": r.client_name, "description": r.description, "amount": r.amount,
          "due_date": r.due_date.isoformat(), "overdue": r.due_date < ref}
         for r in pending if r.due_date <= ref + timedelta(days=days)],
        key=lambda x: x["due_date"])
    return {"total_pending": round(total, 2), "count_pending": len(pending), "upcoming": upcoming}


def dashboard(db: Session, user_id: int, ref: date | None = None, trend_months: int = 6):
    ref = ref or date.today()
    start, end = month_bounds(ref)
    accounts = db.query(Account).filter_by(user_id=user_id, archived=False).all()
    cash = sum(a.balance for a in accounts if a.kind in ("checking", "savings", "cash"))
    invest = sum(a.balance for a in accounts if a.kind == "investment")
    cards = card_invoices(db, user_id, ref)
    card_debt = sum(c["outstanding_balance"] for c in cards)
    assets = db.query(Asset).filter_by(user_id=user_id).all()
    assets_total = sum(a.value for a in assets)

    months = totals_by_month(db, user_id, trend_months, ref)
    cur = months[-1]
    incomes = db.query(Income).filter_by(user_id=user_id, active=True).all()
    contracts = db.query(Contract).filter_by(user_id=user_id, active=True).all()
    expected_income = sum(i.net_amount for i in incomes if i.recurring)
    fixed_costs = sum(c.amount for c in contracts)

    # projeção do mês: ritmo linear de gasto, nunca abaixo do já gasto nem dos custos fixos
    # do mês (contratos ainda não lançados como transação cedo no mês subestimariam o ritmo)
    days_in = calendar.monthrange(ref.year, ref.month)[1]
    pace = cur["expense"] / max(ref.day, 1) * days_in
    projected_expense = max(pace, cur["expense"], fixed_costs)
    base_income = max(expected_income, cur["income"])
    savings_rate = ((base_income - projected_expense) / base_income * 100) if base_income else None

    cats = by_category(db, user_id, start, end)
    prev_s, prev_e = month_bounds(add_months(start, -1))
    prev_cats = {c["id"]: c["total"] for c in by_category(db, user_id, prev_s, prev_e)}
    for c in cats:
        c["prev"] = prev_cats.get(c["id"], 0)

    goals = db.query(Goal).filter_by(user_id=user_id).all()
    emergency_fund = next((g for g in goals if g.kind == "emergency_fund"), None)
    return {
        "ref": ref.isoformat(),
        "net_worth": round(cash + invest + assets_total - card_debt, 2),
        "cash": round(cash, 2), "investments": round(invest, 2), "card_debt": round(card_debt, 2),
        "assets_total": round(assets_total, 2),
        "month": cur, "months": months,
        "expected_income": round(expected_income, 2), "fixed_costs": round(fixed_costs, 2),
        "projected_expense": round(projected_expense, 2),
        "savings_rate": round(savings_rate, 1) if savings_rate is not None else None,
        "categories": cats, "cards": cards,
        "upcoming": upcoming_bills(db, user_id, ref),
        "receivables": receivables_summary(db, user_id, ref),
        "accounts": [{"id": a.id, "name": a.name, "kind": a.kind, "balance": a.balance,
                      "color": a.color, "institution": a.institution} for a in accounts],
        "goals": [{"id": g.id, "name": g.name, "target": g.target_amount, "current": g.current_amount,
                   "deadline": g.deadline.isoformat() if g.deadline else None, "kind": g.kind}
                  for g in goals if g.kind != "emergency_fund"],
        "emergency_fund": None if not emergency_fund else {
            "id": emergency_fund.id, "months_target": emergency_fund.months_target,
            "monthly_cost": emergency_fund.monthly_cost, "target": emergency_fund.target_amount,
            "current": emergency_fund.current_amount,
            "months_covered": round(emergency_fund.current_amount / emergency_fund.monthly_cost, 1)
                              if emergency_fund.monthly_cost else 0,
        },
        "unread_alerts": db.query(Alert).filter_by(user_id=user_id, read=False).count(),
    }


def _alert(db, user_id, key, level, title, message):
    if db.query(Alert).filter_by(user_id=user_id, key=key).first():
        return
    db.add(Alert(user_id=user_id, key=key, level=level, title=title, message=message))
    # só manda e-mail pro que exige atenção de verdade (danger/warning) — "info" fica só no
    # sininho, senão vira spam de aviso pouco importante
    if level in ("danger", "warning") and email_service.enabled():
        u = db.get(User, user_id)
        if u and u.email:
            public_url = get_settings().public_url.rstrip("/")
            email_service.send(u.email, f"Finora — {title}",
                              f"<p>{message}</p><p><a href='{public_url}/app/'>Abrir o Finora</a></p>")


def run_alerts(db: Session, user_id: int, ref: date | None = None):
    """Gera alertas idempotentes (chave única por mês/assunto)."""
    ref = ref or date.today()
    ym = ref.strftime("%Y-%m")
    d = dashboard(db, user_id, ref)
    brl = lambda v: f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    for c in d["categories"]:
        if c["budget"] and c["total"] >= c["budget"]:
            _alert(db, user_id, f"budget-over-{c['id']}-{ym}", "danger", f"Orçamento estourado: {c['name']}",
                   f"Você gastou {brl(c['total'])} de um orçamento de {brl(c['budget'])}.")
        elif c["budget"] and c["total"] >= 0.8 * c["budget"]:
            _alert(db, user_id, f"budget-80-{c['id']}-{ym}", "warning", f"80% do orçamento: {c['name']}",
                   f"Já foram {brl(c['total'])} de {brl(c['budget'])}. Segure os gastos até o fim do mês.")
        # projeta o ritmo da categoria pro mês inteiro em vez de comparar total parcial
        # contra o mês anterior completo — senão só alertava perto do fim do mês
        days_in_ym = calendar.monthrange(ref.year, ref.month)[1]
        cat_pace = c["total"] / max(ref.day, 1) * days_in_ym
        if c["prev"] and cat_pace > c["prev"] * 1.3 and cat_pace - c["prev"] > 100:
            _alert(db, user_id, f"spike-{c['id']}-{ym}", "warning", f"Gasto acima do normal: {c['name']}",
                   f"No ritmo atual, {c['name']} deve fechar em {brl(round(cat_pace, 2))} neste mês, "
                   f"contra {brl(c['prev'])} no mês passado.")

    for card in d["cards"]:
        if card["usage_pct"] and card["usage_pct"] >= 80:
            _alert(db, user_id, f"card-limit-{card['account_id']}-{ym}", "danger", f"Limite do cartão {card['name']}",
                   f"A fatura aberta já usa {card['usage_pct']}% do limite.")

    for b in d["upcoming"]:
        if b["days_left"] <= 3:
            _alert(db, user_id, f"due-{b['name']}-{b['due_date']}", "warning", f"Vence em {b['days_left']} dia(s)",
                   f"{b['name']}: {brl(b['amount'])} em {b['due_date']}.")

    if d["expected_income"] and d["projected_expense"] > d["expected_income"]:
        _alert(db, user_id, f"deficit-{ym}", "danger", "Mês projetado no vermelho",
               f"No ritmo atual você gastará {brl(d['projected_expense'])} contra renda de {brl(d['expected_income'])}.")

    if d["cash"] < 0:
        _alert(db, user_id, f"negative-{ym}", "danger", "Saldo negativo",
               "Há contas no negativo. O cheque especial costuma ter os juros mais altos do mercado.")

    # assinaturas: soma mensal
    subs = next((c for c in d["categories"] if c["name"] == "Assinaturas"), None)
    if subs and d["expected_income"] and subs["total"] > 0.05 * d["expected_income"]:
        _alert(db, user_id, f"subs-{ym}", "info", "Revise suas assinaturas",
               f"Assinaturas somam {brl(subs['total'])} (mais de 5% da renda).")

    _import_reminder_alerts(db, user_id, ref)
    db.commit()


_REMINDER_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


def _import_reminder_alerts(db: Session, user_id: int, ref: date):
    """Lembra quem importa extrato manualmente (sem Open Finance) de subir o CSV,
    no intervalo que a pessoa configurou na conta."""
    iso = ref.isocalendar()
    period_key = {"daily": ref.isoformat(), "weekly": f"{iso[0]}-W{iso[1]}", "monthly": ref.strftime("%Y-%m")}
    for acc in db.query(Account).filter_by(user_id=user_id, archived=False):
        threshold = _REMINDER_DAYS.get(acc.import_reminder)
        if not threshold or acc.pluggy_account_id:
            continue
        last = acc.last_import_at.date() if acc.last_import_at else acc.created_at.date()
        days_since = (ref - last).days
        if days_since < threshold:
            continue
        _alert(db, user_id, f"import-{acc.id}-{period_key[acc.import_reminder]}", "info",
               f"Hora de importar o extrato: {acc.name}",
               f"Faz {days_since} dia(s) desde a última importação. "
               f"Lembrete configurado como {({'daily': 'diário', 'weekly': 'semanal', 'monthly': 'mensal'})[acc.import_reminder]}.")
