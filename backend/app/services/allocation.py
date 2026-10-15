"""Perfil de investidor pelo comportamento real e sugestão de onde colocar a sobra do mês.

Perfil (0–100, quanto maior mais risco a pessoa aguenta), com o motivo de cada ponto:
  capacidade: reserva de emergência, taxa de poupança, estabilidade da renda, dívidas;
  comportamento: quanto já tem em renda variável, se vendeu no prejuízo, horizonte das metas.
Sugestão (nesta ordem, igual a um planejador faria):
  1. sobra = renda − gasto médio − 10% de margem; sem sobra → cortes, não investimento;
  2. dívida cara (rotativo/cheque especial/juros > CDI) → quitar primeiro;
  3. reserva < 6 meses → toda a sobra pra liquidez diária;
  4. senão, carteira-alvo do perfil ajustada pelo cenário (juro real alto → mais renda fixa
     pós/IPCA+), e a sobra vai pras classes mais abaixo do alvo (rebalanceando sem vender).
Não é recomendação de ativo específico: são classes, com exemplos genéricos."""
import statistics
from datetime import date

from sqlalchemy.orm import Session

from . import analytics, market

PROFILES = {
    "conservador": {"label": "Conservador", "target": {"pos": 60, "ipca": 25, "pre": 10, "acoes": 5, "fii": 0, "exterior": 0}},
    "moderado": {"label": "Moderado", "target": {"pos": 35, "ipca": 25, "pre": 5, "acoes": 15, "fii": 10, "exterior": 10}},
    "arrojado": {"label": "Arrojado", "target": {"pos": 15, "ipca": 20, "pre": 5, "acoes": 30, "fii": 10, "exterior": 20}},
}
BUCKET_LABEL = {"pos": "Renda fixa pós-fixada", "ipca": "Renda fixa atrelada à inflação", "pre": "Renda fixa prefixada",
                "acoes": "Ações e ETFs de ações", "fii": "Fundos imobiliários", "exterior": "Investimentos no exterior"}
BUCKET_EXAMPLES = {"pos": "Tesouro Selic, CDB 100%+ do CDI, LCI/LCA",
                   "ipca": "Tesouro IPCA+, CDB/LCA IPCA+, debêntures incentivadas",
                   "pre": "Tesouro Prefixado, CDB prefixado",
                   "acoes": "ETF amplo da bolsa (ex.: BOVA11) ou ações de empresas sólidas e diversificadas",
                   "fii": "ETF de FIIs ou FIIs de tijolo e papel diversificados",
                   "exterior": "ETF do S&P 500 em reais (ex.: IVVB11) ou BDRs de ETFs"}
CLASS_BUCKET = {"cdb": "pos", "lci_lca": "pos", "tesouro": "pos", "debenture": "ipca", "fundo": "pos", "outro": "pos",
                "acao": "acoes", "etf": "acoes", "bdr": "exterior", "internacional": "exterior", "fii": "fii", "cripto": "acoes"}


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _num(v: float, d: int = 1) -> str:
    return f"{v:.{d}f}".replace(".", ",")


def _bucket_of(p: dict) -> str:
    b = CLASS_BUCKET.get(p["asset_class"], "pos")
    if p["asset_class"] in ("cdb", "lci_lca", "tesouro", "debenture"):
        b = {"ipca": "ipca", "pre": "pre"}.get(p.get("index_type") or "", "pos")
    return b


def profile(db: Session, user_id: int, d: dict, port: dict | None, ref: date) -> dict:
    h = d.get("health") or {}
    kpi = {k["key"]: k for k in h.get("kpis", [])}
    reasons, score = [], 50.0

    def add(pts, why):
        nonlocal score
        score += pts
        reasons.append({"points": pts, "text": why})

    rm = kpi.get("reserve_months", {}).get("value")
    if rm is not None:
        if rm >= 6:
            add(12, f"Reserva de {_num(rm)} meses: aguenta oscilação sem precisar vender.")
        elif rm < 3:
            add(-15, "Reserva curta: qualquer imprevisto pode obrigar a resgatar no pior momento.")
    sr = kpi.get("savings_rate", {}).get("value")
    if sr is not None:
        add(8 if sr >= 20 else -10 if sr < 5 else 0, f"Poupa {sr:.0f}% da renda.")
    burden = kpi.get("debt_burden", {}).get("value")
    if burden is not None and burden > 30:
        add(-12, f"{burden:.0f}% da renda vai pra dívidas.")
    incomes = [m["income"] for m in d.get("months", [])[:-1] if m["income"]]
    if len(incomes) >= 3:
        cv = statistics.pstdev(incomes) / statistics.mean(incomes)
        if cv > 0.35:
            add(-10, "Renda que varia muito de um mês pro outro pede mais segurança.")
        elif cv < 0.1:
            add(5, "Renda estável.")
    if port and port.get("value"):
        var_pct = sum(a["pct"] for a in port["allocation"] if a["class"] in ("acao", "fii", "etf", "bdr", "cripto", "internacional"))
        if var_pct >= 30:
            add(10, f"Já tem {var_pct:.0f}% em renda variável e mantém.")
        elif var_pct == 0:
            add(-5, "Ainda não tem nada em renda variável.")
        losses = [p for p in port["positions"] if p.get("realized_gain", 0) < 0]
        if losses:
            add(-8, "Já vendeu ativo no prejuízo (sinal de desconforto com queda).")
    goals = d.get("goals", [])
    horizons = [((date.fromisoformat(g["deadline"]) - ref).days / 365) for g in goals if g.get("deadline")]
    if horizons:
        far = max(horizons)
        add(8 if far >= 5 else -6 if far < 2 else 0, f"Meta mais longa daqui a {far:.0f} anos.")
    score = max(0, min(100, round(score)))
    key = "arrojado" if score >= 65 else "moderado" if score >= 40 else "conservador"
    return {"key": key, "label": PROFILES[key]["label"], "score": score, "reasons": reasons}


