"""Integração com a API da Pluggy (Open Finance).

Documentação: https://docs.pluggy.ai
Fluxo:
 1. Backend gera um connect token (POST /connect_token) e o frontend abre o Pluggy Connect.
 2. O usuário autoriza o banco; o widget devolve o itemId.
 3. Backend sincroniza contas (GET /accounts) e transações (GET /transactions).
 4. Webhooks (item/updated, transactions/created) disparam novas sincronizações.
"""
import time
from datetime import date, datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Account, PluggyItem, Transaction
from .categorizer import categorize

_cache = {"key": None, "exp": 0.0}


class PluggyError(RuntimeError):
    pass


def enabled() -> bool:
    s = get_settings()
    return bool(s.pluggy_client_id and s.pluggy_client_secret)


def _api_key() -> str:
    if _cache["key"] and _cache["exp"] > time.time():
        return _cache["key"]
    s = get_settings()
    if not enabled():
        raise PluggyError("Pluggy não configurada (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET).")
    r = httpx.post(f"{s.pluggy_base_url}/auth",
                   json={"clientId": s.pluggy_client_id, "clientSecret": s.pluggy_client_secret}, timeout=20)
    if r.status_code >= 400:
        raise PluggyError(f"Falha ao autenticar na Pluggy: {r.text[:200]}")
    _cache["key"] = r.json()["apiKey"]
    _cache["exp"] = time.time() + 60 * 90  # a chave vale 2h; renova antes
    return _cache["key"]


def _req(method: str, path: str, **kw):
    s = get_settings()
    r = httpx.request(method, f"{s.pluggy_base_url}{path}",
                      headers={"X-API-KEY": _api_key()}, timeout=30, **kw)
    if r.status_code >= 400:
        raise PluggyError(f"Pluggy {path}: {r.status_code} {r.text[:200]}")
    return r.json() if r.content else {}


def connect_token(user_id: int, item_id: str | None = None) -> str:
    s = get_settings()
    body = {"clientUserId": str(user_id)}
    if item_id:
        body["itemId"] = item_id  # atualizar/reconectar item existente
    if s.public_url.startswith("https://"):
        url = f"{s.public_url}/api/pluggy/webhook"
        if s.pluggy_webhook_secret:
            url += f"?secret={s.pluggy_webhook_secret}"
        body["webhookUrl"] = url
    return _req("POST", "/connect_token", json=body)["accessToken"]


def _paged(path: str, params: dict):
    page = 1
    while True:
        data = _req("GET", path, params={**params, "page": page, "pageSize": 500})
        yield from data.get("results", [])
        if page >= data.get("totalPages", 1):
            break
        page += 1


KIND_MAP = {"BANK": "checking", "CREDIT": "credit_card", "INVESTMENT": "investment", "LOAN": "checking"}


def sync_item(db: Session, user_id: int, item_id: str, days: int = 90) -> dict:
    if db.query(PluggyItem.id).filter(PluggyItem.item_id == item_id,
                                      PluggyItem.user_id != user_id).first():
        raise PluggyError("Esta conexão já está vinculada a outro usuário.")
    item_row = db.query(PluggyItem).filter_by(user_id=user_id, item_id=item_id).first()
    if not item_row:
        item_row = PluggyItem(user_id=user_id, item_id=item_id)
        db.add(item_row)
    try:
        item = _req("GET", f"/items/{item_id}")
        # segurança multi-inquilino: o item precisa pertencer a este usuário
        client_user = item.get("clientUserId")
        if client_user and client_user != str(user_id):
            raise PluggyError("Este item pertence a outro usuário.")
        item_row.connector_name = (item.get("connector") or {}).get("name", "")
        item_row.status = item.get("status", "")

        created = 0
        start = (date.today() - timedelta(days=days)).isoformat()
        for pa in _paged("/accounts", {"itemId": item_id}):
            acc = db.query(Account).filter_by(user_id=user_id, pluggy_account_id=pa["id"]).first()
            kind = KIND_MAP.get(pa.get("type"), "checking")
            if pa.get("subtype") == "SAVINGS_ACCOUNT":
                kind = "savings"
            if not acc:
                acc = Account(user_id=user_id, pluggy_account_id=pa["id"], pluggy_item_id=item_id,
                              name=pa.get("marketingName") or pa.get("name") or "Conta",
                              institution=item_row.connector_name, kind=kind)
                db.add(acc)
            credit = pa.get("creditData") or {}
            if kind == "credit_card":
                acc.credit_limit = credit.get("creditLimit") or acc.credit_limit
                if credit.get("balanceCloseDate"):
                    acc.closing_day = int(credit["balanceCloseDate"][8:10])
                if credit.get("balanceDueDate"):
                    acc.due_day = int(credit["balanceDueDate"][8:10])
                acc.balance = -abs(pa.get("balance") or 0)
            else:
                acc.balance = pa.get("balance") or 0
            db.flush()

            for t in _paged("/transactions", {"accountId": pa["id"], "from": start}):
                if db.query(Transaction.id).filter_by(user_id=user_id, external_id=t["id"]).first():
                    continue
                amount = abs(t.get("amount") or 0)
                # Pluggy: type DEBIT = saída; em cartão, CREDIT = pagamento/estorno
                tx_type = "expense" if t.get("type") == "DEBIT" else "income"
                if kind == "credit_card":
                    tx_type = "expense" if (t.get("amount") or 0) > 0 or t.get("type") == "DEBIT" else "transfer"
                desc = t.get("description") or ""
                meta = t.get("creditCardMetadata") or {}
                inst = None
                if meta.get("totalInstallments"):
                    inst = f"{meta.get('installmentNumber', 1)}/{meta['totalInstallments']}"
                db.add(Transaction(
                    user_id=user_id, account_id=acc.id, external_id=t["id"], source="pluggy",
                    date=datetime.fromisoformat(t["date"].replace("Z", "+00:00")).date(),
                    description=desc[:255], amount=amount, type=tx_type, installment=inst,
                    category_id=None if tx_type == "transfer" else
                    categorize(db, user_id, desc, tx_type, t.get("category")),
                ))
                created += 1
        item_row.last_sync_at = datetime.utcnow()
        item_row.last_error = ""
        db.commit()
        return {"item_id": item_id, "new_transactions": created, "status": item_row.status}
    except (PluggyError, httpx.HTTPError) as e:
        db.rollback()
        row = db.query(PluggyItem).filter_by(user_id=user_id, item_id=item_id).first()
        if row:
            row.last_error = str(e)[:500]
            db.commit()
        raise PluggyError(str(e))


def delete_item(item_id: str):
    try:
        _req("DELETE", f"/items/{item_id}")
    except PluggyError:
        pass
