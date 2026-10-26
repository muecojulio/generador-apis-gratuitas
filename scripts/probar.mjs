// @ts-nocheck
/**
 * Pruebas del taller. Se ejecutan solas antes de crear una API y también de
 * forma manual con:  node scripts/probar.mjs
 *
 * Comprueban:
 *  1. El lector (lib/motor.mjs) entiende descripciones claras y rechaza nombres feos.
 *  2. El motor (lib/runtime.js) hace bien el CRUD, con sus validaciones.
 *  3. La entrada de todas las APIs (lib/entrada.js) encuentra cada plano.
 *  4. El registro (lib/registro.js) está al día respecto a las carpetas api/.
 *  5. OpenAPI, límites, retención y token respetan el plano.
 *  6. El botón valida y envía el pedido por descripción a GitHub.
 *  7. El catálogo y la salud solo anuncian funciones disponibles.
 *  8. La generación local crea y actualiza una API sin llamar a la red.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  RESERVADOS_API,
  analizar,
  huella,
  normalizar,
  normalizarLimites,
  LIMITES_POR_DEFECTO,
  slugValido,
} from "../lib/motor.mjs";
import { extraerJson } from "../lib/ia.mjs";

const require = createRequire(import.meta.url);
const { crear } = require("../lib/runtime.js");
const { hash: hashToken } = require("../lib/auth.js");
const limitesMod = require("../lib/limites.js");
const { generar: generarOpenapi } = require("../lib/openapi.js");
const cacheMod = require("../lib/cache.js");
const indiceMod = require("../lib/indice.js");
const httpMod = require("../lib/http.js");
const cupoMod = require("../lib/cupo.js");
const publicas = require("../lib/publicas.js");
const fuentesGithub = require("../lib/fuentes-github.js");
const catalogoMod = require("../lib/catalogo.js");

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);

// Las pruebas nunca llaman a internet: las fuentes públicas se simulan y el
// enriquecimiento queda apagado salvo en las pruebas que lo encienden a mano.
const ENTORNO_FUENTES = process.env.TALLER_FUENTES;
const ENTORNO_PROBAR = process.env.TALLER_PROBAR;
process.env.TALLER_FUENTES = "0";
process.env.TALLER_SILENCIO = "1"; // los fallos simulados se prueban, no se gritan
const FETCH_ORIGINAL = globalThis.fetch;

const descripcion = [
  "Tabla productos con campos:",
  "- nombre (texto, obligatorio, máximo 80)",
  "- precio (número, obligatorio, mínimo 0)",
  "- existencias (entero, obligatorio)",
  "- activo (sí o no)",
  "",
  "Tabla categorias con campos nombre y descripcion.",
  "Quiero listar, crear, actualizar y borrar.",
  "El precio no puede ser negativo.",
].join("\n");

/* 1. El lector ------------------------------------------------------------ */

const plano = analizar(descripcion, "tienda-barrio");
assert.equal(plano.nombre, "tienda-barrio");
assert.equal(plano.huella, huella(descripcion));
assert.ok(plano.recursos.find((recurso) => recurso.nombre === "productos"));
assert.ok(plano.recursos.find((recurso) => recurso.nombre === "categorias"));
const precio = plano.recursos
  .find((recurso) => recurso.nombre === "productos")
  .campos.find((campo) => campo.nombre === "precio");
assert.equal(precio.tipo, "numero");
assert.equal(precio.requerido, true);
assert.equal(precio.min, 0);
assert.equal(slugValido("generar"), false, "«generar» es una ruta interna y no se puede usar");
assert.equal(slugValido("estado"), false, "«estado» es una ruta interna y no se puede usar");
assert.equal(slugValido("tienda-barrio"), true);
assert.equal(slugValido("plantillas"), true, "el antiguo nombre de la ruta ya está disponible");
assert.equal(slugValido("Tienda Barrio"), false);

// Un plano de IA con basura alrededor se limpia igual.
const sucio = normalizar(
  { titulo: "Notas", recursos: [{ nombre: "Notas", campos: [{ nombre: "Titulo", tipo: "texto", requerido: true }] }] },
  "mis-notas",
  "llm7"
);
assert.equal(sucio.nombre, "mis-notas");
assert.equal(sucio.motor, "llm7");
assert.equal(sucio.recursos[0].nombre, "notas");
assert.equal(sucio.recursos[0].campos[0].nombre, "titulo");

// El extractor de JSON aguanta texto, cercas y razonamiento.
assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(extraerJson('Claro:\n{"a":2}'), { a: 2 });
assert.deepEqual(extraerJson('<thinking>nada</thinking>{"a":3}'), { a: 3 });

/* 2. El motor ------------------------------------------------------------- */

function memoriaCon(inicial) {
  let estado = inicial || null;
  let sha = inicial ? "1" : "0";
  const almacen = {
    token() {
      return "prueba";
    },
    async leer() {
      return { datos: estado, sha: estado ? sha : null };
    },
    async guardar(_nombre, datos) {
      estado = datos;
      sha = String(Number(sha) + 1);
      return { sha };
    },
    estado() {
      return estado;
    },
  };
  return almacen;
}

function memoria() {
  let estado = null;
  let sha = "0";
  return {
    token() {
      return "prueba";
    },
    async leer() {
      return { datos: estado, sha: estado ? sha : null };
    },
    async guardar(_nombre, datos) {
      estado = datos;
      sha = String(Number(sha) + 1);
      return { sha };
    },
  };
}

function llamada(metodo, url, body, cabeceras) {
  let status = 0;
  let crudo = "";
  const headers = {};
  const res = {
    setHeader(clave, valor) {
      headers[clave] = valor;
    },
    end(datos) {
      crudo = datos || "";
    },
  };
  Object.defineProperty(res, "statusCode", {
    set(valor) {
      status = valor;
    },
    get() {
      return status;
    },
  });
  const partes = url.split("?")[0].split("/").filter(Boolean);
  const query = {};
  if (partes[0] === "api") {
    query.nombre = partes[1] || "";
    if (partes.length > 2) query.ruta = partes.slice(2);
  }
  const req = { method: metodo, url, body, query, headers: cabeceras || {} };
  return {
    req,
    res,
    headers,
    async json() {
      return { status, cuerpo: crudo ? JSON.parse(crudo) : null };
    },
  };
}

const spec = {
  ...plano,
  ejemplos: {
    productos: [{ id: "p1", nombre: "Pan", precio: 12, existencias: 4, activo: true }],
  },
};
const handler = crear(spec, { almacen: memoria() });

const raiz = llamada("GET", "/api/tienda-barrio");
await handler(raiz.req, raiz.res);
const manifiesto = await raiz.json();
assert.equal(manifiesto.status, 200);
assert.ok(manifiesto.cuerpo.rutas.some((ruta) => ruta.startsWith("POST /api/tienda-barrio/productos")));

const lista = llamada("GET", "/api/tienda-barrio/productos");
await handler(lista.req, lista.res);
const productos = await lista.json();
assert.equal(productos.cuerpo.total, 1);
assert.equal(productos.cuerpo.datos[0].id, "p1");

const malo = llamada("POST", "/api/tienda-barrio/productos", { nombre: "Leche", precio: -1, existencias: 2 });
await handler(malo.req, malo.res);
assert.equal((await malo.json()).status, 400, "el precio negativo se rechaza");

const bueno = llamada("POST", "/api/tienda-barrio/productos", {
  nombre: "Leche",
  precio: 18,
  existencias: 6,
  activo: false,
});
await handler(bueno.req, bueno.res);
const creado = await bueno.json();
assert.equal(creado.status, 201);
const id = creado.cuerpo.dato.id;

const cambio = llamada("PUT", "/api/tienda-barrio/productos/" + id, { precio: 20 });
await handler(cambio.req, cambio.res);
const actualizado = await cambio.json();
assert.equal(actualizado.status, 200);
assert.equal(actualizado.cuerpo.dato.precio, 20);
assert.equal(actualizado.cuerpo.dato.nombre, "Leche");

const borrado = llamada("DELETE", "/api/tienda-barrio/productos/" + id);
await handler(borrado.req, borrado.res);
assert.equal((await borrado.json()).status, 200);

const otra = llamada("GET", "/api/tienda-barrio/productos");
await handler(otra.req, otra.res);
assert.equal((await otra.json()).cuerpo.total, 1);

/* 3. La entrada de todas las APIs ---------------------------------------- */

const { buscar, publicadas } = require("../lib/catalogo.js");
assert.equal(buscar("no-existe-todavia"), null);
assert.equal(buscar("../secreto"), null, "no se puede salir de la carpeta api/");
const ejemplo = buscar("ejemplo-notas");
assert.ok(ejemplo && ejemplo.nombre === "ejemplo-notas", "la API de ejemplo debe existir");
assert.ok(publicadas().some((api) => api.nombre === "ejemplo-notas"));

/* 4. El registro al día -------------------------------------------------- */

