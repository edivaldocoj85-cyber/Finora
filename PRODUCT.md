# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Existing codebase: vanilla JS SPA frontend (`frontend/app.js`, no framework/build step) + FastAPI (Python) backend + Postgres, served as one container behind Caddy in production, `docker compose` for local/self-hosted deploy.

## Users
Primary user: Edivaldo, using Finora for his own personal/family financial life — not building it as a product for other people (confirmed). Single-tenant-per-deployment self-hosted tool, not a commercial multi-tenant SaaS today.

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
No real user content beyond the owner's own live data. No customers, testimonials, or marketing claims — this product doesn't have or need them; nothing here should imply otherwise.

## Product Principles
- Installments and invoices are first-class, not an afterthought bolted onto a generic transaction list.
- The advisor and alerts must stay honest: no invented numbers, no advice framed as certainty, always something the user can act on this month.
- Never require Open Finance or AI to be useful — manual CSV import and the rule-based advisor are the floor, not a degraded fallback.
- Respect for the data: LGPD consent, exportable, deletable, no dark patterns around sharing financial data.
- Operate, don't persuade: this is a tool the owner already chose to use — clarity and speed beat marketing polish.

## Accessibility & Inclusion
No user-specific requirement stated; hold the general WCAG AA bar (contrast, keyboard access, focus visibility) as the floor.
