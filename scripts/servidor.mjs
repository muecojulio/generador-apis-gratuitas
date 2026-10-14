// @ts-nocheck
/**
 * Servidor local para ver el taller en tu computadora, igual que en Vercel.
 *
 *   node scripts/servidor.mjs      (o:  npm run local)
 *   Abre http://localhost:3000
 *
 * Imita el enrutado de Vercel: /api/<nombre>/... se reparte solo entre los
 * archivos de la carpeta api/. Sirve para probar tus cambios antes de subirlos.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = process.cwd();
const PUERTO = Number(process.env.PORT || 3000);

const ESTATICOS = {
  "/": "index.html",
  "/index.html": "index.html",
  "/script.js": "script.js",
  "/favicon.svg": "favicon.svg",
  "/lib/motor.mjs": "lib/motor.mjs",
};

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const cola = new Map();

function cargar(relativo) {
  const destino = path.join(RAIZ, relativo);
  if (!cola.has(destino)) cola.set(destino, require(destino));
  return cola.get(destino);
}

function estatico(ruta) {
  if (ESTATICOS[ruta]) return ESTATICOS[ruta];
  if (ruta.startsWith("/api/") && ruta.endsWith("/spec.json")) {
    const posible = path.join(RAIZ, ruta.replace(/^\//, ""));
    if (fs.existsSync(posible)) return ruta.replace(/^\//, "");
  }
  return "";
}

async function cuerpo(req) {
  const partes = [];
  for await (const parte of req) partes.push(parte);
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
  const ruta = decodeURIComponent(url.pathname);

  const archivo = estatico(ruta);
  if (archivo) {
    try {
      const datos = fs.readFileSync(path.join(RAIZ, archivo));
      res.statusCode = 200;
      res.setHeader("Content-Type", TIPOS[path.extname(archivo)] || "application/octet-stream");
      res.end(datos);
      return;
    } catch {
      /* Sigue: puede ser una API. */
    }
  }

  if (!ruta.startsWith("/api")) {
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

  req.body = await cuerpo(req);
  req.query = {};
  for (const [clave, valor] of url.searchParams.entries()) req.query[clave] = valor;

  const fijos = new Set(["generar", "listar", "salud", "estado"]);
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
    res.end(JSON.stringify({ error: String((error && error.message) || error) }));
  }
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  console.log("Taller en marcha: http://localhost:" + PUERTO);
  console.log("Comprobación:     http://localhost:" + PUERTO + "/api/salud");
  console.log("API de ejemplo:   http://localhost:" + PUERTO + "/api/ejemplo-notas/notas");
});
