"""Milhas, pontos e cashback dos cartões: quanto cada cartão devolve de verdade e qual usar.

Retorno efetivo por real gasto:
  pontos por US$: taxa ÷ dólar × valor do milheiro / 1000   (ex.: 2,2 pts/US$, dólar 5,30,
                  milheiro R$ 20 → 0,83% de volta)
  pontos por R$:  taxa × valor do milheiro / 1000
  cashback:       o próprio percentual
Menos a anuidade: (gasto anual × retorno) − anuidade = ganho líquido no ano.
Qual cartão usar agora: maior retorno entre os que têm limite disponível; empate → o que
fechou a fatura há menos tempo (mais dias até pagar)."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Account, Transaction
from . import analytics, market


def effective_return(acc: Account, usd: float | None) -> float:
    """% devolvido por real gasto."""
    if acc.cashback_pct:
        return acc.cashback_pct
    if not acc.rewards_rate:
        return 0.0
    per_brl = acc.rewards_rate / usd if acc.rewards_unit == "usd" and usd else acc.rewards_rate
    return per_brl * (acc.point_value or 20) / 1000 * 100


def summary(db: Session, user_id: int, today: date | None = None) -> dict:
    today = today or date.today()
    usd = (market.indicators().get("usd") or {}).get("value")
    cards = db.query(Account).filter_by(user_id=user_id, kind="credit_card", archived=False).all()
    inv = {c["account_id"]: c for c in analytics.card_invoices(db, user_id, today)}
    year_ago = today - timedelta(days=365)
    out = []
    for a in cards:
        spent12 = sum(t.amount for t in db.query(Transaction).filter(
            Transaction.account_id == a.id, Transaction.type == "expense",
            Transaction.date > year_ago, Transaction.date <= today))
        open_total = (inv.get(a.id) or {}).get("open", {}).get("total", 0)
        ret = effective_return(a, usd)
        per_brl = (a.rewards_rate / usd if a.rewards_unit == "usd" and usd else a.rewards_rate) if a.rewards_rate else 0
        days_since_close = None
        if a.closing_day:
            close = today.replace(day=min(a.closing_day, 28))
            if close > today:
                close = analytics.add_months(close, -1)
            days_since_close = (today - close).days
        out.append({
            "account_id": a.id, "name": a.name, "program": a.rewards_program or ("Cashback" if a.cashback_pct else ""),
            "rate": a.rewards_rate, "unit": a.rewards_unit, "cashback_pct": a.cashback_pct, "point_value": a.point_value or 20,
            "annual_fee": a.annual_fee or 0, "balance": a.rewards_balance or 0,
            "balance_value": round((a.rewards_balance or 0) * (a.point_value or 20) / 1000, 2),
            "expire": a.rewards_expire.isoformat() if a.rewards_expire else None,
            "expire_days": (a.rewards_expire - today).days if a.rewards_expire else None,
            "return_pct": round(ret, 2), "spent_12m": round(spent12, 2),
            "points_month": round(open_total * per_brl) if per_brl else 0,
            "points_12m": round(spent12 * per_brl) if per_brl else 0,
            "value_12m": round(spent12 * ret / 100, 2),
            "net_year": round(spent12 * ret / 100 - (a.annual_fee or 0), 2),
            "available": (inv.get(a.id) or {}).get("available"),
            "days_since_close": days_since_close,
            "best_day": (a.closing_day % 31) + 1 if a.closing_day else None,
        })
    usable = [c for c in out if c["available"] is None or c["available"] > 100]
    best = max(usable, key=lambda c: (c["return_pct"], c["days_since_close"] is not None and -c["days_since_close"]), default=None)
    tips = []
    if best and best["return_pct"] > 0:
        tips.append(f"Use o {best['name']} nas compras: devolve {str(best['return_pct']).replace('.', ',')}% de cada real"
                    + (f" e o melhor dia de compra é o {best['best_day']}, logo depois do fechamento." if best["best_day"] else "."))
    for c in out:
        if c["annual_fee"] and c["net_year"] < 0:
            fee = f"{c['annual_fee']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            tips.append(f"O {c['name']} cobra anuidade de R$ {fee} e devolveu menos do que isso no último ano. "
                        "Negocie isenção ou concentre os gastos em outro cartão.")
        if c["expire_days"] is not None and 0 <= c["expire_days"] <= 60 and c["balance"]:
            tips.append(f"{int(c['balance']):,} pontos do {c['name']} vencem em {c['expire_days']} dias. Transfira ou resgate antes.".replace(",", "."))
    return {"cards": out, "best_card": best["account_id"] if best and best["return_pct"] > 0 else None,
            "usd_brl": usd, "tips": tips}
