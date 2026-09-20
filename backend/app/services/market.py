"""Indicadores de mercado de fontes públicas (com cache de 1h).

- Banco Central (SGS): Selic meta (432), CDI anualizado (4389), IPCA 12 meses (13522)
- AwesomeAPI: dólar e euro
- brapi.dev: Ibovespa (requer BRAPI_TOKEN)
"""
import time
import httpx

from ..config import get_settings

_cache: dict = {"data": None, "exp": 0}

SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{}/dados/ultimos/1?formato=json"
SERIES = {"selic": 432, "cdi": 4389, "ipca_12m": 13522}


def _sgs(client, code):
    try:
        r = client.get(SGS.format(code))
        row = r.json()[-1]
        return {"value": float(row["valor"]), "date": row["data"]}
    except Exception:
        return None


def indicators(force: bool = False) -> dict:
    if _cache["data"] and _cache["exp"] > time.time() and not force:
        return _cache["data"]
    out = {}
    with httpx.Client(timeout=12, headers={"User-Agent": "Finora/1.0"}) as c:
        for k, code in SERIES.items():
            out[k] = _sgs(c, code)
        try:
            fx = c.get("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL").json()
            out["usd"] = {"value": float(fx["USDBRL"]["bid"]), "change": float(fx["USDBRL"]["pctChange"])}
            out["eur"] = {"value": float(fx["EURBRL"]["bid"]), "change": float(fx["EURBRL"]["pctChange"])}
        except Exception:
            out["usd"] = out["eur"] = None
        tok = get_settings().brapi_token
        try:
            if tok:
                q = c.get("https://brapi.dev/api/quote/%5EBVSP", params={"token": tok}).json()["results"][0]
                out["ibov"] = {"value": q["regularMarketPrice"], "change": q.get("regularMarketChangePercent")}
            else:
                out["ibov"] = None
        except Exception:
            out["ibov"] = None

    selic, ipca = out.get("selic"), out.get("ipca_12m")
    if selic and ipca:
        out["real_rate"] = round(((1 + selic["value"] / 100) / (1 + ipca["value"] / 100) - 1) * 100, 2)
    _cache.update(data=out, exp=time.time() + 3600)
    return out


def simulate(monthly: float, months: int, annual_rate: float, initial: float = 0,
             ir: bool = True) -> dict:
    """Juros compostos com aporte mensal. IR regressivo aproximado sobre o rendimento."""
    mr = (1 + annual_rate / 100) ** (1 / 12) - 1
    bal, invested, series = initial, initial, []
    for m in range(1, months + 1):
        bal = bal * (1 + mr) + monthly
        invested += monthly
        if m % max(1, months // 24) == 0 or m == months:
            series.append({"month": m, "balance": round(bal, 2), "invested": round(invested, 2)})
    gain = bal - invested
    tax = 0.0
    if ir and gain > 0:
        rate = 0.225 if months <= 6 else 0.20 if months <= 12 else 0.175 if months <= 24 else 0.15
        tax = gain * rate
    return {"gross": round(bal, 2), "invested": round(invested, 2), "gain": round(gain, 2),
            "tax": round(tax, 2), "net": round(bal - tax, 2), "series": series}
