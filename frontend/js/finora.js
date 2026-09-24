/* =====================================================================
   FINORA LANDING — JS isolado (sem dependências)
   Cabeçalho fixo, menu mobile, abas do FAQ e o sistema de movimento:
   a mascote Nora, a coreografia do hero, revelações por seção e a
   conversa animada do assistente.
   data-login no #finora-landing define o destino de "Acessar conta".

   Identidade de movimento (ver DESIGN.md):
   • UI  — "Corporate": expo-out cubic-bezier(.16,1,.3,1), 200/400/700ms.
   • Nora — "Playful": back-out cubic-bezier(.34,1.56,.64,1), com quique.
   Tudo respeita prefers-reduced-motion (estado final, sem movimento).
   ===================================================================== */
(function () {
  "use strict";
  const root = document.getElementById("finora-landing");
  if (!root) return;
  const $ = (q, c = root) => c.querySelector(q), $$ = (q, c = root) => [...c.querySelectorAll(q)];
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const temIO = "IntersectionObserver" in window;

  /* links de entrada */
  $$("[data-entrar]").forEach((a) => a.setAttribute("href", root.dataset.login || "/app/"));

  /* cabeçalho: compacta ao rolar e mostra o progresso de leitura */
  const cab = $(".cab");
  let rafCab = 0;
  const onScroll = () => {
    cancelAnimationFrame(rafCab);
    rafCab = requestAnimationFrame(() => {
      cab.classList.toggle("rolou", scrollY > 8);
      const total = document.documentElement.scrollHeight - innerHeight;
      cab.style.setProperty("--lido", total > 0 ? Math.min(1, scrollY / total).toFixed(4) : 0);
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true }); onScroll();

  /* menu mobile */
  const btn = $(".menu-btn"), menu = $("#menu");
  const fecha = () => { menu.classList.remove("aberto"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Abrir menu"); };
  btn.addEventListener("click", () => {
    const abre = !menu.classList.contains("aberto");
    menu.classList.toggle("aberto", abre);
    btn.setAttribute("aria-expanded", String(abre)); btn.setAttribute("aria-label", abre ? "Fechar menu" : "Abrir menu");
  });
  $$("a", menu).forEach((a) => a.addEventListener("click", fecha));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("aberto")) { fecha(); btn.focus(); } });

  /* menu marca a seção atual */
  const secoes = $$("a[href^='#']", menu).map((a) => [a, document.querySelector(a.getAttribute("href"))]).filter(([, s]) => s);
  if ("IntersectionObserver" in window) {
    const ioNav = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      secoes.forEach(([a, s]) => a.setAttribute("aria-current", String(s === e.target)));
    }), { rootMargin: "-45% 0px -50% 0px" });
    secoes.forEach(([, s]) => ioNav.observe(s));
  }

  /* CTA fixo no celular: aparece depois do topo, some na chamada final e no rodapé */
  const ctaMovel = $(".cta-movel"), heroEl = $(".hero"), fim = $(".cta-final"), rod = root.querySelector(".rodape");
  if (ctaMovel && "IntersectionObserver" in window) {
    const vis = new Map();
    const atualiza = () => ctaMovel.classList.toggle("on", !vis.get(heroEl) && !vis.get(fim) && !vis.get(rod));
    const ioCta = new IntersectionObserver((es) => { es.forEach((e) => vis.set(e.target, e.isIntersecting)); atualiza(); });
    [heroEl, fim, rod].forEach((el) => el && ioCta.observe(el));
  }

  /* compatibilidade com links antigos (#acesso, #consultor…) */
  const antigos = { "#acesso": "#planos", "#consultor": "#nora", "#automacoes": "#nora", "#contas": "#parcelas", "#extrato": "#parcelas", "#recursos": "#parcelas", "#como-resolve": "#parcelas", "#como-funciona": "#topo" };
  const novo = antigos[location.hash];
  if (novo) {
    history.replaceState(null, "", novo);
    addEventListener("load", () => document.querySelector(novo)?.scrollIntoView());
  }

  /* ------------------------------------------------------------------
     NORA — a mascote. É o próprio ícone "F" da marca ganhando corpo:
     o quadrado arredondado em degradê, a bolinha ciano virando antena.
     Desenhada em SVG aqui (uma fonte só para todas as aparições).
     ------------------------------------------------------------------ */
  let noraN = 0;
  function nora(pose) {
    const id = "noraG" + (++noraN);
    const moeda = pose === "pula"
      ? `<g class="n-moeda"><circle cx="134" cy="58" r="15" fill="#fbbf24"/><circle cx="134" cy="58" r="10.5" fill="none" stroke="#b45309" stroke-width="2.5"/><path d="M134 51v14M130.5 54.5h5a2.5 2.5 0 0 1 0 5h-3a2.5 2.5 0 0 0 0 5h5" fill="none" stroke="#b45309" stroke-width="2.2" stroke-linecap="round"/></g>` : "";
    return `<svg class="nora nora-${pose}" viewBox="0 0 160 170" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#4f46e5"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs>
      <ellipse class="n-sombra" cx="80" cy="160" rx="36" ry="6" fill="#15133a" opacity=".16"/>
      <g class="n-tudo">
        <g class="n-antena"><path d="M80 36 Q83 22 93 15" fill="none" stroke="#312e81" stroke-width="4.5" stroke-linecap="round"/><circle cx="94" cy="14" r="8" fill="#67e8f9"/><circle cx="91.5" cy="11.5" r="2.4" fill="#fff" opacity=".8"/></g>
        <path class="n-braco-e" d="M34 100 q-16 6 -18 22" fill="none" stroke="#4338ca" stroke-width="10" stroke-linecap="round"/>
        <g class="n-braco-d"><path d="M126 96 q18 -6 22 -26" fill="none" stroke="#0e7490" stroke-width="10" stroke-linecap="round"/>${moeda}</g>
        <ellipse cx="60" cy="143" rx="13" ry="7" fill="#312e81"/><ellipse cx="100" cy="143" rx="13" ry="7" fill="#312e81"/>
        <rect x="30" y="36" width="100" height="104" rx="32" fill="url(#${id})"/>
        <path d="M44 52 q10 -9 26 -9" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="5" stroke-linecap="round"/>
        <g class="n-olhos">
          <ellipse cx="62" cy="80" rx="12" ry="14" fill="#fff"/><ellipse cx="98" cy="80" rx="12" ry="14" fill="#fff"/>
          <g class="n-pupilas"><circle cx="64" cy="82" r="6.5" fill="#15133a"/><circle cx="100" cy="82" r="6.5" fill="#15133a"/><circle cx="66.5" cy="79" r="2.2" fill="#fff"/><circle cx="102.5" cy="79" r="2.2" fill="#fff"/></g>
        </g>
        <ellipse cx="48" cy="101" rx="7.5" ry="4.5" fill="#f9a8d4" opacity=".75"/><ellipse cx="112" cy="101" rx="7.5" ry="4.5" fill="#f9a8d4" opacity=".75"/>
        <path class="n-boca" d="M70 102 q10 11 20 0" fill="none" stroke="#15133a" stroke-width="4.5" stroke-linecap="round"/>
      </g>
    </svg>`;
  }
  $$("[data-nora]").forEach((el) => el.insertAdjacentHTML("afterbegin", nora(el.dataset.nora)));

  if (reduz) return; // daqui pra baixo é só movimento
  document.documentElement.classList.add("js-anim");

  /* olhos da Nora do hero seguem o cursor (no máximo 3.5px, com rAF) */
  const noraHero = $(".nora-hero");
  if (noraHero) {
    const pup = $(".n-pupilas", noraHero); let raf = 0, alvo = [0, 0];
    addEventListener("pointermove", (e) => {
      const r = noraHero.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * .45);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      alvo = [dx / d * 3.5 * k, dy / d * 3.5 * k];
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => (pup.style.transform = `translate(${alvo[0]}px,${alvo[1]}px)`));
    }, { passive: true });
    // clicar/tocar na Nora: ela dá um pulinho e acena de novo
    noraHero.closest("[data-nora]").addEventListener("click", () => {
      const w = noraHero.closest("[data-nora]");
      w.classList.remove("festa"); void w.offsetWidth; w.classList.add("festa");
    });
  }

  /* contadores (valores em pt-BR; data-conta = alvo, data-dec = casas) */
  const fmt = (v, dec) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function conta(el, dur = 1100) {
    const alvo = parseFloat(el.dataset.conta), dec = +(el.dataset.dec || 0), suf = el.dataset.suf || "";
    const pre = (el.dataset.pre || "").replace(/ /g, " "); // "R$ 1,00" nunca quebra linha
    const t0 = performance.now();
    (function passo(t) {
      const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 4);
      el.textContent = pre + fmt(alvo * k, dec) + suf;
      if (p < 1) requestAnimationFrame(passo);
    })(t0);
  }

  /* hero: coreografia de entrada no carregamento (não depende de rolagem) */
  const hero = $(".hero");
  requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add("entra")));
  setTimeout(() => $$(".hero [data-conta]").forEach((el) => conta(el, 1200)), 650);
  const noraBalao = $(".nora-balao");
  if (noraBalao) {
    setTimeout(() => noraBalao.classList.add("on"), 2300);
    setTimeout(() => noraBalao.classList.remove("on"), 7800);
  }

  /* movimento que responde ao ponteiro e à rolagem — só com mouse e tela larga.
     No celular não há paralaxe (motion-design: evitar em telas pequenas). */
  const fino = matchMedia("(hover:hover) and (pointer:fine) and (min-width:961px)");
  const vis = $("[data-tilt]");
  if (vis) {
    // o painel do hero inclina na direção do cursor; alerta e Nora andam em camadas opostas
    let ax = 0, ay = 0, x = 0, y = 0, anda = false;
    const passo = () => {
      x += (ax - x) * .1; y += (ay - y) * .1;
      vis.style.setProperty("--px", x.toFixed(3)); vis.style.setProperty("--py", y.toFixed(3));
      if (Math.abs(ax - x) > .002 || Math.abs(ay - y) > .002) requestAnimationFrame(passo); else anda = false;
    };
    const vai = () => { if (!anda) { anda = true; requestAnimationFrame(passo); } };
    addEventListener("pointermove", (e) => {
      if (!fino.matches || e.pointerType !== "mouse") return;
      const r = vis.getBoundingClientRect();
      if (r.bottom < 0) return;
      const lim = (v) => Math.max(-1, Math.min(1, v));
      ax = lim((e.clientX - (r.left + r.width / 2)) / (r.width * .75));
      ay = lim((e.clientY - (r.top + r.height / 2)) / (r.height * .75));
      vai();
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { ax = ay = 0; vai(); });
  }
  // paralaxe leve na rolagem (< 40px): a vitrine da fatura flutua um pouco mais devagar
  const camadas = [[$(".fatura"), .07], [vis, .06]].filter(([el]) => el);
  let rafPar = 0;
  const paralaxe = () => {
    cancelAnimationFrame(rafPar);
    rafPar = requestAnimationFrame(() => camadas.forEach(([el, k]) => {
      if (!fino.matches) { el.style.translate = ""; return; }
      const r = el.parentElement.getBoundingClientRect();
      const off = Math.max(-40, Math.min(40, (r.top + r.height / 2 - innerHeight / 2) * -k));
      el.style.translate = `0 ${off.toFixed(1)}px`;
    }));
  };
  addEventListener("scroll", paralaxe, { passive: true });
  fino.addEventListener?.("change", paralaxe); paralaxe();

  /* os chips de alerta ganham um índice para a cascata */
  $$(".chips li").forEach((li, i) => li.style.setProperty("--n", i));

  if (!temIO) { $$("[data-cena]").forEach((c) => c.classList.add("on")); return; }

  /* revelação por cena: cada seção marcada com data-cena ganha .on ao entrar na tela;
     o CSS decide a coreografia específica de cada uma (e o stagger via --i). */
  $$("[data-cena]").forEach((cena) => {
    const filhos = $$("[data-i]", cena);
    filhos.forEach((f, i) => f.style.setProperty("--i", f.dataset.i || i));
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const c = e.target; c.classList.add("on"); io.unobserve(c);
    $$("[data-conta]", c).forEach((el) => conta(el));
  }), { threshold: .22, rootMargin: "0px 0px -8% 0px" });
  $$("[data-cena]").forEach((c) => io.observe(c));

  /* a conversa do assistente acontece mensagem por mensagem; a Nora do cabeçalho
     "fala" (balança) a cada resposta dela */
  const chat = $("#chat");
  if (chat) {
    const msgs = $$(".msg", chat), avatar = $(".cf-nora");
    root.classList.add("js-chat");
    const digitando = document.createElement("li");
    digitando.className = "digitando"; digitando.setAttribute("aria-hidden", "true");
    digitando.innerHTML = "<i></i><i></i><i></i>";
    const fala = () => { if (!avatar) return; avatar.classList.remove("fala"); void avatar.offsetWidth; avatar.classList.add("fala"); };
    const toca = () => {
      let t = 200;
      msgs.forEach((m) => {
        const dela = !m.classList.contains("eu");
        if (dela) { setTimeout(() => m.before(digitando), t); t += 700; }
        setTimeout(() => { digitando.remove(); m.classList.add("on"); if (dela) fala(); }, t);
        t += dela ? 900 : 650;
      });
    };
    const ioc = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      ioc.disconnect(); toca();
    }, { threshold: .35 });
    ioc.observe(chat);
  }
})();
