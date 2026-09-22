"""Assistente de uso do Finora: responde "como faço X" e propõe ações (lançar gasto,
criar meta, navegar) a partir de texto livre — sem custo, por regras e busca na base de
ajuda; se ANTHROPIC_API_KEY estiver configurada, perguntas que a base não cobre caem para
o Claude (com pesquisa na web), no mesmo padrão do Consultor financeiro.

O assistente NUNCA grava nada sozinho: toda ação retornada é um rascunho (`action`) que o
frontend só executa depois que a pessoa confirma, chamando o endpoint normal (POST
/transactions, /goals etc.) — nenhuma lógica de negócio é duplicada aqui.
"""
import calendar
import re
import unicodedata
from datetime import date

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Account, Category, Contract, Transaction, User
from .categorizer import categorize


def _norm(s: str) -> str:
    """Minúsculo e sem acento, sem padding — pra casar radical em qualquer posição
    (ex.: "import" dentro de "importar", "importo", "importação")."""
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()

# palavras-chave em radical (sem acento, sem terminação verbal): "norm()" tira acentos dos
# dois lados na hora de comparar, e o radical casa com qualquer conjugação (importar,
# importo, importação, importando...) em vez de exigir a palavra exata.
HELP_TOPICS = [
    {"kw": ["import", "csv", "extrato manual", "planilha"],
     "a": "Vá em **Lançamentos → Importar CSV**, escolha a conta de destino e envie um arquivo com colunas "
          "`data;descricao;valor` (valores negativos são gastos). Você pode configurar um lembrete "
          "diário, semanal ou mensal pra não esquecer de importar — isso fica na edição da conta."},
    {"kw": ["conect", "open finance", "pluggy", "sincroniz", "banco automatic"],
     "a": "Vá em **Conexões bancárias** e clique em \"Conectar banco\". Isso usa Open Finance (Pluggy) — "
          "precisa de uma chave configurada no servidor (`PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`, "
          "veja em dashboard.pluggy.ai). Sem isso, a importação de CSV funciona igual, sem custo."},
    {"kw": ["categoria", "regra", "recategor"],
     "a": "Em **Categorias e regras** você cria categorias novas e regras: se a descrição do lançamento "
          "contém um texto, ele cai automaticamente numa categoria. Isso vale tanto pra importação quanto "
          "pra sincronização bancária."},
    {"kw": ["parcel", "fatura"],
     "a": "Ao lançar uma compra no cartão, informe o número de parcelas — o Finora já cria todas as "
          "parcelas futuras automaticamente. Em **Cartões** você vê a fatura de cada cartão e a seção "
          "\"Parcelamentos em aberto\" com quanto falta pagar de cada compra."},
    {"kw": ["contrat", "conta fixa", "aluguel", "financiamento"],
     "a": "Em **Contratos e fixas**, cadastre nome, valor e dia de vencimento. Se você indicar a conta de "
          "pagamento, quando a conta vencer aparece um botão \"Marcar pago\" no painel — lança o "
          "pagamento com um clique, depois de você confirmar valor e data."},
    {"kw": ["meta", "objetivo", "guardar dinheiro"],
     "a": "Em **Metas**, defina nome, valor alvo e (opcional) um prazo — o Finora calcula quanto você "
          "precisa guardar por mês pra chegar lá."},
    {"kw": ["orcament", "limite de gasto"],
     "a": "Em **Categorias e regras**, edite a categoria e informe o \"Orçamento mensal\". O painel avisa "
          "quando você chega em 80% e quando estoura."},
    {"kw": ["alerta", "aviso", "notific"],
     "a": "Orçamento estourado ou perto de estourar, gasto muito acima do normal numa categoria, fatura de "
          "cartão perto do limite, conta a vencer, saldo negativo, assinaturas pesando muito na renda, e "
          "lembrete de importar extrato — tudo aparece no sino 🔔 no topo."},
    {"kw": ["consultor", "conselho", "invest", "reserva de emergencia"],
     "a": "Em **Consultor**, você pode gerar um relatório do mês ou perguntar algo específico. Em "
          "**Mercado**, a \"Trilha de investimentos\" te mostra onde focar (quitar dívida cara → reserva "
          "de emergência → diversificar) com base nos seus números reais."},
    {"kw": ["google"],
     "a": "Na tela de login, se o botão \"Entrar com Google\" aparecer, é só clicar. Se não aparecer, o "
          "administrador ainda não configurou o login com Google neste servidor."},
    {"kw": ["tema", "escur", "modo claro", "modo noturno", "aparenc"],
     "a": "Clique no ícone de sol/lua/monitor no topo (ou vá em **Configurações → Aparência**) para "
          "alternar entre Claro, Escuro e Automático (segue o sistema)."},
    {"kw": ["export", "baixar lancamento", "planilha de saida"],
     "a": "Em **Lançamentos**, clique em \"Exportar\" — baixa um CSV com tudo do período filtrado."},
    {"kw": ["exclu", "apagar conta", "lgpd", "delet"],
     "a": "Em **Configurações → Excluir minha conta**. Isso remove todos os seus dados e revoga conexões "
          "bancárias — não tem volta, por isso pede confirmação digitada."},
    {"kw": ["filtr", "periodo customizado"],
     "a": "Em **Lançamentos**, além do mês no topo, dá pra usar \"De/Até\" pra um período customizado, e "
          "\"Valor mín/máx\" pra faixa de valor — junto com busca por texto, conta, categoria e tipo."},
    {"kw": ["transfer"],
     "a": "Ao criar um lançamento, escolha o tipo \"Transferência\" e informe a conta de destino — o "
          "Finora debita a conta de origem e credita a de destino automaticamente."},
]

