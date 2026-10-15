"""Plano de contas de empresa e DRE (Demonstração do Resultado do Exercício).

Cada categoria pode ter um código contábil (3.1.01…) e um grupo da DRE. A DRE soma os
lançamentos do período por grupo, no regime de caixa (pela data do lançamento):
  Receita bruta − Deduções = Receita líquida − Custos = Lucro bruto
  − Despesas (pessoal, administrativas, comerciais) = Resultado operacional
  ± Resultado financeiro ± Outras = Resultado antes do IR − IRPJ/CSLL = Lucro líquido
Investimentos (equipamentos) e distribuição de lucros ficam fora da DRE, listados à parte.
Despesa sem grupo entra como "não classificada" (em outras despesas) pra nada sumir."""
from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from ..models import Category, Transaction
from . import analytics

GROUPS = {
    "receita_bruta": ("Receita bruta", "income"), "deducoes": ("Deduções (impostos sobre vendas, devoluções)", "expense"),
    "custos": ("Custos (CMV/CSP)", "expense"), "despesas_pessoal": ("Despesas com pessoal", "expense"),
    "despesas_adm": ("Despesas administrativas", "expense"), "despesas_comerciais": ("Despesas comerciais", "expense"),
    "receitas_financeiras": ("Receitas financeiras", "income"), "despesas_financeiras": ("Despesas financeiras", "expense"),
    "outras_receitas": ("Outras receitas", "income"), "outras_despesas": ("Outras despesas", "expense"),
    "impostos_lucro": ("IRPJ e CSLL", "expense"), "capex": ("Investimentos (fora da DRE)", "expense"),
    "distribuicao": ("Distribuição de lucros (fora da DRE)", "expense"),
}

# código, nome, tipo, grupo da DRE, cor, essencial
DEFAULT_PJ = [
    ("3.1.01", "Venda de produtos", "income", "receita_bruta", "#10b981", False),
    ("3.1.02", "Prestação de serviços", "income", "receita_bruta", "#059669", False),
    ("3.2.01", "Impostos sobre vendas (Simples, ISS, ICMS)", "expense", "deducoes", "#b91c1c", True),
    ("3.2.02", "Devoluções e descontos", "expense", "deducoes", "#dc2626", False),
    ("3.3.01", "Rendimentos de aplicações", "income", "receitas_financeiras", "#0ea5e9", False),
    ("3.9.01", "Outras receitas", "income", "outras_receitas", "#14b8a6", False),
    ("4.1.01", "Custo das mercadorias vendidas (CMV)", "expense", "custos", "#f97316", True),
    ("4.1.02", "Matéria-prima e insumos", "expense", "custos", "#fb923c", True),
    ("4.1.03", "Mão de obra direta e terceirizados", "expense", "custos", "#ea580c", True),
    ("4.1.04", "Frete e logística", "expense", "custos", "#c2410c", True),
    ("4.2.01", "Salários e encargos", "expense", "despesas_pessoal", "#7c3aed", True),
    ("4.2.02", "Pró-labore", "expense", "despesas_pessoal", "#6d28d9", True),
    ("4.2.03", "Benefícios (VR, VT, plano de saúde)", "expense", "despesas_pessoal", "#8b5cf6", True),
    ("4.3.01", "Aluguel e condomínio", "expense", "despesas_adm", "#2563eb", True),
    ("4.3.02", "Água, luz, internet e telefone", "expense", "despesas_adm", "#3b82f6", True),
    ("4.3.03", "Software e assinaturas", "expense", "despesas_adm", "#6366f1", False),
    ("4.3.04", "Contabilidade e jurídico", "expense", "despesas_adm", "#4f46e5", True),
    ("4.3.05", "Material de escritório e limpeza", "expense", "despesas_adm", "#60a5fa", False),
    ("4.3.06", "Manutenção e reparos", "expense", "despesas_adm", "#1d4ed8", False),
    ("4.3.07", "Viagens e deslocamento", "expense", "despesas_adm", "#93c5fd", False),
    ("4.4.01", "Marketing e publicidade", "expense", "despesas_comerciais", "#db2777", False),
    ("4.4.02", "Comissões de vendas", "expense", "despesas_comerciais", "#ec4899", False),
    ("4.4.03", "Taxas de maquininha e marketplace", "expense", "despesas_comerciais", "#f472b6", False),
    ("4.5.01", "Tarifas bancárias", "expense", "despesas_financeiras", "#64748b", False),
    ("4.5.02", "Juros, multas e IOF", "expense", "despesas_financeiras", "#475569", False),
    ("4.6.01", "IRPJ e CSLL", "expense", "impostos_lucro", "#991b1b", True),
    ("4.9.01", "Outras despesas", "expense", "outras_despesas", "#94a3b8", False),
    ("5.1.01", "Compra de equipamentos e móveis", "expense", "capex", "#0f766e", False),
    ("6.1.01", "Distribuição de lucros aos sócios", "expense", "distribuicao", "#a16207", False),
]


