"""Conciliação bancária: confere o extrato do banco (OFX/CSV) com os lançamentos do Finora
numa conta corrente/poupança.

Cada linha do extrato vira um de três estados:
  conciliado  — já existe no Finora (mesmo id do arquivo, ou mesmo valor com até 3 dias de
                diferença, de preferência com descrição parecida); ganha a marca de conciliado;
  novo        — está no banco e não no Finora (esqueceu de lançar) → entra ao aplicar;
E o contrário:
  só no Finora — lançamento no período do extrato que o banco não mostra (duplicado,
                 agendado que não aconteceu ou valor errado) → a pessoa decide.
Saldo: o saldo final informado no OFX é comparado com o saldo da conta no Finora."""
import hashlib
from datetime import timedelta

from sqlalchemy.orm import Session

from ..models import Account, Transaction
from . import statement_import


def _sim(a: str, b: str) -> float:
    wa = set(statement_import._norm(a).split())
    wb = set(statement_import._norm(b).split())
    return len(wa & wb) / max(len(wa | wb), 1)


def run(db: Session, uid: int, acc: Account, filename: str, raw: bytes) -> dict:
    fmt, rows = statement_import.parse(filename, raw)
    if not rows:
        raise statement_import.StatementError("Nenhuma transação encontrada no arquivo.")
    start, end = min(r.date for r in rows), max(r.date for r in rows)
    pool = db.query(Transaction).filter(
        Transaction.user_id == uid, Transaction.date >= start - timedelta(days=3), Transaction.date <= end + timedelta(days=3),
        (Transaction.account_id == acc.id) | (Transaction.to_account_id == acc.id)).all()

    def signed(t):  # efeito na conta, do ponto de vista dela
        if t.type == "income":
            return t.amount
        if t.type == "expense":
            return -t.amount
        return t.amount if t.to_account_id == acc.id else -t.amount

    used, items, seen = set(), [], {}
    for r in rows:
        if r.fitid:
            ext = "ofx-" + hashlib.sha1(f"{acc.id}{r.fitid}".encode()).hexdigest()[:20]
        else:
            base = f"{acc.id}{r.date}{r.description}{r.amount}"
            seen[base] = seen.get(base, 0) + 1
            ext = "csv-" + hashlib.sha1((base if seen[base] == 1 else f"{base}#{seen[base]}").encode()).hexdigest()[:20]
        match = next((t for t in pool if t.external_id == ext and t.id not in used), None)
        if not match:
            cands = [t for t in pool if t.id not in used and abs(signed(t) - r.amount) < 0.005
                     and abs((t.date - r.date).days) <= 3]
            cands.sort(key=lambda t: (abs((t.date - r.date).days), -_sim(t.description, r.description)))
            match = cands[0] if cands else None
        if match:
            used.add(match.id)
        items.append({"date": r.date.isoformat(), "description": r.description, "amount": round(r.amount, 2),
                      "status": "matched" if match else "new", "_ext": ext, "_tx": match,
                      "tx_id": match.id if match else None,
                      "tx_description": match.description if match else None,
                      "already": bool(match and match.reconciled_at)})
    only_finora = [t for t in pool if t.id not in used and start <= t.date <= end]
    bank_balance = statement_import.statement_balance(raw) if fmt == "ofx" else None
    return {
        "format": fmt, "period": [start.isoformat(), end.isoformat()], "items": items,
        "matched": sum(i["status"] == "matched" for i in items), "new": sum(i["status"] == "new" for i in items),
        "only_finora": [{"id": t.id, "date": t.date.isoformat(), "description": t.description, "amount": round(signed(t), 2)}
                        for t in sorted(only_finora, key=lambda t: t.date)],
        "bank_balance": round(bank_balance, 2) if bank_balance is not None else None,
        "finora_balance": round(acc.balance, 2),
        "difference": round(bank_balance - acc.balance, 2) if bank_balance is not None else None,
    }
