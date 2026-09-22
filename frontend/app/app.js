/* Finora — frontend SPA (vanilla JS) */
const PLUGGY_CONNECT_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js";
const GOOGLE_IDENTITY_SRC = "https://accounts.google.com/gsi/client";

const state = { token: localGet("finora_token"), user: null, cats: [], accounts: [], charts: [] };
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fdate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "";
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const canEdit = () => state.user?.workspace_role !== "viewer";

// Ícones: Lucide (traço único, peso consistente — nunca emoji como substituto de sistema
// de ícones). Cada entrada é o miolo do SVG (paths/shapes), envolvido por navIcon() abaixo.
const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  transactions: '<path d="M12 17V7"/><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"/><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>',
  cards: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><path d="M6 14h2"/>',
  accounts: '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  patrimonio: '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  contracts: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  incomes: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  categories: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  goals: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  reserve: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
  advisor: '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  market: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  bank: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  admin: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  more: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  receivables: '<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/>',
  taxes: '<path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L6 18l-4 1 1-4Z"/><path d="m14.5 6.5 3 3"/><path d="M3 21h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const navIcon = (id) => `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ""}</svg>`;

/* ------------------------------------------------------------------ aparência (claro/escuro/automático) */
const THEME_ORDER = ["light", "dark", "auto"];
const THEME_ICON = { light: "sun", dark: "moon", auto: "monitor" };
const THEME_LABEL = { light: "Claro", dark: "Escuro", auto: "Automático (sistema)" };
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  const btn = $("#themeBtn");
  if (btn) btn.innerHTML = navIcon(THEME_ICON[mode] || THEME_ICON.auto);
  if (btn) btn.title = `Aparência: ${THEME_LABEL[mode] || THEME_LABEL.auto} — clique para trocar`;
}
function setTheme(mode) {
  localSet("finora_theme", mode);
  applyTheme(mode);
  const icon = $("#themeBtn .nav-icon");
  if (icon && window.gsap && !reducedMotion()) {
    gsap.fromTo(icon, { rotate: -90, autoAlpha: 0, scale: .6 }, { rotate: 0, autoAlpha: 1, scale: 1, duration: MOTION.quick, ease: MOTION.ease });
  }
}
applyTheme(localGet("finora_theme") || "auto");
$("#themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme || "auto";
  setTheme(THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length]);
};

const KINDS = { checking: "Conta corrente", savings: "Poupança", investment: "Investimentos", cash: "Dinheiro", credit_card: "Cartão de crédito" };
const INCOME_KINDS = { salary: "Salário", freelance: "Freelance/serviços", rent: "Aluguel recebido", dividends: "Dividendos", other: "Outra" };
const ASSET_KINDS = { imovel: "Imóvel", veiculo: "Veículo", outro: "Outro bem" };

const ROUTES = [
  { id: "dashboard", label: "Painel", icon: "dashboard", mobile: true, primary: true },
  { id: "transactions", label: "Lançamentos", icon: "transactions", mobile: true, primary: true },
  { id: "cards", label: "Cartões", icon: "cards", mobile: true, primary: true },
  { id: "accounts", label: "Contas", icon: "accounts", primary: true },
  { id: "patrimonio", label: "Patrimônio", icon: "patrimonio", primary: true },
  { id: "market", label: "Mercado e simulador", icon: "market", primary: true },
  { id: "contracts", label: "Contratos e fixas", icon: "contracts" },
  { id: "receivables", label: "Contas a receber", icon: "receivables" },
  { id: "incomes", label: "Renda", icon: "incomes" },
  { id: "categories", label: "Categorias e regras", icon: "categories" },
  { id: "goals", label: "Metas", icon: "goals" },
  { id: "reserve", label: "Reserva de emergência", icon: "reserve" },
  { id: "advisor", label: "Consultor", icon: "advisor", mobile: true },
  { id: "bank", label: "Conexões bancárias", icon: "bank" },
  { id: "taxes", label: "Impostos", icon: "taxes" },
  { id: "settings", label: "Configurações", icon: "settings" },
];
function visibleRoutes() {
  return state.user?.is_admin ? [...ROUTES, { id: "admin", label: "Administração", icon: "admin" }] : ROUTES;
}

/* ------------------------------------------------------------------ API */
async function api(path, opts = {}) {
  const headers = { ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  Object.assign(headers, opts.headers || {});
  const res = await fetch("/api" + path, {
    method: opts.method || (opts.body ? "POST" : "GET"), headers,
    body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && state.token) { logout(); throw new Error("Sessão expirada"); }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(Array.isArray(d) ? d.map((x) => x.msg).join("; ") : d || "Erro na requisição");
  }
  return data;
}

function shakeEl(sel) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (!el) return;
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
}
function toast(msg, type = "info") {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden", "success", "error");
  if (type !== "info") t.classList.add(type);
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 3200);
}

/* ------------------------------------------------------------------ auth */
// Login (Google) e MFA (TOTP) são geridos inteiramente pelo Supabase Auth no browser —
// o backend nunca vê credencial nenhuma, só o token de sessão já pronto (ver ../auth.py).
let sb = null;

function logout() {
  sb?.auth.signOut();
  state.token = null; localSet("finora_token", null); location.hash = ""; showAuth();
}
$("#logout").onclick = logout;

function showAuth() {
  $("#app").classList.add("hidden"); $("#auth").classList.remove("hidden");
  $("#trialExpired")?.classList.add("hidden");
  $("#googleCard").classList.remove("hidden");
  $("#mfaCard").classList.add("hidden"); $("#mfaCard").innerHTML = "";
  startAuthCanvas();
  animateAuthCard();
  window.FinoraAuth?.entrar();
}
function animateAuthCard() {
  // Entrada do miolo estático (saudação, passos, botão do Google) já é feita via CSS
  // (.fa-r/.fa-on, disparada por FinoraAuth.entrar() em showAuth()). Isso aqui cobre só o
  // conteúdo do MFA, montado em runtime e sem essas classes.
  if (window.gsap && !reducedMotion()) {
    gsap.fromTo("#mfaCard:not(.hidden)", { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: MOTION.slow, ease: MOTION.ease });
  }
}

async function completeLogin() {
  const { data } = await sb.auth.getSession();
  state.token = data.session?.access_token || null;
  localSet("finora_token", state.token);
  boot();
}

/* depois do login Google, confere se a sessão já chegou em aal2 (2º fator confirmado);
   senão, mostra configurar (1ª vez) ou verificar (já tem fator) o autenticador. Nunca deixa
   a tela em branco: qualquer falha aqui cai de volta pra tela de login com um erro visível. */
async function ensureMfaThenBoot() {
  try {
    const { data: aal, error: aalErr } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) throw aalErr;
    if (aal.currentLevel === "aal2") { await completeLogin(); return; }
    const { data: factorsData, error: listErr } = await sb.auth.mfa.listFactors();
    if (listErr) throw listErr;
    const verified = factorsData?.totp?.find((f) => f.status === "verified");
    if (verified) { showMfaVerify(verified.id); return; }
    // limpa fatores TOTP não confirmados de uma tentativa anterior antes de gerar um QR novo
    for (const f of factorsData?.totp || []) await sb.auth.mfa.unenroll({ factorId: f.id });
    await showMfaSetup();
  } catch (err) {
    showAuth();
    $("#authError").textContent = err.message || "Não foi possível verificar sua sessão. Tente entrar de novo.";
  }
}

async function showMfaSetup() {
  $("#googleCard").classList.add("hidden");
  const card = $("#mfaCard");
  card.classList.remove("hidden");
  card.innerHTML = `<div class="empty">Preparando…</div>`;
  animateAuthCard();
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `finora-${Date.now()}` });
  if (error) { card.innerHTML = `<p class="error">${esc(error.message)}</p>`; return; }
  card.innerHTML = `
    <span class="fa-mono fa-eyebrow">Passo 2 de 2</span>
    <h2 class="fa-h">Proteja sua conta</h2>
    <p class="muted">Escaneie o QR code com um app autenticador (Google Authenticator, Authy, 1Password…) e digite o código que aparecer.</p>
    <img class="mfa-qr" id="mfaQr" src="${esc(data.totp.qr_code)}" alt="QR code para configurar o autenticador">
    <p class="small muted">Não consegue escanear? Digite manualmente: <code class="mfa-secret">${esc(data.totp.secret)}</code></p>
    <form id="mfaSetupForm">
      <input type="text" id="mfaSetupCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Código de 6 dígitos do app" required>
      <button class="btn primary" type="submit">Ativar MFA</button>
    </form>
    <p class="error" id="mfaError"></p>`;
  $("#mfaSetupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.classList.add("loading");
    try {
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: data.id });
      if (chErr) throw chErr;
      const { error: vErr } = await sb.auth.mfa.verify({ factorId: data.id, challengeId: ch.id, code: $("#mfaSetupCode").value });
      if (vErr) throw vErr;
      await completeLogin();
    } catch (err) { $("#mfaError").textContent = err.message; shakeEl("#mfaCard"); }
    finally { btn.disabled = false; btn.classList.remove("loading"); }
  });
}

function showMfaVerify(factorId) {
  $("#googleCard").classList.add("hidden");
  const card = $("#mfaCard");
  card.classList.remove("hidden");
  card.innerHTML = `
    <span class="fa-mono fa-eyebrow">Passo 2 de 2</span>
    <h2 class="fa-h">Confirme que é você</h2>
    <p class="muted">Digite o código de 6 dígitos do seu app autenticador.</p>
    <form id="mfaVerifyForm">
      <input type="text" id="mfaVerifyCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Código de 6 dígitos" required autofocus>
      <button class="btn primary" type="submit">Entrar</button>
    </form>
    <p class="error" id="mfaError"></p>`;
  animateAuthCard();
  $("#mfaVerifyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.classList.add("loading");
    try {
      const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: $("#mfaVerifyCode").value });
      if (vErr) throw vErr;
      await completeLogin();
    } catch (err) { $("#mfaError").textContent = err.message; shakeEl("#mfaCard"); }
    finally { btn.disabled = false; btn.classList.remove("loading"); }
  });
}

/* rede de pontos sutil no fundo do login — atmosfera, nunca dado real */
let _authCanvasRAF = null;
function startAuthCanvas() {
  const canvas = $("#authCanvas");
  if (!canvas || _authCanvasRAF) return;
  const ctx = canvas.getContext("2d");
  let w, h, particles;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(42, Math.round((w * h) / 26000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .16, vy: (Math.random() - .5) * .16,
    }));
  };
  const draw = () => {
    if (!w) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 130) {
          ctx.strokeStyle = dark ? "rgba(103,232,249,.16)" : "rgba(8,145,178,.12)";
          ctx.globalAlpha = 1 - d / 130;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = dark ? "rgba(129,140,248,.55)" : "rgba(79,70,229,.4)";
    for (const p of particles) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill(); }
  };
  resize();
  window.addEventListener("resize", resize);
  if (reducedMotion()) { draw(); return; }
  const loop = () => {
    if ($("#auth").classList.contains("hidden")) { _authCanvasRAF = null; return; }
    draw(); _authCanvasRAF = requestAnimationFrame(loop);
  };
  loop();
}

/* nonce exigido pelo Supabase pra casar com o ID token do Google (evita replay) — a
   versão hasheada (SHA-256) vai pro Google, a crua vai pro signInWithIdToken. */
async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function initAuth() {
  let cfg = {};
  try { cfg = await api("/public-config"); } catch { /* segue com cfg vazio, mostra erro abaixo */ }
  if (!cfg.supabase_url || !cfg.supabase_anon_key) {
    $("#authError").textContent = "Autenticação não configurada.";
    showAuth();
    return;
  }
  try {
    sb = supabase.createClient(cfg.supabase_url, cfg.supabase_anon_key);
  } catch {
    $("#authError").textContent = "Falha ao iniciar a autenticação. Recarregue a página.";
    showAuth();
    return;
  }
  sb.auth.onAuthStateChange((_event, session) => {
    state.token = session?.access_token || null;
    localSet("finora_token", state.token);
  });

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await ensureMfaThenBoot(); else showAuth();
  } catch {
    $("#authError").textContent = "Não foi possível recuperar sua sessão. Tente entrar de novo.";
    showAuth();
  }

  if (!cfg.google_client_id) {
    if (!session) $("#authError").textContent = "Login com Google não configurado.";
    return;
  }
  try {
    await loadScript(GOOGLE_IDENTITY_SRC);
    const rawNonce = crypto.randomUUID() + crypto.randomUUID();
    const hashedNonce = await _sha256Hex(rawNonce);
    window.google.accounts.id.initialize({
      client_id: cfg.google_client_id,
      nonce: hashedNonce,
      callback: async ({ credential }) => {
        try {
          const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: credential, nonce: rawNonce });
          if (error) throw error;
          await ensureMfaThenBoot();
        } catch (e) { $("#authError").textContent = e.message; shakeEl("#googleCard"); }
      },
    });
    window.google.accounts.id.renderButton($("#googleBtn"), { theme: "filled_black", shape: "rectangular", size: "large", text: "continue_with", width: 320, locale: "pt-BR" });
  } catch { $("#authError").textContent = "Não foi possível carregar o login do Google. Verifique sua conexão."; }
}

