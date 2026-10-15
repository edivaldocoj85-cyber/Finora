"""Carteira de investimentos: posição, preço médio, rentabilidade, proventos e IR.

Valor de cada ativo:
- renda fixa / Tesouro (com indexador): cada aporte rende pelo índice — % do CDI, Selic,
  prefixado ou IPCA+ — no mesmo motor das caixinhas (services/pots.py). É o valor "na curva";
  título negociado antes do vencimento pode valer diferente (marcação a mercado).
- ações, FIIs, ETFs, BDRs: quantidade × cotação (brapi.dev; sem token só alguns papéis
  respondem) ou, sem cotação, o preço informado à mão;
- cripto: CoinGecko em reais (grátis); internacional: preço em dólar × dólar do dia.
Preço médio: compras somam custo (com taxas), vendas não mudam o médio e realizam lucro.
Rentabilidade: MWRR = TIR anual dos fluxos (aportes, resgates, proventos e valor de hoje);
TWRR = encadeamento das fotos diárias (PortfolioSnapshot), que não é afetado pelo tamanho
dos aportes. Benchmarks: CDI (diário) e IPCA (mensal) do Banco Central."""
import math
import time
from collections import defaultdict
from datetime import date, timedelta
from types import SimpleNamespace

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Investment, PortfolioSnapshot
from . import market, pots

VARIABLE = ("acao", "fii", "etf", "bdr")
CLASS_LABEL = {"acao": "Ações", "fii": "FIIs", "etf": "ETFs", "bdr": "BDRs", "cripto": "Cripto",
               "internacional": "Internacional", "cdb": "CDB/RDB", "lci_lca": "LCI/LCA", "tesouro": "Tesouro Direto",
               "debenture": "Debêntures/CRI/CRA", "fundo": "Fundos", "outro": "Outros"}
FIXED = ("cdb", "lci_lca", "tesouro", "debenture")
_quotes: dict = {}  # chave → (preço, expira)
COINGECKO_IDS = {"BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "USDT": "tether", "USDC": "usd-coin",
                 "BNB": "binancecoin", "XRP": "ripple", "ADA": "cardano", "DOGE": "dogecoin", "DOT": "polkadot",
                 "MATIC": "matic-network", "POL": "polygon-ecosystem-token", "LTC": "litecoin", "AVAX": "avalanche-2",
                 "LINK": "chainlink", "TRX": "tron", "SHIB": "shiba-inu", "TON": "the-open-network"}


def _client():
    return httpx.Client(timeout=8, headers={"User-Agent": "Finora/1.0"})


# ------------------------------------------------------------------ cotações
def quote_b3(tickers: list[str]) -> dict:
    """{TICKER: preço} pela brapi; cache de 15 min. Ticker sem cotação fica de fora."""
    out, missing = {}, []
    for t in tickers:
        c = _quotes.get(("b3", t))
        if c and c[1] > time.time():
            if c[0] is not None:
                out[t] = c[0]
        else:
            missing.append(t)
    if missing:
        tok = get_settings().brapi_token
        try:
            with _client() as cl:
                # com token dá pra pedir vários de uma vez; sem token, um por vez (papéis liberados)
                groups = [missing] if tok else [[t] for t in missing]
                for g in groups:
                    params = {"token": tok} if tok else {}
                    r = cl.get(f"https://brapi.dev/api/quote/{','.join(g)}", params=params)
                    found = {}
                    if r.status_code == 200:
                        for q in r.json().get("results", []):
                            if q.get("regularMarketPrice") is not None:
                                found[q["symbol"].upper()] = float(q["regularMarketPrice"])
                    for t in g:
                        _quotes[("b3", t)] = (found.get(t), time.time() + (900 if t in found else 3600))
                        if t in found:
                            out[t] = found[t]
        except Exception:
            pass
    return out