def suggest(db: Session, user_id: int, d: dict, port: dict | None, ref: date, override: str | None = None) -> dict:
    prof = profile(db, user_id, d, port, ref)
    key = override if override in PROFILES else prof["key"]
    h = d.get("health") or {}
    base = h.get("base") or {}
    kpi = {k["key"]: k for k in h.get("kpis", [])}
    income, avg_exp = base.get("income") or 0, base.get("avg_expense") or 0
    surplus = income - avg_exp
    margin = income * 0.10
    free = max(surplus - margin, 0)
    steps, plan = [], []

    ind = market.indicators()
    selic = (ind.get("selic") or {}).get("value")
    real = ind.get("real_rate")
    target = dict(PROFILES[key]["target"])
    if real is not None and real >= 6:  # juro real muito alto: renda fixa paga bem sem risco de bolsa
        shift = min(10, target["acoes"])
        target["acoes"] -= shift
        target["ipca"] += shift // 2
        target["pos"] += shift - shift // 2
        steps.append(f"Juro real alto ({_num(real)}% acima da inflação): a carteira-alvo pende mais pra renda fixa.")

    out = {"profile": prof, "used_profile": key, "used_label": PROFILES[key]["label"], "surplus": round(surplus, 2),
           "margin": round(margin, 2), "free": round(free, 2), "selic": selic, "real_rate": real,
           "target": target, "steps": steps, "plan": plan,
           "disclaimer": "Sugestão educativa por classe de ativo, calculada com os seus dados. Não é recomendação "
                         "individual de investimento; confira prazo, liquidez, garantia do FGC e custos antes de aplicar."}

    if surplus <= 0:
        steps.append("Hoje o gasto médio é maior ou igual à renda. Antes de investir, o passo é abrir espaço no orçamento.")
        out["action"] = "cut"
        return out
    if free <= 0:
        steps.append(f"Sobra pouco ({_brl(surplus)} por mês) e a margem de segurança de 10% da renda consome tudo.")
        out["action"] = "wait"
        return out

    cards_debt = [c for c in d.get("cards", []) if c.get("outstanding_balance", 0) > c.get("total", 0) + 1]
    from ..models import Contract
    costly = [c for c in db.query(Contract).filter_by(user_id=user_id, active=True)
              if (c.interest_rate_month or 0) > ((selic or 12) / 12 + 0.3)]
    if costly or cards_debt or d.get("cash", 0) < 0:
        names = ", ".join([c.name for c in costly][:3]) or "rotativo do cartão / cheque especial"
        plan.append({"bucket": "debt", "label": "Quitar dívida cara", "amount": round(free, 2),
                     "why": f"Juros de {names} custam mais do que qualquer investimento rende. Amortizar é o melhor 'investimento' agora.",
                     "examples": "Antecipar parcelas com desconto de juros, renegociar ou trocar por crédito mais barato"})
        out["action"] = "debt"
        return out

    rm = kpi.get("reserve_months", {}).get("value") or 0
    if rm < 6 and avg_exp > 0:
        gap = (6 - rm) * avg_exp
        to_res = min(free, gap)
        plan.append({"bucket": "reserve", "label": "Reserva de emergência", "amount": round(to_res, 2),
                     "why": f"Sua reserva cobre {_num(rm)} meses; o ideal é 6 (faltam {_brl(gap)}). Precisa de liquidez diária e risco baixo.",
                     "examples": "Caixinha/CDB 100% do CDI com liquidez diária, Tesouro Selic"})
        free_left = free - to_res
        if free_left <= 0.01:
            out["action"] = "reserve"
            return out
    else:
        free_left = free

    # rebalanceamento: a sobra vai pras classes mais abaixo do alvo, sem vender nada
    cur = {b: 0.0 for b in target}
    total = 0.0
    if port:
        for p in port["positions"]:
            if p["value"]:
                cur[_bucket_of(p)] = cur.get(_bucket_of(p), 0) + p["value"]
                total += p["value"]
    after = total + free_left
    gaps = {b: max(target[b] / 100 * after - cur.get(b, 0), 0) for b in target if target[b]}
    gsum = sum(gaps.values())
    for b, g in sorted(gaps.items(), key=lambda x: -x[1]):
        amt = free_left * g / gsum if gsum else free_left * target[b] / 100
        if amt < 1:
            continue
        have = cur.get(b, 0) / total * 100 if total else 0
        plan.append({"bucket": b, "label": BUCKET_LABEL[b], "amount": round(amt, 2),
                     "why": f"Alvo {target[b]}% da carteira; hoje {have:.0f}%.",
                     "examples": BUCKET_EXAMPLES[b]})
    out["action"] = "invest"
    return out
