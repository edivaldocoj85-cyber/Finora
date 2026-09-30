/* =====================================================================
   FINORA LANDING — JS isolado (sem dependências)
   Menu, links de entrada, a Nora (desenho em SVG), o chat de dúvidas e
   o único movimento da página: a caneta circulando os dias da folhinha.
   data-login no #finora-landing define o destino de "Entrar".
   Com prefers-reduced-motion, os círculos aparecem prontos.
   ===================================================================== */
(function () {
  "use strict";
  const root = document.getElementById("finora-landing");
  if (!root) return;
  document.documentElement.classList.add("js");
  const $ = (q, c = root) => c.querySelector(q), $$ = (q, c = root) => [...c.querySelectorAll(q)];
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* links de entrada */
  // o botão de cada plano leva a escolha junto (?plano=mensal|anual), para o app retomar na hora de assinar
  $$("[data-entrar]").forEach((a) => a.setAttribute("href", (root.dataset.login || "/app/") + (a.dataset.plano ? "?plano=" + a.dataset.plano : "")));

  /* cabeçalho ganha uma linha embaixo depois do topo */
  const cab = $(".cab");
  const onScroll = () => cab.classList.toggle("rolou", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

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

  /* compatibilidade com links antigos (#recursos, #parcelas, #vitrine…) */
  const antigos = { "#acesso": "#planos", "#consultor": "#dia-30", "#automacoes": "#nora", "#recursos": "#historias", "#vitrine": "#historias", "#pra-quem": "#historias", "#parcelas": "#dia-18", "#contas": "#dia-18", "#extrato": "#dia-5", "#como-resolve": "#historias", "#como-funciona": "#topo" };
  const novo = antigos[location.hash];
  if (novo) {
    history.replaceState(null, "", novo);
    addEventListener("load", () => document.querySelector(novo)?.scrollIntoView());
  }

  /* ------------------------------------------------------------------
     NORA — a mascote. É o próprio ícone "F" da marca ganhando corpo:
     o quadrado arredondado em degradê, a bolinha ciano virando antena.
     ------------------------------------------------------------------ */
  let noraN = 0;
  function nora(pose) {
    const id = "noraG" + (++noraN);
    return `<svg class="nora nora-${pose}" viewBox="0 0 160 170" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b3fa8"/><stop offset=".5" stop-color="#5b2a86"/><stop offset="1" stop-color="#ff7a59"/></linearGradient></defs>
      <ellipse class="n-sombra" cx="80" cy="160" rx="36" ry="6" fill="#2a1633" opacity=".16"/>
      <g class="n-tudo">
        <g class="n-antena"><path d="M80 36 Q83 22 93 15" fill="none" stroke="#3a1d4f" stroke-width="4.5" stroke-linecap="round"/><circle cx="94" cy="14" r="8" fill="#ff9a7e"/><circle cx="91.5" cy="11.5" r="2.4" fill="#fff" opacity=".8"/></g>
        <path class="n-braco-e" d="M34 100 q-16 6 -18 22" fill="none" stroke="#5b2a86" stroke-width="10" stroke-linecap="round"/>
        <g class="n-braco-d"><path d="M126 96 q18 -6 22 -26" fill="none" stroke="#e0613f" stroke-width="10" stroke-linecap="round"/></g>
        <ellipse cx="60" cy="143" rx="13" ry="7" fill="#3a1d4f"/><ellipse cx="100" cy="143" rx="13" ry="7" fill="#3a1d4f"/>
        <rect x="30" y="36" width="100" height="104" rx="32" fill="url(#${id})"/>
        <path d="M44 52 q10 -9 26 -9" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="5" stroke-linecap="round"/>
        <g class="n-olhos">
          <ellipse cx="62" cy="80" rx="12" ry="14" fill="#fff"/><ellipse cx="98" cy="80" rx="12" ry="14" fill="#fff"/>
          <g class="n-pupilas"><circle cx="64" cy="82" r="6.5" fill="#2a1633"/><circle cx="100" cy="82" r="6.5" fill="#2a1633"/><circle cx="66.5" cy="79" r="2.2" fill="#fff"/><circle cx="102.5" cy="79" r="2.2" fill="#fff"/></g>
        </g>
        <ellipse cx="48" cy="101" rx="7.5" ry="4.5" fill="#ffb3a1" opacity=".75"/><ellipse cx="112" cy="101" rx="7.5" ry="4.5" fill="#ffb3a1" opacity=".75"/>
        <path class="n-boca" d="M70 102 q10 11 20 0" fill="none" stroke="#2a1633" stroke-width="4.5" stroke-linecap="round"/>
      </g>
    </svg>`;
  }
  $$("[data-nora]").forEach((el) => el.insertAdjacentHTML("afterbegin", nora(el.dataset.nora)));

  /* ------------------------------------------------------------------
     CHAT COM A NORA (pré-venda). Abre pelos botões [data-abre-chat].
     Pergunta vai para /api/vendas/chat; quando a Nora não sabe, oferece
     mandar a dúvida por e-mail já escrita.
     ------------------------------------------------------------------ */
  const EMAIL = "finora@gmail.com";
  const at = document.getElementById("atende");
  let abreChat = () => {};
  if (at) {
    const lista = $(".at-msgs", at), sug = $(".at-sug", at), form = $(".at-form", at), campo = $("#at-in", at);
    const status = $(".at-status", at), enviar = $("button[type=submit]", form);
    // o status diz a verdade: sem conexão, avisa e aponta o e-mail
    const estado = (ok) => { status.textContent = ok ? "Assistente da Finora" : "Sem conexão agora · respondemos por e-mail"; status.classList.toggle("off", !ok); };
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
      ocupado = true; sugere([]); enviar.disabled = true;
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
        else { r = await resp.json(); estado(true); }
      } catch {
        estado(false);
        r = { resposta: `Não consegui responder agora. Tente de novo em instantes ou escreva para **${EMAIL}**.`, email: true };
      }
      dig.remove();
      conversa.push({ papel: "nora", texto: r.resposta });
      balao("nora", r.resposta, r.email);
      sugere(r.sugestoes);
      ocupado = false; enviar.disabled = false; campo.focus();
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); const t = campo.value; campo.value = ""; pergunta(t); });

    abreChat = () => {
      if (!at.hidden) { campo.focus(); return; }
      voltaFoco = document.activeElement;
      at.hidden = false;
      requestAnimationFrame(() => at.classList.add("on"));
      if (!conversa.length) {
        const oi = "Oi! Eu sou a **Nora**, assistente da Finora. Posso explicar como o app funciona, preços, teste grátis, segurança e o que mais você quiser saber. Qual é a sua dúvida?";
        conversa.push({ papel: "nora", texto: oi }); balao("nora", oi);
        sugere(["O que a Finora faz?", "Quanto custa?", "É seguro?"]);
      }
      setTimeout(() => campo.focus(), 60);
    };
    const fechaChat = () => {
      at.classList.remove("on");
      setTimeout(() => { if (!at.classList.contains("on")) at.hidden = true; }, 220);
      if (voltaFoco && voltaFoco.focus) voltaFoco.focus();
    };
    $("[data-fecha-chat]", at).addEventListener("click", fechaChat);
    at.addEventListener("keydown", (e) => { if (e.key === "Escape") fechaChat(); });
    $$("[data-abre-chat]").forEach((b) => b.addEventListener("click", abreChat));
  }

  /* ------------------------------------------------------------------
     FOLHINHA — cada dia marcado ganha um círculo de caneta, cada um
     com um leve desvio para não parecer carimbo. Com movimento, a
     caneta passa uma vez, dia após dia; sem movimento, já está pronto.
     ------------------------------------------------------------------ */
  $$(".marcado").forEach((a, i) => {
    const g = [-7, 5, -3, 8, -10, 4][i % 6];
    a.insertAdjacentHTML("afterbegin", `<svg class="circ" viewBox="0 0 40 34" aria-hidden="true" focusable="false" style="transform:rotate(${g}deg)"><path pathLength="1" d="M31 6 C25 1 11 1 5 9 C0 17 5 29 18 31 C31 33 39 24 37 14 C36 9 31 4 23 3"/></svg>`);
  });
  const anima = !reduz;
  if (anima) document.documentElement.classList.add("js-anim");

  /* ==================================================================
     v8 — MOVIMENTO, BRILHO E DEMOS. Tudo abaixo respeita o movimento
     reduzido: sem ele, as demos continuam interativas, só que sem
     transição, e nada fica escondido esperando animação.
     ================================================================== */
  const IO = window.IntersectionObserver;
  const fino = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  // quando algo entra na tela pela primeira vez
  const aoVer = (el, fn, opt) => {
    if (!IO) return fn(el);
    const o = new IO((es) => es.forEach((e) => { if (e.isIntersecting) { o.unobserve(e.target); fn(e.target); } }), opt);
    o.observe(el);
  };
  // número que corre até o valor final (easing de saída)
  function conta(el, de, ate, fmt, dur = 700) {
    if (!anima) { el.textContent = fmt(ate); return; }
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(de + (ate - de) * e);
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
  // pequena explosão de faíscas a partir do centro de um botão
  function faiscas(el) {
    if (!anima) return;
    const cores = ["#ff7a59", "#ffc9b8", "#a8488f", "#0f9f76", "#ffd166"];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span"), a = (i / 14) * Math.PI * 2, r = 36 + Math.random() * 36;
      s.className = "faisca";
      s.style.setProperty("--dx", (Math.cos(a) * r * 1.6).toFixed(1) + "px");
      s.style.setProperty("--dy", (Math.sin(a) * r).toFixed(1) + "px");
      s.style.setProperty("--cor", cores[i % cores.length]);
      el.appendChild(s); setTimeout(() => s.remove(), 800);
    }
  }

  /* barra de leitura no cabeçalho */
  const lido = () => { const h = document.documentElement.scrollHeight - innerHeight; cab.style.setProperty("--lido", h > 0 ? (scrollY / h).toFixed(4) : 0); };
  addEventListener("scroll", lido, { passive: true }); lido();

  /* entradas ao rolar; cartões lado a lado entram em cascata */
  const revs = $$("[data-rev]");
  revs.forEach((el) => {
    if (!el.parentElement.matches(".confia,.planos")) return;
    el.style.setProperty("--i", [...el.parentElement.children].indexOf(el));
  });
  const mostra = (el) => el.classList.add("vis");
  revs.forEach((el) => (anima ? aoVer(el, mostra, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : mostra(el)));

  /* ABERTURA: holofote segue o cursor, a folhinha inclina e reflete a luz */
  const abre = $(".abre"), palco = $(".fl-palco"), folha = $(".folhinha");
  if (anima && fino && abre) {
    abre.addEventListener("pointermove", (e) => {
      const r = abre.getBoundingClientRect();
      abre.style.setProperty("--mx", e.clientX - r.left + "px"); abre.style.setProperty("--my", e.clientY - r.top + "px");
    });
    palco.addEventListener("pointermove", (e) => {
      if (innerWidth <= 960) return;
      const r = palco.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      folha.style.setProperty("--ry", ((px - 0.5) * 10).toFixed(2) + "deg");
      folha.style.setProperty("--rx", ((0.5 - py) * 8).toFixed(2) + "deg");
      folha.style.setProperty("--gx", (px * 100).toFixed(1) + "%"); folha.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
    });
    palco.addEventListener("pointerleave", () => { folha.style.setProperty("--rx", "0deg"); folha.style.setProperty("--ry", "0deg"); });
  }

  /* o aviso da Finora gira pelos dias circulados; passar o mouse num dia mostra o dele */
  const AVISOS = {
    5: "O salário caiu. Os lançamentos já vieram separados.",
    10: "A conta de luz vence em 3 dias.",
    18: "O cartão fecha hoje: parcela 4 de 10 do notebook.",
    22: "A Marina ainda te deve R$ 60,00.",
    25: "Restaurantes: você já usou 80% do que separou.",
    30: "Sobraram R$ 300 este mês. Que tal a reserva?",
  };
  const aviso = $(".aviso"), marcados = $$(".marcado");
  if (aviso && marcados.length) {
    const avDia = $(".av-dia", aviso), avTxt = $(".av-txt", aviso);
    let k = 1, parado = false;
    const mostraDia = (i) => {
      marcados.forEach((d, j) => d.classList.toggle("agora", j === i));
      const n = marcados[i].dataset.dia;
      if (!anima) { avDia.textContent = n; avTxt.textContent = AVISOS[n]; return; }
      aviso.classList.add("troca"); aviso.classList.remove("toca");
      setTimeout(() => { avDia.textContent = n; avTxt.textContent = AVISOS[n]; aviso.classList.remove("troca"); aviso.classList.add("toca"); }, 300);
    };
    marcados.forEach((d, i) => {
      const segura = () => { if (k !== i || !parado) { k = i; mostraDia(i); } parado = true; };
      d.addEventListener("mouseenter", segura); d.addEventListener("focus", segura);
      d.addEventListener("mouseleave", () => { parado = false; }); d.addEventListener("blur", () => { parado = false; });
    });
    if (anima) {
      setTimeout(() => {
        mostraDia(k);
        setInterval(() => { if (!parado && !document.hidden) { k = (k + 1) % marcados.length; mostraDia(k); } }, 3400);
      }, 2700);
    } else mostraDia(k);
  }

  /* HISTÓRIAS: o número do dia que está no meio da tela acende */
  const diasLi = $$(".dia");
  if (IO && anima) {
    const o = new IO((es) => es.forEach((e) => { if (e.isIntersecting) diasLi.forEach((d) => d.classList.toggle("ativo", d === e.target)); }), { rootMargin: "-45% 0px -45% 0px" });
    diasLi.forEach((d) => o.observe(d));
  }

  /* demos: cada uma começa a se mexer quando aparece */
  $$("[data-demo]").forEach((d) => (anima ? aoVer(d, (x) => x.classList.add("play"), { threshold: 0.35 }) : d.classList.add("play")));

  // dia 5 — extrato: destacar categoria e importar de novo
  const dx = $(".demo-extrato");
  if (dx) {
    const botoes = $$(".dx-leg button", dx), linhas = $$(".dx-lista li", dx), barras = $$(".dx-barra i", dx);
    const filtra = (cat) => {
      dx.classList.toggle("filtra", !!cat);
      botoes.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === cat)));
      linhas.forEach((l) => l.classList.toggle("on", l.dataset.cat === cat));
      barras.forEach((b) => b.classList.toggle("on", b.classList.contains("c-" + cat)));
    };
    botoes.forEach((b) => b.addEventListener("click", () => { dx.classList.add("pronto"); filtra(b.getAttribute("aria-pressed") === "true" ? null : b.dataset.cat); }));
    $("[data-replay]", dx).addEventListener("click", () => {
      filtra(null);
      dx.classList.add("zera"); dx.classList.remove("play", "pronto");
      void dx.offsetWidth; dx.classList.remove("zera");
      requestAnimationFrame(() => requestAnimationFrame(() => dx.classList.add("play")));
    });
  }

  // dia 10 — marcar a conta como paga
  const dc = $(".demo-conta");
  if (dc) {
    const b = $(".dc-pagar", dc), txt = $(".dc-txt", dc), ok = $(".dc-ok", dc);
    b.addEventListener("click", () => {
      const pago = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(pago));
      txt.textContent = pago ? "Paga" : "Marcar como paga";
      ok.textContent = pago ? "Pronto. Sem juros e sem multa este mês." : "";
      if (pago) faiscas(b);
    });
  }

  // dia 18 — simular mais uma compra parcelada
  const dp = $(".demo-parc");
  if (dp) {
    const MAX = 1400, NOVO = 300, cols = $$(".dp-col", dp), bt = $(".dp-sim", dp), diz = $(".dp-diz", dp);
    const pinta = (sim) => cols.forEach((c) => {
      const v = +c.dataset.v;
      c.style.setProperty("--h", ((v / MAX) * 100).toFixed(1) + "%");
      c.style.setProperty("--hn", sim ? ((NOVO / MAX) * 100).toFixed(1) + "%" : "0%");
      c.classList.toggle("sobe", sim);
      $("b", c).textContent = (v + (sim ? NOVO : 0)).toLocaleString("pt-BR");
    });
    pinta(false);
    bt.addEventListener("click", () => {
      const sim = bt.getAttribute("aria-pressed") !== "true";
      bt.setAttribute("aria-pressed", String(sim)); pinta(sim);
      diz.textContent = sim
        ? "Com o celular, dezembro e janeiro vão para R$ 1.290 no cartão, só em parcelas."
        : "Notebook, geladeira e passagem já ocupam de R$ 680 a R$ 990 por mês até abril.";
    });
  }

  // dia 22 — casa × salão e quem ainda deve
  const dk = $(".demo-caixa");
  if (dk) {
    const abas = $(".dk-abas", dk), bts = $$(".dk-abas button", dk);
    abas.dataset.sel = "salao";
    bts.forEach((b) => b.addEventListener("click", () => {
      abas.dataset.sel = b.dataset.lado;
      bts.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $$(".dk-painel", dk).forEach((p) => { p.hidden = p.dataset.painel !== b.dataset.lado; });
    }));
    const rb = $(".dk-recebi", dk), caixa = $("[data-caixa]", dk), deve = $(".dk-deve", dk);
    rb.addEventListener("click", () => {
      const pago = rb.getAttribute("aria-pressed") !== "true";
      rb.setAttribute("aria-pressed", String(pago));
      deve.classList.toggle("pago", pago);
      $("b", deve).textContent = pago ? "A Marina pagou" : "Marina te deve";
      conta(caixa, pago ? 1165.1 : 1225.1, pago ? 1225.1 : 1165.1, brl);
      if (pago) faiscas(rb);
    });
  }

  // dia 25 — o medidor do orçamento responde ao gasto
  const dor = $(".demo-orc");
  if (dor) {
    const r = $("#do-gasto", dor), out = $("#do-out", dor), txt = $(".do-txt", dor), LIM = 400;
    const MSG = {
      ok: "Tudo certo. Ainda sobra espaço no orçamento.",
      alerta: "Aviso: você já usou 80% do que separou para Restaurantes.",
      passou: "Passou do limite de Restaurantes. A Finora avisa na hora.",
    };
    const atual = () => {
      const v = +r.value, p = v / LIM, est = p > 1 ? "passou" : p >= 0.8 ? "alerta" : "ok";
      dor.style.setProperty("--pn", Math.min(p, 1).toFixed(3));
      out.textContent = "R$ " + v;
      if (est !== dor.dataset.estado) { dor.dataset.estado = est; txt.textContent = MSG[est]; }
    };
    r.addEventListener("input", atual); atual();
  }

  // dia 30 — quanto guardar por mês e quando a reserva fica pronta
  const dm = $(".demo-meta");
  if (dm) {
    const r = $("#dm-mes", dm), out = $("#dm-out", dm), msg = $(".dm-msg", dm), box = $(".dm-meses", dm), META = 3000, N = 30;
    const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    box.innerHTML = Array.from({ length: N }, (_, i) => `<i style="--i:${i}"></i>`).join("");
    const bolas = [...box.children];
    const atual = () => {
      const v = +r.value, n = Math.ceil(META / v), d = new Date(2026, 10 + n - 1, 1);   // começa a guardar em novembro
      out.textContent = "R$ " + v.toLocaleString("pt-BR");
      bolas.forEach((b, i) => { b.classList.toggle("on", i < n); b.classList.toggle("fim", i === n - 1); });
      msg.innerHTML = `Em <b>${n} ${n === 1 ? "mês" : "meses"}</b> a reserva está pronta: <b>${MESES[d.getMonth()]} de ${d.getFullYear()}</b>.`;
    };
    r.addEventListener("input", atual); atual();
  }

  /* NORA — exemplos de conversa que se escrevem sozinhos */
  const EXEMPLOS = [
    [["eu", "gastei 80 na farmácia"], ["ela", "Anoto R$ 80,00 em Saúde, na sua conta corrente. Posso lançar?"], ["eu", "pode"], ["ela", "Pronto, lançado."]],
    [["eu", "quanto tenho na conta?"], ["ela", "Na conta corrente, R$ 1.842,30."]],
    [["eu", "quanto gastei com mercado?"], ["ela", "Em outubro, R$ 612,35 em Mercado, em 3 compras."]],
    [["eu", "o que vence hoje?"], ["ela", "Hoje vence a internet, R$ 99,90. Amanhã, o condomínio, R$ 540,00."]],
  ];
  const cvBox = $(".conversa"), cvBts = $$(".cv-abas button");
  if (cvBox) {
    let geracao = 0;
    const bolha = (quem, texto) => {
      const d = document.createElement("div");
      d.className = "cv " + quem + (anima ? " chega" : "");
      d.innerHTML = `<dt>${quem === "eu" ? "Você" : "Nora"}</dt><dd></dd>`;
      $("dd", d).textContent = texto;
      return d;
    };
    const roda = async (i) => {
      const g = ++geracao;
      cvBox.innerHTML = "";
      cvBts.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.ex === i)));
      for (const [quem, texto] of EXEMPLOS[i]) {
        if (anima) {
          if (quem === "ela") {
            const dig = bolha("ela", "");
            dig.classList.add("cv-dig"); dig.setAttribute("aria-hidden", "true"); $("dd", dig).innerHTML = "<i></i><i></i><i></i>";
            cvBox.appendChild(dig); await espera(900); dig.remove();
          } else await espera(380);
          if (g !== geracao) return;   // o visitante trocou de exemplo no meio
        }
        cvBox.appendChild(bolha(quem, texto));
      }
    };
    cvBts.forEach((b) => b.addEventListener("click", () => roda(+b.dataset.ex)));
    if (anima) aoVer(cvBox, () => roda(0), { threshold: 0.4 });
  }

  /* os olhos das Noras acompanham o cursor */
  if (anima && fino) {
    let px = 0, py = 0, pend = false;
    addEventListener("pointermove", (e) => {
      px = e.clientX; py = e.clientY;
      if (pend) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        $$(".n-pupilas").forEach((p) => {
          const r = p.closest("svg").getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
          const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.47), d = Math.hypot(dx, dy) || 1, f = Math.min(1, d / 300) * 4;
          p.style.transform = `translate(${((dx / d) * f).toFixed(2)}px,${((dy / d) * f).toFixed(2)}px)`;
        });
      });
    }, { passive: true });
  }

  /* cartões com holofote e botões grandes "magnéticos" (só com mouse) */
  if (fino) {
    $$("[data-spot]").forEach((el) => el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx", e.clientX - r.left + "px"); el.style.setProperty("--sy", e.clientY - r.top + "px");
    }));
    if (anima) $$(".btn-lg").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        b.style.translate = `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(1)}px ${(((e.clientY - r.top) / r.height - 0.5) * 6).toFixed(1)}px`;
      });
      b.addEventListener("pointerleave", () => { b.style.translate = ""; });
    });
  }

  /* O APP EM 12 TELAS — abas com teclado (setas, Home/End); no celular, a aba escolhida
     rola para o meio da faixa */
  const abasTl = $$(".tl-aba"), nomeTl = $(".tl-nome");
  const escolhe = (aba, foco) => {
    abasTl.forEach((a) => {
      const on = a === aba;
      a.setAttribute("aria-selected", String(on)); a.tabIndex = on ? 0 : -1;
      document.getElementById(a.getAttribute("aria-controls")).hidden = !on;
    });
    if (nomeTl) nomeTl.textContent = $("b", aba).textContent;
    const descr = $(".tl-descr"); if (descr) descr.textContent = $("span", aba).textContent;  // no celular a linha da aba fica escondida
    if (foco) aba.focus();
    if (innerWidth <= 960) aba.scrollIntoView({ block: "nearest", inline: "center", behavior: anima ? "smooth" : "auto" });
  };
  abasTl.forEach((a, i) => {
    a.addEventListener("click", () => escolhe(a));
    a.addEventListener("keydown", (e) => {
      const n = abasTl.length, alvo = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
      if (alvo === undefined) return;
      e.preventDefault(); escolhe(abasTl[(alvo + n) % n], true);
    });
  });

  /* preços correm até o valor quando aparecem */
  if (anima && IO) $$("[data-conta]").forEach((el) => {
    const v = +el.dataset.conta, f = (x) => x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    el.textContent = f(0);   // já começa do zero, para não piscar o valor final antes de contar
    aoVer(el, () => conta(el, 0, v, f, 1100), { threshold: 0.6 });
  });

  /* celular: botão de teste fixo embaixo depois do topo; some nos preços e no fecho */
  const fixo = $(".cta-fixo");
  if (fixo && IO) {
    let passou = false;
    const vistos = new Set();
    // enquanto a barra aparece, o "Testar grátis" do cabeçalho some: um botão de teste por vez
    const atualiza = () => { const on = passou && !vistos.size; fixo.classList.toggle("on", on); document.documentElement.classList.toggle("cta-fixo-on", on); };
    new IO(([e]) => { passou = !e.isIntersecting && e.boundingClientRect.top < 0; atualiza(); }).observe($(".abre"));
    const o = new IO((es) => { es.forEach((e) => (e.isIntersecting ? vistos.add(e.target) : vistos.delete(e.target))); atualiza(); });
    [$(".tl-cta"), $("#planos"), $(".fecho")].forEach((x) => x && o.observe(x));
  }
})();
