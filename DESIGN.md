---
name: Finora
description: Personal-finance control for Brazilians — ameixa + coral, the "A medida" mark, real app screens, two surfaces (Persuade landing, Operate panel).
colors:
  ink-plum: "#2a1633"
  ameixa: "#5b2a86"
  ameixa-deep: "#47206a"
  ameixa-mid: "#3d1d5c"
  coral: "#ff7a59"
  coral-hover: "#ff9473"
  arc-2: "#7a3ea6"
  arc-3: "#9a62c0"
  arc-4: "#bf98da"
  arc-dark-1: "#e9d9f6"
  arc-dark-2: "#cdb0e8"
  arc-dark-3: "#b08ad6"
  arc-dark-4: "#8f63bd"
  warm-white: "#fbf8f6"
  lilac-paper: "#f3ecf5"
  card-white: "#ffffff"
  body-plum: "#4a3a55"
  muted-plum: "#6e6078"
  hairline: "#e9e1ec"
  lilac-light: "#f6eef8"
  lilac-muted: "#cdbbd9"
  footer-night: "#1c0f22"
  bezel: "#120a17"
  check-green: "#047857"
  mint-check: "#9be3c3"
  signal-amber: "#d97706"
  focus-on-dark: "#e2c4ff"
  selection-peach: "#ffc9b8"
  panel-bg: "#f8f5f6"
  panel-surface-2: "#f1eaf2"
  panel-primary-2: "#7b3fa8"
  panel-primary-bg: "#f1e9f7"
  role-red: "#be123c"
  role-amber: "#b45309"
  role-violet: "#4338ca"
  role-cyan: "#0e7490"
typography:
  display:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.5rem, 5.2vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 4.2vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.022em"
  title-card:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  wordmark:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.045em"
  price:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.75rem, 5vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\""
  lead:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(1.125rem, 1.6vw, 1.3125rem)"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.9688rem"
    fontWeight: 600
    lineHeight: 1.45
  button:
    fontFamily: "Rethink Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.005em"
  panel-display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
  panel-body:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  panel-num:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontWeight: 500
    letterSpacing: "-0.02em"
rounded:
  pill: "999px"
  field: "28px"
  demo: "24px"
  dialog: "22px"
  notice: "18px"
  bubble: "16px"
  window: "14px"
  control: "12px"
  panel: "10px"
spacing:
  gutter: "clamp(16px, 4vw, 40px)"
  section: "clamp(72px, 10vw, 128px)"
  section-head: "clamp(40px, 6vw, 72px)"
  column-gap: "clamp(32px, 6vw, 96px)"
  container: "1200px"
  header: "72px"
components:
  button-coral:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink-plum}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-coral-hover:
    backgroundColor: "{colors.coral-hover}"
  button-coral-large:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink-plum}"
    rounded: "{rounded.pill}"
    padding: "0 30px"
    height: "58px"
  button-ameixa:
    backgroundColor: "{colors.ameixa}"
    textColor: "{colors.card-white}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-ameixa-hover:
    backgroundColor: "{colors.ameixa-deep}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ameixa}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-outline-hover:
    backgroundColor: "{colors.ameixa}"
    textColor: "{colors.card-white}"
  button-light:
    backgroundColor: "{colors.lilac-light}"
    textColor: "{colors.ink-plum}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  demo-button:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ameixa}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "46px"
  demo-button-pressed:
    backgroundColor: "{colors.ameixa}"
    textColor: "{colors.card-white}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted-plum}"
    typography: "{typography.label}"
    padding: "14px 18px"
  tab-selected:
    textColor: "{colors.ink-plum}"
  demo-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.body-plum}"
    rounded: "{rounded.demo}"
    padding: "clamp(22px, 3vw, 34px)"
  plan-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.body-plum}"
    rounded: "{rounded.field}"
    padding: "36px"
  plan-card-featured:
    backgroundColor: "{colors.ink-plum}"
    textColor: "{colors.lilac-muted}"
    rounded: "{rounded.field}"
    padding: "36px"
  notice-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.body-plum}"
    rounded: "{rounded.notice}"
    padding: "14px 16px"
  story-card:
    backgroundColor: "{colors.ink-plum}"
    textColor: "{colors.lilac-light}"
    rounded: "{rounded.field}"
    padding: "24px"
  chat-input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-plum}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "46px"
