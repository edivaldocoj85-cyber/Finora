"""Relatório executivo do mês (pra reunião de família ou diretoria): números, gráficos de
gasto, cartões, investimentos, saúde financeira e um resumo escrito.

Resumo: o relatório mais recente do Consultor (Claude) daquele mês, se existir; senão um
texto montado pelas regras a partir dos próprios números (nunca inventa valor).
Saídas: JSON (a tela imprime/salva em PDF pelo navegador) e planilha .xlsx."""
import io
import re
from datetime import date

from sqlalchemy.orm import Session

from ..models import AdvisorReport, CostCenter, Transaction
from . import analytics


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _rules_summary(d: dict, ym_label: str) -> str:
    m, h = d["month"], d.get("health") or {}
    res = m["income"] - m["expense"]
    parts = [f"Em {ym_label}, entraram {_brl(m['income'])} e saíram {_brl(m['expense'])}, "
             f"{'sobrando' if res >= 0 else 'faltando'} {_brl(abs(res))}."]
    if d["categories"]:
        top = d["categories"][0]
        parts.append(f"O maior gasto foi {top['name']} ({_brl(top['total'])}).")
    if h.get("score") is not None:
        bad = [k["label"].lower() for k in h["kpis"] if k["status"] == "bad"]
        parts.append(f"A nota de saúde financeira está em {h['score']}/100" + (f"; os pontos de atenção são {', '.join(bad)}." if bad else "."))
    for i in d.get("insights", [])[:2]:
        parts.append(i["message"])
    return " ".join(parts)


def monthly(db: Session, user_id: int, ym: str) -> dict:
    y, mo = map(int, ym.split("-"))
    start, end = analytics.month_bounds(date(y, mo, 1))
    ref = min(end, date.today())
    d = analytics.dashboard(db, user_id, ref)
    label = start.strftime("%m/%Y")
    txs = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.date >= start,
                                       Transaction.date <= end).order_by(Transaction.date).all()
    biggest = sorted([t for t in txs if t.type == "expense"], key=lambda t: -t.amount)[:10]
    centers = {c.id: c.name for c in db.query(CostCenter).filter_by(user_id=user_id)}
    by_cc: dict = {}
    for t in txs:
        if t.type == "expense":
            k = centers.get(t.cost_center_id, "Sem centro de custo")
            by_cc[k] = by_cc.get(k, 0) + t.amount

    ai = (db.query(AdvisorReport).filter(AdvisorReport.user_id == user_id)
          .order_by(AdvisorReport.created_at.desc()).first())
    ai_text = None
    if ai and ai.created_at and ai.created_at.strftime("%Y-%m") == ym:
        # primeiros parágrafos, sem marcação de título
        plain = re.sub(r"^#+\s*", "", ai.content, flags=re.M)
        ai_text = "\n".join(plain.strip().splitlines()[:12])

    port = None
    try:
        from . import portfolio
        p = portfolio.build(db, user_id, ref)
        if p["value"] or p["cost"]:
            port = {k: p[k] for k in ("value", "cost", "gain", "gain_pct", "income", "mwrr_annual", "allocation", "benchmarks")}
    except Exception:
        port = None

    return {
        "month": ym, "label": label, "generated_at": date.today().isoformat(),
        "income": d["month"]["income"], "expense": d["month"]["expense"],
        "result": round(d["month"]["income"] - d["month"]["expense"], 2),
        "net_worth": d["net_worth"], "cash": d["cash"], "investments": d["investments"], "card_debt": d["card_debt"],
        "savings_rate": d.get("savings_rate"), "health": d.get("health"), "insights": d.get("insights", []),
        "categories": [{"name": c["name"], "total": c["total"], "budget": c["budget"], "prev": c["prev"]} for c in d["categories"]],
        "cost_centers": sorted([{"name": k, "total": round(v, 2)} for k, v in by_cc.items()], key=lambda x: -x["total"]),
        "biggest": [{"date": t.date.isoformat(), "description": t.description, "amount": t.amount,
                     "category": t.category.name if t.category else ""} for t in biggest],
        "cards": [{"name": c["name"], "total": c["total"], "due_date": c["due_date"]} for c in d["cards"]],
        "goals": d.get("goals", []), "months": d.get("months", []), "portfolio": port,
        "summary": ai_text or _rules_summary(d, label), "summary_source": "consultor" if ai_text else "regras",
        "_txs": txs,
    }


def xlsx(rep: dict) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="2340D8")
    money = '"R$" #,##0.00'

    def table(ws, headers, rows, money_cols=()):
        ws.append(headers)
        for c in ws[ws.max_row]:
            c.font, c.fill = head, fill
        for r in rows:
            ws.append(r)
            for idx in money_cols:
                ws.cell(row=ws.max_row, column=idx).number_format = money
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = max(12, min(48, max(len(str(c.value or "")) for c in col) + 2))

    ws = wb.active
    ws.title = "Resumo"
    ws.append([f"Finora · relatório de {rep['label']}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    for k, v in (("Receitas", rep["income"]), ("Despesas", rep["expense"]), ("Resultado", rep["result"]),
                 ("Patrimônio líquido", rep["net_worth"]), ("Saldo nas contas", rep["cash"]),
                 ("Investimentos", rep["investments"]), ("Dívida em cartões", rep["card_debt"])):
        ws.append([k, v])
        ws.cell(row=ws.max_row, column=2).number_format = money
    if rep.get("health") and rep["health"].get("score") is not None:
        ws.append(["Saúde financeira", f"{rep['health']['score']}/100"])
    ws.append([])
    ws.append(["Resumo"])
    ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    ws.append([rep["summary"]])
    ws.cell(row=ws.max_row, column=1).alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=ws.max_row, start_column=1, end_row=ws.max_row, end_column=4)
    ws.row_dimensions[ws.max_row].height = 120
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 20

    table(wb.create_sheet("Categorias"), ["Categoria", "Gasto no mês", "Orçamento", "Mês anterior"],
          [[c["name"], c["total"], c["budget"] or None, c["prev"]] for c in rep["categories"]], (2, 3, 4))
    table(wb.create_sheet("Centros de custo"), ["Centro de custo", "Gasto"], [[c["name"], c["total"]] for c in rep["cost_centers"]], (2,))
    table(wb.create_sheet("Lançamentos"), ["Data", "Descrição", "Tipo", "Valor", "Categoria", "Conta", "Parcela"],
          [[t.date, t.description, {"expense": "Despesa", "income": "Receita", "transfer": "Transferência"}.get(t.type, t.type),
            t.amount, t.category.name if t.category else "", t.account.name if t.account else "", t.installment or ""]
           for t in rep["_txs"]], (4,))
    for row in wb["Lançamentos"].iter_rows(min_row=2, max_col=1):
        row[0].number_format = "dd/mm/yyyy"
    if rep.get("portfolio"):
        p = rep["portfolio"]
        table(wb.create_sheet("Investimentos"), ["Classe", "Valor", "% da carteira"],
              [[a["label"], a["value"], a["pct"] / 100] for a in p["allocation"]], (2,))
        for row in wb["Investimentos"].iter_rows(min_row=2, min_col=3, max_col=3):
            row[0].number_format = "0.0%"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
