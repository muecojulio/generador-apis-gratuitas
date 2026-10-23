"use strict";

/**
 * Todo lo que se repite en las respuestas HTTP del taller: cabeceras de
 * seguridad, CORS, ETag/304 y lectura del cuerpo con tope de tamaño.
 *
 * Tenerlo en un solo sitio evita que una ruta se olvide de una cabecera (el
 * fallo clásico: una función nueva sin `nosniff` y sin límite de cuerpo) y
 * deja las respuestas iguales en Vercel y en el servidor local.
 */

const crypto = require("crypto");

const METODOS_API = "GET,POST,PUT,DELETE,OPTIONS";
const CABECERAS_API = "Content-Type, Authorization, X-API-Token";
const EXPONER =
  "X-Limite-Registros, X-Retencion-Dias, X-Total-Registros, X-Normalizado, X-Datos, X-Cache, ETag, Retry-After";

function cabecerasSeguridad() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
}

function aplicarSeguridad(res) {
  for (const [clave, valor] of Object.entries(cabecerasSeguridad())) {
    res.setHeader(clave, valor);
  }
}

/** Lista de orígenes externos permitidos para las rutas que escriben. */
function origenesPermitidos() {
  const configurados = String(process.env.TALLER_ORIGENES || "")
    .split(",")
    .map((origen) => origen.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return configurados;
}

function hostDe(req) {
  const cabeceras = (req && req.headers) || {};
  const bruto = cabeceras["x-forwarded-host"] || cabeceras.host || "";
  const valor = Array.isArray(bruto) ? bruto[0] : String(bruto).split(",")[0].trim();
  if (!valor) return "";
  return /^[a-zA-Z0-9.\-:[\]]+$/.test(valor) ? valor.toLowerCase() : "";
}

/** ¿El navegador que llama es el mismo sitio (o uno de los permitidos)? */
function mismoOrigen(req) {
  const origen = String(((req && req.headers) || {}).origin || "").trim().replace(/\/+$/, "");
  if (!origen) return true; // curl, servicios y el propio servidor no mandan Origin
  let hostOrigen = "";
  try {
    hostOrigen = new URL(origen).host.toLowerCase();
  } catch {
    return false;
  }
  const host = hostDe(req);
  if (host && hostOrigen === host) return true;
  if (origenesPermitidos().includes(origen)) return true;
  // Dominios de Vercel del mismo proyecto (producción y previews).
  if (/\.vercel\.app$/.test(hostOrigen) && host && hostOrigen === host) return true;
  return false;
}

/**
 * ¿La petición viene de un navegador de confianza?
 *
 * Los endpoints que hacen trabajo real (crear una API, probar proveedores) se
 * defienden de CSRF: un sitio ajeno no debería poder dispararlos con la sesión
 * del visitante. Se miran `Origin` y `Sec-Fetch-Site`; las llamadas sin ninguna
 * de las dos (curl, GitHub Actions, pruebas) se aceptan porque no hay navegador
 * que esté fingiendo ser el sitio.
 */
function solicitudConfiable(req) {
  const cabeceras = (req && req.headers) || {};
  const origen = String(cabeceras.origin || "").trim();
  const sitio = String(cabeceras["sec-fetch-site"] || "")
    .trim()
    .toLowerCase();
  if (origen) return mismoOrigen(req);
  if (sitio) return sitio === "same-origin" || sitio === "none";
  return true;
}

/**
 * Aplica CORS. Las APIs generadas son públicas: cualquier sitio puede leerlas.
 * Las rutas de administración (crear APIs, consultar el estado, probar
 * proveedores) solo aceptan el propio sitio o los orígenes de TALLER_ORIGENES.
 */
function aplicarCors(req, res, opciones) {
  const publico = !opciones || opciones.publico !== false;
  const origen = String(((req && req.headers) || {}).origin || "").trim();
  res.setHeader("Vary", origen ? "Origin" : "Accept-Encoding");
  if (publico) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", METODOS_API);
    res.setHeader("Access-Control-Allow-Headers", CABECERAS_API);
    res.setHeader("Access-Control-Expose-Headers", EXPONER);
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
  }
  if (origen && mismoOrigen(req)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Taller-Secreto");
    res.setHeader("Access-Control-Max-Age", "300");
    return true;
  }
  return false;
}

function etagDe(datos) {
  const texto = typeof datos === "string" ? datos : JSON.stringify(datos);
  const huella = crypto.createHash("sha256").update(texto, "utf8").digest("base64url");
  return 'W/"' + huella.slice(0, 27) + '"';
}

