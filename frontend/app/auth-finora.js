/* FINORA — entrada da tela de login (fade dos blocos + frase rotativa no cartão lateral).
   Não toca na lógica de login: o app.js chama FinoraAuth.entrar() ao mostrar a tela. */
(function () {
  "use strict";
  const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FRASES = ["Suas contas continuaram organizadas enquanto você esteve fora.",
    "Os lançamentos novos já chegaram categorizados.",
    "Confira o que vence hoje logo na primeira tela."];
  let pronto = false, timer = null;

  function prepara(auth) {
    if (pronto) return; pronto = true;
    auth.querySelectorAll(".fa-r").forEach((el, k) => (el.style.transitionDelay = 80 + k * 60 + "ms"));
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
      setTimeout(() => { fr.textContent = FRASES[fi]; fr.style.opacity = 1; }, 400);
    }, 5000);
  }
  window.FinoraAuth = { entrar };
})();
