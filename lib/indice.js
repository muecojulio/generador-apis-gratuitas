"use strict";

/**
 * Índices en memoria para los datos de cada API (`data/<api>.json`).
 *
 * Aunque el taller almacena los datos como documentos JSON en GitHub y no usa
 * un motor SQL externo, aplicar índices en memoria sobre cada recurso aporta
 * mejoras medibles de varios órdenes de magnitud (ver `npm run medir`):
 *
 *  1. `porId` (Map<id, fila>): convierte `GET /recurso/{id}`, `PUT` y `DELETE`
 *     de una búsqueda lineal O(n) en una lectura directa O(1).
 *  2. `posicionPorId` (Map<id, indiceArray>): permite localizar la posición
 *     exacta del registro en O(1) al borrar o reemplazar, evitando `indexOf`.
 *  3. `porCampo` (Map<campo, Map<valorNorm, fila[]>>): índice secundario hash
 *     por campo escalar que resuelve filtros exactos (`?activo=true`,
 *     `?categoria=bebidas`, `indice.filtrar({ ... })`) en O(1).
 *  4. `porTrigrama` (Map<trigrama, indiceFila[]>) + `entradasTexto`: índice
 *     invertido de trigramas alfanuméricos (estilo `pg_trgm` de PostgreSQL)
 *     combinado con el vector de texto prenormalizado sin acentos. Permite
 *     resolver `?buscar=` acotando por el trigrama más selectivo antes de
 *     verificar la subcadena exacta.
 *  5. `indexarRecursos`: resuelve el esquema del recurso de la ruta en O(1).
 *
 * El índice se construye una vez por lectura y se guarda en la caché ligado a
 * `indice:<api>:<recurso>:<sha>`: mientras los datos no cambien, se reutiliza.
 */

const CAMPOS_FUERA_DEL_BUSCADOR = new Set(["id"]);
const CAMPOS_FUERA_DE_SECUNDARIO = new Set(["id", "creado", "actualizado"]);
const MAX_LARGO_VALOR_INDEXABLE = 120;

