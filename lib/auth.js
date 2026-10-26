"use strict";

/**
 * Autenticación simple por token, opcional y sin costo.
 *
 * El plano NUNCA guarda el token: guarda su huella SHA-256. El token se crea
 * en el navegador de quien publica la API y solo se muestra una vez; al
 * repositorio (que es público) viaja únicamente la huella. Para entrar, la API
 * acepta cualquiera de estas cabeceras:
 *
 *   Authorization: Bearer <token>
 *   X-API-Token: <token>
 *
 * También se puede definir un token en Vercel sin tocar el plano:
 *   API_TOKEN_<NOMBRE_EN_MAYUSCULAS_CON_GUIONES_BAJOS>
 * Por ejemplo, para /api/mis-notas:  API_TOKEN_MIS_NOTAS
 *
 * Modos:
 *   "escritura" -> leer es público; POST, PUT y DELETE piden token.
 *   "todo"      -> también piden token las lecturas de datos.
 *
 * Defensas activas:
 *   - Comparación en tiempo constante sobre las huellas (`timingSafeEqual`).
 *   - La huella del token de entorno se calcula una vez y se guarda en caché.
 *   - Tras 20 intentos fallidos en un minuto desde la misma IP, la API responde
 *     429 un rato. Frena la fuerza bruta sin afectar al uso normal.
 *   - El token nunca se acepta por la URL (solo cabeceras), así no acaba en
 *     registros de servidores ni en el historial del navegador.
 */

const crypto = require("crypto");
const cache = require("./cache");
const { ipDe } = require("./http");

const HEX64 = /^[a-f0-9]{64}$/;
const MAX_FALLOS = 20;
const VENTANA_FALLOS = 60 * 1000;
const BLOQUEO = 60 * 1000;

/** @type {Map<string, {veces:number, expira:number, hasta:number}>} */
const fallos = new Map();

function hash(token) {
  return crypto.createHash("sha256").update(String(token == null ? "" : token), "utf8").digest("hex");
}

function comparar(a, b) {
  if (!HEX64.test(String(a)) || !HEX64.test(String(b))) return false;
  const uno = Buffer.from(String(a), "hex");
  const dos = Buffer.from(String(b), "hex");
  return uno.length === dos.length && crypto.timingSafeEqual(uno, dos);
}

function cabecera(req, nombre) {
  const cabeceras = (req && req.headers) || {};
  const alternativas =
    nombre === "authorization" ? ["authorization", "Authorization"] : ["x-api-token", "X-API-Token"];
  let valor;
  for (const clave of alternativas) {
    if (cabeceras[clave] !== undefined) {
      valor = cabeceras[clave];
      break;
    }
  }
  if (Array.isArray(valor)) return String(valor[0] || "").trim();
  return String(valor == null ? "" : valor).trim();
}

/** Saca el token de la petición, sin mirar la URL (nada de tokens en enlaces). */
function extraer(req) {
  const autorizacion = cabecera(req, "authorization");
  const porBearer = autorizacion.match(/^Bearer\s+(.+)$/i);
  if (porBearer) return porBearer[1].trim();
  return cabecera(req, "x-api-token");
}

function claveDeEntorno(nombre) {
  return "API_TOKEN_" + String(nombre || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/** Huella del token de entorno, cacheada 10 minutos. */
function hashDeEntorno(nombre) {
  const token = process.env[claveDeEntorno(nombre)] || "";
  if (!token) return "";
  const clave = "auth:entorno:" + nombre;
  const guardada = cache.obtener(clave);
  if (guardada) return guardada;
  return cache.poner(clave, hash(token), 10 * 60 * 1000);
}

/** ¿Este método queda protegido por el token de la API? */
function protege(spec, metodo) {
  if (!spec || !spec.auth || !spec.auth.hash) return false;
  const modo = spec.auth.modo === "todo" ? "todo" : "escritura";
  if (modo === "todo") return true;
  return !["GET", "HEAD", "OPTIONS"].includes(String(metodo || "GET").toUpperCase());
}

function claveDeFallo(spec, req) {
  return String((spec && spec.nombre) || "") + ":" + ipDe(req);
}

/** ¿Está esta IP bloqueada por demasiados intentos fallidos? */
function bloqueado(spec, req) {
  const registro = fallos.get(claveDeFallo(spec, req));
  if (!registro) return { bloqueado: false, segundos: 0 };
  const ahora = Date.now();
  if (registro.hasta > ahora) {
    return { bloqueado: true, segundos: Math.ceil((registro.hasta - ahora) / 1000) };
  }
  if (registro.expira <= ahora) fallos.delete(claveDeFallo(spec, req));
  return { bloqueado: false, segundos: 0 };
}

function anotarFallo(spec, req) {
  const clave = claveDeFallo(spec, req);
  const ahora = Date.now();
  let registro = fallos.get(clave);
  if (!registro || registro.expira <= ahora) {
    registro = { veces: 0, expira: ahora + VENTANA_FALLOS, hasta: 0 };
    fallos.set(clave, registro);
  }
  registro.veces += 1;
  if (registro.veces >= MAX_FALLOS) {
    registro.hasta = ahora + BLOQUEO;
    registro.veces = 0;
    registro.expira = ahora + BLOQUEO;
  }
  if (fallos.size > 5000) {
    for (const [otra, datos] of fallos) {
      if (datos.expira <= ahora) fallos.delete(otra);
    }
  }
}

function limpiarFallos(spec, req) {
  fallos.delete(claveDeFallo(spec, req));
}

/**
 * Revisa la petición. Devuelve { ok: true } o { ok: false, error }.
 * La comparación es en tiempo constante sobre las huellas.
 */
function revisar(spec, req) {
  if (!spec || !spec.auth || !spec.auth.hash) return { ok: true };
  const dado = extraer(req);
  if (!dado) {
    return {
      ok: false,
      error:
        "Esta API pide un token. Envía «Authorization: Bearer <token>» o «X-API-Token: <token>». " +
        "La documentación sigue abierta en /docs.",
    };
  }
  if (dado.length > 512) return { ok: false, error: "El token no es correcto para esta API." };
  const huella = hash(dado);
  const permitidas = [spec.auth.hash];
  const deEntorno = hashDeEntorno(spec.nombre);
  if (deEntorno) permitidas.push(deEntorno);
  let ok = false;
  for (const esperada of permitidas) {
    if (comparar(huella, esperada)) ok = true;
  }
  return ok ? { ok: true } : { ok: false, error: "El token no es correcto para esta API." };
}

module.exports = {
  hash,
  revisar,
  protege,
  bloqueado,
  anotarFallo,
  limpiarFallos,
};
