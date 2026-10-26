/*
 * Configuración de entorno del Taller de APIs.
 *
 * Se carga antes que el resto de la página para dos cosas:
 *   1. Aplicar el tema y el acento guardados sin destello blanco.
 *   2. Publicar `window.TALLER_CONFIG` con el servidor por defecto.
 *
 * La versión web usa el propio origen (`apiBase: ""`). La app nativa usa una
 * copia generada por `scripts/construir-app.mjs` que trae el servidor remoto y
 * `nativo: true`. Nada de claves: este archivo viaja al dispositivo.
 */
(function () {
  "use strict";

  var CONFIG = {
    nativo: false,
    apiBase: "",
    version: "1.0.0",
    compilado: "web",
  };
  window.TALLER_CONFIG = Object.freeze(CONFIG);

  var RAIZ = document.documentElement;
  var TEMAS = ["tema-claro", "tema-oscuro"];
  var ACENTOS = ["acento-indigo", "acento-jade", "acento-ambar", "acento-violeta"];

  function leer(clave) {
    try {
      return window.localStorage.getItem(clave);
    } catch {
      return null;
    }
  }

  var tema = leer("taller:tema");
  if (TEMAS.indexOf(tema) === -1) {
    var oscuro = false;
    try {
      oscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      oscuro = false;
    }
    tema = oscuro ? "tema-oscuro" : "tema-claro";
  }

  var acento = leer("taller:acento");
  if (ACENTOS.indexOf(acento) === -1) acento = "acento-indigo";

  for (var i = 0; i < TEMAS.length; i += 1) RAIZ.classList.remove(TEMAS[i]);
  for (var j = 0; j < ACENTOS.length; j += 1) RAIZ.classList.remove(ACENTOS[j]);
  RAIZ.classList.add(tema);
  RAIZ.classList.add(acento);

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "tema-oscuro" ? "#090c14" : "#f5f7fb");
})();
