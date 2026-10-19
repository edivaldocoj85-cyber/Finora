"""Nora no WhatsApp: webhook da UAZAPI + vínculo do número pelo app (ver services/whatsapp.py)."""
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import current_user_active, rate_limit
from ..config import get_settings
from ..db import get_db
from ..models import User, WhatsAppLink
from ..services import whatsapp

router = APIRouter(prefix="/api/whatsapp")


@router.get("")
def whatsapp_status(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    link = db.query(WhatsAppLink).filter_by(user_id=u.id).first()
    linked = bool(link and link.phone and link.verified_at)
    return {"enabled": whatsapp.enabled(), "linked": linked,
            "phone": whatsapp.mask_phone(link.phone) if linked else "",
            "bot_number": get_settings().whatsapp_bot_number}


@router.post("/link-code", dependencies=[Depends(rate_limit("wa-code", 10, 600))])
def whatsapp_link_code(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    if not whatsapp.enabled():
        raise HTTPException(503, "A integração com o WhatsApp ainda não está ligada no servidor.")
    code, expires = whatsapp.new_link_code(db, u.id)  # sempre o login, nunca a empresa aberta
    return {"code": code, "message": f"FINORA {code}", "expires_at": expires.isoformat() + "Z",
            "bot_number": get_settings().whatsapp_bot_number}


@router.delete("")
def whatsapp_unlink(u: User = Depends(current_user_active), db: Session = Depends(get_db)):
    link = db.query(WhatsAppLink).filter_by(user_id=u.id).first()
    if link:
        whatsapp.forget(link.phone)
        db.delete(link)
        db.commit()
    return {"ok": True}


@router.post("/webhook/{secret}")
async def whatsapp_webhook(secret: str, request: Request):
    expected = get_settings().whatsapp_webhook_secret
    # sem segredo configurado o webhook nunca abre: ele grava lançamentos em nome das pessoas
    if not expected or not whatsapp.enabled():
        raise HTTPException(503, "WhatsApp não configurado.")
    if not hmac.compare_digest(secret, expected):
        raise HTTPException(401, "invalid")
    try:
        payload = await request.json()
    except ValueError:
        return {"ok": True, "ignored": "body"}
    ignored = whatsapp.receive(payload if isinstance(payload, dict) else {})
    return {"ok": True, **({"ignored": ignored} if ignored else {})}
