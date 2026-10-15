"""Fluxo de caixa: o dinheiro que entra e sai das contas (corrente, poupança, dinheiro).

- Passado (até hoje): movimentos reais nessas contas. Cartão não entra no dia da compra;
  entra quando a fatura é paga (transferência pro cartão ou sincronização do banco).
- Futuro (depois de hoje), previsto com o que já se sabe:
    lançamentos agendados · contratos e contas fixas · renda recorrente · contas a receber ·
    faturas dos cartões no vencimento · gasto variável médio dos últimos 90 dias.
O saldo parte do saldo atual das contas e anda pra trás (passado) e pra frente (previsão)."""
import calendar
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Account, Contract, Income, Receivable, Transaction
from . import analytics

CASH = ("checking", "savings", "cash")
HISTORY_DAYS = 90


def _bucket(d: date, gran: str) -> tuple[str, date, date]:
    if gran == "day":
        return d.isoformat(), d, d
    if gran == "week":
        s = d - timedelta(days=d.weekday())
        return s.isoformat(), s, s + timedelta(days=6)
    if gran == "month":
        s = d.replace(day=1)
        return s.strftime("%Y-%m"), s, s.replace(day=calendar.monthrange(d.year, d.month)[1])
    return str(d.year), date(d.year, 1, 1), date(d.year, 12, 31)


def default_range(gran: str, today: date) -> tuple[date, date]:
    if gran == "day":
        return today - timedelta(days=14), today + timedelta(days=30)
    if gran == "week":
        s = today - timedelta(days=today.weekday())
        return s - timedelta(weeks=8), s + timedelta(weeks=13) - timedelta(days=1)
    if gran == "month":
        s = analytics.add_months(today.replace(day=1), -5)
        e = analytics.add_months(today.replace(day=1), 7) - timedelta(days=1)
        return s, e
    return date(today.year - 2, 1, 1), date(today.year + 1, 12, 31)


def _on_day(y: int, m: int, day: int) -> date:
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def _months(start: date, end: date):
    d = start.replace(day=1)
    while d <= end:
        yield d.year, d.month
        d = analytics.add_months(d, 1)