/* ------------------------------------------------------------------ shell */
const navLink = (r, cls = "") => `<a class="nav-item${cls ? " " + cls : ""}" href="#${r.id}" data-r="${r.id}">${navIcon(r.icon)}<span class="nav-label">${esc(r.label)}</span></a>`;
function buildNav() {
  const routes = visibleRoutes();
  const primary = routes.filter((r) => r.primary);
  const secondary = routes.filter((r) => !r.primary && r.id !== "admin");
  const admin = routes.find((r) => r.id === "admin");
  $("#nav").innerHTML = primary.map((r) => navLink(r, "primary")).join("")
    + `<div class="nav-divider" role="separator" aria-hidden="true"></div>`
    + secondary.map((r) => navLink(r)).join("")
    + (admin ? `<div class="nav-divider" role="separator" aria-hidden="true"></div>${navLink(admin, "admin")}` : "");
  $("#bottomNav").innerHTML = routes.filter((r) => r.mobile).map((r) => navLink(r)).join("")
    + `<a href="#more" data-r="more">${navIcon("more")}<span class="nav-label">Mais</span></a>`;
}
async function boot() {
  try { state.user = await api("/me"); } catch { return showAuth(); }
  if (state.user.trial_expired) return showTrialExpired();
  $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#userName").textContent = state.user.name;
  renderWorkspaceBanner();
  if (!$("#monthRef").value) $("#monthRef").value = today().slice(0, 7);
  buildNav(); await refreshRefs(); route();
  if (!state.user.onboarded) startOnboarding();
  apCheckNudges();
}
function renderWorkspaceBanner() {
  const el = $("#workspaceBanner"), owner = state.user.workspace_owner;
  if (!owner) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const roleLabel = state.user.workspace_role === "viewer" ? "somente leitura" : "pode editar";
  el.innerHTML = `${navIcon("users")} Você está vendo os dados de <strong>${esc(owner.name)}</strong> (${roleLabel}) <button class="btn small ghost" id="wbLeave" style="margin-left:auto">Sair desse acesso</button>`;
  el.classList.remove("hidden");
  $("#wbLeave").onclick = async () => {
    if (!confirm("Sair do acesso compartilhado? Você volta a ver só os seus próprios dados.")) return;
    await api("/shared-access/leave", { method: "POST" });
    state.user = await api("/me");
    renderWorkspaceBanner();
    await refreshRefs(); route();
    toast("Você saiu do acesso compartilhado", "success");
  };
}
function showTrialExpired() {
  $("#auth").classList.add("hidden"); $("#app").classList.add("hidden");
  let el = $("#trialExpired");
  if (!el) {
    el = document.createElement("div");
    el.id = "trialExpired";
    document.body.appendChild(el);
  }
  el.className = "";
  el.innerHTML = `<div class="te-card">
    <div class="brand big"><span class="logo">F</span> Finora</div>
    <h2>Seu período de teste acabou</h2>
    <p class="muted">Foram 10 dias grátis com acesso completo. Pra continuar usando, é só assinar:</p>
    <div class="te-planos">
      <div class="te-plano"><div class="te-preco">R$ 14,90<span>/mês</span></div><div class="small muted">Cobrança mensal</div></div>
      <div class="te-plano"><div class="te-preco">R$ 149,90<span>/ano</span></div><div class="small muted">Equivale a R$ 12,49/mês</div></div>
    </div>
    <a class="btn primary full" href="mailto:edivaldocoj85@gmail.com?subject=${encodeURIComponent("Quero assinar o Finora")}&body=${encodeURIComponent("Meu e-mail de acesso: " + state.user.email)}">Falar sobre a assinatura</a>
    <button class="btn ghost full" id="teLogout" style="margin-top:8px">Sair</button>
  </div>`;
  $("#teLogout").onclick = logout;
}
async function refreshRefs() {
  [state.cats, state.accounts] = await Promise.all([api("/categories"), api("/accounts")]);
}
function refDate() {
  const m = $("#monthRef").value || today().slice(0, 7);
  const t = today();
  if (t.startsWith(m)) return t;
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;
}
function monthRange() {
  const m = $("#monthRef").value || today().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  return [`${m}-01`, `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`];
}
window.addEventListener("hashchange", route);
$("#monthRef").addEventListener("change", route);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Identidade de movimento (arquétipo Corporate — ver DESIGN.md > Motion).
   Uma curva assinatura, três durações; o count-up é a única exceção deliberada
   (categoria "dramatic reveal", 600-1200ms, porque precisa dar tempo de ler os dígitos). */
const MOTION = { ease: "power2.out", quick: .15, standard: .28, slow: .42, reveal: .9 };

/* uma única sequência autoral: a view entra, os cards fazem stagger, os números sobem do zero */
function animateViewIn(view) {
  if (reducedMotion() || !window.gsap) return;
  gsap.killTweensOf(view);
  const cards = Array.from(view.querySelectorAll(":scope > .grid > .card, :scope > .card")).slice(0, 10);
  gsap.timeline()
    .fromTo(view, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: MOTION.standard, ease: MOTION.ease })
    .fromTo(cards, { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: MOTION.standard, ease: MOTION.ease, stagger: { each: .05 }, clearProps: "transform" }, .05);
  animateCounters(view);
}
function animateCounters(container) {
  const els = container.querySelectorAll("[data-count]");
  els.forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    if (reducedMotion() || !window.gsap) { el.textContent = brl(target); return; }
    const obj = { v: 0 };
    el.textContent = brl(0);
    gsap.to(obj, { v: target, duration: MOTION.reveal, delay: .15, ease: MOTION.ease, onUpdate: () => (el.textContent = brl(obj.v)) });
  });
}

function route() {
  if (!state.user) return;
  const id = location.hash.slice(1) || "dashboard";
  const r = visibleRoutes().find((x) => x.id === id) || (id === "more" ? { id: "more", label: "Menu" } : ROUTES[0]);
  document.querySelectorAll("[data-r]").forEach((a) => a.classList.toggle("active", a.dataset.r === r.id));
  $("#pageTitle").textContent = r.label;
  state.charts.forEach((c) => c.destroy()); state.charts = [];
  const view = $("#view");
  view.innerHTML = `<div class="empty">Carregando…</div>`;
  (VIEWS[r.id] || VIEWS.dashboard)(view)
    .then(() => animateViewIn(view))
    .catch((e) => { view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; });
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ modal / formulários */
function field(f, v) {
  const val = v ?? f.value ?? "";
  if (f.type === "select") {
    return `<label>${f.label}<select name="${f.name}" ${f.required ? "required" : ""}>${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  }
  if (f.type === "checkbox") return `<label class="check"><input type="checkbox" name="${f.name}" ${val ? "checked" : ""}> ${f.label}</label>`;
  if (f.type === "textarea") return `<label>${f.label}<textarea name="${f.name}" rows="3">${esc(val)}</textarea></label>`;
  return `<label>${f.label}<input name="${f.name}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : f.type === "number" ? 'step="0.01"' : ""} value="${esc(val)}" ${f.required ? "required" : ""} ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} placeholder="${esc(f.placeholder || "")}"></label>`;
}
function openForm({ title, fields, values = {}, onSubmit, onDelete, extra = "" }) {
  if (!canEdit()) { toast("Você tem acesso somente leitura a esses dados.", "error"); return; }
  const form = $("#modalForm"), dlg = $("#modal");
  form.innerHTML = `<h2>${esc(title)}</h2>${fields.map((f) => f.row ? `<div class="row">${f.row.map((x) => field(x, values[x.name])).join("")}</div>` : field(f, values[f.name])).join("")}${extra}
    <p class="error" id="formError"></p>
    <div class="modal-actions">${onDelete ? '<button type="button" class="btn danger" id="fDel" style="margin-right:auto">Excluir</button>' : ""}
    <button type="button" class="btn" id="fCancel">Cancelar</button><button class="btn primary" id="fSave">Salvar</button></div>`;
  const all = fields.flatMap((f) => f.row || [f]);
  $("#fCancel").onclick = () => dlg.close();
  if (onDelete) $("#fDel").onclick = async () => { if (confirm("Confirma a exclusão?")) { await onDelete(); dlg.close(); route(); } };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form), data = {};
    for (const f of all) {
      if (f.type === "checkbox") data[f.name] = fd.get(f.name) === "on";
      else {
        let v = fd.get(f.name);
        if (f.type === "number" || f.num) v = v === "" ? null : Number(v);
        else if (v === "" && f.nullable) v = null;
        data[f.name] = v;
      }
    }
    $("#fSave").disabled = true; $("#fSave").classList.add("loading");
    try { await onSubmit(data); dlg.close(); route(); }
    catch (err) { $("#formError").textContent = err.message; shakeEl(dlg); }
    finally { $("#fSave").disabled = false; $("#fSave").classList.remove("loading"); }
  };
  dlg.showModal();
}
const catOptions = (kind) => [["", "Automática"], ...state.cats.filter((c) => !kind || c.kind === kind).map((c) => [c.id, c.name])];
const accOptions = () => state.accounts.filter((a) => !a.archived).map((a) => [a.id, `${a.name}${a.kind === "credit_card" ? " (cartão)" : ""}`]);

function txForm(values = {}) {
  if (!state.accounts.length) { toast("Cadastre uma conta ou cartão primeiro."); location.hash = "accounts"; return; }
  const isEdit = !!values.id;
  const fields = [
    { name: "type", label: "Tipo", type: "select", options: [["expense", "Despesa"], ["income", "Receita"], ["transfer", "Transferência"]] },
    { name: "description", label: "Descrição", required: true },
    { row: [{ name: "amount", label: "Valor (R$)", type: "number", required: true, min: 0.01 }, { name: "date", label: "Data", type: "date", required: true }] },
    ...(isEdit ? [] : [{ row: [
      { name: "account_id", label: "Conta/cartão", type: "select", options: accOptions(), num: true },
      { name: "to_account_id", label: "Conta de destino (só transferência)", type: "select", options: [["", "—"], ...accOptions()], num: true, nullable: true },
      { name: "installments", label: "Parcelas", type: "number", step: 1, min: 1, max: 48 },
    ] }]),
    { name: "category_id", label: "Categoria", type: "select", options: catOptions(), num: true },
    ...(isEdit ? [{ name: "create_rule", label: "Aplicar esta categoria sempre para descrições parecidas", type: "checkbox" }] : []),
    { name: "notes", label: "Observações", type: "textarea" },
  ];
  openForm({
    title: isEdit ? "Editar lançamento" : "Novo lançamento", fields,
    values: { date: today(), installments: 1, type: "expense", ...values },
    extra: isEdit ? `<label>${values.has_receipt ? "Comprovante anexado" : "Anexar comprovante"}
      ${values.has_receipt ? `<div class="row" style="margin-top:4px"><a class="btn small" href="/api/transactions/${values.id}/receipt" target="_blank" rel="noopener">Ver comprovante</a><button type="button" class="btn small danger" id="rmReceipt">Remover</button></div>` : `<input type="file" id="receiptFile" accept="image/*,.pdf">`}
      </label>` : "",
    onSubmit: async (d) => {
      if (!d.category_id) d.category_id = null;
      if (d.type !== "transfer") d.to_account_id = null;
      else if (!d.to_account_id) throw new Error("Escolha a conta de destino da transferência.");
      const r = isEdit ? await api(`/transactions/${values.id}`, { method: "PATCH", body: d }) : await api("/transactions", { body: d });
      const file = $("#receiptFile")?.files[0];
      if (file) {
        const tid = isEdit ? values.id : r[0].id;
        const fd = new FormData(); fd.append("file", file);
        await api(`/transactions/${tid}/receipt`, { body: fd }).catch((e) => toast("Comprovante não anexado: " + e.message, "error"));
      }
      return r;
    },
    onDelete: isEdit ? () => api(`/transactions/${values.id}`, { method: "DELETE" }) : null,
  });
  if (isEdit && values.has_receipt) {
    $("#rmReceipt").onclick = async () => {
      await api(`/transactions/${values.id}/receipt`, { method: "DELETE" });
      toast("Comprovante removido", "success");
      $("#modal").close(); txForm({ ...values, has_receipt: false });
    };
  }
}
$("#quickAdd").onclick = () => txForm();

