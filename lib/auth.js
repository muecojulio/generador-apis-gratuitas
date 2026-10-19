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
 * El manifiesto y /openapi.json siempre son públicos: son el esquema, no los
 * datos. Así la página de documentación puede explicar cómo entrar.
 */

const crypto = require("crypto");

const HEX64 = /^[a-f0-9]{64}$/;

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
    nombre === "authorization"
      ? ["authorization", "Authorization"]
      : ["x-api-token", "X-API-Token"];
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

/** Token configurado a mano en las variables de entorno de Vercel. */
function tokenDeEntorno(nombre) {
  const clave = "API_TOKEN_" + String(nombre || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return process.env[clave] || "";
}

/** ¿Este método queda protegido por el token de la API? */
function protege(spec, metodo) {
  if (!spec || !spec.auth || !spec.auth.hash) return false;
  const modo = spec.auth.modo === "todo" ? "todo" : "escritura";
  if (modo === "todo") return true;
  return !["GET", "HEAD", "OPTIONS"].includes(String(metodo || "GET").toUpperCase());
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
  const huella = hash(dado);
  const permitidas = [spec.auth.hash];
  const deEntorno = tokenDeEntorno(spec.nombre);
  if (deEntorno) permitidas.push(hash(deEntorno));
  let ok = false;
  for (const esperada of permitidas) {
    if (comparar(huella, esperada)) ok = true;
  }
  return ok ? { ok: true } : { ok: false, error: "El token no es correcto para esta API." };
}

module.exports = { hash, extraer, revisar, protege, tokenDeEntorno, comparar };
