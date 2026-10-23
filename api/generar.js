"use strict";

/**
 * POST /api/generar
 * Recibe la descripción escrita en la página y pide a GitHub Actions que cree
 * la carpeta de la API. La página nunca lleva claves dentro: la clave GITHUB_PAT
 * vive solo aquí, en las variables de entorno de Vercel.
 *
 * Endurecido contra abuso:
 *  - CORS cerrado: solo el propio sitio (o TALLER_ORIGENES) puede llamarlo
 *    desde un navegador. Un sitio ajeno no puede gastar tu cupo.
 *  - Cupo por IP (`TALLER_CUPO_HORA`, 12 por defecto) además del cupo global
 *    que ya se mira en GitHub Actions.
 *  - La clave del taller se compara por huella y en tiempo constante.
 *  - El cuerpo tiene tope (40 KB) y se limpian los caracteres de control.
 */

const crypto = require("crypto");
const gh = require("../lib/github");
const catalogo = require("../lib/catalogo");
const http = require("../lib/http");
const cupo = require("../lib/cupo");
const { normalizar: normalizarLimites } = require("../lib/limites");

const TOKEN_HASH = /^[a-f0-9]{64}$/;
const MAX_CUERPO = 40 * 1024;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function nombreValido(nombre) {
  return catalogo.valido(nombre) && !String(nombre).startsWith("-");
}

function hash(texto) {
  return crypto.createHash("sha256").update(String(texto), "utf8").digest();
}

function secretoOk(dado) {
  const esperado = process.env.GENERADOR_SECRETO || "";
  if (!esperado) return true;
  // Comparar huellas evita filtrar la longitud por el tiempo de respuesta.
  return crypto.timingSafeEqual(hash(dado || ""), hash(esperado));
}

