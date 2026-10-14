"use strict";

const crypto = require("crypto");
const gh = require("../lib/github");

const RESERVADOS = new Set([
  "generar",
  "listar",
  "salud",
  "lib",
  "scripts",
  "specs",
  "data",
  "api",
  "assets",
  "public",
  "static",
]);

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function slug(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function nombreValido(nombre) {
  return (
    nombre.length >= 2 &&
    nombre.length <= 48 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nombre) &&
    !RESERVADOS.has(nombre)
  );
}

function secretoOk(dado) {
  const esperado = process.env.GENERADOR_SECRETO || "";
  if (!esperado) return true;
  const a = Buffer.from(String(dado || ""));
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function leerCuerpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const texto = Buffer.concat(chunks).toString("utf8");
  if (texto.length > 20000) {
    const error = new Error("La descripción es demasiado larga.");
    error.status = 413;
    throw error;
  }
  return texto ? JSON.parse(texto) : {};
}

async function cupo() {
  const res = await gh.pedir(
    "GET",
    "/repos/" + gh.OWNER + "/" + gh.REPO + "/actions/workflows/generar-api.yml/runs?per_page=20"
  );
  if (res.status !== 200 || !res.json) return;
  const corridas = res.json.workflow_runs || [];
  const activos = corridas.filter((corrida) => corrida.status === "queued" || corrida.status === "in_progress");
  if (activos.length >= 1) {
    const error = new Error("Hay una API creándose ahora. Espera un minuto e inténtalo de nuevo.");
    error.status = 429;
    throw error;
  }
  const hora = Date.now() - 60 * 60 * 1000;
  const recientes = corridas.filter((corrida) => new Date(corrida.created_at).getTime() > hora);
  if (recientes.length >= 12) {
    const error = new Error("Llegamos al cupo de esta hora para cuidar el plan gratuito. Prueba más tarde.");
    error.status = 429;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      enviar(res, 204, {});
      return;
    }
    if (req.method !== "POST") {
      enviar(res, 405, { error: "Usa POST." });
      return;
    }
    if (!gh.token()) {
      enviar(res, 503, {
        error:
          "Falta GITHUB_PAT en las variables de Vercel. La página ya está en línea; el botón se enciende cuando pegas esa clave.",
      });
      return;
    }
    let entrada;
    try {
      entrada = await leerCuerpo(req);
    } catch (error) {
      enviar(res, error.status || 400, { error: error.status ? error.message : "No pude leer el formulario." });
      return;
    }
    if (!secretoOk(entrada.secreto)) {
      enviar(res, 401, { error: "La clave del taller no coincide." });
      return;
    }
    const descripcion = String(entrada.descripcion || "").trim();
    const propuesto = slug(entrada.nombre || descripcion.slice(0, 48));
    if (!nombreValido(propuesto)) {
      enviar(res, 400, { error: "Elige un nombre más claro: letras, números y guiones. Mínimo 2 caracteres." });
      return;
    }
    if (descripcion.length < 20) {
      enviar(res, 400, { error: "Cuéntame un poco más: tablas, campos y qué se puede hacer." });
      return;
    }
    if (descripcion.length > 8000) {
      enviar(res, 400, { error: "La descripción es demasiado larga. Recórtala un poco." });
      return;
    }
    try {
      await cupo();
    } catch (error) {
      if (error.status === 429) {
        enviar(res, 429, { error: error.message });
        return;
      }
    }
    const disparo = await gh.pedir("POST", "/repos/" + gh.OWNER + "/" + gh.REPO + "/dispatches", {
      event_type: "generar-api",
      client_payload: {
        nombre: propuesto,
        descripcion: descripcion.slice(0, 8000),
      },
    });
    if (disparo.status !== 204 && disparo.status !== 200) {
      const detalle = (disparo.json && disparo.json.message) || "GitHub no aceptó el pedido.";
      enviar(res, 502, {
        error:
          detalle +
          " Revisa que GITHUB_PAT tenga permiso de Contents (lectura y escritura) sobre este repositorio.",
      });
      return;
    }
    enviar(res, 202, {
      ok: true,
      nombre: propuesto,
      mensaje: "Estoy creando la carpeta. En uno o dos minutos la dirección responderá.",
    });
  } catch (error) {
    enviar(res, 500, { error: error.message || "No pude empezar la creación." });
  }
};
