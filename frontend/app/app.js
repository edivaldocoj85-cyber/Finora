/* Finora — frontend SPA (vanilla JS) */
const PLUGGY_CONNECT_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js";
const GOOGLE_IDENTITY_SRC = "https://accounts.google.com/gsi/client";
// versão do deploy (o servidor põe ?v=<hash> nos .js do index.html); vai pro sw.js também
const BUILD = new URL(document.currentScript?.src || location.href).searchParams.get("v") || "dev";

const state = { token: localGet("finora_token"), user: null, cats: [], accounts: [], costCenters: [], charts: [] };
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fdate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "";
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const canEdit = () => state.user?.workspace_role !== "viewer";
// Torna um elemento clicável também acionável por teclado (Enter/Espaço), sem duplicar a lógica em cada tela.
function clickable(el, fn) {
  el.tabIndex = 0; el.setAttribute("role", "button");
  el.onclick = fn;
  el.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fn(); } };
}

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
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  flow: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  pie: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  piggy: '<path d="M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z"/><path d="M16 10h.01"/><path d="M2 8v1a2 2 0 0 0 2 2h1"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
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
  { id: "cashflow", label: "Fluxo de caixa", icon: "flow", primary: true },
  { id: "cards", label: "Cartões", icon: "cards", mobile: true, primary: true },
  { id: "accounts", label: "Contas", icon: "accounts", primary: true },
  { id: "patrimonio", label: "Patrimônio", icon: "patrimonio", primary: true },
  { id: "pots", label: "Caixinhas", icon: "piggy", primary: true },
  { id: "investments", label: "Investimentos", icon: "pie", primary: true },
  { id: "market", label: "Mercado e simulador", icon: "market", primary: true },
  { id: "contracts", label: "Contratos e fixas", icon: "contracts" },
  { id: "receivables", label: "Contas a receber", icon: "receivables" },
  { id: "incomes", label: "Renda", icon: "incomes" },
  { id: "categories", label: "Categorias e regras", icon: "categories" },
  { id: "dre", label: "DRE (empresa)", icon: "contracts" },
  { id: "costcenters", label: "Centros de custo e tags", icon: "layers" },
  { id: "goals", label: "Metas", icon: "goals" },
  { id: "reserve", label: "Reserva de emergência", icon: "reserve" },
  { id: "advisor", label: "Consultor", icon: "advisor", mobile: true },
  { id: "bank", label: "Conexões bancárias", icon: "bank" },
  { id: "taxes", label: "Impostos", icon: "taxes" },
  { id: "settings", label: "Configurações", icon: "settings" },
  { id: "report", label: "Relatório do mês", icon: "contracts", hidden: true },
];
function visibleRoutes() {
  if (state.user?.workspace_cc?.length) return ROUTES.filter((r) => ["transactions", "costcenters", "settings"].includes(r.id));
  return state.user?.is_admin ? [...ROUTES, { id: "admin", label: "Administração", icon: "admin" }] : ROUTES;
}

/* ------------------------------------------------------------------ API */
async function api(path, opts = {}) {
  const headers = { ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  const ws = localGet("finora_ws"); if (ws) headers["X-Workspace"] = ws;
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

/* confirmação no visual do Finora (substitui confirm()/prompt() do navegador). Abre por cima
   de outro <dialog> se preciso — showModal empilha na top layer. `requireText` exige digitar
   a palavra antes de liberar ações irreversíveis. Resolve true/false. */
function askConfirm({ title, message = "", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false, requireText = "" }) {
  const dlg = $("#confirmDlg");
  dlg.innerHTML = `<form method="dialog" class="cf-form">
    <div class="cf-head"><span class="cf-ic ${danger ? "danger" : ""}">${navIcon(danger ? "trash" : "info")}</span><h2 id="cfTitle">${esc(title)}</h2></div>
    ${message ? `<p class="cf-msg">${esc(message)}</p>` : ""}
    ${requireText ? `<label>Digite <b>${esc(requireText)}</b> para confirmar<input id="cfTxt" autocomplete="off" spellcheck="false"></label>` : ""}
    <div class="modal-actions"><button class="btn" value="no" type="submit">${esc(cancelLabel)}</button>
    <button class="btn ${danger ? "danger-solid" : "primary"}" value="yes" type="submit" id="cfOk" ${requireText ? "disabled" : ""}>${esc(confirmLabel)}</button></div></form>`;
  if (requireText) $("#cfTxt").oninput = (e) => ($("#cfOk").disabled = e.target.value.trim().toUpperCase() !== requireText);
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === "yes");
    dlg.returnValue = ""; dlg.showModal();
    (requireText ? $("#cfTxt") : $("#cfOk")).focus();
  });
}

/* ------------------------------------------------------------------ auth */
// Login (Google) e MFA (TOTP) são geridos inteiramente pelo Supabase Auth no browser —
// o backend nunca vê credencial nenhuma, só o token de sessão já pronto (ver ../auth.py).
let sb = null;

function logout() {
  sb?.auth.signOut();
  state.token = null; localSet("finora_token", null); localSet("finora_ws", null); location.hash = ""; showAuth();
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
  await boot();
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
    // sessão salva que não serve mais (expirada/revogada): apaga só neste navegador, senão
    // cada recarga lê a mesma sessão quebrada e cai no mesmo erro
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    state.token = null; localSet("finora_token", null);
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
    ctx.fillStyle = dark ? "rgba(125,147,242,.55)" : "rgba(35,64,216,.4)";
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

  let session = null;
  try {
    ({ data: { session } } = await sb.auth.getSession());
    if (session) await ensureMfaThenBoot(); else showAuth();
  } catch {
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    state.token = null; localSet("finora_token", null);
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
  const routes = visibleRoutes().filter((r) => !r.hidden);
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
  try { state.user = await api("/me"); } catch (e) {
    showAuth();
    $("#authError").textContent = `Não foi possível abrir sua conta (${e.message}). Tente de novo em instantes.`;
    return;
  }
  if (state.user.trial_expired) return showTrialExpired();
  $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#userName").textContent = state.user.name;
  renderWorkspaceBanner(); renderWorkspaceSelect();
  const restricted = !!state.user.workspace_cc?.length;
  ["#alertsBtn", "#assistantBtn"].forEach((s) => $(s)?.classList.toggle("hidden", restricted));
  if (!$("#monthRef").value) $("#monthRef").value = today().slice(0, 7);
  // sem isso, uma falha aqui deixava o painel aberto e vazio (tela branca, sem aviso)
  try { buildNav(); await refreshRefs(); route(); } catch (e) {
    $("#view").innerHTML = `<div class="card"><h3>Não foi possível carregar seus dados</h3><p class="muted">${esc(e.message || "Erro desconhecido")}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
    return;
  }
  if (!state.user.onboarded && !restricted) startOnboarding(); else dailyPrompt();
  apCheckNudges();
}
/* 1º acesso do dia: sugere lançar os gastos de hoje. Marca o dia antes de perguntar, então
   aparece uma vez só por dia (por usuário e navegador), mesmo se a pessoa disser "agora não". */
async function dailyPrompt() {
  if (!canEdit() || !state.accounts.length) return;
  const key = `finora_daily_${state.user.id}`, t = today();
  if (localGet(key) === t) return;
  localSet(key, t);
  let count = 0;
  try { count = (await api(`/transactions?start=${t}&end=${t}&limit=50`)).length; } catch { /* pergunta mesmo assim */ }
  if (document.querySelector("dialog[open]")) return;
  const h = new Date().getHours();
  const hello = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const first = String(state.user.name || "").split(" ")[0];
  const ok = await askConfirm({
    title: `${hello}${first ? ", " + first : ""}! Vamos lançar os gastos de hoje?`,
    message: count
      ? `Você já tem ${count} ${count === 1 ? "lançamento" : "lançamentos"} hoje. Quer adicionar mais algum?`
      : "Anotar na hora evita esquecer aquele café, o Pix do almoço ou a corrida de aplicativo.",
    confirmLabel: "Lançar agora", cancelLabel: "Agora não",
  });
  if (ok) txForm();
}
function renderWorkspaceBanner() {
  const el = $("#workspaceBanner"), owner = state.user.workspace_role !== "owner" ? state.user.workspace_owner : null;
  if (!owner) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const roleLabel = state.user.workspace_role === "viewer" ? "somente leitura" : "pode editar";
  el.innerHTML = `${navIcon("users")} Você está vendo os dados de <strong>${esc(owner.name)}</strong> (${roleLabel}) <button class="btn small ghost" id="wbLeave" style="margin-left:auto">Sair desse acesso</button>`;
  el.classList.remove("hidden");
  $("#wbLeave").onclick = async () => {
    if (!await askConfirm({ title: "Sair do acesso compartilhado?", message: "Você volta a ver só os seus próprios dados.", confirmLabel: "Sair do acesso" })) return;
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
    <div class="brand big"><span class="logo" aria-hidden="true">F</span><span class="brand-txt" style="text-align:left"><b>Finora</b><small>Controle Financeiro</small></span></div>
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
  [state.cats, state.accounts, state.costCenters] = await Promise.all([api("/categories"), api("/accounts"), api("/cost-centers")]);
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
  const r = visibleRoutes().find((x) => x.id === id) || (id === "more" ? { id: "more", label: "Menu" } : visibleRoutes()[0]);
  document.querySelectorAll("[data-r]").forEach((a) => a.classList.toggle("active", a.dataset.r === r.id));
  $("#pageTitle").textContent = r.label;
  state.charts.forEach((c) => c.destroy()); state.charts = [];
  // cada navegação ganha um #view novo: se a tela anterior ainda estiver carregando (ex.:
  // Mercado esperando o Banco Central), ela termina num elemento solto e não sobrescreve esta
  const old = $("#view"), view = old.cloneNode(false);
  view.className = "";  // classes de layout de uma tela (ex.: dash-flex do painel) não passam pra próxima
  old.replaceWith(view);
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
  if (onDelete) $("#fDel").onclick = async () => {
    if (!await askConfirm({ title: `Excluir ${title.replace(/^(Editar|Novo|Nova)\s+/i, "").toLowerCase()}?`, message: "Essa ação não pode ser desfeita.", confirmLabel: "Excluir", danger: true })) return;
    await onDelete(); dlg.close(); toast("Excluído", "success"); route();
  };
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
const ccOptions = () => [...(state.user?.workspace_cc?.length ? [] : [["0", "Nenhum"]]), ...state.costCenters.filter((c) => !c.archived).map((c) => [c.id, c.name])];
const tagsChips = (tags) => (tags || []).map((t) => `<span class="chip c-tag">#${esc(t)}</span>`).join(" ");
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
    { row: [{ name: "cost_center_id", label: "Centro de custo", type: "select", options: ccOptions(), num: true },
      { name: "tags", label: "Tags (separe por vírgula)", placeholder: "viagem, reforma" }] },
    ...(isEdit ? [{ name: "create_rule", label: "Aplicar esta categoria sempre para descrições parecidas", type: "checkbox" }] : []),
    { name: "notes", label: "Observações", type: "textarea" },
  ];
  openForm({
    title: isEdit ? "Editar lançamento" : "Novo lançamento", fields,
    values: { date: today(), installments: 1, type: "expense", ...values, cost_center_id: values.cost_center_id || 0, tags: (values.tags || []).join(", ") },
    extra: isEdit ? `<label>${values.has_receipt ? "Comprovante anexado" : "Anexar comprovante"}
      ${values.has_receipt ? `<div class="row" style="margin-top:4px"><a class="btn small" href="/api/transactions/${values.id}/receipt" target="_blank" rel="noopener">Ver comprovante</a><button type="button" class="btn small danger" id="rmReceipt">Remover</button></div>` : `<input type="file" id="receiptFile" accept="image/*,.pdf">`}
      </label>` : "",
    onSubmit: async (d) => {
      if (!d.category_id) d.category_id = null;
      d.tags = String(d.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
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
// atalhos de teclado: N = novo lançamento, / = buscar (na tela de lançamentos).
// Ignorados enquanto se digita ou com algum diálogo aberto.
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || $("#app").classList.contains("hidden")) return;
  if (e.target.closest("input, select, textarea, [contenteditable]") || document.querySelector("dialog[open]")) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); txForm(); }
  else if (e.key === "/" && $("#fq")) { e.preventDefault(); $("#fq").focus(); }
});

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
  Chart.defaults.font.family = "'Public Sans', system-ui, sans-serif";
  const c = new Chart(el, cfg); state.charts.push(c); return c;
}
const monthLabel = (m) => { const [y, mo] = m.split("-"); return new Date(y, mo - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); };
const pct = (a, b) => (b ? Math.min(100, (a / b) * 100) : 0);
// preenchimento das barras de progresso via transform (evita animar `width`, que causa layout thrash)
const barFill = (p) => `transform:scaleX(${Math.max(0, Math.min(100, p)) / 100})`;

/* ------------------------------------------------------------------ views */
const VIEWS = {};

VIEWS.more = async (v) => {
  v.innerHTML = `<div class="card list">${visibleRoutes().filter((r) => !r.hidden).map((r) => `<a class="li" style="text-decoration:none;color:inherit" href="#${r.id}">${navIcon(r.icon)}<div class="grow title">${esc(r.label)}</div><span class="muted">›</span></a>`).join("")}
  <a class="li" style="text-decoration:none;color:inherit" href="#" onclick="logout();return false">${navIcon("logout")}<div class="grow title">Sair</div></a></div>`;
};

/* saúde financeira: indicadores com faixa de referência (cálculo em analytics.financial_health) */
const HEALTH_LABEL = { good: "bom", warn: "atenção", bad: "crítico", unknown: "sem dados" };
function kpiValue(k) {
  if (k.value == null) return "—";
  if (k.format === "pct") return pctBR(k.value, 1);
  if (k.format === "months") return `${k.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${k.value >= 1 && k.value < 2 ? "mês" : "meses"}`;
  return k.value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function healthCard(h) {
  if (!h || h.score == null) return "";
  const cls = h.score >= 75 ? "good" : h.score >= 45 ? "warn" : "bad";
  return `<div class="card health" data-sec="health" style="margin-top:16px"><div class="between"><h2 style="margin:0">Saúde financeira</h2>
      <span class="health-score ${cls}" title="Média dos indicadores (0 a 100)">${h.score}<small>/100</small></span></div>
    <div class="health-grid">${h.kpis.map((k) => `<div class="health-kpi ${k.status}" title="${esc(k.hint)}">
      <div class="small muted">${esc(k.label)}</div><div class="hv">${kpiValue(k)}</div>
      <div class="small"><span class="dot-st"></span>${HEALTH_LABEL[k.status]} · <span class="muted">meta ${esc(k.target)}</span></div></div>`).join("")}</div>
    <p class="small muted" style="margin:8px 0 0">Base: gasto médio de ${brl(h.base.avg_expense)} e renda de ${brl(h.base.income)} por mês (últimos 3 meses fechados). Passe o mouse num indicador pra ver como é calculado.</p></div>`;
}

/* painel personalizável: esconder e reordenar blocos (salvo na conta, vale em todo aparelho) */
const DASH_SECTIONS = [["kpis", "Patrimônio e resultado do mês"], ["health", "Saúde financeira"], ["insights", "O que fazer agora"],
  ["charts", "Gráficos de receitas e categorias"], ["bills", "Orçamentos, vencimentos e cartões"], ["accounts", "Contas e metas"],
  ["receivables", "Contas a receber"], ["essentials", "Essenciais x não essenciais"]];
function dashLayout() {
  let l = {}; try { l = JSON.parse(state.user?.dashboard_layout || "{}") || {}; } catch {}
  const order = (l.order || []).filter((k) => DASH_SECTIONS.some(([s]) => s === k));
  DASH_SECTIONS.forEach(([k]) => { if (!order.includes(k)) order.push(k); });
  return { order, hidden: l.hidden || [] };
}
function applyDashLayout(v) {
  const l = dashLayout();
  v.classList.add("dash-flex");
  v.querySelectorAll("[data-sec]").forEach((el) => {
    el.style.order = String(l.order.indexOf(el.dataset.sec) + 1);
    el.style.display = l.hidden.includes(el.dataset.sec) ? "none" : "";
  });
  if (!$("#dashCustom", v)) {
    v.insertAdjacentHTML("beforeend", `<div class="dash-custom" style="order:99"><a class="btn ghost small" href="#report">${navIcon("contracts")} Relatório do mês (PDF/Excel)</a><button type="button" class="btn ghost small" id="dashCustom">${navIcon("settings")} Personalizar painel</button></div>`);
    $("#dashCustom", v).onclick = () => dashCustomize();
  }
}
function dashCustomize() {
  const form = $("#modalForm"), dlg = $("#modal"), l = dashLayout();
  const label = Object.fromEntries(DASH_SECTIONS);
  const render = () => {
    form.innerHTML = `<h2>Personalizar painel</h2><p class="small muted">Escolha o que aparece e em que ordem.</p>
      <div class="list">${l.order.map((k, i) => `<div class="li"><label class="check grow" style="margin:0"><input type="checkbox" data-k="${k}" ${l.hidden.includes(k) ? "" : "checked"}> ${esc(label[k])}</label>
        <button type="button" class="icon-btn" data-up="${i}" ${i ? "" : "disabled"} aria-label="Subir">↑</button><button type="button" class="icon-btn" data-down="${i}" ${i < l.order.length - 1 ? "" : "disabled"} aria-label="Descer">↓</button></div>`).join("")}</div>
      <div class="modal-actions"><button type="button" class="btn" id="dlReset" style="margin-right:auto">Padrão</button><button type="button" class="btn" id="dlCancel">Cancelar</button><button type="button" class="btn primary" id="dlSave">Salvar</button></div>`;
    form.querySelectorAll("[data-k]").forEach((c) => (c.onchange = () => { l.hidden = c.checked ? l.hidden.filter((x) => x !== c.dataset.k) : [...l.hidden, c.dataset.k]; }));
    const move = (i, d) => { const t = l.order[i]; l.order[i] = l.order[i + d]; l.order[i + d] = t; render(); };
    form.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => move(+b.dataset.up, -1)));
    form.querySelectorAll("[data-down]").forEach((b) => (b.onclick = () => move(+b.dataset.down, 1)));
    $("#dlCancel").onclick = () => dlg.close();
    $("#dlReset").onclick = async () => { state.user = await api("/me", { method: "PATCH", body: { dashboard_layout: "{}" } }); dlg.close(); route(); };
    $("#dlSave").onclick = async () => { state.user = await api("/me", { method: "PATCH", body: { dashboard_layout: JSON.stringify(l) } }); dlg.close(); route(); };
  };
  form.onsubmit = (e) => e.preventDefault();
  render();
  dlg.showModal();
}

