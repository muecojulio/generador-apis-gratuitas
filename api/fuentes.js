"use strict";

/**
 * GET /api/fuentes
 *
 * Catálogo de las APIs públicas sin clave que el taller usa o recomienda, más
 * el catálogo descubierto en el repositorio público `public-apis/public-apis`.
 *
 * Parámetros:
 *   buscar=clima          filtra por texto
 *   categoria=geografia   filtra por categoría (sin acentos)
 *   limite=20             tamaño de la lista curada (1–100)
 *   github=0              no consultar GitHub
 *   githubLimite=60       cuántas APIs descubiertas devolver (0–200)
 *   probar=1              comprueba ahora qué fuentes responden (1/min por IP)
 *
 * La respuesta se cachea un minuto en el navegador y cinco en el CDN. Las
 * pruebas de disponibilidad llevan su propio cupo para no abusar de terceros.
 */

const http = require("../lib/http");
const cupo = require("../lib/cupo");
const publicas = require("../lib/publicas");
const fuentesGithub = require("../lib/fuentes-github");

module.exports = async function handler(req, res) {
  const metodo = String((req && req.method) || "GET").toUpperCase();

  if (metodo === "OPTIONS") {
    http.enviarJson(req, res, 204, {}, { publico: true });
    return;
  }
  if (metodo !== "GET" && metodo !== "HEAD") {
    http.enviarJson(req, res, 405, { error: "Usa GET." }, { publico: true });
    return;
  }

  const params = http.parametros(req);
  const buscar = String(params.get("buscar") || "").slice(0, 80);
  const categoria = String(params.get("categoria") || "").slice(0, 40);
  const limite = Math.min(100, Math.max(1, Number(params.get("limite")) || 50));
  const incluirGithub = http.siONo(params.get("github"), true);
  const githubLimitePedido = params.get("githubLimite");
  const githubLimite =
    githubLimitePedido === null || githubLimitePedido === ""
      ? 60
      : Math.min(200, Math.max(0, Number(githubLimitePedido) || 0));
  const probar = params.get("probar");

  let prueba = null;
  if (probar !== null && probar !== "" && probar !== "0" && http.siONo(probar, true)) {
    if (!http.solicitudConfiable(req)) {
      http.enviarJson(
        req,
        res,
        403,
        { error: "Las pruebas de fuentes solo se lanzan desde el propio sitio." },
        { publico: true }
      );
      return;
    }
    const permiso = cupo.consumir(req, "probar-fuentes", 6, 60 * 1000);
    if (!permiso.ok) {
      http.enviarJson(
        req,
        res,
        429,
        {
          error: "Demasiadas pruebas seguidas. Espera " + permiso.segundos + " segundos.",
          reinicio: permiso.reinicio,
        },
        { publico: true, cabeceras: { "Retry-After": String(permiso.segundos) } }
      );
      return;
    }
    const ids = probar === "1" || probar.toLowerCase() === "true" ? null : String(probar).split(",").slice(0, 12);
    prueba = await publicas.probarFuentes(ids);
  }

  const fuentes = publicas.catalogo({ buscar, categoria, limite });

  let github = null;
  if (incluirGithub) {
    const descubierto = await fuentesGithub.descubrir();
    const listado = fuentesGithub.muestra(descubierto, { categoria, buscar, limite: githubLimite });
    github = {
      origen: descubierto.origen,
      licencia: descubierto.licencia,
      actualizado: descubierto.actualizado,
      enVivo: Boolean(descubierto.enVivo),
      total: descubierto.total,
      totalCoincidencias: listado.total,
      categorias: listado.categorias,
      fuentes: listado.fuentes,
      aviso: descubierto.aviso || null,
    };
  }

  const cuerpo = {
    total: fuentes.length,
    fuentes,
    camposMejorables: publicas.estado().campos,
    enriquecimiento: publicas.estado(),
    github,
    prueba,
    documentacion: "/docs#fuentes-publicas",
    politica: "/privacidad",
    hora: new Date().toISOString(),
  };

  // `hora` cambia en cada petición: fuera de la firma del ETag para que un
  // If-None-Match se lleve un 304 de verdad dentro del minuto de caché.
  const firma = { ...cuerpo, hora: null };
  http.enviarJson(req, res, 200, cuerpo, { publico: true, cache: 60, etag: true, firma });
};