def quote_crypto(symbols: list[str]) -> dict:
    """{SÍMBOLO: preço em R$} pela CoinGecko; aceita também o id da CoinGecko no lugar do símbolo."""
    out, ids = {}, {}
    for s in symbols:
        c = _quotes.get(("cg", s))
        if c and c[1] > time.time():
            if c[0] is not None:
                out[s] = c[0]
            continue
        ids[s] = COINGECKO_IDS.get(s.upper(), s.lower())
    if ids:
        try:
            with _client() as cl:
                r = cl.get("https://api.coingecko.com/api/v3/simple/price",
                           params={"ids": ",".join(set(ids.values())), "vs_currencies": "brl"}).json()
            for s, cid in ids.items():
                p = (r.get(cid) or {}).get("brl")
                _quotes[("cg", s)] = (float(p) if p is not None else None, time.time() + (300 if p else 3600))
                if p is not None:
                    out[s] = float(p)
        except Exception:
            pass
    return out


def usd_brl() -> float | None:
    v = market.indicators().get("usd")
    return v["value"] if v else None


# ------------------------------------------------------------------ posição de um ativo
def _fixed_value(inv: Investment, today: date) -> dict:
    """Renda fixa pelo motor das caixinhas: compra = depósito, venda = resgate."""
    pot = SimpleNamespace(yield_type=inv.index_type, yield_rate=inv.index_rate or 0, tax_free=inv.tax_free)
    moves = [SimpleNamespace(id=t.id, date=t.date, kind="deposit" if t.kind == "buy" else "withdraw",
                             amount=t.quantity * t.price + (t.fees if t.kind == "buy" else -t.fees))
             for t in inv.trades]
    s = pots.compute(pot, moves, today)
    return {"value": s["balance"], "cost": s["invested"], "net_value": s["net_balance"], "ir": s["ir"],
            "iof": s["iof"], "annual_rate": s["annual_rate"]}


def position(inv: Investment, prices: dict, today: date, fx: float | None) -> dict:
    qty = cost = 0.0
    realized = []
    for t in sorted(inv.trades, key=lambda t: (t.date, t.id or 0)):
        if t.date > today:
            continue
        if t.kind == "buy":
            cost += t.quantity * t.price + t.fees
            qty += t.quantity
        elif qty > 0:
            q = min(t.quantity, qty)
            avg = cost / qty
            proceeds = q * t.price - t.fees
            realized.append({"date": t.date, "class": inv.asset_class, "ticker": inv.ticker or inv.name,
                             "sale": q * t.price, "gain": proceeds - avg * q, "day_trade": t.day_trade})
            cost -= avg * q
            qty -= q
    income = sum(e.amount for e in inv.events if e.date <= today)
    out = {"id": inv.id, "name": inv.name, "ticker": inv.ticker, "asset_class": inv.asset_class,
           "class_label": CLASS_LABEL.get(inv.asset_class, inv.asset_class), "broker": inv.broker,
           "currency": inv.currency, "quantity": round(qty, 8), "avg_price": round(cost / qty, 4) if qty else 0.0,
           "cost": round(cost, 2), "price": None, "price_source": None, "income": round(income, 2),
           "realized_gain": round(sum(r["gain"] for r in realized), 2), "target_pct": inv.target_pct,
           # campos do cadastro (a tela usa pra editar)
           "index_type": inv.index_type, "index_rate": inv.index_rate, "tax_free": inv.tax_free,
           "manual_price": inv.manual_price, "archived": inv.archived,
           "maturity": inv.maturity.isoformat() if inv.maturity else None, "_realized": realized}

    if inv.index_type and inv.asset_class not in VARIABLE + ("cripto", "internacional"):
        f = _fixed_value(inv, today)
        out.update({"value": f["value"], "cost": f["cost"], "net_value": f["net_value"], "tax_estimate": round(f["ir"] + f["iof"], 2),
                    "price_source": "curve", "annual_rate": f["annual_rate"], "quantity": 1 if f["value"] else 0})
    else:
        key = (inv.ticker or "").upper()
        price, src = prices.get((inv.asset_class, key)), "quote"
        if price is None and inv.manual_price is not None:
            price, src = inv.manual_price, "manual"
        if price is None and qty:
            last_buy = next((t.price for t in sorted(inv.trades, key=lambda t: t.date, reverse=True) if t.kind == "buy"), None)
            price, src = last_buy, "last_trade"
        unit = price or 0.0
        if inv.currency == "USD" and fx:
            unit_brl = unit * fx
        else:
            unit_brl = unit
        out.update({"price": round(unit, 4) if price is not None else None, "price_source": src,
                    "value": round(qty * unit_brl, 2), "net_value": round(qty * unit_brl, 2)})
        if inv.currency == "USD" and fx:
            out["cost_note"] = "custo em reais pelo câmbio de cada compra informado no preço"
    out["gain"] = round(out["value"] - out["cost"], 2)
    out["gain_pct"] = round((out["value"] / out["cost"] - 1) * 100, 2) if out["cost"] > 0 else None
    out["total_return"] = round(out["gain"] + out["income"] + out["realized_gain"], 2)
    return out


