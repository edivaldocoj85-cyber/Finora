# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Existing codebase: vanilla JS SPA frontend (`frontend/app.js`, no framework/build step) + FastAPI (Python) backend + Postgres, served as one container behind Caddy in production, `docker compose` for local/self-hosted deploy.

Also deployable to Vercel (added 2026-09-20, user's chosen path): `api/index.py` exposes the same FastAPI app as an ASGI serverless function, `vercel.json` routes `/api/*` there and serves `frontend/` as static assets directly. Two things that don't exist in Docker mode had to change for this: the background Pluggy sync loop becomes a Vercel Cron hitting `GET /api/cron/sync` (guarded by `CRON_SECRET`), and payment-receipt storage moves from local disk to Supabase Storage (`backend/app/services/storage.py` picks whichever backend is configured — local disk when `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are unset, Supabase otherwise). Postgres itself has to be external on Vercel (the user picked Supabase for that too, so DB + file storage share one account). Both deploy paths stay supported from the same codebase.

## Users
Updated 2026-09-23: Finora is **becoming a public SaaS** (owner's decision: "vai virar SaaS em breve"). It started as the owner's own personal/family tool and the owner still uses it that way, but the public landing now sells two plans (R$ 14,90/mês, R$ 149,90/ano) with a 10-day free trial, for Brazilian individuals and small businesses/autônomos. Multi-user already exists (per-user workspaces, shared access by invite, trial gating, admin backoffice). Not yet built: billing/checkout. Legal pages (Privacidade, Termos) exist as templates with `[PREENCHER]` fields for company name, CNPJ, contact e-mail, payment methods and refund policy — the owner must fill them before launch.

## Product Purpose
Personal financial control for Brazilians: track accounts and credit cards, understand installment purchases (parcelamentos) month to month, get automatic alerts about overspending, and receive savings/investment guidance. Success = the user opens it regularly, trusts the numbers, and actually changes spending behavior because of what it shows.

## Positioning
Built specifically around Brazilian personal-finance reality that generic international budgeting apps (Mint/YNAB-style) don't model well: cartão de crédito parcelado as a first-class concept (per-purchase installment tracking, not just monthly totals), Open Finance (Pluggy) as a native integration alongside manual CSV import, Selic/CDI/IPCA as the benchmark set for the advisor and investment simulator, and LGPD-shaped consent/data-deletion flows.

## Operating Context
Self-hosted web app / installable PWA, used from both phone and desktop. Checked in short, frequent sessions (checking today's spend, a card's open invoice, alerts) and in longer monthly-review sessions (categorizing, running the advisor report, adjusting budgets). Handles sensitive personal financial data.

## Capabilities and Constraints
Confirmed functionality already built: accounts/cards CRUD, transactions (manual, CSV import, Pluggy sync) with auto-categorization and category rules, per-card invoice cycles, per-purchase installment plan tracking (parcela X/N, quanto falta), contracts/recurring bills, income sources, budget-vs-actual per category, goals, rule-based + optional Claude-powered financial advisor with market data (BCB/AwesomeAPI/brapi), automatic alerts (budget overrun, spend spike, card limit, upcoming bills, negative balance, subscription creep, manual-import reminders on a configurable daily/weekly/monthly cadence), email+password auth and Google sign-in, LGPD export/delete.
Constraint: no framework/build pipeline in the frontend today — any new UI ships as plain HTML/CSS/JS (or a deliberately chosen small addition), not a framework migration, unless the user asks for that separately.
Constraint: single-process container, no CDN/edge; keep payload and dependencies light for a personal deployment.

## Brand Commitments
Name "Finora" and the indigo→cyan gradient mark stay (user confirmed: keep name and palette, elevate finish rather than reinvent identity). Portuguese (pt-BR) is the product's only language.

## Evidence on Hand
No real customers yet, so no testimonials, user counts or ratings — the landing must not imply any. Demo figures on the landing are one consistent illustrative scenario ("Ana") labelled as such. Only real features may be claimed (no WhatsApp, audio, receipt OCR or push notifications until built).

## Product Principles
- Installments and invoices are first-class, not an afterthought bolted onto a generic transaction list.
- The advisor and alerts must stay honest: no invented numbers, no advice framed as certainty, always something the user can act on this month.
- Never require Open Finance or AI to be useful — manual CSV import and the rule-based advisor are the floor, not a degraded fallback.
- Respect for the data: LGPD consent, exportable, deletable, no dark patterns around sharing financial data.
- Operate, don't persuade — inside the app. The public landing is a Persuade surface, but it persuades only with true statements.
- The assistant is **Nora** (the brand mascot built from the F mark): one name and one face on the landing, in the app and in future e-mails.

## Accessibility & Inclusion
No user-specific requirement stated; hold the general WCAG AA bar (contrast, keyboard access, focus visibility) as the floor.
