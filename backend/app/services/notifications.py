"""Rotina diária de avisos: roda os alertas de todo mundo uma vez por dia (não só de quem tem
Open Finance) — assim o e-mail de "orçamento em 80%" ou "vence amanhã" chega mesmo sem a
pessoa abrir o app — e manda o resumo semanal na segunda de manhã pra quem quer.
Horário de Brasília (UTC-3), sem depender do fuso do servidor."""
import html
import logging
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import User
from . import analytics, cashflow
from . import email as email_service

log = logging.getLogger("finora")
RUN_HOUR = 7  # 7h em Brasília


def br_now() -> datetime:
    return datetime.utcnow() - timedelta(hours=3)


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _eligible(u: User, now: datetime) -> bool:
    if u.suspended_at:
        return False
    return not (u.plan == "trial" and u.trial_ends_at and now > u.trial_ends_at)


def digest_html(db: Session, u: User, today: date) -> tuple[str, str]:
    d = analytics.dashboard(db, u.id, today)
    cf = cashflow.build(db, u.id, "day", today, today + timedelta(days=7), today=today)
    week_ago = today - timedelta(days=7)
    from ..models import Transaction  # noqa: E402 (evita import circular no topo)
    spent = sum(t.amount for t in db.query(Transaction).filter(
        Transaction.user_id == u.id, Transaction.type == "expense",
        Transaction.date > week_ago, Transaction.date <= today))
    h = d.get("health") or {}
    e = html.escape
    public_url = get_settings().public_url.rstrip("/")
    rows = "".join(f"<tr><td style='padding:4px 0'>{date.fromisoformat(x['date']).strftime('%d/%m')}</td>"
                   f"<td style='padding:4px 8px'>{e(x['description'] or '')}</td>"
                   f"<td style='padding:4px 0;text-align:right;color:{'#be123c' if x['amount'] < 0 else '#047857'}'>"
                   f"{'−' if x['amount'] < 0 else '+'}{_brl(abs(x['amount']))}</td></tr>"
                   for x in cf["events"][:10])
    cats = "".join(f"<li>{e(c['name'])}: {_brl(c['total'])}" + (f" de {_brl(c['budget'])}" if c["budget"] else "") + "</li>"
                   for c in d["categories"][:4])
    tips = "".join(f"<li><b>{e(i['title'])}</b><br>{e(i['message'])}</li>" for i in d.get("insights", [])[:3])
    subject = f"Finora · sua semana: {_brl(spent)} gastos" + (f" · saúde {h['score']}/100" if h.get("score") is not None else "")
    body = f"""<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#1f2937">
  <h2 style="margin:0 0 4px">Oi, {e((u.name or '').split(' ')[0])}! Seu resumo da semana</h2>
  <p style="color:#6b7280;margin:0 0 16px">{week_ago.strftime('%d/%m')} a {today.strftime('%d/%m/%Y')}</p>
  <p>Gastos nos últimos 7 dias: <b>{_brl(spent)}</b><br>
     Mês até agora: receitas <b>{_brl(d['month']['income'])}</b> · despesas <b>{_brl(d['month']['expense'])}</b><br>
     Saldo nas contas: <b>{_brl(cf['balance_today'])}</b>{f" · menor saldo previsto na semana: <b>{_brl(cf['lowest']['balance'])}</b>" if cf.get('lowest') else ''}</p>
  {f"<h3 style='margin:18px 0 6px'>Maiores gastos do mês</h3><ul style='padding-left:18px;margin:0'>{cats}</ul>" if cats else ''}
  {f"<h3 style='margin:18px 0 6px'>Próximos 7 dias</h3><table style='width:100%;border-collapse:collapse;font-size:14px'>{rows}</table>" if rows else ''}
  {f"<h3 style='margin:18px 0 6px'>O que fazer agora</h3><ul style='padding-left:18px;margin:0'>{tips}</ul>" if tips else ''}
  <p style="margin:22px 0"><a href="{public_url}/app/" style="background:#2340d8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir o Finora</a></p>
  <p style="color:#9ca3af;font-size:12px">Você recebe este resumo toda segunda. Pra parar, vá em Configurações → Notificações no Finora.</p>
</div>"""
    return subject, body


def send_digest(db: Session, u: User, today: date | None = None) -> bool:
    subject, body = digest_html(db, u, today or br_now().date())
    return email_service.send(u.email, subject, body)


def daily_job(db: Session, now: datetime | None = None) -> dict:
    """Idempotente: cada pessoa roda no máximo uma vez por dia; resumo só na segunda."""
    now = now or br_now()
    if now.hour < RUN_HOUR:
        return {"skipped": "cedo"}
    today = now.date()
    stats = {"alerts": 0, "digests": 0}
    for u in db.query(User).all():
        if not _eligible(u, now + timedelta(hours=3)):
            continue
        try:
            if not u.last_daily_run_at or (u.last_daily_run_at - timedelta(hours=3)).date() < today:
                analytics.run_alerts(db, u.id, today)
                u.last_daily_run_at = now + timedelta(hours=3)  # guarda em UTC, no relógio da rotina
                stats["alerts"] += 1
            if (u.email_digest == "weekly" and today.weekday() == 0 and email_service.enabled()
                    and (not u.last_digest_at or (today - (u.last_digest_at - timedelta(hours=3)).date()).days >= 6)):
                if send_digest(db, u, today):
                    u.last_digest_at = now + timedelta(hours=3)
                    stats["digests"] += 1
            db.commit()
        except Exception as ex:  # noqa: BLE001 — um usuário com problema não para os outros
            db.rollback()
            log.warning("rotina diária falhou pro usuário %s: %s", u.id, ex)
    return stats