# ------------------------------------------------------------------ rentabilidade
def xirr(flows: list[tuple[date, float]]) -> float | None:
    """TIR anual (fluxos com datas). Negativo = dinheiro que entrou na carteira."""
    flows = [(d, v) for d, v in flows if abs(v) > 0.005]
    if len(flows) < 2 or not any(v > 0 for _, v in flows) or not any(v < 0 for _, v in flows):
        return None
    d0 = min(d for d, _ in flows)

    def npv(r):
        return sum(v / (1 + r) ** ((d - d0).days / 365) for d, v in flows)

    lo, hi = -0.99, 10.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):  # bissecção: estável mesmo com fluxos esquisitos
        mid = (lo + hi) / 2
        f = npv(mid)
        if abs(f) < 1e-7:
            break
        if f_lo * f < 0:
            hi, f_hi = mid, f
        else:
            lo, f_lo = mid, f
    return (lo + hi) / 2


def cdi_accumulated(start: date, end: date) -> float | None:
    rates, official = pots.daily_rates("cdi", start, end)
    if not official:
        return None
    acc = 1.0
    for d, r in rates.items():
        if start <= d < end:
            acc *= 1 + r
    return acc - 1


def ipca_accumulated(start: date, end: date) -> float | None:
    key = ("ipca", start.strftime("%Y%m"), end.strftime("%Y%m"))
    c = _quotes.get(key)
    if c and c[1] > time.time():
        return c[0]
    try:
        with _client() as cl:
            rows = cl.get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados",
                          params={"formato": "json", "dataInicial": start.replace(day=1).strftime("%d/%m/%Y"),
                                  "dataFinal": end.strftime("%d/%m/%Y")}).json()
        acc = 1.0
        for r in rows:
            acc *= 1 + float(r["valor"]) / 100
        _quotes[key] = (acc - 1, time.time() + 12 * 3600)
        return acc - 1
    except Exception:
        return None


def twrr(db: Session, user_id: int) -> dict | None:
    snaps = db.query(PortfolioSnapshot).filter_by(user_id=user_id).order_by(PortfolioSnapshot.date).all()
    if len(snaps) < 2:
        return None
    acc = 1.0
    for a, b in zip(snaps, snaps[1:]):
        base = a.value + b.net_flow
        if base > 0:
            acc *= b.value / base
    days = (snaps[-1].date - snaps[0].date).days
    return {"since": snaps[0].date.isoformat(), "total": round((acc - 1) * 100, 2),
            "annual": round((acc ** (365 / days) - 1) * 100, 2) if days >= 30 else None}


