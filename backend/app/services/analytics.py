"""Cálculos do painel, projeções e alertas."""
from collections import defaultdict
from datetime import date, datetime, timedelta
import calendar
import re

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Account, Asset, Transaction, Category, Contract, Income, Goal, Alert, Pot, Receivable, User
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


# ------------------------------------------------------------------ fatura do cartão
# Uma fatura é identificada pelo mês do FECHAMENTO ("2026-10" = fecha em outubro). Cada
# lançamento do cartão pertence a uma fatura: a gravada em Transaction.invoice_month
# (importação da fatura do banco, parcelas previstas) ou, se vazia, a do ciclo da data.
# Total = compras + parcelas + encargos − estornos/créditos, igual ao banco calcula.
_CHARGE_RE = re.compile(r"\b(iof|juros|encargo|anuidade|multa|mora|tarifa|rotativo)", re.I)


def ym_add(ym: str, n: int) -> str:
    y, m = map(int, ym.split("-"))
    return add_months(date(y, m, 1), n).strftime("%Y-%m")


def _closing(acc) -> int:
    return acc.closing_day or 1  # sem dia cadastrado: a tela avisa (missing_days)


def invoice_cycle(acc, ym: str) -> tuple[date, date, date]:
    """(início, fechamento, vencimento) da fatura que fecha no mês ym."""
    y, m = map(int, ym.split("-"))
    end = date(y, m, min(_closing(acc), calendar.monthrange(y, m)[1]))
    prev = add_months(date(y, m, 1), -1)
    start = date(prev.year, prev.month, min(_closing(acc), calendar.monthrange(prev.year, prev.month)[1])) + timedelta(days=1)
    due_day = acc.due_day or 10
    due_month = add_months(date(y, m, 1), 0 if due_day > _closing(acc) else 1)
    due = due_month.replace(day=min(due_day, calendar.monthrange(due_month.year, due_month.month)[1]))
    return start, end, due


def invoice_of_date(acc, d: date) -> str:
    """Fatura em que cai uma compra feita no dia d (pelo dia de fechamento)."""
    closing = min(_closing(acc), calendar.monthrange(d.year, d.month)[1])
    return (d if d.day <= closing else add_months(d.replace(day=1), 1)).strftime("%Y-%m")


def invoice_transactions(db: Session, acc, ym: str):
    start, end, _ = invoice_cycle(acc, ym)
    return (db.query(Transaction).filter(
        Transaction.account_id == acc.id, Transaction.type.in_(("expense", "income")),
        or_(Transaction.invoice_month == ym,
            and_(Transaction.invoice_month.is_(None), Transaction.date >= start, Transaction.date <= end)))
        .order_by(Transaction.date, Transaction.id).all())


def invoice(db: Session, acc, ym: str, ref: date | None = None, with_items: bool = False) -> dict:
    ref = ref or date.today()
    start, end, due = invoice_cycle(acc, ym)
    txs = invoice_transactions(db, acc, ym)
    purchases = installments = charges = credits = 0.0
    for t in txs:
        if t.type == "income":
            credits += t.amount
        elif _CHARGE_RE.search(t.description or ""):
            charges += t.amount
        elif t.installment:
            installments += t.amount
        else:
            purchases += t.amount
    total = purchases + installments + charges - credits
    status = "open" if ref <= end else "closed" if ref <= due else "past"
    out = {"ym": ym, "period_start": start.isoformat(), "period_end": end.isoformat(),
           "due_date": due.isoformat(), "status": status, "count": len(txs),
           "purchases": round(purchases, 2), "installments": round(installments, 2),
           "charges": round(charges, 2), "credits": round(credits, 2), "total": round(total, 2)}
    if with_items:
        out["items"] = txs
    return out