---

# Design System: Finora

<!-- impeccable:design-schema 1 -->

## Overview

**Creative North Star: "The App, Held Up to the Light"**

Finora has two surfaces that share one brand (the name, the "A medida" mark, Nora) and diverge in register by mode:

- **Persuade — the public landing** (`frontend/index.html` + `css/site.css` + `css/logo.css` + `js/site.js` + `js/logo.js`, route `/`). The Brazilian personal-finance category standard played straight, at the finish of Nubank and Mobills/Organizze (PRODUCT.md standing preference). An ameixa field opens the page and another closes it; between them, warm white and lilac paper sections alternate with two flat ink-plum bands (devices, security). The product is the imagery: one real phone in the hero whose captured screens scroll and are tapped like a phone, a desktop window and a phone side by side, and small hand-built demos that are labelled as examples and respond to touch. Big tightly tracked Rethink Sans, one short sentence per idea, pill buttons, one coral action on dark. The only background figure is the mark's own watch bezel.
- **Operate — the authenticated panel** (`frontend/app/`, everything past login). Neutral plum-tinted surfaces, a single ameixa accent for primary actions and current state, fixed semantic role colors, Schibsted Grotesk / Public Sans / IBM Plex Mono, restrained Corporate motion, light/dark/auto theming. Not changed by the landing revisions.

Confirmed rejections for the landing world (owner, 2026-10-04/05): metaphor worlds (metrô, carnê, zine, cockpit, "folhinha"); ornament standing in for product — aurora blobs, cursor light, floating money, 3D icon tiles, tilt/parallax, generic grids or dot meshes; an AI/template look; too much text.

**Key Characteristics:**
- Ameixa field gradients open (ink plum → mid → ameixa) and close (ameixa → mid → ink plum) the landing; flat ink-plum bands carry devices and security.
- Real app captures in real-looking device frames are the heavy containers; demos are white cards labelled as examples.
- Coral is the single action color on dark; ameixa is the action on light.
- Rethink Sans throughout the landing, tight display tracking, tabular figures everywhere; lowercase "finora" wordmark.
- The "A medida" mark is the brand's one figure: five arcs, a hand, and on large sizes a 60-tick bezel that also rings the hero.
- Premium, precise motion on one curve, `cubic-bezier(.2, 0, 0, 1)`, with a 200 / 350 / 600 ms palette.

## Colors

A warm-plum palette: near-black plum ink, a saturated ameixa stepping lighter through the mark's arcs, one hot coral, and paper whites tinted toward lilac and peach.

### Primary
- **Ameixa** (`ameixa`): the action on light (filled and outline buttons, demo buttons, links, FAQ "+", the tab cursor, carousel-arrow hover, visitor chat bubbles, range sliders, focus ring on light), the first and longest arc of the mark on light. White text on it.
- **Deep Ameixa** (`ameixa-deep`): hover of ameixa fills only.
- **Mid Ameixa** (`ameixa-mid`): middle stop of the field gradients and center of the intro's radial field; never a flat fill.
- **Arc steps** (`arc-2`, `arc-3`, `arc-4` on light; `arc-dark-1…4` on dark): the mark's four plum arcs, getting lighter on light and darker on dark so the fifth (coral) always reads as the end. Mark only.

### Secondary
- **Signal Coral** (`coral`): the one action color on dark — header "Testar grátis", hero and closing CTAs, the featured plan's button, the mobile fixed CTA — plus small pointers to what matters: the mark's last arc, hub and seconds hand, the active pager dot, "Dia N" chips, the "Sai mais em conta" badge, trust-strip icons, the security packets and checks, the month the reserve is ready. Always ink-plum text (≈6:1); never white text, never body text on light, never "negative". Hover lightens to `coral-hover`.