# ------------------------------------------------------------------ carteira inteira
def build(db: Session, user_id: int, today: date | None = None, with_benchmarks: bool = True) -> dict:
    today = today or date.today()
    invs = db.query(Investment).filter_by(user_id=user_id).all()
    active = [i for i in invs if not i.archived]
    b3 = [i.ticker.upper() for i in active if i.asset_class in VARIABLE and i.ticker]
    cg = [i.ticker.upper() for i in active if i.asset_class == "cripto" and i.ticker]
    prices = {}
    for t, p in quote_b3(sorted(set(b3))).items():
        for cls in VARIABLE:
            prices[(cls, t)] = p
    for t, p in quote_crypto(sorted(set(cg))).items():
        prices[("cripto", t)] = p
    fx = usd_brl()
    positions = [position(i, prices, today, fx) for i in invs]
    live = [p for p in positions if not next(i for i in invs if i.id == p["id"]).archived]

    value = sum(p["value"] for p in live)
    cost = sum(p["cost"] for p in live)
    income = sum(p["income"] for p in positions)
    realized = sum(p["realized_gain"] for p in positions)

    by_class = defaultdict(float)
    for p in live:
        by_class[p["asset_class"]] += p["value"]
    allocation = sorted([{"class": k, "label": CLASS_LABEL.get(k, k), "value": round(v, 2),
                          "pct": round(v / value * 100, 1) if value else 0} for k, v in by_class.items() if v],
                        key=lambda x: -x["value"])

    flows, first = [], None
    for i in invs:
        for t in i.trades:
            if t.date <= today:
                amt = t.quantity * t.price
                flows.append((t.date, -(amt + t.fees) if t.kind == "buy" else amt - t.fees))
                first = min(first or t.date, t.date)
        for e in i.events:
            if e.date <= today:
                flows.append((e.date, e.amount))
    mw = xirr(flows + [(today, value)]) if value or flows else None

    out = {"value": round(value, 2), "cost": round(cost, 2), "gain": round(value - cost, 2),
           "gain_pct": round((value / cost - 1) * 100, 2) if cost > 0 else None,
           "income": round(income, 2), "realized_gain": round(realized, 2),
           "total_return": round(value - cost + income + realized, 2),
           "mwrr_annual": round(mw * 100, 2) if mw is not None else None,
           "since": first.isoformat() if first else None, "usd_brl": fx,
           "allocation": allocation, "positions": [{k: v for k, v in p.items() if not k.startswith("_")} for p in positions],
           "twrr": twrr(db, user_id), "benchmarks": None}
    if with_benchmarks and first and (today - first).days >= 1:
        cdi = cdi_accumulated(first, today)
        ipca = ipca_accumulated(first, today)
        years = max((today - first).days / 365, 1 / 365)
        ann = lambda x: round(((1 + x) ** (1 / years) - 1) * 100, 2) if x is not None and years >= 1 / 12 else None
        out["benchmarks"] = {"since": first.isoformat(),
                             "cdi_total": round(cdi * 100, 2) if cdi is not None else None, "cdi_annual": ann(cdi),
                             "ipca_total": round(ipca * 100, 2) if ipca is not None else None, "ipca_annual": ann(ipca)}
    out["_positions"] = positions
    return out


