# Design

<!-- impeccable:design-schema 1 -->

## World

Restrained Operate system: neutral surfaces, one indigo→cyan brand accent used only for primary actions, current state, and the brand mark. Inherited from the incumbent app and deliberately kept — this pass elevated finish (type, depth, states, motion), not identity. Name "Finora" and the indigo/cyan gradient mark are fixed brand commitments (see PRODUCT.md).

## Theming

Three modes: **Claro** (light), **Escuro** (dark), **Automático** (follows OS `prefers-color-scheme`, the default for new sessions). Controlled by `document.documentElement.dataset.theme` (`"light" | "dark" | "auto"`), persisted client-side in `localStorage` (per-device preference, not synced to the account — this is a display setting, not product data). Two entry points that stay in sync: the topbar icon button (`#themeBtn`, cycles light→dark→auto) and an explicit segmented control in Configurações.

CSS pattern (standard token-override idiom): light values live directly on `:root`; dark values are defined twice with identical tokens — once under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` for the automatic case, and once under `:root[data-theme="dark"]` for the explicit override. No component ever branches on theme itself; everything reads the same custom properties.

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

- Inter remains the AI-generated-UI-detector's one standing flag — kept intentionally per the owner's explicit choice; revisit only if asked.
- No DESIGN.md existed before this pass; this file was written from the built result, per the incumbent-world documentation path (not a new-world creation).
