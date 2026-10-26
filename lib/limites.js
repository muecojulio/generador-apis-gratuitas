"use strict";

/**
 * Límites de tamaño y retención de cada API.
 *
 * El plano (api/<nombre>/spec.json) guarda un bloque "limites" opcional:
 *
 *   "limites": {
 *     "maxRegistrosPorRecurso": 500,   // 1 .. 5000
 *     "maxBytes": 262144,              // 4 KB .. 512 KB, tamaño del archivo de datos
 *     "retencionDias": 0               // 0 = no borrar nada; 1 .. 3650 días
 *   }
 *
 * Estas reglas se aplican dentro de lib/runtime.js. Los valores siempre se
 * recortan a un rango seguro para que nadie pueda romper el almacenamiento.
 */

const POR_DEFECTO = Object.freeze({
  maxRegistrosPorRecurso: 500,
  maxBytes: 256 * 1024,
  retencionDias: 0,
});

const RANGOS = Object.freeze({
  maxRegistrosPorRecurso: [1, 5000],
  maxBytes: [4 * 1024, 512 * 1024],
  retencionDias: [0, 3650],
});

const ALIAS = Object.freeze({
  maxRegistrosPorRecurso: ["maxRegistrosPorRecurso", "maxRegistros", "max_registros", "registrosMaximos"],
  maxBytes: ["maxBytes", "max_bytes", "tamanoMaximo", "tamano_maximo"],
  retencionDias: ["retencionDias", "retencion", "diasRetencion", "dias_retencion"],
});

function numero(valor, defecto) {
  if (valor === undefined || valor === null || valor === "") return defecto;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : defecto;
}

function recortar(valor, rango) {
  return Math.min(rango[1], Math.max(rango[0], valor));
}

/** Normaliza el bloque de límites de un plano. */
function normalizar(bruto) {
  const datos = bruto && typeof bruto === "object" ? bruto : {};
  const salida = {};
  for (const clave of Object.keys(POR_DEFECTO)) {
    const candidatos = ALIAS[clave];
    let valor;
    for (const candidato of candidatos) {
      if (datos[candidato] !== undefined && datos[candidato] !== null && datos[candidato] !== "") {
        valor = datos[candidato];
        break;
      }
    }
    salida[clave] = recortar(numero(valor, POR_DEFECTO[clave]), RANGOS[clave]);
  }
  return salida;
}

/** Límites efectivos de una API (aunque su plano sea antiguo y no los traiga). */
function limitesDe(spec) {
  return normalizar(spec && spec.limites);
}

/** ¿Un registro sigue vigente según la retención en días? */
function vigente(fila, retencionDias, ahora) {
  if (!retencionDias) return true;
  if (!fila || typeof fila !== "object") return true;
  const marca = Date.parse(fila.creado || fila.actualizado || "");
  if (!Number.isFinite(marca)) return true;
  const limite = retencionDias * 24 * 60 * 60 * 1000;
  return (ahora || Date.now()) - marca <= limite;
}

/** Devuelve solo los registros que no han superado la retención. */
function filtrarVigentes(lista, retencionDias, ahora) {
  if (!retencionDias || !Array.isArray(lista)) return Array.isArray(lista) ? lista : [];
  return lista.filter((fila) => vigente(fila, retencionDias, ahora));
}

/**
 * Borra de un estado ya clonado los registros vencidos.
 * Devuelve cuántos quitó (0 si no cambió nada).
 */
function expurgar(estado, retencionDias, ahora) {
  if (!retencionDias || !estado || !estado.recursos || typeof estado.recursos !== "object") return 0;
  let quitados = 0;
  for (const clave of Object.keys(estado.recursos)) {
    const lista = estado.recursos[clave];
    if (!Array.isArray(lista)) continue;
    const vigentes = filtrarVigentes(lista, retencionDias, ahora);
    quitados += lista.length - vigentes.length;
    estado.recursos[clave] = vigentes;
  }
  return quitados;
}

module.exports = {
  normalizar,
  limitesDe,
  filtrarVigentes,
  expurgar,
};