# ------------------------------------------------------------------ proventos
def dividends(db: Session, user_id: int, today: date | None = None) -> dict:
    """Recebido por mês (12 meses) e projeção dos próximos 6: FII pela média dos últimos 6
    meses (paga todo mês); ações e outros pela soma de 12 meses ÷ 12."""
    today = today or date.today()
    invs = db.query(Investment).filter_by(user_id=user_id, archived=False).all()
    first_month = date(today.year - 1, today.month, 1)
    past = defaultdict(float)
    per_asset, projected = [], defaultdict(float)
    for i in invs:
        evs = [e for e in i.events if e.date <= today]
        last12 = [e for e in evs if e.date >= first_month]
        for e in last12:
            past[e.date.strftime("%Y-%m")] += e.amount
        if not last12:
            continue
        total12 = sum(e.amount for e in last12)
        if i.asset_class == "fii":
            # média dos 6 últimos meses que tiveram pagamento (FII paga todo mês)
            per_month = defaultdict(float)
            for e in last12:
                per_month[e.date.strftime("%Y-%m")] += e.amount
            recent = [per_month[k] for k in sorted(per_month)[-6:]]
            monthly = sum(recent) / len(recent)
        else:
            monthly = total12 / 12
        per_asset.append({"id": i.id, "name": i.ticker or i.name, "class": i.asset_class,
                          "last12": round(total12, 2), "monthly_estimate": round(monthly, 2)})
        for k in range(1, 7):
            m = date(today.year + (today.month - 1 + k) // 12, (today.month - 1 + k) % 12 + 1, 1)
            projected[m.strftime("%Y-%m")] += monthly
    months = []
    for k in range(-11, 1):
        y, m = today.year + (today.month - 1 + k) // 12, (today.month - 1 + k) % 12 + 1
        key = f"{y}-{m:02d}"
        months.append({"month": key, "received": round(past.get(key, 0), 2), "projected": 0})
    for key in sorted(projected):
        months.append({"month": key, "received": 0, "projected": round(projected[key], 2)})
    return {"months": months, "assets": sorted(per_asset, key=lambda x: -x["last12"]),
            "last12": round(sum(past.values()), 2), "next6": round(sum(projected.values()), 2)}


# ------------------------------------------------------------------ imposto de renda (renda variável e cripto)
def _last_business_day(y: int, m: int) -> date:
    d = date(y, m, 1) + timedelta(days=32)
    d = d.replace(day=1) - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def income_tax(db: Session, user_id: int, year: int | None = None, today: date | None = None) -> dict:
    """Apuração mensal de pessoa física (simplificada, regras de 2025/2026):
    - ações (swing): isento se as VENDAS de ações no mês somam até R$ 20 mil; senão 15% do lucro;
    - ETF e BDR (swing): 15% sempre, sem isenção — compensam prejuízo junto com ações;
    - FII: 20% sempre, prejuízo só compensa com FII;
    - day trade: 20%, prejuízo só compensa com day trade (IRRF de 1% do lucro);
    - cripto: 15% do lucro se as vendas do mês passam de R$ 35 mil (sem compensação).
    IRRF "dedo-duro" de 0,005% sobre vendas em bolsa é abatido. DARF abaixo de R$ 10 acumula
    pro mês seguinte. Código 6015 (bolsa) e 4600 (cripto); vence no último dia útil do mês seguinte."""
    today = today or date.today()
    invs = db.query(Investment).filter_by(user_id=user_id).all()
    realized = []
    for i in invs:
        if i.asset_class in VARIABLE + ("cripto",):
            realized += position(i, {}, today, None)["_realized"]
    realized.sort(key=lambda r: r["date"])
    years = sorted({r["date"].year for r in realized}) or [today.year]
    year = year or years[-1]

    losses = {"comum": 0.0, "fii": 0.0, "daytrade": 0.0}  # prejuízo acumulado a compensar
    carry = 0.0  # DARF < R$ 10 que passa pro mês seguinte
    months = []
    by_month = defaultdict(list)
    for r in realized:
        by_month[(r["date"].year, r["date"].month)].append(r)
    for (y, m) in sorted(by_month):
        rs = by_month[(y, m)]
        swing = [r for r in rs if not r["day_trade"] and r["class"] != "cripto"]
        acao_sales = sum(r["sale"] for r in swing if r["class"] == "acao")
        acao_gain = sum(r["gain"] for r in swing if r["class"] == "acao")
        etfbdr_gain = sum(r["gain"] for r in swing if r["class"] in ("etf", "bdr"))
        fii_gain = sum(r["gain"] for r in swing if r["class"] == "fii")
        dt_gain = sum(r["gain"] for r in rs if r["day_trade"] and r["class"] != "cripto")
        crypto = [r for r in rs if r["class"] == "cripto"]
        crypto_sales, crypto_gain = sum(r["sale"] for r in crypto), sum(r["gain"] for r in crypto)
        exempt_acao = acao_sales <= 20000

        comum = (min(acao_gain, 0) if exempt_acao else acao_gain) + etfbdr_gain
        exempt_gain = max(acao_gain, 0) if exempt_acao else 0.0

        def settle(bucket, gain, rate):
            if gain < 0:
                losses[bucket] += -gain
                return 0.0, 0.0
            used = min(losses[bucket], gain)
            losses[bucket] -= used
            return gain - used, (gain - used) * rate

        base_c, tax_c = settle("comum", comum, 0.15)
        base_f, tax_f = settle("fii", fii_gain, 0.20)
        base_d, tax_d = settle("daytrade", dt_gain, 0.20)
        tax_cr = crypto_gain * 0.15 if crypto_sales > 35000 and crypto_gain > 0 else 0.0
        irrf = sum(r["sale"] for r in swing) * 0.00005 + max(dt_gain, 0) * 0.01
        due_b3 = max(tax_c + tax_f + tax_d - irrf, 0) + carry
        carry = 0.0
        darfs = []
        if due_b3 >= 10:
            darfs.append({"code": "6015", "label": "Renda variável (bolsa)", "amount": round(due_b3, 2)})
        elif due_b3 > 0:
            carry = due_b3
        if tax_cr >= 10:
            darfs.append({"code": "4600", "label": "Ganho de capital em cripto", "amount": round(tax_cr, 2)})
        dy, dm = (y + 1, 1) if m == 12 else (y, m + 1)
        months.append({
            "month": f"{y}-{m:02d}", "acao_sales": round(acao_sales, 2), "acao_exempt": exempt_acao and acao_gain > 0,
            "exempt_gain": round(exempt_gain, 2), "gains": {
                "acoes_etf_bdr": round(comum, 2), "fii": round(fii_gain, 2), "day_trade": round(dt_gain, 2),
                "cripto": round(crypto_gain, 2)},
            "taxable_base": round(base_c + base_f + base_d, 2), "irrf": round(irrf, 2),
            "tax": round(tax_c + tax_f + tax_d + tax_cr, 2), "darfs": darfs,
            "due_date": _last_business_day(dy, dm).isoformat() if darfs else None,
            "carry_next": round(carry, 2), "losses_after": {k: round(v, 2) for k, v in losses.items()},
            "crypto_sales": round(crypto_sales, 2)})

    # declaração anual: posição em 31/12 pelo custo (bens e direitos) e rendimentos
    dec31 = date(year, 12, 31) if date(year, 12, 31) <= today else today
    goods, exempt_income, exclusive = [], 0.0, 0.0
    for i in invs:
        p = position(i, {}, dec31, None)
        if p["cost"] > 0.004:
            goods.append({"name": i.name, "ticker": i.ticker, "class": CLASS_LABEL.get(i.asset_class, i.asset_class),
                          "broker": i.broker, "quantity": p["quantity"], "cost": p["cost"]})
        for e in i.events:
            if e.date.year == year:
                if e.kind == "jcp":
                    exclusive += e.amount
                elif e.kind in ("dividend", "income"):
                    exempt_income += e.amount
    exempt_income += sum(mo["exempt_gain"] for mo in months if mo["month"].startswith(str(year)))
    return {"year": year, "years": years, "months": [mo for mo in months if mo["month"].startswith(str(year))],
            "losses": {k: round(v, 2) for k, v in losses.items()},
            "annual": {"goods": goods, "exempt_income": round(exempt_income, 2), "exclusive_income": round(exclusive, 2)}}


def snapshot(db: Session, user_id: int, today: date, net_worth: float | None = None) -> PortfolioSnapshot | None:
    """Foto do dia da carteira (chamada pela rotina diária)."""
    invs = db.query(Investment).filter_by(user_id=user_id).all()
    if not invs:
        return None
    p = build(db, user_id, today, with_benchmarks=False)
    flow = 0.0
    for i in invs:
        for t in i.trades:
            if t.date == today:
                flow += (t.quantity * t.price + t.fees) if t.kind == "buy" else -(t.quantity * t.price - t.fees)
        for e in i.events:
            if e.date == today:
                flow -= e.amount
    s = db.query(PortfolioSnapshot).filter_by(user_id=user_id, date=today).first()
    if not s:
        s = PortfolioSnapshot(user_id=user_id, date=today, value=0, invested=0)
        db.add(s)
    s.value, s.invested, s.net_flow, s.net_worth = p["value"], p["cost"], flow, net_worth
    return s