function etagCoincide(req, etiqueta) {
  const cabeceras = (req && req.headers) || {};
  const bruto = cabeceras["if-none-match"];
  if (!bruto || !etiqueta) return false;
  const valores = Array.isArray(bruto) ? bruto.join(",") : String(bruto);
  return valores
    .split(",")
    .map((valor) => valor.trim().replace(/^W\//, ""))
    .some((valor) => valor === etiqueta.replace(/^W\//, "") || valor === "*");
}

/**
 * Envía JSON con las cabeceras comunes.
 *
 * opciones:
 *   publico  -> CORS abierto (por defecto true); false = solo el propio sitio
 *   cache    -> segundos de caché (0 o "no-store" para datos vivos)
 *   cabeceras-> cabeceras extra
 *   etag     -> true para calcular ETag y responder 304 (solo con caché)
 *   firma    -> datos con los que calcular el ETag cuando la respuesta lleva
 *               algún campo volátil (por ejemplo, la hora). Si no se indica,
 *               se usa el cuerpo completo.
 */
function enviarJson(req, res, status, datos, opciones) {
  const opcionesFinales = opciones || {};
  const metodo = String((req && req.method) || "GET").toUpperCase();
  aplicarSeguridad(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  aplicarCors(req, res, { publico: opcionesFinales.publico !== false });

  let etiqueta = "";
  if (opcionesFinales.etag) {
    const firma = opcionesFinales.firma === undefined ? datos : opcionesFinales.firma;
    etiqueta = etagDe(firma === undefined ? null : firma);
  }
  if (etiqueta) res.setHeader("ETag", etiqueta);

  const cache = opcionesFinales.cache;
  if (typeof cache === "number" && cache > 0) {
    res.setHeader("Cache-Control", "public, max-age=" + cache + ", s-maxage=" + cache * 4);
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  for (const [clave, valor] of Object.entries(opcionesFinales.cabeceras || {})) {
    res.setHeader(clave, valor);
  }

  if (etiqueta && etagCoincide(req, etiqueta)) {
    res.statusCode = 304;
    res.end();
    return 304;
  }

  res.statusCode = status;
  if (status === 204 || status === 304 || metodo === "HEAD") {
    res.end();
    return status;
  }
  res.end(JSON.stringify(datos));
  return status;
}

function ipDe(req) {
  const cabeceras = (req && req.headers) || {};
  const adelante = cabeceras["x-forwarded-for"] || cabeceras["x-real-ip"] || "";
  const crudo = Array.isArray(adelante) ? adelante[0] : String(adelante).split(",")[0].trim();
  return crudo || (req && req.socket && req.socket.remoteAddress) || "local";
}

/**
 * Parámetros de consulta iguales en Vercel (`req.query`) y en el servidor
 * local o las pruebas (`req.url`). Devuelve un `URLSearchParams`.
 */
function parametros(req) {
  const url = new URL(String((req && req.url) || "/"), "http://localhost");
  const query = (req && req.query) || {};
  for (const [clave, valor] of Object.entries(query)) {
    if (valor === undefined || valor === null) continue;
    const final = Array.isArray(valor) ? valor.join(",") : String(valor);
    url.searchParams.set(clave, final);
  }
  return url.searchParams;
}

function siONo(valor, defecto) {
  if (valor === undefined || valor === null || valor === "") return Boolean(defecto);
  return /^(1|true|si|sí|yes|on)$/i.test(String(valor).trim());
}

class ErrorHttp extends Error {
  constructor(status, mensaje, extra) {
    super(mensaje);
    this.name = "ErrorHttp";
    this.status = status;
    this.extra = extra || null;
  }
}

/**
 * Lee el cuerpo como JSON con un tope de bytes. Acepta cuerpos ya parseados
 * (Vercel y las pruebas) y flujos (servidor local y pruebas con req).
 */
async function leerJson(req, maxBytes) {
  const tope = Math.max(1024, Number(maxBytes) || 1024 * 1024);
  const tipo = String(((req && req.headers) || {})["content-type"] || "").toLowerCase();
  if (req && req.body !== undefined) {
    if (req.body === null) return {};
    if (typeof req.body === "object") {
      if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > tope) {
        throw new ErrorHttp(413, "El cuerpo de la petición es demasiado grande.");
      }
      return req.body;
    }
    if (typeof req.body === "string") {
      if (Buffer.byteLength(req.body, "utf8") > tope) {
        throw new ErrorHttp(413, "El cuerpo de la petición es demasiado grande.");
      }
      if (!req.body.trim()) return {};
      if (tipo && !tipo.includes("json")) {
        throw new ErrorHttp(415, "Envía el cuerpo como application/json.");
      }
      try {
        return JSON.parse(req.body);
      } catch {
        throw new ErrorHttp(400, "El cuerpo no es JSON válido.");
      }
    }
    throw new ErrorHttp(400, "El cuerpo no es válido.");
  }

  if (tipo && !tipo.includes("json")) {
    throw new ErrorHttp(415, "Envía el cuerpo como application/json.");
  }
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > tope) throw new ErrorHttp(413, "El cuerpo de la petición es demasiado grande.");
    partes.push(parte);
  }
  const texto = Buffer.concat(partes).toString("utf8");
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorHttp(400, "El cuerpo no es JSON válido.");
  }
}

module.exports = {
  METODOS_API,
  CABECERAS_API,
  ErrorHttp,
  cabecerasSeguridad,
  aplicarSeguridad,
  aplicarCors,
  mismoOrigen,
  solicitudConfiable,
  origenesPermitidos,
  etagDe,
  etagCoincide,
  enviarJson,
  ipDe,
  leerJson,
  hostDe,
  parametros,
  siONo,
};
