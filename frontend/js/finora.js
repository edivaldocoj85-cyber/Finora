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
  const antigos = { "#acesso": "#planos", "#consultor": "#nora", "#automacoes": "#nora", "#contas": "#parcelas", "#extrato": "#parcelas", "#como-resolve": "#parcelas", "#como-funciona": "#topo" };
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

  /* ------------------------------------------------------------------
     CHAT COM A NORA (pré-venda). Abre ao clicar em qualquer Nora da
     página ou nos botões [data-abre-chat]. Pergunta vai para
     /api/vendas/chat; quando a Nora não sabe, oferece mandar a dúvida
     por e-mail já escrita. Fica fora do bloco de movimento: funciona
     também com movimento reduzido.
     ------------------------------------------------------------------ */
  const EMAIL = "finora@gmail.com";
  const at = document.getElementById("atende");
  let abreChat = () => {};
  if (at) {
    const lista = $(".at-msgs", at), sug = $(".at-sug", at), form = $(".at-form", at), campo = $("#at-in", at);
    const conversa = [];   // [{papel: "eu"|"nora", texto}]
    let ocupado = false, voltaFoco = null;
    const esc = (t) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    // texto da Nora: escapa tudo e só então aplica **negrito**, quebras e e-mails como link
    const formata = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>')
      .replace(/\n/g, "<br>");
    const rola = () => { lista.scrollTop = lista.scrollHeight; };
    const mailto = () => {
      const perguntas = conversa.filter((m) => m.papel === "eu").map((m) => "• " + m.texto).join("\n");
      return `mailto:${EMAIL}?subject=${encodeURIComponent("Dúvida sobre a Finora")}&body=${encodeURIComponent("Olá, equipe Finora!\n\nMinha dúvida:\n" + perguntas + "\n\n")}`;
    };
    function balao(papel, texto, email) {
      const li = document.createElement("li");
      li.className = "at-m " + (papel === "eu" ? "eu" : "ela");
      li.innerHTML = papel === "eu" ? esc(texto) : formata(texto);
      if (email) {
        const a = document.createElement("a");
        a.className = "at-email"; a.href = mailto();
        a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>Enviar minha dúvida por e-mail';
        li.appendChild(a);
      }
      lista.appendChild(li); rola();
    }
    function sugere(itens) {
      sug.innerHTML = "";
      (itens || []).slice(0, 3).forEach((t) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = t;
        b.addEventListener("click", () => pergunta(t));
        sug.appendChild(b);
      });
      rola();   // as sugestões mudam a altura da lista: rola de novo pra última mensagem ficar inteira
    }
    async function pergunta(texto) {
      texto = (texto || "").trim().slice(0, 500);
      if (!texto || ocupado) return;
      ocupado = true; sugere([]);
      conversa.push({ papel: "eu", texto }); balao("eu", texto);
      const dig = document.createElement("li");
      dig.className = "at-m ela at-dig"; dig.setAttribute("aria-label", "A Nora está escrevendo");
      dig.innerHTML = "<i></i><i></i><i></i>";
      lista.appendChild(dig); rola();
      let r;
      try {
        const resp = await fetch("/api/vendas/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagens: conversa.slice(-12) }) });
        if (resp.status === 429) r = { resposta: `Recebi muitas mensagens seguidas. Espere alguns minutos ou escreva para **${EMAIL}**.`, email: true };
        else if (!resp.ok) throw new Error(resp.status);
        else r = await resp.json();
      } catch {
        r = { resposta: `Não consegui responder agora. Tente de novo em instantes ou escreva para **${EMAIL}**.`, email: true };
      }
      dig.remove();
      conversa.push({ papel: "nora", texto: r.resposta });
      balao("nora", r.resposta, r.email);
      sugere(r.sugestoes);
      ocupado = false; campo.focus();
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); const t = campo.value; campo.value = ""; pergunta(t); });

    abreChat = () => {
      if (!at.hidden) { campo.focus(); return; }
      voltaFoco = document.activeElement;
      at.hidden = false; root.classList.add("chat-aberto");
      requestAnimationFrame(() => at.classList.add("on"));
      if (!conversa.length) {
        const oi = "Oi! Eu sou a **Nora**, assistente da Finora. Posso explicar como o app funciona, preços, teste grátis, segurança e o que mais você quiser saber. Qual é a sua dúvida?";
        conversa.push({ papel: "nora", texto: oi }); balao("nora", oi);
        sugere(["O que a Finora faz?", "Quanto custa?", "É seguro?"]);
      }
      setTimeout(() => campo.focus(), 60);
    };
    const fechaChat = () => {
      at.classList.remove("on"); root.classList.remove("chat-aberto");
      setTimeout(() => { if (!at.classList.contains("on")) at.hidden = true; }, 220);
      if (voltaFoco && voltaFoco.focus) voltaFoco.focus();
    };
    $("[data-fecha-chat]", at).addEventListener("click", fechaChat);
    at.addEventListener("keydown", (e) => { if (e.key === "Escape") fechaChat(); });
    $$("[data-abre-chat]").forEach((b) => b.addEventListener("click", abreChat));
    // qualquer Nora da página abre o chat (a do hero, a da chamada final e a guia)
    $$('[data-nora="hero"], [data-nora="pula"], .guia-mola').forEach((n) => n.addEventListener("click", abreChat));
  }

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
     NORA GUIA — acompanha a leitura sem roubar a cena. Cada seção com
     data-guia é uma parada: ela some de leve, SURGE discreta no lado
     indicado (data-lado) e, já parada, ENCENA um gesto curto para chamar
     atenção (data-gesto: espia · acena · sim) antes de comentar no balão.
     Se a pessoa fica parada lendo, ela repete o gesto uma vez.
     Sai de cena na chamada final (a Nora de lá assume).
     No celular fica sempre no canto, só trocando o gesto e a fala.
     ------------------------------------------------------------------ */
  const guia = $(".guia");
  if (guia && temIO && "animate" in guia) {
    const surge = $(".guia-surge", guia), mola = $(".guia-mola", guia), balao = $(".guia-balao", guia);
    const largo = matchMedia("(min-width:961px)");
    let lado = "d", parada = null, visivel = false, tBalao = 0, tGesto = 0, tLembra = 0;
    const margem = () => (largo.matches ? 28 : 10);
    const posX = (l) => (largo.matches && l === "e" ? margem() : document.documentElement.clientWidth - margem() - guia.offsetWidth);
    const poe = (l) => { lado = l; guia.style.transform = `translateX(${posX(l)}px)`; guia.classList.toggle("lado-d", l === "d" || !largo.matches); };
    const ladoDe = (s) => (largo.matches ? s.dataset.lado || "d" : "d");
    const fala = (txt, espera = 0) => {
      clearTimeout(tBalao); balao.classList.remove("on");
      tBalao = setTimeout(() => {
        balao.textContent = txt; balao.classList.add("on");
        tBalao = setTimeout(() => balao.classList.remove("on"), 4200);
      }, espera);
    };
    // gesto = a "encenação": curto, feito já parada, depois que ela surgiu
    const GESTOS = ["espia", "acena", "sim"];
    const encena = (g = "espia") => {
      GESTOS.forEach((x) => guia.classList.remove("g-" + x)); void guia.offsetWidth;
      guia.classList.add("g-" + g);
    };
    // lembrete: se a pessoa ficou lendo a mesma seção, um gesto a mais (sem balão)
    guia.addEventListener("animationend", (e) => {
      if (["n-espia", "n-acena", "n-sim"].includes(e.animationName)) GESTOS.forEach((x) => guia.classList.remove("g-" + x));
    });
    const agendaLembrete = () => { clearTimeout(tLembra); tLembra = setTimeout(() => visivel && encena(parada?.dataset.gesto || "espia"), 9000); };

    // chegada discreta: sobe 14px e aparece, sem quique; o gesto vem depois
    let cena = null;
    const troca = (a) => { cena?.cancel(); return (cena = a); };
    const aparece = (d = 520) => troca(surge.animate(
      [{ opacity: 0, transform: "translateY(14px) scale(.94)" }, { opacity: 1, transform: "none" }],
      { duration: d, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" }));
    const desaparece = (d = 220) => troca(surge.animate(
      [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(8px) scale(.96)" }],
      { duration: d, easing: "cubic-bezier(.4,0,1,1)", fill: "both" }));

    function chega(s, primeira) {
      clearTimeout(tGesto); balao.classList.remove("on");
      const novo = ladoDe(s), trocaLado = novo !== lado || primeira;
      const mostra = () => {
        poe(novo);
        if (trocaLado) aparece();
        tGesto = setTimeout(() => { encena(s.dataset.gesto || "espia"); fala(s.dataset.guia, 350); agendaLembrete(); }, trocaLado ? 480 : 80);
      };
      if (trocaLado && !primeira) desaparece().onfinish = mostra; else mostra();
    }

    function entra() {
      if (visivel) return; visivel = true;
      guia.classList.add("on");
      chega(parada, true);
    }
    function sai() {
      if (!visivel) return; visivel = false;
      clearTimeout(tBalao); clearTimeout(tGesto); clearTimeout(tLembra); balao.classList.remove("on");
      desaparece(260).onfinish = () => { if (!visivel) guia.classList.remove("on"); };
    }

    // paradas: a seção que está no meio da tela manda
    const ioParada = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting || e.target === parada) return;
      parada = e.target;
      visivel ? chega(parada) : avalia();
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

    // mola discreta: um leve atraso e inclinação na rolagem; os olhos acompanham a página
    const pup = $(".n-pupilas", guia);
    let yAnt = scrollY, v = 0, pos = 0, vel = 0;
    (function laco() {
      requestAnimationFrame(laco);
      if (!visivel) { yAnt = scrollY; return; }
      const dy = scrollY - yAnt; yAnt = scrollY;
      v += (dy - v) * .2;
      const alvo = Math.max(-8, Math.min(8, v * .6));
      vel += (alvo - pos) * .1; vel *= .7; pos += vel;
      const incl = Math.max(-4, Math.min(4, v * .3));
      mola.style.transform = `translateY(${pos.toFixed(2)}px) rotate(${incl.toFixed(2)}deg)`;
      if (pup) pup.style.transform = `translateY(${Math.max(-3, Math.min(3, v * .4)).toFixed(2)}px)`;
      if (Math.abs(dy) > 2) agendaLembrete();
    })();

    // clique: ela acena enquanto o chat abre (o chat é ligado no bloco do chat, acima)
    mola.addEventListener("click", () => { clearTimeout(tBalao); balao.classList.remove("on"); encena("acena"); });
    addEventListener("resize", () => poe(largo.matches ? lado : "d"), { passive: true });
  }

  /* ------------------------------------------------------------------
     CARROSSEL — usado pelo topo (.hs) e pela vitrine (.bn). A barra de
     tempo da aba ativa é a própria animação CSS (bn-tempo); quando ela
     termina, passa para o próximo. Pausa sozinho com o mouse em cima,
     com foco dentro, fora da tela ou no botão de pausa. Setas (se
     houver), ←/→ nas abas e arrastar no celular. Sem JS ou com
     movimento reduzido, cada um tem seu estado estático no CSS.
     pre: prefixo das classes · aoMudar(n, slide) · espera: ms antes de
     começar a contar · reinicia: refaz a 1ª cena quando entra na tela.
     ------------------------------------------------------------------ */
  function carrossel(el, { pre, aoMudar = () => {}, espera = 0, reinicia = true }) {
    const slides = $$(`.${pre}-slide`, el), abas = $$(`.${pre}-aba`, el);
    if (!slides.length || slides.length !== abas.length) return;
    let atual = -1;
    el.classList.add("js");
    slides.forEach((s, i) => { s.id = `${pre}-s${i}`; abas[i].id = `${pre}-a${i}`; abas[i].setAttribute("aria-controls", s.id); s.setAttribute("role", "tabpanel"); s.setAttribute("aria-labelledby", abas[i].id); });
    function mostra(n, dir = 1) {
      n = (n + slides.length) % slides.length;
      if (n === atual) return;
      el.style.setProperty("--dir", dir);
      slides.forEach((s, i) => {
        s.classList.toggle("sai", i === atual);
        s.classList.toggle("ativo", i === n);
        s.inert = i !== n;
      });
      abas.forEach((a, i) => { a.setAttribute("aria-selected", String(i === n)); a.tabIndex = i === n ? 0 : -1; a.classList.remove("corre"); a.classList.toggle("feita", i < n); });
      void abas[n].offsetWidth; abas[n].classList.add("corre");   // reinicia a barra de tempo
      atual = n;
      aoMudar(n, slides[n]);
    }
    abas.forEach((a, i) => {
      a.addEventListener("click", () => mostra(i, i > atual ? 1 : -1));
      a.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault(); mostra(atual + d, d); abas[atual].focus();
      });
      a.addEventListener("animationend", (e) => { if (e.animationName === "bn-tempo") mostra(atual + 1, 1); });
    });
    $(`[data-${pre}-ant]`, el)?.addEventListener("click", () => mostra(atual - 1, -1));
    $(`[data-${pre}-prox]`, el)?.addEventListener("click", () => mostra(atual + 1, 1));
    const pausa = $(`[data-${pre}-pausa]`, el);
    pausa?.addEventListener("click", () => {
      const p = el.classList.toggle("pausa");
      pausa.setAttribute("aria-pressed", String(p));
      pausa.setAttribute("aria-label", p ? "Retomar a troca automática" : "Pausar a troca automática");
    });
    // arrastar para os lados (toque)
    const palco = $(`.${pre}-palco`, el); let x0 = null;
    palco.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") x0 = e.clientX; });
    palco.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 45) mostra(atual + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    palco.addEventListener("pointercancel", () => (x0 = null));
    // só corre o tempo quando está na tela (e, se pedido, a 1ª cena recomeça quando a pessoa chega)
    let jaViu = !reinicia, pronto = espera === 0;
    if (!pronto) setTimeout(() => { pronto = true; if (el.dataset.naTela) el.classList.add("visivel"); }, espera);
    const naTela = (sim) => {
      el.dataset.naTela = sim ? "1" : "";
      el.classList.toggle("visivel", sim && pronto);
      if (sim && !jaViu) {
        jaViu = true;
        const s = slides[atual], a = abas[atual];
        s.classList.remove("ativo"); a.classList.remove("corre"); void s.offsetWidth;
        s.classList.add("ativo"); a.classList.add("corre");
      }
    };
    if (temIO) new IntersectionObserver((es) => es.forEach((e) => naTela(e.isIntersecting)), { threshold: .35 }).observe(el);
    else naTela(true);
    mostra(0);
  }

  const bn = $("[data-bn]");
  if (bn) carrossel(bn, { pre: "bn" });

  // topo: as mensagens giram e o painel ao lado acompanha (destaca a parte do app e troca o cartão)
  const hs = $("[data-hs]"), heroFoco = $(".hero");
  if (hs) {
    carrossel(hs, { pre: "hs", espera: 1800, reinicia: false, aoMudar: (n, s) => { heroFoco.dataset.foco = s.dataset.foco || ""; } });
    // depois da coreografia de entrada, o painel passa a reagir às mensagens (sem os atrasos da entrada)
    setTimeout(() => heroFoco.classList.add("hs-vivo"), 1800);
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