_MONEY_RE = r"(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d+\.\d{1,2}|\d+)"
_EXPENSE_VERBS = r"gastei|paguei|comprei|lancar?|lan[çc]ar?|registrar?|anotar?"
_INCOME_VERBS = r"recebi|ganhei|entrou"


def _to_float(s: str) -> float:
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?", s):
        s = s.replace(".", "").replace(",", ".")  # 1.500 / 1.234,56 -> milhar
    elif "," in s:
        s = s.replace(",", ".")  # 50,00 -> decimal
    return float(s)


def _best_account(db: Session, user_id: int, text: str) -> Account | None:
    accounts = db.query(Account).filter_by(user_id=user_id, archived=False).all()
    text_n = _norm(text)
    for a in accounts:
        if _norm(a.name) in text_n:
            return a
    non_card = [a for a in accounts if a.kind != "credit_card"]
    return (non_card or accounts or [None])[0]


def _parse_transaction(db: Session, user: User, message: str) -> dict | None:
    m = re.search(rf"(?:{_EXPENSE_VERBS}|{_INCOME_VERBS}).{{0,40}}?{_MONEY_RE}", message, re.IGNORECASE)
    if not m:
        m = re.search(rf"{_MONEY_RE}.{{0,10}}(?:reais|r\$)", message, re.IGNORECASE)
        if not m:
            return None
    try:
        amount = _to_float(m.group(1))
    except ValueError:
        return None
    if amount <= 0:
        return None
    is_income = bool(re.search(_INCOME_VERBS, message, re.IGNORECASE))
    tx_type = "income" if is_income else "expense"

    desc_match = re.search(r"(?:em|com|de|no|na|para)\s+([a-zà-ú0-9 ]{3,40})", message[m.end():], re.IGNORECASE)
    description = (desc_match.group(1).strip() if desc_match else message[:60]).strip(" .,")
    description = description[:1].upper() + description[1:] if description else "Lançamento"

    acc = _best_account(db, user.workspace_id, message)
    if not acc:
        return None
    cat_id = categorize(db, user.workspace_id, description, tx_type)
    cat = db.get(Category, cat_id) if cat_id else None

    return {
        "kind": "create_transaction",
        "confirm_label": f"Lançar {'receita' if is_income else 'despesa'} de {_brl(amount)}",
        "method": "POST", "path": "/transactions",
        "body": {"account_id": acc.id, "category_id": cat_id, "date": date.today().isoformat(),
                 "description": description, "amount": amount, "type": tx_type},
        "summary": f"{description} · {acc.name}" + (f" · {cat.name}" if cat else ""),
    }


def _parse_goal(db: Session, user: User, message: str) -> dict | None:
    if not re.search(r"\bmeta\b", message, re.IGNORECASE):
        return None
    m = re.search(_MONEY_RE, message)
    if not m:
        return None
    try:
        amount = _to_float(m.group(1))
    except ValueError:
        return None
    name_match = re.search(r"meta\s+(?:de|para|pra)?\s*([a-zà-ú0-9 ]{3,40})", message, re.IGNORECASE)
    name = (name_match.group(1).strip() if name_match else "Minha meta")
    name = re.sub(r"\bde\s+r?\$?\s*[\d.,]+\b", "", name, flags=re.IGNORECASE).strip(" .,") or "Minha meta"
    return {
        "kind": "create_goal",
        "confirm_label": f"Criar meta \"{name}\" de {_brl(amount)}",
        "method": "POST", "path": "/goals",
        "body": {"name": name.capitalize(), "target_amount": amount},
        "summary": None,
    }


