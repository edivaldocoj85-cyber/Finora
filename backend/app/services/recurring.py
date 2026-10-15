"""Contratos e assinaturas: reajuste, renovação, prazo pra cancelar sem multa e detecção de
cobranças recorrentes que ainda não foram cadastradas.

Reajuste: no mês de aniversário do contrato, o valor sobe pelo índice acumulado de 12 meses
(IPCA, IGP-M ou INPC, do Banco Central). Cancelamento: renovação − dias de aviso prévio.
Assinaturas: mesma descrição (normalizada), valor parecido, pelo menos 3 meses seguidos."""
import calendar
import re
import statistics
import time
from collections import defaultdict
from datetime import date, timedelta

import httpx
from sqlalchemy.orm import Session

from ..models import Category, Contract, Transaction
from . import analytics, market
from .statement_import import _norm

SGS_LAST = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{}/dados/ultimos/12?formato=json"
MONTHLY_SERIES = {"igpm": 189, "inpc": 188, "ipca": 433}
_idx_cache: dict = {}
MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def index_key(name: str) -> str | None:
    n = _norm(name).replace("-", "").replace(" ", "")
    return "igpm" if "igpm" in n else "inpc" if "inpc" in n else "ipca" if "ipca" in n else None


def index_12m(key: str) -> float | None:
    """Índice acumulado nos últimos 12 meses, em %."""
    c = _idx_cache.get(key)
    if c and c["exp"] > time.time():
        return c["value"]
    value = None
    try:
        with httpx.Client(timeout=8, headers={"User-Agent": "Finora/1.0"}) as cl:
            rows = cl.get(SGS_LAST.format(MONTHLY_SERIES[key])).json()
        acc = 1.0
        for r in rows[-12:]:
            acc *= 1 + float(r["valor"]) / 100
        value = round((acc - 1) * 100, 2)
    except Exception:
        if key == "ipca":
            v = market.indicators().get("ipca_12m")
            value = v["value"] if v else None
    _idx_cache[key] = {"value": value, "exp": time.time() + (12 * 3600 if value is not None else 600)}
    return value


def _anniversary(c: Contract, today: date) -> date | None:
    """Próximo reajuste. Um que passou há até 60 dias sem ser aplicado continua aparecendo
    (pendente); contrato com menos de 1 ano só reajusta no 1º aniversário."""
    month = c.adjustment_month or (c.start_date.month if c.start_date else None)
    if not month:
        return None
    day = c.start_date.day if c.start_date else 1
    on = lambda y: date(y, month, min(day, calendar.monthrange(y, month)[1]))
    d = on(today.year)
    if d < today - timedelta(days=60):
        d = on(today.year + 1)
    while c.start_date and d <= c.start_date:
        d = on(d.year + 1)
    return d


