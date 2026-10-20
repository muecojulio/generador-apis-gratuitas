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

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);

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
assert.equal(Object.hasOwn(listadoPublico.json().cuerpo, "plantillas"), false);

const salud = respuestaJson();
require("../api/salud.js")({ method: "GET" }, salud.res);
assert.equal(salud.json().status, 200);
assert.equal(salud.json().cuerpo.funciones, 6);
assert.equal(salud.json().cuerpo.apis, registradas.length);
assert.equal(Object.hasOwn(salud.json().cuerpo, "plantillas"), false);
assert.deepEqual(salud.json().cuerpo.novedades, ["openapi", "limites", "token"]);

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

console.log("Pruebas ok: lector, motor, entrada, registro, generación, OpenAPI, límites y token (" + registradas.length + " API(s)).");
