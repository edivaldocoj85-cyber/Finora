/* =====================================================================
   FINORA — logo viva ("A medida"). Um relógio financeiro minimalista:
   círculo dividido em 5 arcos (38·24·16·12·10, o último em coral), um
   ponteiro que lê o mês e, no tamanho grande, aro de relógio com 60
   marcações e um ponteiro de segundos coral que marca a hora real.

   FinoraLogo.mount(svgEl, { tema: "claro"|"escuro", intro: true, vivo: true, detalhe: "auto"|true|false })
   - intro: arcos se desenham, o ponteiro dá uma volta lendo cada arco e
     assenta no coral com um clique mecânico mínimo.
   - vivo: o ponteiro de segundos gira; passar o mouse dá uma volta de leitura.
   - detalhe "auto": aro e segundos só a partir de 96px (no cabeçalho seriam ruído).
   Com prefers-reduced-motion, desenha o estado final parado.
   ===================================================================== */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const C = 32, R = 22, T = 9, GAP = 7, PART = [.38, .24, .16, .12, .10];
  const TEMA = {
    claro: { arcos: ["#5b2a86", "#7a3ea6", "#9a62c0", "#bf98da", "#ff7a59"], mao: "#2a1633", aro: "#6e6078", sombra: "#2a1633", op: .22 },
    escuro: { arcos: ["#e9d9f6", "#cdb0e8", "#b08ad6", "#8f63bd", "#ff7a59"], mao: "#fbf8f6", aro: "#cdbbd9", sombra: "#0b0510", op: .5 },
  };
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;   // in-out cúbico
  let uid = 0;

  const rad = (a) => a * Math.PI / 180;
  const pt = (a, r) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];
  const mix = (hex, alvo, t) => {
    const h = (x) => parseInt(x, 16), c = [1, 3, 5].map((i) => h(hex.slice(i, i + 2))), d = [1, 3, 5].map((i) => h(alvo.slice(i, i + 2)));
    return "#" + c.map((v, i) => Math.round(v + (d[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  function arcos() {
    const livre = 360 - GAP * PART.length; let a = -90 + GAP / 2; const out = [];
    PART.forEach((p) => { const a1 = a + livre * p; out.push([a, a1]); a = a1 + GAP; });
    return out;
  }
  const arcoD = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(3)} ${y0.toFixed(3)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`; };
  const el = (tag, attrs, pai) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (pai) pai.appendChild(e); return e; };

  function mount(svg, opt = {}) {
    const tema = opt.tema === "escuro" ? "escuro" : "claro", t = TEMA[tema];
    const id = "fl" + (++uid), as = arcos(), coral = as[as.length - 1], alvo = (coral[0] + coral[1]) / 2 + 90;
    const intro = opt.intro !== false && !reduz, vivo = opt.vivo !== false && !reduz;
    const detalhe = opt.detalhe === true || (opt.detalhe !== false && svg.getBoundingClientRect().width >= 96);
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.innerHTML = "";
    svg.classList.add("flogo");
    const defs = el("defs", {}, svg);
    // cor quase lisa: só um leve degradê de luz vinda do alto
    t.arcos.forEach((c, i) => {
      const g = el("linearGradient", { id: `${id}g${i}`, gradientUnits: "userSpaceOnUse", x1: 20, y1: 6, x2: 44, y2: 58 }, defs);
      el("stop", { offset: 0, "stop-color": mix(c, "#ffffff", .08) }, g);
      el("stop", { offset: 1, "stop-color": mix(c, "#000000", .1) }, g);
    });
    const sh = el("filter", { id: `${id}s`, x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
    el("feDropShadow", { dx: 0, dy: 1, stdDeviation: 1, "flood-color": t.sombra, "flood-opacity": t.op }, sh);

    // aro de relógio: 60 marcações, 12 maiores
    if (detalhe) {
      const aro = el("g", { class: "fl-aro" }, svg);
      for (let i = 0; i < 60; i++) {
        const a = i * 6 - 90, maior = i % 5 === 0, [x0, y0] = pt(a, maior ? 27.4 : 28), [x1, y1] = pt(a, 29.6);
        el("path", { d: `M${x0.toFixed(3)} ${y0.toFixed(3)}L${x1.toFixed(3)} ${y1.toFixed(3)}`, stroke: t.aro, "stroke-opacity": maior ? .85 : .4, "stroke-width": maior ? .55 : .25, "stroke-linecap": "round" }, aro);
      }
    }

    const anel = el("g", { filter: `url(#${id}s)` }, svg);
    const partes = as.map(([a0, a1], i) => {
      const g = el("g", { class: "fl-arco" }, anel);
      el("path", { d: arcoD(a0, a1, R), fill: "none", stroke: `url(#${id}g${i})`, "stroke-width": T, pathLength: 1 }, g);
      return { g, a0, a1 };
    });

    // ponteiro de horas: lança fina com contrapeso
    const L = R - T / 2 - 3;
    const maos = el("g", { filter: `url(#${id}s)` }, svg);
    const agulha = el("g", { class: "fl-mao" }, maos);
    el("polygon", { points: `${C - 1.15},${C} ${C + 1.15},${C} ${C + .35},${C - L} ${C - .35},${C - L}`, fill: t.mao }, agulha);
    el("rect", { x: C - .8, y: C, width: 1.6, height: 5, rx: .8, fill: t.mao }, agulha);
    let segundos = null;
    if (detalhe) {
      segundos = el("g", { class: "fl-seg" }, maos);
      el("path", { d: `M${C} ${C + 5}V${C - (R + T / 2 - .5)}`, stroke: "#ff7a59", "stroke-width": .45, "stroke-linecap": "round" }, segundos);
      el("circle", { cx: C, cy: C + 4.2, r: .9, fill: "#ff7a59" }, segundos);
    }
    el("circle", { cx: C, cy: C, r: 2.2, fill: t.mao }, maos);
    el("circle", { cx: C, cy: C, r: .85, fill: "#ff7a59" }, maos);

    // estado do ponteiro de horas
    let ang = intro ? 0 : alvo, anim = 0;
    const gira = () => agulha.setAttribute("transform", `rotate(${ang.toFixed(2)} ${C} ${C})`);
    const acende = () => {
      const a = ((ang - 90) % 360 + 360) % 360 - 360;
      partes.forEach((p) => p.g.classList.toggle("lido", [a, a + 360].some((x) => x >= p.a0 && x <= p.a1)));
    };
    // varredura precisa (in-out) seguida de um clique mecânico: 0,8° além e volta
    function varre(de, ate, dur) {
      cancelAnimationFrame(anim);
      const t0 = performance.now(), fim = dur + 220;
      const tick = (now) => {
        const e = now - t0;
        if (e < dur) ang = de + (ate - de) * ease(e / dur);
        else { const x = Math.min(1, (e - dur) / 220); ang = ate + .8 * Math.sin(x * Math.PI) * (1 - x); }
        gira(); acende();
        if (e < fim) anim = requestAnimationFrame(tick); else { ang = ate; gira(); acende(); }
      };
      anim = requestAnimationFrame(tick);
    }
    gira();
    if (!intro) { partes.forEach((p) => p.g.classList.add("vis")); acende(); }
    else {
      svg.classList.add("fl-intro");
      partes.forEach((p, i) => p.g.style.setProperty("--d", (i * 70) + "ms"));
      requestAnimationFrame(() => requestAnimationFrame(() => partes.forEach((p) => p.g.classList.add("vis"))));
      setTimeout(() => varre(0, alvo, opt.dur || 2200), opt.espera ?? 600);
    }

    // segundos reais, em movimento contínuo como um relógio de estação; só gira quando visível
    if (segundos) {
      if (intro) segundos.style.opacity = "0";
      let visivel = true, raf = 0;
      const rodar = () => {
        const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000;
        segundos.setAttribute("transform", `rotate(${(s * 6).toFixed(2)} ${C} ${C})`);
        raf = vivo && visivel && !document.hidden ? requestAnimationFrame(rodar) : 0;
      };
      rodar();
      if (intro) setTimeout(() => segundos.classList.add("fl-aparece"), (opt.espera ?? 600) + (opt.dur || 2200) + 100);
      if (vivo) {
        if (window.IntersectionObserver) new IntersectionObserver(([e]) => { visivel = e.isIntersecting; if (visivel && !raf) rodar(); }).observe(svg);
        document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) rodar(); });
      }
    }
    if (vivo) svg.addEventListener("mouseenter", () => { const base = Math.round((ang - alvo) / 360) * 360 + alvo; varre(base, base + 360, 1600); });
    return { reler: () => { const base = Math.round((ang - alvo) / 360) * 360 + alvo; varre(base, base + 360, 1600); } };
  }
  window.FinoraLogo = { mount };
})();
