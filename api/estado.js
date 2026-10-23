"use strict";

/**
 * GET /api/estado?nombre=<nombre>
 * Cuenta cómo va la creación de una API sin que el navegador tenga que llamar a
 * GitHub (así no se gastan los límites del plan gratis ni hace falta ninguna
 * clave en la página):
 *   publicada -> el plano ya está en el registro (la carpeta existe)
 *   corrida   -> qué pasó con la última tarea de GitHub Actions para ese nombre
 *
 * Las corridas de Actions se cachean 30 segundos: el navegador pregunta cada 5
 * segundos mientras espera y no tiene sentido pedirle lo mismo a GitHub doce
 * veces por minuto.
 */

const cache = require("../lib/cache");
const gh = require("../lib/github");
const http = require("../lib/http");
const catalogo = require("../lib/catalogo");
const { limitesDe } = require("../lib/limites");

function contarRutas(spec) {
  return (spec.recursos || []).reduce((total, recurso) => total + (spec.soloLectura ? 2 : 5), 0);
}

function corridasDeGitHub() {
  return cache.recordar("estado:corridas", 30 * 1000, async () => {
    if (!gh.token()) return [];
    try {
      const respuesta = await gh.pedir(
        "GET",
        "/repos/" + gh.OWNER + "/" + gh.REPO + "/actions/workflows/generar-api.yml/runs?per_page=20"
      );
      if (respuesta.status !== 200 || !respuesta.json) return [];
      return Array.isArray(respuesta.json.workflow_runs) ? respuesta.json.workflow_runs : [];
    } catch {
      return [];
    }
  });
}

module.exports = async function handler(req, res) {
  const metodo = String((req && req.method) || "GET").toUpperCase();
  if (metodo === "OPTIONS") {
    http.enviarJson(req, res, 204, {}, { publico: true });
    return;
  }
  if (metodo !== "GET" && metodo !== "HEAD") {
    http.enviarJson(req, res, 405, { error: "Usa GET." }, { publico: true, cabeceras: { Allow: "GET, HEAD, OPTIONS" } });
    return;
  }

  const nombre = String(http.parametros(req).get("nombre") || "")
    .trim()
    .toLowerCase()
    .slice(0, 48);
  const spec = catalogo.valido(nombre) ? catalogo.buscar(nombre) : null;
  const salida = {
    nombre,
    publicada: Boolean(spec),
    motor: spec ? spec.motor || "incluido" : null,
    titulo: spec ? spec.titulo : null,
    rutas: spec ? contarRutas(spec) : null,
    soloLectura: spec ? Boolean(spec.soloLectura) : null,
    protegida: spec ? Boolean(spec.auth && spec.auth.hash) : null,
    limites: spec ? limitesDe(spec) : null,
    documentacion: spec ? "/docs?api=" + encodeURIComponent(nombre) : null,
    openapi: spec ? "/api/" + nombre + "/openapi.json" : null,
    corrida: null,
    enlace: "https://github.com/" + gh.OWNER + "/" + gh.REPO + "/actions",
    acciones: { intentos: 0, esperando: 0, listo: 0, fallidas: 0 },
  };

  if (gh.token()) {
    const corridas = await corridasDeGitHub();
    salida.acciones.intentos = corridas.length;
    salida.acciones.esperando = corridas.filter(
      (corrida) => corrida.status === "queued" || corrida.status === "in_progress"
    ).length;
    salida.acciones.listo = corridas.filter((corrida) => corrida.conclusion === "success").length;
    salida.acciones.fallidas = corridas.filter(
      (corrida) => corrida.conclusion === "failure" || corrida.conclusion === "cancelled"
    ).length;
    if (nombre) {
      const mia = corridas.find((corrida) =>
        String(corrida.display_title || corrida.name || "").toLowerCase().includes(nombre)
      );
      if (mia) {
        salida.corrida = {
          estado: mia.status,
          resultado: mia.conclusion,
          creada: mia.created_at,
          url: mia.html_url,
        };
      }
    }
  }

  http.enviarJson(req, res, 200, salida, { publico: true, cache: 10, etag: true });
};
