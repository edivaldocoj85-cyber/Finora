"""Insights acionáveis com impacto calculado ("corte 15% em Restaurantes e chegue na meta
3 meses antes"). Tudo determinístico, a partir das médias dos 3 últimos meses fechados;
o Claude (consultor) só explica, não inventa número."""
import math
from datetime import date

from sqlalchemy.orm import Session

from . import analytics

CUT = 0.15  # corte sugerido nas categorias não essenciais
MIN_CAT = 100  # categoria precisa pesar pelo menos isso por mês pra valer a sugestão


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _months_txt(n: int) -> str:
    return "1 mês" if n == 1 else f"{n} meses"


def _avg_by_category(db: Session, user_id: int, ref: date, n: int = 3) -> dict:
    tot: dict = {}
    first = ref.replace(day=1)
    for i in range(1, n + 1):
        s, e = analytics.month_bounds(analytics.add_months(first, -i))
        for c in analytics.by_category(db, user_id, s, e):
            t = tot.setdefault(c["id"], {**c, "sum": 0.0})
            t["sum"] += c["total"]
    return {k: {**v, "avg": v["sum"] / n} for k, v in tot.items()}


def build(db: Session, user_id: int, d: dict, ref: date) -> list[dict]:
    """d = saída de analytics.dashboard (já tem meses, categorias, metas e saúde)."""
    out = []
    h = d.get("health") or {}
    base = h.get("base") or {}
    income, avg_exp = base.get("income") or 0, base.get("avg_expense") or 0
    surplus = income - avg_exp
    cats = _avg_by_category(db, user_id, ref)
    cuttable = sorted([c for c in cats.values() if not c["essential"] and c["avg"] >= MIN_CAT],
                      key=lambda c: -c["avg"])

    # 1) metas: quanto antes chega cortando 15% em cada categoria não essencial
    for g in d.get("goals", []):
        left = (g["target"] or 0) - (g["current"] or 0)
        if left <= 0:
            continue
        if surplus > 0:
            # ganho em tempo fracionado (arredondar pra meses cheios escondia ganhos de semanas);
            # uma categoria só não basta? soma as maiores até ganhar pelo menos 1 semana
            now_m = left / surplus
            best, picked, saved = None, [], 0.0
            for c in cuttable[:4]:
                single = now_m - left / (surplus + c["avg"] * CUT)
                if not best or single > best[1]:
                    best = ([c], single, c["avg"] * CUT)
            if best and best[1] * 30 < 7:
                for c in cuttable[:4]:
                    picked.append(c)
                    saved += c["avg"] * CUT
                    if (now_m - left / (surplus + saved)) * 30 >= 7:
                        best = (list(picked), now_m - left / (surplus + saved), saved)
                        break
            if best and best[1] * 30 >= 7:
                cs, gain_m, saved = best
                weeks = max(round(gain_m * 30 / 7), 1)
                gain_txt = _months_txt(round(gain_m)) if gain_m >= 0.75 else ("1 semana" if weeks == 1 else f"{weeks} semanas")
                names = " e ".join(c["name"] for c in cs)
                detail = (f"de {_brl(cs[0]['avg'])} pra {_brl(cs[0]['avg'] * (1 - CUT))} por mês" if len(cs) == 1
                          else f"economia de {_brl(saved)} por mês")
                new_m = left / (surplus + saved)
                if math.ceil(new_m) == math.ceil(now_m):  # mesmo mês cheio: mostra com décimos
                    fm = lambda m: f"{m:.1f}".replace(".", ",") + " meses"
                    when = f"{fm(new_m)} em vez de {fm(now_m)}"
                else:
                    when = f"{_months_txt(max(math.ceil(new_m), 1))} em vez de {_months_txt(math.ceil(now_m))}"
                out.append({"kind": "goal_cut", "priority": 90 + min(int(gain_m), 9), "impact": round(saved * 12, 2),
                            "title": f"Meta {g['name']} {gain_txt} antes",
                            "message": f"Se você reduzir {names} em 15% ({detail}), chega na meta {g['name']} em "
                                       f"{when} ({gain_txt} antes).",
                            "action": {"label": "Ver a categoria", "route": "categories"}})
            elif g.get("deadline"):
                dl = date.fromisoformat(g["deadline"])
                months_left = max((dl.year - ref.year) * 12 + dl.month - ref.month, 1)
                need = left / months_left
                if need > surplus:
                    out.append({"kind": "goal_late", "priority": 85, "impact": round(need - surplus, 2),
                                "title": f"Meta {g['name']} atrasada",
                                "message": f"Pra chegar até {dl.strftime('%m/%Y')} precisa guardar {_brl(need)} por mês, "
                                           f"mas hoje sobram {_brl(surplus)}. Faltam {_brl(need - surplus)} por mês.",
                                "action": {"label": "Ver metas", "route": "goals"}})
        else:
            out.append({"kind": "goal_blocked", "priority": 80, "impact": round(left, 2),
                        "title": f"Meta {g['name']} parada",
                        "message": f"Hoje não sobra dinheiro no mês (gasto médio {_brl(avg_exp)} × renda {_brl(income)}), "
                                   f"então a meta {g['name']} não avança.",
                        "action": {"label": "Ver fluxo de caixa", "route": "cashflow"}})

    # 2) mês no vermelho: que cortes zeram o déficit
    if income and surplus < 0 and cuttable:
        need, picked, acc = -surplus, [], 0.0
        for c in cuttable:
            picked.append(c)
            acc += c["avg"] * CUT
            if acc >= need:
                break
        names = ", ".join(c["name"] for c in picked)
        covered = "zera" if acc >= need else f"reduz em {_brl(acc)}"
        out.append({"kind": "deficit", "priority": 100, "impact": round(acc * 12, 2),
                    "title": "Você gasta mais do que ganha",
                    "message": f"Em média faltam {_brl(need)} por mês. Cortar 15% em {names} {covered} esse buraco.",
                    "action": {"label": "Ver fluxo de caixa", "route": "cashflow"}})

    # 3) categoria disparou neste mês (no ritmo atual) frente à média
    days_in = (analytics.month_bounds(ref)[1]).day
    for c in d.get("categories", []):
        avg = cats.get(c["id"], {}).get("avg", 0)
        pace = c["total"] / max(ref.day, 1) * days_in
        if avg >= MIN_CAT and ref.day >= 7 and pace > avg * 1.3 and pace - avg > 100:
            out.append({"kind": "spike", "priority": 70, "impact": round(pace - avg, 2),
                        "title": f"{c['name']} acima do normal",
                        "message": f"No ritmo atual, {c['name']} fecha o mês em {_brl(pace)}, "
                                   f"{round((pace / avg - 1) * 100)}% acima da sua média ({_brl(avg)}). "
                                   f"Voltando à média, sobram {_brl(pace - avg)}.",
                        "action": {"label": "Ver lançamentos", "route": "transactions"}})

    # 4) reserva de emergência curta: quanto tempo leva pra chegar em 6 meses
    kpi = {k["key"]: k for k in h.get("kpis", [])}
    rm = kpi.get("reserve_months", {}).get("value")
    if rm is not None and rm < 6 and avg_exp > 0:
        gap = (6 - rm) * avg_exp
        if surplus > 0:
            n = math.ceil(gap / surplus)
            msg = (f"Sua reserva cobre {str(round(rm, 1)).replace('.', ',')} meses de gasto. Guardando toda a sobra "
                   f"({_brl(surplus)} por mês) numa caixinha de liquidez diária, chega em 6 meses de reserva em {_months_txt(n)}.")
        else:
            msg = (f"Sua reserva cobre {str(round(rm, 1)).replace('.', ',')} meses de gasto. Faltam {_brl(gap)} pra chegar em 6 meses.")
        out.append({"kind": "reserve", "priority": 75 if rm < 3 else 50, "impact": round(gap, 2),
                    "title": "Reserva de emergência", "message": msg,
                    "action": {"label": "Ver caixinhas", "route": "pots"}})

    # 5) renda comprometida com dívidas
    burden = kpi.get("debt_burden", {})
    if burden.get("status") == "bad":
        out.append({"kind": "debt", "priority": 88, "impact": base.get("monthly_debt", 0),
                    "title": "Muita renda presa em dívidas",
                    "message": f"{str(round(burden['value'])).replace('.', ',')}% da renda vai pra financiamentos e parcelas "
                               f"({_brl(base.get('monthly_debt', 0))} por mês). Evite novas compras parceladas até baixar de 30%.",
                    "action": {"label": "Ver cartões", "route": "cards"}})

    out.sort(key=lambda x: -x["priority"])
    return out[:6]
