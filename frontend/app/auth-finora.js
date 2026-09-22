/* FINORA — efeitos da tela de entrada (brasas, luz, título, frases).
   Não toca na lógica de login: o app.js chama FinoraAuth.entrar() ao mostrar a tela. */
(function () {
  "use strict";
  const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FRASES = ["Seu extrato continuou sendo lido enquanto você esteve fora.",
    "Cada lançamento novo já chegou organizado.",
    "O consultor deixou notas desde o seu último acesso."];
  let pronto = false, timer = null;

  function prepara(auth) {
    if (pronto) return; pronto = true;
    let i = 0;
    auth.querySelectorAll(".fa-saud .fa-l").forEach((l) => {
      l.innerHTML = l.textContent.trim().split(/\s+/).map((w) =>
        `<span class="fa-w"><span style="transition-delay:${150 + (i++) * 110}ms">${w}</span></span>`).join(" ");
    });
    auth.querySelectorAll(".fa-r").forEach((el, k) => (el.style.transitionDelay = 350 + k * 80 + "ms"));
    const br = auth.querySelector(".fa-brasas");
    if (br && !reduz()) for (let n = 0; n < 18; n++) {
      const e = document.createElement("i"), z = 1 + Math.random() * 2;
      Object.assign(e.style, { left: Math.random() * 100 + "%", width: z + "px", height: z + "px",
        animationDuration: 7 + Math.random() * 9 + "s", animationDelay: -Math.random() * 14 + "s" });
      e.style.setProperty("--dx", Math.random() * 120 - 60 + "px"); br.append(e);
    }
    const lado = auth.querySelector(".fa-lado"); let raf;
    lado?.addEventListener("pointermove", (ev) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { const r = lado.getBoundingClientRect();
        lado.style.setProperty("--mx", ev.clientX - r.left + "px"); lado.style.setProperty("--my", ev.clientY - r.top + "px"); });
    });
  }

  function entrar() {
    const auth = document.getElementById("auth");
    if (!auth) return;
    prepara(auth);
    auth.classList.remove("fa-on"); void auth.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => auth.classList.add("fa-on")));
    clearInterval(timer);
    const fr = document.getElementById("faFrase"); let fi = 0;
    if (fr && !reduz()) timer = setInterval(() => {
      if (auth.classList.contains("hidden")) { clearInterval(timer); return; }
      fi = (fi + 1) % FRASES.length; fr.style.opacity = 0;
      setTimeout(() => { fr.textContent = FRASES[fi]; fr.style.opacity = 1; }, 500);
    }, 5000);
  }
  window.FinoraAuth = { entrar };
})();