/* ------------------------------------------------------------------ pessoal × empresas (espaços de dados) */
// o espaço escolhido vai em todo pedido (X-Workspace); o servidor confere a permissão a cada vez
function renderWorkspaceSelect() {
  const sel = $("#wsSel"), ws = state.user?.workspaces || [];
  if (!sel) return;
  sel.innerHTML = ws.map((w) => `<option value="${w.id}" ${w.id === state.user.workspace_id ? "selected" : ""}>${esc(w.name)}${w.role === "viewer" ? " (leitura)" : ""}</option>`).join("")
    + (canEditOwn() ? `<option value="new">＋ Nova empresa…</option>` : "");
  sel.classList.toggle("hidden", !ws.length);
  sel.onchange = async () => {
    if (sel.value === "new") { sel.value = String(state.user.workspace_id); companyForm(); return; }
    await switchWorkspace(+sel.value);
  };
}
const canEditOwn = () => !!state.user; // qualquer pessoa pode criar as próprias empresas
async function switchWorkspace(id) {
  localSet("finora_ws", String(id));
  state.user = await api("/me");
  renderWorkspaceBanner(); renderWorkspaceSelect();
  await refreshRefs(); buildNav(); route();
  toast(`Agora em: ${state.user.workspace_name}`, "success");
}
function companyForm(c = {}) {
  openForm({
    title: c.id ? `Editar ${c.name}` : "Nova empresa",
    values: { kind: "pj", chart: true, ...c },
    fields: [{ row: [{ name: "name", label: "Nome", required: true, placeholder: "Ex.: Padaria Ltda, MEI João" }, { name: "document", label: "CNPJ (opcional)" }] },
      { name: "kind", label: "Tipo", type: "select", options: [["pj", "Empresa (PJ)"], ["pf", "Outra pessoa ou família (PF)"]] },
      ...(c.id ? [] : [{ name: "chart", label: "Criar com o plano de contas de empresa (receitas, custos, despesas e DRE)", type: "checkbox" }])],
    extra: `<p class="small muted">Os dados da empresa ficam separados dos seus. Troque entre Pessoal e empresas no seletor do topo. Pra dar acesso ao sócio ou ao contador, entre na empresa e use Configurações → Acesso compartilhado.</p>`,
    onSubmit: async (d) => {
      const r = await api(c.id ? `/companies/${c.id}` : "/companies", { method: c.id ? "PUT" : "POST", body: { chart: true, ...d } });
      if (!c.id) { await switchWorkspace(r.id); } else { state.user = await api("/me"); renderWorkspaceSelect(); }
    },
  });
}