const registro = require("../lib/registro.js").registro;
const carpetas = fs
  .readdirSync(path.join(RAIZ, "api"), { withFileTypes: true })
  .filter((entrada) => entrada.isDirectory() && fs.existsSync(path.join(RAIZ, "api", entrada.name, "spec.json")))
  .map((entrada) => entrada.name)
  .sort();
const registradas = Object.keys(registro).sort();
assert.deepEqual(
  registradas,
  carpetas,
  "lib/registro.js se quedó atrás: ejecuta node scripts/registrar.mjs"
);
for (const nombre of registradas) {
  const spec = registro[nombre];
  assert.equal(spec.nombre, nombre);
  assert.ok(Array.isArray(spec.recursos) && spec.recursos.length >= 1, nombre + " necesita al menos un recurso");
}

/* 5. OpenAPI, límites y token ------------------------------------------- */

// Los límites se recortan a rangos seguros y el lector entiende los del texto.
assert.deepEqual(normalizarLimites(), LIMITES_POR_DEFECTO);
assert.deepEqual(normalizarLimites({ maxRegistrosPorRecurso: 2, maxBytes: 100, retencionDias: 9999 }), {
  maxRegistrosPorRecurso: 2,
  maxBytes: 4096,
  retencionDias: 3650,
});
assert.deepEqual(
  normalizarLimites({ maxRegistros: 2, max_bytes: 8192, retencion: 7 }),
  limitesMod.normalizar({ maxRegistros: 2, max_bytes: 8192, retencion: 7 })
);
const conLimites = analizar(
  "Tabla notas con campos titulo. Máximo 200 registros. Retención de 30 días. Hasta 64 KB.",
  "notas-limite"
);
assert.equal(conLimites.limites.maxRegistrosPorRecurso, 200);
assert.equal(conLimites.limites.retencionDias, 30);
assert.equal(conLimites.limites.maxBytes, 65536);

// OpenAPI sale del plano y respeta solo lectura y token.
const doc = generarOpenapi(spec, { baseUrl: "https://taller.test" });
assert.equal(doc.openapi, "3.0.3");
assert.equal(doc.servers[0].url, "https://taller.test");
assert.ok(doc.paths["/api/tienda-barrio/productos"].get);
assert.ok(doc.paths["/api/tienda-barrio/productos"].post);
assert.ok(doc.paths["/api/tienda-barrio/productos/{id}"].put);
assert.ok(doc.components.schemas.ProductosEntrada);
assert.ok(doc.components.schemas.Productos.required.includes("nombre"), "el esquema de salida marca los campos obligatorios");
assert.ok(doc.components.schemas.Productos.required.includes("id"));
assert.equal(doc.components.schemas.ProductosEntradaParcial.required, undefined, "PUT no exige todos los campos");

const specSolo = normalizar({ ...plano, soloLectura: true }, "solo-demo", "incluido");
const docSolo = generarOpenapi(specSolo);
assert.ok(docSolo.paths["/api/solo-demo/productos"].get);
assert.equal(docSolo.paths["/api/solo-demo/productos"].post, undefined);
assert.equal(docSolo["x-taller"].soloLectura, true);

const tokenPrueba = "token-de-prueba-123";
const specAuth = normalizar(
  { ...plano, auth: { hash: hashToken(tokenPrueba), modo: "todo" } },
  "auth-demo",
  "incluido"
);
assert.equal(specAuth.auth.hash, hashToken(tokenPrueba));
assert.equal(specAuth.auth.hash === tokenPrueba, false, "el plano no guarda el token en claro");
const docAuth = generarOpenapi(specAuth);
assert.ok(docAuth.paths["/api/auth-demo/productos"].get.security);
assert.ok(docAuth.components.securitySchemes.bearerAuth);
assert.equal(docAuth["x-taller"].autenticacion.modo, "todo");
assert.equal(JSON.stringify(docAuth).includes(tokenPrueba), false, "el OpenAPI no filtra el token");

// El motor publica el OpenAPI y redirige /docs sin gastar otra función.
const rutaOpenapi = llamada("GET", "/api/tienda-barrio/openapi.json");
await handler(rutaOpenapi.req, rutaOpenapi.res);
const abierto = await rutaOpenapi.json();
assert.equal(abierto.status, 200);
assert.equal(abierto.cuerpo["x-taller"].nombre, "tienda-barrio");
const rutaDocs = llamada("GET", "/api/tienda-barrio/docs");
await handler(rutaDocs.req, rutaDocs.res);
assert.equal(rutaDocs.res.statusCode, 302);
assert.equal(rutaDocs.headers.Location, "/docs?api=tienda-barrio");

// Token por cabecera: escritura protegida, lectura pública.
const almacenAuth = memoriaCon(null);
const handlerAuth = crear(specAuth, { almacen: almacenAuth });
const lecturaAbierta = llamada("GET", "/api/auth-demo/productos");
await handlerAuth(lecturaAbierta.req, lecturaAbierta.res);

// modo "todo": también bloquea la lectura.
const lecturaBloqueada = llamada("GET", "/api/auth-demo/productos");
await handlerAuth(lecturaBloqueada.req, lecturaBloqueada.res);
assert.equal((await lecturaBloqueada.json()).status, 401);

const lecturaConToken = llamada("GET", "/api/auth-demo/productos", undefined, {
  authorization: "Bearer " + tokenPrueba,
});
await handlerAuth(lecturaConToken.req, lecturaConToken.res);
assert.equal((await lecturaConToken.json()).status, 200);

const sinToken = llamada("POST", "/api/auth-demo/productos", { nombre: "Privado", precio: 5, existencias: 1 });
await handlerAuth(sinToken.req, sinToken.res);
assert.equal((await sinToken.json()).status, 401);

const tokenMalo = llamada("POST", "/api/auth-demo/productos", { nombre: "Privado", precio: 5, existencias: 1 }, {
  authorization: "Bearer otro-token",
});
await handlerAuth(tokenMalo.req, tokenMalo.res);
assert.equal((await tokenMalo.json()).status, 401);

const tokenBueno = llamada("POST", "/api/auth-demo/productos", { nombre: "Privado", precio: 5, existencias: 1 }, {
  "x-api-token": tokenPrueba,
});
await handlerAuth(tokenBueno.req, tokenBueno.res);
const creadoPrivado = await tokenBueno.json();
assert.equal(creadoPrivado.status, 201);

const specEscritura = normalizar(
  { ...plano, auth: { hash: hashToken(tokenPrueba), modo: "escritura" } },
  "auth-escritura",
  "incluido"
);
const handlerEscritura = crear(specEscritura, { almacen: memoriaCon(null) });
const lecturaPublica = llamada("GET", "/api/auth-escritura/productos");
await handlerEscritura(lecturaPublica.req, lecturaPublica.res);
assert.equal((await lecturaPublica.json()).status, 200);
const escrituraBloqueada = llamada("POST", "/api/auth-escritura/productos", {
  nombre: "Sin token",
  precio: 1,
  existencias: 1,
});
await handlerEscritura(escrituraBloqueada.req, escrituraBloqueada.res);
assert.equal((await escrituraBloqueada.json()).status, 401);

// Límite de registros.
const specCupo = {
  ...plano,
  nombre: "cupo-demo",
  limites: { maxRegistrosPorRecurso: 1, maxBytes: 262144, retencionDias: 0 },
};
const handlerCupo = crear(specCupo, { almacen: memoriaCon(null) });
const primero = llamada("POST", "/api/cupo-demo/productos", { nombre: "Uno", precio: 1, existencias: 1 });
await handlerCupo(primero.req, primero.res);
assert.equal((await primero.json()).status, 201);
const segundo = llamada("POST", "/api/cupo-demo/productos", { nombre: "Dos", precio: 2, existencias: 2 });
await handlerCupo(segundo.req, segundo.res);
assert.equal((await segundo.json()).status, 409, "el cupo de registros se respeta");

// Límite de tamaño del archivo.
const specBytes = {
  nombre: "bytes-demo",
  titulo: "Bytes",
  resumen: "",
  motor: "incluido",
  soloLectura: false,
  limites: { maxRegistrosPorRecurso: 500, maxBytes: 4096, retencionDias: 0 },
  recursos: [{ nombre: "notas", titulo: "Notas", campos: [{ nombre: "texto", tipo: "texto", requerido: true, max: 10000 }] }],
};
const handlerBytes = crear(specBytes, { almacen: memoriaCon(null) });
const grande = llamada("POST", "/api/bytes-demo/notas", { texto: "x".repeat(5000) });
await handlerBytes(grande.req, grande.res);
assert.equal((await grande.json()).status, 413, "el límite de tamaño se respeta");

