"use strict";

/**
 * Resuelve qué plano corresponde a cada dirección /api/<nombre>.
 *
 * El registro (lib/registro.js) trae los planos ya empaquetados dentro de la
 * función, así que responde en milisegundos y sin llamar a nadie por internet.
 * Si un plano todavía no está en el registro (por ejemplo cuando trabajas en tu
 * computadora antes de desplegar), se busca en api/<nombre>/spec.json.
 */

const fs = require("fs");
const path = require("path");
const { registro } = require("./registro");
const { limitesDe } = require("./limites");

const cache = new Map();
const FORMATO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Nombres que ya son archivos o carpetas internas del taller.
const RESERVADOS = new Set([
  "api",
  "assets",
  "data",
  "docs",
  "estado",
  "generar",
  "index",
  "lib",
  "listar",
  "public",
  "salud",
  "scripts",
  "spec",
  "specs",
  "static",
]);

function valido(nombre) {
  const texto = String(nombre || "");
  return texto.length >= 2 && texto.length <= 48 && FORMATO.test(texto) && !RESERVADOS.has(texto);
}

function desdeDisco(nombre) {
  const archivo = path.join(process.cwd(), "api", nombre, "spec.json");
  const datos = fs.readFileSync(archivo, "utf8");
  return JSON.parse(datos);
}

function buscar(nombre) {
  const limpio = String(nombre || "").trim().toLowerCase();
  if (!valido(limpio)) return null;
  if (Object.prototype.hasOwnProperty.call(registro, limpio)) return registro[limpio];
  if (cache.has(limpio)) return cache.get(limpio);
  let spec = null;
  try {
    spec = desdeDisco(limpio);
  } catch {
    spec = null;
  }
  cache.set(limpio, spec);
  return spec;
}

/** Todas las APIs publicadas, con lo justo para mostrarlas en una lista. */
function publicadas() {
  return Object.values(registro)
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
}

module.exports = { buscar, publicadas, valido, registro };
