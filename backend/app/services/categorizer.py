"""Categorização automática: regras do usuário > categoria da Pluggy > palavras-chave padrão."""
import re
import unicodedata
from sqlalchemy.orm import Session

from ..models import Category, CategoryRule

DEFAULT_CATEGORIES = [
    # nome, tipo, cor, ícone, essencial, palavras-chave
    ("Moradia", "expense", "#6366f1", "home", True, ["aluguel", "condominio", "iptu", "energia", "luz", "agua", "saneamento", "gas"]),
    ("Alimentação", "expense", "#f59e0b", "utensils", True, ["mercado", "supermercado", "atacadao", "assai", "carrefour", "padaria", "acougue", "hortifruti"]),
    ("Restaurantes e delivery", "expense", "#f97316", "pizza", False, ["ifood", "restaurante", "lanchonete", "burger", "pizza", "rappi", "bar "]),
    ("Transporte", "expense", "#0ea5e9", "car", True, ["uber", "99app", "99 ", "posto", "combustivel", "shell", "ipiranga", "estacionamento", "pedagio", "metro"]),
    ("Saúde", "expense", "#10b981", "heart", True, ["farmacia", "drogaria", "droga", "drogasil", "raia", "pague menos", "panvel", "hospital", "clinica", "laboratorio", "unimed", "amil", "odonto"]),
    ("Educação", "expense", "#8b5cf6", "book", True, ["escola", "faculdade", "curso", "udemy", "alura", "livraria"]),
    ("Assinaturas", "expense", "#ec4899", "repeat", False, ["netflix", "spotify", "disney", "prime video", "amazon prime", "youtube", "icloud", "google one", "hbo", "max.com", "chatgpt", "claude"]),
    ("Telefone e internet", "expense", "#14b8a6", "wifi", True, ["vivo", "claro", "tim ", "oi ", "internet", "net servicos"]),
    ("Compras", "expense", "#a855f7", "bag", False, ["amazon", "mercadolivre", "mercado livre", "shopee", "magalu", "americanas", "aliexpress", "shein"]),
    ("Lazer", "expense", "#eab308", "smile", False, ["cinema", "cinemark", "ingresso", "show", "viagem", "hotel", "airbnb", "booking", "latam", "gol ", "azul"]),
    ("Dívidas e juros", "expense", "#ef4444", "alert", True, ["juros", "iof", "multa", "encargo", "emprestimo", "financiamento", "tarifa"]),
    ("Impostos e taxas", "expense", "#64748b", "file", True, ["das ", "darf", "ipva", "licenciamento", "imposto"]),
    ("Casa e manutenção", "expense", "#0d9488", "tool", False, ["manutencao", "reforma", "reparo", "eletricista", "encanador", "chaveiro", "leroy merlin", "telhanorte", "marido de aluguel"]),
    ("Cuidados pessoais", "expense", "#f472b6", "sparkle", False, ["salao", "barbearia", "cabeleireiro", "estetica", "manicure", "academia", "smartfit", "bluefit"]),
    ("Pets", "expense", "#65a30d", "paw", False, ["petshop", "pet shop", "veterinari", "racao", "petz", "cobasi"]),
    ("Presentes e doações", "expense", "#d946ef", "gift", False, ["presente", "doacao", "vaquinha", "dizimo", "oferta religiosa"]),
    ("Seguros", "expense", "#475569", "shield", True, ["seguro", "porto seguro", "sulamerica seguros", "bradesco seguros", "azul seguros"]),
    ("Outros gastos", "expense", "#94a3b8", "dots", False, []),
    ("Salário", "income", "#22c55e", "wallet", False, ["salario", "folha", "pagamento de salario", "proventos"]),
    ("Renda extra", "income", "#84cc16", "trending", False, ["pix recebido", "transferencia recebida", "ted recebida"]),
    ("Rendimentos", "income", "#06b6d4", "chart", False, ["rendimento", "dividendo", "juros sobre capital", "jcp"]),
    ("Outras receitas", "income", "#a3e635", "dots", False, []),
]

# Mapeia categorias da Pluggy (em inglês) para as padrão
PLUGGY_MAP = {
    "groceries": "Alimentação", "supermarket": "Alimentação",
    "eating out": "Restaurantes e delivery", "food delivery": "Restaurantes e delivery", "restaurants": "Restaurantes e delivery",
    "transportation": "Transporte", "gas stations": "Transporte", "taxi and ride-hailing": "Transporte", "parking": "Transporte",
    "health": "Saúde", "pharmacy": "Saúde", "healthcare": "Saúde",
    "education": "Educação",
    "digital services": "Assinaturas", "video streaming": "Assinaturas", "music streaming": "Assinaturas",
    "telecommunications": "Telefone e internet", "internet": "Telefone e internet",
    "shopping": "Compras", "online shopping": "Compras", "electronics": "Compras", "clothing": "Compras",
    "leisure": "Lazer", "travel": "Lazer", "entertainment": "Lazer",
    "housing": "Moradia", "rent": "Moradia", "utilities": "Moradia", "electricity": "Moradia", "water": "Moradia",
    "taxes": "Impostos e taxas", "interests charged": "Dívidas e juros", "loans": "Dívidas e juros", "bank fees": "Dívidas e juros",
    "home maintenance": "Casa e manutenção", "repair and maintenance": "Casa e manutenção",
    "personal care": "Cuidados pessoais", "beauty": "Cuidados pessoais", "gym and fitness": "Cuidados pessoais",
    "pets": "Pets", "gifts and donations": "Presentes e doações", "charity": "Presentes e doações",
    "insurance": "Seguros",
    "salary": "Salário", "income": "Outras receitas", "investments": "Rendimentos",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " " + s.lower() + " "


def seed_categories(db: Session, user_id: int):
    for name, kind, color, icon, essential, _ in DEFAULT_CATEGORIES:
        db.add(Category(user_id=user_id, name=name, kind=kind, color=color, icon=icon, essential=essential))
    db.commit()


def categorize(db: Session, user_id: int, description: str, tx_type: str,
               pluggy_category: str | None = None) -> int | None:
    kind = "income" if tx_type == "income" else "expense"
    cats = {c.name: c for c in db.query(Category).filter_by(user_id=user_id).all()}
    text = norm(description)

    # 1) regras personalizadas do usuário
    rules = (db.query(CategoryRule).filter_by(user_id=user_id)
             .order_by(CategoryRule.priority.desc()).all())
    for r in rules:
        if norm(r.pattern).strip() in text:
            return r.category_id

    # 2) categoria vinda da Pluggy
    if pluggy_category:
        mapped = PLUGGY_MAP.get(pluggy_category.lower())
        if mapped and mapped in cats and cats[mapped].kind == kind:
            return cats[mapped].id

    # 3) palavras-chave padrão
    for name, k, *_rest, keywords in DEFAULT_CATEGORIES:
        if k != kind or name not in cats:
            continue
        if any(re.search(r"\b" + re.escape(norm(kw).strip()) + r"s?\b", text) for kw in keywords):
            return cats[name].id

    fallback = "Outras receitas" if kind == "income" else "Outros gastos"
    c = cats.get(fallback)
    return c.id if c else None
