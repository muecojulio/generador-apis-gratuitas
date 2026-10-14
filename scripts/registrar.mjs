// @ts-nocheck
/**
 * Arma lib/registro.js a partir de las carpetas api/<nombre>/spec.json.
 *
 * Cada plano se guarda con una ruta literal (require("../api/<nombre>/spec.json"))
 * para que Vercel lo empaquete dentro de la función. Sin esto, la función no
 * encontraría el archivo al ejecutarse en la nube.
 *
 * Se ejecuta solo: lo llama scripts/disenar.mjs y el flujo de GitHub Actions.
 * Si quieres hacerlo a mano:  node scripts/registrar.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizar, slugValido } from "../lib/motor.mjs";

const RAIZ = process.cwd();
const CARPETA = path.join(RAIZ, "api");
const DESTINO = path.join(RAIZ, "lib", "registro.js");

/** Lee y valida todos los planos publicados. */
export function leerPlanos() {
  if (!fs.existsSync(CARPETA)) return [];
  const planos = [];
  for (const entrada of fs.readdirSync(CARPETA, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const nombre = entrada.name;
    const archivo = path.join(CARPETA, nombre, "spec.json");
    if (!fs.existsSync(archivo)) continue;
    try {
      const bruto = JSON.parse(fs.readFileSync(archivo, "utf8"));
      const spec = normalizar(bruto, nombre, bruto.motor || "incluido");
      if (!slugValido(spec.nombre) || spec.nombre !== nombre) {
        console.error("Se salta api/" + nombre + ": el plano no corresponde a la carpeta.");
        continue;
      }
      spec.motor = String(bruto.motor || "incluido").slice(0, 24);
      if (bruto.huella) spec.huella = String(bruto.huella).slice(0, 32);
      if (bruto.ejemplos) spec.ejemplos = bruto.ejemplos;
      planos.push(spec);
    } catch (error) {
      console.error("Se salta api/" + nombre + ": " + error.message);
    }
  }
  return planos.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Escribe lib/registro.js. Devuelve la lista de nombres registrados. */
export function escribirRegistro(planos) {
  const orden = planos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const lineas = [
    '"use strict";',
    "",
    "// ARCHIVO GENERADO. No lo edites a mano.",
    "// Lo reescribe scripts/registrar.mjs a partir de api/<nombre>/spec.json.",
    "// Las rutas son literales a propósito: así Vercel empaqueta cada plano",
    "// dentro de la función y la API responde sin leer nada más.",
    "",
    "const registro = {",
    ...orden.map((spec) => '  ' + JSON.stringify(spec.nombre) + ": require(" + JSON.stringify("../api/" + spec.nombre + "/spec.json") + "),"),
    "};",
    "",
    "module.exports = { registro, nombres: Object.keys(registro) };",
    "",
  ];
  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, lineas.join("\n"));
  return orden.map((spec) => spec.nombre);
}

export function registrar() {
  const planos = leerPlanos();
  const nombres = escribirRegistro(planos);
  return { planos, nombres };
}

const esPrincipal =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (esPrincipal) {
  const { nombres } = registrar();
  console.log(
    nombres.length
      ? "Registro listo: " + nombres.length + " API(s) -> " + nombres.join(", ")
      : "Registro listo: todavía no hay ninguna API publicada."
  );
}