// Retención: lo viejo no se lee y se limpia al escribir.
const specRetencion = {
  nombre: "retencion-demo",
  titulo: "Retención",
  resumen: "",
  motor: "incluido",
  soloLectura: false,
  limites: { maxRegistrosPorRecurso: 500, maxBytes: 262144, retencionDias: 30 },
  recursos: [{ nombre: "notas", titulo: "Notas", campos: [{ nombre: "texto", tipo: "texto", requerido: true, max: 500 }] }],
};
const almacenRetencion = memoriaCon({
  recursos: { notas: [{ id: "viejo", creado: "2020-01-01T00:00:00.000Z", texto: "viejo" }] },
});
const handlerRetencion = crear(specRetencion, { almacen: almacenRetencion });
const viejo = llamada("GET", "/api/retencion-demo/notas");
await handlerRetencion(viejo.req, viejo.res);
assert.equal((await viejo.json()).cuerpo.total, 0, "la retención oculta registros vencidos");
const nuevo = llamada("POST", "/api/retencion-demo/notas", { texto: "nuevo" });
await handlerRetencion(nuevo.req, nuevo.res);
assert.equal((await nuevo.json()).status, 201);
assert.equal(almacenRetencion.estado().recursos.notas.length, 1);
assert.equal(almacenRetencion.estado().recursos.notas[0].texto, "nuevo");

/* 6. El botón arma el pedido correcto (sin llamar a GitHub de verdad) ------- */

const gh = require("../lib/github.js");
const pedirOriginal = gh.pedir;
const entornoOriginal = {
  GITHUB_PAT: process.env.GITHUB_PAT,
  GENERADOR_SECRETO: process.env.GENERADOR_SECRETO,
};
process.env.GITHUB_PAT = "pat-de-prueba";
delete process.env.GENERADOR_SECRETO;

const llamadas = [];
gh.pedir = async (metodo, ruta, cuerpo) => {
  llamadas.push({ metodo, ruta, cuerpo });
  if (ruta.includes("/actions/workflows/generar-api.yml/runs")) {
    return { status: 200, json: { workflow_runs: [] } };
  }
  if (ruta.endsWith("/dispatches")) return { status: 204, json: null };
  return { status: 200, json: {} };
};

function respuestaJson() {
  let status = 0;
  let cuerpo = "";
  const headers = {};
  const res = {
    setHeader(clave, valor) {
      headers[clave] = valor;
    },
    end(datos) {
      cuerpo = datos || "";
    },
  };
  Object.defineProperty(res, "statusCode", {
    set(valor) {
      status = valor;
    },
    get() {
      return status;
    },
  });
  return {
    res,
    json() {
      return { status, cuerpo: cuerpo ? JSON.parse(cuerpo) : null, headers };
    },
  };
}

try {
  const handlerGenerar = require("../api/generar.js");
  const tokenHash = "b".repeat(64);

  const pedido = respuestaJson();
  await handlerGenerar(
    {
      method: "POST",
      headers: {},
      body: {
        nombre: "pedido-demo",
        descripcion: "  " + descripcion + "  ",
        limites: { maxRegistrosPorRecurso: 42, retencionDias: 7 },
        soloLectura: true,
        tokenAccion: "poner",
        tokenHash,
        tokenModo: "todo",
      },
    },
    pedido.res
  );
  const salida = pedido.json();
  assert.equal(salida.status, 202);
  assert.equal(salida.cuerpo.nombre, "pedido-demo");
  assert.equal(salida.cuerpo.documentacion, "/docs?api=pedido-demo");
  assert.equal(salida.cuerpo.openapi, "/api/pedido-demo/openapi.json");
  assert.equal(Object.hasOwn(salida.cuerpo, "plantilla"), false);
  assert.equal(salida.cuerpo.protegida, true);
  const despacho = llamadas.find((llamada) => llamada.ruta.endsWith("/dispatches"));
  assert.ok(despacho, "debe disparar el workflow");
  assert.equal(despacho.cuerpo.event_type, "generar-api");
  assert.equal(despacho.cuerpo.client_payload.nombre, "pedido-demo");
  assert.equal(despacho.cuerpo.client_payload.descripcion, descripcion);
  assert.equal(Object.hasOwn(despacho.cuerpo.client_payload, "plantilla"), false);
  assert.equal(despacho.cuerpo.client_payload.soloLectura, "1");
  assert.equal(despacho.cuerpo.client_payload.tokenHash, tokenHash);
  assert.equal(despacho.cuerpo.client_payload.tokenModo, "todo");
  assert.deepEqual(JSON.parse(despacho.cuerpo.client_payload.limites), {
    maxRegistrosPorRecurso: 42,
    maxBytes: 262144,
    retencionDias: 7,
  });

  // Sin ajustes explícitos, Actions debe poder conservar los de la API existente.
  const regeneracion = respuestaJson();
  await handlerGenerar(
    { method: "POST", headers: {}, body: { nombre: "ejemplo-notas", descripcion } },
    regeneracion.res
  );
  assert.equal(regeneracion.json().status, 202);
  assert.equal(regeneracion.json().cuerpo.actualiza, true);
  const sinAjustes = llamadas.at(-1).cuerpo.client_payload;
  assert.equal(sinAjustes.limites, "");
  assert.equal(sinAjustes.soloLectura, "");
  assert.equal(sinAjustes.tokenAccion, "mantener");
  assert.equal(sinAjustes.tokenHash, "");

  // La descripción siempre es obligatoria, incluso en pedidos del cliente antiguo.
  for (const body of [
    { nombre: "sin-descripcion" },
    { nombre: "descripcion-corta", descripcion: "Tabla notas." },
    { nombre: "pedido-antiguo", plantilla: "notas" },
    { nombre: "descripcion-larga", descripcion: "x".repeat(8001) },
  ]) {
    const rechazado = respuestaJson();
    const antes = llamadas.length;
    await handlerGenerar({ method: "POST", headers: {}, body }, rechazado.res);
    assert.equal(rechazado.json().status, 400, body.nombre + " debe rechazarse");
    assert.equal(llamadas.length, antes, "una descripción inválida no debe llamar a GitHub");
  }

  const reservado = respuestaJson();
  await handlerGenerar(
    { method: "POST", headers: {}, body: { nombre: "docs", descripcion: "Tabla pruebas con campos titulo." } },
    reservado.res
  );
  assert.equal(reservado.json().status, 400, "no se puede crear una API con un nombre interno");

  // Un navegador de otro sitio no puede disparar la creación (CSRF).
  const antesCsrf = llamadas.length;
  const csrf = respuestaJson();
  await handlerGenerar(
    {
      method: "POST",
      headers: { origin: "https://otro-sitio.example", "sec-fetch-site": "cross-site" },
      body: { nombre: "csrf-demo", descripcion },
    },
    csrf.res
  );
  assert.equal(csrf.json().status, 403, "se rechaza el origen ajeno");
  assert.equal(llamadas.length, antesCsrf, "una petición CSRF no debe llegar a GitHub");

  const mismoSitio = respuestaJson();
  await handlerGenerar(
    {
      method: "POST",
      headers: { origin: "https://taller.test", host: "taller.test" },
      body: { nombre: "mismo-sitio", descripcion },
    },
    mismoSitio.res
  );
  assert.equal(mismoSitio.json().status, 202, "el propio sitio sí puede crear APIs");

  const hashMalo = respuestaJson();
  await handlerGenerar(
    {
      method: "POST",
      headers: {},
      body: { nombre: "token-malo", descripcion: "Tabla pruebas con campos titulo.", tokenAccion: "poner", tokenHash: "123" },
    },
    hashMalo.res
  );
  assert.equal(hashMalo.json().status, 400, "una huella inválida se rechaza");
} finally {
  gh.pedir = pedirOriginal;
  if (entornoOriginal.GITHUB_PAT === undefined) delete process.env.GITHUB_PAT;
  else process.env.GITHUB_PAT = entornoOriginal.GITHUB_PAT;
  if (entornoOriginal.GENERADOR_SECRETO === undefined) delete process.env.GENERADOR_SECRETO;
  else process.env.GENERADOR_SECRETO = entornoOriginal.GENERADOR_SECRETO;
}

/* 7. Catálogo y salud sin anunciar funciones retiradas -------------------- */

const listadoPublico = respuestaJson();
require("../api/listar.js")({ method: "GET" }, listadoPublico.res);
assert.equal(listadoPublico.json().status, 200);
assert.equal(listadoPublico.json().cuerpo.total, registradas.length);
assert.equal(listadoPublico.json().cuerpo.documentacion, "/docs");
assert.equal(listadoPublico.json().cuerpo.fuentes, "/api/fuentes");
assert.equal(listadoPublico.json().cuerpo.privacidad, "/privacidad");
assert.equal(Object.hasOwn(listadoPublico.json().cuerpo, "plantillas"), false);

const salud = respuestaJson();
require("../api/salud.js")({ method: "GET" }, salud.res);
assert.equal(salud.json().status, 200);
const funcionesFijas = fs.readdirSync(path.join(RAIZ, "api")).filter((archivo) => archivo.endsWith(".js")).length;
assert.equal(
  salud.json().cuerpo.funciones,
  funcionesFijas + 2,
  "el número de funciones debe contarse de verdad (fijas + 2 dinámicas)"
);
assert.equal(salud.json().cuerpo.apis, registradas.length);
assert.equal(Object.hasOwn(salud.json().cuerpo, "plantillas"), false);
assert.ok(salud.json().cuerpo.novedades.includes("fuentes"), "la salud anuncia las fuentes públicas");
assert.ok(salud.json().cuerpo.cache && typeof salud.json().cuerpo.cache.entradas === "number");

