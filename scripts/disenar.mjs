// @ts-nocheck
/**
 * El cerebro del taller.
 *
 * 1. Pide un plano (tablas, campos y reglas) a la IA gratuita.
 * 2. Lo revisa y lo normaliza con lib/motor.mjs (nada de código ajeno).
 * 3. Escribe api/<nombre>/spec.json y actualiza lib/registro.js y catalogo.json.
 * 4. Antes de terminar, monta la API de verdad y comprueba que responde.
 *
 * Nunca escribe código de la IA: la IA solo devuelve datos (JSON). El programa
 * que atiende las peticiones es siempre lib/runtime.js, revisado y fijo.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { analizar, normalizar, normalizarLimites, slugValido, huella } from "../lib/motor.mjs";
import { pedirPlano } from "../lib/ia.mjs";
import { registrar } from "./registrar.mjs";

const require = createRequire(import.meta.url);
const { crear } = require("../lib/runtime.js");

const RAIZ = process.cwd();

function escribir(relativo, contenido) {
  const destino = path.resolve(RAIZ, relativo);
  if (!destino.startsWith(RAIZ + path.sep)) throw new Error("Ruta rechazada: " + relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
}

function actualizarCatalogo(spec) {
  const archivo = path.resolve(RAIZ, "catalogo.json");
  let catalogo = { apis: [] };
  if (fs.existsSync(archivo)) {
    try {
      catalogo = JSON.parse(fs.readFileSync(archivo, "utf8"));
    } catch {
      catalogo = { apis: [] };
    }
  }
  const anteriores = (catalogo.apis || []).filter((api) => api && api.nombre !== spec.nombre);
  const previo = (catalogo.apis || []).find((api) => api && api.nombre === spec.nombre);
  anteriores.unshift({
    nombre: spec.nombre,
    titulo: spec.titulo,
    resumen: spec.resumen,
    motor: spec.motor,
    origen: spec.origen || "",
    soloLectura: Boolean(spec.soloLectura),
    protegida: Boolean(spec.auth && spec.auth.hash),
    limites: spec.limites,
    publicado: (previo && previo.publicado) || new Date().toISOString(),
    actualizado: new Date().toISOString(),
  });
  fs.writeFileSync(archivo, JSON.stringify({ apis: anteriores }, null, 2) + "\n");
}

/** Monta la API y pide su manifiesto: si esto pasa, la API funciona. */
async function probarEnSeco(spec) {
  const memoria = {
    token: () => "prueba",
    leer: async () => ({ datos: null, sha: null }),
    guardar: async () => ({ sha: "1" }),
  };
  const manejador = crear(spec, { almacen: memoria });
  let status = 0;
  let cuerpo = "";
  const res = {
    setHeader() {},
    end(datos) {
      cuerpo = datos || "";
    },
    set statusCode(valor) {
      status = valor;
    },
    get statusCode() {
      return status;
    },
  };
  const req = { method: "GET", url: "/api/" + spec.nombre, query: {}, headers: {} };
  await manejador(req, res);
  if (status !== 200) throw new Error("la API no respondió (estado " + status + ")");
  const json = JSON.parse(cuerpo);
  if (!Array.isArray(json.rutas) || !json.rutas.length) throw new Error("la API no publicó rutas");
  return json.rutas;
}

const nombre = String(process.env.NOMBRE || "").trim().toLowerCase();
const aviso = (texto) => console.log("[taller] " + texto);
const descripcion = String(process.env.DESCRIPCION || "").trim().slice(0, 8000);

if (!slugValido(nombre)) {
  console.error("Nombre inválido. Usa letras minúsculas, números y guiones (2 a 48 caracteres).");
  process.exit(1);
}
if (descripcion.length < 20) {
  console.error("La descripción es demasiado corta: cuenta tablas, campos y acciones.");
  process.exit(1);
}

// Lo que ya exista se conserva si el pedido no dice lo contrario.
const archivoPrevio = path.resolve(RAIZ, "api", nombre, "spec.json");
let previo = null;
if (fs.existsSync(archivoPrevio)) {
  try {
    previo = JSON.parse(fs.readFileSync(archivoPrevio, "utf8"));
  } catch {
    previo = null;
  }
}

let spec = null;
let motor = "incluido";

const respuesta = await pedirPlano({ descripcion, nombre, aviso });
if (respuesta) {
  spec = respuesta.spec;
  motor = respuesta.proveedor;
} else {
  spec = analizar(descripcion, nombre);
  aviso("Usé el lector incluido: funciona sin claves y sin internet.");
}

// Cinturón y tirantes: pase lo que pase, el plano siempre sale válido.
spec = normalizar(spec, nombre, motor);
spec.motor = motor;
spec.huella = huella(descripcion);
if (!spec.resumen) spec.resumen = descripcion.replace(/\s+/g, " ").slice(0, 280);
spec.publicado = new Date().toISOString();

// --- Solo lectura ---------------------------------------------------------
const soloLecturaEnv = String(process.env.SOLO_LECTURA || "").trim();
if (soloLecturaEnv) {
  spec.soloLectura = /^(1|true|si|sí|yes)$/i.test(soloLecturaEnv);
} else if (previo && typeof previo.soloLectura === "boolean") {
  spec.soloLectura = previo.soloLectura;
}

// --- Límites y retención --------------------------------------------------
const limitesEnv = String(process.env.LIMITES || "").trim();
let limitesExtra = null;
if (limitesEnv) {
  try {
    limitesExtra = JSON.parse(limitesEnv);
  } catch {
    console.error("LIMITES no es JSON válido.");
    process.exit(1);
  }
}
if (limitesExtra) {
  spec.limites = normalizarLimites({ ...spec.limites, ...limitesExtra });
} else if (previo && previo.limites) {
  spec.limites = normalizarLimites(previo.limites);
}
// Si no hay ninguna fuente, normalizar() ya dejó los valores por defecto.

// --- Token opcional -------------------------------------------------------
const accionToken = String(process.env.TOKEN_ACCION || "").trim().toLowerCase();
const tokenHash = String(process.env.TOKEN_HASH || "").trim().toLowerCase();
const tokenModo = String(process.env.TOKEN_MODO || "escritura").trim().toLowerCase() === "todo" ? "todo" : "escritura";
if (accionToken === "quitar") {
  spec.auth = null;
} else if (accionToken === "poner" || tokenHash) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    console.error("TOKEN_HASH inválido: deben ser 64 caracteres hexadecimales (SHA-256).");
    process.exit(1);
  }
  spec.auth = { tipo: "token", hash: tokenHash, modo: tokenModo };
} else if (!spec.auth && previo && previo.auth) {
  // Al regenerar sin decir nada, no le quitamos la protección a una API existente.
  spec.auth = previo.auth;
}

const rutas = await probarEnSeco(spec);
escribir("api/" + nombre + "/spec.json", JSON.stringify(spec, null, 2) + "\n");
const { nombres } = registrar();
actualizarCatalogo(spec);

console.log("Motor: " + motor);
console.log("Carpeta: api/" + nombre + "/spec.json");
console.log("Dirección: /api/" + nombre);
console.log("Rutas publicadas:");
for (const ruta of rutas) console.log("  " + ruta);
console.log("APIs en el registro: " + nombres.length + " -> " + nombres.join(", "));
