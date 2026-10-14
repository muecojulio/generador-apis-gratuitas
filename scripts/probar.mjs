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
import { analizar, huella, normalizar, slugValido } from "../lib/motor.mjs";
import { extraerJson } from "../lib/ia.mjs";

const require = createRequire(import.meta.url);
const { crear } = require("../lib/runtime.js");

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

function llamada(metodo, url, body) {
  let status = 0;
  let crudo = "";
  const res = {
    setHeader() {},
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
  const req = { method: metodo, url, body, query, headers: {} };
  return {
    req,
    res,
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

console.log("Pruebas ok: lector, motor, entrada y registro (" + registradas.length + " API(s)).");
