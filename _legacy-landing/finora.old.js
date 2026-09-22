// Landing pública do Finora — sem dependência do app.js do painel (SPA separada).

// Se já existe uma sessão salva neste navegador, não faz sentido mostrar a landing —
// manda direto pro painel. Checagem simples de localStorage, sem custo de rede.
try {
  if (localStorage.getItem("finora_token")) location.replace("/app");
} catch { /* localStorage indisponível (modo privado etc.) — segue mostrando a landing */ }

// abertura: cortina sobe na primeira carga (não repete em navegação por âncora)
const cortina = document.querySelector(".cortina");
if (cortina) {
  requestAnimationFrame(() => cortina.classList.add("pronta"));
  window.addEventListener("load", () => {
    setTimeout(() => cortina.classList.add("saiu"), 550);
  });
}

// notas à margem aparecem conforme o scroll
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add("visivel"); io.unobserve(e.target); }
}), { threshold: .6 });
document.querySelectorAll(".nota, .fala").forEach((n) => io.observe(n));

// índice marca a seção atual
const links = [...document.querySelectorAll(".indice a[href^='#']")];
const so = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) links.forEach((a) => a.toggleAttribute("aria-current", a.hash === "#" + e.target.id));
}), { threshold: .4 });
document.querySelectorAll("main section[id]").forEach((s) => so.observe(s));

// fecha o índice no mobile para não cobrir o texto
if (matchMedia("(max-width:760px)").matches) {
  const det = document.querySelector(".indice");
  if (det) det.open = false;
}

// formulário de acesso antecipado
const form = document.querySelector(".form-acesso");
if (form) {
  const emailInput = form.querySelector("input[name=email]");
  const btn = form.querySelector("button[type=submit]");
  const msg = form.querySelector(".msg-acesso");
  const setMsg = (text, tipo) => {
    msg.textContent = text || "";
    if (tipo) msg.dataset.tipo = tipo; else delete msg.dataset.tipo;
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) { setMsg("Digite um e-mail.", "erro"); emailInput.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg("Esse e-mail não parece válido.", "erro"); emailInput.focus(); return; }
    btn.disabled = true;
    setMsg("Enviando…");
    try {
      const res = await fetch("/api/acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMsg("Pedido recebido — avisamos você por e-mail assim que liberar.", "ok");
        form.reset();
      } else {
        setMsg(data.erro || "Não consegui registrar seu pedido agora. Tenta de novo em instantes.", "erro");
      }
    } catch {
      setMsg("Falha de conexão — confira sua internet e tenta de novo.", "erro");
    } finally {
      btn.disabled = false;
    }
  });
}
