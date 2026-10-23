"use strict";

/**
 * GET /api/salud
 * Comprobación rápida: ¿está viva la página, hay clave guardada y cuántas APIs hay?
 * Nunca enseña el valor de ninguna clave, solo si existe.
 *
 * El número de funciones se cuenta de verdad (antes estaba escrito a mano y se
 * quedaba viejo cada vez que el taller crecía).
 */

const fs = require("fs");
const path = require("path");
const http = require("../lib/http");
const catalogo = require("../lib/catalogo");
const publicas = require("../lib/publicas");
const cache = require("../lib/cache");
const { estadoProveedores } = require("../lib/ia.mjs");

const DIRECTORIO = __dirname;

function contarFunciones() {
  try {
    const fijos = fs.readdirSync(DIRECTORIO).filter((archivo) => archivo.endsWith(".js")).length;
    const dinamicos = fs.existsSync(path.join(DIRECTORIO, "[nombre]")) ? 2 : 0;
    return fijos + dinamicos;
  } catch {
    return null;
  }
}

module.exports = function handler(req, res) {
  const metodo = String((req && req.method) || "GET").toUpperCase();
  if (metodo === "OPTIONS") {
    http.enviarJson(req, res, 204, {}, { publico: true });
    return;
  }
  if (metodo !== "GET" && metodo !== "HEAD") {
    http.enviarJson(req, res, 405, { error: "Usa GET." }, { publico: true, cabeceras: { Allow: "GET, HEAD, OPTIONS" } });
    return;
  }

  const apis = catalogo.publicadas();
  const proveedores = estadoProveedores();
  http.enviarJson(
    req,
    res,
    200,
    {
      ok: true,
      taller: "generador-apis-gratuitas",
      plan: "Vercel Hobby + GitHub Free (0 € para siempre)",
      funciones: contarFunciones(),
      apis: apis.length,
      documentacion: "/docs",
      fuentes: "/api/fuentes",
      proveedores: "/api/proveedores",
      politica: "/privacidad",
      novedades: ["openapi", "limites", "token", "fuentes", "cache", "indices", "seguridad"],
      claves: {
        GITHUB_PAT: Boolean(process.env.GITHUB_PAT),
        GENERADOR_SECRETO: Boolean(process.env.GENERADOR_SECRETO),
      },
      modelos: {
        estrategia: proveedores.estrategia,
        sinClave: proveedores.sinClave.length,
        conClaveDisponibles: proveedores.conClave.filter((item) => item.configurado).length,
      },
      cache: cache.estadisticas(),
      normalizacion: publicas.estado(),
      hora: new Date().toISOString(),
    },
    { publico: true, cache: 30, etag: true }
  );
};