def apply_default(db: Session, user_id: int) -> int:
    """Cria as contas padrão que ainda não existem (pelo código); nunca apaga nem renomeia."""
    have = {c.code for c in db.query(Category).filter_by(user_id=user_id) if c.code}
    n = 0
    for code, name, kind, group, color, essential in DEFAULT_PJ:
        if code in have:
            continue
        db.add(Category(user_id=user_id, name=name, kind=kind, color=color, icon="tag", essential=essential,
                        code=code, dre_group=group))
        n += 1
    db.flush()
    return n


def _sum_by_group(txs, cats):
    out = defaultdict(float)
    for t in txs:
        if t.type not in ("income", "expense"):
            continue
        c = cats.get(t.category_id)
        g = c.dre_group if c and c.dre_group else ("outras_receitas" if t.type == "income" else "nao_classificado")
        # grupo de receita lançado como despesa (estorno) entra negativo, e vice-versa
        kind = GROUPS.get(g, ("", "expense"))[1] if g != "nao_classificado" else "expense"
        out[g] += t.amount if t.type == kind else -t.amount
    return out


def _statement(g):
    rb = g["receita_bruta"]
    rl = rb - g["deducoes"]
    lb = rl - g["custos"]
    desp = g["despesas_pessoal"] + g["despesas_adm"] + g["despesas_comerciais"]
    ro = lb - desp
    fin = g["receitas_financeiras"] - g["despesas_financeiras"]
    outras = g["outras_receitas"] - g["outras_despesas"] - g["nao_classificado"]
    lair = ro + fin + outras
    ll = lair - g["impostos_lucro"]
    pct = lambda v: round(v / rl * 100, 1) if rl else None
    lines = [
        ("receita_bruta", "Receita bruta", rb, 0), ("deducoes", "(−) Deduções", -g["deducoes"], 1),
        ("receita_liquida", "= Receita líquida", rl, 0), ("custos", "(−) Custos", -g["custos"], 1),
        ("lucro_bruto", "= Lucro bruto", lb, 0),
        ("despesas_pessoal", "(−) Despesas com pessoal", -g["despesas_pessoal"], 1),
        ("despesas_adm", "(−) Despesas administrativas", -g["despesas_adm"], 1),
        ("despesas_comerciais", "(−) Despesas comerciais", -g["despesas_comerciais"], 1),
        ("resultado_operacional", "= Resultado operacional", ro, 0),
        ("resultado_financeiro", "(±) Resultado financeiro", fin, 1),
        ("outras", "(±) Outras receitas e despesas", outras, 1),
        ("lair", "= Resultado antes do IR", lair, 0), ("impostos_lucro", "(−) IRPJ e CSLL", -g["impostos_lucro"], 1),
        ("lucro_liquido", "= Lucro líquido", ll, 0),
    ]
    return {"lines": [{"key": k, "label": l, "value": round(v, 2) + 0.0, "indent": i} for k, l, v, i in lines],  # + 0.0 tira o "-0"
            "margins": {"bruta": pct(lb), "operacional": pct(ro), "liquida": pct(ll)},
            "off_statement": {"capex": round(g["capex"], 2), "distribuicao": round(g["distribuicao"], 2)},
            "unclassified": round(g["nao_classificado"], 2)}


def dre(db: Session, user_id: int, year: int, month: int | None = None) -> dict:
    cats = {c.id: c for c in db.query(Category).filter_by(user_id=user_id)}
    if month:
        start, end = analytics.month_bounds(date(year, month, 1))
    else:
        start, end = date(year, 1, 1), date(year, 12, 31)
    txs = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.date >= start,
                                       Transaction.date <= end).all()
    total = _statement(defaultdict(float, _sum_by_group(txs, cats)))
    months = []
    if not month:
        for m in range(1, 13):
            s, e = analytics.month_bounds(date(year, m, 1))
            g = defaultdict(float, _sum_by_group([t for t in txs if s <= t.date <= e], cats))
            months.append({"month": f"{year}-{m:02d}", **{ln["key"]: ln["value"] for ln in _statement(g)["lines"]}})
    has_chart = any(c.dre_group for c in cats.values())
    return {"year": year, "month": month, "period": [start.isoformat(), end.isoformat()], **total,
            "months": months, "has_chart": has_chart}
