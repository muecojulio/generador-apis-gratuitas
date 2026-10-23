"use strict";

/**
 * GET /api/proveedores
 *
 * Cuenta qué modelos gratuitos tiene el taller y en qué orden los probará:
 * primero los públicos sin clave y, si ninguno responde, los que se activan
 * con una variable de entorno (Gemini, Groq, OpenRouter…).
 *
 * Por defecto NO hace ninguna petición de red: solo informa de la
 * configuración. Con `?probar=1` pregunta de verdad a cada proveedor, con un
 * cupo de una prueba cada dos minutos por IP y el resultado guardado diez
 * minutos. Ninguna clave sale en la respuesta: solo si existe o no.
 */

const http = require("../lib/http");
const cupo = require("../lib/cupo");
const cache = require("../lib/cache");
const ia = require("../lib/ia.mjs");

const TTL_PRUEBA = 10 * 60 * 1000;

module.exports = async function handler(req, res) {
  const metodo = String((req && req.method) || "GET").toUpperCase();
  if (metodo === "OPTIONS") {
    http.enviarJson(req, res, 204, {}, { publico: false });
    return;
  }
  if (metodo !== "GET" && metodo !== "HEAD") {
    http.enviarJson(req, res, 405, { error: "Usa GET." }, { publico: false });
    return;
  }

  const params = http.parametros(req);
  const estado = ia.estadoProveedores();
  const cuerpo = {
    ...estado,
    proveedores: [...estado.sinClave.map((item) => ({ ...item, tipo: "sin-clave" })), ...estado.conClave.map((item) => ({ ...item, tipo: "entorno" }))],
    politica: "/privacidad",
    hora: new Date().toISOString(),
  };

  // `hora` cambia en cada petición: queda fuera de la firma del ETag.
  const firma = (datos) => ({ ...datos, hora: null });

  const quiereProbar = http.siONo(params.get("probar"), false);
  if (!quiereProbar) {
    const datos = { ...cuerpo, prueba: null };
    http.enviarJson(req, res, 200, datos, { publico: false, cache: 30, etag: true, firma: firma(datos) });
    return;
  }

  if (String(process.env.TALLER_PROBAR || "1") === "0") {
    http.enviarJson(req, res, 403, { error: "Las pruebas están desactivadas (TALLER_PROBAR=0)." }, { publico: false });
    return;
  }
  if (!http.solicitudConfiable(req)) {
    http.enviarJson(
      req,
      res,
      403,
      { error: "Las pruebas de modelos solo se lanzan desde el propio sitio." },
      { publico: false }
    );
    return;
  }

  const solo = String(params.get("solo") || "")
    .trim()
    .toLowerCase()
    .slice(0, 24);
  const claveCache = "proveedores:prueba:" + (solo || "todos");
  const guardado = cache.obtener(claveCache);
  if (guardado) {
    const datos = { ...cuerpo, prueba: guardado, cache: true };
    http.enviarJson(req, res, 200, datos, {
      publico: false,
      cache: 30,
      etag: true,
      firma: firma(datos),
      cabeceras: { "X-Cache": "acierto" },
    });
    return;
  }

  const permiso = cupo.consumir(req, "probar-ia", 1, 2 * 60 * 1000);
  if (!permiso.ok) {
    http.enviarJson(
      req,
      res,
      429,
      {
        error: "Ya probamos los modelos hace poco. Vuelve en " + permiso.segundos + " segundos.",
        reinicio: permiso.reinicio,
      },
      { publico: false, cabeceras: { "Retry-After": String(permiso.segundos) } }
    );
    return;
  }

  try {
    const prueba = await ia.probarProveedores({ solo });
    cache.poner(claveCache, prueba, TTL_PRUEBA);
    const datos = { ...cuerpo, prueba };
    http.enviarJson(req, res, 200, datos, {
      publico: false,
      cache: 30,
      etag: true,
      firma: firma(datos),
      cabeceras: { "X-Cache": "fallo" },
    });
  } catch (error) {
    http.enviarJson(
      req,
      res,
      502,
      { error: "No pude probar los proveedores: " + ((error && error.message) || error) },
      { publico: false }
    );
  }
};