def build(db: Session, user_id: int, gran: str = "month", start: date | None = None, end: date | None = None,
          today: date | None = None) -> dict:
    today = today or date.today()
    ds, de = default_range(gran, today)
    start, end = start or ds, end or de
    accounts = {a.id: a for a in db.query(Account).filter_by(user_id=user_id, archived=False)}
    cash_ids = {i for i, a in accounts.items() if a.kind in CASH}
    cards = [a for a in accounts.values() if a.kind == "credit_card"]

    real = defaultdict(lambda: [0.0, 0.0])  # dia → [entradas, saídas]
    plan = defaultdict(lambda: [0.0, 0.0])
    events = []  # o que está previsto, item a item

    def add(book, d, amount, kind=None, desc=None):
        if amount > 0:
            book[d][0] += amount
        else:
            book[d][1] += -amount
        if kind:
            events.append({"date": d.isoformat(), "kind": kind, "description": desc, "amount": round(amount, 2)})

    def cash_delta(t) -> float:
        src, dst = t.account_id in cash_ids, t.to_account_id in cash_ids
        if t.type == "income":
            return t.amount if src else 0.0
        if t.type == "expense":
            return -t.amount if src else 0.0
        if t.type == "transfer":
            return (-t.amount if src else 0.0) + (t.amount if dst else 0.0)
        return 0.0

    # ---------------------------------------------------------------- realizado e agendado
    first = min(start, today - timedelta(days=HISTORY_DAYS))
    txs = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.date >= first,
                                       Transaction.date <= max(end, today)).all()
    after_start_net = 0.0  # movimento real de start até hoje (pra achar o saldo de abertura)
    scheduled_names = defaultdict(set)  # (ano, mês) → descrições já lançadas (contrato pago/agendado)
    for t in txs:
        delta = cash_delta(t)
        if t.type == "expense":
            scheduled_names[(t.date.year, t.date.month)].add((t.description or "").strip().lower())
        if not delta:
            continue
        if t.date <= today:
            if t.date >= start:
                add(real, t.date, delta)
                after_start_net += delta
        elif t.date <= end:
            add(plan, t.date, delta, "scheduled", t.description)

    balance_today = sum(accounts[i].balance for i in cash_ids)
    opening = balance_today - after_start_net if start <= today else balance_today

    # ---------------------------------------------------------------- previsão
    p_start = max(start, today + timedelta(days=1))
    incomes, variable = [], 0.0
    if p_start <= end:
        contracts = db.query(Contract).filter_by(user_id=user_id, active=True).all()
        contract_names = {c.name.strip().lower() for c in contracts}
        card_extra = defaultdict(float)  # (cartão, mês da fatura) → contratos cobrados no cartão
        for c in contracts:
            for y, m in _months(p_start, end):
                due = _on_day(y, m, c.due_day)
                if due < p_start or due > end or (c.start_date and due < c.start_date) or (c.end_date and due > c.end_date):
                    continue
                if c.name.strip().lower() in scheduled_names[(y, m)]:
                    continue  # já pago ou agendado neste mês
                acc = accounts.get(c.account_id)
                if acc and acc.kind == "credit_card":
                    card_extra[(acc.id, analytics.invoice_of_date(acc, due))] += c.amount
                else:
                    add(plan, due, -c.amount, "contract", c.name)

        incomes = db.query(Income).filter_by(user_id=user_id, active=True, recurring=True).all()
        hist_start = today - timedelta(days=HISTORY_DAYS)
        hist = [t for t in txs if hist_start <= t.date < today]
        if incomes:
            for i in incomes:
                for y, m in _months(p_start, end):
                    pay = _on_day(y, m, i.pay_day)
                    if p_start <= pay <= end:
                        add(plan, pay, i.net_amount, "income", i.name)
        else:
            # sem renda cadastrada: média das receitas reais nas contas (sem transferências)
            avg_in = sum(t.amount for t in hist if t.type == "income" and t.account_id in cash_ids) / HISTORY_DAYS
            d = p_start
            while d <= end and avg_in:
                add(plan, d, avg_in)
                d += timedelta(days=1)

        for r in db.query(Receivable).filter_by(user_id=user_id, received_at=None):
            if p_start <= r.due_date <= end:
                add(plan, r.due_date, r.amount, "receivable", f"{r.client_name}{' · ' + r.description if r.description else ''}")

        for acc in cards:
            ym = analytics.invoice_of_date(acc, today)
            # faturas que vencem no período: a aberta e as futuras (parcelas previstas inclusas)
            for k in range(-1, 24):
                y = analytics.ym_add(ym, k)
                inv = analytics.invoice(db, acc, y, today)
                due = date.fromisoformat(inv["due_date"])
                if due > end:
                    break
                total = inv["total"] + card_extra.get((acc.id, y), 0)
                if due >= p_start and total > 0:
                    add(plan, due, -total, "invoice", f"Fatura {acc.name}")

        # gasto variável: média diária dos últimos 90 dias, sem o que já está previsto acima
        # (parcelas, contratos) — compras de cartão entram aqui pelo dia em que vão acontecer
        variable = sum(t.amount for t in hist if t.type == "expense"
                       and not t.installment and not (t.external_id or "").startswith("contract-")
                       and (t.description or "").strip().lower() not in contract_names) / HISTORY_DAYS
        d = p_start
        while d <= end and variable:
            add(plan, d, -variable)
            d += timedelta(days=1)

    # ---------------------------------------------------------------- agrega por período
    buckets = {}
    bal = opening
    lowest = None
    d = start
    while d <= end:
        key, bs, be = _bucket(d, gran)
        b = buckets.setdefault(key, {"key": key, "start": bs.isoformat(), "end": be.isoformat(),
                                     "inflow": 0.0, "outflow": 0.0, "projected_inflow": 0.0, "projected_outflow": 0.0})
        r, p = real.get(d), plan.get(d)
        if r:
            b["inflow"] += r[0]; b["outflow"] += r[1]; bal += r[0] - r[1]
        if p:
            b["projected_inflow"] += p[0]; b["projected_outflow"] += p[1]; bal += p[0] - p[1]
        b["balance"] = bal
        if d > today and (lowest is None or bal < lowest["balance"]):
            lowest = {"date": d.isoformat(), "balance": round(bal, 2)}
        d += timedelta(days=1)

    out = []
    for b in buckets.values():
        b["status"] = ("past" if date.fromisoformat(b["end"]) <= today
                       else "future" if date.fromisoformat(b["start"]) > today else "current")
        b["net"] = b["inflow"] + b["projected_inflow"] - b["outflow"] - b["projected_outflow"]
        out.append({k: round(v, 2) if isinstance(v, float) else v for k, v in b.items()})

    first_negative = next((b for b in out if b["status"] != "past" and b["balance"] < 0), None)
    events.sort(key=lambda e: e["date"])
    return {
        "granularity": gran, "start": start.isoformat(), "end": end.isoformat(), "today": today.isoformat(),
        "opening_balance": round(opening, 2), "balance_today": round(balance_today, 2),
        "closing_balance": round(bal, 2), "lowest": lowest,
        "first_negative": first_negative and {"key": first_negative["key"], "balance": first_negative["balance"]},
        "variable_daily": round(variable, 2), "uses_income_average": p_start <= end and not incomes,
        "projected_inflow": round(sum(b["projected_inflow"] for b in out), 2),
        "projected_outflow": round(sum(b["projected_outflow"] for b in out), 2),
        "buckets": out, "events": events[:200],
    }