/* 8. Generación local por descripción, sin red ni cambios en el repositorio */

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "taller-descripcion-"));
try {
  const entorno = {
    ...process.env,
    GENERADOR_SIN_IA: "1",
    NOMBRE: "prueba-descripcion",
    DESCRIPCION: "",
    PLANTILLA: "notas", // Una variable antigua ya no permite saltarse la descripción.
    SOLO_LECTURA: "1",
    LIMITES: JSON.stringify({ maxRegistrosPorRecurso: 42, retencionDias: 7 }),
    TOKEN_ACCION: "poner",
    TOKEN_HASH: "c".repeat(64),
    TOKEN_MODO: "todo",
  };
  const disenar = (env) => spawnSync(process.execPath, [path.join(RAIZ, "scripts/disenar.mjs")], {
    cwd: temporal,
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  const sinDescripcion = disenar(entorno);
  assert.equal(sinDescripcion.status, 1);
  assert.match(sinDescripcion.stderr, /descripción es demasiado corta/);
  const archivoSpec = path.join(temporal, "api/prueba-descripcion/spec.json");
  assert.equal(fs.existsSync(archivoSpec), false, "no debe crear nada sin descripción");

  const conDescripcion = disenar({ ...entorno, DESCRIPCION: descripcion });
  assert.equal(conDescripcion.status, 0, conDescripcion.stderr);
  const generado = JSON.parse(fs.readFileSync(archivoSpec, "utf8"));
  assert.equal(generado.motor, "incluido");
  assert.equal(generado.huella, huella(descripcion));
  assert.ok(generado.recursos.some((recurso) => recurso.nombre === "productos"));
  assert.equal(generado.soloLectura, true);
  assert.deepEqual(generado.limites, { maxRegistrosPorRecurso: 42, maxBytes: 262144, retencionDias: 7 });
  assert.deepEqual(generado.auth, { tipo: "token", hash: entorno.TOKEN_HASH, modo: "todo" });
  assert.ok(fs.readFileSync(path.join(temporal, "lib/registro.js"), "utf8").includes("prueba-descripcion/spec.json"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(temporal, "catalogo.json"), "utf8")).apis[0].nombre, generado.nombre);

  const nuevaDescripcion = descripcion + "\nEl nombre es obligatorio.";
  const regenerada = disenar({
    ...entorno,
    DESCRIPCION: nuevaDescripcion,
    SOLO_LECTURA: "",
    LIMITES: "",
    TOKEN_ACCION: "",
    TOKEN_HASH: "",
  });
  assert.equal(regenerada.status, 0, regenerada.stderr);
  const actualizado = JSON.parse(fs.readFileSync(archivoSpec, "utf8"));
  assert.equal(actualizado.huella, huella(nuevaDescripcion));
  assert.equal(actualizado.soloLectura, generado.soloLectura);
  assert.deepEqual(actualizado.limites, generado.limites);
  assert.deepEqual(actualizado.auth, generado.auth);
} finally {
  fs.rmSync(temporal, { recursive: true, force: true });
}


/* 9. Caché, índices, seguridad y fuentes públicas -------------------------- */

// --- Caché: TTL, borrado y single flight.
cacheMod.limpiar();
assert.equal(cacheMod.obtener("nada"), undefined);
cacheMod.poner("a", 1, 40);
assert.equal(cacheMod.obtener("a"), 1);
await new Promise((resolver) => setTimeout(resolver, 70));
assert.equal(cacheMod.tiene("a"), false, "la caché caduca sola");
let cargas = 0;
const [uno, dos] = await Promise.all([
  cacheMod.recordar("b", 1000, async () => {
    cargas += 1;
    await new Promise((resolver) => setTimeout(resolver, 25));
    return 42;
  }),
  cacheMod.recordar("b", 1000, async () => {
    cargas += 1;
    return 43;
  }),
]);
assert.equal(cargas, 1, "dos peticiones simultáneas comparten una sola carga");
assert.equal(uno, 42);
assert.equal(dos, 42);
cacheMod.borrarPrefijo("b");
assert.equal(cacheMod.tiene("b"), false);
assert.ok(cacheMod.estadisticas().maximo >= 16);

// --- Índices: id O(1), búsqueda sin acentos y recursos por nombre.
const filasIndice = [
  { id: "a", nombre: "Café con leche", precio: 3 },
  { id: "b", nombre: "Té verde", precio: 2 },
  { id: "zzz-unico", titulo: "Sin coincidencias" },
];
const indice = indiceMod.crearIndice(filasIndice);
assert.equal(indice.total, 3);
assert.equal(indice.obtener("a").nombre, "Café con leche");
assert.equal(indice.obtener("no-existe"), undefined);
assert.equal(indice.buscar("cafe").length, 1, "la búsqueda no distingue acentos");
assert.equal(indice.buscar("VERDE").length, 1);
assert.equal(indice.buscar("zzz-unico").length, 0, "el id no entra en la búsqueda de texto");
assert.equal(indiceMod.crearIndice([{ id: "x", n: 1 }, { id: "x", n: 2 }]).obtener("x").n, 1, "gana el primero");
const recursosIndice = indiceMod.indexarRecursos([{ nombre: "a" }, { nombre: "b" }, { nombre: "a" }]);
assert.equal(recursosIndice.total, 2);
assert.equal(recursosIndice.obtener("a").nombre, "a");
assert.equal(recursosIndice.obtener("c"), undefined);
const grandes = Array.from({ length: 5000 }, (_, i) => ({
  id: "r" + i,
  nombre: i === 4999 ? "Camiseta de algodón orgánico" : "Producto " + i,
  categoria: i % 2 === 0 ? "textil" : "hogar",
  activo: i % 3 === 0,
}));
const indiceGrande = indiceMod.crearIndice(grandes);
assert.equal(indiceGrande.obtener("r4999").nombre, "Camiseta de algodón orgánico");
assert.equal(indiceGrande.posicion("r4999"), 4999);
assert.equal(indiceGrande.posicion("no-existe"), -1);
assert.equal(indiceGrande.filtrarPorCampo("categoria", "textil").length, 2500);
assert.equal(indiceGrande.filtrar({ categoria: "textil", activo: "si" }).length, 834);
assert.equal(indiceGrande.buscar("algodon").length, 1, "índice de trigramas sin acentos en 5000 filas");
assert.ok(indiceGrande.estadisticas().trigramasUnicos > 10);
assert.equal( typeof cacheMod.purgar(), "number" );
assert.equal( typeof cacheMod.estadisticas().tasaAciertos, "number" );

// --- El índice en caché distingue entre recursos distintos de una misma API.
const specMulti = {
  ...plano,
  nombre: "multi-recurso",
  ejemplos: {
    productos: [
      { id: "p1", nombre: "Pan", precio: 12, existencias: 4, activo: true },
      { id: "p2", nombre: "Café", precio: 45, existencias: 10, activo: false },
    ],
    categorias: [{ id: "c1", nombre: "Panadería", descripcion: "Horno diario" }],
  },
};
const handlerMulti = crear(specMulti, { almacen: memoria() });
const resProd = llamada("GET", "/api/multi-recurso/productos");
await handlerMulti(resProd.req, resProd.res);
assert.equal((await resProd.json()).cuerpo.datos[0].id, "p1");
assert.ok(resProd.headers.ETag, "las lecturas de recursos incluyen ETag");
assert.ok(["HIT", "MISS"].includes(resProd.headers["X-Cache"]), "las lecturas indican X-Cache");

const resProd304 = llamada("GET", "/api/multi-recurso/productos", undefined, {
  "if-none-match": resProd.headers.ETag,
});
await handlerMulti(resProd304.req, resProd304.res);
assert.equal(resProd304.res.statusCode, 304, "la lista de un recurso responde 304 con If-None-Match");

// La semilla (sin datos guardados todavía) es estable: dos lecturas seguidas
// devuelven el mismo cuerpo y el mismo ETag, así el 304 no depende del reloj.
const handlerSemilla = crear(specMulti, { almacen: memoria() });
const semillaUno = llamada("GET", "/api/multi-recurso/productos");
await handlerSemilla(semillaUno.req, semillaUno.res);
const semillaDos = llamada("GET", "/api/multi-recurso/productos");
await handlerSemilla(semillaDos.req, semillaDos.res);
assert.equal(
  semillaDos.headers.ETag,
  semillaUno.headers.ETag,
  "la semilla debe ser estable entre lecturas para que el ETag y el 304 funcionen"
);

const resCat = llamada("GET", "/api/multi-recurso/categorias");
await handlerMulti(resCat.req, resCat.res);
const jsonCat = await resCat.json();
assert.equal(jsonCat.cuerpo.total, 1);
assert.equal(jsonCat.cuerpo.datos[0].id, "c1", "el segundo recurso no reutiliza por error el índice del primero");

// Filtro secundario O(1) por campo en la URL (?activo=true).
const resFiltroActivo = llamada("GET", "/api/multi-recurso/productos?activo=true");
await handlerMulti(resFiltroActivo.req, resFiltroActivo.res);
const jsonFiltroActivo = await resFiltroActivo.json();
assert.equal(jsonFiltroActivo.cuerpo.total, 1);
assert.equal(jsonFiltroActivo.cuerpo.datos[0].id, "p1");

// --- Las listas de nombres reservados de motor y catálogo no se separan.
assert.deepEqual(
  [...RESERVADOS_API].sort(),
  [...catalogoMod.RESERVADOS].sort(),
  "lib/motor.mjs y lib/catalogo.js deben reservar los mismos nombres"
);
assert.equal(slugValido("constructor"), false, "no se permite constructor como nombre de API");
assert.equal(slugValido("prototype"), false, "no se permite prototype como nombre de API");

// --- Saneamiento contra polución de prototipos, bytes nulos y normalización de IP.
const cuerpoContaminado = await httpMod.leerJson(
  {
    headers: { "content-type": "application/json" },
    body: '{"nombre":"Pan\\u0000Limpio","__proto__":{"contaminado":true},"constructor":{"prototype":{"malo":1}}}',
  },
  1000
);
assert.equal(({}).contaminado, undefined, "__proto__ no contamina Object.prototype");
assert.equal(Object.prototype.hasOwnProperty.call(cuerpoContaminado, "__proto__"), false);
assert.equal(Object.prototype.hasOwnProperty.call(cuerpoContaminado, "constructor"), false);
assert.equal(httpMod.ipDe({ headers: { "x-forwarded-for": "::ffff:203.0.113.9, 10.0.0.1" } }), "203.0.113.9");

const postNulo = llamada("POST", "/api/multi-recurso/categorias", {
  nombre: "Bebidas\u0000Frías\u0007",
  descripcion: "Refrescos",
});
await handlerMulti(postNulo.req, postNulo.res);
const creadoNulo = await postNulo.json();
assert.equal(creadoNulo.status, 201);
assert.equal(creadoNulo.cuerpo.dato.nombre, "BebidasFrías", "se eliminan bytes nulos y caracteres de control");

// --- Cupo de escritura por IP (TALLER_CUPO_MIN).
process.env.TALLER_CUPO_MIN = "2";
cupoMod.limpiar();
const ipPrueba = { "x-forwarded-for": "198.51.100.77" };
const esc1 = llamada("POST", "/api/multi-recurso/categorias", { nombre: "Uno" }, ipPrueba);
const esc2 = llamada("POST", "/api/multi-recurso/categorias", { nombre: "Dos" }, ipPrueba);
const esc3 = llamada("POST", "/api/multi-recurso/categorias", { nombre: "Tres" }, ipPrueba);
await handlerMulti(esc1.req, esc1.res);
await handlerMulti(esc2.req, esc2.res);
await handlerMulti(esc3.req, esc3.res);
assert.equal((await esc1.json()).status, 201);
assert.equal((await esc2.json()).status, 201);
assert.equal((await esc3.json()).status, 429, "la tercera escritura supera TALLER_CUPO_MIN=2");
assert.ok(esc3.headers["Retry-After"]);
delete process.env.TALLER_CUPO_MIN;
cupoMod.limpiar();

// --- Cabeceras de seguridad, ETag y 304 en una API generada.
const seguridad = llamada("GET", "/api/tienda-barrio");
await handler(seguridad.req, seguridad.res);
await seguridad.json();
assert.equal(seguridad.headers["X-Content-Type-Options"], "nosniff");
assert.equal(seguridad.headers["X-Frame-Options"], "DENY");
assert.equal(seguridad.headers["Referrer-Policy"], "strict-origin-when-cross-origin");
assert.equal(seguridad.headers["Access-Control-Allow-Origin"], "*", "las APIs generadas son públicas");
assert.equal(seguridad.headers["Cross-Origin-Resource-Policy"], "cross-origin");
assert.ok(seguridad.headers.ETag, "el manifiesto lleva ETag");
assert.equal(seguridad.headers["Cache-Control"], "public, max-age=300, s-maxage=1200");

const sinCambios = llamada("GET", "/api/tienda-barrio", undefined, {
  "if-none-match": seguridad.headers.ETag,
});
await handler(sinCambios.req, sinCambios.res);
assert.equal(sinCambios.res.statusCode, 304, "If-None-Match responde 304");

// --- El cuerpo tiene topes: 413, 415 y 400 con mensajes claros.
await assert.rejects(
  () => httpMod.leerJson({ headers: { "content-type": "application/json" }, body: { texto: "x".repeat(2000) } }, 100),
  (error) => error.status === 413
);
await assert.rejects(
  () => httpMod.leerJson({ headers: { "content-type": "text/plain" }, body: "hola" }, 1000),
  (error) => error.status === 415
);
await assert.rejects(() => httpMod.leerJson({ headers: {}, body: "{roto" }, 1000), (error) => error.status === 400);
assert.deepEqual(await httpMod.leerJson({ headers: {}, body: { a: 1 } }, 1000), { a: 1 });

// --- Si no se pudo leer el archivo, se lee la semilla pero NO se escribe.
let guardadosRotura = 0;
const almacenRoto = {
  token: () => "prueba",
  async leer() {
    const error = new Error("GitHub no responde");
    error.status = 502;
    throw error;
  },
  async guardar() {
    guardadosRotura += 1;
  },
};
const specRoto = { ...plano, nombre: "roto-demo", huella: "roto" };
const handlerRoto = crear(specRoto, { almacen: almacenRoto });
const lecturaRespaldo = llamada("GET", "/api/roto-demo/productos");
await handlerRoto(lecturaRespaldo.req, lecturaRespaldo.res);
const respaldo = await lecturaRespaldo.json();
assert.equal(respaldo.status, 200);
assert.equal(lecturaRespaldo.headers["X-Datos"], "respaldo");
const escrituraRoto = llamada("POST", "/api/roto-demo/productos", { nombre: "X", precio: 1, existencias: 1 });
await handlerRoto(escrituraRoto.req, escrituraRoto.res);
assert.equal((await escrituraRoto.json()).status, 503, "sin leer no se sobrescribe");
assert.equal(guardadosRotura, 0, "no se llamó a guardar");

const almacenCorrupto = {
  token: () => "prueba",
  async leer() {
    const error = new Error("JSON roto");
    error.status = 500;
    error.corrupto = true;
    throw error;
  },
  async guardar() {},
};
const handlerCorrupto = crear({ ...specRoto, nombre: "corrupto-demo" }, { almacen: almacenCorrupto });
const lecturaCorrupta = llamada("GET", "/api/corrupto-demo/productos");
await handlerCorrupto(lecturaCorrupta.req, lecturaCorrupta.res);
assert.equal((await lecturaCorrupta.json()).status, 500, "un archivo roto se avisa, no se pisa");

// --- Fuerza bruta: tras muchos fallos, 429.
let bloqueada = false;
for (let intento = 0; intento < 30; intento += 1) {
  const prueba = llamada("GET", "/api/auth-demo/productos", undefined, { authorization: "Bearer malo" });
  await handlerAuth(prueba.req, prueba.res);
  const salida = await prueba.json();
  if (salida.status === 429) {
    bloqueada = true;
    break;
  }
  assert.equal(salida.status, 401);
}
assert.ok(bloqueada, "los intentos fallidos acaban en 429");

// --- Cadena de IA: primero sin clave y con la clave como respaldo.
const ia = await import("../lib/ia.mjs");
const variablesIa = [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "CEREBRAS_API_KEY",
  "MISTRAL_API_KEY",
  "TOGETHER_API_KEY",
  "DEEPSEEK_API_KEY",
  "HF_TOKEN",
  "GENERADOR_ESTRATEGIA",
  "GENERADOR_PROVEEDOR",
  "GENERADOR_SIN_IA",
];
const entornoIa = new Map(variablesIa.map((nombre) => [nombre, process.env[nombre]]));
for (const nombre of variablesIa) delete process.env[nombre];

const PLANO_IA = {
  titulo: "Pruebas",
  resumen: "Una API de prueba.",
  recursos: [{ nombre: "cosas", titulo: "Cosas", campos: [{ nombre: "nombre", tipo: "texto", requerido: true }] }],
};
const respuestaIa = (estado, cuerpo) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  async text() {
    return typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  },
  async json() {
    return typeof cuerpo === "string" ? JSON.parse(cuerpo) : cuerpo;
  },
});

