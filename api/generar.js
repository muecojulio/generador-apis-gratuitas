"use strict";

/**
 * POST /api/generar
 * Recibe la descripción escrita en la página y pide a GitHub Actions que cree
 * la carpeta de la API. La página nunca lleva claves dentro: la clave GITHUB_PAT
 * vive solo aquí, en las variables de entorno de Vercel.
 */

const crypto = require("crypto");
const gh = require("../lib/github");
const catalogo = require("../lib/catalogo");
const plantillas = require("../lib/plantillas");
const { normalizar: normalizarLimites } = require("../lib/limites");

const TOKEN_HASH = /^[a-f0-9]{64}$/;

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (status === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(data));
}

function nombreValido(nombre) {
  return catalogo.valido(nombre) && !String(nombre).startsWith("-");
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
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > 40000) {
      const error = new Error("La descripción es demasiado larga.");
      error.status = 413;
      throw error;
    }
    partes.push(parte);
  }
  const texto = Buffer.concat(partes).toString("utf8");
  return texto ? JSON.parse(texto) : {};
}

/** Cupo amable: una creación a la vez y 12 por hora, para no gastar el plan gratis. */
async function cupo() {
  const res = await gh.pedir(
    "GET",
    "/repos/" + gh.OWNER + "/" + gh.REPO + "/actions/workflows/generar-api.yml/runs?per_page=20"
  );
  if (res.status !== 200 || !res.json) return;
  const corridas = (res.json.workflow_runs || []).filter(
    (corrida) => corrida.path === ".github/workflows/generar-api.yml"
  );
  const activas = corridas.filter((corrida) => corrida.status === "queued" || corrida.status === "in_progress");
  if (activas.length >= 1) {
    const error = new Error("Hay una API creándose ahora mismo. Espera un minuto y vuelve a intentarlo.");
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
      enviar(res, 405, { error: "Usa POST para pedir una API." });
      return;
    }
    if (!gh.token()) {
      enviar(res, 503, {
        error:
          "Falta la clave GITHUB_PAT en las variables de Vercel. La página ya está en línea; el botón se enciende cuando pegas esa clave.",
        ayuda: "https://github.com/" + gh.OWNER + "/" + gh.REPO + "#lo-único-que-hay-que-pegar-a-mano",
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

    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
      enviar(res, 400, { error: "El pedido debe ser un objeto JSON." });
      return;
    }

    if (!secretoOk(entrada.secreto)) {
      enviar(res, 401, { error: "La clave del taller no coincide." });
      return;
    }

    const propuesto = String(entrada.nombre || "").trim().toLowerCase();
    if (!nombreValido(propuesto)) {
      enviar(res, 400, {
        error:
          "Elige un nombre claro: letras minúsculas, números y guiones (2 a 48). Evita rutas internas como plantillas, docs, salud o generar.",
      });
      return;
    }

    // Una plantilla manda: su descripción es la fuente de verdad para que la
    // huella que espera el navegador coincida con la que calcula Actions.
    const clavePlantilla = String(entrada.plantilla || "").trim().toLowerCase();
    const plantilla = clavePlantilla ? plantillas.buscar(clavePlantilla) : null;
    if (clavePlantilla && !plantilla) {
      enviar(res, 400, {
        error: "Esa plantilla no existe.",
        plantillas: plantillas.claves,
      });
      return;
    }

    const descripcion = plantilla ? String(plantilla.descripcion).trim() : String(entrada.descripcion || "").trim();
    if (!plantilla && descripcion.length < 20) {
      enviar(res, 400, { error: "Cuéntame un poco más: tablas, campos y qué se puede hacer." });
      return;
    }
    if (descripcion.length > 8000) {
      enviar(res, 400, { error: "La descripción es demasiado larga. Recórtala un poco." });
      return;
    }

    // Límites: si el navegador manda unos, se usan; si clona una plantilla y no
    // manda nada, se conservan los de la plantilla. Todo se recorta a un rango seguro.
    let limitesBruto = entrada.limites;
    if (typeof limitesBruto === "string" && limitesBruto.trim()) {
      try {
        limitesBruto = JSON.parse(limitesBruto);
      } catch {
        enviar(res, 400, { error: "Los límites no son JSON válido." });
        return;
      }
    }
    const limites = limitesBruto
      ? normalizarLimites(limitesBruto)
      : plantilla && plantilla.spec.limites
        ? normalizarLimites(plantilla.spec.limites)
        : null;

    let soloLectura = null;
    if (entrada.soloLectura !== undefined && entrada.soloLectura !== null) {
      soloLectura = [true, 1, "1", "true", "si", "sí", "yes"].includes(
        typeof entrada.soloLectura === "string" ? entrada.soloLectura.trim().toLowerCase() : entrada.soloLectura
      );
    }

    // Token: el navegador solo manda la huella SHA-256. Nunca el token en claro.
    const tokenAccion = String(entrada.tokenAccion || "").trim().toLowerCase();
    const tokenHash = String(entrada.tokenHash || "").trim().toLowerCase();
    const accion = tokenAccion || (TOKEN_HASH.test(tokenHash) ? "poner" : "mantener");
    if (!["poner", "quitar", "mantener"].includes(accion)) {
      enviar(res, 400, { error: "Acción de token desconocida." });
      return;
    }
    if (accion === "poner" && !TOKEN_HASH.test(tokenHash)) {
      enviar(res, 400, { error: "La huella del token no es válida." });
      return;
    }
    const tokenModo = String(entrada.tokenModo || "escritura").trim().toLowerCase() === "todo" ? "todo" : "escritura";

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
        plantilla: plantilla ? plantilla.clave : "",
        soloLectura: soloLectura === null ? "" : soloLectura ? "1" : "0",
        limites: limites ? JSON.stringify(limites) : "",
        tokenAccion: accion,
        tokenHash: accion === "poner" ? tokenHash : "",
        tokenModo,
      },
    });

    if (disparo.status !== 204 && disparo.status !== 200) {
      const detalle = (disparo.json && disparo.json.message) || "GitHub no aceptó el pedido.";
      enviar(res, 502, {
        error:
          detalle +
          " Revisa que GITHUB_PAT tenga permiso Contents (lectura y escritura) y acceso a este repositorio.",
        estado: disparo.status,
      });
      return;
    }

    enviar(res, 202, {
      ok: true,
      nombre: propuesto,
      plantilla: plantilla ? plantilla.clave : null,
      actualiza: Boolean(catalogo.buscar(propuesto)),
      protegida: accion === "poner",
      documentacion: "/docs?api=" + encodeURIComponent(propuesto),
      openapi: "/api/" + propuesto + "/openapi.json",
      mensaje: plantilla
        ? "Pedido enviado. Estoy clonando la plantilla " + plantilla.clave + "; en uno o dos minutos responderá."
        : "Pedido enviado. Estoy creando la carpeta; en uno o dos minutos la dirección responderá.",
    });
  } catch (error) {
    enviar(res, 500, { error: error.message || "No pude empezar la creación." });
  }
};