function sinAcentos(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizarValorIndice(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  if (typeof valor === "string") {
    const limpio = sinAcentos(valor.trim());
    return limpio.length <= MAX_LARGO_VALOR_INDEXABLE ? limpio : "";
  }
  return "";
}

function claveCampoNormalizada(mapaCampo, valorEsperado) {
  let clave = normalizarValorIndice(valorEsperado);
  if (mapaCampo && !mapaCampo.has(clave)) {
    if (/^(si|sí|yes|1)$/.test(clave)) clave = "true";
    else if (/^(no|0)$/.test(clave)) clave = "false";
  }
  return clave;
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

function trigramasAlfanumericos(textoNormalizado) {
  const resultado = [];
  const palabras = String(textoNormalizado || "").split(/[^a-z0-9]+/);
  for (let p = 0; p < palabras.length; p += 1) {
    const palabra = palabras[p];
    if (palabra.length < 3) continue;
    for (let i = 0; i <= palabra.length - 3; i += 1) {
      resultado.push(palabra.slice(i, i + 3));
    }
  }
  return resultado;
}

/**
 * Construye los índices primario, de posición, secundario por campo e invertido
 * de trigramas para la lista de registros de un recurso.
 *
 * @param {Array<object>} lista registros del recurso
 */
function crearIndice(lista) {
  const datos = Array.isArray(lista) ? lista : [];
  const porId = new Map();
  const posicionPorId = new Map();
  const porCampo = new Map();
  const entradasTexto = [];
  let porTrigrama = null;

  for (let i = 0; i < datos.length; i += 1) {
    const fila = datos[i];
    if (!fila || typeof fila !== "object") continue;
    const id = fila.id === undefined || fila.id === null ? "" : String(fila.id);
    if (id && !porId.has(id)) {
      porId.set(id, fila);
      posicionPorId.set(id, i);
    }

    const texto = textoBuscable(fila);
    entradasTexto.push({ fila, texto });

    // Índices secundarios hash por campo escalar.
    for (const [campo, valor] of Object.entries(fila)) {
      if (CAMPOS_FUERA_DE_SECUNDARIO.has(campo) || valor === null || valor === undefined) continue;
      if (typeof valor === "object") continue;
      const claveValor = normalizarValorIndice(valor);
      if (!claveValor) continue;
      let mapaCampo = porCampo.get(campo);
      if (!mapaCampo) {
        mapaCampo = new Map();
        porCampo.set(campo, mapaCampo);
      }
      let cubeta = mapaCampo.get(claveValor);
      if (!cubeta) {
        cubeta = [];
        mapaCampo.set(claveValor, cubeta);
      }
      cubeta.push(fila);
    }
  }

  function asegurarTrigramas() {
    if (porTrigrama) return porTrigrama;
    porTrigrama = new Map();
    for (let i = 0; i < entradasTexto.length; i += 1) {
      const tris = trigramasAlfanumericos(entradasTexto[i].texto);
      for (let t = 0; t < tris.length; t += 1) {
        const tri = tris[t];
        let posteo = porTrigrama.get(tri);
        if (!posteo) {
          posteo = [i];
          porTrigrama.set(tri, posteo);
        } else if (posteo[posteo.length - 1] !== i) {
          posteo.push(i);
        }
      }
    }
    return porTrigrama;
  }

  function cubetaInterna(campo, valorEsperado) {
    const mapaCampo = porCampo.get(String(campo || ""));
    if (!mapaCampo) return null;
    const clave = claveCampoNormalizada(mapaCampo, valorEsperado);
    return mapaCampo.get(clave) || null;
  }

  function filtrarPorCampo(campo, valorEsperado) {
    const cubeta = cubetaInterna(campo, valorEsperado);
    return cubeta ? cubeta.slice() : [];
  }

  function filtrar(filtros) {
    if (!filtros || typeof filtros !== "object") return datos;
    const criterios = [];
    for (const [campo, valor] of Object.entries(filtros)) {
      if (valor === undefined || valor === null || String(valor).trim() === "") continue;
      const mapaCampo = porCampo.get(campo);
      if (!mapaCampo) return [];
      const clave = claveCampoNormalizada(mapaCampo, valor);
      const cubeta = mapaCampo.get(clave);
      if (!cubeta || !cubeta.length) return [];
      criterios.push({ campo, clave, cubeta });
    }
    if (!criterios.length) return datos;
    if (criterios.length === 1) return criterios[0].cubeta.slice();

    // Elegimos la cubeta más pequeña (mayor selectividad) y verificamos el resto en O(1) por referencia.
    criterios.sort((a, b) => a.cubeta.length - b.cubeta.length);
    const base = criterios[0].cubeta;
    const conjuntos = [];
    for (let j = 1; j < criterios.length; j += 1) {
      const cubeta = criterios[j].cubeta;
      if (!cubeta._set) {
        Object.defineProperty(cubeta, "_set", {
          value: new Set(cubeta),
          enumerable: false,
          configurable: true,
        });
      }
      conjuntos.push(cubeta._set);
    }
    const salida = [];
    for (let i = 0; i < base.length; i += 1) {
      const fila = base[i];
      let cumple = true;
      for (let j = 0; j < conjuntos.length; j += 1) {
        if (!conjuntos[j].has(fila)) {
          cumple = false;
          break;
        }
      }
      if (cumple) salida.push(fila);
    }
    return salida;
  }

  return {
    total: datos.length,
    porId,
    posicionPorId,
    porCampo,
    obtener(id) {
      return porId.get(String(id === undefined || id === null ? "" : id));
    },
    posicion(id) {
      const pos = posicionPorId.get(String(id === undefined || id === null ? "" : id));
      return pos === undefined ? -1 : pos;
    },
    filtrarPorCampo,
    filtrar,
    /** Devuelve las filas que contienen el texto (sin distinguir mayúsculas ni acentos). */
    buscar(texto) {
      const aguja = sinAcentos(String(texto || "").trim());
      if (!aguja) return datos;

      const tris = trigramasAlfanumericos(aguja);
      if (tris.length > 0 && entradasTexto.length >= 16) {
        const mapaTri = asegurarTrigramas();
        let mejorPosteo = null;
        for (let i = 0; i < tris.length; i += 1) {
          const posteo = mapaTri.get(tris[i]);
          if (!posteo || !posteo.length) return [];
          if (mejorPosteo === null || posteo.length < mejorPosteo.length) {
            mejorPosteo = posteo;
            if (mejorPosteo.length === 1) break;
          }
        }
        if (mejorPosteo) {
          const encontradas = [];
          for (let i = 0; i < mejorPosteo.length; i += 1) {
            const item = entradasTexto[mejorPosteo[i]];
            if (item.texto.includes(aguja)) encontradas.push(item.fila);
          }
          return encontradas;
        }
      }

      const encontradas = [];
      for (let i = 0; i < entradasTexto.length; i += 1) {
        const item = entradasTexto[i];
        if (item.texto.includes(aguja)) encontradas.push(item.fila);
      }
      return encontradas;
    },
    estadisticas() {
      const mapaTri = asegurarTrigramas();
      return {
        total: datos.length,
        idsIndexados: porId.size,
        camposIndexados: porCampo.size,
        trigramasUnicos: mapaTri.size,
      };
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

module.exports = {
  crearIndice,
  indexarRecursos,
  sinAcentos,
};
