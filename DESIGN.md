# Design

<!-- impeccable:design-schema 1 -->

## World

Restrained Operate system: neutral surfaces, one indigo→cyan brand accent used only for primary actions, current state, and the brand mark. Inherited from the incumbent app and deliberately kept — this pass elevated finish (type, depth, states, motion), not identity. Name "Finora" and the indigo/cyan gradient mark are fixed brand commitments (see PRODUCT.md).

## Surfaces: Operate vs. Editorial

Two visual systems coexist by design, one per mode (see Impeccable's mode definitions):

- **Operate** (this DESIGN.md, below) — the authenticated panel (`frontend/app/`, everything past login). Inter, neutral surfaces, single indigo→cyan accent, restrained motion. The visitor is completing a task; brand lives in precise details, not expression.
- **Editorial** (`frontend/index.html` + `frontend/css/finora.css`, and the pre-login screen `frontend/app/auth-finora.css`) — the public landing and the login/MFA screen. **Redesigned 2026-09-23** at the owner's request to follow the pattern of a conventional Brazilian finance-SaaS site (reference: Contas Online `/empresarial`): light surfaces, sticky header with "Acessar conta" + "Criar conta grátis", hero with an HTML mockup of the real panel (greeting with "contas a pagar hoje", KPIs, vencimentos, saldo das contas, category donut — labelled "Valores ilustrativos"), icon feature cards, alternating "Como a Finora resolve" blocks with product mockups, security block, PWA/app band, plans (R$ 14,90/mês · R$ 149,90/ano, 10-day trial), tabbed FAQ (Para você / Para empresa) and a gradient closing CTA + full footer. It now shares the Finora brand with Operate (indigo `#4f46e5` → cyan `#0891b2`, deep ink `#15133a` for dark bands) instead of the old oxide/ember palette. Type: **Plus Jakarta Sans** (display) + **Inter** (body); the panel also uses Plus Jakarta Sans for `h1`/`h2`/brand/stat values (`--font-display`) so the two surfaces read as one product. The login screen is a split layout: brand gradient panel (headline + checklist + rotating note) on the left, an Operate-token card (follows light/dark) on the right. The previous oxide/ember Editorial system is retired; git history has it.

**Revision 2026-09-23 (b) — more color + automations** (owner asked for a more colorful page and for the automation storytelling of meuplannerfinanceiro.com.br): support palette with fixed roles — verde `#047857` = income/ok, âmbar `#b45309` = attention/due, rosa `#be123c` = danger/overrun, violeta `#6d28d9` = analysis, ciano `#0e7490` = sync/info — each with a `-cl` tint for section/card backgrounds and a `-vivo` for dots/fills. Sections alternate tints (ciano, âmbar, verde, violeta) and dark ink bands. Heading emphasis is an amber **marker highlight** (`<mark>`, indigo on dark bands), replacing gradient text. New sections: facts band, "Se você se reconhece" situations, planilha × app do banco × Finora comparison, 4-step "Como funciona", and **Automações** (dark band, the page's one authored motion: an assistant conversation that plays message by message with a typing indicator on scroll-in, static under reduced motion). Automations shown are only the real ones (assistant text entry/queries/goals, due-today nudge with one-click pay, the 8 analytics alerts with their real titles, rules categorization, Open Finance sync every 6h, import reminders, receipt photo) — owner explicitly chose "só as reais": no WhatsApp, audio or receipt OCR claims until those exist. Eyebrow/kicker labels were removed.

The reference site's own brand (green/yellow palette, names, copy) is deliberately **not** copied — only its structure and tone. All landing copy states only what Finora actually does (e.g. no nota fiscal/boleto, app = installable PWA, no store app).

## Theming

Three modes: **Claro** (light), **Escuro** (dark), **Automático** (follows OS `prefers-color-scheme`, the default for new sessions). Controlled by `document.documentElement.dataset.theme` (`"light" | "dark" | "auto"`), persisted client-side in `localStorage` (per-device preference, not synced to the account — this is a display setting, not product data). Two entry points that stay in sync: the topbar icon button (`#themeBtn`, cycles light→dark→auto) and an explicit segmented control in Configurações.

CSS pattern (standard token-override idiom): light values live directly on `:root`; dark values are defined twice with identical tokens — once under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` for the automatic case, and once under `:root[data-theme="dark"]` for the explicit override. No component ever branches on theme itself; everything reads the same custom properties.

## Landing v3 — critique fixes (2026-09-23, after critique 23/36)

Supersedes the section-level color and structure notes above where they conflict.
- **Structure (13 → 10 blocks, page 9.7k → 6.9k px desktop, 16.6k → 12.3k mobile):** hero (with a 3-step "como funciona" line) · trust strip (10 dias grátis · Open Finance só leitura · duas etapas · LGPD) · "Isso soa familiar?" pains + comparison on one dark band · **Parcelas e faturas** showcase (the product's real differentiator: invoice with per-purchase "parcela X de N", remaining amount, and months already committed — visible on mobile) · Nora/automations (dark) · negócio · segurança (rows with concrete facts, Pluggy named) · planos (+ terms strip: teste, pós-teste, cancelamento) · FAQ in 3 tabs (Uso / Conta e pagamento / Empresa) · CTA · footer with legal row. Facts band, separate "Como funciona", Recursos 1/2 and the app band were removed.
- **Color — "brilho sem cara de IA":** white/ice (`--gelo #f7f8fc`) section backgrounds, exactly one brand gradient token (`--grad`, used on the logo and the final CTA band), two flat ink bands (no radial halos, no colored glows). Light comes from one direction: `--realce` inset top highlight + offset soft shadows. Role colors appear only where they mean something (mock values, status chips, automation icons; violet = installments). Dark-band emphasis is amber text (`.real`), not a highlighter.
- **Type:** h1 800/-.025em, h2 700/-.018em, h3 700; the marker highlight is limited to 3 headings (hero, parcelas, planos); brand lockup subtitle is lowercase muted Inter 12px ("controle financeiro").
- **Honesty/consistency:** one "Ana" scenario whose numbers reconcile (saldo 36.218,95 = 31.240,50 + 4.883,45 + 95,00; hoje 198,90 = 119,90 + 79,00; próximos 10 dias 3.134,90 = fatura 1.284,90 + aluguel 1.850,00; fatura 1.284,90 = parcelas 1.022,30 + à vista 262,60). No push notification, no "por mensagem"; money always "R$" + no-break space. One CTA wording ("Testar grátis por 10 dias"; header shortens to "Testar grátis"); sticky CTA on phones after the hero.
- **Trust/legal:** `/privacidade.html` and `/termos.html` (Read-mode pages sharing `finora.css` `.doc`), footer legal row. Unknown business facts are rendered as visible `.preencher` placeholders — never invented.
- **Nora is the assistant** everywhere: landing chat header, app floating button and panel header (`.nora-ic` inline SVG), greeting, and the backend system prompt.
- **Motion:** in the hero only Nora moves continuously (orbit, bobbing cards and bell removed). New scenes: invoice rows, installment bars and committed-months bars; cash-flow mini bars in negócio.

## Landing v4 — enxuta + movimento responsivo (2026-09-24)

Owner asked for less text and "movimentos responsivos". Skill used: motion-design (Corporate personality for UI, Playful for Nora — unchanged).
- **Copy cut ~40%:** pains list and its closing line removed (comparison now has a one-line intro, "Por que a planilha não durou."); every paragraph cut to one sentence; automations reduced to 4 items + the 8 alert chips; chat has 4 messages; FAQ is one list of 7 questions (tabs removed).
- **Responsive motion tokens:** `--dist / --dur / --stg` = 22px/.7s/70ms desktop → 18px/.6s/60ms tablet → 14px/.5s/45ms phone (motion-design 0.8x mobile rule). All scroll reveals read them.
- **Reacts to the user:** reading-progress hairline on the header (`--lido`, scaleX) and header compacts 72→60px on scroll (`--cab-h`, mobile menu follows); on fine pointer + ≥961px only — hero panel tilts toward the cursor (≤4°, lerped in rAF) with the alert card and Nora moving in opposite layers via the `translate` property, scroll parallax ≤40px on the invoice and hero, cards lift 6px on hover, CTA shine sweep, automation icons tilt. No parallax/tilt on touch. Touch feedback: buttons press to .98 in 80ms.
- **New scenes:** Finora column in the comparison lights cell by cell with ✓ popping; the 8 alert chips cascade (40ms); security icons "lock" into place; FAQ answers slide in when opened.

**Nora guia (2026-09-24, rev. b — discreet):** a fixed companion Nora (`.guia`, `aria-hidden`) appears once the hero leaves the lower 60% of the screen and hides at the final CTA/footer (hand-off to the CTA Nora). Sections carry `data-guia` (bubble line), `data-lado` (`e`/`d`) and `data-gesto` (`espia` · `acena` · `sim`). Owner asked for no jumping: on a side change she fades down 8px, then **surges** discreetly (rise 14px + fade, 520ms expo-out, no bounce) and, already still, **performs** a short gesture (peek toward the content, wave, or nod; antenna "signals" on every gesture) before the bubble (4.2s). If the reader stays on the same section for 9s she repeats the gesture once, without the bubble. Scroll response is subtle (≤8px spring lag, ≤4° lean, pupils follow the scroll). Click = wave + repeat line. ≤960px: always bottom-right above the sticky CTA. Not rendered under reduced motion. Bubble lines only state real facts.

**Copy v5 (2026-09-24) — commercial clarity:** hero "Finanças em ordem, sem planilha." with a lead naming the product category and its 3 jobs; new **Recursos** section (6 real capabilities: contas em um painel, cartões/faturas/parcelas, a pagar e a receber, orçamento por categoria, metas e reserva, relatórios e consultor Selic/CDI/IPCA); comparison retitled "Planilha, app do banco ou Finora?" + a **ganhos** row (menos juros e multas · fatura sem susto · decisões com dados) as the why-buy; FAQ gains "Meus dados estão seguros?"; plan list adds relatórios e consultor; final CTA "Assuma o controle do seu dinheiro hoje." Menu: Recursos · Parcelas · Nora · Planos · Dúvidas (Segurança stays in the footer).

**Vitrine de banners (2026-09-24):** owner supplied benefit lines (negative balance, investing tips, cutting superfluous spending, emergency money, "trocar de carro no fim do ano") and asked for professional, attention-grabbing animated banners with a futuristic feel. Built as section `#vitrine` (dark band after Recursos; the old "ganhos" row was removed and the comparison moved up before Recursos to keep light/dark alternation). Pieces: a slow marquee of short benefit phrases (46s loop, pauses on hover); a faint 44px grid on the band; a 5-banner carousel (`[data-bn]`, WAI-ARIA tabs) — Alertas "Conta no vermelho? Nunca mais de surpresa.", Orçamento "Corte o supérfluo hoje. Colha o retorno amanhã.", Reserva "Imprevisto não vira aperto.", Consultor "Saiba onde aplicar o seu dinheiro." (with "Conteúdo educativo. Não é recomendação de investimento."), Metas "Trocar de carro no fim do ano? Planejado." Each banner = dark glass card + white product card telling a ~3s micro-story (setup → action → resolution) in its role color; the active banner gets the page's only rotating light border (`--giro` conic mask, 7s). Timing: the active tab's 2px bar is the timer (6.5s, CSS animation → `animationend` advances); paused on hover, focus inside, off-screen or via the pause button; arrows, ←/→ on tabs, swipe on touch. Reduced motion / no JS: banners render stacked and static, no controls. Research note: fintech references favor dark bands, bold type, product visualization and subtle motion; avoid red as a primary color and neon — role colors stay pastel on dark and saturated only inside the white product cards.

**Chat de dúvidas com a Nora (2026-09-24):** clicking any landing Nora (hero, guide, final CTA) or the "Tirar dúvidas com a Nora" buttons (hero, under the FAQ — the accessible entry points, since the mascots are `aria-hidden`) opens `#atende`: a light panel bottom-right on desktop, a bottom sheet on phones; the guide and sticky CTA hide while it is open; Esc closes and returns focus. It works under reduced motion (the chat module sits before the motion gate). Answers come from `POST /api/vendas/chat` (`backend/app/services/vendas.py`): a product knowledge base (accent/typo-tolerant stem matching, multi-intent) answers for free; when `ANTHROPIC_API_KEY` is set, the conversation goes to Claude (`VENDAS_MODEL`, default `claude-opus-5`, effort low, server-side fallbacks) grounded on that same base. When neither knows, the reply routes to **finora@gmail.com** and shows "Enviar minha dúvida por e-mail" (mailto pre-filled with the visitor's questions). Rate limit 30 messages / 10 min per IP; history capped at 12 turns × 600 chars.

**Topo com mensagens que giram (2026-09-24):** owner asked for the vitrine automation on the hero. The carousel logic is now one function (`carrossel(el, {pre, aoMudar, espera, reinicia})`) shared by `.bn` and `.hs`. The hero cycles 5 messages (6s each, stories-style gradient bars + pause; starts after the 1.8s entrance; pauses on hover/focus): "Finanças em ordem, sem planilha." (the only `h1`), "Saiba hoje o que vence amanhã.", "Parcelas sob controle.", "Todas as contas, um só saldo.", "Descubra para onde vai o seu dinheiro." Each slide carries `data-foco`; the hero mirrors it and the app mock spotlights the matching block (`.am-dim` / `.al-*`: others dim to 35% + desaturate, target gets an indigo ring and 2.5% scale via the `scale` property so entrance transforms stay intact) while the floating card swaps (`.f-alerta` → `.f-venc` "Marcar como pago", `.f-parc` installment bar, `.f-contas`, `.f-cats` 80% budget alert — all numbers from the Ana scenario). No JS / reduced motion: only the first message, static.

## Landing motion identity and mascot (2026-09-23)

Owner asked for landing animations "with their own identity", characters allowed, using contasonline.com.br/pessoal as the movement reference (floating cards, slowly rotating ring, scroll reveals, a mascot). Finora's version:

- **Nora, the mascot** — the brand's "F" tile come alive: the indigo→teal rounded square, the icon's cyan dot as an antenna, eyes, cheeks, small arms and feet. Drawn once as inline SVG in `js/finora.js` (`nora(pose)`, poses `hero` / `mini` / `pula`) and injected into `[data-nora]` slots. Appears three times: standing on the hero mockup (drops in, squashes on landing, waves, then a speech bubble "Oi! Eu sou a Nora…"; pupils follow the pointer; click = little jump), as the assistant avatar in the Automações chat (nods on each reply), and hopping with a coin in the final CTA. Ambient life: breathing squash, blink, antenna sway.
- **Two personalities, fixed:** UI = Corporate (`--m-ui` expo-out, ~200/400/700ms, entrance = rise 24px + fade, stagger 70ms via `--i`); Nora = Playful (`--m-pula` back-out, squash-and-stretch).
- **Hero choreography on load:** copy rises in sequence, marker highlight sweeps in, mockup rises and its tiles cascade, KPI numbers count up, donut sweeps (`@property --arco`), floating cards slide in with a soft overshoot, then Nora arrives. Ambient layer: dashed orbit with three coins rotating (48s), floating cards bob out of phase, the alert bell rings every few seconds.
- **Scenes on scroll (`[data-cena]` → `.on`):** fact numbers count up; situation cards pop with icon spin; comparison rows slide in and the Finora column lights up; the "Como funciona" line draws across and each number pops as it passes; cash-flow bars grow in a wave; due-date rows arrive from the right and the budget bar fills; phone rises and the notification drops; CTA Nora bounces in. Section headings get the same marker sweep.
- Hidden starting states exist only under `html.js-anim` (added by JS when motion is allowed), so without JS or with `prefers-reduced-motion` the page renders complete and static. Horizontal slide-ins are clipped per section (`.sec{overflow-x:clip}`, keeps the sticky chat working).

## Panel color roles and professional patterns (2026-09-23)

The landing's color roles now also apply to the Operate panel, in both themes (tokens in `styles.css`: `--green/--red/--amber/--violet/--cyan` plus `-bg` tints, dark variants redefined in both dark blocks). Semantic colors were darkened for AA on white (`--green #047857`, `--red #be123c`, `--amber #b45309`). Applied as: dashboard stat tiles tinted by meaning (Receitas green, Despesas red, Resultado violet), greeting due chips (hoje = amber, próximos = cyan), status chips (`.chip.c-*`: parcela = violet, Open Finance = cyan, atrasado/juros/suspenso = red, recebido = green, pendente/lembrete = amber), alert list tinted by level with a colored title instead of a side stripe, active nav on `--primary-bg`.

- **Confirmations:** `askConfirm({title, message, confirmLabel, danger, requireText})` in `app.js` opens `#confirmDlg` (styled, stacks over another dialog) and replaces every native `confirm()`/`prompt()`. Destructive actions use a solid red button; account deletion requires typing EXCLUIR. Rule deletion, which had no confirmation, now has one.
- **Bulk review:** transactions table has row checkboxes + select-all (indeterminate state) and a sticky bulk bar (categorize / delete / clear), backed by `POST /api/transactions/bulk` (delete reverses each transaction's balance effect like the single DELETE). On phones the bar docks above the bottom nav.
- **Keyboard:** `N` opens a new transaction, `/` focuses search on Lançamentos (ignored while typing or with a dialog open); advertised via `title` and `aria-keyshortcuts`.
- Due-date alert titles read "Vence hoje / Vence amanhã / Vence em N dias" with dd/mm/aaaa dates (was "Vence em 0 dia(s)" + ISO date).

## Typography

Inter only (system stack fallback), kept deliberately — Operate surfaces don't need a display/body pairing, and the owner chose to keep the incumbent face rather than adopt one for its own sake.

Fixed rem scale, ratio ≈1.15–1.2, defined as tokens in `styles.css`:
`--fs-xs: .8125rem` (12–13px, stat labels/kickers) · `--fs-sm: .875rem` · `--fs-base: .9375rem` (body) · `--fs-md: 1.0625rem` (h2) · `--fs-lg: 1.25rem` · `--fs-xl: 1.5rem` · `--fs-2xl: 1.75rem` (h1).

`h3` is the stat-tile/section label voice: uppercase, `.04em` tracking, `--muted` color, `--fs-xs` — a component label, not a kicker-above-heading (that pattern stays banned).

## Color

Restrained strategy (the Operate floor): neutrals + one accent. Tokens in `:root`, redefined under `prefers-color-scheme: dark`.

- `--bg` / `--surface` (cards) / `--panel` (sidebar — a second, slightly darker neutral layer per Operate convention, distinct from card surfaces) / `--surface-2` (hover/pill fills) / `--border`.
- `--text` / `--muted`.
- `--primary` / `--primary-2` — indigo, the only accent; used for primary actions, active nav, focus rings, chart accents, brand mark. Never decorative.
- `--green` / `--red` / `--amber` — semantic state only (income/expense, alert levels, budget bars).
- Logo gradient: `#4f46e5 → #0e7490` (darkened from the original `#06b6d4` cyan stop — the lighter cyan failed WCAG contrast with the white "F"; `.hero` card keeps the original `#0891b2` stop, which does pass).

## Elevation

Three shadow tokens replace the old single flat `--shadow`, resolving the "hairline border + wide diffuse shadow" AI-tell the incumbent CSS had drifted into:

- `--shadow-sm` — tabs, tight inline lift.
- `--shadow` — inline cards that sit on the page background: **border + shadow both**, but the shadow is now tight (2–8px blur), not a wide halo.
- `--shadow-lg` — floating/overlay elements (dialog, toast, `.auth-card`, `.ob-card`): **shadow only, no border** — the one-or-the-other resolution, chosen because these float over a dimmed/blurred backdrop rather than sitting flush on the page.

## Components

- **Buttons** (`.btn`): full state set — default/hover/active/disabled/loading/focus-visible. `.primary` carries the brand gradient + neutral (non-colored) elevation shadow that grows on hover, presses on `:active`. `.danger` has a tinted background, not color-only text (color alone isn't an accessible affordance). `.loading` shows a spinner via `::after`, text hidden via `color: transparent`.
- **Inputs**: focus ring in brand color; `:invalid:not(:placeholder-shown)` and `.invalid` get a red border + red-tinted focus ring (the missing error state).
- **Bars/progress** (`.bar > i`): animate via `transform: scaleX()` from `transform-origin: left`, never `width` (layout thrash).
- **Browser surfaces**: `::selection`, `::-webkit-scrollbar` (thin, palette-tinted thumb), and input `caret-color` are themed from the palette rather than left as browser defaults.

## Motion

**Brand Motion Identity** — archetype **Corporate** (the default for dashboard/Operate UI): trustworthy, precise, no overshoot. One signature curve, one duration palette, defined once and reused everywhere rather than picked per-animation.

| Token | CSS | GSAP (`MOTION` in `app.js`) | Use |
|---|---|---|---|
| signature ease | `--ease: cubic-bezier(0.2, 0, 0, 1)` (MD3 default) | `"power2.out"` (closest built-in equivalent — no CustomEase plugin vendored) | all entrances/transitions |
| quick | `--dur-quick: .15s` | `MOTION.quick` | button/icon feedback, press states, exit transitions |
| standard | `--dur-standard: .28s` | `MOTION.standard` | view/card entrances, dialog/toast, onboarding steps |
| slow | `--dur-slow: .42s` | `MOTION.slow` | budget-bar fill, auth-card entrance (bigger contextual shift) |
| reveal (exception) | — | `MOTION.reveal = .9` | stat count-up only — "dramatic reveal" tier (600–1200ms), needs the extra time to be readable as counting rather than flickering |

Split deliberately: CSS for simple two-state toggles (dialog open/close via native `[open]`, toast show/hide), **GSAP** for anything orchestrated or numeric (vendored at `frontend/vendor/gsap.min.js`, no build step, matches how Chart.js/marked/DOMPurify are already vendored).

- **View transitions** (`animateViewIn`): one timeline per route change — the `#view` container fades/rises, then its top-level `.card`s stagger in (capped at 10, 50ms apart — within the "standard" stagger budget, total <400ms). Triggered after the view's own async render, not gating navigation on network latency.
- **Stat count-up** (`animateCounters`): the dashboard's four hero numbers count up from 0 via a tweened proxy object + `onUpdate`, using the app's own `brl()` formatter. Scoped to `[data-count]` — deliberately not applied to every number on every screen.
- **Error feedback** (`shakeEl` + `.shake`): a firm, no-overshoot horizontal shake (400ms) on the auth card, the active `<dialog>`, and the onboarding card when a submit fails — paired with `toast(msg, "error")`. This was the one state-feedback gap the incumbent app had: errors showed text but no motion.
- **Success feedback**: `toast(msg, "success")` tints the toast green; used for every completed action that previously had no confirmation signal beyond the list silently updating (CSV import, rule creation, bank sync, profile save).
- **Secondary layer**: the alert bell icon pulses once (quick, yoyo) only when the unread-alert count *increases* between dashboard loads — never on every load, so it stays a state signal rather than decoration.
- **Ambient layer**: the login-screen canvas network (see below) is the one continuous ambient motion in the app; nothing else loops.
- **Auth entrance**: `.auth-card` fades/scales in via GSAP on `showAuth()`.
- All GSAP entrances check `prefers-reduced-motion` before running (skip straight to end state); CSS motion uses a matching `@media (prefers-reduced-motion: reduce)` block.

## Canvas

`#authCanvas` (login screen only): a quiet drifting particle-network, brand-colored, low opacity, `requestAnimationFrame`-driven, self-pausing when `#auth` is hidden. Atmosphere, not data — never mistakeable for a real chart, which is why it's a network rather than a sparkline/wave shape (those would read as fabricated data, banned).

## Onboarding pattern

`#onboarding` — a full-screen stepped wizard (`.ob-card`, `.ob-steps` progress dots), separate from the small `<dialog>` modal system, for the first-run "screens" flow. Every field is optional; each step calls the same REST endpoints the full settings screens use (`/accounts`, `/incomes`, `/goals`), so there's no parallel data path. Gated server-side by `User.onboarded_at` (sent as `onboarded` on `/me`), set via `POST /me/onboarded` on completion or skip — reusable for any future first-run flow.

## Open items

- Inter remains the AI-generated-UI-detector's one standing flag for the **Operate** surface — kept intentionally per the owner's explicit choice; revisit only if asked.
- The **Editorial** surface was rebuilt on 2026-09-23 (see "Surfaces"); the old detector flags for gradient-text/glow no longer apply except the one gradient-clipped phrase in the hero `h1`.
- No DESIGN.md existed before this pass; this file was written from the built result, per the incumbent-world documentation path (not a new-world creation).
