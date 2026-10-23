"use strict";

/**
 * Resuelve qué plano corresponde a cada dirección /api/<nombre>.
 *
 * El registro (lib/registro.js) trae los planos ya empaquetados dentro de la
 * función, así que responde en milisegundos y sin llamar a nadie por internet.
 * Si un plano todavía no está en el registro (por ejemplo cuando trabajas en tu
 * computadora antes de desplegar), se busca en api/<nombre>/spec.json.
 *
 * El listado de APIs publicadas se calcula una vez y se guarda en la caché:
 * los planos solo cambian con un despliegue nuevo.
 */

const fs = require("fs");
const path = require("path");
const cache = require("./cache");
const { registro } = require("./registro");
const { limitesDe } = require("./limites");

const FORMATO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Nombres que ya son archivos, carpetas o rutas internas del taller.
// Debe coincidir con RESERVADOS_API de lib/motor.mjs (la prueba lo comprueba).
const RESERVADOS = new Set([
  "api",
  "assets",
  "data",
  "docs",
  "estado",
  "fuentes",
  "generar",
  "index",
  "lib",
  "listar",
  "privacidad",
  "proveedores",
  "public",
  "salud",
  "scripts",
  "seguridad",
  "spec",
  "specs",
  "static",
]);

const RAIZ_API = path.join(__dirname, "..", "api");

function valido(nombre) {
  const texto = String(nombre || "");
  return texto.length >= 2 && texto.length <= 48 && FORMATO.test(texto) && !RESERVADOS.has(texto);
}

function desdeDisco(nombre) {
  // `__dirname` es siempre `lib/` dentro de la función, también en Vercel.
  const archivo = path.join(RAIZ_API, nombre, "spec.json");
  const datos = fs.readFileSync(archivo, "utf8");
  return JSON.parse(datos);
}

function buscar(nombre) {
  const limpio = String(nombre || "").trim().toLowerCase();
  if (!valido(limpio)) return null;
  if (Object.prototype.hasOwnProperty.call(registro, limpio)) return registro[limpio];
  const clave = "spec-disco:" + limpio;
  const guardado = cache.obtener(clave);
  if (guardado) return guardado;
  let spec = null;
  try {
    spec = desdeDisco(limpio);
  } catch {
    spec = null;
  }
  // Solo se guarda lo que existe: si estás creando la carpeta en local, el
  // siguiente intento la vuelve a buscar en lugar de recordar el fallo.
  if (spec) cache.poner(clave, spec, 60 * 60 * 1000);
  return spec;
}

/** Todas las APIs publicadas, con lo justo para mostrarlas en una lista. */
function publicadas() {
  const guardado = cache.obtener("catalogo:publicadas");
  if (guardado) return guardado;
  const lista = Object.values(registro)
    .map((spec) => ({
      nombre: spec.nombre,
      titulo: spec.titulo,
      resumen: spec.resumen,
      motor: spec.motor || "incluido",
      origen: spec.origen || "",
      recursos: (spec.recursos || []).map((recurso) => recurso.nombre),
      soloLectura: Boolean(spec.soloLectura),
      protegida: Boolean(spec.auth && spec.auth.hash),
      modoToken: spec.auth ? (spec.auth.modo === "todo" ? "todo" : "escritura") : null,
      limites: limitesDe(spec),
      documentacion: "/docs?api=" + encodeURIComponent(spec.nombre),
      openapi: "/api/" + spec.nombre + "/openapi.json",
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  return cache.poner("catalogo:publicadas", lista, 60 * 60 * 1000);
}

module.exports = { buscar, publicadas, valido, registro, RESERVADOS };