def contract_insights(db: Session, user_id: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    out = []
    for c in db.query(Contract).filter_by(user_id=user_id, active=True):
        info = {"id": c.id, "name": c.name, "amount": c.amount}
        key = index_key(c.adjustment_index or "")
        ann = _anniversary(c, today)
        if key and ann and not (c.last_adjusted_at and (ann - c.last_adjusted_at).days < 300):
            pct = index_12m(key)
            info["adjustment"] = {
                "date": ann.isoformat(), "days_left": (ann - today).days, "index": c.adjustment_index,
                "pct": pct, "new_amount": round(c.amount * (1 + pct / 100), 2) if pct is not None else None,
                "label": f"{MONTHS[ann.month - 1]}/{ann.year}"}
        if c.renewal_date:
            deadline = c.renewal_date - timedelta(days=c.cancel_notice_days or 0)
            info["renewal"] = {"date": c.renewal_date.isoformat(), "days_left": (c.renewal_date - today).days,
                               "cancel_deadline": deadline.isoformat(), "cancel_days_left": (deadline - today).days}
        if c.end_date:
            info["ends_in_days"] = (c.end_date - today).days
        out.append(info)
    return out


# ------------------------------------------------------------------ assinaturas recorrentes
_NOISE = {"pg", "pag", "mp", "ec", "pp", "iz", "dl", "ebn", "htm", "br", "com", "www", "sao", "paulo", "sp", "rj",
          "bra", "brasil", "ltda", "me"}


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _key(desc: str) -> str:
    """"NETFLIX.COM *1001" → "netflix"; "Spotify P1A2B3" → "spotify". Tira códigos (palavras com
    número), siglas de adquirente (PG*, MP*) e cidade."""
    words = [w for w in re.split(r"[^a-z0-9]+", _norm(desc))
             if len(w) > 1 and not any(ch.isdigit() for ch in w) and w not in _NOISE]
    return " ".join(words[:3])


def detect_subscriptions(db: Session, user_id: int, today: date | None = None, months: int = 6) -> dict:
    today = today or date.today()
    since = analytics.add_months(today.replace(day=1), -months)
    contracts = db.query(Contract).filter_by(user_id=user_id).all()
    known = {_key(c.name) for c in contracts} | {_key(c.provider) for c in contracts if c.provider}
    known.discard("")
    groups = defaultdict(list)
    for t in db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.type == "expense",
                                          Transaction.date >= since, Transaction.date <= today,
                                          Transaction.installment.is_(None)):
        k = _key(t.description or "")
        if len(k) >= 3:
            groups[k].append(t)

    cats = {c.id: c for c in db.query(Category).filter_by(user_id=user_id)}
    found = []
    for k, txs in groups.items():
        if any(k in kn or kn in k for kn in known):
            continue  # já é um contrato cadastrado
        by_month = {}
        for t in sorted(txs, key=lambda t: t.date):
            by_month.setdefault((t.date.year, t.date.month), t)  # 1 cobrança por mês
        if len(by_month) < 3:
            continue
        ms = sorted(by_month)
        # meses seguidos (tolera 1 buraco): assinatura é todo mês
        run = best = 1
        for a, b in zip(ms, ms[1:]):
            gap = (b[0] - a[0]) * 12 + b[1] - a[1]
            run = run + 1 if gap <= 2 else 1
            best = max(best, run)
        if best < 3:
            continue
        amounts = [by_month[m].amount for m in ms]
        med = statistics.median(amounts)
        if med <= 0 or max(abs(a - med) for a in amounts[-3:]) > max(0.15 * med, 2):
            continue  # valor varia demais: compra frequente (mercado, posto), não assinatura
        last = by_month[ms[-1]]
        days = [by_month[m].date.day for m in ms]
        cat = cats.get(last.category_id)
        first_amt, last_amt = amounts[0], amounts[-1]
        found.append({
            "key": k, "name": k.title(), "description": last.description, "amount": round(last_amt, 2), "avg_amount": round(med, 2),
            "months": len(ms), "last_date": last.date.isoformat(), "day": round(statistics.median(days)),
            "account_id": last.account_id, "category_id": last.category_id,
            "category_name": cat.name if cat else "",
            "price_increase_pct": round((last_amt / first_amt - 1) * 100, 1) if first_amt and last_amt > first_amt * 1.04 else None,
            "stale": (today - last.date).days > 45,  # parou de cobrar? pode ter sido cancelada
            "yearly": round(last_amt * 12, 2),
        })
    found = [f for f in found if not f["stale"]]
    found.sort(key=lambda f: -f["amount"])

    # dicas de corte: assinaturas (cadastradas + detectadas) por categoria
    subs = [{"name": c.name, "amount": c.amount, "category_id": c.category_id} for c in contracts
            if c.active and (c.kind == "subscription")] + \
           [{"name": f["name"], "amount": f["amount"], "category_id": f["category_id"]} for f in found]
    by_cat = defaultdict(list)
    for s in subs:
        by_cat[s["category_id"]].append(s)
    tips = []
    for cid, items in by_cat.items():
        if len(items) >= 2:
            cheapest = min(items, key=lambda s: s["amount"])
            name = cats[cid].name if cid in cats else "a mesma categoria"
            tips.append({"kind": "overlap", "category": name, "count": len(items),
                         "monthly": round(sum(s["amount"] for s in items), 2),
                         "saving_year": round(cheapest["amount"] * 12, 2),
                         "items": [s["name"] for s in items],
                         "message": f"Você tem {len(items)} assinaturas em {name} "
                                    f"({', '.join(s['name'] for s in items[:4])}), somando {_brl(sum(s['amount'] for s in items))} por mês. "
                                    f"Cancelar a que menos usa economiza pelo menos {_brl(cheapest['amount'] * 12)} por ano."})
    for f in found:
        if f["price_increase_pct"]:
            tips.append({"kind": "increase", "description": f["description"], "pct": f["price_increase_pct"],
                         "message": f"{f['name']} subiu {str(f['price_increase_pct']).replace('.', ',')}% "
                                    f"nos últimos meses. Vale renegociar ou procurar um plano mais barato."})
    total_subs = round(sum(s["amount"] for s in subs), 2)
    return {"detected": found, "tips": tips, "subscriptions_monthly": total_subs,
            "subscriptions_yearly": round(total_subs * 12, 2)}