/* ------------------------------------------------------------------ alertas */
$("#alertsBtn").onclick = async () => {
  const alerts = await api("/alerts");
  const form = $("#modalForm");
  form.innerHTML = `<h2>Alertas</h2>${alerts.length ? alerts.map((a) => `<div class="alert-item ${esc(a.level)}"><strong>${esc(a.title)}</strong><div class="small">${esc(a.message)}</div><div class="small muted">${new Date(a.created_at + "Z").toLocaleString("pt-BR")}</div></div>`).join("") : '<div class="empty">Nenhum alerta por enquanto.</div>'}
  <div class="modal-actions"><button class="btn primary">Fechar</button></div>`;
  form.onsubmit = null;
  $("#modal").showModal();
  await api("/alerts/read", { method: "POST" });
  $("#alertBadge").classList.add("hidden");
};

/* ------------------------------------------------------------------ gráficos */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function chart(el, cfg) {
  Chart.defaults.color = cssVar("--muted"); Chart.defaults.borderColor = cssVar("--border");
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  const c = new Chart(el, cfg); state.charts.push(c); return c;
}
const monthLabel = (m) => { const [y, mo] = m.split("-"); return new Date(y, mo - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); };
const pct = (a, b) => (b ? Math.min(100, (a / b) * 100) : 0);
// preenchimento das barras de progresso via transform (evita animar `width`, que causa layout thrash)
const barFill = (p) => `transform:scaleX(${Math.max(0, Math.min(100, p)) / 100})`;

/* ------------------------------------------------------------------ views */
const VIEWS = {};

VIEWS.more = async (v) => {
  v.innerHTML = `<div class="card list">${visibleRoutes().map((r) => `<a class="li" style="text-decoration:none;color:inherit" href="#${r.id}">${navIcon(r.icon)}<div class="grow title">${esc(r.label)}</div><span class="muted">›</span></a>`).join("")}
  <a class="li" style="text-decoration:none;color:inherit" href="#" onclick="logout();return false">${navIcon("logout")}<div class="grow title">Sair</div></a></div>`;
};

let dashboardTrendMonths = 6;
VIEWS.dashboard = async (v) => {
  const d = await api(`/dashboard?ref=${refDate()}&months=${dashboardTrendMonths}`);
  $("#alertBadge").textContent = d.unread_alerts; $("#alertBadge").classList.toggle("hidden", !d.unread_alerts);
  if (d.unread_alerts > (state._lastAlertCount || 0) && window.gsap && !reducedMotion()) {
    gsap.fromTo("#alertsBtn", { scale: 1 }, { scale: 1.15, duration: MOTION.quick, ease: "power1.inOut", yoyo: true, repeat: 1 });
  }
  state._lastAlertCount = d.unread_alerts;
  const bal = d.month.income - d.month.expense;
  const empty = !d.accounts.length;
  v.innerHTML = `
  ${empty ? `<div class="card" style="margin-bottom:16px"><h2>Bem-vindo ao Finora</h2><p class="muted">Comece em 3 passos: <a href="#bank">conecte seus bancos</a> ou <a href="#accounts">cadastre contas e cartões</a>, informe sua <a href="#incomes">renda</a> e seus <a href="#contracts">contratos e contas fixas</a>.</p></div>` : ""}
  <div class="grid g4 keep2">
    <div class="card stat hero"><h3>Patrimônio líquido</h3><div class="value" data-count="${d.net_worth}">${brl(d.net_worth)}</div><div class="sub">Saldo ${brl(d.cash)} · Invest. ${brl(d.investments)}${d.assets_total ? ` · Bens ${brl(d.assets_total)}` : ""}</div></div>
    <div class="card stat"><h3>Receitas do mês</h3><div class="value pos" data-count="${d.month.income}">${brl(d.month.income)}</div><div class="sub">Esperado ${brl(d.expected_income)}</div></div>
    <div class="card stat"><h3>Despesas do mês</h3><div class="value neg" data-count="${d.month.expense}">${brl(d.month.expense)}</div><div class="sub">Projeção ${brl(d.projected_expense)}</div></div>
    <div class="card stat"><h3>Resultado</h3><div class="value ${bal >= 0 ? "pos" : "neg"}" data-count="${bal}">${brl(bal)}</div><div class="sub">Poupança projetada ${d.savings_rate ?? "–"}%</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="between"><h2 style="margin:0">Receitas x despesas</h2>
      <div class="tabs" id="trendToggle" style="margin:0"><button type="button" data-m="6" class="${dashboardTrendMonths == 6 ? "active" : ""}">6 meses</button><button type="button" data-m="12" class="${dashboardTrendMonths == 12 ? "active" : ""}">12 meses</button></div></div>
      <div class="chart-box" style="margin-top:12px"><canvas id="cMonths"></canvas></div></div>
    <div class="card"><h2>Gastos por categoria</h2>${d.categories.length ? `<div class="chart-box"><canvas id="cCats"></canvas></div>` : '<div class="empty">Sem gastos neste mês.</div>'}</div>
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card"><h2>Orçamentos</h2><div class="list">${d.categories.map((c) => {
      const p = pct(c.total, c.budget), cls = c.budget ? (c.total >= c.budget ? "over" : p >= 80 ? "warn" : "") : "";
      return `<div class="li" style="display:block"><div class="between"><span><span class="dot" style="display:inline-block;background:${esc(c.color)}"></span> ${esc(c.name)}</span><span class="amount">${brl(c.total)}${c.budget ? ` <span class="muted small">/ ${brl(c.budget)}</span>` : ""}</span></div>
      ${c.budget ? `<div class="bar ${cls}"><i style="${barFill(p)}"></i></div>` : ""}${c.prev ? `<div class="small muted">Mês anterior: ${brl(c.prev)}</div>` : ""}</div>`;
    }).join("") || '<div class="empty">Nada por aqui.</div>'}</div></div>
    <div class="card"><h2>Próximos vencimentos</h2><div class="list">${d.upcoming.map((b) => `<div class="li"><div class="grow"><div class="title">${esc(b.name)}</div><div class="small muted">${fdate(b.due_date)} · ${b.days_left === 0 ? "hoje" : `em ${b.days_left} dia(s)`}</div></div><div class="amount">${brl(b.amount)}</div>${b.kind === "contract" && b.account_id ? `<button class="btn small" data-pay="${b.contract_id}" data-amt="${b.amount}" data-due="${b.due_date}" style="margin-left:8px">Marcar pago</button>` : ""}</div>`).join("") || '<div class="empty">Nada vencendo nos próximos 10 dias.</div>'}</div></div>
    <div class="card"><h2>Cartões</h2><div class="list">${d.cards.map((c) => `<div class="li" style="display:block"><div class="between"><strong>${esc(c.name)}</strong><span class="amount">${brl(c.total)}</span></div>
      <div class="small muted">Vence ${fdate(c.due_date)}${c.limit ? ` · ${c.usage_pct}% do limite` : ""}</div>${c.limit ? `<div class="bar ${c.usage_pct >= 80 ? "over" : c.usage_pct >= 60 ? "warn" : ""}"><i style="${barFill(c.usage_pct)}"></i></div>` : ""}</div>`).join("") || '<div class="empty">Nenhum cartão cadastrado.</div>'}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Contas</h2><div class="list">${d.accounts.filter((a) => a.kind !== "credit_card").map((a) => `<div class="li"><span class="dot" style="background:${esc(a.color)}"></span><div class="grow"><div class="title">${esc(a.name)}</div><div class="small muted">${esc(KINDS[a.kind])}${a.institution ? " · " + esc(a.institution) : ""}</div></div><div class="amount ${a.balance < 0 ? "neg" : ""}">${brl(a.balance)}</div></div>`).join("") || '<div class="empty">Nenhuma conta.</div>'}</div></div>
    <div class="card"><h2>Metas</h2><div class="list">
      ${d.emergency_fund ? `<a class="li" style="display:block;text-decoration:none;color:inherit" href="#reserve"><div class="between"><strong>${navIcon("reserve")} Reserva de emergência</strong><span class="small">${d.emergency_fund.months_covered} / ${d.emergency_fund.months_target} meses</span></div><div class="bar"><i style="${barFill(pct(d.emergency_fund.current, d.emergency_fund.target))}"></i></div></a>` : `<a class="li" style="display:block;text-decoration:none;color:inherit" href="#reserve"><strong>${navIcon("reserve")} Configure sua reserva de emergência</strong><div class="small muted">Meses de despesas guardados pra imprevistos</div></a>`}
      ${d.goals.map((g) => `<div class="li" style="display:block"><div class="between"><strong>${esc(g.name)}</strong><span class="small">${brl(g.current)} / ${brl(g.target)}</span></div><div class="bar"><i style="${barFill(pct(g.current, g.target))}"></i></div></div>`).join("") || (d.emergency_fund ? "" : '<div class="empty"><a href="#goals">Crie uma meta</a> para acompanhar sua evolução.</div>')}
    </div></div>
  </div>
  ${d.receivables.count_pending ? `<div class="card" style="margin-top:16px"><div class="between"><h2>Contas a receber</h2><span class="small muted">${brl(d.receivables.total_pending)} pendente</span></div>
    <div class="list">${d.receivables.upcoming.map((r) => `<div class="li"><div class="grow"><div class="title">${esc(r.client_name)}${r.description ? " · " + esc(r.description) : ""}${r.overdue ? ' <span class="chip" style="color:var(--red)">atrasado</span>' : ""}</div><div class="small muted">Vencia ${fdate(r.due_date)}</div></div><div class="amount">${brl(r.amount)}</div><button class="btn small" data-recv="${r.id}" style="margin-left:8px">Marcar recebido</button></div>`).join("") || '<div class="empty">Nada por enquanto.</div>'}</div></div>` : ""}
  ${(() => {
    const essTotal = d.categories.filter((c) => c.essential).reduce((s, c) => s + c.total, 0);
    const nonEss = d.categories.filter((c) => !c.essential);
    const nonEssTotal = nonEss.reduce((s, c) => s + c.total, 0);
    const cTotal = essTotal + nonEssTotal;
    const essPct = cTotal ? Math.round((essTotal / cTotal) * 100) : 0;
    if (!cTotal) return "";
    return `<div class="card" style="margin-top:16px"><h2>Essenciais x não essenciais</h2>
      <div class="bar" style="height:14px"><i style="${barFill(essPct)};background:var(--green)"></i></div>
      <div class="between small muted" style="margin-top:8px"><span>Essenciais · ${essPct}% · ${brl(essTotal)}</span><span>Não essenciais · ${100 - essPct}% · ${brl(nonEssTotal)}</span></div>
      ${nonEss.length ? `<p class="small muted" style="margin:16px 0 6px">Maiores gastos não essenciais este mês</p>
      <div class="list">${nonEss.slice(0, 3).map((c) => `<div class="li"><span class="dot" style="background:${esc(c.color)}"></span><div class="grow">${esc(c.name)}</div><div class="amount">${brl(c.total)}</div></div>`).join("")}</div>` : ""}
      </div>`;
  })()}`;
  $("#trendToggle").querySelectorAll("button").forEach((b) => (b.onclick = () => { dashboardTrendMonths = +b.dataset.m; route(); }));
  v.querySelectorAll("[data-pay]").forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.classList.add("loading");
    try {
      const t = await api(`/contracts/${b.dataset.pay}/confirm-payment`, { body: { date: b.dataset.due, amount: +b.dataset.amt } });
      toast("Pagamento lançado — anexe o comprovante pra dar baixa", "success");
      await refreshRefs(); route(); txForm(t);
    } catch (e) { toast(e.message, "error"); b.disabled = false; b.classList.remove("loading"); }
  }));
  v.querySelectorAll("[data-recv]").forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.classList.add("loading");
    try {
      await api(`/receivables/${b.dataset.recv}/confirm-received`, { body: {} });
      toast("Recebimento lançado", "success");
      await refreshRefs(); route();
    } catch (e) { toast(e.message, "error"); b.disabled = false; b.classList.remove("loading"); }
  }));
  chart($("#cMonths"), {
    type: "bar",
    data: { labels: d.months.map((m) => monthLabel(m.month)), datasets: [
      { label: "Receitas", data: d.months.map((m) => m.income), backgroundColor: cssVar("--green"), borderRadius: 6 },
      { label: "Despesas", data: d.months.map((m) => m.expense), backgroundColor: cssVar("--red"), borderRadius: 6 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(c.raw)}` } } }, scales: { y: { ticks: { callback: (x) => brl(x).replace(",00", "") } }, x: { grid: { display: false } } } },
  });
  if (d.categories.length) chart($("#cCats"), {
    type: "doughnut",
    data: { labels: d.categories.map((c) => c.name), datasets: [{ data: d.categories.map((c) => c.total), backgroundColor: d.categories.map((c) => c.color), borderColor: cssVar("--surface"), borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: innerWidth < 760 ? "bottom" : "right", labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${brl(c.raw)}` } } } },
  });
};

