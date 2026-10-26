// @ts-nocheck
/**
 * Servidor local para ver el taller en tu computadora, igual que en Vercel.
 *
 *   node scripts/servidor.mjs      (o:  npm run local)
 *   Abre http://localhost:3000
 *
 * Imita el enrutado de Vercel: /api/<nombre>/... se reparte solo entre los
 * archivos de la carpeta api/. Sirve para probar tus cambios antes de subirlos.
 *
 * También aplica las mismas cabeceras de seguridad que vercel.json y limita el
 * cuerpo de las peticiones, para que lo que ves aquí se parezca a producción.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = process.cwd();
const PUERTO = Number(process.env.PORT || 3000);
const MAX_CUERPO = 1024 * 1024;

const ESTATICOS = {
  "/": "index.html",
  "/index.html": "index.html",
  "/privacidad": "privacidad.html",
  "/privacidad.html": "privacidad.html",
  "/script.js": "script.js",
  "/docs": "docs.html",
  "/docs.html": "docs.html",
  "/docs.js": "docs.js",
  "/favicon.svg": "favicon.svg",
  "/lib/motor.mjs": "lib/motor.mjs",
  "/robots.txt": "robots.txt",
  "/.well-known/security.txt": ".well-known/security.txt",
  "/assets/estilos.css": "assets/estilos.css",
};

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const CACHE_INMUTABLE = "public, max-age=31536000, immutable";
const MODO_PREVIEW = process.env.TALLER_PREVIEW === "1";
const CSP_LOCAL = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(MODO_PREVIEW ? [] : ["frame-ancestors 'none'"]),
  "form-action 'self'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
].join("; ");

const cola = new Map();

function cargar(relativo) {
  const destino = path.join(RAIZ, relativo);
  if (!cola.has(destino)) cola.set(destino, require(destino));
  return cola.get(destino);
}

function dentroDe(raiz, destino) {
  return destino === raiz || destino.startsWith(raiz + path.sep);
}

function estatico(ruta) {
  if (ESTATICOS[ruta]) return ESTATICOS[ruta];
  if (ruta.startsWith("/assets/")) {
    const relativo = ruta.replace(/^\/+/, "");
    const destino = path.resolve(RAIZ, relativo);
    if (!dentroDe(path.join(RAIZ, "assets"), destino)) return "";
    try {
      if (fs.statSync(destino).isFile()) return relativo;
    } catch {
      return "";
    }
  }
  if (ruta.startsWith("/api/") && ruta.endsWith("/spec.json")) {
    const relativo = ruta.replace(/^\/+/, "");
    const destino = path.resolve(RAIZ, relativo);
    if (!dentroDe(path.join(RAIZ, "api"), destino)) return "";
    if (fs.existsSync(destino)) return relativo;
  }
  return "";
}

function cabecerasSeguridad(res, esApi) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!MODO_PREVIEW) res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (!MODO_PREVIEW) res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (!esApi) res.setHeader("Content-Security-Policy", CSP_LOCAL);
}

async function cuerpo(req) {
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > MAX_CUERPO) {
      const error = new Error("El cuerpo de la petición es demasiado grande.");
      error.status = 413;
      throw error;
    }
    partes.push(parte);
  }
  const texto = Buffer.concat(partes).toString("utf8");
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost:" + PUERTO);
  let ruta;
  try {
    ruta = decodeURIComponent(url.pathname);
  } catch {
    ruta = url.pathname;
  }
  const esApi = ruta.startsWith("/api");

  cabecerasSeguridad(res, esApi);

  if (ruta === "/favicon.ico") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Mismo atajo que el redirect de vercel.json.
  if (ruta === "/security.txt") {
    res.statusCode = 301;
    res.setHeader("Location", "/.well-known/security.txt");
    res.end();
    return;
  }

  const archivo = estatico(ruta);
  if (archivo) {
    try {
      const datos = fs.readFileSync(path.join(RAIZ, archivo));
      const extension = path.extname(archivo);
      res.statusCode = 200;
      res.setHeader("Content-Type", TIPOS[extension] || "application/octet-stream");
      // El CSS se revalida: si cambia, el navegador no puede quedarse con el viejo.
      // Las fuentes sí son inmutables (su contenido nunca cambia).
      res.setHeader(
        "Cache-Control",
        extension === ".woff2" ? CACHE_INMUTABLE : "no-cache"
      );
      res.end(datos);
      return;
    } catch {
      /* Sigue: puede ser una API. */
    }
  }

  if (!esApi) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("No encontrado: " + ruta);
    return;
  }

  const partes = ruta.split("/").filter(Boolean); // ["api", ...]
  const resto = partes.slice(1);
  if (!resto.length) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Escribe el nombre de una API después de /api/." }));
    return;
  }

  try {
    req.body = await cuerpo(req);
  } catch (error) {
    res.statusCode = error.status || 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  req.query = {};
  for (const [clave, valor] of url.searchParams.entries()) req.query[clave] = valor;

  const fijos = new Set(["generar", "listar", "salud", "estado", "fuentes", "proveedores"]);
  let manejador;
  if (fijos.has(resto[0]) && resto.length === 1) {
    manejador = cargar("api/" + resto[0] + ".js");
  } else {
    req.query.nombre = resto[0];
    if (resto.length > 1) req.query.ruta = resto.slice(1);
    manejador = cargar("api/[nombre]/[...ruta].js");
  }

  try {
    await manejador(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Error interno del taller." }));
    console.error("[taller] Error en " + ruta + ":", error);
  }
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  console.log("Taller en marcha: http://localhost:" + PUERTO);
  console.log("Comprobación:     http://localhost:" + PUERTO + "/api/salud");
  console.log("Fuentes públicas: http://localhost:" + PUERTO + "/api/fuentes");
  console.log("API de ejemplo:   http://localhost:" + PUERTO + "/api/ejemplo-notas/notas");
});
