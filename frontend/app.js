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

/* ------------------------------------------------------------------ aparência (claro/escuro/automático) */
const THEME_ORDER = ["light", "dark", "auto"];
const THEME_ICON = { light: "☀️", dark: "🌙", auto: "🖥️" };
const THEME_LABEL = { light: "Claro", dark: "Escuro", auto: "Automático (sistema)" };
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  const btn = $("#themeBtn");
  if (btn) btn.textContent = THEME_ICON[mode] || THEME_ICON.auto;
  if (btn) btn.title = `Aparência: ${THEME_LABEL[mode] || THEME_LABEL.auto} — clique para trocar`;
}
function setTheme(mode) { localSet("finora_theme", mode); applyTheme(mode); }
applyTheme(localGet("finora_theme") || "auto");
$("#themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme || "auto";
  setTheme(THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length]);
};

const KINDS = { checking: "Conta corrente", savings: "Poupança", investment: "Investimentos", cash: "Dinheiro", credit_card: "Cartão de crédito" };
const INCOME_KINDS = { salary: "Salário", freelance: "Freelance/serviços", rent: "Aluguel recebido", dividends: "Dividendos", other: "Outra" };

const ROUTES = [
  { id: "dashboard", label: "Painel", icon: "📊", mobile: true },
  { id: "transactions", label: "Lançamentos", icon: "🧾", mobile: true },
  { id: "cards", label: "Cartões", icon: "💳", mobile: true },
  { id: "accounts", label: "Contas", icon: "🏦" },
  { id: "contracts", label: "Contratos e fixas", icon: "📄" },
  { id: "incomes", label: "Renda", icon: "💰" },
  { id: "categories", label: "Categorias e regras", icon: "🏷️" },
  { id: "goals", label: "Metas", icon: "🎯" },
  { id: "advisor", label: "Consultor", icon: "🧠", mobile: true },
  { id: "market", label: "Mercado e simulador", icon: "📈" },
  { id: "bank", label: "Conexões bancárias", icon: "🔗" },
  { id: "settings", label: "Configurações", icon: "⚙️" },
];

