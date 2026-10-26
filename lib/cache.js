"use strict";

/**
 * Caché en memoria con caducidad (TTL), tamaño máximo (LRU), purga de
 * expiradas y "single flight".
 *
 * En Vercel cada función vive en una instancia que atiende varias peticiones
 * seguidas: guardar aquí lo que se repite (lecturas de datos, índices por
 * recurso, OpenAPI, catálogo de fuentes públicas, huellas de tokens de entorno…)
 * ahorra llamadas a GitHub y a servicios externos, y hace que las lecturas
 * respondan en milisegundos.
 *
 * Reglas de diseño:
 *  - Solo memoria del proceso: si la instancia se enfría, se vuelve a pedir.
 *  - TTL corto para datos que cambian (5–30 s) y largo para lo estático (1 h).
 *  - `purgar()` limpia primero las entradas caducadas antes de expulsar por LRU.
 *  - `recordar()` junta peticiones simultáneas de la misma clave: si dos
 *    visitantes piden lo mismo a la vez, solo sale una petición de verdad.
 *  - Nada de secretos: el token en claro nunca entra en la caché; solo su
 *    huella SHA-256, que ya es pública en el plano.
 */

const MAX_ENTRADAS = Math.max(16, Number(process.env.TALLER_CACHE_ENTRADAS) || 400);

/** @type {Map<string, {valor: *, expira: number}>} */
const mapa = new Map();
/** @type {Map<string, Promise<any>>} */
const enVuelo = new Map();

const cuenta = { aciertos: 0, fallos: 0, expulsadas: 0, unidas: 0 };

function ahora() {
  return Date.now();
}

function purgar() {
  const marca = ahora();
  let quitadas = 0;
  for (const [clave, guardada] of mapa) {
    if (guardada.expira <= marca) {
      mapa.delete(clave);
      quitadas += 1;
    }
  }
  return quitadas;
}

function entrada(clave) {
  const guardada = mapa.get(clave);
  if (!guardada) return null;
  if (guardada.expira <= ahora()) {
    mapa.delete(clave);
    return null;
  }
  // Tocar la clave para que el LRU sepa que se usó.
  mapa.delete(clave);
  mapa.set(clave, guardada);
  return guardada;
}

function tiene(clave) {
  return Boolean(entrada(clave));
}

function obtener(clave, defecto) {
  const guardada = entrada(clave);
  if (!guardada) {
    cuenta.fallos += 1;
    return defecto;
  }
  cuenta.aciertos += 1;
  return guardada.valor;
}

function poner(clave, valor, ttlMs) {
  if (valor === undefined) return valor;
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60000;
  if (mapa.has(clave)) mapa.delete(clave);
  mapa.set(clave, { valor, expira: ahora() + ttl });
  if (mapa.size > MAX_ENTRADAS) purgar();
  while (mapa.size > MAX_ENTRADAS) {
    const masVieja = mapa.keys().next();
    if (masVieja.done) break;
    mapa.delete(masVieja.value);
    cuenta.expulsadas += 1;
  }
  return valor;
}

/**
 * Devuelve lo guardado; si no hay nada (o caducó), ejecuta `fn` una sola vez
 * aunque lleguen varias peticiones al mismo tiempo.
 */
async function recordar(clave, ttlMs, fn) {
  if (tiene(clave)) return obtener(clave);
  if (enVuelo.has(clave)) {
    cuenta.unidas += 1;
    return enVuelo.get(clave);
  }
  const promesa = (async () => {
    try {
      const valor = await fn();
      if (valor !== undefined) poner(clave, valor, ttlMs);
      return valor;
    } finally {
      enVuelo.delete(clave);
    }
  })();
  enVuelo.set(clave, promesa);
  return promesa;
}

function borrar(clave) {
  mapa.delete(clave);
  return true;
}

function borrarPrefijo(prefijo) {
  let quitadas = 0;
  for (const clave of [...mapa.keys()]) {
    if (clave.startsWith(prefijo)) {
      mapa.delete(clave);
      quitadas += 1;
    }
  }
  return quitadas;
}

function limpiar() {
  mapa.clear();
  enVuelo.clear();
}

function estadisticas() {
  const totalConsultas = cuenta.aciertos + cuenta.fallos;
  return {
    entradas: mapa.size,
    maximo: MAX_ENTRADAS,
    enVuelo: enVuelo.size,
    ...cuenta,
    tasaAciertos: totalConsultas > 0 ? Math.round((cuenta.aciertos / totalConsultas) * 100) : 0,
  };
}

module.exports = {
  obtener,
  poner,
  tiene,
  recordar,
  borrar,
  borrarPrefijo,
  purgar,
  limpiar,
  estadisticas,
};