/** Cupo amable: una creación a la vez y 12 por hora, para no gastar el plan gratis. */
async function cupoGlobal() {
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
    const metodo = String((req && req.method) || "GET").toUpperCase();
    if (metodo === "OPTIONS") {
      http.enviarJson(req, res, 204, {}, { publico: false, cabeceras: { "X-Robots-Tag": "noindex" } });
      return;
    }
    if (metodo !== "POST") {
      http.enviarJson(
        req,
        res,
        405,
        { error: "Usa POST para pedir una API." },
        { publico: false, cabeceras: { Allow: "POST, OPTIONS", "X-Robots-Tag": "noindex" } }
      );
      return;
    }
    if (!http.solicitudConfiable(req)) {
      http.enviarJson(
        req,
        res,
        403,
        { error: "Este formulario solo acepta peticiones del propio sitio." },
        { publico: false, cabeceras: { "X-Robots-Tag": "noindex" } }
      );
      return;
    }
    if (!gh.token()) {
      http.enviarJson(
        req,
        res,
        503,
        {
          error:
            "Falta la clave GITHUB_PAT en las variables de Vercel. La página ya está en línea; el botón se enciende cuando pegas esa clave.",
          ayuda: "https://github.com/" + gh.OWNER + "/" + gh.REPO + "#lo-único-que-hay-que-pegar-a-mano",
        },
        { publico: false, cabeceras: { "X-Robots-Tag": "noindex" } }
      );
      return;
    }

    let entrada;
    try {
      entrada = await http.leerJson(req, MAX_CUERPO);
    } catch (error) {
      http.enviarJson(
        req,
        res,
        error.status || 400,
        { error: error.message || "No pude leer el formulario." },
        { publico: false }
      );
      return;
    }

    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
      http.enviarJson(req, res, 400, { error: "El pedido debe ser un objeto JSON." }, { publico: false });
      return;
    }

    if (!secretoOk(entrada.secreto)) {
      http.enviarJson(req, res, 401, { error: "La clave del taller no coincide." }, { publico: false });
      return;
    }

    const propuesto = String(entrada.nombre || "").trim().toLowerCase();
    if (!nombreValido(propuesto)) {
      http.enviarJson(
        req,
        res,
        400,
        {
          error:
            "Elige un nombre claro: letras minúsculas, números y guiones (2 a 48). Evita rutas internas como docs, salud, fuentes o generar.",
        },
        { publico: false }
      );
      return;
    }

    const descripcion = String(entrada.descripcion || "")
      .replace(CONTROL, "")
      .trim();
    if (descripcion.length < 20) {
      http.enviarJson(req, res, 400, { error: "Cuéntame un poco más: tablas, campos y qué se puede hacer." }, { publico: false });
      return;
    }
    if (descripcion.length > 8000) {
      http.enviarJson(req, res, 400, { error: "La descripción es demasiado larga. Recórtala un poco." }, { publico: false });
      return;
    }

    // Los límites recibidos se recortan a un rango seguro. Si se omiten, el
    // diseñador conserva los anteriores o usa los valores del nuevo plano.
    let limitesBruto = entrada.limites;
    if (typeof limitesBruto === "string" && limitesBruto.trim()) {
      try {
        limitesBruto = JSON.parse(limitesBruto);
      } catch {
        http.enviarJson(req, res, 400, { error: "Los límites no son JSON válido." }, { publico: false });
        return;
      }
    }
    const limites = limitesBruto ? normalizarLimites(limitesBruto) : null;

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
      http.enviarJson(req, res, 400, { error: "Acción de token desconocida." }, { publico: false });
      return;
    }
    if (accion === "poner" && !TOKEN_HASH.test(tokenHash)) {
      http.enviarJson(req, res, 400, { error: "La huella del token no es válida." }, { publico: false });
      return;
    }
    const tokenModo =
      String(entrada.tokenModo || "escritura").trim().toLowerCase() === "todo" ? "todo" : "escritura";

    // Solo los pedidos que ya pasaron la validación consumen cupo.
    const permiso = cupo.consumir(req, "generar", Number(process.env.TALLER_CUPO_HORA) || 12, 60 * 60 * 1000);
    if (!permiso.ok) {
      http.enviarJson(
        req,
        res,
        429,
        {
          error: "Llegamos al cupo de esta hora para cuidar el plan gratuito. Prueba más tarde.",
          reinicio: permiso.reinicio,
        },
        { publico: false, cabeceras: { "Retry-After": String(permiso.segundos) } }
      );
      return;
    }

    try {
      await cupoGlobal();
    } catch (error) {
      if (error.status === 429) {
        http.enviarJson(
          req,
          res,
          429,
          { error: error.message },
          { publico: false, cabeceras: { "Retry-After": "60" } }
        );
        return;
      }
    }

    const disparo = await gh.pedir("POST", "/repos/" + gh.OWNER + "/" + gh.REPO + "/dispatches", {
      event_type: "generar-api",
      client_payload: {
        nombre: propuesto,
        descripcion: descripcion.slice(0, 8000),
        soloLectura: soloLectura === null ? "" : soloLectura ? "1" : "0",
        limites: limites ? JSON.stringify(limites) : "",
        tokenAccion: accion,
        tokenHash: accion === "poner" ? tokenHash : "",
        tokenModo,
      },
    });

    if (disparo.status !== 204 && disparo.status !== 200) {
      const detalle = (disparo.json && disparo.json.message) || "GitHub no aceptó el pedido.";
      http.enviarJson(
        req,
        res,
        502,
        {
          error:
            detalle +
            " Revisa que GITHUB_PAT tenga permiso Contents (lectura y escritura) y acceso a este repositorio.",
          estado: disparo.status,
        },
        { publico: false }
      );
      return;
    }

    http.enviarJson(
      req,
      res,
      202,
      {
        ok: true,
        nombre: propuesto,
        actualiza: Boolean(catalogo.buscar(propuesto)),
        protegida: accion === "poner",
        documentacion: "/docs?api=" + encodeURIComponent(propuesto),
        openapi: "/api/" + propuesto + "/openapi.json",
        mensaje: "Pedido enviado. Estoy creando la carpeta; en uno o dos minutos la dirección responderá.",
        cupo: { restante: permiso.restante, limite: permiso.limite, reinicio: permiso.reinicio },
      },
      { publico: false, cabeceras: { "X-Robots-Tag": "noindex" } }
    );
  } catch (error) {
    http.enviarJson(
      req,
      res,
      error.status || 500,
      { error: error.status && error.status < 500 ? error.message : "No pude empezar la creación. Inténtalo otra vez." },
      { publico: false }
    );
  }
};
