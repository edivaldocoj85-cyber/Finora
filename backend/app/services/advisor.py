"""Consultor financeiro: combina o panorama do usuário, indicadores de mercado e
pesquisa na web (ferramenta web_search da API do Claude) para gerar orientações."""
import json
from datetime import date

import httpx

from ..config import get_settings
from . import market

SYSTEM = """Você é o consultor financeiro do app Finora, para pessoas físicas no Brasil.
Escreva em português do Brasil, em tom claro, acolhedor e direto, usando Markdown.
Regras:
- Baseie-se SOMENTE nos dados do usuário fornecidos e em pesquisas atuais da web.
- Antes de falar de investimentos, pesquise a situação atual do mercado brasileiro
  (Selic, inflação, perspectivas do Copom, renda fixa, bolsa) e cite as fontes com links.
- Organize em: 1) Diagnóstico  2) Alertas  3) Onde economizar (valores estimados em R$)
  4) Plano para o mês  5) Como multiplicar a renda (reserva de emergência primeiro,
  depois renda fixa, diversificação e fontes de renda extra compatíveis com o perfil)
  6) Fontes.
- Priorize: quitar dívidas caras > reserva de emergência (6 meses de custo) > investir.
- Não recomende ativos específicos como garantia de retorno; apresente opções e riscos.
- Termine lembrando que isto é educativo e não substitui um profissional certificado (CFP/CEA).
"""


def _snapshot_text(dash: dict) -> str:
    slim = {k: dash[k] for k in ("net_worth", "cash", "investments", "card_debt", "month", "months",
                                  "expected_income", "fixed_costs", "projected_expense",
                                  "savings_rate", "cards", "upcoming", "goals")}
    slim["categories"] = [{k: c[k] for k in ("name", "total", "prev", "budget", "essential")}
                          for c in dash["categories"]]
    return json.dumps(slim, ensure_ascii=False)


def fallback_report(dash: dict, ind: dict) -> str:
    """Relatório por regras quando não há chave de IA configurada."""
    brl = lambda v: f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    lines = ["## Diagnóstico"]
    inc = dash["expected_income"] or dash["month"]["income"]
    lines.append(f"- Renda esperada: **{brl(inc)}** · Gasto projetado: **{brl(dash['projected_expense'])}**")
    if dash["savings_rate"] is not None:
        lines.append(f"- Taxa de poupança projetada: **{dash['savings_rate']}%** (meta saudável: 20% ou mais)")
    lines.append("\n## Onde economizar")
    nonessential = [c for c in dash["categories"] if not c["essential"]][:4]
    for c in nonessential:
        lines.append(f"- **{c['name']}**: {brl(c['total'])} no mês. Cortar 20% economiza {brl(c['total'] * 0.2)}.")
    if not nonessential:
        lines.append("- Lance ou sincronize seus gastos para receber sugestões.")
    reserve = (dash["fixed_costs"] or dash["projected_expense"]) * 6
    lines.append("\n## Como multiplicar a renda")
    lines.append(f"- Reserva de emergência sugerida (6 meses): **{brl(reserve)}** em aplicação de liquidez diária.")
    if dash["card_debt"] > 0:
        lines.append("- Pague a fatura do cartão integralmente: os juros do rotativo superam qualquer investimento.")
    if ind.get("selic"):
        lines.append(f"- Selic atual: {ind['selic']['value']}% a.a. Com juro real de {ind.get('real_rate', '?')}%, "
                     "a renda fixa pós-fixada (CDB/Tesouro Selic) tende a ser competitiva para a reserva.")
    lines.append("\n> Configure `ANTHROPIC_API_KEY` para análises personalizadas com pesquisa de mercado em tempo real.")
    lines.append("\n*Conteúdo educativo; não substitui orientação de um profissional certificado.*")
    return "\n".join(lines)


def generate(dash: dict, question: str | None = None) -> str:
    s = get_settings()
    ind = market.indicators()
    if not s.anthropic_api_key:
        return fallback_report(dash, ind)
    user_msg = (f"Data de hoje: {date.today().isoformat()}\n"
                f"Indicadores coletados: {json.dumps(ind, ensure_ascii=False)}\n"
                f"Panorama financeiro do usuário (R$): {_snapshot_text(dash)}\n\n")
    user_msg += (f"Pergunta do usuário: {question}" if question
                 else "Gere o relatório mensal completo com orientações.")
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json={"model": s.anthropic_model, "max_tokens": 4000, "system": SYSTEM,
              "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5,
                         "user_location": {"type": "approximate", "country": "BR"}}],
              "messages": [{"role": "user", "content": user_msg}]},
        timeout=180,
    )
    if r.status_code >= 400:
        return fallback_report(dash, ind) + f"\n\n_(IA indisponível: {r.status_code})_"
    blocks = r.json().get("content", [])
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