_ROUTES = {
    "painel": "dashboard", "dashboard": "dashboard", "lancamentos": "transactions",
    "cartoes": "cards", "contas": "accounts", "contratos": "contracts",
    "renda": "incomes", "categorias": "categories", "metas": "goals", "consultor": "advisor",
    "mercado": "market", "conexoes": "bank", "banco": "bank", "configuracoes": "settings",
}


def _parse_navigation(message: str) -> dict | None:
    if not re.search(r"\b(abrir?|ir para|ir pra|me lev[ae]|mostrar?|ver)\b", message, re.IGNORECASE):
        return None
    text = _norm(message)
    for name, route in _ROUTES.items():
        if name in text:
            return {"kind": "navigate", "route": route}
    return None


_FORM_LABELS = {"transaction": "lançamento", "account": "conta/cartão", "contract": "contrato",
                "goal": "meta", "income": "fonte de renda"}
_FORM_INTENTS = [
    (r"\b(lanc|registr|anot)\w* .*(despesa|gasto)\b", "transaction", {"type": "expense"}),
    (r"\b(lanc|registr|anot)\w* .*(receita|entrada)\b", "transaction", {"type": "income"}),
    (r"\b(lanc|registr)\w* .*(transfer)", "transaction", {"type": "transfer"}),
    (r"\b(nov[ao]|cadastr|cri)\w* .*(cart[a-z]o|conta banc|conta corrente|poupanca)\b", "account", {}),
    (r"\b(nov[ao]|cadastr|cri)\w* .*(contrato|conta fixa|assinatura fixa)\b", "contract", {}),
    (r"\b(nov[ao]|cadastr|cri)\w* .*(meta|objetivo)\b", "goal", {}),
    (r"\b(nov[ao]|cadastr|cri)\w* .*(renda|salario)\b", "income", {}),
]


def _last_used_account_id(db: Session, user_id: int) -> int | None:
    t = (db.query(Transaction).filter_by(user_id=user_id).order_by(Transaction.created_at.desc()).first())
    return t.account_id if t else None


def _parse_form_intent(db: Session, user: User, message: str) -> dict | None:
    """Quando dá pra saber O QUE a pessoa quer fazer mas falta informação essencial (valor,
    nome), a saída é abrir a tela certa já com o que puder ser preenchido sozinho — nunca
    travar num "não entendi" quando a intenção estava clara."""
    text = _norm(message)
    for pattern, form, defaults in _FORM_INTENTS:
        if not re.search(pattern, text):
            continue
        values = dict(defaults)
        if form == "transaction":
            acc_id = _last_used_account_id(db, user.workspace_id)
            if acc_id:
                values["account_id"] = acc_id
        return {"kind": "open_form", "form": form, "values": values,
                "confirm_label": f"Abrir formulário de {_FORM_LABELS[form]}"}
    return None


def _search_help(message: str) -> dict | None:
    text = _norm(message)
    best, score = None, 0
    for topic in HELP_TOPICS:
        hits = sum(1 for kw in topic["kw"] if _norm(kw) in text)
        if hits > score:
            best, score = topic, hits
    return best


SYSTEM = """Você é o assistente de uso do app Finora (controle financeiro pessoal, Brasil).
Responda em português do Brasil, curto e direto (no máximo 4-5 linhas), explicando como usar
uma função do próprio Finora ou tirando dúvida financeira geral. Se a pergunta pedir pesquisa
atual (índices, notícias), use a busca na web. Nunca invente telas ou botões que não existem
no produto. Se não tiver certeza de que a função existe no Finora, diga isso."""


def _ai_answer(question: str) -> str | None:
    s = get_settings()
    if not s.anthropic_api_key:
        return None
    try:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": s.anthropic_model, "max_tokens": 600, "system": SYSTEM,
                  "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3,
                             "user_location": {"type": "approximate", "country": "BR"}}],
                  "messages": [{"role": "user", "content": question}]},
            timeout=60,
        )
        if r.status_code >= 400:
            return None
        blocks = r.json().get("content", [])
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
        return text or None
    except httpx.HTTPError:
        return None


def _brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _month_bounds(ref: date) -> tuple[date, date]:
    return ref.replace(day=1), ref.replace(day=calendar.monthrange(ref.year, ref.month)[1])


def _parse_balance_query(db: Session, user: User, message: str) -> dict | None:
    if not re.search(r"\b(saldo|quanto (eu )?tenho|meu dinheiro)\b", message, re.IGNORECASE):
        return None
    accounts = db.query(Account).filter_by(user_id=user.workspace_id, archived=False).all()
    cash = sum(a.balance for a in accounts if a.kind in ("checking", "savings", "cash"))
    invest = sum(a.balance for a in accounts if a.kind == "investment")
    if not accounts:
        return {"reply": "Você ainda não cadastrou nenhuma conta — vá em Contas pra começar."}
    lines = [f"{a.name}: {_brl(a.balance)}" for a in accounts if a.kind != "credit_card"]
    reply = "Seu saldo agora — " + "; ".join(lines) + f". Total em contas: {_brl(cash)}"
    if invest:
        reply += f", mais {_brl(invest)} em investimentos"
    return {"reply": reply + "."}