VIEWS.transactions = async (v) => {
  const [s, e] = monthRange();
  v.innerHTML = `<div class="card">
    <div class="toolbar">
      <input id="fq" placeholder="Buscar descrição…" style="min-width:180px">
      <select id="facc"><option value="">Todas as contas</option>${accOptions().map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
      <select id="fcat"><option value="">Todas as categorias</option>${state.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <select id="ftype"><option value="">Todos os tipos</option><option value="expense">Despesas</option><option value="income">Receitas</option><option value="transfer">Transferências</option></select>
      <select id="fsrc" title="Origem"><option value="">Toda origem</option><option value="manual">Lançado manual/CSV</option><option value="pluggy">Open Finance</option></select>
      <button class="btn" id="imp">Importar CSV</button><button class="btn" id="exp">Exportar</button>
    </div>
    <div class="toolbar">
      <input id="fstart" type="date" title="De" value="${s}">
      <input id="fend" type="date" title="Até" value="${e}">
      <input id="fmin" type="number" step="0.01" min="0" placeholder="Valor mín (R$)" title="Valor mínimo" style="max-width:150px">
      <input id="fmax" type="number" step="0.01" min="0" placeholder="Valor máx (R$)" title="Valor máximo" style="max-width:150px">
      <button class="btn ghost small" id="fclear" type="button">Limpar período/valor</button>
    </div>
    <div id="sum" class="small muted" style="margin-bottom:8px"></div>
    <div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th class="hide-sm">Categoria</th><th class="hide-sm">Conta</th><th class="num">Valor</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const load = async () => {
    const p = new URLSearchParams({ start: $("#fstart").value || s, end: $("#fend").value || e });
    if ($("#fq").value) p.set("q", $("#fq").value);
    if ($("#facc").value) p.set("account_id", $("#facc").value);
    if ($("#fcat").value) p.set("category_id", $("#fcat").value);
    if ($("#ftype").value) p.set("type", $("#ftype").value);
    if ($("#fsrc").value) p.set("source", $("#fsrc").value);
    if ($("#fmin").value) p.set("min_amount", $("#fmin").value);
    if ($("#fmax").value) p.set("max_amount", $("#fmax").value);
    const rows = await api("/transactions?" + p);
    const inc = rows.filter((r) => r.type === "income").reduce((a, r) => a + r.amount, 0);
    const exp = rows.filter((r) => r.type === "expense").reduce((a, r) => a + r.amount, 0);
    $("#sum").innerHTML = `${rows.length} lançamento(s) · Receitas <b class="pos">${brl(inc)}</b> · Despesas <b class="neg">${brl(exp)}</b>`;
    $("#tb").innerHTML = rows.map((t) => `<tr class="clickable" data-id="${t.id}"><td>${fdate(t.date)}</td>
      <td><div style="max-width:320px;overflow:hidden;text-overflow:ellipsis">${esc(t.description)}</div>${t.installment ? `<span class="chip">${esc(t.installment)}</span> ` : ""}${t.source === "pluggy" ? '<span class="chip">Open Finance</span>' : ""}<div class="small muted" style="display:none" data-sm>${esc(t.category_name)}</div></td>
      <td class="hide-sm"><span class="dot" style="display:inline-block;background:${esc(t.category_color)}"></span> ${esc(t.category_name || "—")}</td>
      <td class="hide-sm">${esc(t.account_name)}</td>
      <td class="num ${t.type === "income" ? "pos" : t.type === "expense" ? "neg" : "muted"}">${t.type === "expense" ? "-" : ""}${brl(t.amount)}</td></tr>`).join("")
      || `<tr><td colspan="5" class="empty">Nenhum lançamento neste período.</td></tr>`;
    $("#tb").onclick = (ev) => { const tr = ev.target.closest("tr[data-id]"); if (tr) txForm(rows.find((r) => r.id == tr.dataset.id)); };
  };
  let deb; $("#fq").oninput = () => { clearTimeout(deb); deb = setTimeout(load, 300); };
  let debAmt; ["#fmin", "#fmax"].forEach((s) => ($(s).oninput = () => { clearTimeout(debAmt); debAmt = setTimeout(load, 300); }));
  ["#facc", "#fcat", "#ftype", "#fsrc", "#fstart", "#fend"].forEach((s) => ($(s).onchange = load));
  $("#fclear").onclick = () => { $("#fstart").value = s; $("#fend").value = e; $("#fmin").value = ""; $("#fmax").value = ""; load(); };
  $("#exp").onclick = async () => {
    const r = await fetch("/api/transactions/export", { headers: { Authorization: "Bearer " + state.token } });
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "finora-lancamentos.csv"; a.click();
  };
  $("#imp").onclick = () => openForm({
    title: "Importar extrato CSV",
    fields: [{ name: "account_id", label: "Conta de destino", type: "select", options: accOptions(), num: true }],
    extra: `<label>Arquivo CSV (colunas: data; descricao; valor — valores negativos são gastos)<input type="file" id="csvFile" accept=".csv,text/csv" required></label>`,
    onSubmit: async (d) => {
      const fd = new FormData(); fd.append("file", $("#csvFile").files[0]);
      const r = await api(`/transactions/import?account_id=${d.account_id}`, { body: fd });
      toast(`${r.imported} lançamento(s) importado(s)`, "success");
    },
  });
  await load();
};

VIEWS.cards = async (v) => {
  const [d, plans] = await Promise.all([api(`/dashboard?ref=${refDate()}`), api(`/installments?ref=${refDate()}`)]);
  const cards = state.accounts.filter((a) => a.kind === "credit_card" && !a.archived);
  const dueThisMonth = plans.filter((p) => p.this_month_amount != null);
  const dueTotal = dueThisMonth.reduce((s, p) => s + p.this_month_amount, 0);
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">Todos os gastos no cartão entram na fatura de acordo com o dia de fechamento.</p><button class="btn" id="newCard">+ Cartão</button></div>
  <div class="grid g2">${d.cards.map((c) => `<div class="card"><div class="between"><h2>${esc(c.name)}</h2><button class="btn small" data-edit="${c.account_id}">Editar</button></div>
    <div class="stat"><div class="value">${brl(c.total)}</div><div class="sub">Fatura de ${fdate(c.period_start)} a ${fdate(c.period_end)} · vence ${fdate(c.due_date)}</div></div>
    ${c.limit ? `<div class="bar ${c.usage_pct >= 80 ? "over" : c.usage_pct >= 60 ? "warn" : ""}"><i style="${barFill(c.usage_pct)}"></i></div><div class="small muted" style="margin-top:6px">${c.usage_pct}% de ${brl(c.limit)} · disponível ${brl(c.limit - c.total)}</div>` : ""}
    <div class="list" id="inv-${c.account_id}" style="margin-top:10px"></div></div>`).join("") || '<div class="card empty">Nenhum cartão cadastrado.</div>'}</div>
  <div class="card" style="margin-top:16px"><h2>Parcelamentos em aberto</h2>
    ${plans.length ? `<p class="muted small">Este mês entram <b>${dueThisMonth.length}</b> parcela(s) somando <b>${brl(dueTotal)}</b> nas faturas.</p>` : ""}
    <div class="list">${plans.map((p) => `<div class="li"><div class="grow">
        <div class="title">${esc(p.description)}</div>
        <div class="small muted">${esc(p.account_name)} · parcela ${p.current_installment}/${p.total_installments}${p.next_due_date ? " · próxima em " + fdate(p.next_due_date) : ""}</div>
        <div class="bar" style="margin-top:6px"><i style="${barFill(pct(p.current_installment, p.total_installments))}"></i></div></div>
      <div style="text-align:right;flex:none">
        <div class="amount ${p.this_month_amount != null ? "" : "muted"}">${p.this_month_amount != null ? brl(p.this_month_amount) : "não cobra este mês"}</div>
        <div class="small muted">faltam ${p.remaining_installments}x · ${brl(p.remaining_amount)}</div></div>
      </div>`).join("") || '<div class="empty">Nenhuma compra parcelada em aberto.</div>'}</div></div>`;
  $("#newCard").onclick = () => accountForm({ kind: "credit_card" });
  v.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => accountForm(cards.find((c) => c.id == b.dataset.edit))));
  for (const c of d.cards) {
    const rows = await api(`/transactions?account_id=${c.account_id}&start=${c.period_start}&end=${c.period_end}`);
    $(`#inv-${c.account_id}`).innerHTML = rows.map((t) => `<div class="li"><span class="dot" style="background:${esc(t.category_color)}"></span><div class="grow"><div class="title">${esc(t.description)}</div><div class="small muted">${fdate(t.date)} · ${esc(t.category_name)} ${t.installment ? "· parcela " + esc(t.installment) : ""}</div></div><div class="amount">${brl(t.amount)}</div></div>`).join("") || '<div class="empty">Sem compras nesta fatura.</div>';
  }
};

function accountForm(values = {}) {
  const isEdit = !!values.id;
  openForm({
    title: isEdit ? "Editar conta" : values.kind === "credit_card" ? "Novo cartão" : "Nova conta",
    values: { kind: "checking", color: "#0ea5e9", balance: 0, credit_limit: 0, import_reminder: "none", ...values },
    fields: [
      { name: "name", label: "Nome", required: true, placeholder: "Ex.: Nubank, Itaú, Carteira" },
      { row: [{ name: "kind", label: "Tipo", type: "select", options: Object.entries(KINDS) }, { name: "institution", label: "Instituição" }] },
      { row: [{ name: "balance", label: "Saldo atual (R$)", type: "number" }, { name: "color", label: "Cor", type: "color" }] },
      { row: [{ name: "credit_limit", label: "Limite (cartão)", type: "number" }, { name: "closing_day", label: "Dia de fechamento", type: "number", step: 1, min: 1, max: 31 }, { name: "due_day", label: "Dia de vencimento", type: "number", step: 1, min: 1, max: 31 }] },
      ...(values.pluggy_account_id ? [] : [{ name: "import_reminder", label: "Lembrete para importar extrato", type: "select",
        options: [["none", "Sem lembrete"], ["daily", "Diário"], ["weekly", "Semanal"], ["monthly", "Mensal"]] }]),
      ...(isEdit ? [{ name: "archived", label: "Arquivar (ocultar)", type: "checkbox" }] : []),
    ],
    onSubmit: async (d) => { await api(isEdit ? `/accounts/${values.id}` : "/accounts", { method: isEdit ? "PUT" : "POST", body: d }); await refreshRefs(); },
    onDelete: isEdit ? async () => { await api(`/accounts/${values.id}`, { method: "DELETE" }); await refreshRefs(); } : null,
  });
}