ia.fijarFetch(async () =>
  respuestaIa(200, { choices: [{ message: { content: JSON.stringify(PLANO_IA) } }] })
);
const elegido = await ia.pedirPlano({ descripcion, nombre: "ia-demo" });
assert.ok(elegido, "la IA debe devolver un plano");
assert.equal(elegido.proveedor, "llm7", "sin claves, gana el primero sin clave");
assert.equal(elegido.spec.nombre, "ia-demo");
assert.ok(elegido.spec.recursos.length >= 1);

// Con una clave configurada, la estrategia por defecto sigue probando antes
// los servicios públicos (la clave es respaldo, no requisito).
process.env.GROQ_API_KEY = "clave-de-prueba";
const estadoIa = ia.estadoProveedores();
assert.equal(estadoIa.orden[0], "llm7");
assert.ok(estadoIa.orden.indexOf("llm7") < estadoIa.orden.indexOf("groq"), "la clave va después");
assert.equal(estadoIa.conClave.find((item) => item.id === "groq").configurado, true);
assert.equal(JSON.stringify(estadoIa).includes("clave-de-prueba"), false, "la clave jamás sale en el estado");
process.env.GENERADOR_ESTRATEGIA = "calidad";
assert.equal(ia.estadoProveedores().orden[0], "groq", "la estrategia calidad pone la clave primero");
delete process.env.GENERADOR_ESTRATEGIA;
delete process.env.GROQ_API_KEY;

