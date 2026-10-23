"use strict";

/**
 * Índices en memoria para los datos de cada API.
 *
 * El taller no usa una base de datos SQL: los datos viven en
 * `data/<api>.json` y viajan a GitHub. Aun así, «indexar» sí aporta:
 *
 *  - `porId` convierte `GET /productos/{id}` de una búsqueda lineal (O(n)) en
 *    una lectura de diccionario (O(1)). Con 5.000 registros se nota.
 *  - `texto` deja preparada la búsqueda de `?buscar=` sin repetir
 *    `String(valor).toLowerCase()` por cada fila y por cada petición.
 *  - `recursos` resuelve el recurso de la ruta sin recorrer el plano.
 *
 * El índice se construye una vez por lectura y se guarda en la caché ligado al
 * sha del archivo: si los datos no cambiaron, se reutiliza. No se escribe en
 * disco ni en el repositorio; es una estructura derivada y descartable.
 */

const CAMPOS_FUERA_DEL_BUSCADOR = new Set(["id"]);

function sinAcentos(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textoBuscable(fila) {
  const partes = [];
  for (const [clave, valor] of Object.entries(fila || {})) {
    if (CAMPOS_FUERA_DEL_BUSCADOR.has(clave) || valor === null || valor === undefined) continue;
    if (typeof valor === "object") continue;
    partes.push(sinAcentos(valor));
  }
  return partes.join(" \u0000 ");
}

/**
 * @param {Array<object>} lista registros del recurso
 */
function crearIndice(lista) {
  const datos = Array.isArray(lista) ? lista : [];
  const porId = new Map();
  const textos = new Map();

  for (const fila of datos) {
    if (!fila || typeof fila !== "object") continue;
    const id = fila.id === undefined || fila.id === null ? "" : String(fila.id);
    if (!id || porId.has(id)) continue; // el primero gana, igual que Array.find
    porId.set(id, fila);
    textos.set(id, textoBuscable(fila));
  }

  return {
    total: datos.length,
    porId,
    obtener(id) {
      return porId.get(String(id === undefined || id === null ? "" : id));
    },
    /** Devuelve las filas que contienen el texto (sin distinguir mayúsculas ni acentos). */
    buscar(texto) {
      const aguja = sinAcentos(String(texto || "").trim());
      if (!aguja) return datos;
      const encontradas = [];
      for (const fila of datos) {
        const id = fila && fila.id !== undefined && fila.id !== null ? String(fila.id) : "";
        const contenido = textos.get(id);
        if (contenido === undefined) {
          if (textoBuscable(fila).includes(aguja)) encontradas.push(fila);
        } else if (contenido.includes(aguja)) {
          encontradas.push(fila);
        }
      }
      return encontradas;
    },
  };
}

/** Índice del plano: nombre de recurso -> recurso. */
function indexarRecursos(recursos) {
  const porNombre = new Map();
  for (const recurso of Array.isArray(recursos) ? recursos : []) {
    if (recurso && recurso.nombre && !porNombre.has(recurso.nombre)) porNombre.set(recurso.nombre, recurso);
  }
  return {
    total: porNombre.size,
    porNombre,
    obtener(nombre) {
      return porNombre.get(String(nombre || ""));
    },
  };
}

module.exports = { crearIndice, indexarRecursos, sinAcentos, textoBuscable };
