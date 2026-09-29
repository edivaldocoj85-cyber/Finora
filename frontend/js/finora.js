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
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#4f46e5"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs>
      <ellipse class="n-sombra" cx="80" cy="160" rx="36" ry="6" fill="#15133a" opacity=".16"/>
      <g class="n-tudo">
        <g class="n-antena"><path d="M80 36 Q83 22 93 15" fill="none" stroke="#312e81" stroke-width="4.5" stroke-linecap="round"/><circle cx="94" cy="14" r="8" fill="#67e8f9"/><circle cx="91.5" cy="11.5" r="2.4" fill="#fff" opacity=".8"/></g>
        <path class="n-braco-e" d="M34 100 q-16 6 -18 22" fill="none" stroke="#4338ca" stroke-width="10" stroke-linecap="round"/>
        <g class="n-braco-d"><path d="M126 96 q18 -6 22 -26" fill="none" stroke="#0e7490" stroke-width="10" stroke-linecap="round"/></g>
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
  if (!reduz) document.documentElement.classList.add("js-anim");
})();