// Si el modelo elegido falla, se pasa al siguiente y al final queda el lector.
process.env.GENERADOR_PROVEEDOR = "ovh";
const forzado = await ia.pedirPlano({ descripcion, nombre: "ia-forzada" });
assert.equal(forzado.proveedor, "ovh");
delete process.env.GENERADOR_PROVEEDOR;

ia.fijarFetch(async () => respuestaIa(200, "esto no es JSON"));
const sinPlano = await ia.pedirPlano({ descripcion, nombre: "ia-rota" });
assert.equal(sinPlano, null, "si nadie devuelve un plano, se usa el lector incluido");

process.env.GENERADOR_SIN_IA = "1";
ia.fijarFetch(async () => {
  throw new Error("no debería llamarse");
});
assert.equal(await ia.pedirPlano({ descripcion, nombre: "ia-apagada" }), null);
delete process.env.GENERADOR_SIN_IA;

// Diagnóstico: prueba en paralelo y nunca lanza.
ia.fijarFetch(async (url) => {
  if (String(url).includes("llm7")) return respuestaIa(200, { choices: [{ message: { content: "{}" } }] });
  return respuestaIa(503, "sin servicio");
});
const pruebaIa = await ia.probarProveedores({ solo: "llm7" });
assert.equal(pruebaIa.resultados.length, 1);
assert.equal(pruebaIa.resultados[0].ok, true);
assert.equal(pruebaIa.hora.length > 10, true);

ia.fijarFetch(FETCH_ORIGINAL);
for (const [nombre, valor] of entornoIa) {
  if (valor === undefined) delete process.env[nombre];
  else process.env[nombre] = valor;
}

// --- Fuentes públicas sin clave, con red simulada.
function respuestaFalsa(payload, status) {
  const codigo = status || 200;
  return {
    ok: codigo >= 200 && codigo < 300,
    status: codigo,
    async text() {
      return payload === null ? "" : JSON.stringify(payload);
    },
    async json() {
      return payload;
    },
  };
}

const PAIS_FALSO = [
  {
    name: { common: "Mexico", official: "United Mexican States" },
    translations: { spa: { common: "México", official: "Estados Unidos Mexicanos" } },
    cca2: "MX",
    cca3: "MEX",
    currencies: { MXN: { name: "Mexican peso" } },
    capital: ["Mexico City"],
    region: "Americas",
    altSpellings: ["MX", "MEX"],
  },
];

function redPublicaFalsa(url) {
  const destino = String(url);
  if (destino.includes("restcountries.com")) return Promise.resolve(respuestaFalsa(PAIS_FALSO));
  if (destino.includes("frankfurter.app")) return Promise.resolve(respuestaFalsa({ USD: "United States Dollar", MXN: "Mexican Peso" }));
  if (destino.includes("geocoding-api.open-meteo.com")) {
    return Promise.resolve(
      respuestaFalsa({ results: [{ name: "Ciudad de México", country: "México", admin1: "Ciudad de México" }] })
    );
  }
  return Promise.resolve(respuestaFalsa(null, 404));
}

publicas.__pruebas.reiniciar();
publicas.__pruebas.fijarFetch(redPublicaFalsa);
const pais = await publicas.normalizarPais("mexico");
assert.equal(pais.valor, "México");
assert.equal(pais.iso2, "MX");
assert.equal(pais.fuente, "rest-countries");
const moneda = await publicas.normalizarMoneda("mxn");
assert.equal(moneda.valor, "MXN");
const ciudad = await publicas.normalizarCiudad("cdmx");
assert.equal(ciudad.valor, "Ciudad de México");
const camposMejorables = [
  { nombre: "pais", tipo: "texto" },
  { nombre: "moneda", tipo: "texto" },
  { nombre: "ciudad", tipo: "texto" },
];
const mejorado = await publicas.enriquecer({ campos: camposMejorables }, { pais: "mexico", moneda: "mxn", ciudad: "cdmx" }, { activo: true });
assert.equal(mejorado.valores.pais, "México");
assert.equal(mejorado.valores.moneda, "MXN");
assert.ok(mejorado.aplicados.length >= 3, "se anota qué campos se normalizaron");

// Sin red: solo se usa el respaldo local y nunca se lanza una excepción.
publicas.__pruebas.reiniciar();
publicas.__pruebas.fijarFetch(async () => {
  throw new Error("sin red");
});
const paisSinRed = await publicas.normalizarPais("Mexico");
assert.equal(paisSinRed.valor, "México");
assert.equal(paisSinRed.fuente, "respaldo");
assert.equal((await publicas.normalizarMoneda("mxn")).valor, "MXN");
assert.equal(await publicas.normalizarCiudad("cdmx"), null);
const mejoradoSinRed = await publicas.enriquecer({ campos: camposMejorables }, { pais: "mexico", ciudad: "cdmx" }, { activo: true });
assert.equal(mejoradoSinRed.valores.pais, "México");
assert.equal(mejoradoSinRed.valores.ciudad, "cdmx", "si la fuente falla, el valor se guarda tal cual");
const apagado = await publicas.enriquecer({ campos: camposMejorables }, { pais: "mexico" }, { activo: false });
assert.equal(apagado.valores.pais, "mexico");
assert.equal(apagado.aplicados.length, 0);

// La escritura no se rompe cuando la fuente falla.
const specEnriquecible = normalizar(
  {
    titulo: "Lugares",
    recursos: [{ nombre: "lugares", titulo: "Lugares", campos: camposMejorables }],
  },
  "lugares-demo",
  "incluido"
);
const almacenLugares = memoriaCon(null);
const handlerLugares = crear(specEnriquecible, { almacen: almacenLugares, enriquecer: true });
const sinFuente = llamada("POST", "/api/lugares-demo/lugares", { pais: "mexico", moneda: "mxn", ciudad: "cdmx" });
await handlerLugares(sinFuente.req, sinFuente.res);
const guardadoSinFuente = await sinFuente.json();
assert.equal(guardadoSinFuente.status, 201, "una fuente caída no impide guardar");
assert.equal(guardadoSinFuente.cuerpo.dato.ciudad, "cdmx");

// Con red simulada, el mismo POST normaliza y lo anuncia en X-Normalizado.
publicas.__pruebas.reiniciar();
publicas.__pruebas.fijarFetch(redPublicaFalsa);
const almacenLugaresBien = memoriaCon(null);
const handlerLugaresBien = crear(specEnriquecible, { almacen: almacenLugaresBien, enriquecer: true });
const conFuente = llamada("POST", "/api/lugares-demo/lugares", { pais: "mexico", moneda: "mxn", ciudad: "cdmx" });
await handlerLugaresBien(conFuente.req, conFuente.res);
const guardadoConFuente = await conFuente.json();
assert.equal(guardadoConFuente.status, 201);
assert.equal(guardadoConFuente.cuerpo.dato.pais, "México");
assert.equal(guardadoConFuente.cuerpo.dato.moneda, "MXN");
assert.match(conFuente.headers["X-Normalizado"] || "", /pais=rest-countries/);

// Si el valor corregido no cabe en el campo (máximo 8), se guarda el original:
// una fuente pública nunca puede romper el esquema.
const specCorta = normalizar(
  {
    titulo: "Lugares cortos",
    recursos: [
      {
        nombre: "lugares",
        titulo: "Lugares",
        campos: [
          { nombre: "ciudad", tipo: "texto", max: 8 },
          { nombre: "pais", tipo: "texto" },
        ],
      },
    ],
  },
  "lugares-cortos",
  "incluido"
);
const handlerCorto = crear(specCorta, { almacen: memoriaCon(null), enriquecer: true });
const corto = llamada("POST", "/api/lugares-cortos/lugares", { ciudad: "cdmx", pais: "mexico" });
await handlerCorto(corto.req, corto.res);
const guardadoCorto = await corto.json();
assert.equal(guardadoCorto.status, 201);
assert.equal(guardadoCorto.cuerpo.dato.ciudad, "cdmx", "el valor que no cabe se queda como estaba");
assert.equal(guardadoCorto.cuerpo.dato.pais, "México");
assert.match(corto.headers["X-Normalizado"] || "", /pais=rest-countries/);
assert.equal((corto.headers["X-Normalizado"] || "").includes("ciudad"), false);