def card_invoices(db: Session, user_id: int, ref: date):
    """Por cartão: a fatura aberta (onde caem as compras de hoje) e, entre o fechamento e o
    vencimento, a fatura fechada — que é a que o banco mostra como "atual" e cobra."""
    out = []
    for acc in db.query(Account).filter_by(user_id=user_id, kind="credit_card", archived=False):
        cur = invoice(db, acc, invoice_of_date(acc, ref), ref)
        prev = invoice(db, acc, ym_add(cur["ym"], -1), ref)
        closed = prev if prev["status"] == "closed" else None
        # o que vence primeiro é o que vai pra "próximos vencimentos" e pro card do painel
        payable = closed or cur
        # Saldo devedor real: cartões conectados via Open Finance reportam o total que o
        # banco cobra (inclui faturas anteriores não pagas / rotativo); a fatura do ciclo
        # aberto sozinha subestimaria a dívida nesse caso. Cartão manual não tem outra fonte.
        # limite comprometido, como o banco calcula: fatura a pagar + aberta + todas as parcelas
        # que ainda vão entrar nas próximas faturas (prevista ou lançada com data futura)
        first_ym = payable["ym"]
        committed = 0.0
        for t in db.query(Transaction).filter(Transaction.account_id == acc.id,
                                              Transaction.type.in_(("expense", "income")),
                                              or_(Transaction.invoice_month >= first_ym,
                                                  Transaction.date >= date.fromisoformat(payable["period_start"]))):
            if (t.invoice_month or invoice_of_date(acc, t.date)) >= first_ym:
                committed += t.amount if t.type == "expense" else -t.amount
        future = committed - cur["total"] - (closed["total"] if closed else 0)
        outstanding = abs(acc.balance) if acc.pluggy_account_id else cur["total"] + (closed["total"] if closed else 0)
        used = max(committed, 0)
        out.append({"account_id": acc.id, "name": acc.name, "limit": acc.credit_limit,
                    # campos de antes = fatura a pagar (fechada, se houver; senão a aberta)
                    "total": payable["total"], "period_start": payable["period_start"],
                    "period_end": payable["period_end"], "due_date": payable["due_date"],
                    "open": cur, "closed": closed,
                    "missing_days": not (acc.closing_day and acc.due_day),
                    "outstanding_balance": round(max(outstanding, 0), 2),
                    "committed": round(used, 2), "future_installments": round(max(future, 0), 2),
                    "available": round(acc.credit_limit - used, 2) if acc.credit_limit else None,
                    "usage_pct": round(used / acc.credit_limit * 100, 1) if acc.credit_limit else None})
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
    # caixinhas: saldo calculado com o rendimento até hoje (ver services/pots.py)
    from . import pots as pots_service  # import tardio: pots depende de market
    pots_total = sum(pots_service.compute(p, p.moves, ref)["balance"]
                     for p in db.query(Pot).filter_by(user_id=user_id, archived=False))
    invest += pots_total
    # carteira de investimentos (ações, FIIs, renda fixa, cripto…), com cotação do dia
    portfolio_total = 0.0
    from ..models import Investment
    if db.query(Investment.id).filter_by(user_id=user_id, archived=False).first():
        from . import portfolio as portfolio_service
        try:
            portfolio_total = portfolio_service.build(db, user_id, ref, with_benchmarks=False)["value"]
        except Exception:
            portfolio_total = 0.0
    invest += portfolio_total
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
    health = financial_health(db, user_id, ref, cash=cash, pots_total=pots_total, invest=invest,
                              assets_total=assets_total, cards=cards, months=months,
                              expected_income=expected_income, contracts=contracts)
    out = {
        "health": health,
        "ref": ref.isoformat(),
        "net_worth": round(cash + invest + assets_total - card_debt, 2),
        "cash": round(cash, 2), "investments": round(invest, 2), "pots_total": round(pots_total, 2), "portfolio_total": round(portfolio_total, 2), "card_debt": round(card_debt, 2),
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
    from . import insights as insights_service  # import tardio: insights usa analytics
    try:
        out["insights"] = insights_service.build(db, user_id, out, ref)
    except Exception:  # insight nunca derruba o painel
        out["insights"] = []
    return out


def _kpi(key, label, value, fmt, status, target, hint):
    return {"key": key, "label": label, "value": None if value is None else round(value, 2), "format": fmt,
            "status": status, "target": target, "hint": hint}


def financial_health(db: Session, user_id: int, ref: date, *, cash, pots_total, invest, assets_total,
                     cards, months, expected_income, contracts) -> dict:
    """Indicadores de saúde financeira, cada um com faixa de referência e explicação.
    Base de gasto e renda: média dos 3 últimos meses fechados (o mês atual está incompleto)."""
    closed = [m for m in months[:-1] if m["income"] or m["expense"]][-3:]
    avg_exp = sum(m["expense"] for m in closed) / len(closed) if closed else months[-1]["expense"]
    avg_inc = sum(m["income"] for m in closed) / len(closed) if closed else months[-1]["income"]
    income = expected_income or avg_inc
    liquid = cash + pots_total  # caixinhas têm liquidez diária
    in30 = ref + timedelta(days=30)

    # dívidas: o que está comprometido nos cartões + o que falta pagar de financiamentos
    card_committed = sum(c.get("committed", c["total"]) for c in cards)
    financing_left, monthly_debt = 0.0, 0.0
    for c in contracts:
        if c.kind == "financing" or c.total_installments:
            left = c.total_installments or 0
            if c.start_date and c.total_installments:
                done = (ref.year - c.start_date.year) * 12 + ref.month - c.start_date.month
                left = max(c.total_installments - max(done, 0), 0)
            if left or c.kind == "financing":
                financing_left += c.amount * (left or 12)
                monthly_debt += c.amount
    # parcelas de cartão que caem por mês (média das próximas faturas)
    inst_month = sum(c.get("future_installments", 0) for c in cards) / 6 if cards else 0
    monthly_debt += inst_month
    debt = card_committed + financing_left
    assets_all = liquid + (invest - pots_total) + assets_total

    # liquidez corrente: o que entra/está disponível em 30 dias ÷ o que vence em 30 dias
    due30 = sum(c["total"] for c in cards if date.fromisoformat(c["due_date"]) <= in30)
    card_ids = {c["account_id"] for c in cards}  # contrato cobrado no cartão já está na fatura
    due30 += sum(c.amount for c in contracts if c.account_id not in card_ids)
    recv30 = sum(r.amount for r in db.query(Receivable).filter(Receivable.user_id == user_id,
                 Receivable.received_at.is_(None), Receivable.due_date <= in30))
    current_ratio = (liquid + recv30 + income) / due30 if due30 else None

    months_cov = max(liquid, 0) / avg_exp if avg_exp else None
    savings = (income - avg_exp) / income * 100 if income else None
    debt_ratio = debt / assets_all * 100 if assets_all > 0 else (100.0 if debt else 0.0)
    burden = monthly_debt / income * 100 if income else None

    def st(v, good, warn, higher_is_better=True):
        if v is None:
            return "unknown"
        if higher_is_better:
            return "good" if v >= good else "warn" if v >= warn else "bad"
        return "good" if v <= good else "warn" if v <= warn else "bad"

    kpis = [
        _kpi("reserve_months", "Reserva", months_cov, "months", st(months_cov, 6, 3),
             "6 meses ou mais", "Quantos meses o dinheiro das contas e caixinhas cobre o seu gasto médio."),
        _kpi("savings_rate", "Taxa de poupança", savings, "pct", st(savings, 20, 10),
             "20% da renda ou mais", "Quanto da renda sobra, em média, nos últimos 3 meses."),
        _kpi("current_ratio", "Liquidez de 30 dias", current_ratio, "ratio", st(current_ratio, 1.5, 1.0),
             "acima de 1,5", "O que você tem e vai receber em 30 dias ÷ o que vence em 30 dias (faturas e contas fixas)."),
        _kpi("debt_burden", "Renda comprometida com dívidas", burden, "pct", st(burden, 15, 30, False),
             "até 30% da renda", "Financiamentos e parcelas de cartão por mês ÷ renda."),
        _kpi("debt_ratio", "Endividamento", debt_ratio, "pct", st(debt_ratio, 20, 50, False),
             "até 50% do patrimônio", "Tudo o que você deve (cartões + saldo dos financiamentos) ÷ tudo o que você tem."),
    ]
    order = {"bad": 0, "warn": 1, "good": 2, "unknown": 3}
    known = [k for k in kpis if k["status"] != "unknown"]
    score = round(sum({"good": 100, "warn": 55, "bad": 15}[k["status"]] for k in known) / len(known)) if known else None
    return {"score": score, "kpis": kpis, "worst": min(kpis, key=lambda k: order[k["status"]])["key"] if known else None,
            "base": {"avg_expense": round(avg_exp, 2), "income": round(income, 2), "liquid": round(liquid, 2),
                     "debt": round(debt, 2), "monthly_debt": round(monthly_debt, 2)}}


def _alert(db, user_id, key, level, title, message):
    if db.query(Alert).filter_by(user_id=user_id, key=key).first():
        return
    db.add(Alert(user_id=user_id, key=key, level=level, title=title, message=message))
    # só manda e-mail pro que exige atenção de verdade (danger/warning) — "info" fica só no
    # sininho, senão vira spam de aviso pouco importante
    if level in ("danger", "warning") and email_service.enabled():
        u = db.get(User, user_id)
        if u and u.email and u.email_alerts is not False:
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
                   f"O que está em aberto no cartão já usa {card['usage_pct']}% do limite.")

    for b in d["upcoming"]:
        if b["days_left"] <= 3:
            dl = b["days_left"]
            quando = "Vence hoje" if dl == 0 else "Vence amanhã" if dl == 1 else f"Vence em {dl} dias"
            data_br = date.fromisoformat(b["due_date"]).strftime("%d/%m/%Y")
            _alert(db, user_id, f"due-{b['name']}-{b['due_date']}", "warning", quando,
                   f"{b['name']}: {brl(b['amount'])} em {data_br}.")

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

    _contract_alerts(db, user_id, ref, brl)
    _import_reminder_alerts(db, user_id, ref)
    db.commit()


