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

  /* ------------------------------------------------------------------
     NORA GUIA — desce a página junto com a pessoa. Cada seção com
     data-guia é uma parada: ela salta em arco até o lado indicado
     (data-lado), aterrissa com squash e comenta num balão. Enquanto a
     página rola, dá passinhos, inclina na direção do movimento e
     atrasa como uma mola. Sai de cena na chamada final (a Nora de lá
     assume). No celular fica sempre no canto, só saltitando no lugar.
     ------------------------------------------------------------------ */
  const guia = $(".guia");
  if (guia && temIO && "animate" in guia) {
    const pulo = $(".guia-pulo", guia), mola = $(".guia-mola", guia), balao = $(".guia-balao", guia);
    const largo = matchMedia("(min-width:961px)");
    let lado = "d", xAtual = 0, parada = null, visivel = false, tBalao = 0;
    const margem = () => (largo.matches ? 28 : 10);
    const posX = (l) => (largo.matches && l === "e" ? margem() : document.documentElement.clientWidth - margem() - guia.offsetWidth);
    const viraPara = (l) => guia.classList.toggle("lado-d", l === "d" || !largo.matches);
    const fixaX = (x) => { xAtual = x; guia.style.transform = `translateX(${x}px)`; };
    const fala = (txt, espera = 0) => {
      clearTimeout(tBalao); balao.classList.remove("on");
      tBalao = setTimeout(() => {
        balao.textContent = txt; balao.classList.add("on");
        tBalao = setTimeout(() => balao.classList.remove("on"), 3400);
      }, espera);
    };
    const gesto = (g) => { if (g !== "acena") return; guia.classList.remove("acena"); void guia.offsetWidth; guia.classList.add("acena"); };

    // salto em arco: X anda com ease-in-out, Y sobe desacelerando e desce acelerando
    function salta(novoLado, depois) {
      const x0 = xAtual, x1 = posX(novoLado), longe = Math.abs(x1 - x0) > 40;
      const d = longe ? 950 : 520, alto = longe ? -130 : -34;
      lado = novoLado; viraPara(lado);
      if (longe) {
        const a = guia.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }],
          { duration: d * .76, delay: d * .12, easing: "cubic-bezier(.45,0,.55,1)", fill: "both" });
        a.onfinish = () => { fixaX(x1); a.cancel(); };
      } else fixaX(x1);
      pulo.animate([
        { transform: "none", easing: "ease-out" },
        { transform: "translateY(4px) scale(1.14,.84)", offset: .12, easing: "cubic-bezier(.2,.7,.4,1)" },
        { transform: `translateY(${alto}px) scale(.93,1.08)`, offset: .5, easing: "cubic-bezier(.6,0,.8,.4)" },
        { transform: "translateY(3px) scale(1.14,.85)", offset: .88, easing: "ease-out" },
        { transform: "none" }
      ], { duration: d });
      if (depois) setTimeout(depois, d * .9);
    }

    function entra() {
      if (visivel) return; visivel = true;
      lado = largo.matches ? parada.dataset.lado || "d" : "d";
      fixaX(posX(lado)); viraPara(lado);
      guia.classList.add("on");
      pulo.animate([
        { transform: "translateY(-90px) scale(.9,1.08)", opacity: 0 },
        { transform: "translateY(0) scale(1.14,.86)", opacity: 1, offset: .5 },
        { transform: "translateY(-12px) scale(.97,1.04)", offset: .72 },
        { transform: "none", opacity: 1 }
      ], { duration: 850, easing: "cubic-bezier(.16,1,.3,1)" });
      if (parada) fala(parada.dataset.guia, 700);
    }
    function sai() {
      if (!visivel) return; visivel = false;
      clearTimeout(tBalao); balao.classList.remove("on");
      pulo.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(-18px) scale(.95,1.05)", offset: .35 }, { transform: "translateY(60px) scale(.8)", opacity: 0 }],
        { duration: 480, easing: "cubic-bezier(.5,0,.75,0)" }).onfinish = () => { if (!visivel) guia.classList.remove("on"); };
    }

    // paradas: a seção que está no meio da tela manda
    const ioParada = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting || e.target === parada) return;
      parada = e.target;
      if (!visivel) return avalia();
      const novo = largo.matches ? parada.dataset.lado || "d" : "d";
      salta(novo, () => { fala(parada.dataset.guia); gesto(parada.dataset.gesto); });
    }), { rootMargin: "-45% 0px -45% 0px" });
    $$("[data-guia]").forEach((s) => ioParada.observe(s));

    // aparece depois do topo (a Nora do hero sai de cena) e some na chamada final e no rodapé
    const vis = new Map(), fimEl = $(".cta-final"), rodEl = root.querySelector(".rodape");
    function avalia() { (!vis.get(heroEl) && !vis.get(fimEl) && !vis.get(rodEl) && parada) ? entra() : sai(); }
    const ioVis = new IntersectionObserver((es) => { es.forEach((e) => vis.set(e.target, e.isIntersecting)); avalia(); });
    [fimEl, rodEl].forEach((el) => el && ioVis.observe(el));
    // o topo só "segura" a guia enquanto ocupa a parte de baixo da tela (sobra de hero não conta)
    if (heroEl) new IntersectionObserver((es) => { es.forEach((e) => vis.set(e.target, e.isIntersecting)); avalia(); },
      { rootMargin: "-40% 0px 0px 0px" }).observe(heroEl);

    // mola: segue a velocidade da rolagem com atraso, inclina e olha pra onde a página vai
    const pup = $(".n-pupilas", guia);
    let yAnt = scrollY, v = 0, pos = 0, vel = 0, parado = 0;
    (function laco() {
      requestAnimationFrame(laco);
      if (!visivel) { yAnt = scrollY; return; }
      const dy = scrollY - yAnt; yAnt = scrollY;
      v += (dy - v) * .25;
      const alvo = Math.max(-22, Math.min(22, v * 1.4));
      vel += (alvo - pos) * .12; vel *= .72; pos += vel;           // mola amortecida
      const incl = Math.max(-11, Math.min(11, v * .7));
      mola.style.transform = `translateY(${pos.toFixed(2)}px) rotate(${incl.toFixed(2)}deg)`;
      if (pup) pup.style.transform = `translateY(${Math.max(-3, Math.min(3, v * .4)).toFixed(2)}px)`;
      if (Math.abs(dy) > .5) { parado = 0; guia.classList.add("corre"); }
      else if (++parado > 9) guia.classList.remove("corre");
    })();

    // clique: pulinho no lugar e repete o comentário
    mola.addEventListener("click", () => { salta(lado); if (parada) fala(parada.dataset.guia, 420); gesto("acena"); });
    addEventListener("resize", () => { if (!largo.matches) lado = "d"; fixaX(posX(lado)); viraPara(lado); }, { passive: true });
  }

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