publicas.__pruebas.fijarFetch(FETCH_ORIGINAL);

// --- Catálogo de GitHub: lectura del README, filtros y respaldo local.
const markdown = [
  "### Animals",
  "API | Description | Auth | HTTPS | CORS ",
  "|:---|:---|:---|:---|:---|",
  "| [Axolotl](https://theaxolotlapi.netlify.app/) | Collection of axolotl pictures | No | Yes | No |",
  "| [Cats](https://thecatapi.com/) | Pictures of cats | `apiKey` | Yes | No |",
  "| [HTTP](http://httpbin.org/) | Sin HTTPS | No | No | Yes |",
  "| [Axolotl](https://theaxolotlapi.netlify.app/) | Repetida | No | Yes | No |",
  "### Weather",
  "| [Open-Meteo](https://open-meteo.com/) | Weather forecast | No | Yes | Yes |",
].join("\n");
const leidoGitHub = fuentesGithub.parsear(markdown);
assert.equal(leidoGitHub.total, 2, "solo pasan las filas sin clave y con HTTPS");
assert.equal(leidoGitHub.fuentes[0].nombre, "Axolotl");
assert.equal(leidoGitHub.fuentes[0].cors, false);
assert.equal(leidoGitHub.fuentes[1].categoria, "Weather");
assert.ok(leidoGitHub.categorias.includes("Animals"));
const copiaLocal = fuentesGithub.instantanea();
assert.ok(copiaLocal.total > 100, "la copia local del catálogo existe");
const muestra = fuentesGithub.muestra(copiaLocal, { limite: 5 });
assert.equal(muestra.fuentes.length, 5);
assert.ok(muestra.fuentes[0].categoriaEs, "las categorías se traducen al español");
const soloClima = fuentesGithub.muestra(copiaLocal, { categoria: "Weather", limite: 50 });
assert.ok(soloClima.fuentes.every((fuente) => fuente.categoria === "Weather"));
const soloClimaEs = fuentesGithub.muestra(copiaLocal, { categoria: "Clima", limite: 50 });
assert.equal(soloClimaEs.total, soloClima.total, "el índice secundario de categorías admite el nombre en español");

fuentesGithub.__pruebas.fijarFetch(async () =>
  respuestaFalsa({ content: Buffer.from(markdown, "utf8").toString("base64"), encoding: "base64" })
);
const vivo = await fuentesGithub.descubrir({ forzar: true });
assert.equal(vivo.enVivo, true);
assert.equal(vivo.total, 2);
fuentesGithub.__pruebas.fijarFetch(async () => {
  throw new Error("sin red");
});
const caido = await fuentesGithub.descubrir({ forzar: true });
assert.equal(caido.enVivo, false, "si GitHub falla se usa la copia local");
assert.ok(caido.total > 100);
fuentesGithub.__pruebas.fijarFetch(FETCH_ORIGINAL);

// --- Los endpoints nuevos responden, cachean y no filtran claves.
const apiFuentes = require("../api/fuentes.js");
const fuentesGet = respuestaJson();
await apiFuentes({ method: "GET", url: "/api/fuentes?github=0", headers: {} }, fuentesGet.res);
const cuerpoFuentes = fuentesGet.json();
assert.equal(cuerpoFuentes.status, 200);
assert.ok(cuerpoFuentes.cuerpo.fuentes.length >= 5);
assert.ok(cuerpoFuentes.cuerpo.enriquecimiento.campos.includes("pais"));
assert.equal(cuerpoFuentes.cuerpo.github, null);
assert.ok(cuerpoFuentes.headers.ETag);
const fuentes304 = respuestaJson();
await apiFuentes(
  { method: "GET", url: "/api/fuentes?github=0", headers: { "if-none-match": cuerpoFuentes.headers.ETag } },
  fuentes304.res
);
assert.equal(fuentes304.res.statusCode, 304);

// `githubLimite=0` significa «no me mandes la lista», no «el valor por defecto».
const fuentesSinLista = respuestaJson();
await apiFuentes({ method: "GET", url: "/api/fuentes?limite=2&githubLimite=0", headers: {} }, fuentesSinLista.res);
const cuerpoSinLista = fuentesSinLista.json();
assert.equal(cuerpoSinLista.status, 200);
assert.deepEqual(cuerpoSinLista.cuerpo.github.fuentes, []);
assert.ok(cuerpoSinLista.cuerpo.github.total > 100);

const apiProveedores = require("../api/proveedores.js");
process.env.GROQ_API_KEY = "gsk_clave_de_prueba_que_no_debe_salir";
const proveedoresGet = respuestaJson();
await apiProveedores({ method: "GET", url: "/api/proveedores", headers: {} }, proveedoresGet.res);
const cuerpoProveedores = proveedoresGet.json();
assert.equal(cuerpoProveedores.status, 200);
assert.equal(cuerpoProveedores.cuerpo.sinClave.length, 4);
assert.equal(cuerpoProveedores.cuerpo.conClave.length, 8);
assert.equal(
  cuerpoProveedores.cuerpo.conClave.find((item) => item.id === "groq").configurado,
  true
);
assert.equal(JSON.stringify(cuerpoProveedores.cuerpo).includes("gsk_clave_de_prueba"), false, "la clave no sale en la respuesta");
const proveedores304 = respuestaJson();
await apiProveedores(
  { method: "GET", url: "/api/proveedores", headers: { "if-none-match": cuerpoProveedores.headers.ETag } },
  proveedores304.res
);
assert.equal(proveedores304.res.statusCode, 304, "la hora no debe invalidar el ETag");
delete process.env.GROQ_API_KEY;

process.env.TALLER_PROBAR = "0";
const probarApagado = respuestaJson();
await apiProveedores({ method: "GET", url: "/api/proveedores?probar=1", headers: {} }, probarApagado.res);
assert.equal(probarApagado.json().status, 403);
if (ENTORNO_PROBAR === undefined) delete process.env.TALLER_PROBAR;
else process.env.TALLER_PROBAR = ENTORNO_PROBAR;

// --- OpenAPI anuncia la normalización y la política de privacidad.
const specLugares = normalizar(
  {
    titulo: "Lugares",
    recursos: [{ nombre: "lugares", titulo: "Lugares", campos: camposMejorables }],
  },
  "paises-demo",
  "incluido"
);
const docLugares = generarOpenapi(specLugares, { baseUrl: "https://taller.test" });
assert.deepEqual([...docLugares["x-taller"].normalizacion.campos].sort(), ["ciudad", "moneda", "pais"]);
assert.equal(docLugares["x-taller"].normalizacion.activa, false, "TALLER_FUENTES=0 se refleja en el OpenAPI");
assert.equal(docLugares.externalDocs.url, "https://taller.test/privacidad");
const docSinBase = generarOpenapi({ ...specLugares, nombre: "paises-sin-base" });
assert.equal(docSinBase.externalDocs, undefined, "sin base no se inventa una URL absoluta");
// Con TALLER_URL no se confía en la cabecera Host (evita envenenarla).
const openapiMod = require("../lib/openapi.js");
process.env.TALLER_URL = "https://taller.test";
assert.equal(openapiMod.baseDe({ headers: { host: "malo.example" } }), "https://taller.test");
delete process.env.TALLER_URL;
assert.equal(openapiMod.baseDe({ headers: { host: "malo.example" } }), "https://malo.example");

// --- El sitio: sin CDNs, con CSP estricta y con la política de privacidad.
for (const archivo of ["script.js", "docs.js"]) {
  const temporal = path.join(os.tmpdir(), "taller-" + archivo.replace(/\W/g, "-") + ".mjs");
  fs.copyFileSync(path.join(RAIZ, archivo), temporal);
  const revision = spawnSync(process.execPath, ["--check", temporal], { encoding: "utf8" });
  fs.rmSync(temporal, { force: true });
  assert.equal(revision.status, 0, archivo + ": " + (revision.stderr || ""));
}
for (const pagina of ["index.html", "docs.html", "privacidad.html"]) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false, pagina + " no debe tener scripts en línea (CSP)");
  assert.equal(/\sstyle=/.test(html), false, pagina + " no debe tener estilos en línea (CSP)");
  assert.equal(/cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), false, pagina + " no debe cargar CDNs de terceros");
  assert.ok(html.includes("/assets/estilos.css"), pagina + " debe cargar el CSS propio");
}
assert.ok(fs.existsSync(path.join(RAIZ, "assets/estilos.css")), "falta el CSS compilado");
assert.ok(fs.existsSync(path.join(RAIZ, "assets/fuentes/outfit-latin.woff2")), "faltan las fuentes propias");

