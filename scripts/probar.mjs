import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { analizar, huella, slugValido } from "../lib/motor.mjs";

const require = createRequire(import.meta.url);
const { crear } = require("../lib/runtime.js");

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
assert.equal(slugValido("generar"), false);
assert.equal(slugValido("tienda-barrio"), true);

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
    end(data) {
      crudo = data || "";
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
  const req = { method: metodo, url, body, query: {}, headers: {} };
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
const rechazo = await malo.json();
assert.equal(rechazo.status, 400);

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

console.log("pruebas ok");
