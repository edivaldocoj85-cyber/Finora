/* =====================================================================
   FINORA — landing (2026-10). JS sem dependências.
   Menu, links de entrada, vitrine do topo (telas do celular + aviso),
   carrosséis com setas, revelação ao rolar, CTA fixo no celular e o chat
   de dúvidas com a Nora. Com prefers-reduced-motion, nada troca sozinho.
   ===================================================================== */
(function () {
  "use strict";
  const root = document.getElementById("finora-landing");
  if (!root) return;
  const $ = (q, c = root) => c.querySelector(q), $$ = (q, c = root) => [...c.querySelectorAll(q)];
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IO = window.IntersectionObserver;

  /* links de entrada: o botão de cada plano leva a escolha junto (?plano=mensal|anual) */
  $$("[data-entrar]").forEach((a) => a.setAttribute("href", (root.dataset.login || "/app/") + (a.dataset.plano ? "?plano=" + a.dataset.plano : "")));

  /* ------------------------------------------------------------------
     LOGO VIVA E ABERTURA. Na primeira visita da sessão, a logo surge em
     tela cheia (arcos se desenham, o ponteiro lê o mês e assenta no
     coral) e a cortina sobe revelando o topo. Clique ou tecla pula.
     ------------------------------------------------------------------ */
  const L = window.FinoraLogo, html = document.documentElement, ab = $(".abertura");
  const montaMarcas = () => {
    if (!L) return;
    $$(".marca [data-flogo]").forEach((svg) => L.mount(svg, { tema: "escuro", dur: 1500, espera: 300 }));
    // a do fluxo de segurança só se monta quando aparece, para a leitura acontecer na frente da pessoa
    $$(".fx-logo, .fecho-logo").forEach((svg) => {
      const det = svg.classList.contains("fecho-logo");
      if (!window.IntersectionObserver) return L.mount(svg, { tema: "escuro", detalhe: det });
      const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { o.disconnect(); L.mount(svg, { tema: "escuro", detalhe: det, dur: 1400, espera: 150 }); } }, { threshold: .5 });
      o.observe(svg);
    });
  };
  if (ab && html.classList.contains("abrindo") && L) {
    L.mount($(".ab-logo", ab), { tema: "escuro", detalhe: true, dur: 850, espera: 150 });
    let saiu = false;
    const sai = () => {
      if (saiu) return; saiu = true;
      try { sessionStorage.setItem("finora-abertura", "1"); } catch { /* sem storage: só não lembra */ }
      ab.classList.add("sai");
      html.classList.remove("abrindo");
      montaMarcas();
      setTimeout(() => ab.remove(), 650);
    };
    setTimeout(sai, 1400);
    ab.addEventListener("click", sai);
    addEventListener("keydown", sai, { once: true });
  } else {
    html.classList.remove("abrindo");
    if (ab) ab.remove();
    montaMarcas();
  }

  /* topo ganha fundo depois que a página rola */
  const topo = $(".topo");
  const onScroll = () => topo.classList.toggle("rolou", scrollY > 12);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* menu do celular */
  const mbt = $(".menu-bt"), menu = $("#menu");
  const fecha = () => { menu.classList.remove("aberto"); mbt.setAttribute("aria-expanded", "false"); mbt.setAttribute("aria-label", "Abrir menu"); };
  mbt.addEventListener("click", () => {
    const abre = !menu.classList.contains("aberto");
    menu.classList.toggle("aberto", abre);
    mbt.setAttribute("aria-expanded", String(abre)); mbt.setAttribute("aria-label", abre ? "Fechar menu" : "Abrir menu");
  });
  $$("a", menu).forEach((a) => a.addEventListener("click", fecha));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("aberto")) { fecha(); mbt.focus(); } });

  /* abrir ou atualizar a página sempre começa no topo */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);

  /* item do menu acende na seção em que a pessoa está */
  if (IO) {
    const links = $$('.menu a[href^="#"]');
    const io = new IO((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("ativo", a.getAttribute("href") === "#" + e.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    $$("main > section").forEach((s) => io.observe(s));
  }

  /* ------------------------------------------------------------------
     CELULAR DO TOPO — funciona como um celular de verdade: a tela rola
     até o que importa, o dedo toca a próxima aba na barra de baixo e a
     página nova entra pela direita. O aviso ao lado conta a mesma coisa.
     Pausa com o mouse em cima, com foco dentro, fora da tela ou com a aba
     escondida. Com movimento reduzido, só troca quando a pessoa escolhe.
     ------------------------------------------------------------------ */
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  const freia = (x) => 1 - Math.pow(1 - x, 3);
  const inOut = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const vit = $(".vitrine");
  if (vit) {
    const telas = $$(".app-tela", vit), imgs = telas.map((t) => $("img", t)), navs = $$(".app-nav img", vit);
    const toque = $(".toque", vit), pontos = $$(".vit-pontos button", vit), aviso = $(".aviso", vit);
    // onde cada tela começa e onde para (fração da altura da captura): Painel para em "Próximos
    // vencimentos", Lançamentos abre já na lista, Cartões desce até "Parcelamentos em aberto"
    const INICIO = [0, .44, 0], ROLA = [.6115, .48, .585];
    const ABA = [10, 30, 50];        // centro de cada aba na barra de baixo (5 abas)
    const AV = [
      { tom: "", ic: "i-sino", t: "Aviso da Finora", b: "Conta de luz vence em 3 dias", s: "07/10 · R$\u00a0187,40" },
      { tom: "lanc", ic: "i-sync", t: "Open Finance", b: "Uber já veio em Transporte", s: "Extrato do banco, sem digitar" },
      { tom: "cartao", ic: "i-parc", t: "Parcelas deste mês", b: "3 compras somam R$\u00a0990,00", s: "Notebook: faltam 5 de 10" },
    ];
    let i = 0, ciclo = 0, rodando = false, pausa = false, visivel = true, giro = 0;
    const abre = $(".abre");
    const avisa = (k) => {
      const a = AV[k];
      const aplica = () => {
        aviso.dataset.tom = a.tom;
        $(".aviso-ic use", aviso).setAttribute("href", "#" + a.ic);
        $(".aviso-txt", aviso).innerHTML = `<small>${a.t}</small><b>${a.b}</b><span>${a.s}</span>`;
        requestAnimationFrame(() => requestAnimationFrame(() => aviso.classList.remove("troca")));
      };
      if (reduz) { aplica(); return; }
      aviso.classList.add("troca"); setTimeout(aplica, 240);
    };
    const poe = (k, y) => { imgs[k].style.transform = `translateY(${y.toFixed(1)}px)`; imgs[k].dataset.y = y; };
    const alvo = (k, frac) => { const max = Math.max(0, imgs[k].clientHeight - telas[k].clientHeight); return -Math.min(max, Math.max(0, imgs[k].clientHeight * frac - 6)); };
    const rola = (k, frac, dur) => new Promise((ok) => {
      const de = +imgs[k].dataset.y || 0, ate = alvo(k, frac);
      if (reduz || !dur) { poe(k, ate); return ok(); }
      const t0 = performance.now();
      const passo = (now) => { const x = Math.min(1, (now - t0) / dur); poe(k, de + (ate - de) * freia(x)); x < 1 ? requestAnimationFrame(passo) : ok(); };
      requestAnimationFrame(passo);
    });
    const vai = (n, dedo) => {
      n = (n + telas.length) % telas.length;
      if (n === i) return;
      if (dedo && !reduz) { toque.style.left = ABA[n] + "%"; toque.classList.remove("on"); void toque.offsetWidth; toque.classList.add("on"); }
      navs.forEach((im, k) => im.classList.toggle("on", k === n));
      const velha = telas[i];
      poe(n, alvo(n, INICIO[n]));
      abre.style.setProperty("--giro", (giro += 6) + "deg");   // o aro do topo anda uma marcação
      // o dedo encosta, a tela responde logo depois
      setTimeout(() => {
        velha.classList.remove("on"); velha.classList.add("sai");
        telas[n].classList.add("on");
        setTimeout(() => { const v = telas.indexOf(velha); velha.classList.remove("sai"); poe(v, alvo(v, INICIO[v])); }, 420);
      }, dedo && !reduz ? 150 : 0);
      i = n;
      pontos.forEach((p, k) => p.setAttribute("aria-pressed", String(k === i)));
      avisa(i);
    };
    const pode = (meu) => meu === ciclo && !pausa && visivel && !document.hidden;
    async function roda() {
      if (rodando || reduz) return;
      rodando = true; const meu = ++ciclo;
      while (pode(meu)) {
        await dorme(450); if (!pode(meu)) break;
        await rola(i, ROLA[i], 1100); if (!pode(meu)) break;
        await dorme(900); if (!pode(meu)) break;
        vai(i + 1, true);
        await dorme(450);
      }
      rodando = false;
    }
    const para = () => { ciclo++; };
    let liberado = false;   // só começa depois da abertura e da entrada do aparelho
    const segue = () => { if (liberado && !pausa && visivel && !document.hidden) roda(); };
    pontos.forEach((p, k) => p.addEventListener("click", () => { para(); vai(k, true); setTimeout(segue, 1200); }));
    vit.addEventListener("mouseenter", () => { pausa = true; para(); });
    vit.addEventListener("mouseleave", () => { pausa = false; segue(); });
    vit.addEventListener("focusin", () => { pausa = true; para(); });
    vit.addEventListener("focusout", () => { pausa = false; segue(); });
    document.addEventListener("visibilitychange", () => (document.hidden ? para() : segue()));
    if (IO) new IO(([e]) => { visivel = e.isIntersecting; visivel ? segue() : para(); }).observe(vit);
    // começa depois da abertura e da entrada do aparelho
    const comeca = () => (html.classList.contains("abrindo") ? setTimeout(comeca, 120) : setTimeout(() => { liberado = true; segue(); }, 1400));
    comeca();
  }

  /* carrosséis horizontais: as setas andam um cartão e se apagam nas pontas */
  $$("[data-rola]").forEach((b) => {
    const lista = document.getElementById(b.getAttribute("aria-controls"));
    if (!lista) return;
    const passo = () => { const li = lista.firstElementChild; return li ? li.getBoundingClientRect().width + parseFloat(getComputedStyle(lista).columnGap || 0) : 300; };
    b.addEventListener("click", () => lista.scrollBy({ left: passo() * +b.dataset.rola, behavior: reduz ? "auto" : "smooth" }));
    const sync = () => {
      const fim = lista.scrollWidth - lista.clientWidth - 4;
      b.disabled = +b.dataset.rola < 0 ? lista.scrollLeft <= 4 : lista.scrollLeft >= fim;
    };
    lista.addEventListener("scroll", sync, { passive: true }); addEventListener("resize", sync); sync();
  });

  /* ------------------------------------------------------------------
     NA PRÁTICA — abas (WAI-ARIA) com exemplos que respondem ao toque.
     Os números batem com as telas do celular do topo.
     ------------------------------------------------------------------ */
  const pr = $(".pratica");
  if (pr) {
    const abas = $$('[role="tab"]', pr), cursor = $(".pr-cursor", pr), lista = $(".pr-abas", pr);
    const mede = () => { const a = abas.find((x) => x.getAttribute("aria-selected") === "true"); cursor.style.setProperty("--x", a.offsetLeft + "px"); cursor.style.setProperty("--w", (a.offsetWidth / 100).toFixed(3)); };
    const abre = (a, foco) => {
      abas.forEach((x) => { const sim = x === a; x.setAttribute("aria-selected", String(sim)); x.tabIndex = sim ? 0 : -1; document.getElementById(x.getAttribute("aria-controls")).hidden = !sim; });
      const painel = document.getElementById(a.getAttribute("aria-controls"));
      painel.classList.remove("entra"); void painel.offsetWidth; painel.classList.add("entra");
      $$(".demo", painel).forEach((d) => d.classList.add("visto"));
      mede(); if (foco) a.focus();
      a.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduz ? "auto" : "smooth" });
      if (a.id === "pa-nora") conversa(+($(".dn-sug [aria-pressed='true']", pr)?.dataset.ex || 0));
      demonstra(a.id);
    };
    abas.forEach((a) => a.addEventListener("click", (e) => { if (e.isTrusted) assume(); abre(a); }));
    lista.addEventListener("keydown", (e) => {
      const n = abas.indexOf(document.activeElement); if (n < 0) return;
      const vai = { ArrowRight: n + 1, ArrowLeft: n - 1, Home: 0, End: abas.length - 1 }[e.key];
      if (vai === undefined) return; e.preventDefault(); assume(); abre(abas[(vai + abas.length) % abas.length], true);
    });
    addEventListener("resize", mede); document.fonts && document.fonts.ready.then(mede); mede();

    // parcelas: e se parcelar mais uma compra?
    const conta = (el, ate) => {
      const de = +(el.dataset.v ?? ate); el.dataset.v = ate;
      if (reduz || de === ate) { el.textContent = ate.toLocaleString("pt-BR"); return; }
      const t0 = performance.now();
      const passo = (now) => { const x = Math.min(1, (now - t0) / 350); el.textContent = Math.round(de + (ate - de) * freia(x)).toLocaleString("pt-BR"); if (x < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    };
    const dp = $(".demo-parc", pr), MAX = 1400, NOVO = 300;
    const pinta = (sim) => $$(".dp-col", dp).forEach((c) => {
      const v = +c.dataset.v;
      c.style.setProperty("--h", (v / MAX).toFixed(3)); c.style.setProperty("--hn", ((v + NOVO) / MAX).toFixed(3));
      conta($("b", c), v + (sim ? NOVO : 0));
    });
    pinta(false);
    const bp = $(".dp-sim", dp);
    bp.addEventListener("click", () => {
      const sim = bp.getAttribute("aria-pressed") !== "true";
      bp.setAttribute("aria-pressed", String(sim)); dp.classList.toggle("sobe", sim); pinta(sim);
      $(".demo-diz", dp).textContent = sim ? "Com o celular, novembro e dezembro vão para R$\u00a01.290 só em parcelas." : "Notebook, geladeira e passagem já ocupam R$\u00a0990 em novembro e dezembro.";
    });

    // orçamento: o medidor responde ao gasto
    const dor = $(".demo-orc", pr), rg = $("#do-gasto", dor), LIM = 400;
    const MSG = { ok: "Tudo certo. Ainda sobra espaço no orçamento.", alerta: "Aviso: você já usou 80% do que separou para Restaurantes.", passou: "Passou do limite de Restaurantes. A Finora avisa na hora." };
    const orc = () => {
      const v = +rg.value, p = v / LIM, est = p > 1 ? "passou" : p >= .8 ? "alerta" : "ok";
      dor.style.setProperty("--pn", Math.min(p, 1).toFixed(3));
      $("#do-out", dor).textContent = "R$ " + v;
      if (est !== dor.dataset.estado || !$(".do-msg", dor).textContent) { dor.dataset.estado = est; $(".do-msg", dor).textContent = MSG[est]; }
    };
    rg.addEventListener("input", orc); orc();

    // reserva: quanto guardar por mês e quando fica pronta (começa a guardar em outubro)
    const dm = $(".demo-meta", pr), rm = $("#dm-mes", dm), FALTA = 9800, N = 24;
    const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    $(".dm-meses", dm).innerHTML = Array.from({ length: N }, () => "<i></i>").join("");
    const bolas = $$(".dm-meses i", dm);
    const meta = () => {
      const v = +rm.value, n = Math.ceil(FALTA / v), d = new Date(2026, 9 + n - 1, 1);
      $("#dm-out", dm).textContent = "R$ " + v.toLocaleString("pt-BR");
      bolas.forEach((b, k) => { b.classList.toggle("on", k < n); b.classList.toggle("fim", k === Math.min(n, N) - 1); });
      $(".dm-msg", dm).innerHTML = `Em <b>${n} ${n === 1 ? "mês" : "meses"}</b> a reserva está pronta: <b>${MESES[d.getMonth()]} de ${d.getFullYear()}</b>.`;
    };
    rm.addEventListener("input", meta); meta();

    // nora: a conversa se escreve sozinha
    const EX = [
      [["eu", "gastei 80 na farmácia"], ["ela", "Anoto R$ 80,00 em Saúde, na sua conta corrente. Posso lançar?"], ["eu", "pode"], ["ela", "Pronto, lançado."]],
      [["eu", "quanto gastei com restaurante?"], ["ela", "Em outubro, R$ 320,00. É 80% do que você separou para Restaurantes."]],
      [["eu", "o que vence essa semana?"], ["ela", "Aluguel dia 06, R$ 1.650,00, e luz dia 07, R$ 187,40."]],
    ];
    const caixa = $(".dn-conversa", pr), sug = $$(".dn-sug button", pr);
    let vez = 0;
    async function conversa(k) {
      const minha = ++vez;
      sug.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.ex === k)));
      caixa.innerHTML = "";
      for (const [quem, texto] of EX[k]) {
        if (quem === "ela" && !reduz) {
          const d = document.createElement("li"); d.className = "ela dig"; d.innerHTML = "<i></i><i></i><i></i>"; caixa.appendChild(d);
          await dorme(650); d.remove();
        }
        if (minha !== vez) return;
        const li = document.createElement("li"); li.className = quem; li.textContent = texto; caixa.appendChild(li);
        if (!reduz) await dorme(quem === "eu" ? 350 : 500);
        if (minha !== vez) return;
      }
    }
    sug.forEach((b) => b.addEventListener("click", () => conversa(+b.dataset.ex)));
    conversa(0);

    // AUTOMÁTICO: sem clicar em nada, as abas se alternam e cada exemplo mostra o que faz.
    // Basta a pessoa tocar em qualquer coisa da seção para o automático parar e ela assumir.
    const TEMPO = { "pa-parc": 6500, "pa-orc": 7000, "pa-meta": 6500, "pa-nora": 8000 };
    let auto = !reduz, visto = false, relogio = 0, quadros = [], conversaAuto = 0;
    const limpa = () => { quadros.forEach(clearTimeout); quadros = []; };
    const desliza = (input, de, ate, dur, depois) => {
      const t0 = performance.now();
      const anda = (now) => {
        if (!auto) return;
        const x = Math.min(1, (now - t0) / dur), v = de + (ate - de) * inOut(x);
        input.value = String(Math.round(v / +input.step) * +input.step); input.dispatchEvent(new Event("input", { bubbles: true }));
        if (x < 1) requestAnimationFrame(anda); else if (depois) depois();
      };
      requestAnimationFrame(anda);
    };
    function demonstra(id) {
      limpa();
      if (!auto) return;
      if (id === "pa-parc") {
        if (bp.getAttribute("aria-pressed") === "true") bp.click();
        quadros.push(setTimeout(() => auto && bp.click(), 1400));
      } else if (id === "pa-orc") {
        desliza(rg, 120, 320, 1600, () => quadros.push(setTimeout(() => desliza(rg, 320, 470, 1500), 1300)));
      } else if (id === "pa-meta") {
        desliza(rm, 400, 1400, 3200);
      } else if (id === "pa-nora") {
        conversaAuto = (conversaAuto + 1) % EX.length; conversa(conversaAuto);
      }
      clearTimeout(relogio);
      pr.style.setProperty("--tempo", (TEMPO[id] || 7000) + "ms");
      relogio = setTimeout(proxima, TEMPO[id] || 7000);
    }
    function proxima() {
      if (!auto) return;
      if (!visto || document.hidden) { relogio = setTimeout(proxima, 800); return; }
      const n = abas.findIndex((x) => x.getAttribute("aria-selected") === "true");
      abre(abas[(n + 1) % abas.length]);
    }
    function assume() { if (!auto) return; auto = false; limpa(); clearTimeout(relogio); pr.classList.remove("auto"); }
    // qualquer gesto da pessoa dentro dos exemplos (tocar, arrastar, digitar) devolve o controle a ela
    pr.addEventListener("pointerdown", (e) => { if (e.isTrusted) assume(); });
    pr.addEventListener("keydown", (e) => { if (e.isTrusted) assume(); });
    if (auto) {
      pr.classList.add("auto");
      if (IO) new IO(([e]) => {
        visto = e.isIntersecting; pr.classList.toggle("parado", !visto);
        if (visto && !relogio) demonstra(abas.find((x) => x.getAttribute("aria-selected") === "true").id);
      }, { threshold: .35 }).observe(pr);
    }
  }

  /* PREÇO — uma escolha (mensal/anual), um botão que leva a escolha junto */
  const pb = $(".preco-bloco");
  if (pb) {
    const P = {
      mensal: { v: "14,90", per: "/mês", d: "Sem fidelidade. Cancele quando quiser." },
      anual: { v: "149,90", per: "/ano", d: "R$\u00a012,49 por mês. R$\u00a028,90 a menos que pagar mês a mês." },
    };
    const ops = $$(".pb-escolha button", pb), cta = $(".pb-cta", pb);
    const escolhe = (b, foco) => {
      const k = b.dataset.plano;
      ops.forEach((x) => { x.setAttribute("aria-checked", String(x === b)); x.tabIndex = x === b ? 0 : -1; });
      $(".pb-valor", pb).textContent = P[k].v; $(".pb-per", pb).textContent = P[k].per; $(".pb-desc", pb).textContent = P[k].d;
      cta.dataset.plano = k; cta.setAttribute("href", (root.dataset.login || "/app/") + "?plano=" + k);
      if (foco) b.focus();
    };
    ops.forEach((b) => b.addEventListener("click", () => escolhe(b)));
    $(".pb-escolha", pb).addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault(); const n = ops.indexOf(document.activeElement); escolhe(ops[(n + (e.key === "ArrowRight" ? 1 : -1) + ops.length) % ops.length], true);
    });
    escolhe(ops.find((x) => x.getAttribute("aria-checked") === "true"));
  }

  /* A NORA — a mascote aparece no canto depois da abertura e, uma vez por sessão, diz oi */
  const nf = $(".nora-fab");
  if (nf) {
    const chega = () => {
      if (html.classList.contains("abrindo")) return setTimeout(chega, 300);
      setTimeout(() => nf.classList.add("pronta"), reduz ? 0 : 1200);
      let disse = false; try { disse = !!sessionStorage.getItem("finora-nora-oi"); } catch { /* sem storage */ }
      if (disse || reduz) return;
      setTimeout(() => {
        if (nf.classList.contains("escondida")) return;
        nf.classList.add("fala");
        try { sessionStorage.setItem("finora-nora-oi", "1"); } catch { /* sem storage */ }
        setTimeout(() => nf.classList.remove("fala"), 6000);
      }, 7000);
    };
    chega();
  }

  /* HISTÓRIAS — esteira contínua: os cartões deslizam devagar e sem emenda (a lista é
     duplicada e anda meia volta em loop). Para com o mouse, o foco, um toque no celular
     ou fora da tela. Com movimento reduzido, fica a lista normal para arrastar. */
  const hl = $("#hist-lista");
  if (hl && !reduz) {
    const originais = [...hl.children];
    originais.forEach((li) => { const c = li.cloneNode(true); c.setAttribute("aria-hidden", "true"); c.inert = true; hl.appendChild(c); });
    hl.classList.add("esteira"); $("#historias").classList.add("com-esteira");
    // velocidade fixa (~40 px/s), qualquer que seja a largura dos cartões
    const ritmo = () => { const meia = hl.scrollWidth / 2; hl.style.setProperty("--dur", Math.max(30, meia / 40).toFixed(1) + "s"); };
    ritmo(); addEventListener("resize", ritmo);
    let solta = 0;
    hl.addEventListener("touchstart", () => { hl.classList.add("parado"); clearTimeout(solta); }, { passive: true });
    hl.addEventListener("touchend", () => { clearTimeout(solta); solta = setTimeout(() => hl.classList.remove("parado"), 2500); }, { passive: true });
    if (IO) new IO(([e]) => hl.classList.toggle("fora", !e.isIntersecting)).observe(hl);
  }

  /* CTA fixo no celular: aparece depois da abertura, some nos planos e no fecho */
  const fixo = $(".cta-fixo");
  if (fixo && IO) {
    const vistos = new Map();
    const alvos = [$(".abre"), $("#planos"), $(".fecho"), $(".rodape", document)];
    const io = new IO((es) => {
      es.forEach((e) => vistos.set(e.target, e.isIntersecting));
      fixo.classList.toggle("on", !alvos.some((a) => vistos.get(a)));
    });
    alvos.forEach((a) => a && io.observe(a));
  }

  /* ------------------------------------------------------------------
     CHAT COM A NORA (pré-venda). Pergunta vai para /api/vendas/chat;
     quando a Nora não sabe, oferece mandar a dúvida por e-mail.
     ------------------------------------------------------------------ */
  const EMAIL = "finora@gmail.com";
  const at = document.getElementById("atende");
  if (at) {
    const lista = $(".at-msgs", at), sug = $(".at-sug", at), form = $(".at-form", at), campo = $("#at-in", at);
    const status = $(".at-status", at), enviar = $("button[type=submit]", form);
    const estado = (ok) => { status.textContent = ok ? "Assistente da Finora" : "Sem conexão agora · respondemos por e-mail"; status.classList.toggle("off", !ok); };
    const conversa = [];
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
    function balao(papel, texto, email, refaz) {
      const li = document.createElement("li");
      li.className = "at-m " + (papel === "eu" ? "eu" : "ela");
      li.innerHTML = papel === "eu" ? esc(texto) : formata(texto);
      if (refaz) {
        // falhou: oferece repetir a mesma pergunta, sem a pessoa redigitar
        const b = document.createElement("button");
        b.type = "button"; b.className = "at-acao"; b.textContent = "Tentar de novo";
        b.addEventListener("click", () => { b.remove(); pergunta(refaz, true); });
        li.appendChild(document.createElement("br")); li.appendChild(b);
      }
      if (email) {
        const a = document.createElement("a");
        a.className = "at-email"; a.href = mailto();
        a.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 5L2 7"/></svg>Enviar minha dúvida por e-mail';
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
      rola();
    }
    async function pergunta(texto, repete) {
      texto = (texto || "").trim().slice(0, 500);
      if (!texto || ocupado) return;
      ocupado = true; sugere([]); enviar.disabled = true;
      if (!repete) { conversa.push({ papel: "eu", texto }); balao("eu", texto); }
      const dig = document.createElement("li");
      dig.className = "at-m ela at-dig"; dig.setAttribute("role", "status");
      dig.innerHTML = '<i></i><i></i><i></i><span class="sr">A Nora está escrevendo</span>';
      lista.appendChild(dig); rola();
      // respostas pensadas podem levar alguns segundos: depois de 6 s, diz que está pensando
      const calma = setTimeout(() => { dig.insertAdjacentHTML("beforeend", "<span>pensando com calma…</span>"); rola(); }, 6000);
      // nunca espera para sempre: 50 s e desiste com uma saída clara
      const corte = new AbortController(), limite = setTimeout(() => corte.abort(), 50000);
      let r, falhou = false;
      try {
        if (navigator.onLine === false) throw new Error("offline");
        const resp = await fetch("/api/vendas/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagens: conversa.slice(-12) }), signal: corte.signal });
        if (resp.status === 429) { r = { resposta: `Recebi muitas mensagens seguidas. Espere alguns minutos ou escreva para **${EMAIL}**.`, email: true }; falhou = true; }
        else if (!resp.ok) throw new Error(resp.status);
        else { r = await resp.json(); estado(true); if (!r || !r.resposta) throw new Error("vazia"); }
      } catch (err) {
        estado(false); falhou = true;
        r = navigator.onLine === false
          ? { resposta: "Parece que você está sem internet. Assim que a conexão voltar, toque em **Tentar de novo**.", email: false }
          : err && err.name === "AbortError"
            ? { resposta: `Demorei demais para responder. Tente de novo ou escreva para **${EMAIL}**.`, email: true }
            : { resposta: `Não consegui responder agora. Tente de novo em instantes ou escreva para **${EMAIL}**.`, email: true };
      } finally { clearTimeout(calma); clearTimeout(limite); }
      dig.remove();
      // erro não entra no histórico que vai para a IA; só respostas de verdade
      if (!falhou) conversa.push({ papel: "nora", texto: r.resposta });
      balao("nora", r.resposta, r.email, falhou ? texto : null);
      sugere(falhou ? [] : r.sugestoes);
      ocupado = false; enviar.disabled = false; campo.focus();
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (ocupado) return;                      // não apaga o que a pessoa digitou enquanto a Nora responde
      const t = campo.value; campo.value = ""; pergunta(t);
    });
    const fab = $(".nora-fab");
    const abreChat = () => {
      if (fab) fab.classList.add("escondida");
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
      if (fab) fab.classList.remove("escondida");
      setTimeout(() => { if (!at.classList.contains("on")) at.hidden = true; }, 220);
      if (voltaFoco && voltaFoco.focus) voltaFoco.focus();
    };
    $("[data-fecha-chat]", at).addEventListener("click", fechaChat);
    at.addEventListener("keydown", (e) => { if (e.key === "Escape") fechaChat(); });
    $$("[data-abre-chat]").forEach((b) => b.addEventListener("click", abreChat));
  }

  /* ------------------------------------------------------------------
     REVELAÇÃO AO ROLAR — só com movimento permitido. Sem JS ou com
     movimento reduzido, tudo já aparece no lugar.
     ------------------------------------------------------------------ */
  if (reduz || !IO) return;
  document.documentElement.classList.add("js-anim");
  const revelar = $$(".pr-painel:not([hidden]) .demo, .hist, .fluxo, .fecho-relogio");
  revelar.forEach((el) => el.setAttribute("data-rev", ""));
  const io = new IO((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    e.target.classList.add("visto");
  }), { rootMargin: "0px 0px -10% 0px" });
  revelar.forEach((el) => io.observe(el));
})();
