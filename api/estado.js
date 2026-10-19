"use strict";

/**
 * GET /api/estado?nombre=<nombre>
 * Cuenta cómo va la creación de una API sin que el navegador tenga que llamar a
 * GitHub (así no se gastan los límites del plan gratis ni hace falta ninguna
 * clave en la página):
 *   publicada -> el plano ya está en el registro (la carpeta existe)
 *   corrida   -> qué pasó con la última tarea de GitHub Actions para ese nombre
 */

const gh = require("../lib/github");
const catalogo = require("../lib/catalogo");
const { limitesDe } = require("../lib/limites");

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    enviar(res, 204, {});
    return;
  }
  if (req.method !== "GET") {
    enviar(res, 405, { error: "Usa GET." });
    return;
  }

  const nombre = String((req.query && req.query.nombre) || "").trim().toLowerCase();
  const spec = catalogo.buscar(nombre);
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
    acciones: { intentos: 0, esperando: 0, listo: 0 },
  };

  if (gh.token()) {
    try {
      const respuesta = await gh.pedir(
        "GET",
        "/repos/" + gh.OWNER + "/" + gh.REPO + "/actions/workflows/generar-api.yml/runs?per_page=15"
      );
      if (respuesta.status === 200 && respuesta.json) {
        const corridas = respuesta.json.workflow_runs || [];
        salida.acciones = { intentos: corridas.length, esperando: 0, listo: 0 };
        const mia = corridas.find((corrida) =>
          String(corrida.display_title || corrida.name || "").includes(nombre)
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
    } catch {
      /* Si GitHub no responde, la página sigue informando con lo que ya sabe. */
    }
  }

  enviar(res, 200, salida);
};

function contarRutas(spec) {
  let total = 0;
  for (const recurso of spec.recursos || []) {
    total += spec.soloLectura ? 2 : 5;
    void recurso;
  }
  return total;
}
