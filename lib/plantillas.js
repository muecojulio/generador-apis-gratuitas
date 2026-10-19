"use strict";

/**
 * Plantillas de APIs comunes listas para clonar.
 *
 * Cada archivo de plantillas/ es datos puros (igual que un api/<nombre>/spec.json):
 * no trae código, así que clonar una plantilla es tan seguro como generar una
 * API con el lector del taller. Las rutas son literales para que Vercel las
 * empaquete dentro de las funciones.
 */

const NOTAS = require("../plantillas/notas.json");
const INVENTARIO = require("../plantillas/inventario.json");
const RESERVAS = require("../plantillas/reservas.json");

const TODAS = [NOTAS, INVENTARIO, RESERVAS];
const CLAVE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIPOS = new Set(["texto", "numero", "entero", "booleano", "email", "fecha"]);

function fallar(mensaje) {
  throw new Error("Plantilla inválida: " + mensaje);
}

/** Revisa una plantilla al cargarla: si está rota, el taller lo dice claro. */
function validar(plantilla, indice) {
  if (!plantilla || typeof plantilla !== "object") fallar("la plantilla " + indice + " no es un objeto");
  if (!CLAVE.test(String(plantilla.clave || ""))) fallar("clave rara en la plantilla " + indice);
  if (!plantilla.titulo || !plantilla.resumen || !plantilla.descripcion) {
    fallar("faltan titulo, resumen o descripcion en " + plantilla.clave);
  }
  if (String(plantilla.descripcion).trim().length < 20) fallar("descripción demasiado corta en " + plantilla.clave);
  const spec = plantilla.spec;
  if (!spec || typeof spec !== "object") fallar("falta el spec de " + plantilla.clave);
  if (!Array.isArray(spec.recursos) || !spec.recursos.length) fallar("el spec de " + plantilla.clave + " no tiene recursos");
  for (const recurso of spec.recursos) {
    if (!CLAVE.test(String(recurso.nombre || ""))) fallar("recurso raro en " + plantilla.clave);
    if (!Array.isArray(recurso.campos) || !recurso.campos.length) fallar("el recurso " + recurso.nombre + " no tiene campos");
    for (const campo of recurso.campos) {
      if (!CLAVE.test(String(campo.nombre || ""))) fallar("campo raro en " + plantilla.clave + ": " + campo.nombre);
      if (!TIPOS.has(campo.tipo)) fallar("tipo desconocido en " + plantilla.clave + ": " + campo.tipo);
    }
  }
  return plantilla;
}

const VALIDAS = TODAS.map(validar);
const POR_CLAVE = new Map(VALIDAS.map((plantilla) => [plantilla.clave, plantilla]));

function copia(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/** Lista pública para la página y para GET /api/plantillas. */
function listar() {
  return VALIDAS.map((plantilla) => ({
    clave: plantilla.clave,
    titulo: plantilla.titulo,
    resumen: plantilla.resumen,
    descripcion: plantilla.descripcion,
    sugerencia: plantilla.sugerencia || "mis-" + plantilla.clave,
    soloLectura: Boolean(plantilla.spec.soloLectura),
    limites: copia(plantilla.spec.limites || {}),
    recursos: (plantilla.spec.recursos || []).map((recurso) => ({
      nombre: recurso.nombre,
      titulo: recurso.titulo,
      campos: (recurso.campos || []).map((campo) => ({
        nombre: campo.nombre,
        tipo: campo.tipo,
        requerido: Boolean(campo.requerido),
      })),
    })),
    plano: copia(plantilla.spec),
  }));
}

function buscar(clave) {
  const limpia = String(clave || "").trim().toLowerCase();
  return POR_CLAVE.get(limpia) || null;
}

function existe(clave) {
  return Boolean(buscar(clave));
}

/** Devuelve una copia del plano lista para normalizar con el nombre elegido. */
function specDe(clave, nombre) {
  const plantilla = buscar(clave);
  if (!plantilla) return null;
  const spec = copia(plantilla.spec);
  spec.nombre = String(nombre || "").trim().toLowerCase();
  spec.motor = "plantilla";
  spec.origen = "plantilla:" + plantilla.clave;
  return spec;
}

/** Descripción exacta que también usa el navegador para calcular la huella. */
function descripcionDe(clave) {
  const plantilla = buscar(clave);
  return plantilla ? String(plantilla.descripcion) : "";
}

module.exports = { listar, buscar, existe, specDe, descripcionDe, claves: VALIDAS.map((p) => p.clave) };
