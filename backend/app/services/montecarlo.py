"""Simulação de Monte Carlo pras metas: em vez de supor que o dinheiro rende sempre a mesma
taxa, sorteia milhares de trajetórias de retorno mensal (média e volatilidade da carteira do
perfil) e conta em quantas a meta é atingida.

Tudo em termos REAIS (descontada a inflação): o alvo fica em dinheiro de hoje, então
"R$ 300 mil daqui a 20 anos" significa o poder de compra de R$ 300 mil hoje.
Retornos reais por perfil (aproximações de longo prazo, não promessa):
  conservador 4% a.a. ± 4% · moderado 5,5% ± 9% · arrojado 7% ± 15%."""
import math
import random

ASSUMPTIONS = {"conservador": (0.04, 0.04), "moderado": (0.055, 0.09), "arrojado": (0.07, 0.15)}


def _paths(initial, monthly, months, mu, sigma, n, seed):
    rnd = random.Random(seed)
    mu_m = math.log(1 + mu) / 12 - (sigma ** 2) / 24  # log-normal: média geométrica = mu
    s_m = sigma / math.sqrt(12)
    out = []
    for _ in range(n):
        v, path = initial, []
        for _m in range(months):
            v = v * math.exp(rnd.gauss(mu_m, s_m)) + monthly
            path.append(v)
        out.append(path)
    return out


def _pct(sorted_vals, p):
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def simulate(target: float, initial: float, monthly: float, months: int, profile: str = "moderado",
             mu: float | None = None, sigma: float | None = None, n: int = 2000) -> dict:
    months = max(1, min(int(months), 600))
    a_mu, a_sigma = ASSUMPTIONS.get(profile, ASSUMPTIONS["moderado"])
    mu = a_mu if mu is None else mu
    sigma = a_sigma if sigma is None else sigma
    seed = hash((round(target), round(initial), round(monthly), months, round(mu, 4), round(sigma, 4)))
    horizon = months * 2 if months <= 300 else months  # olha além do prazo pra estimar "quando chega"
    paths = _paths(initial, monthly, horizon, mu, sigma, n, seed)

    finals = sorted(p[months - 1] for p in paths)
    prob = sum(1 for v in finals if v >= target) / n
    hit = []
    for p in paths:
        m = next((i + 1 for i, v in enumerate(p) if v >= target), None)
        if m:
            hit.append(m)
    hit.sort()
    bands = []
    step = 12 if months > 24 else 1
    for m in list(range(step, months + 1, step)) + ([months] if months % step else []):
        vals = sorted(p[m - 1] for p in paths)
        bands.append({"month": m, "p10": round(_pct(vals, .1), 2), "p50": round(_pct(vals, .5), 2), "p90": round(_pct(vals, .9), 2)})
    deterministic = initial
    for _ in range(months):
        deterministic = deterministic * (1 + mu) ** (1 / 12) + monthly

    return {"target": target, "initial": initial, "monthly": monthly, "months": months, "profile": profile,
            "assumptions": {"real_return": round(mu * 100, 2), "volatility": round(sigma * 100, 2)},
            "probability": round(prob * 100, 1),
            "median_final": round(_pct(finals, .5), 2), "p10_final": round(_pct(finals, .1), 2), "p90_final": round(_pct(finals, .9), 2),
            "median_months_to_target": hit[len(hit) // 2] if len(hit) >= n / 2 else None,
            "reach_share_in_window": round(len(hit) / n * 100, 1),
            "deterministic_final": round(deterministic, 2), "bands": bands}


def required_monthly(target: float, initial: float, months: int, profile: str = "moderado",
                     confidence: float = 0.8) -> float:
    """Menor aporte mensal pra atingir a meta com a confiança pedida (bissecção)."""
    mu, sigma = ASSUMPTIONS.get(profile, ASSUMPTIONS["moderado"])
    lo, hi = 0.0, max(target / max(months, 1) * 1.5, 1.0)
    for _ in range(40):
        if _prob(target, initial, hi, months, mu, sigma) >= confidence:
            break
        hi *= 2
    for _ in range(16):
        mid = (lo + hi) / 2
        if _prob(target, initial, mid, months, mu, sigma) >= confidence:
            hi = mid
        else:
            lo = mid
    return round(hi, 2)


def _prob(target, initial, monthly, months, mu, sigma, n=400):
    paths = _paths(initial, monthly, months, mu, sigma, n, 12345)
    return sum(1 for p in paths if p[-1] >= target) / n
