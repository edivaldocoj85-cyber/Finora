/* =====================================================================
   FINORA LANDING — JS isolado (sem dependências)
   Menu, links de entrada, a Nora (desenho em SVG), o chat de dúvidas, o
   filme do app no topo, as demos das histórias e o movimento de apoio.
   data-login no #finora-landing define o destino de "Entrar".
   Com prefers-reduced-motion, nada desliza sozinho e o filme começa pausado.
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
  // Nora em 3D (render do Canva, a partir do desenho original da marca): uma imagem só,
  // em dois tamanhos — 640 px para a seção dela e o fecho, 160 px para avatares e botões
  function nora(pose) {
    const w = pose === "hero" ? 640 : 160;
    return `<img class="nora nora-${pose}" src="/img/nora/nora-3d-${w}.webp" width="${w}" height="${w}" alt="" loading="lazy" decoding="async">`;
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
  let lidoPend = false;
  const lido = () => {
    lidoPend = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    cab.style.setProperty("--lido", h > 0 ? (scrollY / h).toFixed(4) : 0);
  };
  addEventListener("scroll", () => { if (!lidoPend) { lidoPend = true; requestAnimationFrame(lido); } }, { passive: true }); lido();

  /* ambiente (aurora, halo e flutuar da Nora) só anima com a seção na tela */
  if (IO) {
    const vivo = new IO((es) => es.forEach((e) => e.target.classList.toggle("vivo", e.isIntersecting)), { rootMargin: "80px 0px" });
    $$("[data-luz]").forEach((el) => vivo.observe(el));
  } else $$("[data-luz]").forEach((el) => el.classList.add("vivo"));

  /* entradas ao rolar; cartões lado a lado entram em cascata */
  const revs = $$("[data-rev]");
  revs.forEach((el) => {
    if (!el.parentElement.matches(".confia,.planos")) return;
    el.style.setProperty("--i", [...el.parentElement.children].indexOf(el));
  });
  const mostra = (el) => el.classList.add("vis");
  revs.forEach((el) => (anima ? aoVer(el, mostra, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : mostra(el)));

  /* ABERTURA: o holofote do fundo segue o cursor */
  const abre = $(".abre");
  if (anima && fino && abre) {
    abre.addEventListener("pointermove", (e) => {
      const r = abre.getBoundingClientRect();
      abre.style.setProperty("--mx", e.clientX - r.left + "px"); abre.style.setProperty("--my", e.clientY - r.top + "px");
    });
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
      c.style.setProperty("--hn", ((NOVO / MAX) * 100).toFixed(1) + "%");
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

  /* O FILME DO APP (topo) — as telas passam sozinhas: o segmento da barra é o relógio
     (animationend avança). Pausa com o botão, com o mouse ou o foco dentro, fora da tela
     ou com a aba oculta. Com movimento reduzido, começa parado e sem zoom. */
  const fm = $(".filme");
  if (fm) {
    const fotos = $$(".fm-img", fm), segs = $$(".fm-seg", fm), leg = $(".fm-legenda", fm);
    const varre = $(".fm-varre", fm), chips = $$(".fm-chip", fm);
    let anterior = -1, forma = 0;
    const nome = $(".fm-nome", fm), conta = $(".fm-conta b", fm), play = $(".fm-play", fm);
    let atual = 0, pausaUsuario = !anima, pausaHover = false, fora = false, entrando = anima;
    const pausado = () => pausaUsuario || pausaHover || fora || entrando || document.hidden;
    segs.forEach((s, k) => s.style.setProperty("--k", k));
    const sincroniza = () => {
      fm.classList.toggle("pausado", pausado());
      play.setAttribute("aria-label", pausaUsuario ? "Continuar o tour" : "Pausar o tour");
    };
    const vai = (i) => {
      const novo = (i + fotos.length) % fotos.length;
      if (novo === atual && anterior !== -1) return;
      anterior = atual; atual = novo;
      // a anterior fica embaixo; a nova entra por cima, aberta por uma forma (círculo, cartão, diagonal)
      fotos.forEach((f, k) => {
        f.classList.remove("on", "sai", "revela", "f0", "f1", "f2");
        if (k === anterior && anterior !== atual) f.classList.add("sai");
      });
      const fNova = fotos[atual];
      fNova.classList.add("on");
      if (anima && anterior !== atual && anterior !== -1) { fNova.classList.add("revela", "f" + (forma++ % 3)); varre.classList.remove("passa"); void varre.offsetWidth; varre.classList.add("passa"); }
      else fNova.classList.add("revela", "f0");
      fm.style.setProperty("--tom", fNova.dataset.tom);
      chips.forEach((c, n) => {
        const [rot, val] = fNova.dataset["c" + (n + 1)].split("|");
        const icone = fNova.dataset["i" + (n + 1)];
        const troca = () => { $("small", c).textContent = rot; $("b", c).textContent = val; $("i img", c).src = `/img/icones/${icone}-96.webp`; };
        if (!anima) { troca(); return; }
        c.classList.remove("muda"); void c.offsetWidth; c.classList.add("muda");
        setTimeout(troca, 260 + n * 90);   // o texto troca no meio da transformação
      });
      segs.forEach((s, k) => { s.classList.toggle("on", k === atual); s.classList.toggle("feito", k < atual); });
      // reinicia as animações do slide atual
      [fotos[atual], $("i", segs[atual])].forEach((el) => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
      const f = fotos[atual];
      $("b", leg).textContent = f.dataset.t; $("span", leg).textContent = f.dataset.l;
      leg.classList.remove("troca"); void leg.offsetWidth; leg.classList.add("troca");
      nome.textContent = f.dataset.t; conta.textContent = atual + 1;
      const prox = fotos[(atual + 1) % fotos.length]; if (prox.loading === "lazy") prox.loading = "eager";  // pré-carrega a próxima
      sincroniza();
    };
    segs.forEach((s, k) => {
      // só o fim do preenchimento (fm-enche) avança; a entrada dos traços também dispara animationend
      $("i", s).addEventListener("animationend", (e) => { if (e.animationName === "fm-enche" && k === atual && !pausado()) vai(atual + 1); });
      s.addEventListener("click", () => vai(k));
    });
    $(".fm-ant", fm).addEventListener("click", () => vai(atual - 1));
    $(".fm-prox", fm).addEventListener("click", () => vai(atual + 1));
    play.addEventListener("click", () => { pausaUsuario = !pausaUsuario; sincroniza(); });
    fm.addEventListener("mouseenter", () => { pausaHover = true; sincroniza(); });
    fm.addEventListener("mouseleave", () => { pausaHover = false; sincroniza(); });
    fm.addEventListener("focusin", () => { pausaHover = true; sincroniza(); });
    fm.addEventListener("focusout", (e) => { if (!fm.contains(e.relatedTarget)) { pausaHover = false; sincroniza(); } });
    document.addEventListener("visibilitychange", sincroniza);
    if (IO) new IO(([e]) => { fora = !e.isIntersecting; sincroniza(); }, { threshold: 0.25 }).observe(fm);
    fm.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); vai(atual + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); vai(atual - 1); }
    });
    // a anterior some quando a nova termina de abrir
    fotos.forEach((f) => f.addEventListener("animationend", (e) => { if (e.animationName.startsWith("fm-") && e.animationName !== "fm-desce" && f.classList.contains("on")) fotos.forEach((o) => o.classList.remove("sai")); }));
    // a janela e os cartões seguem o mouse de leve (só translate)
    if (anima && fino) {
      fm.addEventListener("pointermove", (e) => {
        const r = fm.getBoundingClientRect();
        fm.style.setProperty("--px", (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(1) + "px");
        fm.style.setProperty("--py", (((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(1) + "px");
      });
      fm.addEventListener("pointerleave", () => { fm.style.setProperty("--px", "0px"); fm.style.setProperty("--py", "0px"); });
    }
    vai(0);
    if (entrando) setTimeout(() => { entrando = false; sincroniza(); }, 1300);  // a janela termina de entrar
  }

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