def _contract_alerts(db, user_id, ref, brl):
    """Reajuste chegando (30 dias) e último dia pra cancelar sem multa (15 dias)."""
    from . import recurring  # import tardio: recurring usa analytics
    try:
        insights = recurring.contract_insights(db, user_id, ref)
    except Exception:
        return
    for c in insights:
        a = c.get("adjustment")
        if a and 0 <= a["days_left"] <= 30:
            extra = (f" Pelo {a['index']} dos últimos 12 meses ({str(a['pct']).replace('.', ',')}%), deve passar de "
                     f"{brl(c['amount'])} pra {brl(a['new_amount'])}.") if a["new_amount"] else ""
            _alert(db, user_id, f"adjust-{c['id']}-{a['date']}", "info", f"Reajuste de {c['name']} em {a['label']}",
                   f"O contrato faz aniversário em {date.fromisoformat(a['date']).strftime('%d/%m/%Y')}.{extra}")
        r = c.get("renewal")
        if r and 0 <= r["cancel_days_left"] <= 15:
            dl = date.fromisoformat(r["cancel_deadline"]).strftime("%d/%m/%Y")
            _alert(db, user_id, f"cancel-{c['id']}-{r['cancel_deadline']}", "warning", f"Prazo pra cancelar {c['name']}",
                   f"Pra não renovar (ou cancelar sem multa), avise até {dl}. Depois disso o contrato renova sozinho.")


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
