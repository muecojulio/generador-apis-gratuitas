"use strict";

// ARCHIVO GENERADO. No lo edites a mano.
// Lo reescribe scripts/registrar.mjs a partir de api/<nombre>/spec.json.
// Las rutas son literales a propósito: así Vercel empaqueta cada plano
// dentro de la función y la API responde sin leer nada más.

const registro = {
  "demo-gimnasio": require("../api/demo-gimnasio/spec.json"),
  "demo-recetas": require("../api/demo-recetas/spec.json"),
  "ejemplo-notas": require("../api/ejemplo-notas/spec.json"),
};

module.exports = { registro, nombres: Object.keys(registro) };