/* ------------------------------------------------------------------ API */
async function api(path, opts = {}) {
  const headers = { ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}) };
  if (state.token) headers.Authorization = "Bearer " + state.token;
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
let authMode = "login";
$("#authTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  authMode = b.dataset.mode;
  document.querySelectorAll("#authTabs button").forEach((x) => x.classList.toggle("active", x === b));
  $("#auth").classList.toggle("register", authMode === "register");
  $("#authForm button[type=submit]").textContent = authMode === "login" ? "Entrar" : "Criar conta";
});
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = { email: f.get("email"), password: f.get("password") };
  if (authMode === "register") Object.assign(body, { name: f.get("name"), lgpd_consent: f.get("lgpd_consent") === "on" });
  const btn = $("#authForm button[type=submit]");
  btn.disabled = true; btn.classList.add("loading");
  try {
    const r = await api("/auth/" + authMode, { body });
    state.token = r.token; localSet("finora_token", r.token); boot();
  } catch (err) { $("#authError").textContent = err.message; shakeEl(".auth-card"); }
  finally { btn.disabled = false; btn.classList.remove("loading"); }
});
function logout() { state.token = null; localSet("finora_token", null); location.hash = ""; showAuth(); }
$("#logout").onclick = logout;
function showAuth() {
  $("#app").classList.add("hidden"); $("#auth").classList.remove("hidden");
  startAuthCanvas();
  if (window.gsap && !reducedMotion()) {
    gsap.fromTo("#auth .auth-card", { autoAlpha: 0, y: 16, scale: .98 },
      { autoAlpha: 1, y: 0, scale: 1, duration: MOTION.slow, ease: MOTION.ease });
  }
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

async function initGoogleAuth() {
  try {
    const { google_client_id } = await api("/public-config");
    if (!google_client_id) return;
    await loadScript(GOOGLE_IDENTITY_SRC);
    window.google.accounts.id.initialize({
      client_id: google_client_id,
      callback: async ({ credential }) => {
        try {
          const r = await api("/auth/google", { body: { credential } });
          state.token = r.token; localSet("finora_token", r.token); boot();
        } catch (e) { $("#authError").textContent = e.message; }
      },
    });
    $("#googleAuth").classList.remove("hidden");
    window.google.accounts.id.renderButton($("#googleBtn"), { theme: "outline", size: "large", width: 320, locale: "pt-BR" });
  } catch { /* Google indisponível: segue só com e-mail/senha */ }
}

/* ------------------------------------------------------------------ shell */
function buildNav() {
  $("#nav").innerHTML = ROUTES.map((r) => `<a class="nav-item" href="#${r.id}" data-r="${r.id}"><span>${r.icon}</span>${r.label}</a>`).join("");
  $("#bottomNav").innerHTML = ROUTES.filter((r) => r.mobile).map((r) => `<a href="#${r.id}" data-r="${r.id}"><span>${r.icon}</span>${r.label}</a>`).join("")
    + `<a href="#more" data-r="more"><span>☰</span>Mais</a>`;
}
async function boot() {
  try { state.user = await api("/me"); } catch { return showAuth(); }
  $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#userName").textContent = state.user.name;
  if (!$("#monthRef").value) $("#monthRef").value = today().slice(0, 7);
  buildNav(); await refreshRefs(); route();
  if (!state.user.onboarded) startOnboarding();
  apCheckNudges();
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
  const r = ROUTES.find((x) => x.id === id) || (id === "more" ? { id: "more", label: "Menu" } : ROUTES[0]);
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
  v.innerHTML = `<div class="card list">${ROUTES.map((r) => `<a class="li" style="text-decoration:none;color:inherit" href="#${r.id}"><span>${r.icon}</span><div class="grow title">${r.label}</div><span class="muted">›</span></a>`).join("")}
  <a class="li" style="text-decoration:none;color:inherit" href="#" onclick="logout();return false"><span>🚪</span><div class="grow title">Sair</div></a></div>`;
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
  ${empty ? `<div class="card" style="margin-bottom:16px"><h2>Bem-vindo ao Finora 👋</h2><p class="muted">Comece em 3 passos: <a href="#bank">conecte seus bancos</a> ou <a href="#accounts">cadastre contas e cartões</a>, informe sua <a href="#incomes">renda</a> e seus <a href="#contracts">contratos e contas fixas</a>.</p></div>` : ""}
  <div class="grid g4 keep2">
    <div class="card stat hero"><h3>Patrimônio líquido</h3><div class="value" data-count="${d.net_worth}">${brl(d.net_worth)}</div><div class="sub">Saldo ${brl(d.cash)} · Invest. ${brl(d.investments)}</div></div>
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
    <div class="card"><h2>Metas</h2><div class="list">${d.goals.map((g) => `<div class="li" style="display:block"><div class="between"><strong>${esc(g.name)}</strong><span class="small">${brl(g.current)} / ${brl(g.target)}</span></div><div class="bar"><i style="${barFill(pct(g.current, g.target))}"></i></div></div>`).join("") || '<div class="empty"><a href="#goals">Crie uma meta</a> para acompanhar sua evolução.</div>'}</div></div>
  </div>
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
  v.innerHTML = `<div class="between" style="margin-bottom:14px"><p class="muted" style="margin:0">${intro}</p><button class="btn" id="newItem">${newLabel}</button></div>
  <div class="card"><div class="list">${items.map((it, i) => `<div class="li clickable" data-i="${i}" style="cursor:pointer">${render(it)}</div>`).join("") || `<div class="empty">${empty}</div>`}</div></div>`;
  $("#newItem").onclick = () => onNew();
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
  const items = await api("/goals");
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
        <strong>${s.done ? "✅ " : ""}${esc(s.title)}</strong>
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

VIEWS.settings = async (v) => {
  const theme = document.documentElement.dataset.theme || "auto";
  v.innerHTML = `<div class="grid g2"><div class="card"><h2>Perfil</h2>
    <label>Nome<input id="pn" value="${esc(state.user.name)}"></label>
    <label>E-mail<input value="${esc(state.user.email)}" disabled></label>
    <label>Meta de economia mensal (R$)<input id="pg" type="number" value="${state.user.monthly_goal_savings || 0}"></label>
    <button class="btn primary full" id="saveMe">Salvar</button>
    <h2 style="margin-top:22px">Aparência</h2>
    <div class="tabs" id="themeTabs">${THEME_ORDER.map((m) => `<button type="button" data-mode="${m}" class="${m === theme ? "active" : ""}">${THEME_ICON[m]} ${THEME_LABEL[m].split(" (")[0]}</button>`).join("")}</div></div>
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
};

/* ------------------------------------------------------------------ assistente de primeiro acesso */
const OB_STEPS = [
  {
    icon: "👋", title: "Bem-vindo ao Finora",
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
    icon: "🏦", title: "Sua primeira conta ou cartão",
    text: "Assim já conseguimos calcular saldo, fatura e alertas pra você.",
    fields: [
      { name: "name", label: "Nome", placeholder: "Ex.: Nubank, Itaú, Carteira" },
      { name: "kind", label: "Tipo", type: "select", options: Object.entries(KINDS) },
    ],
    submit: async (d) => { if (d.name) { await api("/accounts", { body: { name: d.name, kind: d.kind || "checking" } }); await refreshRefs(); } },
  },
  {
    icon: "💰", title: "Sua renda mensal",
    text: "Usamos isso pra projetar o mês e calcular sua taxa de poupança.",
    fields: [
      { name: "name", label: "Fonte de renda", placeholder: "Ex.: Salário" },
      { name: "net_amount", label: "Valor líquido mensal (R$)", type: "number" },
    ],
    submit: async (d) => { if (+d.net_amount > 0) await api("/incomes", { body: { name: d.name || "Salário", net_amount: +d.net_amount } }); },
  },
  {
    icon: "🎯", title: "Uma meta pra economizar",
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
    <div class="ob-icon">${step.icon}</div>
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
const AP_FORMS = { transaction: txForm, account: accountForm, contract: contractForm, goal: goalForm, income: incomeForm };
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
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

state.token ? boot() : showAuth();
initGoogleAuth();
initAssistant();