// El CSS del repositorio debe ser el que produce Tailwind hoy: así una clase
// nueva en el HTML no se queda sin estilo. Si no hay node_modules, se salta.
const cliCss = path.join(RAIZ, "node_modules/tailwindcss/lib/cli.js");
if (fs.existsSync(cliCss)) {
  const salidaCss = path.join(os.tmpdir(), "taller-estilos-" + process.pid + ".css");
  const compilado = spawnSync(
    process.execPath,
    [cliCss, "-c", path.join(RAIZ, "tailwind.config.js"), "-i", path.join(RAIZ, "assets/tailwind.css"), "-o", salidaCss, "--minify"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  assert.equal(compilado.status, 0, "Tailwind no pudo compilar: " + (compilado.stderr || ""));
  const sinBanner = (texto) => texto.replace(/^\/\*!\s*tailwindcss[^*]*\*\//, "");
  const esperado = sinBanner(fs.readFileSync(path.join(RAIZ, "assets/estilos.css"), "utf8"));
  const real = sinBanner(fs.readFileSync(salidaCss, "utf8"));
  fs.rmSync(salidaCss, { force: true });
  assert.equal(real, esperado, "assets/estilos.css está desactualizado: ejecuta npm run css");
}
const htmlIndice = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
assert.ok(htmlIndice.includes('href="/privacidad"'), "la portada enlaza la privacidad");

// --- Diseño y app nativa: una sola interfaz para web, Android e iOS.
assert.ok(htmlIndice.includes('src="/configuracion.js"'), "la portada carga la configuración de entorno");
for (const panel of ["inicio", "disenar", "probar", "apis", "fuentes", "ajustes"]) {
  assert.ok(
    htmlIndice.includes('data-panel-vista="' + panel + '"'),
    "la portada debe tener la pestaña " + panel
  );
}
assert.ok(htmlIndice.includes('data-panel="disenar"'), "la navegación lateral cambia de pestaña");
assert.ok(/tema-claro/.test(htmlIndice), "el tema claro debe existir");
const cssDelSitio = fs.readFileSync(path.join(RAIZ, "assets/estilos.css"), "utf8");
for (const clase of ["tono-exito", "tono-aviso", "nav-enlace", "tarjeta-destacada", "consola-terminal"]) {
  assert.ok(cssDelSitio.includes("." + clase), "el CSS debe incluir " + clase);
}
assert.ok(cssDelSitio.includes("--c-clay"), "el acento viaja por variables CSS");
assert.ok(fs.existsSync(path.join(RAIZ, "configuracion.js")), "falta configuracion.js");

// La app nativa: Capacitor con proyectos de Android e iOS de verdad.
const capacitor = JSON.parse(fs.readFileSync(path.join(RAIZ, "capacitor.config.json"), "utf8"));
assert.equal(capacitor.appId, "app.taller.apis");
assert.equal(capacitor.webDir, "app-web");
assert.ok(fs.existsSync(path.join(RAIZ, "app/nativo.js")), "falta el puente nativo");
assert.ok(fs.existsSync(path.join(RAIZ, "android/app/build.gradle")), "falta el proyecto Android");
assert.ok(fs.existsSync(path.join(RAIZ, "android/gradlew")), "falta el wrapper de Gradle");
assert.ok(fs.existsSync(path.join(RAIZ, "ios/App/App.xcodeproj/project.pbxproj")), "falta el proyecto iOS");
assert.ok(fs.existsSync(path.join(RAIZ, "ios/App/App/Info.plist")), "falta el Info.plist de iOS");
const manifiestoAndroid = fs.readFileSync(path.join(RAIZ, "android/app/src/main/AndroidManifest.xml"), "utf8");
assert.ok(manifiestoAndroid.includes("android.permission.INTERNET"), "la app necesita red");
assert.equal(manifiestoAndroid.includes("android.permission.CAMERA"), false, "la app no pide cámara");
assert.ok(manifiestoAndroid.includes("networkSecurityConfig"), "la app debe exigir HTTPS");
assert.ok(fs.existsSync(path.join(RAIZ, "assets/iconos/icono-512.png")), "faltan los iconos de la app");
assert.ok(fs.existsSync(path.join(RAIZ, "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")));
const puenteNativo = fs.readFileSync(path.join(RAIZ, "app/nativo.js"), "utf8");
for (const plugin of ["@capacitor/core", "@capacitor/status-bar", "@capacitor/share", "@capacitor/network"]) {
  assert.ok(puenteNativo.includes(plugin), "el puente nativo debe usar " + plugin);
}

// Los orígenes de la WebView nativa son de confianza para las rutas que escriben.
process.env.TALLER_ORIGENES = "";
assert.equal(httpMod.mismoOrigen({ headers: { origin: "https://localhost", host: "taller.vercel.app" } }), true);
assert.equal(httpMod.mismoOrigen({ headers: { origin: "capacitor://localhost", host: "taller.vercel.app" } }), true);
assert.equal(httpMod.mismoOrigen({ headers: { origin: "https://sitio-ajeno.example", host: "taller.vercel.app" } }), false);
assert.equal(
  httpMod.solicitudConfiable({ headers: { origin: "https://localhost" } }),
  true,
  "la app nativa puede publicar APIs"
);
const configVercel = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf8"));
const cabecerasVercel = JSON.stringify(configVercel.headers);
assert.ok(cabecerasVercel.includes("Content-Security-Policy"));
assert.ok(cabecerasVercel.includes("Strict-Transport-Security"));
assert.ok(cabecerasVercel.includes("default-src 'self'"));
assert.ok(fs.existsSync(path.join(RAIZ, "privacidad.html")));
assert.ok(fs.existsSync(path.join(RAIZ, "PRIVACY.md")), "debe existir PRIVACY.md en la raíz");
assert.ok(fs.existsSync(path.join(RAIZ, "SECURITY.md")), "debe existir SECURITY.md en la raíz");
assert.ok(fs.existsSync(path.join(RAIZ, ".well-known/security.txt")));

// --- Servidor local: las rutas principales responden como en Vercel.
const { spawn } = await import("node:child_process");
const puerto = 4300 + Math.floor(Math.random() * 400);
const servidor = spawn(process.execPath, [path.join(RAIZ, "scripts/servidor.mjs")], {
  cwd: RAIZ,
  env: { ...process.env, PORT: String(puerto), TALLER_FUENTES: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
const base = "http://127.0.0.1:" + puerto;
async function esperarServidor() {
  for (let intento = 0; intento < 60; intento += 1) {
    try {
      const respuesta = await fetch(base + "/api/salud", { signal: AbortSignal.timeout(1000) });
      if (respuesta.ok) return true;
    } catch {
      /* Aún arrancando. */
    }
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  return false;
}
try {
  assert.equal(await esperarServidor(), true, "el servidor local debe arrancar");
  for (const [ruta, esperado] of [
    ["/", 200],
    ["/docs", 200],
    ["/privacidad", 200],
    ["/assets/estilos.css", 200],
    ["/configuracion.js", 200],
    ["/assets/iconos/icono-192.png", 200],
    ["/api/salud", 200],
    ["/api/fuentes?github=0", 200],
    ["/api/ejemplo-notas/notas", 200],
    ["/.well-known/security.txt", 200],
  ]) {
    const respuesta = await fetch(base + ruta, { signal: AbortSignal.timeout(4000) });
    assert.equal(respuesta.status, esperado, "GET " + ruta);
    assert.equal(respuesta.headers.get("x-content-type-options"), "nosniff", "nosniff en " + ruta);
  }
  const css = await fetch(base + "/assets/estilos.css", { signal: AbortSignal.timeout(4000) });
  assert.equal(css.headers.get("cache-control"), "no-cache", "el CSS debe revalidarse");
  const fuente = await fetch(base + "/assets/fuentes/outfit-latin.woff2", { signal: AbortSignal.timeout(4000) });
  assert.equal(fuente.status, 200);
  assert.match(fuente.headers.get("cache-control") || "", /immutable/);

  const portada = await fetch(base + "/", { signal: AbortSignal.timeout(4000) });
  const csp = portada.headers.get("content-security-policy") || "";
  assert.ok(csp.includes("default-src 'self'"), "el HTML lleva CSP");
  assert.ok(csp.includes("frame-ancestors 'none'"));
  const textoPortada = await portada.text();
  assert.ok(textoPortada.includes("/privacidad"));
  const inexistente = await fetch(base + "/no-existe", { signal: AbortSignal.timeout(4000) });
  assert.equal(inexistente.status, 404);
  const noAutorizada = await fetch(base + "/api/no-existe-todavia", { signal: AbortSignal.timeout(4000) });
  assert.equal(noAutorizada.status, 404);
  assert.equal(noAutorizada.headers.get("content-type").includes("application/json"), true);
} finally {
  servidor.kill("SIGTERM");
  await new Promise((resolver) => setTimeout(resolver, 100));
}

if (ENTORNO_FUENTES === undefined) delete process.env.TALLER_FUENTES;
else process.env.TALLER_FUENTES = ENTORNO_FUENTES;

console.log("Pruebas ok: lector, motor, entrada, registro, generación, OpenAPI, límites, token, caché, índices, seguridad, fuentes públicas y servidor local (" + registradas.length + " API(s)).");
