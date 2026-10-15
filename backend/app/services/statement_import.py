"""Leitura de extratos e faturas exportados pelo banco: CSV (vários layouts) e OFX/XML.

Devolve linhas normalizadas — sem tocar no banco de dados — pra que a rota possa tanto
mostrar uma prévia quanto gravar. Valor sempre no ponto de vista da conta: negativo = saiu
dinheiro (gasto), positivo = entrou (receita, estorno, pagamento da fatura)."""
import csv
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime


class StatementError(ValueError):
    """Arquivo que não deu pra entender — a mensagem vai direto pro usuário."""


@dataclass
class Row:
    date: date
    description: str
    amount: float           # negativo = gasto
    installment: str | None = None  # "3/10"
    fitid: str | None = None        # id único da transação no OFX


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="ignore")


def parse_amount(s: str) -> float:
    """'R$ -1.234,56', '1,234.56', '(45,90)', '45.90-' → float."""
    s = (s or "").replace("R$", "").replace("\xa0", "").replace(" ", "").strip()
    if not s:
        raise ValueError("vazio")
    neg = s.startswith("-") or s.endswith("-") or (s.startswith("(") and s.endswith(")"))
    s = s.strip("-+()")
    if "," in s and "." in s:
        dec = "," if s.rfind(",") > s.rfind(".") else "."
        s = s.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif "," in s:
        s = s.replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    v = float(s)
    return -v if neg else v


def parse_date(s: str) -> date:
    s = (s or "").strip()[:10]
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"data inválida: {s}")


# exige a palavra "parcela": um "05/10" solto no fim costuma ser data, não parcela
_PARC_IN_DESC = re.compile(r"\s*[-–(]?\s*(?:parcela|parc\.?)\s*(\d{1,2})\s*(?:/|de)\s*(\d{1,2})\s*\)?\s*$", re.I)
_PARC_COL = re.compile(r"(\d{1,2})\s*(?:/|de)\s*(\d{1,2})")


def split_installment(desc: str, col: str = "") -> tuple[str, str | None]:
    """Tira o "Parcela 3/10" do fim da descrição (assim as parcelas de meses diferentes se
    agrupam num plano só) e devolve ("Loja X", "3/10")."""
    m = _PARC_COL.search(col or "")
    inst = None
    if m and 1 <= int(m.group(1)) <= int(m.group(2)) and int(m.group(2)) > 1:
        inst = f"{int(m.group(1))}/{int(m.group(2))}"
    d = _PARC_IN_DESC.search(desc)
    if d and 1 <= int(d.group(1)) <= int(d.group(2)) and int(d.group(2)) > 1:
        inst = inst or f"{int(d.group(1))}/{int(d.group(2))}"
        desc = desc[:d.start()].rstrip(" -–")
    return desc.strip() or "Lançamento", inst


# ------------------------------------------------------------------ CSV
_DATE_KEYS = ("data", "date", "dt")
_DESC_KEYS = ("descricao", "description", "title", "titulo", "lancamento", "historico",
              "estabelecimento", "memo", "detalhe")


def _pick(headers: list[str], starts: tuple[str, ...]) -> str | None:
    for h in headers:
        if _norm(h).startswith(starts):
            return h
    return None


def _pick_amount(headers: list[str]) -> str | None:
    cands = [h for h in headers if _norm(h).startswith(("valor", "amount", "vlr"))]
    cands = [h for h in cands if not any(x in _norm(h) for x in ("us$", "usd", "dolar", "cotacao"))]
    brl = [h for h in cands if "r$" in _norm(h) or "brl" in _norm(h)]
    return (brl or cands or [None])[0]


def parse_csv(text: str) -> list[Row]:
    lines = text.splitlines()
    # alguns bancos põem título/saldo antes do cabeçalho: começa na 1ª linha que parece cabeçalho
    start = next((i for i, l in enumerate(lines[:40])
                  if any(k in _norm(l) for k in ("data", "date"))
                  and any(k in _norm(l) for k in ("valor", "amount"))), None)
    if start is None:
        raise StatementError("Não achei o cabeçalho do CSV. Ele precisa ter colunas de data, descrição e valor.")
    body = "\n".join(lines[start:])
    try:
        dialect = csv.Sniffer().sniff(body[:4000], delimiters=";,\t")
    except csv.Error:
        sep = ";" if lines[start].count(";") > lines[start].count(",") else ","
        dialect = type("Sep", (csv.excel,), {"delimiter": sep})
    reader = csv.DictReader(io.StringIO(body), dialect=dialect)
    headers = [h for h in (reader.fieldnames or []) if h]
    kd, ka = _pick(headers, _DATE_KEYS), _pick_amount(headers)
    kdesc = next((h for h in headers if _norm(h).startswith(_DESC_KEYS)), None)
    kparc = (next((h for h in headers if _norm(h).startswith("parcela")), None)
             or next((h for h in headers if _norm(h) == "tipo"), None))  # Inter: "Parcela 2 de 6"
    if not kd or not ka:
        raise StatementError("O CSV precisa ter as colunas de data e valor.")
    out = []
    for r in reader:
        try:
            d = parse_date(r.get(kd) or "")
            v = parse_amount(r.get(ka) or "")
        except (ValueError, TypeError):
            continue  # linha de total, saldo, rodapé…
        desc, inst = split_installment((r.get(kdesc) or "").strip() if kdesc else "", r.get(kparc) or "" if kparc else "")
        out.append(Row(d, desc[:255], v, inst))
    return out


# ------------------------------------------------------------------ OFX (1.x SGML e 2.x XML)
_OFX_TAG = re.compile(r"<(TRNAMT|DTPOSTED|FITID|MEMO|NAME|TRNTYPE)>\s*([^<\r\n]*)", re.I)


def parse_ofx(text: str) -> list[Row]:
    blocks = re.split(r"<STMTTRN>", text, flags=re.I)[1:]
    if not blocks:
        raise StatementError("Não encontrei transações no arquivo. Exporte a fatura em OFX ou CSV.")
    out = []
    for b in blocks:
        b = re.split(r"</STMTTRN>", b, flags=re.I)[0]
        f = {k.upper(): v.strip() for k, v in _OFX_TAG.findall(b)}
        try:
            d = datetime.strptime(f.get("DTPOSTED", "")[:8], "%Y%m%d").date()
            v = parse_amount(f.get("TRNAMT", ""))
        except ValueError:
            continue
        memo, name = f.get("MEMO", ""), f.get("NAME", "")
        desc = memo if len(memo) >= len(name) else name
        desc, inst = split_installment(desc)
        out.append(Row(d, desc[:255], v, inst, f.get("FITID") or None))
    return out


def parse(filename: str, raw: bytes) -> tuple[str, list[Row]]:
    """("ofx" | "csv", linhas). Detecta pelo conteúdo, não só pela extensão."""
    text = decode(raw)
    head = text[:3000].upper()
    if "<OFX" in head or "OFXHEADER" in head or "<STMTTRN>" in text.upper():
        return "ofx", parse_ofx(text)
    if (filename or "").lower().endswith((".xml", ".ofx")) or text.lstrip().startswith("<"):
        raise StatementError("Esse XML não está no padrão OFX. No app do banco, exporte a fatura como OFX ou CSV.")
    return "csv", parse_csv(text)
