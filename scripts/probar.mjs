// @ts-nocheck
/**
 * Pruebas del taller. Se ejecutan solas antes de crear una API y también de
 * forma manual con:  node scripts/probar.mjs
 *
 * Comprueban cuatro cosas:
 *  1. El lector (lib/motor.mjs) entiende descripciones claras y rechaza nombres feos.
 *  2. El motor (lib/runtime.js) hace bien el CRUD, con sus validaciones.
 *  3. La entrada de todas las APIs (lib/entrada.js) encuentra cada plano.
 *  4. El registro (lib/registro.js) está al día respecto a las carpetas api/.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
const plantillas = require("../lib/plantillas.js");

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

/* 5. Plantillas, OpenAPI, límites y token -------------------------------- */

assert.deepEqual(plantillas.claves.slice().sort(), ["inventario", "notas", "reservas"]);
assert.equal(plantillas.buscar("no-existe"), null);
for (const clave of plantillas.claves) {
  const ficha = plantillas.buscar(clave);
  const copia = plantillas.specDe(clave, "mi-" + clave);
  assert.ok(ficha.descripcion.length >= 20, clave + " necesita descripción");
  assert.equal(copia.nombre, "mi-" + clave);
  assert.equal(copia.motor, "plantilla");
  assert.ok(copia.recursos.length >= 1, clave + " necesita recursos");
  assert.ok(copia.limites && copia.limites.maxRegistrosPorRecurso >= 1, clave + " necesita límites");
}

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

// GET /api/plantillas entrega las tres fichas sin depender de GitHub.
const handlerPlantillas = require("../api/plantillas.js");
let estadoPlantillas = 0;
let cuerpoPlantillas = "";
const resPlantillas = {
  setHeader() {},
  end(datos) {
    cuerpoPlantillas = datos || "";
  },
};
Object.defineProperty(resPlantillas, "statusCode", {
  set(valor) {
    estadoPlantillas = valor;
  },
  get() {
    return estadoPlantillas;
  },
});
handlerPlantillas({ method: "GET", headers: {} }, resPlantillas);
const jsonPlantillas = JSON.parse(cuerpoPlantillas);
assert.equal(estadoPlantillas, 200);
assert.equal(jsonPlantillas.total, 3);
assert.ok(jsonPlantillas.plantillas.some((item) => item.clave === "reservas"));

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
        nombre: "clon-demo",
        plantilla: "notas",
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
  assert.equal(salida.cuerpo.plantilla, "notas");
  assert.equal(salida.cuerpo.protegida, true);
  const despacho = llamadas.find((llamada) => llamada.ruta.endsWith("/dispatches"));
  assert.ok(despacho, "debe disparar el workflow");
  assert.equal(despacho.cuerpo.client_payload.plantilla, "notas");
  assert.equal(despacho.cuerpo.client_payload.soloLectura, "1");
  assert.equal(despacho.cuerpo.client_payload.tokenHash, tokenHash);
  assert.equal(despacho.cuerpo.client_payload.tokenModo, "todo");
  assert.deepEqual(JSON.parse(despacho.cuerpo.client_payload.limites), {
    maxRegistrosPorRecurso: 42,
    maxBytes: 262144,
    retencionDias: 7,
  });

  const reservado = respuestaJson();
  await handlerGenerar(
    { method: "POST", headers: {}, body: { nombre: "plantillas", descripcion: "Tabla pruebas con campos titulo." } },
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

console.log("Pruebas ok: lector, motor, entrada, registro, plantillas, OpenAPI, límites y token (" + registradas.length + " API(s)).");