function simpleList(v, { items, empty, render, onNew, newLabel, intro = "" }) {
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">${intro}</p>${canEdit() ? `<button class="btn" id="newItem">${newLabel}</button>` : ""}</div>
  <div class="card"><div class="list">${items.map((it, i) => `<div class="li clickable" data-i="${i}" style="cursor:pointer">${render(it)}</div>`).join("") || `<div class="empty">${empty}</div>`}</div></div>`;
  if (canEdit()) $("#newItem").onclick = () => onNew();
  v.querySelectorAll("[data-i]").forEach((el) => (el.onclick = () => onNew(items[el.dataset.i])));
}

VIEWS.accounts = async (v) => {
  await refreshRefs();
  simpleList(v, {
    items: state.accounts, empty: "Nenhuma conta cadastrada.", newLabel: "+ Conta", onNew: accountForm,
    intro: "Contas correntes, poupanças, investimentos, dinheiro e cartões.",
    render: (a) => `<span class="dot" style="background:${esc(a.color)}"></span><div class="grow"><div class="title">${esc(a.name)} ${a.archived ? '<span class="chip">arquivada</span>' : ""} ${a.pluggy_account_id ? '<span class="chip">Open Finance</span>' : a.import_reminder !== "none" ? `<span class="chip">lembrete ${esc({ daily: "diário", weekly: "semanal", monthly: "mensal" }[a.import_reminder] || a.import_reminder)}</span>` : ""}</div><div class="small muted">${esc(KINDS[a.kind])}${a.institution ? " · " + esc(a.institution) : ""}</div></div><div class="amount ${a.balance < 0 ? "neg" : ""}">${brl(a.balance)}</div>`,
  });
};

function contractForm(c = {}) {
  return openForm({
    title: c.id ? "Editar contrato" : "Novo contrato / conta fixa",
    values: { due_day: 10, active: true, interest_rate_month: 0, ...c },
    fields: [
      { name: "name", label: "Nome", required: true, placeholder: "Aluguel, financiamento, plano de saúde…" },
      { row: [{ name: "provider", label: "Fornecedor/credor" }, { name: "category_id", label: "Categoria", type: "select", options: catOptions("expense"), num: true }] },
      { name: "account_id", label: "Conta de pagamento (pra confirmar com 1 clique quando vencer)", type: "select", options: [["", "Nenhuma"], ...accOptions()], num: true, nullable: true },
      { row: [{ name: "amount", label: "Valor mensal (R$)", type: "number", required: true }, { name: "due_day", label: "Dia do vencimento", type: "number", step: 1, min: 1, max: 31 }] },
      { row: [{ name: "start_date", label: "Início", type: "date", nullable: true }, { name: "end_date", label: "Fim", type: "date", nullable: true }] },
      { row: [{ name: "total_installments", label: "Nº de parcelas", type: "number", step: 1 }, { name: "interest_rate_month", label: "Juros ao mês (%)", type: "number" }, { name: "adjustment_index", label: "Reajuste", placeholder: "IPCA, IGP-M" }] },
      { name: "active", label: "Ativo", type: "checkbox" },
      { name: "notes", label: "Observações", type: "textarea" },
    ],
    onSubmit: (d) => { if (!d.category_id) d.category_id = null; return api(c.id ? `/contracts/${c.id}` : "/contracts", { method: c.id ? "PUT" : "POST", body: d }); },
    onDelete: c.id ? () => api(`/contracts/${c.id}`, { method: "DELETE" }) : null,
  });
}
VIEWS.contracts = async (v) => {
  const items = await api("/contracts");
  const total = items.filter((c) => c.active).reduce((s, c) => s + c.amount, 0);
  simpleList(v, {
    items, empty: "Cadastre aluguel, financiamentos, seguros, escola, assinaturas…", newLabel: "+ Contrato", onNew: contractForm,
    intro: `Custos fixos ativos: <b>${brl(total)}</b>/mês`,
    render: (c) => `<div class="grow"><div class="title">${esc(c.name)} ${c.active ? "" : '<span class="chip">inativo</span>'} ${c.interest_rate_month > 2 ? '<span class="chip neg">juros altos</span>' : ""}</div><div class="small muted">Vence todo dia ${c.due_day}${c.provider ? " · " + esc(c.provider) : ""}${c.end_date ? " · até " + fdate(c.end_date) : ""}</div></div><div class="amount">${brl(c.amount)}</div>`,
  });
};

function receivableForm(r = {}) {
  return openForm({
    title: r.id ? "Editar conta a receber" : "Nova conta a receber",
    values: { due_date: today(), ...r },
    fields: [
      { name: "client_name", label: "Cliente", required: true, placeholder: "Nome do cliente ou empresa" },
      { name: "description", label: "Descrição", placeholder: "Serviço prestado, referente a…" },
      { row: [{ name: "amount", label: "Valor (R$)", type: "number", required: true }, { name: "due_date", label: "Vencimento", type: "date", required: true }] },
      { name: "account_id", label: "Conta que vai receber (pra confirmar com 1 clique)", type: "select", options: [["", "Nenhuma"], ...accOptions()], num: true, nullable: true },
      { name: "notes", label: "Observações", type: "textarea" },
    ],
    onSubmit: (d) => api(r.id ? `/receivables/${r.id}` : "/receivables", { method: r.id ? "PUT" : "POST", body: d }),
    onDelete: r.id ? () => api(`/receivables/${r.id}`, { method: "DELETE" }) : null,
  });
}
VIEWS.receivables = async (v) => {
  const items = await api("/receivables");
  const pending = items.filter((r) => !r.received_at);
  const total = pending.reduce((s, r) => s + r.amount, 0);
  simpleList(v, {
    items, empty: "Cadastre valores que clientes ainda vão te pagar.", newLabel: "+ Conta a receber", onNew: receivableForm,
    intro: `Pendente de recebimento: <b>${brl(total)}</b>`,
    render: (r) => `<div class="grow"><div class="title">${esc(r.client_name)} ${r.received_at ? '<span class="chip">recebido</span>' : ""}</div><div class="small muted">${esc(r.description || "")}${r.description ? " · " : ""}Vence ${fdate(r.due_date)}</div></div><div class="amount">${brl(r.amount)}</div>`,
  });
};

function incomeForm(i = {}) {
  return openForm({
    title: i.id ? "Editar renda" : "Nova fonte de renda",
    values: { kind: "salary", person_type: "PF", pay_day: 5, recurring: true, active: true, gross_amount: 0, ...i },
    fields: [
      { name: "name", label: "Nome", required: true, placeholder: "Salário empresa X, pró-labore…" },
      { row: [{ name: "kind", label: "Tipo", type: "select", options: Object.entries(INCOME_KINDS) }, { name: "person_type", label: "Pessoa", type: "select", options: [["PF", "Pessoa física"], ["PJ", "Pessoa jurídica"]] }] },
      { row: [{ name: "gross_amount", label: "Valor bruto (R$)", type: "number" }, { name: "net_amount", label: "Valor líquido (R$)", type: "number", required: true }] },
      { name: "pay_day", label: "Dia do recebimento", type: "number", step: 1, min: 1, max: 31 },
      { name: "recurring", label: "Recorrente (todo mês)", type: "checkbox" },
      { name: "active", label: "Ativa", type: "checkbox" },
    ],
    onSubmit: (d) => api(i.id ? `/incomes/${i.id}` : "/incomes", { method: i.id ? "PUT" : "POST", body: d }),
    onDelete: i.id ? () => api(`/incomes/${i.id}`, { method: "DELETE" }) : null,
  });
}
VIEWS.incomes = async (v) => {
  const items = await api("/incomes");
  const total = items.filter((i) => i.active && i.recurring).reduce((s, i) => s + i.net_amount, 0);
  simpleList(v, {
    items, empty: "Cadastre salários, pró-labore, aluguéis recebidos, freelas…", newLabel: "+ Renda", onNew: incomeForm,
    intro: `Renda líquida recorrente: <b class="pos">${brl(total)}</b>/mês`,
    render: (i) => `<div class="grow"><div class="title">${esc(i.name)} <span class="chip">${esc(i.person_type)}</span></div><div class="small muted">${esc(INCOME_KINDS[i.kind] || i.kind)} · dia ${i.pay_day}${i.gross_amount ? " · bruto " + brl(i.gross_amount) : ""}</div></div><div class="amount pos">${brl(i.net_amount)}</div>`,
  });
};

VIEWS.categories = async (v) => {
  await refreshRefs();
  const rules = await api("/rules");
  const catName = (id) => state.cats.find((c) => c.id === id)?.name || "?";
  v.innerHTML = `<div class="grid g2">
    <div class="card"><div class="between"><h2>Categorias</h2><button class="btn small" id="newCat">+ Categoria</button></div>
      <p class="small muted">Defina orçamentos mensais para receber alertas ao atingir 80% e 100%.</p>
      <div class="list">${state.cats.map((c) => `<div class="li" data-c="${c.id}" style="cursor:pointer"><span class="dot" style="background:${esc(c.color)}"></span><div class="grow"><div class="title">${esc(c.name)}</div><div class="small muted">${c.kind === "income" ? "Receita" : "Despesa"}${c.essential ? " · essencial" : ""}</div></div><div class="small">${c.monthly_budget ? brl(c.monthly_budget) : ""}</div></div>`).join("")}</div></div>
    <div class="card"><div class="between"><h2>Regras automáticas</h2><button class="btn small" id="newRule">+ Regra</button></div>
      <p class="small muted">Se a descrição contém o texto, o lançamento vai para a categoria escolhida. As regras valem para a sincronização bancária e as importações.</p>
      <div class="list">${rules.map((r) => `<div class="li"><div class="grow"><div class="title">“${esc(r.pattern)}”</div><div class="small muted">→ ${esc(catName(r.category_id))}</div></div><button class="btn small danger" data-del="${r.id}">Remover</button></div>`).join("") || '<div class="empty">Nenhuma regra. Dica: ao editar um lançamento, marque “aplicar sempre”.</div>'}</div></div></div>`;
  const catForm = (c = {}) => openForm({
    title: c.id ? "Editar categoria" : "Nova categoria",
    values: { kind: "expense", color: "#6366f1", monthly_budget: 0, ...c },
    fields: [
      { name: "name", label: "Nome", required: true },
      { row: [{ name: "kind", label: "Tipo", type: "select", options: [["expense", "Despesa"], ["income", "Receita"]] }, { name: "color", label: "Cor", type: "color" }] },
      { name: "monthly_budget", label: "Orçamento mensal (R$, 0 = sem limite)", type: "number" },
      { name: "essential", label: "Gasto essencial", type: "checkbox" },
    ],
    onSubmit: async (d) => { await api(c.id ? `/categories/${c.id}` : "/categories", { method: c.id ? "PUT" : "POST", body: { icon: c.icon || "tag", ...d } }); await refreshRefs(); },
    onDelete: c.id ? async () => { await api(`/categories/${c.id}`, { method: "DELETE" }); await refreshRefs(); } : null,
  });
  $("#newCat").onclick = () => catForm();
  v.querySelectorAll("[data-c]").forEach((el) => (el.onclick = () => catForm(state.cats.find((c) => c.id == el.dataset.c))));
  $("#newRule").onclick = () => openForm({
    title: "Nova regra", values: { priority: 0, apply_existing: true },
    fields: [
      { name: "pattern", label: "Se a descrição contém", required: true, placeholder: "Ex.: UBER, DROGASIL, PADARIA DO ZÉ" },
      { name: "category_id", label: "Categoria", type: "select", options: state.cats.map((c) => [c.id, c.name]), num: true },
      { name: "priority", label: "Prioridade (maior vence)", type: "number", step: 1 },
      { name: "apply_existing", label: "Aplicar também aos lançamentos existentes", type: "checkbox" },
    ],
    onSubmit: async (d) => { const r = await api("/rules", { body: d }); toast(`Regra criada · ${r.updated} lançamento(s) recategorizado(s)`, "success"); },
  });
  v.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { await api(`/rules/${b.dataset.del}`, { method: "DELETE" }); route(); }));
};

function goalForm(g = {}) {
  return openForm({
    title: g.id ? "Editar meta" : "Nova meta", values: { current_amount: 0, ...g },
    fields: [
      { name: "name", label: "Meta", required: true, placeholder: "Reserva de emergência, viagem, entrada do imóvel…" },
      { row: [{ name: "target_amount", label: "Valor alvo (R$)", type: "number", required: true }, { name: "current_amount", label: "Já guardado (R$)", type: "number" }] },
      { name: "deadline", label: "Prazo", type: "date", nullable: true },
    ],
    onSubmit: (d) => api(g.id ? `/goals/${g.id}` : "/goals", { method: g.id ? "PUT" : "POST", body: d }),
    onDelete: g.id ? () => api(`/goals/${g.id}`, { method: "DELETE" }) : null,
  });
}
VIEWS.goals = async (v) => {
  const items = (await api("/goals")).filter((g) => g.kind !== "emergency_fund");
  simpleList(v, {
    items, empty: "Nenhuma meta ainda.", newLabel: "+ Meta", onNew: goalForm, intro: "Acompanhe seus objetivos e quanto guardar por mês.",
    render: (g) => {
      const left = g.target_amount - g.current_amount;
      let perMonth = "";
      if (g.deadline && left > 0) {
        const months = Math.max(1, Math.round((new Date(g.deadline) - new Date()) / 2.63e9));
        perMonth = ` · guardar ${brl(left / months)}/mês por ${months} meses`;
      }
      return `<div class="grow"><div class="between"><span class="title">${esc(g.name)}</span><span class="small">${brl(g.current_amount)} / ${brl(g.target_amount)}</span></div><div class="bar"><i style="${barFill(pct(g.current_amount, g.target_amount))}"></i></div><div class="small muted" style="margin-top:4px">${g.deadline ? "Prazo " + fdate(g.deadline) : "Sem prazo"}${perMonth}</div></div>`;
    },
  });
};

/* ------------------------------------------------------------------ patrimônio (outros bens) */
function assetForm(a = {}) {
  const isVehicle = a.kind === "veiculo";
  return openForm({
    title: a.id ? "Editar bem" : "Novo bem", values: { kind: "outro", ...a },
    fields: [
      { name: "name", label: "Nome", required: true, placeholder: "Apartamento, carro, moto…" },
      { name: "kind", label: "Tipo", type: "select", options: Object.entries(ASSET_KINDS) },
      { name: "value", label: "Valor estimado (R$)", type: "number", required: true },
      { name: "notes", label: "Observações", type: "textarea" },
    ],
    extra: `<div class="fipe-box" id="fipeBox">
      <p class="small" style="font-weight:600;margin:0 0 8px">Veículo? Busque o valor pela tabela FIPE</p>
      <label>Marca<select id="fipeMarca"><option value="">Carregando…</option></select></label>
      <label>Modelo<select id="fipeModelo" disabled><option value="">Escolha a marca primeiro</option></select></label>
      <label>Ano<select id="fipeAno" disabled><option value="">Escolha o modelo primeiro</option></select></label>
      <p class="small muted" id="fipeResult" style="margin-top:6px"></p>
    </div>${isVehicle && a.vehicle_fipe_code ? `<input type="hidden" name="vehicle_fipe_code" value="${esc(a.vehicle_fipe_code)}">` : ""}`,
    onSubmit: (d) => {
      const fipeInput = $("#modalForm input[name=vehicle_fipe_code]");
      d.vehicle_fipe_code = fipeInput ? fipeInput.value : (a.vehicle_fipe_code || null);
      return api(a.id ? `/assets/${a.id}` : "/assets", { method: a.id ? "PUT" : "POST", body: d });
    },
    onDelete: a.id ? () => api(`/assets/${a.id}`, { method: "DELETE" }) : null,
  });
  // (segue abaixo, fora do return, a fiação dos selects em cascata da FIPE)
}
async function _wireFipePicker() {
  const marcaSel = $("#fipeMarca"), modeloSel = $("#fipeModelo"), anoSel = $("#fipeAno"), result = $("#fipeResult");
  if (!marcaSel) return;
  try {
    const marcas = await api("/fipe/marcas");
    marcaSel.innerHTML = `<option value="">Selecione…</option>` + marcas.map((m) => `<option value="${m.codigo}">${esc(m.nome)}</option>`).join("");
  } catch { marcaSel.innerHTML = `<option value="">Indisponível no momento</option>`; return; }
  marcaSel.onchange = async () => {
    modeloSel.disabled = true; anoSel.disabled = true; result.textContent = "";
    if (!marcaSel.value) return;
    modeloSel.innerHTML = `<option value="">Carregando…</option>`;
    const modelos = await api(`/fipe/modelos?marca=${marcaSel.value}`);
    modeloSel.innerHTML = `<option value="">Selecione…</option>` + modelos.map((m) => `<option value="${m.codigo}">${esc(m.nome)}</option>`).join("");
    modeloSel.disabled = false;
  };
  modeloSel.onchange = async () => {
    anoSel.disabled = true; result.textContent = "";
    if (!modeloSel.value) return;
    anoSel.innerHTML = `<option value="">Carregando…</option>`;
    const anos = await api(`/fipe/anos?marca=${marcaSel.value}&modelo=${modeloSel.value}`);
    anoSel.innerHTML = `<option value="">Selecione…</option>` + anos.map((a) => `<option value="${a.codigo}">${esc(a.nome)}</option>`).join("");
    anoSel.disabled = false;
  };
  anoSel.onchange = async () => {
    if (!anoSel.value) return;
    result.textContent = "Consultando…";
    const r = await api(`/fipe/valor?marca=${marcaSel.value}&modelo=${modeloSel.value}&ano=${anoSel.value}`);
    result.innerHTML = `<b>${esc(r.Valor)}</b> — ${esc(r.Marca)} ${esc(r.Modelo)} (${esc(r.AnoModelo)}) <button type="button" class="btn small" id="fipeUse">Usar este valor</button>`;
    $("#fipeUse").onclick = () => {
      $("#modalForm input[name=value]").value = String(r.Valor).replace(/[^\d,]/g, "").replace(",", ".");
      $("#modalForm select[name=kind]").value = "veiculo";
      let hidden = $("#modalForm input[name=vehicle_fipe_code]");
      if (!hidden) { hidden = document.createElement("input"); hidden.type = "hidden"; hidden.name = "vehicle_fipe_code"; $("#modalForm").appendChild(hidden); }
      hidden.value = r.CodigoFipe;
      toast("Valor FIPE aplicado", "success");
    };
  };
}
VIEWS.patrimonio = async (v) => {
  const items = await api("/assets");
  const total = items.reduce((s, a) => s + a.value, 0);
  simpleList(v, {
    items, empty: "Nenhum bem cadastrado ainda.", newLabel: "+ Bem",
    onNew: (a) => { assetForm(a); _wireFipePicker(); },
    intro: `Outros bens (fora das contas conectadas): <b>${brl(total)}</b>`,
    render: (a) => `<div class="grow"><div class="title">${esc(a.name)}</div><div class="small muted">${esc(ASSET_KINDS[a.kind] || a.kind)}${a.notes ? " · " + esc(a.notes) : ""}</div></div><div class="amount">${brl(a.value)}</div>`,
  });
};

/* ------------------------------------------------------------------ reserva de emergência */
function reserveForm(g = {}) {
  return openForm({
    title: g.id ? "Ajustar reserva de emergência" : "Configurar reserva de emergência",
    values: { months_target: 6, monthly_cost: 0, current_amount: 0, ...g },
    fields: [
      { row: [{ name: "months_target", label: "Meses de cobertura desejados", type: "number", required: true }, { name: "monthly_cost", label: "Custo mensal essencial (R$)", type: "number", required: true }] },
      { name: "current_amount", label: "Já guardado hoje (R$)", type: "number" },
    ],
    onSubmit: (d) => {
      const body = { name: "Reserva de emergência", kind: "emergency_fund", months_target: d.months_target, monthly_cost: d.monthly_cost,
                     current_amount: d.current_amount, target_amount: d.months_target * d.monthly_cost };
      return api(g.id ? `/goals/${g.id}` : "/goals", { method: g.id ? "PUT" : "POST", body });
    },
    onDelete: g.id ? () => api(`/goals/${g.id}`, { method: "DELETE" }) : null,
  });
}
VIEWS.reserve = async (v) => {
  const goals = await api("/goals");
  const g = goals.find((x) => x.kind === "emergency_fund");
  if (!g) {
    v.innerHTML = `<div class="card empty">
      <p>Você ainda não configurou sua reserva de emergência.</p>
      <p class="small muted">Regra geral: entre 3 e 6 meses das suas despesas essenciais guardados em algo líquido, pra imprevistos sem precisar recorrer a dívida.</p>
      <button class="btn primary" id="setupReserve">Configurar agora</button></div>`;
    $("#setupReserve").onclick = () => reserveForm();
    return;
  }
  const monthsCovered = g.monthly_cost ? g.current_amount / g.monthly_cost : 0;
  v.innerHTML = `<div class="card">
    <div class="between"><h2 style="margin:0">Reserva de emergência</h2><button class="btn small" id="editReserve">Ajustar</button></div>
    <div class="bar" style="margin-top:14px"><i style="${barFill(pct(g.current_amount, g.target_amount))}"></i></div>
    <div class="between small muted" style="margin-top:6px"><span>${brl(g.current_amount)} guardado</span><span>alvo ${brl(g.target_amount)}</span></div>
    <p style="margin-top:18px;font-size:15px"><b>${monthsCovered.toFixed(1)}</b> de <b>${g.months_target}</b> meses de cobertura</p>
    <p class="small muted">Baseado num custo mensal essencial de ${brl(g.monthly_cost)}.</p>
  </div>`;
  $("#editReserve").onclick = () => reserveForm(g);
};

// Links no conteúdo gerado por IA (fontes de pesquisa) sempre abrem em nova aba sem
// dar ao destino acesso a `window.opener` (reverse tabnabbing).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});
const md = (s) => DOMPurify.sanitize(marked.parse(s || ""), { ADD_ATTR: ["target"] });

VIEWS.advisor = async (v) => {
  const reports = await api("/advisor");
  v.innerHTML = `<div class="card" style="margin-bottom:16px">
    <h2>Consultor financeiro</h2>
    <p class="muted small">Analisa seus dados, pesquisa o mercado atual e sugere onde economizar e como fazer seu dinheiro render. Conteúdo educativo, que não substitui um profissional certificado.</p>
    <div class="row" style="flex-wrap:wrap"><input id="q" placeholder="Pergunte algo: vale a pena antecipar o financiamento? Onde investir minha reserva?" style="flex:3;min-width:220px">
    <button class="btn" id="ask" style="flex:none">Perguntar</button><button class="btn primary" id="gen" style="flex:none">Gerar relatório do mês</button></div>
  </div><div id="reports">${reports.map(renderReport).join("") || '<div class="card empty">Gere seu primeiro relatório.</div>'}</div>`;
  const run = async (question) => {
    ["#ask", "#gen"].forEach((s) => { $(s).disabled = true; $(s).classList.add("loading"); });
    $("#reports").insertAdjacentHTML("afterbegin", `<div class="card empty" id="loading">Analisando suas finanças e pesquisando o mercado… isso pode levar até um minuto.</div>`);
    try { const r = await api("/advisor", { body: { question } }); $("#loading").remove(); $("#reports").insertAdjacentHTML("afterbegin", renderReport(r)); $("#q").value = ""; }
    catch (e) { $("#loading").textContent = e.message; }
    finally { ["#ask", "#gen"].forEach((s) => { $(s).disabled = false; $(s).classList.remove("loading"); }); }
  };
  $("#gen").onclick = () => run(null);
  $("#ask").onclick = () => $("#q").value.trim() && run($("#q").value.trim());
  $("#q").onkeydown = (e) => e.key === "Enter" && $("#ask").click();
};
function renderReport(r) {
  return `<div class="card" style="margin-bottom:16px"><div class="small muted">${new Date(r.created_at + "Z").toLocaleString("pt-BR")}${r.snapshot?.question ? " · " + esc(r.snapshot.question) : " · Relatório mensal"}</div><div class="md">${md(r.content)}</div></div>`;
}

VIEWS.market = async (v) => {
  const [m, d] = await Promise.all([api("/market").catch(() => ({})), api("/dashboard").catch(() => null)]);
  const ind = (label, o, suf = "%", money = false) => `<div class="card stat"><h3>${label}</h3><div class="value">${o ? (money ? brl(o.value) : o.value.toLocaleString("pt-BR") + suf) : "—"}</div><div class="sub">${o?.date ? "Ref. " + o.date : o?.change != null ? `${o.change > 0 ? "+" : ""}${Number(o.change).toFixed(2)}% hoje` : "indisponível"}</div></div>`;
  let ladder = "";
  if (d) {
    const reserveTarget = (d.fixed_costs || d.projected_expense) * 6;
    const reserveProgress = reserveTarget ? Math.min(100, Math.round((d.cash / reserveTarget) * 100)) : 0;
    const debt = d.card_debt + Math.max(0, -d.cash);
    const hasDebt = debt > 0;
    const cdi = m.cdi?.value;
    const steps = [
      { done: !hasDebt, title: "1. Quite dívidas caras",
        text: hasDebt
          ? `Você tem ${brl(debt)} em dívida de cartão e/ou saldo negativo. O rotativo do cartão e o cheque especial costumam passar de 300-400% a.a. em juros — nenhum investimento cobre isso. Prioridade total antes de aplicar qualquer valor.`
          : "Sem dívida cara em aberto agora — pode seguir para os próximos passos." },
      { done: reserveProgress >= 100, progress: reserveProgress, title: "2. Monte sua reserva de emergência",
        text: `Meta sugerida: ${brl(reserveTarget)} (6x seus custos fixos), em aplicação de liquidez diária. Você já tem ${reserveProgress}% disso. `
          + `Onde deixar: Tesouro Selic, CDB de liquidez diária com 100%+ do CDI${cdi ? ` (hoje em ${cdi}% a.a.)` : ""}, ou conta remunerada do próprio banco. `
          + "Aqui o que importa é poder sacar a qualquer momento sem perder dinheiro — não a maior rentabilidade." },
      { done: false, title: "3. Diversifique o que passar da reserva",
        text: "Com a reserva completa e sem dívida cara, o excedente pode ir para: Tesouro IPCA+ (protege da inflação em prazos longos), CDB/LCI/LCA de prazo (LCI e LCA são isentas de Imposto de Renda para pessoa física), fundos multimercado, e uma parcela em renda variável (ações, ETFs como BOVA11) se o objetivo for de anos e você tolerar oscilação. Quanto mais longe a meta, mais espaço para risco." },
    ];
    ladder = `<div class="card" style="margin-top:16px"><h2>Trilha de investimentos</h2>
      <p class="muted small">Sugestões educativas geradas a partir do seu painel — não é recomendação de produto específico, e rentabilidade passada não garante retorno futuro.</p>
      <div class="list">${steps.map((s) => `<div class="li" style="display:block">
        <strong>${s.done ? navIcon("check") + " " : ""}${esc(s.title)}</strong>
        ${s.progress != null ? `<div class="bar" style="margin:6px 0"><i style="${barFill(s.progress)}"></i></div>` : ""}
        <div class="small muted" style="margin-top:4px">${esc(s.text)}</div>
      </div>`).join("")}</div></div>`;
  }
  v.innerHTML = `<div class="grid g4 keep2">${ind("Selic (meta)", m.selic)}${ind("CDI (a.a.)", m.cdi)}${ind("IPCA 12 meses", m.ipca_12m)}${ind("Dólar", m.usd, "", true)}</div>
  <div class="grid g4 keep2" style="margin-top:16px">${ind("Euro", m.eur, "", true)}${ind("Ibovespa", m.ibov, " pts")}<div class="card stat"><h3>Juro real</h3><div class="value">${m.real_rate != null ? m.real_rate.toLocaleString("pt-BR") + "%" : "—"}</div><div class="sub">Selic descontada a inflação</div></div><div class="card stat"><h3>Fontes</h3><div class="sub">Banco Central (SGS), AwesomeAPI, brapi.dev</div></div></div>
  ${ladder}
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Simulador de investimento</h2>
      <div class="row"><label>Aporte inicial<input id="si" type="number" value="1000"></label><label>Aporte mensal<input id="sm" type="number" value="500"></label></div>
      <div class="row"><label>Prazo (meses)<input id="sn" type="number" value="60"></label><label>Taxa anual (%)<input id="sr" type="number" step="0.01" value="${m.cdi?.value ?? 10}"></label></div>
      <button class="btn primary full" id="sim">Simular</button><div id="simOut" style="margin-top:12px"></div></div>
    <div class="card"><h2>Evolução</h2><div class="chart-box"><canvas id="cSim"></canvas></div></div></div>`;
  let c;
  $("#sim").onclick = async () => {
    const r = await api("/simulate", { body: { initial: +$("#si").value, monthly: +$("#sm").value, months: +$("#sn").value, annual_rate: +$("#sr").value } });
    $("#simOut").innerHTML = `<div class="list"><div class="li"><div class="grow">Total investido</div><div class="amount">${brl(r.invested)}</div></div><div class="li"><div class="grow">Rendimento bruto</div><div class="amount pos">${brl(r.gain)}</div></div><div class="li"><div class="grow">IR estimado</div><div class="amount neg">-${brl(r.tax)}</div></div><div class="li"><div class="grow"><b>Valor líquido</b></div><div class="amount"><b>${brl(r.net)}</b></div></div></div>`;
    c?.destroy();
    c = chart($("#cSim"), { type: "line", data: { labels: r.series.map((s) => s.month + "m"), datasets: [
      { label: "Saldo", data: r.series.map((s) => s.balance), borderColor: cssVar("--primary"), backgroundColor: "transparent", tension: .3 },
      { label: "Investido", data: r.series.map((s) => s.invested), borderColor: cssVar("--muted"), borderDash: [4, 4], backgroundColor: "transparent" }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { ticks: { callback: (x) => brl(x).replace(",00", "") } } } } });
  };
  $("#sim").click();
};

function loadScript(src) {
  return new Promise((ok, fail) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}

VIEWS.bank = async (v) => {
  const st = await api("/pluggy/status");
  v.innerHTML = `<div class="card" style="margin-bottom:16px"><h2>Open Finance (Pluggy)</h2>
    <p class="muted small">Conecte seus bancos com segurança pelo Open Finance. A autorização é feita no app do seu banco e pode ser revogada a qualquer momento. Saldos, extratos e faturas são sincronizados automaticamente e categorizados pelas suas regras.</p>
    ${st.enabled ? `<div class="row" style="flex-wrap:wrap"><button class="btn primary" id="connect" style="flex:none">+ Conectar banco</button><button class="btn" id="syncAll" style="flex:none">Sincronizar agora</button><button class="btn" id="manual" style="flex:none">Tenho um Item ID</button></div>`
      : `<div class="alert-item warning">Open Finance ainda não está configurado nesta instância.<br>
          Crie sua própria conta gratuita em <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener">dashboard.pluggy.ai</a>, gere um Client ID e Client Secret e informe-os no arquivo <code>.env</code> (<code>PLUGGY_CLIENT_ID</code> / <code>PLUGGY_CLIENT_SECRET</code>).
          O sandbox é gratuito para testes; para conectar bancos reais, escolha o plano pago de acordo com o volume de contas que for usar.
          Até lá, use a importação de extrato em CSV na tela de Lançamentos.</div>`}
  </div>
  <div class="card"><h2>Conexões</h2><div class="list">${st.items.map((i) => `<div class="li"><div class="grow"><div class="title">${esc(i.connector_name || i.item_id)}</div><div class="small muted">Status: ${esc(i.status || "—")} · Última sincronização: ${i.last_sync_at ? new Date(i.last_sync_at + "Z").toLocaleString("pt-BR") : "nunca"}</div>${i.last_error ? `<div class="small neg">${esc(i.last_error)}</div>` : ""}</div>
    <button class="btn small" data-upd="${esc(i.item_id)}">Reconectar</button><button class="btn small danger" data-rm="${esc(i.item_id)}">Remover</button></div>`).join("") || '<div class="empty">Nenhum banco conectado.</div>'}</div></div>`;
  if (!st.enabled) return;
  const openConnect = async (itemId) => {
    try {
      const { accessToken } = await api("/pluggy/connect-token" + (itemId ? `?item_id=${encodeURIComponent(itemId)}` : ""), { method: "POST" });
      await loadScript(PLUGGY_CONNECT_SRC);
      new window.PluggyConnect({
        connectToken: accessToken, includeSandbox: false, updateItem: itemId || undefined,
        onSuccess: async (data) => { toast("Banco conectado. Sincronizando…", "success"); const r = await api("/pluggy/items", { body: { item_id: data.item.id } }); toast(`${r.new_transactions} lançamento(s) importado(s)`, "success"); await refreshRefs(); route(); },
        onError: (e) => toast("Erro na conexão: " + (e?.message || "tente novamente"), "error"),
      }).init();
    } catch (e) { toast(e.message, "error"); }
  };
  $("#connect").onclick = () => openConnect();
  $("#syncAll").onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api("/pluggy/sync", { method: "POST" }); toast(`${r.reduce((s, x) => s + (x.new_transactions || 0), 0)} novo(s) lançamento(s)`, "success"); await refreshRefs(); route(); }
    catch (err) { toast(err.message, "error"); e.target.disabled = false; }
  };
  $("#manual").onclick = () => openForm({
    title: "Vincular Item ID", fields: [{ name: "item_id", label: "Item ID (painel da Pluggy / Meu Pluggy)", required: true }],
    onSubmit: async (d) => { const r = await api("/pluggy/items", { body: d }); toast(`${r.new_transactions} lançamento(s) importado(s)`, "success"); await refreshRefs(); },
  });
  v.querySelectorAll("[data-upd]").forEach((b) => (b.onclick = () => openConnect(b.dataset.upd)));
  v.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Remover a conexão? As contas ficam arquivadas e o histórico é mantido.")) return;
    await api(`/pluggy/items/${encodeURIComponent(b.dataset.rm)}`, { method: "DELETE" }); await refreshRefs(); route();
  }));
};

VIEWS.taxes = async (v) => {
  v.innerHTML = `<div class="card">
    <h2>Impostos (DAS / Simples Nacional)</h2>
    <p class="muted">O Finora não calcula o valor do seu DAS: a alíquota depende do seu anexo, do Fator R e do
    faturamento acumulado dos últimos 12 meses — errar aqui gera multa e juros, então esse cálculo precisa ser
    feito na fonte oficial, não por uma estimativa de terceiros.</p>
    <p class="muted">Pra apurar e emitir a guia (PGDAS-D), acesse o Portal do Simples Nacional com sua conta gov.br:</p>
    <a class="btn primary" href="https://www8.receita.fazenda.gov.br/simplesnacional/" target="_blank" rel="noopener">Abrir Portal do Simples Nacional ↗</a>
    <p class="muted small" style="margin-top:16px">Depois de pagar o DAS, volte aqui e lance o valor em <a href="#transactions">Lançamentos</a>
    (cai automaticamente em "Impostos e taxas" se a descrição tiver "DAS") ou cadastre-o como um <a href="#contracts">contrato recorrente</a> pra ter o lembrete de vencimento e o botão de "Marcar pago" todo mês.</p>
  </div>`;
};

async function renderSharedAccessCard() {
  const isOwner = state.user.workspace_role === "owner";
  const [invitations, members] = await Promise.all([
    api("/shared-access/invitations"),
    isOwner ? api("/shared-access") : Promise.resolve([]),
  ]);
  const roleLabel = { editor: "pode editar", viewer: "somente leitura" };
  let html = `<h2>Acesso compartilhado</h2>`;
  if (invitations.length) {
    html += `<p class="muted small">Convites pendentes pra você:</p><div class="list" style="margin-bottom:14px">
      ${invitations.map((i) => `<div class="li"><div class="grow"><div class="title">${esc(i.owner_name)}</div><div class="small muted">${esc(i.owner_email)} · ${roleLabel[i.role]}</div></div>
        <button class="btn small primary" data-accept="${i.id}">Aceitar</button><button class="btn small" data-decline="${i.id}" style="margin-left:6px">Recusar</button></div>`).join("")}
    </div>`;
  }
  if (isOwner) {
    html += `<p class="muted small">Convide alguém (sócio(a), cônjuge, contador) pra ver e editar os mesmos dados financeiros que você.</p>
      <div class="row"><input id="shEmail" type="email" placeholder="E-mail da pessoa"><select id="shRole"><option value="editor">Pode editar</option><option value="viewer">Só visualizar</option></select><button class="btn" id="shInvite">Convidar</button></div>
      <div class="list" style="margin-top:12px">${members.map((m) => `<div class="li"><div class="grow"><div class="title">${esc(m.email)} ${m.accepted_at ? "" : '<span class="chip">convite pendente</span>'}</div><div class="small muted">${roleLabel[m.role]}</div></div><button class="btn small danger" data-revoke="${m.id}">Remover</button></div>`).join("") || '<div class="empty">Ninguém tem acesso à sua conta ainda.</div>'}</div>`;
  } else if (!state.user.workspace_owner) {
    html += `<p class="muted small">Convide alguém pra ver e editar os mesmos dados financeiros que você — só é possível convidar enquanto você está vendo os seus próprios dados.</p>`;
  }
  return html;
}
function wireSharedAccessCard(v) {
  v.querySelectorAll("[data-accept]").forEach((b) => (b.onclick = async () => {
    try { await api(`/shared-access/${b.dataset.accept}/accept`, { method: "POST" }); state.user = await api("/me"); renderWorkspaceBanner(); toast("Convite aceito", "success"); route(); }
    catch (e) { toast(e.message, "error"); }
  }));
  v.querySelectorAll("[data-decline]").forEach((b) => (b.onclick = async () => {
    await api(`/shared-access/${b.dataset.decline}/decline`, { method: "POST" }); toast("Convite recusado", "success"); route();
  }));
  v.querySelectorAll("[data-revoke]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Remover o acesso dessa pessoa?")) return;
    await api(`/shared-access/${b.dataset.revoke}`, { method: "DELETE" }); toast("Acesso removido", "success"); route();
  }));
  const inviteBtn = v.querySelector("#shInvite");
  if (inviteBtn) inviteBtn.onclick = async () => {
    const email = $("#shEmail").value.trim();
    if (!email) return;
    try { await api("/shared-access", { body: { email, role: $("#shRole").value } }); toast("Convite enviado", "success"); route(); }
    catch (e) { toast(e.message, "error"); }
  };
}

VIEWS.settings = async (v) => {
  const theme = document.documentElement.dataset.theme || "auto";
  const sharedHtml = await renderSharedAccessCard();
  v.innerHTML = `<div class="grid g2"><div class="card"><h2>Perfil</h2>
    <label>Nome<input id="pn" value="${esc(state.user.name)}"></label>
    <label>E-mail<input value="${esc(state.user.email)}" disabled></label>
    <label>Meta de economia mensal (R$)<input id="pg" type="number" value="${state.user.monthly_goal_savings || 0}"></label>
    <button class="btn primary full" id="saveMe">Salvar</button>
    <h2 style="margin-top:22px">Aparência</h2>
    <div class="tabs" id="themeTabs">${THEME_ORDER.map((m) => `<button type="button" data-mode="${m}" class="${m === theme ? "active" : ""}">${navIcon(THEME_ICON[m])} ${esc(THEME_LABEL[m].split(" (")[0])}</button>`).join("")}</div></div>
    <div class="card">${sharedHtml}</div>
    <div class="card"><h2>Instalar no dispositivo</h2><p class="muted small">No celular, abra o menu do navegador e toque em “Adicionar à tela inicial”. No computador, use o ícone de instalação na barra de endereço.</p><button class="btn" id="installBtn" ${window._installPrompt ? "" : "disabled"}>Instalar app</button>
    <h2 style="margin-top:22px">Privacidade (LGPD)</h2><p class="muted small">Você pode exportar seus lançamentos na tela de Lançamentos. Excluir a conta remove todos os seus dados e revoga as conexões bancárias.</p>
    <button class="btn danger" id="delMe">Excluir minha conta</button></div></div>`;
  $("#saveMe").onclick = async () => { state.user = await api("/me", { method: "PATCH", body: { name: $("#pn").value, monthly_goal_savings: +$("#pg").value } }); $("#userName").textContent = state.user.name; toast("Perfil atualizado", "success"); };
  $("#themeTabs").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    setTheme(b.dataset.mode);
    $("#themeTabs").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
  }));
  $("#installBtn").onclick = () => window._installPrompt?.prompt();
  $("#delMe").onclick = async () => {
    if (prompt('Digite EXCLUIR para confirmar a exclusão definitiva da conta') !== "EXCLUIR") return;
    await api("/me", { method: "DELETE" }); logout();
  };
  wireSharedAccessCard(v);
};

VIEWS.admin = async (v) => {
  const renderList = async (q) => {
    const users = await api("/admin/users" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    $("#adminUsers").innerHTML = users.map((u) => `
      <div class="li" style="display:block">
        <div class="between">
          <div class="grow">
            <div class="title">${esc(u.name)} ${u.is_admin ? '<span class="chip">admin</span>' : ""}${u.suspended_at ? '<span class="chip" style="color:var(--red)">suspenso</span>' : ""}</div>
            <div class="small muted">${esc(u.email)} · desde ${fdate(u.created_at?.slice(0, 10))} · ${u.linked ? "já entrou pelo Supabase" : "ainda não fez o primeiro login"} · ${u.accounts_count} contas · ${u.transactions_count} lançamentos</div>
          </div>
          <div class="row" style="flex:0 0 auto;gap:6px;width:auto">
            ${u.id === state.user.id ? '<span class="small muted">você</span>' : `
              <button class="btn small" data-role="${u.id}" data-set="${u.is_admin ? 0 : 1}">${u.is_admin ? "Remover admin" : "Tornar admin"}</button>
              <button class="btn small ${u.suspended_at ? "" : "danger"}" data-susp="${u.id}" data-set="${u.suspended_at ? 0 : 1}">${u.suspended_at ? "Reativar" : "Suspender"}</button>
              ${u.linked ? `<button class="btn small" data-mfa="${u.id}">Resetar MFA</button>` : ""}
            `}
          </div>
        </div>
      </div>`).join("") || '<div class="empty">Nenhum usuário encontrado.</div>';

    $("#adminUsers").querySelectorAll("[data-role]").forEach((b) => (b.onclick = async () => {
      await api(`/admin/users/${b.dataset.role}/role`, { method: "POST", body: { is_admin: b.dataset.set === "1" } });
      toast("Papel atualizado", "success"); renderList($("#adminSearch").value);
    }));
    $("#adminUsers").querySelectorAll("[data-susp]").forEach((b) => (b.onclick = async () => {
      const action = b.dataset.set === "1" ? "suspend" : "reactivate";
      await api(`/admin/users/${b.dataset.susp}/${action}`, { method: "POST" });
      toast(action === "suspend" ? "Usuário suspenso" : "Usuário reativado", "success"); renderList($("#adminSearch").value);
    }));
    $("#adminUsers").querySelectorAll("[data-mfa]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Resetar o MFA desse usuário? Ele vai precisar configurar um novo autenticador no próximo login.")) return;
      await api(`/admin/users/${b.dataset.mfa}/reset-mfa`, { method: "POST" });
      toast("MFA resetado", "success"); renderList($("#adminSearch").value);
    }));
  };
  v.innerHTML = `<div class="card">
    <div class="between"><h2>Usuários</h2><input id="adminSearch" placeholder="Buscar por nome ou e-mail…" style="max-width:280px;margin:0"></div>
    <div class="list" id="adminUsers" style="margin-top:12px"><div class="empty">Carregando…</div></div>
  </div>`;
  let searchT;
  $("#adminSearch").addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(() => renderList($("#adminSearch").value), 250); });
  await renderList("");
};

/* ------------------------------------------------------------------ assistente de primeiro acesso */
const OB_STEPS = [
  {
    icon: "sparkles", title: "Bem-vindo ao Finora",
    text: "Vamos preparar seu painel em menos de um minuto. Tudo aqui é opcional — pule quando quiser.",
    fields: [{ name: "name", label: "Como podemos te chamar?" }],
    value: (f) => (f.name === "name" ? state.user.name : ""),
    submit: async (d) => {
      if (d.name && d.name !== state.user.name) {
        state.user = await api("/me", { method: "PATCH", body: { name: d.name } });
        $("#userName").textContent = state.user.name;
      }
    },
  },
  {
    icon: "accounts", title: "Sua primeira conta ou cartão",
    text: "Assim já conseguimos calcular saldo, fatura e alertas pra você.",
    fields: [
      { name: "name", label: "Nome", placeholder: "Ex.: Nubank, Itaú, Carteira" },
      { name: "kind", label: "Tipo", type: "select", options: Object.entries(KINDS) },
    ],
    submit: async (d) => { if (d.name) { await api("/accounts", { body: { name: d.name, kind: d.kind || "checking" } }); await refreshRefs(); } },
  },
  {
    icon: "incomes", title: "Sua renda mensal",
    text: "Usamos isso pra projetar o mês e calcular sua taxa de poupança.",
    fields: [
      { name: "name", label: "Fonte de renda", placeholder: "Ex.: Salário" },
      { name: "net_amount", label: "Valor líquido mensal (R$)", type: "number" },
    ],
    submit: async (d) => { if (+d.net_amount > 0) await api("/incomes", { body: { name: d.name || "Salário", net_amount: +d.net_amount } }); },
  },
  {
    icon: "goals", title: "Uma meta pra economizar",
    text: "Pode ser a reserva de emergência, uma viagem, o que fizer mais sentido agora.",
    fields: [
      { name: "name", label: "Nome da meta", placeholder: "Ex.: Reserva de emergência" },
      { name: "target_amount", label: "Valor alvo (R$)", type: "number" },
    ],
    submit: async (d) => { if (d.name && +d.target_amount > 0) await api("/goals", { body: { name: d.name, target_amount: +d.target_amount } }); },
  },
];
let obIndex = 0;
function startOnboarding() { obIndex = 0; $("#onboarding").classList.remove("hidden"); renderObStep(); }
function renderObStep() {
  const step = OB_STEPS[obIndex], last = obIndex === OB_STEPS.length - 1;
  $("#onboarding").innerHTML = `<div class="ob-card">
    <div class="ob-steps">${OB_STEPS.map((_, i) => `<i class="${i < obIndex ? "done" : i === obIndex ? "active" : ""}"></i>`).join("")}</div>
    <div class="ob-icon">${navIcon(step.icon)}</div>
    <h2>${esc(step.title)}</h2>
    <p class="muted small">${esc(step.text)}</p>
    <form id="obForm">${step.fields.map((f) => field(f, step.value ? step.value(f) : undefined)).join("")}</form>
    <div class="ob-actions">
      ${obIndex > 0 ? `<button class="btn" id="obBack" type="button">Voltar</button>` : ""}
      <button class="btn primary" id="obNext" type="button">${last ? "Concluir" : "Continuar"}</button>
    </div>
    <div class="ob-skip"><button type="button" id="obSkip">Pular por agora</button></div>
  </div>`;
  if (obIndex > 0) $("#obBack").onclick = () => { obIndex--; transitionObStep(-1); };
  $("#obNext").onclick = async () => {
    const fd = new FormData($("#obForm")), data = {};
    step.fields.forEach((f) => (data[f.name] = fd.get(f.name)));
    const btn = $("#obNext"); btn.disabled = true; btn.classList.add("loading");
    try {
      await step.submit(data);
      if (last) return finishOnboarding();
      obIndex++; transitionObStep(1);
    } catch (e) { toast(e.message, "error"); shakeEl(".ob-card"); btn.disabled = false; btn.classList.remove("loading"); }
  };
  $("#obSkip").onclick = () => finishOnboarding();
  if (window.gsap && !reducedMotion()) gsap.fromTo(".ob-card", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: MOTION.standard, ease: MOTION.ease });
}
function transitionObStep(dir) {
  if (!window.gsap || reducedMotion()) return renderObStep();
  gsap.to(".ob-card", { autoAlpha: 0, x: -dir * 16, duration: MOTION.quick, ease: "power1.in", onComplete: renderObStep });
}
async function finishOnboarding() {
  $("#onboarding").classList.add("hidden");
  try { state.user = await api("/me/onboarded", { method: "POST" }); } catch { /* segue mesmo se falhar */ }
  route();
}

/* ------------------------------------------------------------------ assistente de uso (robô) */
const AP_CHIPS = ["Qual meu saldo?", "Quanto gastei esse mês?", "Como importo meu extrato?", "Criar meta", "Abrir categorias"];
function apAddMsg(text, who) {
  const box = $("#ap-msgs");
  const el = document.createElement("div");
  el.className = `ap-msg ${who}`;
  if (who === "bot") el.innerHTML = md(text); else el.textContent = text;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}
const AP_FORMS = { transaction: txForm, account: accountForm, contract: contractForm, goal: goalForm, income: incomeForm, receivable: receivableForm };
function apAddAction(action) {
  if (action.kind === "navigate") { location.hash = action.route; return; }
  if (action.kind === "open_form") {
    const routeByForm = { transaction: "transactions", account: "accounts", contract: "contracts", goal: "goals", income: "incomes" };
    location.hash = routeByForm[action.form] || "dashboard";
    setTimeout(() => AP_FORMS[action.form]?.(action.values || {}), 260);
    return;
  }
  const box = $("#ap-msgs");
  const wrap = document.createElement("div");
  wrap.className = "ap-action";
  wrap.innerHTML = `<button class="btn primary small" type="button">${esc(action.confirm_label)}</button>`;
  wrap.querySelector("button").onclick = async (e) => {
    e.target.disabled = true; e.target.classList.add("loading");
    try {
      const r = await api(action.path, { method: action.method, body: action.body });
      wrap.remove();
      await refreshRefs(); route();
      if (action.kind === "confirm_contract") {
        apAddMsg("Pago! Anexei o formulário aqui embaixo pra você já mandar o comprovante e dar baixa. ✅", "bot");
        txForm(r);
      } else {
        apAddMsg("Pronto! ✅", "bot");
      }
    } catch (err) { apAddMsg("Não consegui: " + err.message, "bot"); }
  };
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}
async function apSend(text) {
  if (!text.trim()) return;
  apAddMsg(text, "user");
  const thinking = apAddMsg("…", "bot");
  try {
    const r = await api("/assistant", { body: { message: text } });
    thinking.remove();
    apAddMsg(r.reply, "bot");
    if (r.action) apAddAction(r.action);
  } catch (e) { thinking.remove(); apAddMsg("Deu um erro aqui: " + e.message, "bot"); }
}
let apNudges = null, apNudgesShown = false;
async function apCheckNudges() {
  try { apNudges = await api("/assistant/nudges"); }
  catch { apNudges = []; }
  $("#apBadge").classList.toggle("hidden", !apNudges.length);
  if (apNudges.length) $("#apBadge").textContent = apNudges.length;
}
function initAssistant() {
  $("#apChips").innerHTML = AP_CHIPS.map((c) => `<button type="button" class="ap-chip">${esc(c)}</button>`).join("");
  $("#apChips").querySelectorAll(".ap-chip").forEach((b) => (b.onclick = () => apSend(b.textContent)));
  $("#assistantBtn").onclick = () => {
    const panel = $("#assistantPanel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      if (!$("#ap-msgs").children.length) {
        apAddMsg("Oi! Sou o assistente do Finora. Posso lançar gastos, criar metas, te levar pra qualquer tela ou explicar como usar qualquer função — é só perguntar.", "bot");
      }
      if (apNudges?.length && !apNudgesShown) {
        apNudgesShown = true;
        apNudges.forEach((n) => { apAddMsg(n.reply, "bot"); if (n.action) apAddAction(n.action); });
        $("#apBadge").classList.add("hidden");
      }
      if (window.gsap && !reducedMotion()) gsap.fromTo(panel, { autoAlpha: 0, y: 10, scale: .97 }, { autoAlpha: 1, y: 0, scale: 1, duration: MOTION.quick, ease: MOTION.ease });
      $("#apInput").focus();
    }
  };
  $("#apClose").onclick = () => $("#assistantPanel").classList.add("hidden");
  $("#apForm").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#apInput").value;
    $("#apInput").value = "";
    apSend(v);
  };
}

/* ------------------------------------------------------------------ PWA */
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window._installPrompt = e; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

initAuth();
initAssistant();