const DRE_GROUPS = [["", "Fora da DRE / sem grupo"], ["receita_bruta", "Receita bruta"], ["deducoes", "Deduções"], ["custos", "Custos (CMV/CSP)"],
  ["despesas_pessoal", "Despesas com pessoal"], ["despesas_adm", "Despesas administrativas"], ["despesas_comerciais", "Despesas comerciais"],
  ["receitas_financeiras", "Receitas financeiras"], ["despesas_financeiras", "Despesas financeiras"], ["outras_receitas", "Outras receitas"],
  ["outras_despesas", "Outras despesas"], ["impostos_lucro", "IRPJ e CSLL"], ["capex", "Investimentos (fora da DRE)"], ["distribuicao", "Distribuição de lucros"]];
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
  // saudação + resumo de vencimentos (só no mês corrente: "hoje" não faz sentido olhando o passado)
  const isToday = refDate() === today();
  const dueToday = d.upcoming.filter((b) => b.days_left === 0), dueNext = d.upcoming.filter((b) => b.days_left > 0);
  const sum = (xs) => xs.reduce((s, b) => s + b.amount, 0);
  const firstName = esc((state.user?.name || "").trim().split(/\s+/)[0] || "");
  const greeting = isToday ? `<div class="greet">
    <div class="greet-txt"><strong>Olá${firstName ? `, ${firstName}` : ""}</strong>
      <span>${dueToday.length ? `Você tem ${dueToday.length === 1 ? "1 conta" : `${dueToday.length} contas`} a pagar hoje no total de <b class="neg">${brl(sum(dueToday))}</b>.` : "Nenhuma conta vencendo hoje."}</span></div>
    <div class="greet-due">
      <div class="gd gd-today"><span>Vencendo hoje</span><b>${brl(sum(dueToday))}</b></div>
      <div class="gd gd-next"><span>Próximos 10 dias</span><b>${brl(sum(dueNext))}</b></div>
    </div>
  </div>` : "";
  v.innerHTML = `
  ${greeting}
  ${empty ? `<div class="card" style="margin-bottom:16px"><h2>Bem-vindo ao Finora</h2><p class="muted">Comece em 3 passos: <a href="#bank">conecte seus bancos</a> ou <a href="#accounts">cadastre contas e cartões</a>, informe sua <a href="#incomes">renda</a> e seus <a href="#contracts">contratos e contas fixas</a>.</p></div>` : ""}
  <div class="grid g4 keep2" data-sec="kpis">
    <div class="card stat hero"><h3>Patrimônio líquido</h3><div class="value" data-count="${d.net_worth}">${brl(d.net_worth)}</div><div class="sub">Saldo ${brl(d.cash)} · Invest. ${brl(d.investments)}${d.assets_total ? ` · Bens ${brl(d.assets_total)}` : ""}</div></div>
    <div class="card stat tint-green"><h3>Receitas do mês</h3><div class="value pos" data-count="${d.month.income}">${brl(d.month.income)}</div><div class="sub">Esperado ${brl(d.expected_income)}</div></div>
    <div class="card stat tint-red"><h3>Despesas do mês</h3><div class="value neg" data-count="${d.month.expense}">${brl(d.month.expense)}</div><div class="sub">Projeção ${brl(d.projected_expense)}</div></div>
    <div class="card stat tint-violet"><h3>Resultado</h3><div class="value ${bal >= 0 ? "pos" : "neg"}" data-count="${bal}">${brl(bal)}</div><div class="sub">Poupança projetada ${d.savings_rate ?? "–"}%</div></div>
  </div>
  ${healthCard(d.health)}
  ${d.insights?.length ? `<div class="card" data-sec="insights" style="margin-top:16px"><h2>${navIcon("sparkles")} O que fazer agora</h2>
    <div class="list">${d.insights.map((i) => `<a class="li insight" href="#${esc(i.action?.route || "dashboard")}"><div class="grow"><div class="title">${esc(i.title)}</div><div class="small muted">${esc(i.message)}</div></div>${i.action ? `<span class="small" style="flex:none;color:var(--primary)">${esc(i.action.label)} ›</span>` : ""}</a>`).join("")}</div></div>` : ""}
  <div class="grid g2" data-sec="charts" style="margin-top:16px">
    <div class="card"><div class="between"><h2 style="margin:0">Receitas x despesas</h2>
      <div class="tabs" id="trendToggle" style="margin:0"><button type="button" data-m="6" class="${dashboardTrendMonths == 6 ? "active" : ""}">6 meses</button><button type="button" data-m="12" class="${dashboardTrendMonths == 12 ? "active" : ""}">12 meses</button></div></div>
      <div class="chart-box" style="margin-top:12px"><canvas id="cMonths"></canvas></div></div>
    <div class="card"><h2>Gastos por categoria</h2>${d.categories.length ? `<div class="chart-box"><canvas id="cCats"></canvas></div>` : '<div class="empty">Sem gastos neste mês.</div>'}</div>
  </div>
  <div class="grid g3" data-sec="bills" style="margin-top:16px">
    <div class="card"><h2>Orçamentos</h2><div class="list">${d.categories.map((c) => {
      const p = pct(c.total, c.budget), cls = c.budget ? (c.total >= c.budget ? "over" : p >= 80 ? "warn" : "") : "";
      return `<div class="li" style="display:block"><div class="between"><span><span class="dot" style="display:inline-block;background:${esc(c.color)}"></span> ${esc(c.name)}</span><span class="amount">${brl(c.total)}${c.budget ? ` <span class="muted small">/ ${brl(c.budget)}</span>` : ""}</span></div>
      ${c.budget ? `<div class="bar ${cls}"><i style="${barFill(p)}"></i></div>` : ""}${c.prev ? `<div class="small muted">Mês anterior: ${brl(c.prev)}</div>` : ""}</div>`;
    }).join("") || '<div class="empty">Nada por aqui.</div>'}</div></div>
    <div class="card"><h2>Próximos vencimentos</h2><div class="list">${d.upcoming.map((b) => `<div class="li"><div class="grow"><div class="title">${esc(b.name)}</div><div class="small muted">${fdate(b.due_date)} · ${b.days_left === 0 ? "hoje" : `em ${b.days_left} dia(s)`}</div></div><div class="amount">${brl(b.amount)}</div>${b.kind === "contract" && b.account_id ? `<button class="btn small" data-pay="${b.contract_id}" data-amt="${b.amount}" data-due="${b.due_date}" style="margin-left:8px">Marcar pago</button>` : ""}</div>`).join("") || '<div class="empty">Nada vencendo nos próximos 10 dias.</div>'}</div></div>
    <div class="card"><h2>Cartões</h2><div class="list">${d.cards.map((c) => `<div class="li" style="display:block"><div class="between"><strong>${esc(c.name)}</strong><span class="amount">${brl(c.total)}</span></div>
      <div class="small muted">${c.closed ? "Fatura fechada · vence" : "Fatura aberta · vence"} ${fdate(c.due_date)}${c.limit ? ` · ${c.usage_pct}% do limite` : ""}</div>${c.limit ? `<div class="bar ${c.usage_pct >= 80 ? "over" : c.usage_pct >= 60 ? "warn" : ""}"><i style="${barFill(c.usage_pct)}"></i></div>` : ""}</div>`).join("") || '<div class="empty">Nenhum cartão cadastrado.</div>'}</div></div>
  </div>
  <div class="grid g2" data-sec="accounts" style="margin-top:16px">
    <div class="card"><h2>Contas</h2><div class="list">${d.accounts.filter((a) => a.kind !== "credit_card").map((a) => `<div class="li"><span class="dot" style="background:${esc(a.color)}"></span><div class="grow"><div class="title">${esc(a.name)}</div><div class="small muted">${esc(KINDS[a.kind])}${a.institution ? " · " + esc(a.institution) : ""}</div></div><div class="amount ${a.balance < 0 ? "neg" : ""}">${brl(a.balance)}</div></div>`).join("") || '<div class="empty">Nenhuma conta.</div>'}</div></div>
    <div class="card"><h2>Metas</h2><div class="list">
      ${d.emergency_fund ? `<a class="li" style="display:block;text-decoration:none;color:inherit" href="#reserve"><div class="between"><strong>${navIcon("reserve")} Reserva de emergência</strong><span class="small">${d.emergency_fund.months_covered} / ${d.emergency_fund.months_target} meses</span></div><div class="bar"><i style="${barFill(pct(d.emergency_fund.current, d.emergency_fund.target))}"></i></div></a>` : `<a class="li" style="display:block;text-decoration:none;color:inherit" href="#reserve"><strong>${navIcon("reserve")} Configure sua reserva de emergência</strong><div class="small muted">Meses de despesas guardados pra imprevistos</div></a>`}
      ${d.goals.map((g) => `<div class="li" style="display:block"><div class="between"><strong>${esc(g.name)}</strong><span class="small">${brl(g.current)} / ${brl(g.target)}</span></div><div class="bar"><i style="${barFill(pct(g.current, g.target))}"></i></div></div>`).join("") || (d.emergency_fund ? "" : '<div class="empty"><a href="#goals">Crie uma meta</a> para acompanhar sua evolução.</div>')}
    </div></div>
  </div>
  ${d.receivables.count_pending ? `<div class="card" data-sec="receivables" style="margin-top:16px"><div class="between"><h2>Contas a receber</h2><span class="small muted">${brl(d.receivables.total_pending)} pendente</span></div>
    <div class="list">${d.receivables.upcoming.map((r) => `<div class="li"><div class="grow"><div class="title">${esc(r.client_name)}${r.description ? " · " + esc(r.description) : ""}${r.overdue ? ' <span class="chip c-red">atrasado</span>' : ""}</div><div class="small muted">Vencia ${fdate(r.due_date)}</div></div><div class="amount">${brl(r.amount)}</div><button class="btn small" data-recv="${r.id}" style="margin-left:8px">Marcar recebido</button></div>`).join("") || '<div class="empty">Nada por enquanto.</div>'}</div></div>` : ""}
  ${(() => {
    const essTotal = d.categories.filter((c) => c.essential).reduce((s, c) => s + c.total, 0);
    const nonEss = d.categories.filter((c) => !c.essential);
    const nonEssTotal = nonEss.reduce((s, c) => s + c.total, 0);
    const cTotal = essTotal + nonEssTotal;
    const essPct = cTotal ? Math.round((essTotal / cTotal) * 100) : 0;
    if (!cTotal) return "";
    return `<div class="card" data-sec="essentials" style="margin-top:16px"><h2>Essenciais x não essenciais</h2>
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
  applyDashLayout(v);
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
      <input id="fq" placeholder="Buscar descrição…  ( / )" aria-keyshortcuts="/" style="min-width:200px">
      <select id="facc"><option value="">Todas as contas</option>${accOptions().map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select>
      <select id="fcat"><option value="">Todas as categorias</option>${state.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <select id="ftype"><option value="">Todos os tipos</option><option value="expense">Despesas</option><option value="income">Receitas</option><option value="transfer">Transferências</option></select>
      <select id="fcc" title="Centro de custo"><option value="">Todo centro de custo</option><option value="0">Sem centro de custo</option>${state.costCenters.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <input id="ftag" placeholder="#tag" title="Filtrar por tag" style="max-width:120px">
      <select id="fsrc" title="Origem"><option value="">Toda origem</option><option value="manual">Lançado manual/CSV</option><option value="pluggy">Open Finance</option></select>
      <button class="btn" id="imp">Importar extrato</button><button class="btn" id="rec" title="Conferir o extrato do banco com o que já foi lançado">Conciliar</button><button class="btn" id="exp">Exportar</button>
    </div>
    <div class="toolbar">
      <input id="fstart" type="date" title="De" value="${s}">
      <input id="fend" type="date" title="Até" value="${e}">
      <input id="fmin" type="number" step="0.01" min="0" placeholder="Valor mín (R$)" title="Valor mínimo" style="max-width:150px">
      <input id="fmax" type="number" step="0.01" min="0" placeholder="Valor máx (R$)" title="Valor máximo" style="max-width:150px">
      <button class="btn ghost small" id="fclear" type="button">Limpar período/valor</button>
    </div>
    <div id="sum" class="small muted" style="margin-bottom:8px"></div>
    <div id="bulkBar" class="bulk-bar hidden" role="region" aria-label="Ações em lote">
      <strong id="bulkCount"></strong>
      <select id="bulkCat" aria-label="Categoria para os selecionados"><option value="">Categorizar como…</option>${state.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>
      <button class="btn small primary" id="bulkApply" type="button">${navIcon("tag")} Aplicar categoria</button>
      <select id="bulkCc" aria-label="Centro de custo para os selecionados"><option value="">Centro de custo…</option>${ccOptions().map(([k, l]) => `<option value="${k}">${k === "0" ? "Tirar do centro de custo" : esc(l)}</option>`).join("")}</select>
      <button class="btn small" id="bulkCcApply" type="button">Aplicar centro</button>
      <input id="bulkTag" placeholder="tag" aria-label="Tag para os selecionados" style="max-width:110px">
      <button class="btn small" id="bulkTagAdd" type="button">+ Tag</button>
      <button class="btn small danger" id="bulkDel" type="button">${navIcon("trash")} Excluir</button>
      <button class="btn small ghost" id="bulkClear" type="button">Limpar seleção</button>
    </div>
    <div class="table-wrap"><table><thead><tr>${canEdit() ? '<th class="sel"><input type="checkbox" id="selAll" aria-label="Selecionar todos"></th>' : ""}<th>Data</th><th>Descrição</th><th class="hide-sm">Categoria</th><th class="hide-sm">Conta</th><th class="num">Valor</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const load = async () => {
    const p = new URLSearchParams({ start: $("#fstart").value || s, end: $("#fend").value || e });
    if ($("#fq").value) p.set("q", $("#fq").value);
    if ($("#facc").value) p.set("account_id", $("#facc").value);
    if ($("#fcat").value) p.set("category_id", $("#fcat").value);
    if ($("#ftype").value) p.set("type", $("#ftype").value);
    if ($("#fsrc").value) p.set("source", $("#fsrc").value);
    if ($("#fcc").value !== "") p.set("cost_center_id", $("#fcc").value);
    if ($("#ftag").value.trim()) p.set("tag", $("#ftag").value.trim().replace(/^#/, ""));
    if ($("#fmin").value) p.set("min_amount", $("#fmin").value);
    if ($("#fmax").value) p.set("max_amount", $("#fmax").value);
    const rows = await api("/transactions?" + p);
    const inc = rows.filter((r) => r.type === "income").reduce((a, r) => a + r.amount, 0);
    const exp = rows.filter((r) => r.type === "expense").reduce((a, r) => a + r.amount, 0);
    $("#sum").innerHTML = `${rows.length} lançamento(s) · Receitas <b class="pos">${brl(inc)}</b> · Despesas <b class="neg">${brl(exp)}</b>`;
    sel.clear(); syncBulk();
    $("#tb").innerHTML = rows.map((t) => `<tr class="clickable" data-id="${t.id}" tabindex="0" role="button">${canEdit() ? `<td class="sel"><input type="checkbox" data-sel="${t.id}" aria-label="Selecionar ${esc(t.description)}"></td>` : ""}<td>${fdate(t.date)}</td>
      <td><div style="max-width:320px;overflow:hidden;text-overflow:ellipsis">${esc(t.description)}</div>${t.installment ? `<span class="chip c-violet">${esc(t.installment)}</span> ` : ""}${t.source === "pluggy" ? '<span class="chip c-cyan">Open Finance</span>' : ""}${t.reconciled ? ' <span class="chip c-green" title="Conferido com o extrato do banco">✓ conciliado</span>' : ""}${t.cost_center_name ? ` <span class="chip c-cc">${esc(t.cost_center_name)}</span>` : ""} ${tagsChips(t.tags)}<div class="small muted" style="display:none" data-sm>${esc(t.category_name)}</div></td>
      <td class="hide-sm"><span class="dot" style="display:inline-block;background:${esc(t.category_color)}"></span> ${esc(t.category_name || "—")}</td>
      <td class="hide-sm">${esc(t.account_name)}</td>
      <td class="num ${t.type === "income" ? "pos" : t.type === "expense" ? "neg" : "muted"}">${t.type === "expense" ? "-" : ""}${brl(t.amount)}</td></tr>`).join("")
      || `<tr><td colspan="6" class="empty">Nenhum lançamento neste período.</td></tr>`;
    $("#tb").onclick = (ev) => {
      if (ev.target.closest(".sel")) return;
      const tr = ev.target.closest("tr[data-id]"); if (tr) txForm(rows.find((r) => r.id == tr.dataset.id));
    };
    $("#tb").onchange = (ev) => {
      const cb = ev.target.closest("[data-sel]"); if (!cb) return;
      cb.checked ? sel.add(+cb.dataset.sel) : sel.delete(+cb.dataset.sel);
      cb.closest("tr").classList.toggle("selected", cb.checked); syncBulk(rows.length);
    };
    if ($("#selAll")) $("#selAll").onchange = (ev) => {
      $("#tb").querySelectorAll("[data-sel]").forEach((cb) => {
        cb.checked = ev.target.checked; cb.closest("tr").classList.toggle("selected", cb.checked);
        cb.checked ? sel.add(+cb.dataset.sel) : sel.delete(+cb.dataset.sel);
      });
      syncBulk(rows.length);
    };
    $("#tb").onkeydown = (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const tr = ev.target.closest("tr[data-id]"); if (!tr) return;
      ev.preventDefault(); txForm(rows.find((r) => r.id == tr.dataset.id));
    };
  };
  // seleção em lote: revisar o mês sem abrir lançamento por lançamento
  const sel = new Set();
  const nLanc = (n) => (n === 1 ? "1 lançamento" : `${n} lançamentos`);
  function syncBulk(total = 0) {
    $("#bulkBar").classList.toggle("hidden", !sel.size);
    $("#bulkCount").textContent = sel.size === 1 ? "1 selecionado" : `${sel.size} selecionados`;
    const all = $("#selAll"); if (all) { all.checked = !!total && sel.size === total; all.indeterminate = sel.size > 0 && sel.size < total; }
  }
  const bulk = async (body, btn) => {
    btn.disabled = true; btn.classList.add("loading");
    try { const r = await api("/transactions/bulk", { body: { ids: [...sel], ...body } }); return r.count; }
    finally { btn.disabled = false; btn.classList.remove("loading"); }
  };
  $("#bulkClear").onclick = () => { $("#tb").querySelectorAll("[data-sel]:checked").forEach((cb) => { cb.checked = false; cb.closest("tr").classList.remove("selected"); }); sel.clear(); syncBulk(); };
  $("#bulkApply").onclick = async () => {
    const cat = +$("#bulkCat").value;
    if (!cat) { toast("Escolha a categoria primeiro.", "error"); shakeEl("#bulkBar"); $("#bulkCat").focus(); return; }
    const n = await bulk({ action: "categorize", category_id: cat }, $("#bulkApply"));
    toast(`${nLanc(n)} em ${state.cats.find((c) => c.id === cat)?.name || "a categoria escolhida"}`, "success"); load();
  };
  $("#bulkCcApply").onclick = async () => {
    const cc = $("#bulkCc").value;
    if (cc === "") { toast("Escolha o centro de custo primeiro.", "error"); shakeEl("#bulkBar"); $("#bulkCc").focus(); return; }
    const n = await bulk({ action: "cost_center", cost_center_id: +cc }, $("#bulkCcApply"));
    toast(+cc ? `${nLanc(n)} em ${state.costCenters.find((c) => c.id === +cc)?.name || "centro de custo"}` : `${nLanc(n)} sem centro de custo`, "success"); load();
  };
  $("#bulkTagAdd").onclick = async () => {
    const tag = $("#bulkTag").value.trim().replace(/^#/, "");
    if (!tag) { toast("Digite a tag primeiro.", "error"); shakeEl("#bulkBar"); $("#bulkTag").focus(); return; }
    const n = await bulk({ action: "add_tag", tag }, $("#bulkTagAdd"));
    toast(`#${tag.toLowerCase()} em ${nLanc(n)}`, "success"); $("#bulkTag").value = ""; load();
  };
  $("#bulkDel").onclick = async () => {
    if (!await askConfirm({ title: `Excluir ${nLanc(sel.size)}?`, message: "Os saldos das contas são recalculados. Essa ação não pode ser desfeita.", confirmLabel: "Excluir lançamentos", danger: true })) return;
    const n = await bulk({ action: "delete" }, $("#bulkDel"));
    toast(n === 1 ? "1 lançamento excluído" : `${n} lançamentos excluídos`, "success"); load();
  };
  let deb; $("#fq").oninput = () => { clearTimeout(deb); deb = setTimeout(load, 300); };
  let debAmt; ["#fmin", "#fmax"].forEach((s) => ($(s).oninput = () => { clearTimeout(debAmt); debAmt = setTimeout(load, 300); }));
  ["#facc", "#fcat", "#ftype", "#fsrc", "#fcc", "#fstart", "#fend"].forEach((s) => ($(s).onchange = load));
  let debTag; $("#ftag").oninput = () => { clearTimeout(debTag); debTag = setTimeout(load, 300); };
  $("#fclear").onclick = () => { $("#fstart").value = s; $("#fend").value = e; $("#fmin").value = ""; $("#fmax").value = ""; load(); };
  $("#exp").onclick = async () => {
    const r = await fetch("/api/transactions/export", { headers: { Authorization: "Bearer " + state.token } });
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "finora-lancamentos.csv"; a.click();
  };
  $("#imp").onclick = importForm;
  $("#rec").onclick = reconcileForm;
  await load();
};

/* importar extrato/fatura (CSV ou OFX/XML): escolhe conta e arquivo, vê a prévia do que
   entra (novos, já importados, pagamento de fatura ignorado) e só então grava */
/* conciliação bancária: extrato do banco × lançamentos (services/reconcile.py) */
function reconcileForm() {
  if (!canEdit()) { toast("Você tem acesso somente leitura a esses dados.", "error"); return; }
  const accs = state.accounts.filter((a) => !a.archived && a.kind !== "credit_card");
  if (!accs.length) { toast("Cadastre uma conta corrente ou poupança primeiro."); return; }
  const form = $("#modalForm"), dlg = $("#modal");
  form.innerHTML = `<h2>Conciliar extrato</h2>
    <p class="muted small">Envie o extrato da conta (OFX ou CSV). O Finora confere linha a linha com o que você já lançou: o que bate fica <b>conciliado</b>, o que está só no banco entra como <b>novo</b> e o que está só no Finora aparece pra você decidir. Cartão de crédito se confere importando a fatura.</p>
    <label>Conta<select id="rcAcc">${accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label>
    <label>Extrato<input type="file" id="rcFile" accept=".ofx,.xml,.csv,.txt"></label>
    <div id="rcOut"></div><p class="error" id="formError"></p>
    <div class="modal-actions"><button type="button" class="btn" id="fCancel">Fechar</button><button class="btn primary" id="fSave" disabled>Conciliar</button></div>`;
  const send = (apply) => { const fd = new FormData(); fd.append("file", $("#rcFile").files[0]); return api(`/reconcile?account_id=${$("#rcAcc").value}&apply=${apply}`, { body: fd }); };
  const show = (r) => {
    const st = { matched: '<span class="chip c-green">conciliado</span>', new: '<span class="chip c-cyan">novo</span>' };
    $("#rcOut").innerHTML = `<div class="imp-inv"><div class="imp-totals">
        <div><span>Conciliados</span><b>${r.matched}</b></div><div><span>Novos no banco (vão ser lançados)</span><b>${r.new}</b></div>
        <div><span>Só no Finora</span><b class="${r.only_finora.length ? "neg" : ""}">${r.only_finora.length}</b></div>
        ${r.bank_balance != null ? `<div><span>Saldo no banco</span><b>${brl(r.bank_balance)}</b></div><div><span>Saldo no Finora${r.applied ? "" : " (antes)"}</span><b>${brl(r.finora_balance)}</b></div>
          <div><span>Diferença</span><b class="${Math.abs(r.difference) > 0.009 ? "neg" : "pos"}">${brl(r.difference)}</b></div>` : ""}</div></div>
      ${r.only_finora.length ? `<p class="small imp-warn">Estão no Finora no período do extrato (${fdate(r.period[0])} a ${fdate(r.period[1])}), mas o banco não mostra. Pode ser duplicado, um agendamento que não aconteceu ou valor errado:</p>
        <div class="list imp-extra">${r.only_finora.map((t) => `<div class="li"><div class="grow"><div class="title">${esc(t.description)}</div><div class="small muted">${fdate(t.date)}</div></div><div class="amount">${brl(t.amount)}</div><button type="button" class="btn small danger" data-rmtx="${t.id}" style="margin-left:6px">Excluir</button></div>`).join("")}</div>` : ""}
      <div class="table-wrap imp-table"><table><thead><tr><th>Data</th><th>No banco</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${r.items.map((i) => `<tr><td>${fdate(i.date)}</td><td>${esc(i.description)}${i.tx_description && i.tx_description !== i.description ? `<div class="small muted">no Finora: ${esc(i.tx_description)}</div>` : ""}</td><td class="num ${i.amount < 0 ? "neg" : "pos"}">${brl(i.amount)}</td><td>${st[i.status]}</td></tr>`).join("")}
      </tbody></table></div>`;
    $("#rcOut").querySelectorAll("[data-rmtx]").forEach((b) => (b.onclick = async () => {
      if (!await askConfirm({ title: "Excluir esse lançamento?", message: "O saldo da conta é recalculado.", confirmLabel: "Excluir", danger: true })) return;
      await api(`/transactions/${b.dataset.rmtx}`, { method: "DELETE" }); b.closest(".li").remove(); toast("Lançamento excluído", "success");
    }));
    $("#fSave").disabled = r.applied || !(r.matched + r.new);
    $("#fSave").textContent = r.applied ? "Conciliado" : r.new ? `Conciliar e lançar ${r.new} novo(s)` : "Marcar como conciliado";
  };
  const preview = async () => {
    $("#formError").textContent = ""; $("#fSave").disabled = true;
    if (!$("#rcFile").files[0]) { $("#rcOut").innerHTML = ""; return; }
    $("#rcOut").innerHTML = '<div class="empty">Conferindo…</div>';
    try { show(await send(false)); } catch (e) { $("#rcOut").innerHTML = ""; $("#formError").textContent = e.message; }
  };
  $("#rcFile").onchange = preview; $("#rcAcc").onchange = preview;
  $("#fCancel").onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    $("#fSave").disabled = true; $("#fSave").classList.add("loading");
    try { const r = await send(true); show(r); toast("Extrato conciliado", "success"); }
    catch (err) { $("#formError").textContent = err.message; $("#fSave").disabled = false; }
    finally { $("#fSave").classList.remove("loading"); }
  };
  dlg.onclose = () => { dlg.onclose = null; route(); };
  dlg.showModal();
}

function importForm() {
  if (!canEdit()) { toast("Você tem acesso somente leitura a esses dados.", "error"); return; }
  if (!state.accounts.length) { toast("Cadastre uma conta ou cartão primeiro."); location.hash = "accounts"; return; }
  const form = $("#modalForm"), dlg = $("#modal");
  const accs = state.accounts.filter((a) => !a.archived);
  const card = accs.find((a) => a.kind === "credit_card");
  form.innerHTML = `<h2>Importar extrato ou fatura</h2>
    <p class="muted small">Envie o arquivo que o banco exporta: <b>CSV</b> ou <b>OFX/XML</b>. As colunas são reconhecidas sozinhas (Nubank, Inter, Itaú, C6 e outros). Importar o mesmo arquivo de novo não duplica nada.</p>
    <label>Conta ou cartão<select id="impAcc">${accOptions().map(([k, l]) => `<option value="${k}" ${card && k === card.id ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
    <label>Arquivo<input type="file" id="impFile" accept=".csv,.ofx,.xml,.txt,text/csv,text/xml,application/xml"></label>
    <label class="check"><input type="checkbox" id="impInv"> No arquivo, as compras aparecem com valor positivo (comum na fatura do cartão em CSV)</label>
    <div id="impPrev"></div>
    <p class="error" id="formError"></p>
    <div class="modal-actions"><button type="button" class="btn" id="fCancel">Cancelar</button><button class="btn primary" id="fSave" disabled>Importar</button></div>`;
  let invTouched = false, seq = 0, last = null, invYm = null;
  const accId = () => $("#impAcc").value;
  const file = () => $("#impFile").files[0];
  const send = (dry) => {
    const fd = new FormData(); fd.append("file", file());
    return api(`/transactions/import?account_id=${accId()}&invert=${$("#impInv").checked}&dry_run=${dry}${invYm ? `&invoice=${invYm}` : ""}`, { body: fd });
  };
  const autoInvert = () => {
    if (invTouched || !file()) return;
    const isCard = accs.find((a) => String(a.id) === accId())?.kind === "credit_card";
    $("#impInv").checked = isCard && /\.(csv|txt)$/i.test(file().name);
  };
  const preview = async () => {
    const box = $("#impPrev"), my = ++seq;
    $("#formError").textContent = ""; $("#fSave").disabled = true; last = null;
    if (!file()) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="empty">Lendo o arquivo…</div>`;
    try {
      const r = await send(true);
      if (my !== seq) return;
      last = r;
      const isCard = accs.find((a) => String(a.id) === accId())?.kind === "credit_card";
      const looksInverted = isCard && r.new && !r.expenses && r.incomes;
      const chip = { new: '<span class="chip c-green">novo</span>', dup: '<span class="chip">já importado</span>', skip: '<span class="chip c-amber">pagamento da fatura</span>', match: '<span class="chip c-violet">parcela prevista</span>', manual: '<span class="chip c-violet">já lançado à mão</span>' };
      const todo = r.new + r.matched + r.future + (r.relink || 0);
      const inv = r.invoice, diff = (a, b) => Math.abs(a - b) > 0.009;
      const invBox = !inv ? "" : `<div class="imp-inv">
          <div class="between"><label class="imp-ym">Fatura que fecha em <select id="impYm">${[-1, 0, 1].map((n) => ymAdd(inv.ym, n)).map((y) => `<option value="${y}" ${y === inv.ym ? "selected" : ""}>${ymLabel(y)}</option>`).join("")}</select></label>
            <span class="small muted">${fdate(inv.period_start)} a ${fdate(inv.period_end)} · vence ${fdate(inv.due_date)}</span></div>
          <div class="imp-totals">
            <div><span>Soma do arquivo</span><b>${brl(inv.file_total)}</b></div>
            ${inv.bank_total != null ? `<div><span>Total informado pelo banco</span><b class="${diff(inv.bank_total, inv.file_total) ? "neg" : ""}">${brl(inv.bank_total)}</b></div>` : ""}
            <div><span>Fatura no Finora depois de importar</span><b class="${diff(inv.after_total, inv.file_total) ? "neg" : "pos"}">${brl(inv.after_total)}</b></div>
          </div>
          ${inv.missing_days ? `<p class="small imp-warn">Esse cartão está sem dia de fechamento ou de vencimento. Cadastre em Cartões → Editar pra fatura cair no período certo.</p>` : ""}
          ${inv.bank_total != null && diff(inv.bank_total, inv.file_total) ? `<p class="small imp-warn">O total do banco é diferente da soma das linhas (${brl(inv.bank_total - inv.file_total)}). Pode ser saldo da fatura anterior, juros do rotativo ou linhas que o banco não exporta.</p>` : ""}
          ${inv.extra.length ? `<p class="small imp-warn">Estes lançamentos estão nessa fatura no Finora, mas não aparecem no arquivo do banco (${brl(inv.after_total - inv.file_total)}). Confira se são duplicados ou de outra fatura:</p>
            <div class="list imp-extra">${inv.extra.map((t) => `<div class="li"><div class="grow"><div class="title">${esc(t.description)}${t.installment ? ` <span class="chip">${esc(t.installment)}</span>` : ""}${t.predicted ? ' <span class="chip c-violet">prevista</span>' : ""}</div><div class="small muted">${fdate(t.date)}</div></div><div class="amount">${brl(t.amount)}</div></div>`).join("")}</div>` : ""}
        </div>`;
      box.innerHTML = `<div class="imp-sum">
          <span class="chip c-cyan">${r.format.toUpperCase()}</span>
          <b>${r.new}</b> ${r.new === 1 ? "novo" : "novos"}${r.duplicates ? ` · ${r.duplicates} já importado(s)` : ""}${r.matched ? ` · ${r.matched} já lançado(s) ou previsto(s)` : ""}${r.skipped ? ` · ${r.skipped} pagamento(s) de fatura ignorado(s)` : ""}
          <span class="imp-tot">Gastos <b class="neg">${brl(r.expenses)}</b>${r.incomes ? ` · Créditos <b class="pos">${brl(r.incomes)}</b>` : ""}</span>
        </div>
        ${invBox}
        ${r.future ? `<p class="small imp-fut">${navIcon("cards")} Também ${r.future === 1 ? "vai ser lançada 1 parcela futura" : `vão ser lançadas ${r.future} parcelas futuras`} (${brl(r.future_amount)}) nas faturas dos próximos meses.</p>` : ""}
        ${looksInverted ? `<p class="small imp-warn">As compras estão entrando como crédito. Se isso é uma fatura, marque a opção "compras com valor positivo" acima.</p>` : ""}
        <div class="table-wrap imp-table"><table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr${x.status !== "new" ? ' class="muted"' : ""}><td>${fdate(x.date)}</td><td>${esc(x.description)}${x.installment ? ` <span class="chip">${esc(x.installment)}</span>` : ""}</td>
          <td class="num ${x.amount < 0 ? "neg" : "pos"}">${x.amount < 0 ? "-" : ""}${brl(Math.abs(x.amount))}</td><td>${chip[x.status]}</td></tr>`).join("")}
        </tbody></table></div>${r.total > r.rows.length ? `<p class="small muted">Mostrando ${r.rows.length} de ${r.total} linhas.</p>` : ""}`;
      $("#fSave").disabled = !todo;
      $("#fSave").textContent = !todo ? "Nada novo pra importar"
        : r.new ? `Importar ${r.new} ${r.new === 1 ? "lançamento" : "lançamentos"}${r.future ? ` + ${r.future} ${r.future === 1 ? "parcela" : "parcelas"}` : ""}`
        : r.future ? `Lançar ${r.future} ${r.future === 1 ? "parcela futura" : "parcelas futuras"}` : "Atualizar a fatura";
      const ymSel = $("#impYm"); if (ymSel) ymSel.onchange = () => { invYm = ymSel.value; preview(); };
    } catch (e) {
      if (my !== seq) return;
      box.innerHTML = ""; $("#formError").textContent = e.message;
    }
  };
  $("#impFile").onchange = () => { invYm = null; autoInvert(); preview(); };
  $("#impAcc").onchange = () => { invYm = null; autoInvert(); preview(); };
  $("#impInv").onchange = () => { invTouched = true; preview(); };
  $("#fCancel").onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!last || !(last.new + last.matched + last.future + (last.relink || 0))) return;
    $("#fSave").disabled = true; $("#fSave").classList.add("loading");
    try {
      const r = await send(false);
      dlg.close(); route();
      toast(`${r.imported === 1 ? "1 lançamento importado" : `${r.imported} lançamentos importados`}${r.future ? ` · ${r.future} ${r.future === 1 ? "parcela futura lançada" : "parcelas futuras lançadas"}` : ""}${r.invoice ? ` · fatura ${brl(r.invoice.after_total)}` : ""}`, "success");
    } catch (err) { $("#formError").textContent = err.message; shakeEl(dlg); $("#fSave").disabled = false; }
    finally { $("#fSave").classList.remove("loading"); }
  };
  dlg.showModal();
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ymLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS_SHORT[m - 1]}/${y}`; };
const ymAdd = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const INVOICE_STATUS = { open: ["aberta", "c-cyan"], closed: ["fechada · a pagar", "c-amber"], past: ["vencida", ""] };

/* composição da fatura, na mesma ordem que o banco mostra */
function invoiceBreakdown(inv) {
  const parts = [["Compras", inv.purchases], ["Parcelas", inv.installments], ["Encargos e IOF", inv.charges]].filter(([, v]) => v);
  return `<div class="inv-break">${parts.map(([l, v]) => `<span>${l} <b>${brl(v)}</b></span>`).join("")}${inv.credits ? `<span>Estornos e créditos <b class="pos">−${brl(inv.credits)}</b></span>` : ""}</div>`;
}

VIEWS.cards = async (v) => {
  const [d, plans] = await Promise.all([api(`/dashboard?ref=${refDate()}`), api(`/installments?ref=${refDate()}`)]);
  const cards = state.accounts.filter((a) => a.kind === "credit_card" && !a.archived);
  const dueThisMonth = plans.filter((p) => p.this_month_amount != null);
  const dueTotal = dueThisMonth.reduce((s, p) => s + p.this_month_amount, 0);
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">A fatura soma compras, parcelas e encargos, menos estornos. O que veio de um arquivo de fatura fica na fatura do banco; o resto segue o dia de fechamento.</p><button class="btn" id="newCard">+ Cartão</button></div>
  <div class="grid g2">${d.cards.map((c) => `<div class="card"><div class="between"><h2>${esc(c.name)}</h2><button class="btn small" data-edit="${c.account_id}">Editar</button></div>
    ${c.missing_days ? `<p class="small imp-warn">Cadastre o dia de fechamento e o de vencimento deste cartão (em Editar). Sem eles, os períodos das faturas não batem com os do banco.</p>` : ""}
    ${c.closed ? `<div class="inv-next small muted">Fatura aberta (fecha ${fdate(c.open.period_end)}): <b>${brl(c.open.total)}</b></div>` : ""}
    <div id="inv-${c.account_id}" class="inv-box"></div>
    ${c.limit ? `<div class="bar ${c.usage_pct >= 80 ? "over" : c.usage_pct >= 60 ? "warn" : ""}"><i style="${barFill(c.usage_pct)}"></i></div><div class="small muted" style="margin-top:6px"><b class="${c.available < 0 ? "neg" : ""}">Disponível ${brl(c.available)}</b> de ${brl(c.limit)} · ${c.usage_pct}% comprometido</div>
    <div class="inv-break" style="margin-top:2px">${c.closed ? `<span>Fatura a pagar <b>${brl(c.closed.total)}</b></span>` : ""}<span>Fatura aberta <b>${brl(c.open.total)}</b></span>${c.future_installments ? `<span>Parcelas futuras <b>${brl(c.future_installments)}</b></span>` : ""}</div>` : ""}
    </div>`).join("") || '<div class="card empty">Nenhum cartão cadastrado.</div>'}</div>
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
  api("/cards/rewards").then((rw) => {
    if (!rw.cards.length) return;
    const has = rw.cards.some((c) => c.return_pct || c.balance);
    v.insertAdjacentHTML("beforeend", `<div class="card" style="margin-top:16px"><h2>Milhas, pontos e cashback</h2>
      ${has ? "" : '<p class="small muted">Cadastre o programa de pontos ou o cashback de cada cartão (em Editar) pra ver quanto cada um devolve e qual usar.</p>'}
      ${rw.tips.map((t) => `<p class="small">${navIcon("sparkles")} ${esc(t)}</p>`).join("")}
      <div class="table-wrap"><table><thead><tr><th>Cartão</th><th class="num">Devolve</th><th class="num hide-sm">Pontos em 12 meses</th><th class="num">Ganho no ano</th><th class="num hide-sm">Saldo de pontos</th></tr></thead><tbody>
      ${rw.cards.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.account_id === rw.best_card ? ' <span class="chip c-green">use este</span>' : ""}<div class="small muted">${esc(c.program || "sem programa")}${c.rate ? ` · ${String(c.rate).replace(".", ",")} pts/${c.unit === "usd" ? "US$" : "R$"}` : ""}${c.best_day ? ` · melhor dia de compra: ${c.best_day}` : ""}</div></td>
        <td class="num">${pctBR(c.return_pct)}</td><td class="num hide-sm">${c.points_12m ? c.points_12m.toLocaleString("pt-BR") : "—"}</td>
        <td class="num ${c.net_year < 0 ? "neg" : "pos"}">${brl(c.net_year)}${c.annual_fee ? `<div class="small muted">${brl(c.value_12m)} − anuidade ${brl(c.annual_fee)}</div>` : ""}</td>
        <td class="num hide-sm">${c.balance ? `${Math.round(c.balance).toLocaleString("pt-BR")}<div class="small muted">≈ ${brl(c.balance_value)}${c.expire_days != null ? ` · vence em ${c.expire_days} d` : ""}</div>` : "—"}</td></tr>`).join("")}
      </tbody></table></div><p class="small muted" style="margin-top:6px">Retorno = pontos por real × valor do milheiro (padrão R$ 20). Dólar de hoje: ${rw.usd_brl ? brl(rw.usd_brl) : "—"}.</p></div>`);
  }).catch(() => {});
  v.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => accountForm(cards.find((c) => c.id == b.dataset.edit))));

  // cada cartão abre na fatura a pagar (a fechada, se houver; senão a aberta) e navega ‹ ›
  const show = async (c, ym) => {
    const box = $(`#inv-${c.account_id}`, v);
    if (!box) return;
    box.innerHTML = `<div class="empty">Carregando…</div>`;
    const inv = await api(`/cards/${c.account_id}/invoices/${ym}`);
    const [label, cls] = INVOICE_STATUS[inv.status] || ["", ""];
    box.innerHTML = `<div class="inv-nav">
        <button type="button" class="icon-btn" data-nav="-1" aria-label="Fatura anterior">‹</button>
        <div class="grow"><b>Fatura que fecha em ${ymLabel(ym)}</b> <span class="chip ${cls}">${label}</span>
          <div class="small muted">${fdate(inv.period_start)} a ${fdate(inv.period_end)} · vence ${fdate(inv.due_date)}</div></div>
        <button type="button" class="icon-btn" data-nav="1" aria-label="Próxima fatura">›</button></div>
      <div class="stat"><div class="value">${brl(inv.total)}</div></div>
      ${invoiceBreakdown(inv)}
      <div class="list" style="margin-top:10px">${inv.items.map((t) => `<div class="li"><span class="dot" style="background:${esc(t.category_color)}"></span><div class="grow"><div class="title">${esc(t.description)}${(t.external_id || "").startsWith("prev-") ? ' <span class="chip c-violet">prevista</span>' : ""}</div><div class="small muted">${fdate(t.date)} · ${esc(t.category_name)}${t.installment ? " · parcela " + esc(t.installment) : ""}</div></div><div class="amount ${t.type === "income" ? "pos" : ""}">${t.type === "income" ? "−" : ""}${brl(t.amount)}</div></div>`).join("") || '<div class="empty">Sem lançamentos nesta fatura.</div>'}</div>`;
    box.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => show(c, ymAdd(ym, +b.dataset.nav))));
  };
  await Promise.all(d.cards.map((c) => show(c, (c.closed || c.open).ym)));
};

function accountForm(values = {}) {
  const isEdit = !!values.id;
  openForm({
    title: isEdit ? "Editar conta" : values.kind === "credit_card" ? "Novo cartão" : "Nova conta",
    values: { kind: "checking", color: "#0ea5e9", balance: 0, credit_limit: 0, import_reminder: "none", rewards_unit: "usd", ...values },
    fields: [
      { name: "name", label: "Nome", required: true, placeholder: "Ex.: Nubank, Itaú, Carteira" },
      { row: [{ name: "kind", label: "Tipo", type: "select", options: Object.entries(KINDS) }, { name: "institution", label: "Instituição" }] },
      { row: [{ name: "balance", label: "Saldo atual (R$)", type: "number" }, { name: "color", label: "Cor", type: "color" }] },
      { row: [{ name: "credit_limit", label: "Limite (cartão)", type: "number" }, { name: "closing_day", label: "Dia de fechamento", type: "number", step: 1, min: 1, max: 31 }, { name: "due_day", label: "Dia de vencimento", type: "number", step: 1, min: 1, max: 31 }] },
      { row: [{ name: "rewards_program", label: "Programa de pontos (cartão)", placeholder: "Livelo, Smiles, Esfera, LATAM Pass…" },
        { name: "rewards_rate", label: "Pontos por", type: "number", nullable: true, step: "0.01" },
        { name: "rewards_unit", label: "a cada", type: "select", options: [["usd", "US$ 1 gasto"], ["brl", "R$ 1 gasto"]] }] },
      { row: [{ name: "cashback_pct", label: "Ou cashback (%)", type: "number", nullable: true, step: "0.01" },
        { name: "point_value", label: "Valor do milheiro (R$)", type: "number", nullable: true, placeholder: "20" },
        { name: "annual_fee", label: "Anuidade (R$/ano)", type: "number", nullable: true }] },
      { row: [{ name: "rewards_balance", label: "Saldo de pontos", type: "number", nullable: true, step: 1 },
        { name: "rewards_expire", label: "Pontos vencem em", type: "date", nullable: true }] },
      ...(values.pluggy_account_id ? [] : [{ name: "import_reminder", label: "Lembrete para importar extrato", type: "select",
        options: [["none", "Sem lembrete"], ["daily", "Diário"], ["weekly", "Semanal"], ["monthly", "Mensal"]] }]),
      ...(isEdit ? [{ name: "archived", label: "Arquivar (ocultar)", type: "checkbox" }] : []),
    ],
    onSubmit: async (d) => { await api(isEdit ? `/accounts/${values.id}` : "/accounts", { method: isEdit ? "PUT" : "POST", body: d }); await refreshRefs(); },
    onDelete: isEdit ? async () => { await api(`/accounts/${values.id}`, { method: "DELETE" }); await refreshRefs(); } : null,
  });
  const syncKind = () => {
    const card = $('#modalForm [name="kind"]').value === "credit_card";
    toggleFormFields(["credit_limit", "closing_day", "due_day", "rewards_program", "rewards_rate", "rewards_unit", "cashback_pct",
      "point_value", "annual_fee", "rewards_balance", "rewards_expire"], card);
  };
  if ($('#modalForm [name="kind"]')) { $('#modalForm [name="kind"]').addEventListener("change", syncKind); syncKind(); }
}

function simpleList(v, { items, empty, render, onNew, newLabel, intro = "" }) {
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">${intro}</p>${canEdit() ? `<button class="btn" id="newItem">${newLabel}</button>` : ""}</div>
  <div class="card"><div class="list">${items.map((it, i) => `<div class="li clickable" data-i="${i}" style="cursor:pointer">${render(it)}</div>`).join("") || `<div class="empty">${empty}</div>`}</div></div>`;
  if (canEdit()) $("#newItem").onclick = () => onNew();
  v.querySelectorAll("[data-i]").forEach((el) => clickable(el, () => onNew(items[el.dataset.i])));
}

VIEWS.accounts = async (v) => {
  await refreshRefs();
  simpleList(v, {
    items: state.accounts, empty: "Nenhuma conta cadastrada.", newLabel: "+ Conta", onNew: accountForm,
    intro: "Contas correntes, poupanças, investimentos, dinheiro e cartões.",
    render: (a) => `<span class="dot" style="background:${esc(a.color)}"></span><div class="grow"><div class="title">${esc(a.name)} ${a.archived ? '<span class="chip">arquivada</span>' : ""} ${a.pluggy_account_id ? '<span class="chip c-cyan">Open Finance</span>' : a.import_reminder !== "none" ? `<span class="chip c-amber">lembrete ${esc({ daily: "diário", weekly: "semanal", monthly: "mensal" }[a.import_reminder] || a.import_reminder)}</span>` : ""}</div><div class="small muted">${esc(KINDS[a.kind])}${a.institution ? " · " + esc(a.institution) : ""}</div></div><div class="amount ${a.balance < 0 ? "neg" : ""}">${brl(a.balance)}</div>`,
  });
};

const CONTRACT_KINDS = { contract: "Contrato", subscription: "Assinatura", rent: "Aluguel", financing: "Financiamento", insurance: "Seguro", service: "Serviço" };
const MONTH_OPTS = [["", "Mês do início"], ...["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"].map((m, i) => [i + 1, m])];
function contractForm(c = {}) {
  return openForm({
    title: c.id ? "Editar contrato" : "Novo contrato / conta fixa",
    values: { due_day: 10, active: true, interest_rate_month: 0, kind: "contract", cancel_notice_days: 0, ...c },
    fields: [
      { row: [{ name: "name", label: "Nome", required: true, placeholder: "Aluguel, financiamento, plano de saúde…" }, { name: "kind", label: "Tipo", type: "select", options: Object.entries(CONTRACT_KINDS) }] },
      { row: [{ name: "provider", label: "Fornecedor/credor" }, { name: "category_id", label: "Categoria", type: "select", options: catOptions("expense"), num: true }] },
      { name: "account_id", label: "Conta de pagamento (pra confirmar com 1 clique quando vencer)", type: "select", options: [["", "Nenhuma"], ...accOptions()], num: true, nullable: true },
      { row: [{ name: "amount", label: "Valor mensal (R$)", type: "number", required: true }, { name: "due_day", label: "Dia do vencimento", type: "number", step: 1, min: 1, max: 31 }] },
      { row: [{ name: "start_date", label: "Início", type: "date", nullable: true }, { name: "end_date", label: "Fim", type: "date", nullable: true }] },
      { row: [{ name: "total_installments", label: "Nº de parcelas", type: "number", step: 1 }, { name: "interest_rate_month", label: "Juros ao mês (%)", type: "number" }] },
      { row: [{ name: "adjustment_index", label: "Índice de reajuste", type: "select", options: [["", "Sem reajuste"], ["IPCA", "IPCA"], ["IGP-M", "IGP-M"], ["INPC", "INPC"],
          // valor antigo digitado à mão (antes era texto livre): mantém pra não apagar ao salvar
          ...(c.adjustment_index && !["IPCA", "IGP-M", "INPC"].includes(c.adjustment_index) ? [[c.adjustment_index, c.adjustment_index]] : [])] },
        { name: "adjustment_month", label: "Mês do reajuste", type: "select", options: MONTH_OPTS, num: true, nullable: true },
        { name: "last_adjusted_at", label: "Último reajuste", type: "date", nullable: true }] },
      { row: [{ name: "renewal_date", label: "Renova (ou termina) em", type: "date", nullable: true },
        { name: "cancel_notice_days", label: "Aviso prévio pra cancelar (dias)", type: "number", step: 1, min: 0, max: 365 }] },
      { name: "active", label: "Ativo", type: "checkbox" },
      { name: "notes", label: "Observações", type: "textarea" },
    ],
    extra: `<p class="small muted">Com o índice e o mês do reajuste, o Finora avisa 30 dias antes quanto o valor deve subir. Com a renovação e o aviso prévio, avisa o último dia pra cancelar sem multa.</p>`,
    onSubmit: (d) => {
      if (!d.category_id) d.category_id = null;
      if (!d.adjustment_month) d.adjustment_month = null;
      if (d.cancel_notice_days == null) d.cancel_notice_days = 0;
      return api(c.id ? `/contracts/${c.id}` : "/contracts", { method: c.id ? "PUT" : "POST", body: d });
    },
    onDelete: c.id ? () => api(`/contracts/${c.id}`, { method: "DELETE" }) : null,
  });
}
VIEWS.contracts = async (v) => {
  const [items, ins] = await Promise.all([api("/contracts"), api("/contracts/insights")]);
  const info = Object.fromEntries(ins.contracts.map((x) => [x.id, x]));
  const total = items.filter((c) => c.active).reduce((s, c) => s + c.amount, 0);
  let hidden = []; try { hidden = JSON.parse(localGet("finora_subs_hidden") || "[]"); } catch {}
  const detected = ins.detected.filter((d) => !hidden.includes(d.key));
  const chips = (c) => {
    const x = info[c.id] || {}, out = [];
    if (x.adjustment) {
      const a = x.adjustment, late = a.days_left < 0;
      out.push(`<span class="chip ${late ? "c-red" : a.days_left <= 30 ? "c-amber" : ""}">${late ? "reajuste pendente" : "reajuste"} ${esc(a.label)}${a.pct != null ? ` · ${esc(a.index)} ${pctBR(a.pct)} → ${brl(a.new_amount)}` : ""}</span>`);
    }
    if (x.renewal) {
      const r = x.renewal;
      out.push(r.cancel_days_left >= 0
        ? `<span class="chip ${r.cancel_days_left <= 15 ? "c-red" : ""}">cancelar até ${fdate(r.cancel_deadline)}</span>`
        : `<span class="chip">renova ${fdate(r.date)}</span>`);
    }
    if (x.ends_in_days != null && x.ends_in_days >= 0 && x.ends_in_days <= 60) out.push(`<span class="chip c-amber">termina em ${x.ends_in_days} dia(s)</span>`);
    return out.join(" ");
  };
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">Custos fixos ativos: <b>${brl(total)}</b>/mês · assinaturas <b>${brl(ins.subscriptions_monthly)}</b>/mês (${brl(ins.subscriptions_yearly)} por ano)</p>${canEdit() ? '<button class="btn" id="newItem">+ Contrato</button>' : ""}</div>
    ${ins.tips.length ? `<div class="card" style="margin-bottom:16px"><h2>${navIcon("sparkles")} Onde dá pra economizar</h2><div class="list">${ins.tips.map((t) => `<div class="li"><div class="grow small">${esc(t.message)}</div></div>`).join("")}</div></div>` : ""}
    ${detected.length ? `<div class="card" style="margin-bottom:16px"><h2>Cobranças que parecem assinatura</h2><p class="small muted">Aparecem todo mês com o mesmo valor, mas ainda não estão cadastradas. Cadastre pra entrar nos custos fixos, no fluxo de caixa e nos avisos.</p>
      <div class="list">${detected.map((d, i) => `<div class="li"><div class="grow"><div class="title">${esc(d.name)} ${d.price_increase_pct ? `<span class="chip c-amber">subiu ${pctBR(d.price_increase_pct, 1)}</span>` : ""}</div><div class="small muted">${esc(d.description)} · ${d.months} meses · todo dia ${d.day} · ${brl(d.yearly)}/ano</div></div>
        <div class="amount">${brl(d.amount)}</div>${canEdit() ? `<button class="btn small" data-add="${i}" style="margin-left:8px">Cadastrar</button><button class="btn small ghost" data-hide="${i}">Não é</button>` : ""}</div>`).join("")}</div></div>` : ""}
    <div class="card"><div class="list">${items.map((c, i) => `<div class="li clickable" data-i="${i}"><div class="grow"><div class="title">${esc(c.name)} <span class="chip">${esc(CONTRACT_KINDS[c.kind] || "Contrato")}</span> ${c.active ? "" : '<span class="chip">inativo</span>'} ${c.interest_rate_month > 2 ? '<span class="chip c-red">juros altos</span>' : ""} ${chips(c)}</div>
      <div class="small muted">Vence todo dia ${c.due_day}${c.provider ? " · " + esc(c.provider) : ""}${c.end_date ? " · até " + fdate(c.end_date) : ""}</div></div>
      <div class="amount">${brl(c.amount)}</div>${canEdit() && info[c.id]?.adjustment?.new_amount && info[c.id].adjustment.days_left <= 30 ? `<button class="btn small" data-adj="${c.id}" style="margin-left:8px">Aplicar reajuste</button>` : ""}</div>`).join("") || '<div class="empty">Cadastre aluguel, financiamentos, seguros, escola, assinaturas…</div>'}</div></div>`;
  if (canEdit()) {
    $("#newItem").onclick = () => contractForm();
    v.querySelectorAll("[data-i]").forEach((el) => clickable(el, () => contractForm(items[el.dataset.i])));
    v.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
      const d = detected[b.dataset.add];
      contractForm({ name: d.name, kind: "subscription", amount: d.amount, due_day: d.day, category_id: d.category_id, account_id: d.account_id });
    }));
    v.querySelectorAll("[data-hide]").forEach((b) => (b.onclick = () => {
      hidden.push(detected[b.dataset.hide].key); localSet("finora_subs_hidden", JSON.stringify(hidden)); route();
    }));
    v.querySelectorAll("[data-adj]").forEach((b) => (b.onclick = async (ev) => {
      ev.stopPropagation();
      const c = items.find((x) => x.id == b.dataset.adj), a = info[c.id].adjustment;
      if (!await askConfirm({ title: `Aplicar reajuste em ${c.name}?`, message: `${a.index} dos últimos 12 meses: ${pctBR(a.pct)}. O valor passa de ${brl(c.amount)} pra ${brl(a.new_amount)}. Se o reajuste combinado for outro, edite o valor do contrato direto.`, confirmLabel: "Aplicar reajuste" })) return;
      await api(`/contracts/${c.id}/apply-adjustment`, { body: { pct: a.pct } });
      toast("Reajuste aplicado", "success"); route();
    }));
  }
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
    render: (r) => `<div class="grow"><div class="title">${esc(r.client_name)} ${r.received_at ? '<span class="chip c-green">recebido</span>' : ""}</div><div class="small muted">${esc(r.description || "")}${r.description ? " · " : ""}Vence ${fdate(r.due_date)}</div></div><div class="amount">${brl(r.amount)}</div>`,
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
    <div class="card"><div class="between"><h2>Categorias</h2><div class="row" style="gap:6px">${state.cats.some((c) => c.code) ? "" : '<button class="btn small ghost" id="applyChart2" title="Cria as contas padrão de empresa com o grupo da DRE">Plano de contas PJ</button>'}<button class="btn small" id="newCat">+ Categoria</button></div></div>
      <p class="small muted">Defina orçamentos mensais para receber alertas ao atingir 80% e 100%.</p>
      <div class="list">${[...state.cats].sort((x, y) => (x.code || "~").localeCompare(y.code || "~") || x.name.localeCompare(y.name)).map((c) => `<div class="li clickable" data-c="${c.id}" style="cursor:pointer"><span class="dot" style="background:${esc(c.color)}"></span><div class="grow"><div class="title">${c.code ? `<span class="small muted">${esc(c.code)}</span> ` : ""}${esc(c.name)}</div><div class="small muted">${c.kind === "income" ? "Receita" : "Despesa"}${c.essential ? " · essencial" : ""}</div></div><div class="small">${c.monthly_budget ? brl(c.monthly_budget) : ""}</div></div>`).join("")}</div></div>
    <div class="card"><div class="between"><h2>Regras automáticas</h2><button class="btn small" id="newRule">+ Regra</button></div>
      <p class="small muted">Se a descrição contém o texto, o lançamento vai para a categoria escolhida. As regras valem para a sincronização bancária e as importações.</p>
      <div class="list">${rules.map((r) => `<div class="li"><div class="grow"><div class="title">“${esc(r.pattern)}”</div><div class="small muted">→ ${esc(catName(r.category_id))}</div></div><button class="btn small danger" data-del="${r.id}">Remover</button></div>`).join("") || '<div class="empty">Nenhuma regra. Dica: ao editar um lançamento, marque “aplicar sempre”.</div>'}</div></div></div>`;
  const catForm = (c = {}) => openForm({
    title: c.id ? "Editar categoria" : "Nova categoria",
    values: { kind: "expense", color: "#7b3fa8", monthly_budget: 0, ...c },
    fields: [
      { name: "name", label: "Nome", required: true },
      { row: [{ name: "kind", label: "Tipo", type: "select", options: [["expense", "Despesa"], ["income", "Receita"]] }, { name: "color", label: "Cor", type: "color" }] },
      { name: "monthly_budget", label: "Orçamento mensal (R$, 0 = sem limite)", type: "number" },
      { row: [{ name: "code", label: "Código no plano de contas", placeholder: "4.3.01", nullable: true },
        { name: "dre_group", label: "Grupo da DRE", type: "select", options: DRE_GROUPS, nullable: true }] },
      { name: "essential", label: "Gasto essencial", type: "checkbox" },
    ],
    onSubmit: async (d) => { await api(c.id ? `/categories/${c.id}` : "/categories", { method: c.id ? "PUT" : "POST", body: { icon: c.icon || "tag", ...d } }); await refreshRefs(); },
    onDelete: c.id ? async () => { await api(`/categories/${c.id}`, { method: "DELETE" }); await refreshRefs(); } : null,
  });
  $("#newCat").onclick = () => catForm();
  if ($("#applyChart2")) $("#applyChart2").onclick = async () => {
    if (!await askConfirm({ title: "Criar o plano de contas de empresa?", message: "Adiciona ~29 contas padrão (vendas, impostos, CMV, salários, aluguel, marketing…) com o grupo da DRE. Suas categorias atuais continuam.", confirmLabel: "Criar contas" })) return;
    const r = await api("/chart-of-accounts/apply", { method: "POST" }); await refreshRefs(); toast(`${r.created} contas criadas`, "success"); route();
  };
  v.querySelectorAll("[data-c]").forEach((el) => clickable(el, () => catForm(state.cats.find((c) => c.id == el.dataset.c))));
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
  v.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!await askConfirm({ title: "Remover esta regra?", message: "Os lançamentos já categorizados continuam como estão; só os novos deixam de seguir a regra.", confirmLabel: "Remover regra", danger: true })) return;
    await api(`/rules/${b.dataset.del}`, { method: "DELETE" }); toast("Regra removida", "success"); route();
  }));
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

/* simulação de Monte Carlo de uma meta (services/montecarlo.py) */
const PROFILE_LABEL = { conservador: "Conservador", moderado: "Moderado", arrojado: "Arrojado" };
async function goalSimulation(g) {
  const form = $("#modalForm"), dlg = $("#modal");
  const months0 = g.deadline ? Math.max(1, Math.round((new Date(g.deadline) - new Date()) / 2.63e9)) : 60;
  const left = Math.max(g.target_amount - g.current_amount, 0);
  let alloc = null; try { alloc = await api("/advisor/allocation"); } catch {}
  const prof0 = alloc?.used_profile || "moderado";
  form.innerHTML = `<h2>Simular meta · ${esc(g.name)}</h2>
    <p class="small muted">Sorteia 2.000 cenários de rendimento (com altos e baixos do mercado) e mostra a chance de chegar lá. Valores em dinheiro de hoje: a inflação já está descontada.</p>
    <div class="row"><label>Aporte por mês (R$)<input id="mcMonthly" type="number" min="0" step="10" value="${Math.round(months0 ? left / months0 : 0)}"></label>
      <label>Prazo (meses)<input id="mcMonths" type="number" min="1" max="600" value="${months0}"></label>
      <label>Perfil<select id="mcProfile">${Object.entries(PROFILE_LABEL).map(([k, l]) => `<option value="${k}" ${k === prof0 ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <button type="button" class="btn primary" id="mcRun">Simular</button>
    <div id="mcOut" style="margin-top:12px"></div>
    <div class="modal-actions"><button class="btn">Fechar</button></div>`;
  form.onsubmit = null;
  const run = async () => {
    const b = $("#mcRun"); b.disabled = true; b.classList.add("loading");
    try {
      const r = await api("/simulate/montecarlo", { body: { target: g.target_amount, initial: g.current_amount, monthly: +$("#mcMonthly").value || 0, months: +$("#mcMonths").value || 1, profile: $("#mcProfile").value } });
      const cls = r.probability >= 80 ? "pos" : r.probability >= 50 ? "" : "neg";
      $("#mcOut").innerHTML = `<div class="grid g3">
          <div class="card stat"><h3>Chance de chegar</h3><div class="value ${cls}">${pctBR(r.probability, 0)}</div><div class="sub">no prazo de ${r.months} meses</div></div>
          <div class="card stat"><h3>Pra ter 80% de chance</h3><div class="value">${brl(r.required_monthly_80)}</div><div class="sub">por mês</div></div>
          <div class="card stat"><h3>Prazo provável</h3><div class="value">${r.median_months_to_target ? `${Math.round(r.median_months_to_target / 12 * 10) / 10} anos` : "—"}</div><div class="sub">na metade dos cenários</div></div></div>
        <div class="chart-box" style="height:220px;margin-top:10px"><canvas id="cMc"></canvas></div>
        <p class="small muted">Cenário ruim (10%): ${brl(r.p10_final)} · mediano: ${brl(r.median_final)} · bom (90%): ${brl(r.p90_final)}. Premissas do perfil: ${pctBR(r.assumptions.real_return, 1)} ao ano acima da inflação, oscilação de ${pctBR(r.assumptions.volatility, 0)}.</p>`;
      state.charts.forEach((c) => c.destroy()); state.charts = [];
      chart($("#cMc"), { type: "line", data: { labels: r.bands.map((x) => x.month >= 12 ? `${Math.round(x.month / 12)}a` : `${x.month}m`), datasets: [
        { label: "Cenário bom", data: r.bands.map((x) => x.p90), borderColor: cssVar("--green"), pointRadius: 0, fill: false },
        { label: "Mediano", data: r.bands.map((x) => x.p50), borderColor: cssVar("--primary-2"), pointRadius: 0, borderWidth: 3 },
        { label: "Cenário ruim", data: r.bands.map((x) => x.p10), borderColor: cssVar("--red"), pointRadius: 0 },
        { label: "Meta", data: r.bands.map(() => r.target), borderColor: cssVar("--muted"), borderDash: [6, 4], pointRadius: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(c.raw)}` } } }, scales: { y: { ticks: { callback: (x) => brl(x).replace(",00", "") } } } } });
    } catch (e) { $("#mcOut").innerHTML = `<p class="error">${esc(e.message)}</p>`; }
    finally { b.disabled = false; b.classList.remove("loading"); }
  };
  $("#mcRun").onclick = run;
  dlg.onclose = () => { dlg.onclose = null; route(); };
  dlg.showModal();
  run();
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
      return `<div class="grow"><div class="between"><span class="title">${esc(g.name)} <button type="button" class="btn small ghost" data-sim="${g.id}">Simular</button></span><span class="small">${brl(g.current_amount)} / ${brl(g.target_amount)}</span></div><div class="bar"><i style="${barFill(pct(g.current_amount, g.target_amount))}"></i></div><div class="small muted" style="margin-top:4px">${g.deadline ? "Prazo " + fdate(g.deadline) : "Sem prazo"}${perMonth}</div></div>`;
    },
  });
  v.querySelectorAll("[data-sim]").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); goalSimulation(items.find((g) => g.id == b.dataset.sim)); }));
  v.querySelectorAll("[data-sim]").forEach((b) => (b.onkeydown = (ev) => ev.stopPropagation()));
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
/* ------------------------------------------------------------------ caixinhas */
const POT_TYPES = { cdi: "% do CDI", selic: "% da Selic", pre: "Prefixada (% ao ano)" };
const pctBR = (v, d = 2) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
const potRateLabel = (p) => p.yield_type === "pre" ? `${pctBR(p.yield_rate)} ao ano` : `${pctBR(p.yield_rate, 0)} do ${p.yield_type === "cdi" ? "CDI" : "Selic"}`;

function potForm(p = {}) {
  const isEdit = !!p.id;
  openForm({
    title: isEdit ? "Editar caixinha" : "Nova caixinha",
    values: { yield_type: "cdi", yield_rate: 100, color: "#10b981", start_date: today(), ...p },
    fields: [
      { row: [{ name: "name", label: "Nome", required: true, placeholder: "Ex.: Reserva, Viagem, IPVA" }, { name: "institution", label: "Banco", placeholder: "Nubank, Inter, PicPay…" }] },
      { row: [{ name: "yield_type", label: "Tipo de rendimento", type: "select", options: Object.entries(POT_TYPES) },
        { name: "yield_rate", label: "Rentabilidade (%)", type: "number", required: true, min: 0.01, placeholder: "100 = 100% do CDI" }] },
      ...(isEdit ? [] : [{ row: [{ name: "initial_amount", label: "Quanto já tem guardado (R$)", type: "number", min: 0, nullable: true },
        { name: "start_date", label: "Guardado desde", type: "date", nullable: true }] }]),
      { row: [{ name: "goal_amount", label: "Meta (R$, opcional)", type: "number", min: 0, nullable: true }, { name: "color", label: "Cor", type: "color" }] },
      { name: "tax_free", label: "Isenta de imposto de renda (LCI, LCA, poupança)", type: "checkbox" },
      ...(isEdit ? [{ name: "archived", label: "Arquivar (ocultar)", type: "checkbox" }] : []),
    ],
    extra: isEdit ? "" : `<p class="small muted">Não lembra quando começou? Coloque o saldo de hoje e a data de hoje. Depois, use "Acertar saldo" quando quiser conferir com o app do banco.</p>`,
    onSubmit: (d) => api(isEdit ? `/pots/${p.id}` : "/pots", { method: isEdit ? "PUT" : "POST", body: d }),
    onDelete: isEdit ? () => api(`/pots/${p.id}`, { method: "DELETE" }) : null,
  });
}

function potMoveForm(p, kind) {
  const isDep = kind === "deposit";
  openForm({
    title: `${isDep ? "Guardar na" : "Resgatar da"} caixinha ${p.name}`,
    values: { date: today() },
    fields: [{ row: [{ name: "amount", label: "Valor (R$)", type: "number", required: true, min: 0.01 }, { name: "date", label: "Data", type: "date", required: true }] },
      { name: "note", label: "Observação", placeholder: isDep ? "Ex.: sobra do mês" : "Ex.: pagar IPVA" }],
    extra: isDep ? "" : `<p class="small muted">Saldo agora: <b>${brl(p.summary.balance)}</b>. O resgate sai primeiro do dinheiro guardado há mais tempo, que paga menos imposto.</p>`,
    onSubmit: (d) => api(`/pots/${p.id}/moves`, { body: { ...d, kind } }),
  });
}

function potBalanceForm(p) {
  openForm({
    title: `Acertar saldo · ${p.name}`,
    values: { balance: p.summary.balance },
    fields: [{ name: "balance", label: "Saldo que o app do banco mostra hoje (R$)", type: "number", required: true, min: 0 }],
    extra: `<p class="small muted">O Finora calculou <b>${brl(p.summary.balance)}</b>. A diferença entra como rendimento, não como depósito. Isso corrige feriados, centavos de arredondamento ou uma taxa diferente da cadastrada.</p>`,
    onSubmit: (d) => api(`/pots/${p.id}/balance`, { body: d }),
  });
}

async function potMovesDialog(p) {
  const form = $("#modalForm"), dlg = $("#modal");
  const KIND = { deposit: ["Depósito", ""], withdraw: ["Resgate", "neg"], adjust: ["Acerto de saldo", "muted"] };
  const render = (moves) => {
    form.innerHTML = `<h2>Movimentos · ${esc(p.name)}</h2>
      <div class="list">${moves.map((m) => `<div class="li"><div class="grow"><div class="title">${KIND[m.kind][0]}${m.note ? ` <span class="small muted">· ${esc(m.note)}</span>` : ""}</div><div class="small muted">${fdate(m.date)}</div></div>
        <div class="amount ${KIND[m.kind][1]}">${m.kind === "withdraw" ? "−" : m.kind === "adjust" && m.amount > 0 ? "+" : ""}${brl(m.amount)}</div>
        ${canEdit() ? `<button type="button" class="icon-btn" data-del="${m.id}" aria-label="Excluir movimento" title="Excluir">${navIcon("trash")}</button>` : ""}</div>`).join("") || '<div class="empty">Nenhum movimento.</div>'}</div>
      <div class="modal-actions"><button class="btn primary">Fechar</button></div>`;
    form.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!await askConfirm({ title: "Excluir esse movimento?", message: "O saldo e o rendimento da caixinha são recalculados.", confirmLabel: "Excluir", danger: true })) return;
      await api(`/pots/${p.id}/moves/${b.dataset.del}`, { method: "DELETE" });
      render(await api(`/pots/${p.id}/moves`));
    }));
  };
  render(await api(`/pots/${p.id}/moves`));
  form.onsubmit = null;
  dlg.onclose = () => { dlg.onclose = null; route(); };
  dlg.showModal();
}

/* ------------------------------------------------------------------ fluxo de caixa */
const CF_GRAN = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"], ["year", "Ano"]];
const CF_EVENT = { scheduled: "Agendado", contract: "Conta fixa", income: "Renda", receivable: "A receber", invoice: "Fatura" };
function cfLabel(b, gran) {
  const d = new Date(b.start + "T12:00:00");
  if (gran === "day") return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (gran === "week") return "sem. " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (gran === "month") return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/").replace(".", "");
  return String(d.getFullYear());
}

/* relatório executivo do mês: imprimir/salvar em PDF pelo navegador ou baixar Excel */
VIEWS.report = async (v) => {
  const ym = $("#monthRef").value || today().slice(0, 7);
  const r = await api(`/reports/monthly?month=${ym}`);
  const h = r.health;
  v.innerHTML = `<div class="between no-print" style="margin-bottom:12px"><p class="muted" style="margin:0">Relatório de ${esc(r.label)}. Troque o mês no seletor lá em cima.</p>
      <div class="row" style="gap:8px"><button class="btn" id="repXlsx">Baixar Excel</button><button class="btn primary" id="repPrint">Imprimir / salvar PDF</button></div></div>
    <div class="report">
      <header class="rep-head"><div><h1>Relatório financeiro · ${esc(r.label)}</h1><p class="muted small">${esc(state.user.name)} · gerado em ${fdate(r.generated_at)} pelo Finora</p></div>
        ${h && h.score != null ? `<div class="health-score ${h.score >= 75 ? "good" : h.score >= 45 ? "warn" : "bad"}">${h.score}<small>/100</small></div>` : ""}</header>
      <section class="card"><h2>Resumo</h2><div class="md">${md(r.summary)}</div><p class="small muted">${r.summary_source === "consultor" ? "Resumo do Consultor (IA) gerado neste mês." : "Resumo calculado a partir dos seus números."}</p></section>
      <div class="grid g4">
        <div class="card stat"><h3>Receitas</h3><div class="value pos">${brl(r.income)}</div></div>
        <div class="card stat"><h3>Despesas</h3><div class="value neg">${brl(r.expense)}</div></div>
        <div class="card stat"><h3>Resultado</h3><div class="value ${r.result >= 0 ? "pos" : "neg"}">${brl(r.result)}</div><div class="sub">${r.savings_rate != null ? `poupança ${pctBR(r.savings_rate, 1)}` : ""}</div></div>
        <div class="card stat"><h3>Patrimônio líquido</h3><div class="value">${brl(r.net_worth)}</div><div class="sub">contas ${brl(r.cash)} · invest. ${brl(r.investments)}</div></div></div>
      <div class="grid g2">
        <section class="card"><h2>Receitas x despesas</h2><div class="chart-box" style="height:220px"><canvas id="cRepM"></canvas></div></section>
        <section class="card"><h2>Gastos por categoria</h2><table><thead><tr><th>Categoria</th><th class="num">Mês</th><th class="num">Anterior</th><th class="num">Orçamento</th></tr></thead><tbody>
          ${r.categories.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${brl(c.total)}</td><td class="num muted">${brl(c.prev)}</td><td class="num ${c.budget && c.total > c.budget ? "neg" : "muted"}">${c.budget ? brl(c.budget) : "—"}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Sem gastos.</td></tr>'}</tbody></table></section></div>
      <div class="grid g2">
        <section class="card"><h2>Maiores gastos</h2><table><tbody>${r.biggest.map((b) => `<tr><td>${fdate(b.date)}</td><td>${esc(b.description)}<div class="small muted">${esc(b.category)}</div></td><td class="num">${brl(b.amount)}</td></tr>`).join("") || '<tr><td class="empty">—</td></tr>'}</tbody></table></section>
        <section class="card"><h2>Centros de custo</h2><table><tbody>${r.cost_centers.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${brl(c.total)}</td></tr>`).join("") || '<tr><td class="empty">—</td></tr>'}</tbody></table>
          ${r.cards.length ? `<h2 style="margin-top:14px">Cartões</h2><table><tbody>${r.cards.map((c) => `<tr><td>${esc(c.name)}<div class="small muted">vence ${fdate(c.due_date)}</div></td><td class="num">${brl(c.total)}</td></tr>`).join("")}</tbody></table>` : ""}</section></div>
      ${h ? `<section class="card"><h2>Saúde financeira</h2><div class="health-grid">${h.kpis.map((k) => `<div class="health-kpi ${k.status}"><div class="small muted">${esc(k.label)}</div><div class="hv">${kpiValue(k)}</div><div class="small muted">meta ${esc(k.target)}</div></div>`).join("")}</div></section>` : ""}
      ${r.portfolio ? `<section class="card"><h2>Investimentos</h2><p>Valor ${brl(r.portfolio.value)} · investido ${brl(r.portfolio.cost)} · resultado <b class="${r.portfolio.gain >= 0 ? "pos" : "neg"}">${brl(r.portfolio.gain)}</b>${r.portfolio.mwrr_annual != null ? ` · ${pctBR(r.portfolio.mwrr_annual)} ao ano` : ""}${r.portfolio.benchmarks?.cdi_annual != null ? ` (CDI ${pctBR(r.portfolio.benchmarks.cdi_annual)})` : ""}</p>
        <table><tbody>${r.portfolio.allocation.map((a) => `<tr><td>${esc(a.label)}</td><td class="num">${brl(a.value)}</td><td class="num muted">${pctBR(a.pct, 1)}</td></tr>`).join("")}</tbody></table></section>` : ""}
      ${r.goals.length ? `<section class="card"><h2>Metas</h2><table><tbody>${r.goals.map((g) => `<tr><td>${esc(g.name)}</td><td class="num">${brl(g.current)} de ${brl(g.target)}</td><td class="num muted">${Math.round(pct(g.current, g.target))}%</td></tr>`).join("")}</tbody></table></section>` : ""}
      ${r.insights.length ? `<section class="card"><h2>Próximos passos</h2><ol>${r.insights.map((i) => `<li><b>${esc(i.title)}.</b> ${esc(i.message)}</li>`).join("")}</ol></section>` : ""}
    </div>`;
  chart($("#cRepM"), { type: "bar", data: { labels: r.months.map((m) => monthLabel(m.month)), datasets: [
    { label: "Receitas", data: r.months.map((m) => m.income), backgroundColor: cssVar("--green"), borderRadius: 4 },
    { label: "Despesas", data: r.months.map((m) => m.expense), backgroundColor: cssVar("--red"), borderRadius: 4 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (x) => brl(x).replace(",00", "") } } } } });
  $("#repPrint").onclick = () => window.print();
  $("#repXlsx").onclick = async () => {
    const res = await fetch(`/api/reports/monthly.xlsx?month=${ym}`, { headers: { Authorization: "Bearer " + state.token } });
    if (!res.ok) { toast("Não foi possível gerar a planilha.", "error"); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = `finora-relatorio-${ym}.xlsx`; a.click();
  };
};

/* DRE: demonstração do resultado pelo plano de contas (services/chart_of_accounts.py) */
VIEWS.dre = async (v) => {
  const now = new Date();
  let year = +(localGet("finora_dre_year") || now.getFullYear()), month = localGet("finora_dre_month") || "";
  const draw = async () => {
    const d = await api(`/reports/dre?year=${year}${month ? `&month=${month}` : ""}`);
    const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    v.innerHTML = `<div class="between" style="margin-bottom:12px"><p class="muted" style="margin:0;max-width:680px">Demonstração do resultado pelo regime de caixa (data do lançamento), agrupada pelo plano de contas. Lançamento sem grupo entra como "não classificado".</p>
        <div class="row" style="gap:8px"><select id="dreY">${[0, 1, 2, 3].map((k) => now.getFullYear() - k).map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
        <select id="dreM"><option value="">Ano inteiro</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === String(month) ? "selected" : ""}>${m}</option>`).join("")}</select></div></div>
      ${d.has_chart ? "" : `<div class="card" style="margin-bottom:16px"><p>Este espaço ainda não tem plano de contas. ${canEdit() ? '<button class="btn small primary" id="applyChart">Criar plano de contas de empresa</button>' : ""}</p><p class="small muted">Cria as contas padrão (vendas, impostos, CMV, salários, aluguel, marketing, tarifas…) com o grupo da DRE. Suas categorias atuais continuam; dá pra definir o grupo delas em Categorias.</p></div>`}
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card stat"><h3>Margem bruta</h3><div class="value">${d.margins.bruta != null ? pctBR(d.margins.bruta, 1) : "—"}</div></div>
        <div class="card stat"><h3>Margem operacional</h3><div class="value">${d.margins.operacional != null ? pctBR(d.margins.operacional, 1) : "—"}</div></div>
        <div class="card stat"><h3>Margem líquida</h3><div class="value ${(d.margins.liquida || 0) < 0 ? "neg" : ""}">${d.margins.liquida != null ? pctBR(d.margins.liquida, 1) : "—"}</div></div></div>
      <div class="card"><h2>DRE · ${month ? `${MONTHS[month - 1]}/${year}` : year}</h2><table class="dre"><tbody>
        ${d.lines.map((l) => `<tr class="${l.indent ? "" : "dre-total"}"><td style="padding-left:${8 + l.indent * 18}px">${esc(l.label)}</td><td class="num ${l.value < 0 ? "neg" : ""}">${brl(l.value)}</td></tr>`).join("")}
      </tbody></table>
      <p class="small muted" style="margin-top:8px">Fora da DRE: investimentos ${brl(d.off_statement.capex)} · distribuição de lucros ${brl(d.off_statement.distribuicao)}${d.unclassified ? ` · <b>${brl(d.unclassified)} em despesas sem grupo</b> (classifique em Categorias)` : ""}</p></div>
      ${d.months.length ? `<div class="card" style="margin-top:16px"><h2>Mês a mês</h2><div class="table-wrap"><table><thead><tr><th></th>${MONTHS.map((m) => `<th class="num">${m}</th>`).join("")}</tr></thead><tbody>
        ${[["receita_liquida", "Receita líquida"], ["lucro_bruto", "Lucro bruto"], ["resultado_operacional", "Resultado operacional"], ["lucro_liquido", "Lucro líquido"]].map(([k, l]) => `<tr><td><b>${l}</b></td>${d.months.map((m) => `<td class="num ${m[k] < 0 ? "neg" : ""}">${m[k] ? brl(m[k]).replace(",00", "") : "—"}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div></div>` : ""}`;
    $("#dreY").onchange = (e) => { year = +e.target.value; localSet("finora_dre_year", year); draw(); };
    $("#dreM").onchange = (e) => { month = e.target.value; localSet("finora_dre_month", month); draw(); };
    if ($("#applyChart")) $("#applyChart").onclick = async () => { const r = await api("/chart-of-accounts/apply", { method: "POST" }); await refreshRefs(); toast(`${r.created} contas criadas`, "success"); draw(); };
  };
  await draw();
};

VIEWS.cashflow = async (v) => {
  let gran = localGet("finora_cf_gran") || "month";
  const draw = async () => {
    const r = await api(`/cashflow?granularity=${gran}`);
    const neg = r.lowest && r.lowest.balance < 0;
    v.innerHTML = `<p class="muted" style="margin:0 0 6px">O dinheiro das suas contas (corrente, poupança, dinheiro). Até hoje são os movimentos reais. Daqui pra frente é previsão: contas fixas, renda, contas a receber, faturas dos cartões no vencimento e o seu gasto médio do dia a dia (${brl(r.variable_daily)}/dia nos últimos 90 dias).</p>
      <div class="tabs" role="tablist">${CF_GRAN.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === gran}" class="${k === gran ? "active" : ""}" data-g="${k}">${l}</button>`).join("")}</div>
      <div class="grid g4" style="margin:12px 0 16px">
        <div class="card stat"><h3>Saldo hoje</h3><div class="value">${brl(r.balance_today)}</div><div class="sub">nas contas</div></div>
        <div class="card stat"><h3>Previsto no fim</h3><div class="value ${r.closing_balance < 0 ? "neg" : ""}">${brl(r.closing_balance)}</div><div class="sub">em ${fdate(r.end)}</div></div>
        <div class="card stat"><h3>Menor saldo previsto</h3><div class="value ${neg ? "neg" : ""}">${r.lowest ? brl(r.lowest.balance) : "—"}</div><div class="sub">${r.lowest ? "em " + fdate(r.lowest.date) : "sem previsão no período"}</div></div>
        <div class="card stat"><h3>Previsão no período</h3><div class="value" style="font-size:1.1rem"><span class="pos">+${brl(r.projected_inflow)}</span><br><span class="neg">−${brl(r.projected_outflow)}</span></div></div>
      </div>
      ${neg ? `<p class="small imp-warn">No ritmo atual o saldo fica negativo por volta de <b>${fdate(r.lowest.date)}</b>. Antecipe um recebimento, adie uma compra grande ou reduza o gasto do dia a dia.</p>` : ""}
      ${r.uses_income_average ? `<p class="small muted">Você não tem renda cadastrada, então a entrada prevista é a média das receitas dos últimos 90 dias. Cadastre em Renda pra cair no dia certo.</p>` : ""}
      <div class="card"><div class="chart-box" style="height:300px"><canvas id="cCf"></canvas></div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h2>Por período</h2><div class="table-wrap"><table><thead><tr><th>Período</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead><tbody>
          ${r.buckets.map((b) => `<tr class="${b.status === "future" ? "cf-future" : ""}${b.status === "current" ? " cf-current" : ""}"><td>${cfLabel(b, gran)}${b.status === "current" ? ' <span class="chip c-cyan">agora</span>' : b.status === "future" ? ' <span class="chip">previsto</span>' : ""}</td>
            <td class="num pos">${brl(b.inflow + b.projected_inflow)}</td><td class="num neg">${brl(b.outflow + b.projected_outflow)}</td><td class="num ${b.balance < 0 ? "neg" : ""}">${brl(b.balance)}</td></tr>`).join("")}
        </tbody></table></div></div>
        <div class="card"><h2>Próximas entradas e saídas</h2><div class="list">${r.events.slice(0, 40).map((e) => `<div class="li"><div class="grow"><div class="title">${esc(e.description)}</div><div class="small muted">${fdate(e.date)} · ${CF_EVENT[e.kind] || ""}</div></div><div class="amount ${e.amount < 0 ? "neg" : "pos"}">${e.amount < 0 ? "−" : "+"}${brl(Math.abs(e.amount))}</div></div>`).join("") || '<div class="empty">Nada previsto. Cadastre contas fixas, renda e contas a receber.</div>'}</div>
          <p class="small muted" style="margin-top:8px">O gasto do dia a dia (${brl(r.variable_daily)}/dia) entra todo dia na previsão e não aparece nesta lista.</p></div>
      </div>`;
    v.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { gran = b.dataset.g; localSet("finora_cf_gran", gran); state.charts.forEach((c) => c.destroy()); state.charts = []; draw(); }));
    const labels = r.buckets.map((b) => cfLabel(b, gran));
    // barras previstas mais claras (hex → rgba; canvas não entende color-mix em todo navegador)
    const fade = (c) => { const h = c.replace("#", ""); if (h.length !== 6) return c; const n = parseInt(h, 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},.38)`; };
    chart($("#cCf"), {
      data: { labels, datasets: [
        { type: "bar", label: "Entradas", data: r.buckets.map((b) => b.inflow + b.projected_inflow), borderRadius: 4,
          backgroundColor: r.buckets.map((b) => b.status === "future" ? fade(cssVar("--green")) : cssVar("--green")) },
        { type: "bar", label: "Saídas", data: r.buckets.map((b) => -(b.outflow + b.projected_outflow)), borderRadius: 4,
          backgroundColor: r.buckets.map((b) => b.status === "future" ? fade(cssVar("--red")) : cssVar("--red")) },
        { type: "line", label: "Saldo", data: r.buckets.map((b) => b.balance), borderColor: cssVar("--primary-2"), backgroundColor: cssVar("--primary-2"),
          pointRadius: gran === "day" ? 0 : 3, tension: .25, segment: { borderDash: (c) => r.buckets[c.p1DataIndex]?.status === "future" ? [6, 4] : undefined } },
      ] },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(Math.abs(c.raw))}` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: false, ticks: { callback: (x) => brl(x).replace(",00", "") } } } },
    });
  };
  await draw();
};

/* ------------------------------------------------------------------ investimentos */
const INV_CLASSES = { acao: "Ações", fii: "FIIs", etf: "ETFs", bdr: "BDRs", cripto: "Cripto", internacional: "Internacional (US$)",
  cdb: "CDB/RDB", lci_lca: "LCI/LCA", tesouro: "Tesouro Direto", debenture: "Debêntures/CRI/CRA", fundo: "Fundos", outro: "Outros" };
const INV_VARIABLE = ["acao", "fii", "etf", "bdr", "cripto", "internacional"];
const INV_INDEX = { cdi: "% do CDI", selic: "% da Selic", pre: "Prefixado (% a.a.)", ipca: "IPCA + (% a.a.)" };
const EVENT_KINDS = { dividend: "Dividendo", jcp: "JCP", income: "Rendimento (FII)", interest: "Juros", amortization: "Amortização" };
const PRICE_SRC = { quote: "cotação", manual: "preço informado", last_trade: "última compra", curve: "na curva" };
const INV_COLORS = ["#2340d8", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#64748b", "#f97316", "#14b8a6", "#a855f7"];
const qtyBR = (v) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 8 });
const signPct = (v) => v == null ? "—" : `${v > 0 ? "+" : ""}${pctBR(v)}`;

// mostra/esconde campos do formulário conforme a classe (openForm é genérico)
function toggleFormFields(names, show) {
  names.forEach((n) => { const el = $(`#modalForm [name="${n}"]`); if (el) el.closest("label").style.display = show ? "" : "none"; });
}

function investmentForm(inv = {}) {
  const isEdit = !!inv.id;
  openForm({
    title: isEdit ? `Editar ${inv.name}` : "Novo investimento",
    values: { asset_class: "acao", currency: "BRL", index_type: "cdi", trade_date: today(), ...inv },
    fields: [
      { row: [{ name: "asset_class", label: "Tipo", type: "select", options: Object.entries(INV_CLASSES) }, { name: "name", label: "Nome", required: true, placeholder: "Ex.: Petrobras, CDB Banco X" }] },
      { row: [{ name: "ticker", label: "Código (ticker)", placeholder: "PETR4, HGLG11, BTC" }, { name: "broker", label: "Corretora/banco" }] },
      { row: [{ name: "index_type", label: "Indexador", type: "select", options: Object.entries(INV_INDEX) }, { name: "index_rate", label: "Taxa (%)", type: "number", nullable: true, placeholder: "110 = 110% do CDI" },
        { name: "maturity", label: "Vencimento", type: "date", nullable: true }] },
      { name: "tax_free", label: "Isento de IR (LCI, LCA, CRI, CRA, debênture incentivada)", type: "checkbox" },
      { row: [{ name: "manual_price", label: "Preço atual informado (opcional)", type: "number", nullable: true, step: "0.000001" }, { name: "target_pct", label: "% alvo na carteira", type: "number", nullable: true, min: 0, max: 100 }] },
      ...(isEdit ? [{ name: "archived", label: "Arquivar (já vendi tudo / não acompanho mais)", type: "checkbox" }] : [
        { row: [{ name: "trade_date", label: "Data da compra", type: "date" }, { name: "trade_qty", label: "Quantidade", type: "number", nullable: true, step: "0.00000001" },
          { name: "trade_price", label: "Preço unitário (R$)", type: "number", nullable: true, step: "0.000001" }, { name: "trade_fees", label: "Taxas (R$)", type: "number", nullable: true }] },
        { name: "trade_amount", label: "Valor aplicado (R$)", type: "number", nullable: true }]),
    ],
    extra: `<p class="small muted" id="invHint"></p>`,
    onSubmit: async (d) => {
      const variable = INV_VARIABLE.includes(d.asset_class);
      const body = { name: d.name, ticker: d.ticker || "", asset_class: d.asset_class, broker: d.broker || "",
        currency: d.asset_class === "internacional" ? "USD" : "BRL", index_type: variable ? null : d.index_type, index_rate: variable ? null : d.index_rate,
        maturity: d.maturity, tax_free: !!d.tax_free, manual_price: d.manual_price, target_pct: d.target_pct, archived: !!d.archived };
      const saved = await api(isEdit ? `/investments/${inv.id}` : "/investments", { method: isEdit ? "PUT" : "POST", body });
      if (!isEdit) {
        const t = variable ? (d.trade_qty && d.trade_price != null ? { quantity: d.trade_qty, price: d.trade_price, fees: d.trade_fees || 0 } : null)
          : (d.trade_amount ? { quantity: 1, price: d.trade_amount, fees: 0 } : null);
        if (t) await api(`/investments/${saved.id}/trades`, { body: { date: d.trade_date || today(), kind: "buy", ...t } });
      }
    },
    onDelete: isEdit ? () => api(`/investments/${inv.id}`, { method: "DELETE" }) : null,
  });
  const sync = () => {
    const cls = $('#modalForm [name="asset_class"]').value, variable = INV_VARIABLE.includes(cls);
    toggleFormFields(["ticker"], variable || cls === "tesouro");
    toggleFormFields(["index_type", "index_rate", "maturity", "tax_free"], !variable && cls !== "fundo" && cls !== "outro");
    toggleFormFields(["trade_qty", "trade_price", "trade_fees"], variable);
    toggleFormFields(["trade_amount"], !variable);
    $("#invHint").textContent = cls === "cripto" ? "Código: BTC, ETH, SOL… (ou o id da CoinGecko). A cotação em reais vem sozinha."
      : cls === "internacional" ? "Preço em dólar; o valor em reais usa o dólar do dia. Informe o preço atual à mão."
      : variable ? "Ações, FIIs, ETFs e BDRs: a cotação vem da B3 (brapi). Se não vier, use o preço informado."
      : cls === "fundo" || cls === "outro" ? "Informe o valor atual (preço) de vez em quando pra acompanhar o resultado."
      : "Renda fixa rende pelo indexador todo dia útil (valor na curva). Vendendo antes do vencimento, o preço pode ser outro.";
  };
  $('#modalForm [name="asset_class"]').onchange = sync; sync();
}

function tradeForm(p, kind) {
  const variable = INV_VARIABLE.includes(p.asset_class);
  openForm({
    title: `${kind === "buy" ? (variable ? "Comprar" : "Aplicar em") : (variable ? "Vender" : "Resgatar de")} ${p.ticker || p.name}`,
    values: { date: today() },
    fields: variable ? [
      { row: [{ name: "date", label: "Data", type: "date", required: true }, { name: "quantity", label: "Quantidade", type: "number", required: true, step: "0.00000001" }] },
      { row: [{ name: "price", label: `Preço unitário (${p.currency === "USD" ? "US$" : "R$"})`, type: "number", required: true, step: "0.000001" }, { name: "fees", label: "Taxas e corretagem (R$)", type: "number" }] },
      { name: "day_trade", label: "Day trade (comprou e vendeu no mesmo dia)", type: "checkbox" },
      { name: "note", label: "Observação" }]
      : [{ row: [{ name: "date", label: "Data", type: "date", required: true }, { name: "price", label: "Valor (R$)", type: "number", required: true }] }, { name: "note", label: "Observação" }],
    extra: kind === "sell" && variable ? `<p class="small muted">Você tem ${qtyBR(p.quantity)} a preço médio de ${brl(p.avg_price)}.</p>` : "",
    onSubmit: (d) => api(`/investments/${p.id}/trades`, { body: { kind, date: d.date, quantity: variable ? d.quantity : 1, price: d.price, fees: d.fees || 0, day_trade: !!d.day_trade, note: d.note || "" } }),
  });
}

function eventForm(p) {
  openForm({
    title: `Provento de ${p.ticker || p.name}`,
    values: { date: today(), kind: p.asset_class === "fii" ? "income" : "dividend" },
    fields: [{ row: [{ name: "kind", label: "Tipo", type: "select", options: Object.entries(EVENT_KINDS) }, { name: "date", label: "Data do pagamento", type: "date", required: true }] },
      { row: [{ name: "amount", label: "Valor recebido (R$, total líquido)", type: "number", required: true }, { name: "per_unit", label: "Por cota/ação (opcional)", type: "number", nullable: true, step: "0.000001" }] }],
    onSubmit: (d) => api(`/investments/${p.id}/events`, { body: d }),
  });
}

async function investmentDetail(p, inv) {
  const form = $("#modalForm"), dlg = $("#modal");
  const render = async () => {
    const h = await api(`/investments/${p.id}/history`);
    const variable = INV_VARIABLE.includes(p.asset_class);
    form.innerHTML = `<h2>${esc(p.ticker || p.name)} <span class="chip">${esc(p.class_label)}</span></h2>
      <p class="small muted">${esc(p.name)}${p.broker ? " · " + esc(p.broker) : ""}${p.maturity ? " · vence " + fdate(p.maturity) : ""}</p>
      <div class="pot-rows" style="border-top:0;padding-top:0">
        <div><span>Valor hoje</span><b>${brl(p.value)}</b></div>
        ${variable ? `<div class="small muted"><span>${qtyBR(p.quantity)} × ${p.price != null ? (p.currency === "USD" ? "US$ " + p.price.toLocaleString("pt-BR") : brl(p.price)) : "—"} (${PRICE_SRC[p.price_source] || ""})</span><span>médio ${brl(p.avg_price)}</span></div>` : `<div class="small muted"><span>Taxa hoje</span><span>${p.annual_rate != null ? pctBR(p.annual_rate) + " a.a." : "—"}</span></div>`}
        <div><span>Resultado</span><b class="${p.gain >= 0 ? "pos" : "neg"}">${brl(p.gain)} (${signPct(p.gain_pct)})</b></div>
        ${p.income ? `<div><span>Proventos recebidos</span><b class="pos">${brl(p.income)}</b></div>` : ""}
        ${p.realized_gain ? `<div><span>Lucro realizado em vendas</span><b class="${p.realized_gain >= 0 ? "pos" : "neg"}">${brl(p.realized_gain)}</b></div>` : ""}
        ${p.tax_estimate ? `<div class="small muted"><span>IR/IOF estimado se resgatar hoje</span><span>${brl(p.tax_estimate)}</span></div>` : ""}
      </div>
      ${canEdit() ? `<div class="pot-actions"><button type="button" class="btn small primary" data-a="buy">${variable ? "Comprar" : "Aplicar"}</button><button type="button" class="btn small" data-a="sell">${variable ? "Vender" : "Resgatar"}</button>${["acao", "fii", "etf", "bdr"].includes(p.asset_class) || !variable ? '<button type="button" class="btn small" data-a="event">+ Provento</button>' : ""}<button type="button" class="btn small ghost" data-a="edit">Editar</button></div>` : ""}
      <h3 style="margin-top:16px">Operações</h3>
      <div class="list">${h.trades.map((t) => `<div class="li"><div class="grow"><div class="title">${t.kind === "buy" ? (variable ? "Compra" : "Aplicação") : (variable ? "Venda" : "Resgate")}${t.day_trade ? ' <span class="chip c-amber">day trade</span>' : ""}</div><div class="small muted">${fdate(t.date)}${variable ? ` · ${qtyBR(t.quantity)} × ${brl(t.price)}` : ""}${t.fees ? ` · taxas ${brl(t.fees)}` : ""}${t.note ? " · " + esc(t.note) : ""}</div></div>
        <div class="amount ${t.kind === "sell" ? "pos" : ""}">${brl(t.quantity * t.price)}</div>${canEdit() ? `<button type="button" class="icon-btn" data-dt="${t.id}" aria-label="Excluir operação">${navIcon("trash")}</button>` : ""}</div>`).join("") || '<div class="empty">Nenhuma operação.</div>'}</div>
      ${h.events.length ? `<h3 style="margin-top:16px">Proventos</h3><div class="list">${h.events.map((e) => `<div class="li"><div class="grow"><div class="title">${EVENT_KINDS[e.kind]}</div><div class="small muted">${fdate(e.date)}${e.per_unit ? ` · ${brl(e.per_unit)} por cota` : ""}</div></div><div class="amount pos">${brl(e.amount)}</div>${canEdit() ? `<button type="button" class="icon-btn" data-de="${e.id}" aria-label="Excluir provento">${navIcon("trash")}</button>` : ""}</div>`).join("")}</div>` : ""}
      <div class="modal-actions"><button class="btn primary">Fechar</button></div>`;
    form.onsubmit = null;
    const go = (fn) => () => { dlg.onclose = null; dlg.close(); fn(); };
    form.querySelectorAll("[data-a]").forEach((b) => (b.onclick = go(() => ({ buy: () => tradeForm(p, "buy"), sell: () => tradeForm(p, "sell"), event: () => eventForm(p), edit: () => investmentForm(inv) })[b.dataset.a]())));
    form.querySelectorAll("[data-dt]").forEach((b) => (b.onclick = async () => {
      if (!await askConfirm({ title: "Excluir essa operação?", message: "Preço médio, resultado e imposto são recalculados.", confirmLabel: "Excluir", danger: true })) return;
      await api(`/investments/${p.id}/trades/${b.dataset.dt}`, { method: "DELETE" }); dlg.close();
    }));
    form.querySelectorAll("[data-de]").forEach((b) => (b.onclick = async () => {
      if (!await askConfirm({ title: "Excluir esse provento?", confirmLabel: "Excluir", danger: true })) return;
      await api(`/investments/${p.id}/events/${b.dataset.de}`, { method: "DELETE" }); dlg.close();
    }));
  };
  await render();
  dlg.onclose = () => { dlg.onclose = null; route(); };
  dlg.showModal();
}

VIEWS.investments = async (v) => {
  let tab = localGet("finora_inv_tab") || "portfolio";
  const draw = async () => {
    v.innerHTML = `<div class="between" style="margin-bottom:6px"><p class="muted" style="margin:0">Ações, FIIs, renda fixa, Tesouro e cripto num lugar só, com preço médio, rentabilidade comparada ao CDI e o imposto de renda do mês.</p>${canEdit() ? '<button class="btn" id="newInv">+ Investimento</button>' : ""}</div>
      <div class="tabs" role="tablist">${[["portfolio", "Carteira"], ["dividends", "Proventos"], ["tax", "Imposto de renda"]].map(([k, l]) => `<button type="button" class="${k === tab ? "active" : ""}" data-t="${k}">${l}</button>`).join("")}</div>
      <div id="invBody" style="margin-top:12px"><div class="empty">Carregando…</div></div>`;
    if (canEdit()) $("#newInv").onclick = () => investmentForm();
    v.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { tab = b.dataset.t; localSet("finora_inv_tab", tab); state.charts.forEach((c) => c.destroy()); state.charts = []; draw(); }));
    const body = $("#invBody");
    if (tab === "portfolio") await drawPortfolio(body);
    else if (tab === "dividends") await drawDividends(body);
    else await drawTax(body);
  };
  await draw();
};

async function drawPortfolio(body) {
  const p = await api("/investments");
  const live = p.positions.filter((x) => x.value || x.quantity);
  const b = p.benchmarks || {};
  const invAccounts = state.accounts.filter((a) => a.kind === "investment" && !a.archived && a.balance);
  const beat = p.mwrr_annual != null && b.cdi_annual != null ? p.mwrr_annual - b.cdi_annual : null;
  body.innerHTML = `${invAccounts.length && p.value ? `<p class="small imp-warn">Você também tem conta do tipo Investimentos com saldo (${invAccounts.map((a) => esc(a.name)).join(", ")}). Se for o mesmo dinheiro desta carteira, zere ou arquive a conta pra não contar duas vezes no patrimônio.</p>` : ""}
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><h3>Valor hoje</h3><div class="value">${brl(p.value)}</div><div class="sub">investido ${brl(p.cost)}</div></div>
      <div class="card stat"><h3>Resultado</h3><div class="value ${p.gain >= 0 ? "pos" : "neg"}">${brl(p.gain)}</div><div class="sub">${signPct(p.gain_pct)} · + proventos ${brl(p.income)}${p.realized_gain ? ` · vendas ${brl(p.realized_gain)}` : ""}</div></div>
      <div class="card stat"><h3>Rentabilidade ao ano</h3><div class="value">${p.mwrr_annual != null ? pctBR(p.mwrr_annual) : "—"}</div><div class="sub">${b.cdi_annual != null ? `CDI ${pctBR(b.cdi_annual)}${beat != null ? ` · ${beat >= 0 ? "acima" : "abaixo"} ${pctBR(Math.abs(beat))}` : ""}` : "taxa interna de retorno"}</div></div>
      <div class="card stat"><h3>No período</h3><div class="value" style="font-size:1.05rem">${p.since ? `desde ${fdate(p.since)}` : "—"}</div><div class="sub">${b.cdi_total != null ? `CDI ${pctBR(b.cdi_total)}` : ""}${b.ipca_total != null ? ` · IPCA ${pctBR(b.ipca_total)}` : ""}${p.twrr ? ` · TWRR ${signPct(p.twrr.total)}` : ""}</div></div>
    </div>
    ${live.length ? `<div class="grid g2">
      <div class="card"><h2>Alocação</h2><div class="chart-box" style="height:240px"><canvas id="cAlloc"></canvas></div>
        <div class="list" style="margin-top:8px">${p.allocation.map((a, i) => {
          const tgt = live.filter((x) => x.asset_class === a.class).reduce((s, x) => s + (x.target_pct || 0), 0);
          const diff = tgt ? a.pct - tgt : null;
          return `<div class="li"><span class="dot" style="background:${INV_COLORS[i % INV_COLORS.length]}"></span><div class="grow">${esc(a.label)}${tgt ? ` <span class="small muted">alvo ${pctBR(tgt, 0)}</span>` : ""}</div><div class="amount">${brl(a.value)} <span class="small muted">${pctBR(a.pct, 1)}</span>${diff != null && Math.abs(diff) >= 3 ? ` <span class="chip ${diff > 0 ? "c-amber" : "c-cyan"}">${diff > 0 ? "acima" : "abaixo"} ${pctBR(Math.abs(diff), 0)}</span>` : ""}</div></div>`; }).join("")}</div></div>
      <div class="card"><h2>Ativos</h2><div class="table-wrap"><table><thead><tr><th>Ativo</th><th class="num hide-sm">Preço médio</th><th class="num">Valor</th><th class="num">Resultado</th></tr></thead><tbody>
        ${p.positions.map((x, i) => `<tr class="clickable" data-p="${i}" tabindex="0"><td><b>${esc(x.ticker || x.name)}</b> <span class="small muted">${esc(x.class_label)}</span><div class="small muted">${INV_VARIABLE.includes(x.asset_class) ? `${qtyBR(x.quantity)} · ${PRICE_SRC[x.price_source] || ""}` : x.annual_rate != null ? `${pctBR(x.annual_rate)} a.a.` : ""}${x.price_source === "last_trade" ? ' <span class="chip c-amber">sem cotação</span>' : ""}</div></td>
          <td class="num hide-sm">${INV_VARIABLE.includes(x.asset_class) ? brl(x.avg_price) : "—"}</td><td class="num">${brl(x.value)}</td><td class="num ${x.gain >= 0 ? "pos" : "neg"}">${signPct(x.gain_pct)}</td></tr>`).join("")}
      </tbody></table></div><p class="small muted" style="margin-top:6px">Toque num ativo pra comprar, vender, lançar provento ou editar.</p></div>
    </div>` : `<div class="card empty">Nenhum investimento ainda. Clique em "+ Investimento" e cadastre o primeiro com a compra.</div>`}`;
  body.querySelectorAll("[data-p]").forEach((el) => clickable(el, () => { const pos = p.positions[el.dataset.p]; investmentDetail(pos, pos); }));
  if (live.length) chart($("#cAlloc"), { type: "doughnut", data: { labels: p.allocation.map((a) => a.label), datasets: [{ data: p.allocation.map((a) => a.value), backgroundColor: p.allocation.map((_, i) => INV_COLORS[i % INV_COLORS.length]), borderColor: cssVar("--surface"), borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${brl(c.raw)}` } } } } });
}

async function drawDividends(body) {
  const d = await api("/portfolio/dividends");
  body.innerHTML = `<div class="grid g3" style="margin-bottom:16px">
      <div class="card stat"><h3>Recebido em 12 meses</h3><div class="value pos">${brl(d.last12)}</div><div class="sub">${brl(d.last12 / 12)} por mês em média</div></div>
      <div class="card stat"><h3>Previsto em 6 meses</h3><div class="value">${brl(d.next6)}</div><div class="sub">pela média recente de cada ativo</div></div>
      <div class="card stat"><h3>Ativos pagando</h3><div class="value">${d.assets.length}</div><div class="sub">nos últimos 12 meses</div></div></div>
    <div class="card"><h2>Calendário de proventos</h2><div class="chart-box" style="height:260px"><canvas id="cDiv"></canvas></div></div>
    <div class="card" style="margin-top:16px"><h2>Por ativo</h2><div class="list">${d.assets.map((a) => `<div class="li"><div class="grow"><div class="title">${esc(a.name)}</div><div class="small muted">${esc(INV_CLASSES[a.class] || a.class)} · ~${brl(a.monthly_estimate)} por mês</div></div><div class="amount pos">${brl(a.last12)}</div></div>`).join("") || '<div class="empty">Nenhum provento lançado. Abra um ativo e use "+ Provento".</div>'}</div></div>`;
  chart($("#cDiv"), { type: "bar", data: { labels: d.months.map((m) => monthLabel(m.month)), datasets: [
    { label: "Recebido", data: d.months.map((m) => m.received), backgroundColor: cssVar("--green"), borderRadius: 4 },
    { label: "Previsto", data: d.months.map((m) => m.projected), backgroundColor: "rgba(35,64,216,.35)", borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(c.raw)}` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (x) => brl(x).replace(",00", "") } } } } });
}

async function drawTax(body, year) {
  const t = await api(`/portfolio/tax${year ? `?year=${year}` : ""}`);
  const MON = (m) => new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  body.innerHTML = `<div class="between" style="margin-bottom:12px"><p class="small muted" style="margin:0;max-width:720px">Cálculo automático pelas regras de pessoa física: ações isentas até R$ 20 mil de vendas no mês, FII 20%, ETF e BDR 15% sem isenção, day trade 20%, cripto isenta até R$ 35 mil de vendas. Prejuízos são compensados nos meses seguintes. Confira com seu contador antes de pagar.</p>
      <label class="imp-ym">Ano <select id="taxYear">${t.years.map((y) => `<option ${y === t.year ? "selected" : ""}>${y}</option>`).join("")}</select></label></div>
    <div class="card"><h2>Apuração mensal</h2><div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Vendas de ações</th><th class="num">Lucro tributável</th><th class="num">Imposto</th><th>DARF</th></tr></thead><tbody>
      ${t.months.map((m) => `<tr><td>${MON(m.month)}${m.acao_exempt ? ' <span class="chip c-green">ações isentas</span>' : ""}</td><td class="num">${brl(m.acao_sales)}</td><td class="num">${brl(m.taxable_base)}</td><td class="num">${brl(m.tax)}</td>
        <td>${m.darfs.map((d) => `<b>${brl(d.amount)}</b> <span class="small muted">cód. ${d.code} · vence ${fdate(m.due_date)}</span>`).join("<br>") || (m.carry_next ? `<span class="small muted">${brl(m.carry_next)} passa pro mês seguinte (menos de R$ 10)</span>` : '<span class="small muted">nada a pagar</span>')}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">Nenhuma venda neste ano.</td></tr>'}
    </tbody></table></div>
    <p class="small muted" style="margin-top:8px">Prejuízo acumulado pra compensar: ações/ETF/BDR ${brl(t.losses.comum)} · FII ${brl(t.losses.fii)} · day trade ${brl(t.losses.daytrade)}</p></div>
    <div class="card" style="margin-top:16px"><h2>Pra declaração de ${t.year}</h2>
      <div class="grid g2" style="margin-bottom:10px"><div class="pot-rows" style="border-top:0"><div><span>Rendimentos isentos (dividendos, FII, lucro isento)</span><b>${brl(t.annual.exempt_income)}</b></div><div><span>Tributação exclusiva (JCP)</span><b>${brl(t.annual.exclusive_income)}</b></div></div></div>
      <h3>Bens e direitos (pelo custo, em 31/12)</h3><div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">Custo</th></tr></thead><tbody>
      ${t.annual.goods.map((g) => `<tr><td>${esc(g.ticker || g.name)}${g.broker ? ` <span class="small muted">${esc(g.broker)}</span>` : ""}</td><td>${esc(g.class)}</td><td class="num">${qtyBR(g.quantity)}</td><td class="num">${brl(g.cost)}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Nada em carteira.</td></tr>'}
      </tbody></table></div></div>`;
  $("#taxYear").onchange = (e) => drawTax(body, e.target.value);
}

function costCenterForm(c = {}) {
  openForm({
    title: c.id ? "Editar centro de custo" : "Novo centro de custo",
    values: { color: "#6366f1", ...c },
    fields: [{ row: [{ name: "name", label: "Nome", required: true, placeholder: "Casa, Filhos, Empresa, Obra…" }, { name: "color", label: "Cor", type: "color" }] },
      ...(c.id ? [{ name: "archived", label: "Arquivar (some das listas, mantém o histórico)", type: "checkbox" }] : [])],
    onSubmit: async (d) => { await api(c.id ? `/cost-centers/${c.id}` : "/cost-centers", { method: c.id ? "PUT" : "POST", body: d }); await refreshRefs(); },
    onDelete: c.id ? async () => { await api(`/cost-centers/${c.id}`, { method: "DELETE" }); await refreshRefs(); } : null,
  });
}

VIEWS.costcenters = async (v) => {
  await refreshRefs();
  const [s, e] = monthRange();
  const r = await api(`/reports/cost-centers?start=${s}&end=${e}`);
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">Centros de custo dizem <b>pra quem</b> é o gasto (Casa, Filhos, Empresa) e atravessam as categorias. Tags marcam projetos e eventos (#viagem, #reforma). Use os dois no lançamento ou em lote na tela de Lançamentos.</p>${canEdit() ? '<button class="btn" id="newCc">+ Centro de custo</button>' : ""}</div>
    <div class="grid g2">
      <div class="card"><h2>Gastos por centro de custo</h2><p class="small muted">${fdate(s)} a ${fdate(e)} · total ${brl(r.total_expense)}</p>
        <div class="list">${r.cost_centers.map((c) => `<div class="li" style="display:block"><div class="between"><span><span class="dot" style="display:inline-block;background:${esc(c.color)}"></span> ${esc(c.name)}</span><span class="amount">${brl(c.expense)} <span class="small muted">${c.share}%</span></span></div>
          <div class="bar"><i style="${barFill(c.share)};background:${esc(c.color)}"></i></div>
          <div class="small muted" style="margin-top:4px">${c.count} lançamento(s)${c.income ? ` · receitas ${brl(c.income)}` : ""}</div></div>`).join("") || '<div class="empty">Nenhum lançamento no período.</div>'}</div></div>
      <div class="card"><h2>Tags no período</h2>
        <div class="list">${r.tags.map((t) => `<div class="li"><div class="grow"><span class="chip c-tag">#${esc(t.tag)}</span> <span class="small muted">${t.count} lançamento(s)</span></div><div class="amount">${brl(t.expense)}${t.income ? ` <span class="small pos">+${brl(t.income)}</span>` : ""}</div></div>`).join("") || '<div class="empty">Nenhuma tag usada no período.</div>'}</div></div>
    </div>
    <div class="card" style="margin-top:16px"><h2>Seus centros de custo</h2>
      <div class="list">${state.costCenters.map((c, i) => `<div class="li clickable" data-i="${i}"><span class="dot" style="background:${esc(c.color)}"></span><div class="grow">${esc(c.name)} ${c.archived ? '<span class="chip">arquivado</span>' : ""}</div></div>`).join("") || '<div class="empty">Nenhum ainda. Exemplos: Casa, Filhos, Carro, Empresa.</div>'}</div></div>`;
  if (canEdit()) {
    $("#newCc").onclick = () => costCenterForm();
    v.querySelectorAll("[data-i]").forEach((el) => clickable(el, () => costCenterForm(state.costCenters[el.dataset.i])));
  }
};

VIEWS.pots = async (v) => {
  const items = await api("/pots");
  const active = items.filter((p) => !p.archived);
  const sum = (k) => active.reduce((s, p) => s + p.summary[k], 0);
  const approx = active.some((p) => !p.summary.official_rates);
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">Caixinhas rendem todo dia útil. O Finora usa a taxa oficial do Banco Central em cada dia, igual ao banco.</p>${canEdit() ? '<button class="btn" id="newPot">+ Caixinha</button>' : ""}</div>
    ${active.length ? `<div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><h3>Guardado</h3><div class="value" data-count="${sum("balance")}">${brl(sum("balance"))}</div><div class="sub">${active.length} caixinha(s)</div></div>
      <div class="card stat"><h3>Já rendeu</h3><div class="value pos">${brl(sum("gross_yield"))}</div><div class="sub">sobre ${brl(sum("invested"))} guardados</div></div>
      <div class="card stat"><h3>Rendeu este mês</h3><div class="value">${brl(sum("month_yield"))}</div><div class="sub">até ontem</div></div>
      <div class="card stat"><h3>Próximos 30 dias</h3><div class="value">${brl(sum("monthly_estimate"))}</div><div class="sub">estimativa na taxa de hoje</div></div>
    </div>` : ""}
    ${approx ? `<p class="small imp-warn">Sem acesso ao Banco Central agora. O rendimento está estimado com a taxa atual em todos os dias úteis e volta ao valor exato quando a conexão voltar.</p>` : ""}
    <div class="grid g2">${items.map((p, i) => { const s = p.summary; return `<div class="card pot${p.archived ? " muted" : ""}" style="--pot:${esc(p.color)}">
      <div class="between"><h2><span class="dot" style="background:${esc(p.color)};display:inline-block"></span> ${esc(p.name)}${p.archived ? ' <span class="chip">arquivada</span>' : ""}</h2>${canEdit() ? `<button class="btn small" data-act="edit" data-i="${i}">Editar</button>` : ""}</div>
      <div class="small muted">${p.institution ? esc(p.institution) + " · " : ""}${potRateLabel(p)}${s.annual_rate != null ? ` · ${pctBR(s.annual_rate)} ao ano hoje` : ""}${p.tax_free ? ' · <span class="chip c-green">isenta</span>' : ""}</div>
      <div class="stat"><div class="value">${brl(s.balance)}</div>
        <div class="sub">Rendeu <b class="pos">${brl(s.gross_yield)}</b>${s.yield_pct != null ? ` (${pctBR(s.yield_pct)})` : ""}${s.since ? ` desde ${fdate(s.since)}` : ""} · este mês <b>${brl(s.month_yield)}</b></div></div>
      ${p.goal_amount ? `<div class="bar"><i style="${barFill(pct(s.balance, p.goal_amount))}"></i></div><div class="small muted" style="margin-top:4px">${Math.round(pct(s.balance, p.goal_amount))}% da meta de ${brl(p.goal_amount)}</div>` : ""}
      <div class="pot-rows">
        <div><span>Se resgatar tudo hoje</span><b>${brl(s.net_balance)}</b></div>
        ${p.tax_free ? "" : `<div class="small muted"><span>Imposto estimado</span><span>IR ${brl(s.ir)}${s.iof ? ` · IOF ${brl(s.iof)}` : ""}</span></div>`}
        <div class="small muted"><span>Deve render em 30 dias / 12 meses</span><span>${brl(s.monthly_estimate)} / ${brl(s.year_estimate)}</span></div>
      </div>
      ${canEdit() ? `<div class="pot-actions"><button class="btn small primary" data-act="deposit" data-i="${i}">Guardar</button><button class="btn small" data-act="withdraw" data-i="${i}">Resgatar</button><button class="btn small ghost" data-act="balance" data-i="${i}">Acertar saldo</button><button class="btn small ghost" data-act="moves" data-i="${i}">Movimentos</button></div>` : ""}
    </div>`; }).join("") || `<div class="card empty">Nenhuma caixinha ainda. Cadastre a do seu banco pra acompanhar quanto o dinheiro guardado está rendendo.</div>`}</div>`;
  if (canEdit()) $("#newPot").onclick = () => potForm();
  v.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => {
    const p = items[b.dataset.i];
    ({ edit: () => potForm(p), deposit: () => potMoveForm(p, "deposit"), withdraw: () => potMoveForm(p, "withdraw"),
       balance: () => potBalanceForm(p), moves: () => potMovesDialog(p) })[b.dataset.act]();
  }));
};

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


/* perfil pelo comportamento + onde investir a sobra (services/allocation.py) */
async function renderAllocationCard(box) {
  let r;
  try { r = await api("/advisor/allocation"); } catch (e) { box.innerHTML = ""; return; }
  const p = r.profile;
  box.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="between"><h2 style="margin:0">Onde investir a sobra do mês</h2>
      <label class="imp-ym small">Perfil <select id="profSel"><option value="auto" ${!state.user.investor_profile ? "selected" : ""}>Calculado: ${esc(p.label)} (${p.score}/100)</option>${Object.entries(PROFILE_LABEL).map(([k, l]) => `<option value="${k}" ${state.user.investor_profile === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <p class="small muted" style="margin-top:6px">Perfil pelo seu comportamento real: ${p.reasons.map((x) => esc(x.text)).join(" ") || "ainda poucos dados."}</p>
    <div class="grid g3" style="margin:10px 0">
      <div class="card stat"><h3>Sobra média</h3><div class="value ${r.surplus >= 0 ? "pos" : "neg"}">${brl(r.surplus)}</div><div class="sub">por mês (renda − gasto médio)</div></div>
      <div class="card stat"><h3>Margem de segurança</h3><div class="value">${brl(r.margin)}</div><div class="sub">10% da renda fica livre</div></div>
      <div class="card stat"><h3>Pra investir</h3><div class="value">${brl(r.free)}</div><div class="sub">perfil usado: ${esc(r.used_label)}</div></div></div>
    ${r.steps.map((s) => `<p class="small">${esc(s)}</p>`).join("")}
    ${r.action === "cut" ? `<p class="small imp-warn">Primeiro, abrir espaço no orçamento: veja "O que fazer agora" no Painel e as sugestões em Contratos.</p>` : ""}
    <div class="list">${r.plan.map((x) => `<div class="li" style="display:block"><div class="between"><b>${esc(x.label)}</b><span class="amount">${brl(x.amount)}</span></div><div class="small muted">${esc(x.why)}</div><div class="small">Exemplos: ${esc(x.examples)}</div></div>`).join("")}</div>
    <p class="small muted" style="margin-top:8px">${esc(r.disclaimer)}</p></div>`;
  $("#profSel").onchange = async (e) => {
    state.user = await api("/me", { method: "PATCH", body: { investor_profile: e.target.value } });
    renderAllocationCard(box);
  };
}

VIEWS.advisor = async (v) => {
  const reports = await api("/advisor");
  v.innerHTML = `<div id="allocBox"></div><div class="card" style="margin-bottom:16px">
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
  renderAllocationCard($("#allocBox"));
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
    if (!await askConfirm({ title: "Remover esta conexão bancária?", message: "As contas ficam arquivadas e o histórico de lançamentos é mantido.", confirmLabel: "Remover conexão", danger: true })) return;
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
    const ccs = state.costCenters.filter((c) => !c.archived);
    html += `<p class="muted small">Convide alguém (sócio(a), cônjuge, contador) pra ver e editar os mesmos dados financeiros que você.</p>
      ${ccs.length ? `<details class="small" style="margin-bottom:8px"><summary>Limitar a centros de custo (ex.: funcionário que só lança despesas da obra)</summary>
        <div class="row" style="flex-wrap:wrap;gap:4px 14px;margin-top:6px">${ccs.map((c) => `<label class="check" style="margin:0"><input type="checkbox" class="shCc" value="${c.id}"> ${esc(c.name)}</label>`).join("")}</div>
        <p class="muted" style="margin:4px 0 0">Com algum marcado, a pessoa só vê e lança nesses centros; painel, relatórios e as outras telas ficam fechados pra ela.</p></details>` : ""}
      <div class="row"><input id="shEmail" type="email" placeholder="E-mail da pessoa"><select id="shRole"><option value="editor">Pode editar</option><option value="viewer">Só visualizar</option></select><button class="btn" id="shInvite">Convidar</button></div>
      <div class="list" style="margin-top:12px">${members.map((m) => `<div class="li"><div class="grow"><div class="title">${esc(m.email)} ${m.accepted_at ? "" : '<span class="chip c-amber">convite pendente</span>'}</div><div class="small muted">${roleLabel[m.role]}</div></div><button class="btn small danger" data-revoke="${m.id}">Remover</button></div>`).join("") || '<div class="empty">Ninguém tem acesso à sua conta ainda.</div>'}</div>`;
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
    if (!await askConfirm({ title: "Remover o acesso dessa pessoa?", message: "Ela deixa de ver e editar seus dados imediatamente.", confirmLabel: "Remover acesso", danger: true })) return;
    await api(`/shared-access/${b.dataset.revoke}`, { method: "DELETE" }); toast("Acesso removido", "success"); route();
  }));
  const inviteBtn = v.querySelector("#shInvite");
  if (inviteBtn) inviteBtn.onclick = async () => {
    const email = $("#shEmail").value.trim();
    if (!email) return;
    const cost_center_ids = [...v.querySelectorAll(".shCc:checked")].map((c) => +c.value);
    try { await api("/shared-access", { body: { email, role: $("#shRole").value, cost_center_ids } }); toast("Convite enviado", "success"); route(); }
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
    <div class="card"><div class="between"><h2>Empresas</h2><button type="button" class="btn small" id="newCompany">+ Empresa</button></div>
      <p class="small muted">Cada empresa tem contas, lançamentos, cartões, contratos, investimentos e relatórios separados dos seus. Troque no seletor do topo.</p>
      <div class="list">${(state.user.workspaces || []).filter((w) => w.entity && !w.shared).map((w) => `<div class="li"><div class="grow"><div class="title">${esc(w.name)}</div><div class="small muted">${w.kind === "pj" ? "Empresa" : "Pessoa/família"}${w.document ? " · " + esc(w.document) : ""}</div></div>
        <button type="button" class="btn small ghost" data-co-open="${w.id}">Abrir</button><button type="button" class="btn small ghost" data-co-edit="${w.id}">Editar</button><button type="button" class="btn small danger" data-co-del="${w.id}">Excluir</button></div>`).join("") || '<div class="empty">Nenhuma empresa cadastrada.</div>'}</div></div>
    <div class="card"><h2>Notificações</h2>
      ${state.user.email_enabled ? "" : `<p class="small imp-warn">O envio de e-mail ainda não está ligado no servidor. As preferências ficam salvas e passam a valer quando ele for configurado.</p>`}
      <label class="check"><input type="checkbox" id="nAlerts" ${state.user.email_alerts ? "checked" : ""}> Avisos importantes por e-mail (orçamento perto do limite, conta vencendo, saldo negativo, prazo pra cancelar contrato)</label>
      <label>Resumo semanal por e-mail<select id="nDigest"><option value="weekly" ${state.user.email_digest === "weekly" ? "selected" : ""}>Toda segunda, às 7h</option><option value="none" ${state.user.email_digest === "none" ? "selected" : ""}>Não quero</option></select></label>
      <p class="small muted">Vai para ${esc(state.user.email)}. Os avisos também aparecem no sininho do app.</p>
      <div class="row" style="gap:8px"><button class="btn primary" id="saveNotif" type="button">Salvar notificações</button>${state.user.email_enabled ? '<button class="btn ghost" id="testDigest" type="button">Enviar resumo agora</button>' : ""}</div></div>
    <div class="card" id="waCard"><h2>WhatsApp</h2><p class="small muted">Carregando…</p></div>
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
  $("#newCompany").onclick = () => companyForm();
  const coOf = (id) => state.user.workspaces.find((w) => w.id == id);
  v.querySelectorAll("[data-co-open]").forEach((b) => (b.onclick = () => switchWorkspace(+b.dataset.coOpen)));
  v.querySelectorAll("[data-co-edit]").forEach((b) => (b.onclick = () => companyForm(coOf(b.dataset.coEdit))));
  v.querySelectorAll("[data-co-del]").forEach((b) => (b.onclick = async () => {
    const w = coOf(b.dataset.coDel);
    if (!await askConfirm({ title: `Excluir ${w.name}?`, message: "Apaga a empresa e TODOS os dados dela: contas, lançamentos, cartões, contratos, investimentos e relatórios. Não dá pra desfazer.", confirmLabel: "Excluir empresa", danger: true, requireText: "EXCLUIR" })) return;
    await api(`/companies/${w.id}`, { method: "DELETE" });
    if (state.user.workspace_id === w.id) localSet("finora_ws", null);
    state.user = await api("/me"); renderWorkspaceSelect(); await refreshRefs(); buildNav(); route();
    toast("Empresa excluída", "success");
  }));
  $("#saveNotif").onclick = async () => {
    state.user = await api("/me", { method: "PATCH", body: { email_alerts: $("#nAlerts").checked, email_digest: $("#nDigest").value } });
    toast("Notificações salvas", "success");
  };
  if ($("#testDigest")) $("#testDigest").onclick = async () => {
    const b = $("#testDigest"); b.disabled = true; b.classList.add("loading");
    try { const r = await api("/me/digest-test", { method: "POST" }); toast(`Resumo enviado para ${r.to}`, "success"); }
    catch (e) { toast(e.message, "error"); }
    finally { b.disabled = false; b.classList.remove("loading"); }
  };
  $("#delMe").onclick = async () => {
    if (!await askConfirm({ title: "Excluir sua conta definitivamente?", message: "Todos os seus dados — contas, lançamentos, comprovantes e metas — serão apagados. Exporte antes se quiser guardar uma cópia.", confirmLabel: "Excluir minha conta", danger: true, requireText: "EXCLUIR" })) return;
    await api("/me", { method: "DELETE" }); logout();
  };
  wireSharedAccessCard(v);
  renderWhatsAppCard();
};

/* Nora no WhatsApp: gera o código, a pessoa manda "FINORA <código>" do celular e o número
   que enviou fica ligado à conta (o vínculo só existe depois dessa mensagem). */
async function renderWhatsAppCard() {
  const card = $("#waCard");
  if (!card) return;
  let st;
  try { st = await api("/whatsapp"); } catch { card.remove(); return; }
  const intro = `<p class="small muted">Converse com a Nora pelo WhatsApp: pergunte o saldo, o que vence na semana ou mande “gastei 35 na padaria” que ela lança.</p>`;
  if (!st.enabled) {
    card.innerHTML = `<h2>WhatsApp</h2>${intro}<p class="small imp-warn">A integração ainda não está ligada no servidor.</p>`;
    return;
  }
  if (st.linked) {
    card.innerHTML = `<h2>WhatsApp</h2>${intro}<div class="li"><div class="grow"><div class="title">Conectado</div><div class="small muted">${esc(st.phone)}</div></div>
      <button type="button" class="btn small danger" id="waUnlink">Desconectar</button></div>`;
    $("#waUnlink").onclick = async () => {
      if (!await askConfirm({ title: "Desconectar o WhatsApp?", message: "A Nora para de responder nesse número até você conectar de novo.", confirmLabel: "Desconectar", danger: true })) return;
      await api("/whatsapp", { method: "DELETE" }); toast("WhatsApp desconectado", "success"); renderWhatsAppCard();
    };
    return;
  }
  card.innerHTML = `<h2>WhatsApp</h2>${intro}<div id="waCode"></div>
    <div class="row" style="gap:8px"><button type="button" class="btn primary" id="waGen">Conectar WhatsApp</button></div>`;
  $("#waGen").onclick = async () => {
    const b = $("#waGen"); b.disabled = true;
    try {
      const r = await api("/whatsapp/link-code", { method: "POST" });
      const link = r.bot_number ? `https://wa.me/${encodeURIComponent(r.bot_number)}?text=${encodeURIComponent(r.message)}` : "";
      $("#waCode").innerHTML = `<p>Mande esta mensagem do seu WhatsApp${r.bot_number ? "" : " para o número da Nora"}:</p>
        <p class="title" style="font-size:1.4em;letter-spacing:.08em">${esc(r.message)}</p>
        <p class="small muted">Vale por 15 minutos. Depois de mandar, toque em “Já mandei”.</p>
        <div class="row" style="gap:8px">${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>` : ""}<button type="button" class="btn ghost" id="waCheck">Já mandei</button></div>`;
      b.parentElement.remove();
      $("#waCheck").onclick = async () => {
        const s = await api("/whatsapp");
        if (s.linked) { toast("WhatsApp conectado", "success"); renderWhatsAppCard(); }
        else toast("Ainda não recebi. A Nora responde uns segundos depois da mensagem.", "info");
      };
    } catch (e) { toast(e.message, "error"); b.disabled = false; }
  };
}

VIEWS.admin = async (v) => {
  const renderList = async (q) => {
    const users = await api("/admin/users" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    $("#adminUsers").innerHTML = users.map((u) => `
      <div class="li" style="display:block">
        <div class="between">
          <div class="grow">
            <div class="title">${esc(u.name)} ${u.is_admin ? '<span class="chip c-violet">admin</span>' : ""}${u.suspended_at ? '<span class="chip c-red">suspenso</span>' : ""}</div>
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
      if (!await askConfirm({ title: "Resetar o MFA desse usuário?", message: "Ele vai precisar configurar um novo autenticador no próximo login.", confirmLabel: "Resetar MFA", danger: true })) return;
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
        apAddMsg("Oi! Eu sou a Nora, sua assistente no Finora. Posso lançar gastos, criar metas, te levar pra qualquer tela ou explicar como usar qualquer função — é só perguntar.", "bot");
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
// sw.js com a versão na URL: o Cloudflare guarda .js por 4 h, então sem isso o SW velho
// (e o cache dele) sobrevive ao deploy. updateViaCache "none" ignora o cache HTTP na checagem.
if ("serviceWorker" in navigator) navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(BUILD)}`, { updateViaCache: "none" }).catch(() => {});

// qualquer erro inesperado no início mostra a tela de login com o aviso, nunca a página em branco
initAuth().catch((e) => { showAuth(); $("#authError").textContent = "Erro ao iniciar: " + (e?.message || e); });
initAssistant();