### Neutral
- **Ink Plum** (`ink-plum`): headings on light, scrolled header, the devices and security bands, the featured plan, story-card base, chat header, the "due" day tile; first stop of the opening field. Also the panel's `--text`.
- **Body Plum** (`body-plum`) / **Muted Plum** (`muted-plum`): running text / intros, notes, captions, unselected tabs, price units.
- **Warm White** (`warm-white`): page background, default sections, chat message area. **Lilac Paper** (`lilac-paper`): alternate sections (stories, plans), empty demo tracks and tiles, Nora's demo bubbles. **Card White** (`card-white`): notice, demo cards, plan cards, window body, chat panel.
- **Hairline** (`hairline`): every 1px divider (tab rule, FAQ, plan border, chat form, demo notice) and outlines of round arrows and demo suggestion pills.
- **Lilac Light** (`lilac-light`) / **Lilac Muted** (`lilac-muted`): text on dark — emphasis and the light button / leads, notes, nav, footer links.
- **Footer Night** (`footer-night`): the footer and the outer edge of the intro field. **Bezel** (`bezel`): phone frame and notch only.
- **Check Green** (`check-green`): checks in the plan list, the paid state in the bills demo, a budget under 80% (the panel's income/ok). **Mint Check** (`mint-check`): checks and the sync icon on dark. **Signal Amber** (`signal-amber`): the demo bar for a new installment and the budget meter at ≥80%; red `role-red` when over.
- **Focus on Dark** (`focus-on-dark`): outline on dark bands, security node icons, links on dark. **Selection Peach** (`selection-peach`): `::selection`.
- Notice tints (icon tile background / glyph): due `#fdecd6` / `role-amber`; Open Finance `#e3f5ee` / `check-green`; card `#f3e6fa` / `ameixa`.

### Panel (Operate) colors
Panel tokens live in `frontend/app/styles.css` and are recorded, not changed, here. Light: bg `panel-bg`, surface white, `--panel #fcfafb` (sidebar), surface-2 `panel-surface-2`, border = hairline, text = ink plum, muted = muted plum, primary = ameixa, primary-2 `panel-primary-2`, primary-bg `panel-primary-bg`; filled buttons read `--btn-1/--btn-2` (`#5b2a86 → #7b3fa8`). Dark: bg `#150c1b`, surface `#1f1427`, surface-2 `#2a1d33`, border `#3a2a45`, text `#f3eaf5`, muted `#a897b0`, primary `#c9a6f0`, primary-2 `#9f6fd6`, primary-bg `#2c1b3d`, buttons `#7a45b3 → #8a55c4`. Role colors, each with a `-bg` tint: green `check-green` (income/ok), red `role-red` (danger/overrun — the only danger color), amber `role-amber` (due/attention), violet `role-violet` (installments/analysis), cyan `role-cyan` (sync/info); dark variants `#4ade80 / #fb7185 / #fbbf24 / #a5b4fc / #22d3ee`. User-chosen category colors are data, not tokens.

**Theming (panel only).** Claro, Escuro, Automático (default, follows `prefers-color-scheme`), on `document.documentElement.dataset.theme`, persisted per device. Light values on `:root`; dark values defined twice with identical tokens (media query and `[data-theme="dark"]`). No component branches on theme. The landing is light/dark by section, not themed.

### Named Rules
**The One Hot Color Rule.** Coral marks the action on dark and small pointers to what matters (the mark's last arc, active dot, chips, badge, packets, the finish month). If coral appears on light as a large fill or as text, it is wrong.

**The Two Actions Rule.** Coral on dark, ameixa on light. A light section's main action is ameixa (filled, outline or demo button); a dark field's is coral. The featured (dark) plan carries coral; the light plan carries the ameixa outline.

**The Fields Are Ameixa Rule.** Section fields use only ink plum, mid ameixa and ameixa at 165°, never coral, never on text. The old three-stop gradient (`#5b2a86 → #a8488f → #ff7a59`) is not used anywhere on the landing; it survives only in the retired F tile and Nora's avatar (see Open items).

## Typography

**Display Font:** Rethink Sans (with system-ui, -apple-system, Segoe UI)
**Body Font:** Rethink Sans
**Panel:** Schibsted Grotesk (display) + Public Sans (body) + IBM Plex Mono (money values)

**Character:** One friendly, slightly geometric grotesk at every size on the landing — confident at 72px with tight tracking, plain at 17px. Weights 400/500/600/700/800; tabular figures on the body so every R$ value aligns.

### Hierarchy
- **Display** (`display`): the hero h1 only, max 14ch (16ch ≤1080px); `clamp(2.25rem, 10.4vw, 2.75rem)` on phones.
- **Headline** (`headline`): section h2s; the closing h2 runs `clamp(2.25rem, 4.6vw, 3.75rem)` at -0.03em, max 15ch.
- **Title** (`title`): the h3 of each "Na prática" panel.
- **Card title** (`title-card`): story-card h3 over photos.
- **Wordmark** (`wordmark`): "finora", always lowercase, beside the mark in header and footer; the intro sets it at 700, `clamp(2.5rem, 5vw, 3.25rem)`, same -0.045em.
- **Price** (`price`): plan prices; "R$" 700 1.25rem and "/mês" 600 1.0625rem in muted plum.
- **Lead** (`lead`): the hero lead (max 34ch); section intros 1.1875rem muted plum (max 52ch); panel text in demos 1.125rem (max 40ch).
- **Body** (`body`): 1.0625rem/1.6 (1rem on phones); paragraphs 44–64ch.
- **Label** (`label`): nav, trust strip, tabs (600 1rem), list items, captions. Small notes 0.8125–0.875rem.
- **Button** (`button`): 700, 1rem (1.0625rem large, 0.9375rem small, 0.9688rem demo).

### Named Rules
**The Tight Display Rule.** Headings are 700 with negative tracking (-0.022em; -0.03em for display and closing) and `text-wrap: balance`. Never uppercase, never letterspaced-out.

**The No Label Above Heading Rule.** Section headers are an h2 plus at most one plain sentence. The only small label above a heading is the "Dia N" chip on a story card, and it carries data (the date), not a category.

## Layout

Landing: a 1200px container with a fluid `gutter`, sections padded by `section`, headers separated from content by `section-head`. Content sections lead from the left; dark bands and plans center their header. Order: hero field → Na prática → No computador e no celular (ink plum) → Um mês como qualquer outro (lilac) → Segurança (ink plum) → Planos (lilac) → Dúvidas → closing field → footer.

- **Hero:** text 1.05fr / showcase 0.95fr. The showcase is its own grid: notice card in the left column (aligned right, max 300px), the phone in a fixed column `clamp(240px, 21vw, 280px)`, and under both a row with the pager dots and the "Telas reais do app · valores ilustrativos" note. A trust strip of four items closes the field above a 14% white rule.
- **Na prática:** a scrollable tab row on a hairline, then a panel of text 0.85fr / demo 1.15fr (min-height 380px), and a right-aligned "valores ilustrativos" note.
- **Devices band:** window `1fr` + phone `clamp(190px, 18vw, 240px)`, bottoms aligned, max 1040px, a centered sync line below.
- **Stories:** a native snap carousel (cards `clamp(270px, 31%, 370px)`), round arrows beside the header.
- **Security:** a five-column data path (node · rail · node · rail · node, max 1000px), then a two-column hairline-ruled checklist (max 960px, 48px gap), then a centered note.
- **Plans** two cards max 380px; **FAQ** 0.7/1.3 with 5 questions; **closing** 1.2/0.8 with a phone cropped by the section bottom.
- Fixed header 72px (64px ≤900px), transparent over the hero, ink plum once scrolled 12px.

Breakpoints: ≤1080px the hero stacks (showcase max 600px, phone 250px), trust strip 2-up; ≤900px every two-column grid stacks, the menu becomes an ink-plum dropdown, the bezel ring is hidden, footer 2-up; ≤640px body 1rem, hero CTA full width, the notice moves below the phone at full width, the pager row spreads, the data path turns vertical, the devices band stacks (window shows an enlarged crop), checklists go single column, and a frosted warm-white fixed CTA bar appears outside the hero, plans, closing and footer.

Panel layout is unchanged: sidebar + view, cards on the page background, bottom nav on phones.

## Elevation & Depth

Hybrid: sections are flat color; depth belongs to objects — devices, windows, the notice, demo cards, the featured plan, the chat. Shadows are soft, offset downward and plum- or black-tinted, never centered glows.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px rgba(42,22,51,.06), 0 8px 24px -8px rgba(42,22,51,.14)`): demo cards on light.
- **Device** (`box-shadow: 0 2px 6px rgba(20,8,28,.18), 0 30px 60px -20px rgba(20,8,28,.45)`): phones (with an inset 1.5px `#3b2a45` rim), the notice card, the featured plan.
- **Device on dark** (`box-shadow: 0 4px 12px rgba(0,0,0,.3), 0 40px 90px -30px rgba(0,0,0,.75)`): the window on the ink-plum devices band.
- **Dialog** (`box-shadow: 0 4px 12px rgba(20,8,28,.12), 0 30px 80px -20px rgba(20,8,28,.5)`): the Nora chat panel.
- **Header** (`box-shadow: 0 1px 0 rgba(255,255,255,.08), 0 10px 30px -12px rgba(0,0,0,.5)`): scrolled header; the mobile menu uses `0 20px 40px -10px rgba(0,0,0,.5)`.
- **Mark** (SVG `feDropShadow` dy 1, blur 1, ink plum at 22% on light, `#0b0510` at 50% on dark): under the arcs and hands only.
- Panel: `--shadow-sm`, `--shadow`, `--shadow-lg` — values in `styles.css`.

### Named Rules
**The Objects Cast Shadows Rule.** Only things that would cast a shadow in life get one: a phone, a window, a notification, a card you can touch, the featured plan. Section backgrounds, text blocks and list rows are flat.

## Shapes

Generous, friendly rounding against straight section edges. Pills for every button, chip, badge and pager dot. Plan and story cards 28px (`field`), demo cards 24px, chat panel 22px, notice 18px, chat bubbles and the demo notice 16px (6px tail corner on bubbles), windows and day tiles 14px, icon tiles and small controls 12px, demo bar tracks and the panel 10px. Security nodes are circles (76px; the Finora node 92px with a coral hairline). The phone is proportional: outer radius 15%/7%, screen 12%/5.6%, notch a pill 28% wide, status bar and the app's own tab bar (16.15cqw) sized in container-query units. Line icons are 24px-grid SVG strokes (1.8, round caps), never glyphs or 3D tiles.

**The mark is geometry, not illustration:** a 64-unit circle, radius 22, stroke 9, five butt-capped arcs at 38·24·16·12·10% with 7° gaps starting at 12 o'clock, a tapered hand with a counterweight, a 2.2 hub with a 0.85 coral pin. Static files: `img/marca/finora-marca.svg` (light), `finora-marca-escura.svg` (dark), `finora-icone.svg` (dark tile, 15/64 radius, favicon and touch icon).

## Components

### Buttons
Confident pills, solid color, no gradients, no glow.
- **Shape:** full pill, 2px border slot, min-height 48px (58px large, 42px small).
- **Coral** (`button-coral`): action on dark; ink-plum text; hover `coral-hover`.
- **Ameixa** (`button-ameixa`): action on light; white text; hover `ameixa-deep`.
- **Outline** (`button-outline`): the monthly plan; fills ameixa on hover.
- **Light** (`button-light`): non-conversion action on ink plum; hover white.
- **Demo** (`demo-button`): 46px ameixa-outline pill on white inside demo cards, hover lilac paper, `aria-pressed="true"` fills ameixa (the "paid" button fills check green).
- **Text link button:** plain underlined ameixa (opens the chat).
- **States:** active scales to 0.97; a trailing arrow nudges 3px right on hover; focus is a 3px ameixa outline offset 3px (`focus-on-dark` on dark bands).
- **Round arrows:** 48px circles, white, 1.5px hairline; hover ameixa; disabled 40% opacity.

### Chips, badges, dots
- **Day chip:** coral pill, ink-plum 800 at 0.875rem — only on story cards.
- **Plan badge:** coral pill top-right of the featured plan.
- **Suggestion pills:** 40px; in the Nora demo hairline-bordered and turning ameixa when pressed; in the chat ameixa-outline, filling on hover.
- **Pager dots:** 32px hit area, a 24×8 pill scaled to a dot (white 35%) when idle and stretched to full width in coral when current (`aria-pressed`).

### Tabs ("Na prática")
WAI-ARIA tablist with roving tabindex, ←/→/Home/End. Labels 600 1rem muted plum, ink plum when hovered or selected. One 3px ameixa cursor rides the hairline under the row, moved and sized by `transform` (350ms). Five panels: Parcelas, Contas que vencem, Orçamento, Reserva, Nora.

### Cards / Containers
- **Demo cards** (`demo-card`): white, 24px, Lift shadow, a muted 600 title, one control (demo button, range slider with `accent-color` ameixa, or suggestion pills) and a live-region sentence that states the result. Their figures reconcile with the hero captures. Bars and meters move by `scaleX/scaleY`, never width/height.
- **Plan cards** (`plan-card`, `plan-card-featured`): 28px, 36px padding (28px on phones); light card with hairline; featured ink plum, borderless, Device shadow. Button pinned to the bottom, full width.
- **Story cards** (`story-card`): 4:5 photo, 28px, ink-plum scrim from 34%, day chip, white title, one "Com a Finora" line with a mint check. Photo scales 1.035 on hover.
- **Security checklist:** rows ruled by 12% white, a coral drawn check, bold white lead-in then muted text.

### Inputs / Fields
- **Chat input** (`chat-input`): 46px, 1.5px hairline, 12px, white. Focus: ameixa border + 3px `#e6d6f1` ring. Send button 46px ameixa square, 50% opacity while answering.
- **Range sliders** (demos): native, full width, 28px tall, ameixa accent, with a labelled `<output>` showing the value.

### Navigation
Header: the live mark (40px, dark theme) + "finora" wordmark left, links in lilac muted 600 turning white on hover and for the section in view, "Entrar" text link + small coral pill right. ≤900px a 44px two-bar button opens an ink-plum dropdown with large links, "Entrar" and the full coral CTA; Esc closes. Footer: footer-night, brand + three link groups, base row with the illustrative-content disclaimer.

### The mark, live (signature)
`FinoraLogo.mount(svg, { tema, intro, vivo, detalhe, dur, espera })` in `js/logo.js`. Intro: the five arcs draw in with a 110ms stagger, the hand sweeps one revolution on an in-out cubic, lighting each arc it crosses, and settles on the coral arc with a 0.8° mechanical detent over 220ms. At ≥96px (or `detalhe: true`) a 60-tick bezel (12 major ticks) rotates in and a thin coral seconds hand shows the real seconds continuously. Hover replays one reading revolution (1.6s). Seconds pause off screen and with the tab hidden; under reduced motion the final state is drawn still. The mark uses its own timing in `css/logo.css` (`cubic-bezier(.4, 0, .2, 1)`), outside the UI curve.

### Intro ("abertura")
Once per session (`sessionStorage['finora-abertura']`), never under reduced motion: a full-screen radial ameixa field with the mark at `clamp(170px, 22vw, 240px)` in full detail, the "finora" wordmark and a small descriptor line rising after it. Timeline: arcs draw in 70ms steps (500ms each), the hand reads the month in 1.15s and settles, the wordmark is revealed by a mask at 0.85s, the descriptor fades in at 1.05s; at 2.1s (or on any click or key) the content lifts 16px and fades in 200ms while the curtain wipes upward (`clip-path`, 600ms, exit faster than entrance). The hero choreography starts as the curtain lifts: h1 mask-reveal 600ms, lead +100ms, CTA +180ms, phone +120ms, notice +420ms, trust strip +300ms; the phone tour starts 1.4s after the curtain. Scroll reveals apply only to objects (demo card, desktop+phone, story cards, data path, plans, closing phone), never to text; lists stagger 60ms per item, capped at 240ms.

### Hero phone and notice (signature motion)
One realistic phone. Each full-length capture (`img/app-celular/f-*.webp`, 780px wide) scrolls inside the screen to its stop (1.1s, ease-out), rests, then a ripple taps the next tab on the app's real tab bar (`n-*.webp`, crossfaded 120ms linear), and 150ms later the next screen pushes in from the right (380ms) while the old one slides 28% left and dims. Painel → Lançamentos → Cartões. The notice card beside the phone swaps to the matching real alert (text fades and blurs 3px out and rises back, icon tile retints). The bezel ring behind the hero advances 6° (one tick) per screen. Pauses on hover, focus inside, off screen and hidden tab; starts after the intro and the phone's entrance; under reduced motion nothing advances by itself and the dots swap instantly.

### Devices band
A light browser window (36px `panel-surface-2` chrome, three `#d9cddf` dots, "finora · Painel") with the real desktop capture `painel-desk.webp`, beside a phone showing the same month. Captures are never tilted, blurred or edited; crops are allowed.

### Security data path
Bank → Finora → you: three circular nodes (bank and person line icons in `focus-on-dark`; the Finora node holds the live mark, mounted when 60% visible) joined by dashed rails on which three coral packets travel (2.6s loop, staggered thirds), captioned "Open Finance · só leitura" and "conexão criptografada". Vertical on phones.

### Nora pre-sales chat
`#atende`: 400×600 white panel bottom-right (bottom sheet ≤640px), ink-plum header with the Nora avatar, warm-white message area, ameixa visitor bubbles and white hairline Nora bubbles, typing dots while a reply is pending, suggestion pills, e-mail fallback. Opens from `[data-abre-chat]`, Esc closes and returns focus. Backend `/api/vendas/chat`.

### Motion (landing)
One UI curve, `cubic-bezier(.2, 0, 0, 1)`, and three durations: 200ms (color, press, input feedback), 350ms (state swaps, tab cursor, header background, notice), 600ms (entrances, reveals, bar heights, the bezel step). Deliberate exceptions: the 380ms screen push, the 450ms tap ripple, the 120ms linear tab-bar crossfade, the 600ms intro curtain (accelerating exit curve `cubic-bezier(.7, 0, .2, 1)`) and the mark's own curve. Entrance: the h1 is revealed by a clip-path mask, then lead/CTA rise 14px at 100/180ms, the phone rises 32px, the notice arrives from the left at 420ms. Scroll reveals: objects only (16px rise + fade, the desktop window opens by clip-path), lists stagger 60ms per item (cap 240ms); text is never hidden. Feedback: tab panels fade/rise 8px in 300ms, changed numbers count up in 350ms, FAQ answers fade in 250ms. Nothing loops forever except the mark's seconds hand, the security packets and the chat's typing dots. Hidden starting states exist only under `html.js-anim`, added only when motion is allowed and IntersectionObserver exists.

### Panel components (Operate, unchanged)
- **Buttons** (`.btn`): default/hover/active/disabled/loading/focus-visible. `.primary` = `--btn-1 → --btn-2` with a neutral shadow that grows on hover and presses on active; `.danger` tinted; `.loading` spinner via `::after`.
- **Inputs:** brand focus ring; `:invalid:not(:placeholder-shown)` / `.invalid` get a red border and red-tinted ring.
- **Bars/progress** (`.bar > i`): `transform: scaleX()` from the left, never `width`.
- **Chips and alerts:** status chips by role; stat tiles tinted by meaning; alerts tinted by level with a colored title, no side stripe; active nav on primary-bg.
- **Patterns:** `askConfirm()` dialog replaces native confirm/prompt (account deletion requires typing EXCLUIR); transaction bulk bar; keyboard `N` new transaction, `/` search; due alerts "Vence hoje / amanhã / em N dias".
- **Motion (Corporate):** `--ease cubic-bezier(0.2, 0, 0, 1)`; `--dur-quick .15s`, `--dur-standard .28s`, `--dur-slow .42s`; vendored GSAP for view entrance + card stagger, dashboard count-up, no-overshoot error shake, toasts, bell pulse on new alerts. All motion checks `prefers-reduced-motion`.
- **Login canvas:** `#authCanvas`, a quiet brand-colored particle network, self-pausing.
- **Onboarding:** `#onboarding` full-screen stepped wizard, all fields optional, gated by `User.onboarded_at`.

## Do's and Don'ts

### Do:
- **Do** show the product: a real capture in a phone or browser frame, labelled as real screens with illustrative values; hand-built demos only when interactive and labelled as examples.
- **Do** keep the phone behaving like a phone: content scrolls inside the screen, a visible tap on the real tab bar, the next screen pushes in from the right.
- **Do** keep cards, chips and notices beside a device, never on top of app data.
- **Do** open and close the landing on the ameixa field gradients (165°) and keep middle sections flat.
- **Do** use coral with ink-plum text for the action on dark, and ameixa with white text for the action on light.
- **Do** keep copy to an h2 and one sentence per section; demo panels to a title and one sentence.
- **Do** use `cubic-bezier(.2, 0, 0, 1)` at 200 / 350 / 600 ms for UI motion, and pause anything self-moving off screen, on hover/focus and with the tab hidden.
- **Do** gate every hidden-to-animate state behind `html.js-anim` and render the final state under reduced motion.
- **Do** keep the panel on its own tokens in `styles.css`; landing and panel share palette and brand, not stylesheets.

### Don't:
- **Don't** add aurora blobs, glow halos, grids, dot meshes, cursor light, floating money, 3D icon tiles, tilt or parallax to the landing; the mark's bezel is the only background figure.
- **Don't** put the three-stop gradient on text, buttons, the mark or section fields.
- **Don't** set body text or large fills in coral on light surfaces, or use coral to mean "negative" (red `#be123c` is the only danger color).
- **Don't** tilt, blur or edit the content of an app capture (crops are fine); never present an illustration as a screen.
- **Don't** add small labels or kickers above section headings.
- **Don't** use bounce, overshoot or wobble; the mark's 0.8° detent is the only settle.
- **Don't** imply customers: no testimonials, ratings or user counts; story people are declared invented.

## History

Landing v3–v9.6 (2026-09-23 → 10-04) moved through a SaaS page, "Extrato anotado", the wall-calendar world and layers of ornament; the palette became ameixa + coral on 2026-09-29. The 2026-10-05 rebuild set the category-standard world; the same day's revision brought the "A medida" mark and its live version, the intro, the single tapped phone with the bezel ring, the "Na prática" demos, the devices band and the security data path, and removed the "E ainda tem mais" carousel, the stories CTA band, the Nora section, the feature rows and the background grid. Details live in git history.

## Open items

- The F-tile mark with the three-stop gradient is retired on the landing but still ships as `/icon.svg` in the app, its manifest, the login and the legal pages; PRODUCT.md still describes Nora as built from the F mark.
- `index.html` preloads `/img/telas-celular/painel.webp`, which the hero no longer shows (it uses `img/app-celular/f-painel.webp`).
- The intro's descriptor ("controle financeiro") is the one uppercase, widely tracked line on the page; it is not a pattern to reuse.
- Legal pages still load Bricolage Grotesque + `finora.css`; the login still has an `.fa-eyebrow` ("Área do cliente") above its heading. Neither is part of this system.
- `site.css` declares `--ease` and `--ui` with the same value; the header background transition has no curve.
