"""Caixinhas (Nubank, Inter, PicPay, Mercado Pago…): rendimento dia a dia.

Cada depósito é um "lote" que rende pela taxa diária do índice em cada dia útil — a mesma
conta que o banco faz:
- % do CDI ou % da Selic: taxa diária oficial do Banco Central (SGS 12 = CDI, 11 = Selic),
  multiplicada pelo percentual contratado (ex.: 100% do CDI);
- prefixada: (1 + taxa a.a.)^(1/252) por dia útil.
Resgates saem dos lotes mais antigos primeiro (como o IR é cobrado). IR regressivo e IOF
(resgate antes de 30 dias) são estimados sobre o rendimento de cada lote; caixinha isenta
(LCI/LCA, poupança) não tem nenhum dos dois.
Sem acesso ao Banco Central, usa a taxa anual atual em todos os dias úteis (aproximação)."""
import time
from datetime import date, timedelta

import httpx

from . import market

SGS_RANGE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{}/dados?formato=json&dataInicial={}&dataFinal={}"
SERIES = {"cdi": 12, "selic": 11}
_cache: dict = {}  # código → {"from": date, "data": {date: taxa diária}, "exp": ts}

# IOF regressivo sobre o rendimento: resgate com 1 dia paga 96%, … com 29 dias 3%, 30+ isento
IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3]


def ir_rate(days: int) -> float:
    return 0.225 if days <= 180 else 0.20 if days <= 360 else 0.175 if days <= 720 else 0.15


def iof_rate(days: int) -> float:
    return IOF[days - 1] / 100 if 1 <= days <= 29 else 0.0


def daily_rates(index: str, start: date, end: date) -> tuple[dict, bool]:
    """{dia útil: taxa diária (fração)} entre start e end, e se veio do Banco Central."""
    code = SERIES[index]
    c = _cache.get(code)
    if not c or c["from"] > start or c["exp"] < time.time():
        try:
            with httpx.Client(timeout=8, headers={"User-Agent": "Finora/1.0"}) as cl:
                # série diária: o BC aceita até 10 anos por consulta
                ini = max(start, end - timedelta(days=3650))
                rows = cl.get(SGS_RANGE.format(code, ini.strftime("%d/%m/%Y"), end.strftime("%d/%m/%Y"))).json()
            data = {}
            for r in rows:
                d, m, y = map(int, r["data"].split("/"))
                data[date(y, m, d)] = float(r["valor"]) / 100
            c = _cache[code] = {"from": ini, "data": data, "exp": time.time() + 6 * 3600}
        except Exception:
            c = None
    if c and c["data"]:
        return c["data"], True
    return {}, False


def current_annual(index: str) -> float | None:
    ind = market.indicators()
    key = {"cdi": "cdi", "selic": "selic"}.get(index)
    v = ind.get(key) if key else None
    return v["value"] if v else None


def compute(pot, moves, today: date | None = None) -> dict:
    """Saldo, rendimento, impostos estimados e projeção de uma caixinha."""
    today = today or date.today()
    moves = sorted(moves, key=lambda m: (m.date, m.id or 0))
    pct = (pot.yield_rate or 0) / 100
    out = {"balance": 0.0, "invested": 0.0, "gross_yield": 0.0, "ir": 0.0, "iof": 0.0, "net_balance": 0.0,
           "month_yield": 0.0, "annual_rate": None, "monthly_estimate": 0.0, "year_estimate": 0.0,
           "official_rates": True, "since": moves[0].date.isoformat() if moves else None}

    # taxa anual efetiva de hoje (pra projeção e pros dias sem taxa publicada)
    if pot.yield_type == "pre":
        annual = pct
    else:
        base = current_annual(pot.yield_type)
        annual = (base / 100) * pct if base is not None else None
    out["annual_rate"] = round(annual * 100, 2) if annual is not None else None
    if not moves:
        return out

    start = moves[0].date
    # prefixada também usa o calendário do CDI: os dias com taxa publicada são os dias úteis
    # (sem feriados); 252 deles fazem um ano
    rates, official = daily_rates("cdi" if pot.yield_type == "pre" else pot.yield_type, start, today)
    out["official_rates"] = official
    last_pub = max(rates) if rates else None
    fallback_daily = (1 + annual) ** (1 / 252) - 1 if annual is not None else 0.0

    def factor(d: date) -> float:
        if d in rates:
            if pot.yield_type == "pre":
                return fallback_daily
            return rates[d] * pct
        # depois da última taxa publicada (o BC publica no dia seguinte) ou sem acesso ao BC
        if (last_pub is None or d > last_pub) and d.weekday() < 5:
            return fallback_daily
        return 0.0  # fim de semana ou feriado

    lots = []  # [início, valor atual, principal]
    by_day: dict = {}
    for m in moves:
        by_day.setdefault(m.date, []).append(m)

    def apply(m):
        if m.kind == "deposit":
            lots.append([m.date, m.amount, m.amount])
        elif m.kind == "withdraw":
            rest = m.amount
            for lot in lots:
                if rest <= 0:
                    break
                take = min(lot[1], rest)
                if lot[1] > 0:
                    lot[2] *= (1 - take / lot[1])
                lot[1] -= take
                rest -= take
            lots[:] = [l for l in lots if l[1] > 0.004]
        elif m.kind == "adjust":  # acerto com o saldo do app do banco: conta como rendimento
            if lots:
                lots[-1][1] += m.amount
            elif m.amount > 0:
                lots.append([m.date, m.amount, 0.0])

    month_start = today.replace(day=1)
    d = start
    while d < today:
        for m in by_day.get(d, []):
            apply(m)
        f = factor(d)
        if f:
            before = sum(l[1] for l in lots)
            for lot in lots:
                lot[1] *= 1 + f
            if d >= month_start:
                out["month_yield"] += sum(l[1] for l in lots) - before
        d += timedelta(days=1)
    for m in by_day.get(today, []) + [m for m in moves if m.date > today]:
        apply(m)  # depósito de hoje (ou data futura) ainda não rendeu

    balance = sum(l[1] for l in lots)
    invested = sum(l[2] for l in lots)
    ir = iof = 0.0
    if not pot.tax_free:
        for lot_start, value, principal in lots:
            gain = max(value - principal, 0)
            days = (today - lot_start).days
            lot_iof = gain * iof_rate(days)
            iof += lot_iof
            ir += (gain - lot_iof) * ir_rate(days)
    monthly = balance * ((1 + annual) ** (1 / 12) - 1) if annual is not None else 0.0
    out.update({
        "balance": round(balance, 2), "invested": round(invested, 2),
        "gross_yield": round(balance - invested, 2), "ir": round(ir, 2), "iof": round(iof, 2),
        "net_balance": round(balance - ir - iof, 2), "month_yield": round(out["month_yield"], 2),
        "monthly_estimate": round(monthly, 2),
        "year_estimate": round(balance * annual, 2) if annual is not None else 0.0,
        "yield_pct": round((balance / invested - 1) * 100, 2) if invested > 0 else None,
    })
    return out