def _parse_spending_query(db: Session, user: User, message: str) -> dict | None:
    if not re.search(r"quanto (eu )?(gastei|recebi)", message, re.IGNORECASE):
        return None
    tx_type = "income" if "recebi" in message.lower() else "expense"
    start, end = _month_bounds(date.today())
    text_n = _norm(message)
    cat_match = None
    for c in db.query(Category).filter_by(user_id=user.workspace_id, kind=tx_type):
        if _norm(c.name) in text_n:
            cat_match = c
            break
    q = db.query(func.sum(Transaction.amount)).filter(
        Transaction.user_id == user.workspace_id, Transaction.type == tx_type,
        Transaction.date >= start, Transaction.date <= end)
    if cat_match:
        q = q.filter(Transaction.category_id == cat_match.id)
    total = q.scalar() or 0
    verbo = "recebeu" if tx_type == "income" else "gastou"
    onde = f" em {cat_match.name}" if cat_match else ""
    return {"reply": f"Este mês você {verbo} {_brl(total)}{onde} até agora."}


def nudges(db: Session, user: User) -> list[dict]:
    """O que o assistente lembraria sozinho, sem precisar ser perguntado: hoje, o principal
    é conta fixa vencendo — junto já vem a ação de marcar como pago com um clique."""
    out = []
    today = date.today()
    for c in db.query(Contract).filter_by(user_id=user.workspace_id, active=True):
        if c.due_day != today.day or (c.end_date and c.end_date < today):
            continue
        paid_today = db.query(Transaction).filter(
            Transaction.user_id == user.workspace_id, Transaction.account_id == c.account_id,
            Transaction.date == today, Transaction.description == c.name,
            Transaction.external_id.like("contract-%")).first()
        if paid_today:
            continue
        reply = f"📌 **{c.name}** vence hoje ({_brl(c.amount)})."
        action = None
        if c.account_id:
            reply += " Quer que eu já lance o pagamento? Depois é só anexar o comprovante pra dar baixa."
            action = {"kind": "confirm_contract", "confirm_label": f"Marcar {c.name} como pago",
                      "method": "POST", "path": f"/contracts/{c.id}/confirm-payment",
                      "body": {"date": today.isoformat(), "amount": c.amount}}
        else:
            reply += " Defina uma conta de pagamento no contrato pra eu poder lançar isso com um clique."
        out.append({"reply": reply, "action": action} if action else {"reply": reply})
    return out


def answer(db: Session, user: User, message: str) -> dict:
    message = (message or "").strip()
    if not message:
        return {"reply": "Pode perguntar! Ex.: \"gastei 50 no mercado\", \"criar meta viagem de 3000\", "
                          "\"como importo meu extrato\"."}

    for query in (_parse_balance_query, _parse_spending_query):
        result = query(db, user, message)
        if result:
            return result

    for parser in (_parse_transaction, _parse_goal):
        draft = parser(db, user, message)
        if draft:
            reply = f"Entendi — {draft['confirm_label'].lower()}"
            if draft.get("summary"):
                reply += f" ({draft['summary']})"
            reply += ". Confirma?"
            return {"reply": reply, "action": {k: v for k, v in draft.items() if k != "summary"}}

    nav = _parse_navigation(message)
    if nav:
        return {"reply": "Pode deixar, te levo pra lá.", "action": nav}

    form_intent = _parse_form_intent(db, user, message)
    if form_intent:
        extra = ""
        if form_intent["values"].get("account_id"):
            acc = db.get(Account, form_intent["values"]["account_id"])
            if acc:
                extra = f" Já deixei a conta \"{acc.name}\" pré-selecionada (a que você mais usou), pode trocar."
        return {"reply": f"Vou abrir o formulário de {_FORM_LABELS[form_intent['form']]} pra você completar." + extra,
                "action": {k: v for k, v in form_intent.items() if k != "confirm_label"}}

    topic = _search_help(message)
    ai = None
    if not topic or len(message) > 60:
        ai = _ai_answer(message)
    if ai:
        return {"reply": ai}
    if topic:
        return {"reply": topic["a"]}
    return {"reply": "Não entendi certinho. Você pode perguntar coisas como \"como importo meu extrato\", "
                     "\"gastei 30 no uber\", \"criar meta reserva de 5000\" ou \"abrir metas\"."}
