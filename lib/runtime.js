"use strict";

/**
 * El motor que atiende TODAS las APIs creadas.
 *
 * Es código fijo y revisado: la IA solo devuelve un plano (datos), nunca
 * programa. Aquí se aplican validaciones, límites, retención, token, cupos,
 * caché e índices primarios y secundarios.
 *
 * Capacidades activas:
 *  - Índices (`lib/indice.js`): buscar por id y posición en O(1), filtrar por
 *    cualquier campo escalar en O(1) (`?activo=true`, `?categoria=...`) y
 *    búsqueda de texto sin acentos (`?buscar=`). El índice se guarda en caché
 *    ligado a `indice:<api>:<recurso>:<sha>`.
 *  - Respuestas con cabeceras de seguridad, ETag/304 y `X-Cache` en manifiesto,
 *    OpenAPI y lecturas de recursos.
 *  - Respaldo Stale-If-Error: si GitHub falla temporalmente tras expirar el TTL,
 *    las lecturas usan la última copia buena en memoria (`almacen.respaldo`) o
 *    la semilla, pero las escrituras devuelven 503 para no pisar datos a ciegas.
 *  - Cupo de escritura por IP (`TALLER_CUPO_MIN`, 60/min por defecto) además del
 *    bloqueo anti-fuerza bruta en tokens.
 *  - Limpieza de caracteres de control y bytes nulos (`\u0000`) en entradas.
 *  - IDs con aleatoriedad criptográfica (`crypto.randomBytes`).
 *  - Campos `pais`, `moneda` y `ciudad` se normalizan con APIs públicas sin
 *    clave (REST Countries, Frankfurter, Open-Meteo) cuando están disponibles.
 */

const crypto = require("crypto");
const almacenReal = require("./almacen");
const cache = require("./cache");
const limites = require("./limites");
const auth = require("./auth");
const cupo = require("./cupo");
const openapi = require("./openapi");
const http = require("./http");
const indiceMod = require("./indice");
const publicas = require("./publicas");

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_CUERPO = 1024 * 1024; // 1 MB de cuerpo como red de seguridad
const MAX_BUSCAR = 100;
const MAX_ID = 120;

function nuevoId() {
  return Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("hex");
}

function limpiarTexto(valor) {
  return String(valor == null ? "" : valor)
    .replace(CONTROL, "")
    .trim();
}

/** URL y decodificación de segmentos, una sola vez y sin lanzar. */
function segmentos(req, nombre) {
  if (req.query && Array.isArray(req.query.ruta)) return req.query.ruta.map(String);
  if (req.query && typeof req.query.ruta === "string" && req.query.ruta) return [req.query.ruta];
  const url = new URL(req.url || "/", "http://localhost");
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  const base = "/api/" + nombre;
  if (path === base || path === base + "/") return [];
  if (path.startsWith(base + "/")) path = path.slice(base.length + 1);
  else path = path.replace(/^\/+/, "");
  return path.split("/").filter(Boolean);
}

function consulta(req, nombreApi) {
  const url = new URL((req && req.url) || "/", "http://localhost");
  if (req && req.query && typeof req.query === "object") {
    for (const [clave, valor] of Object.entries(req.query)) {
      if (clave === "ruta") continue;
      if (clave === "nombre" && valor === nombreApi && !url.searchParams.has("nombre")) continue;
      if (valor !== undefined && valor !== null && !url.searchParams.has(clave)) {
        url.searchParams.set(clave, Array.isArray(valor) ? String(valor[0]) : String(valor));
      }
    }
  }
  return url.searchParams;
}

function vacio(valor) {
  return valor === undefined || valor === null || (typeof valor === "string" && limpiarTexto(valor) === "");
}

function validarCampo(campo, valor, creando) {
  if (vacio(valor)) {
    if (campo.requerido && creando) return "«" + campo.nombre + "» es obligatorio.";
    return null;
  }
  const textoLimpio = typeof valor === "string" ? limpiarTexto(valor) : String(valor);
  if (campo.valores && campo.valores.length && !campo.valores.includes(textoLimpio)) {
    return "«" + campo.nombre + "» debe ser uno de: " + campo.valores.join(", ") + ".";
  }
  if (campo.tipo === "texto") {
    if (typeof valor !== "string") return "«" + campo.nombre + "» debe ser texto.";
    const min = campo.min || 0;
    const max = campo.max || 500;
    if (textoLimpio.length < min) return "«" + campo.nombre + "» es demasiado corto.";
    if (textoLimpio.length > max) return "«" + campo.nombre + "» admite como máximo " + max + " caracteres.";
    return null;
  }
  if (campo.tipo === "email") {
    if (typeof valor !== "string" || !CORREO.test(textoLimpio)) return "«" + campo.nombre + "» no es un correo.";
    if (textoLimpio.length > (campo.max || 160)) return "«" + campo.nombre + "» es demasiado largo.";
    return null;
  }
  if (campo.tipo === "numero" || campo.tipo === "entero") {
    const numero = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
    if (!Number.isFinite(numero)) return "«" + campo.nombre + "» debe ser un número.";
    if (campo.tipo === "entero" && !Number.isInteger(numero)) {
      return "«" + campo.nombre + "» debe ser un número entero.";
    }
    if (campo.min != null && numero < campo.min) return "«" + campo.nombre + "» no puede ser menor que " + campo.min + ".";
    if (campo.max != null && numero > campo.max) return "«" + campo.nombre + "» no puede ser mayor que " + campo.max + ".";
    return null;
  }
  if (campo.tipo === "booleano") {
    if (typeof valor === "boolean") return null;
    if (typeof valor === "number" && (valor === 0 || valor === 1)) return null;
    if (typeof valor === "string" && /^(true|false|si|sí|no|1|0)$/i.test(textoLimpio)) return null;
    return "«" + campo.nombre + "» debe ser sí o no.";
  }
  if (campo.tipo === "fecha") {
    if (!/^\d{4}-\d{2}-\d{2}/.test(textoLimpio) || Number.isNaN(Date.parse(textoLimpio))) {
      return "«" + campo.nombre + "» debe ser una fecha, por ejemplo 2026-10-13.";
    }
    return null;
  }
  return null;
}

function normalizarValor(campo, valor) {
  if (vacio(valor)) return undefined;
  if (campo.tipo === "texto" || campo.tipo === "email" || campo.tipo === "fecha") {
    return limpiarTexto(valor);
  }
  if (campo.tipo === "numero" || campo.tipo === "entero") {
    return Number(String(valor).replace(",", "."));
  }
  if (campo.tipo === "booleano") {
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "number") return valor === 1;
    return /^(true|si|sí|1)$/i.test(limpiarTexto(valor));
  }
  return valor;
}

function validarEntrada(recurso, entrada, creando) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { error: "El cuerpo debe ser un objeto JSON." };
  }
  const salida = {};
  for (const campo of recurso.campos) {
    const presente = Object.prototype.hasOwnProperty.call(entrada, campo.nombre);
    if (!presente && !creando) continue;
    const valor = presente ? entrada[campo.nombre] : undefined;
    if (!creando && valor === null) {
      if (campo.requerido) return { error: "«" + campo.nombre + "» es obligatorio." };
      salida[campo.nombre] = null;
      continue;
    }
    const mensaje = validarCampo(campo, valor, creando || presente);
    if (mensaje) return { error: mensaje };
    if (!vacio(valor)) salida[campo.nombre] = normalizarValor(campo, valor);
  }
  if (creando && Object.keys(salida).length === 0) {
    return { error: "No reconocí ningún campo. Revisa los nombres." };
  }
  return { valor: salida };
}

/**
 * La normalización es opcional y nunca puede romper el esquema: si el valor
 * corregido no encaja en el campo (por ejemplo, un nombre de ciudad más largo
 * que su máximo), se guarda el valor original y no se anuncia como normalizado.
 */
function normalizacionSegura(recurso, original, mejorado) {
  const valores = { ...(mejorado.valores || {}) };
  const aplicados = [];
  for (const marca of mejorado.aplicados || []) {
    const nombre = String(marca).split("=")[0];
    const campo = (recurso.campos || []).find((item) => item.nombre === nombre);
    if (!campo || validarCampo(campo, valores[nombre], true)) {
      valores[nombre] = original ? original[nombre] : valores[nombre];
      continue;
    }
    aplicados.push(marca);
  }
  return { valores, aplicados };
}

// Semillas estables por instancia: si todavía no hay datos guardados, dos
// lecturas seguidas deben devolver exactamente el mismo cuerpo (con los mismos
// `creado`) para que el ETag y el 304 funcionen. Se guarda una copia y se clona
// al entregar, así una escritura que no llegue a persistir no ensucia la semilla.
const semillas = new Map();

function semilla(spec) {
  const guardada = semillas.get(spec.nombre);
  if (guardada) return clonar(guardada);
  const recursos = {};
  const ahora = new Date().toISOString();
  for (const recurso of spec.recursos) {
    const ejemplos = (spec.ejemplos && spec.ejemplos[recurso.nombre]) || [];
    recursos[recurso.nombre] = ejemplos.map((item, indice) => {
      const fila = {
        id: item.id ? String(item.id).slice(0, 80) : "ej-" + recurso.nombre + "-" + (indice + 1),
        creado: item.creado || ahora,
      };
      for (const campo of recurso.campos) {
        if (item[campo.nombre] !== undefined) fila[campo.nombre] = item[campo.nombre];
      }
      return fila;
    });
  }
  const estado = { recursos };
  semillas.set(spec.nombre, estado);
  return clonar(estado);
}

/**
 * Lee el estado y devuelve también si la lectura falló. Quien escribe debe
 * tratar un fallo como «no toques nada»; quien lee puede seguir con el último
 * respaldo en memoria o con la semilla.
 */
async function cargar(spec, almacen, opciones) {
  try {
    const remoto = await almacen.leer(spec.nombre, opciones);
    if (remoto && remoto.datos && remoto.datos.recursos) {
      return {
        estado: remoto.datos,
        sha: remoto.sha,
        fallo: null,
        desdeCache: Boolean(remoto.desdeCache),
      };
    }
    return { estado: semilla(spec), sha: null, fallo: null, nuevo: true, desdeCache: false };
  } catch (error) {
    if (process.env.TALLER_SILENCIO !== "1") {
      console.warn(
        "[taller] No pude leer los datos de " + spec.nombre + ": " + ((error && error.message) || error)
      );
    }
    const ultimo =
      !error.corrupto && typeof almacen.respaldo === "function" ? almacen.respaldo(spec.nombre) : null;
    return {
      estado: ultimo && ultimo.datos ? ultimo.datos : null,
      sha: ultimo ? ultimo.sha : null,
      fallo: error,
      desdeCache: false,
    };
  }
}

function clonar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/**
 * Devuelve el índice en memoria del recurso (cacheado por API + recurso + sha).
 */
function indiceDe(nombre, recursoNombre, sha, lista) {
  const clave = "indice:" + nombre + ":" + recursoNombre + ":" + (sha || "semilla");
  const guardado = cache.obtener(clave);
  if (guardado) return { indice: guardado, aciertoIndice: true };
  const creado = cache.poner(clave, indiceMod.crearIndice(lista), 60 * 1000);
  return { indice: creado, aciertoIndice: false };
}

function rutasDe(spec) {
  const rutas = [];
  for (const recurso of spec.recursos) {
    const base = "/api/" + spec.nombre + "/" + recurso.nombre;
    rutas.push("GET " + base);
    if (!spec.soloLectura) {
      rutas.push("POST " + base);
      rutas.push("GET " + base + "/{id}");
      rutas.push("PUT " + base + "/{id}");
      rutas.push("DELETE " + base + "/{id}");
    } else {
      rutas.push("GET " + base + "/{id}");
    }
  }
  return rutas;
}

function camposNormalizables(spec) {
  const nombres = new Set();
  for (const recurso of spec.recursos || []) {
    for (const campo of recurso.campos || []) {
      if (publicas.CAMPOS_MEJORABLES[campo.nombre]) nombres.add(campo.nombre);
    }
  }
  return [...nombres];
}

function manifiesto(spec) {
  const reglas = limites.limitesDe(spec);
  const normaliza = camposNormalizables(spec);
  return {
    nombre: spec.nombre,
    titulo: spec.titulo,
    resumen: spec.resumen,
    motor: spec.motor || "incluido",
    origen: spec.origen || "",
    huella: spec.huella || "",
    soloLectura: Boolean(spec.soloLectura),
    autenticacion: spec.auth
      ? {
          tipo: "token",
          modo: spec.auth.modo === "todo" ? "todo" : "escritura",
          cabeceras: ["Authorization: Bearer <token>", "X-API-Token: <token>"],
          nota: "El plano guarda solo la huella SHA-256 del token.",
        }
      : null,
    limites: reglas,
    normalizacion: normaliza.length
      ? {
          activa: publicas.fuentesActivas(),
          campos: normaliza,
          fuentes: ["rest-countries", "frankfurter", "open-meteo-geo"],
          variable: "TALLER_FUENTES",
        }
      : null,
    documentacion: "/docs?api=" + encodeURIComponent(spec.nombre),
    openapi: "/api/" + spec.nombre + "/openapi.json",
    recursos: spec.recursos.map((recurso) => ({
      nombre: recurso.nombre,
      titulo: recurso.titulo,
      campos: recurso.campos,
    })),
    rutas: rutasDe(spec),
  };
}

function mensajeSeguro(error, respaldo) {
  if (!error) return respaldo || "Error interno del taller.";
  if (error.status === 503 || error.status === 413 || error.status === 409) return error.message;
  if (error.status === 429) return error.message;
  if (error.status && error.status < 500) return error.message;
  return respaldo || "Error interno del taller. Inténtalo otra vez.";
}

function crear(spec, opciones) {
  const config = opciones || {};
  const almacen = config.almacen || almacenReal;
  const reglas = limites.limitesDe(spec);
  const recursos = indiceMod.indexarRecursos(spec.recursos);
  const normaliza = camposNormalizables(spec);

  return async function handler(req, res) {
    const metodo = String(req.method || "GET").toUpperCase();
    const cabecerasBase = { "X-Limite-Registros": String(reglas.maxRegistrosPorRecurso) };
    if (reglas.retencionDias) cabecerasBase["X-Retencion-Dias"] = String(reglas.retencionDias);

    try {
      if (metodo === "OPTIONS") {
        http.enviarJson(req, res, 204, {}, { publico: true, cabeceras: cabecerasBase });
        return;
      }

      const partes = segmentos(req, spec.nombre);
      const esLectura = metodo === "GET" || metodo === "HEAD";

      // Documentación y manifiesto: siempre públicos, aunque la API pida token.
      if (partes.length === 1 && partes[0] === "openapi.json" && esLectura) {
        http.enviarJson(req, res, 200, openapi.generar(spec, { baseUrl: openapi.baseDe(req) }), {
          publico: true,
          cache: 300,
          etag: true,
          cabeceras: cabecerasBase,
        });
        return;
      }
      if (partes.length === 1 && partes[0] === "docs" && esLectura) {
        http.aplicarSeguridad(res);
        http.aplicarCors(req, res, { publico: true });
        res.statusCode = 302;
        res.setHeader("Location", "/docs?api=" + encodeURIComponent(spec.nombre));
        res.setHeader("Cache-Control", "no-store");
        res.end();
        return;
      }
      if (partes.length === 0 && esLectura) {
        http.enviarJson(req, res, 200, manifiesto(spec), {
          publico: true,
          cache: 300,
          etag: true,
          cabeceras: cabecerasBase,
        });
        return;
      }

      const recurso = recursos.obtener(partes[0]);
      if (!recurso) {
        http.enviarJson(
          req,
          res,
          404,
          {
            error: "No existe ese recurso.",
            recursos: spec.recursos.map((item) => item.nombre),
            documentacion: "/docs?api=" + encodeURIComponent(spec.nombre),
          },
          { publico: true, cabeceras: cabecerasBase }
        );
        return;
      }
      const id = partes[1] ? String(partes[1]).slice(0, MAX_ID) : "";
      if (partes.length > 2) {
        http.enviarJson(req, res, 404, { error: "Esa ruta no existe." }, { publico: true, cabeceras: cabecerasBase });
        return;
      }
      if (spec.soloLectura && !esLectura) {
        http.enviarJson(
          req,
          res,
          405,
          { error: "Esta API es solo de lectura." },
          { publico: true, cabeceras: { ...cabecerasBase, Allow: "GET, HEAD, OPTIONS" } }
        );
        return;
      }
      if (auth.protege(spec, metodo)) {
        const intento = auth.bloqueado(spec, req);
        if (intento.bloqueado) {
          http.enviarJson(
            req,
            res,
            429,
            { error: "Demasiados intentos fallidos. Espera " + intento.segundos + " segundos." },
            { publico: true, cabeceras: { ...cabecerasBase, "Retry-After": String(intento.segundos) } }
          );
          return;
        }
        const revision = auth.revisar(spec, req);
        if (!revision.ok) {
          auth.anotarFallo(spec, req);
          res.setHeader("WWW-Authenticate", 'Bearer realm="' + spec.nombre + '"');
          http.enviarJson(
            req,
            res,
            401,
            { error: revision.error, documentacion: "/docs?api=" + encodeURIComponent(spec.nombre) },
            { publico: true, cabeceras: cabecerasBase }
          );
          return;
        }
        auth.limpiarFallos(spec, req);
      }

      if (esLectura) {
        const { estado, sha, fallo, desdeCache } = await cargar(spec, almacen);
        if (fallo && fallo.corrupto) {
          http.enviarJson(
            req,
            res,
            500,
            { error: "Los datos guardados de esta API necesitan revisión. No se han modificado." },
            { publico: true, cabeceras: cabecerasBase }
          );
          return;
        }
        const base = estado || semilla(spec);
        const cabeceras = { ...cabecerasBase };
        if (fallo) {
          cabeceras["X-Datos"] = "respaldo";
          cabeceras["Warning"] = '110 - "Response is Stale"';
        }
        const lista = limites.filtrarVigentes(
          (base.recursos && base.recursos[recurso.nombre]) || [],
          reglas.retencionDias
        );
        const { indice, aciertoIndice } = indiceDe(spec.nombre, recurso.nombre, sha || "semilla", lista);
        cabeceras["X-Cache"] = desdeCache || aciertoIndice ? "HIT" : "MISS";

        if (id) {
          const fila = indice.obtener(id);
          if (!fila) {
            http.enviarJson(req, res, 404, { error: "No encontré ese registro." }, { publico: true, cabeceras });
          } else {
            http.enviarJson(req, res, 200, { dato: fila }, { publico: true, etag: true, cabeceras });
          }
          return;
        }

        const params = consulta(req, spec.nombre);
        // Filtros exactos en O(1) usando los índices secundarios por campo del recurso.
        const filtrosCampo = {};
        let hayFiltroCampo = false;
        for (const campo of recurso.campos || []) {
          const valorFiltro = params.get(campo.nombre);
          if (valorFiltro !== null && valorFiltro.trim() !== "") {
            filtrosCampo[campo.nombre] = valorFiltro.slice(0, MAX_BUSCAR);
            hayFiltroCampo = true;
          }
        }

        const buscar = String(params.get("buscar") || "").slice(0, MAX_BUSCAR).trim();
        let filtrada = hayFiltroCampo ? indice.filtrar(filtrosCampo) : lista;
        if (buscar) {
          const porTexto = indice.buscar(buscar);
          if (hayFiltroCampo) {
            const permitidos = new Set(filtrada);
            filtrada = porTexto.filter((fila) => permitidos.has(fila));
          } else {
            filtrada = porTexto;
          }
        }

        const desde = Math.max(0, Number(params.get("desde") || 0) || 0);
        const limite = Math.min(100, Math.max(1, Number(params.get("limite") || 50) || 50));
        const pagina = filtrada.slice(desde, desde + limite);
        cabeceras["X-Total-Registros"] = String(filtrada.length);
        http.enviarJson(
          req,
          res,
          200,
          { datos: pagina, total: filtrada.length },
          { publico: true, etag: true, cabeceras }
        );
        return;
      }

      // Cupo de escrituras por IP y minuto (TALLER_CUPO_MIN) para proteger GitHub.
      const topeEscrituras = Math.max(1, Number(process.env.TALLER_CUPO_MIN) || 60);
      const permisoEscritura = cupo.consumir(req, "escritura:" + spec.nombre, topeEscrituras, 60 * 1000);
      cabecerasBase["X-RateLimit-Limit"] = String(permisoEscritura.limite);
      cabecerasBase["X-RateLimit-Remaining"] = String(permisoEscritura.restante);
      if (!permisoEscritura.ok) {
        http.enviarJson(
          req,
          res,
          429,
          {
            error: "Demasiadas escrituras seguidas desde esta dirección. Espera " + permisoEscritura.segundos + " segundos.",
            reinicio: permisoEscritura.reinicio,
          },
          { publico: true, cabeceras: { ...cabecerasBase, "Retry-After": String(permisoEscritura.segundos) } }
        );
        return;
      }

      if (!almacen.token || !almacen.token()) {
        http.enviarJson(
          req,
          res,
          503,
          { error: "Falta la clave GITHUB_PAT en Vercel. La consulta funciona; guardar cambios, todavía no." },
          { publico: true, cabeceras: cabecerasBase }
        );
        return;
      }

      let entrada = {};
      if (metodo === "POST" || metodo === "PUT") {
        try {
          entrada = await http.leerJson(req, MAX_CUERPO);
        } catch (error) {
          http.enviarJson(
            req,
            res,
            error.status || 400,
            { error: error.message || "El cuerpo no es JSON válido." },
            { publico: true, cabeceras: cabecerasBase }
          );
          return;
        }
      }

      const mutar = async (fn, comprobarCupo, comprobarTamano) => {
        let ultimoFallo = null;
        for (let intento = 0; intento < 2; intento += 1) {
          const leido = await cargar(spec, almacen, intento > 0 ? { fresco: true } : undefined);
          if (leido.fallo) {
            // No se escribe a ciegas: si no vemos el archivo fresco, no lo pisamos.
            return {
              error: leido.fallo.corrupto
                ? "Los datos guardados de esta API necesitan revisión. No se han modificado."
                : "No pude leer los datos en este momento, así que no voy a sobrescribirlos. Prueba de nuevo en unos segundos.",
              status: leido.fallo.corrupto ? 500 : 503,
            };
          }
          const copia = clonar(leido.estado || semilla(spec));
          if (!copia.recursos) copia.recursos = {};
          if (!Array.isArray(copia.recursos[recurso.nombre])) copia.recursos[recurso.nombre] = [];

          // La retención se aplica antes de escribir: lo vencido no se guarda.
          limites.expurgar(copia, reglas.retencionDias);

          const resultado = fn(copia);
          if (resultado && resultado.error) return resultado;

          if (comprobarCupo && copia.recursos[recurso.nombre].length > reglas.maxRegistrosPorRecurso) {
            return {
              error:
                "Esta API admite como máximo " +
                reglas.maxRegistrosPorRecurso +
                " registros por recurso. Borra algunos o sube el límite en su plano (limites.maxRegistrosPorRecurso).",
              status: 409,
            };
          }

          const bytes = Buffer.byteLength(JSON.stringify(copia, null, 2) + "\n", "utf8");
          if (comprobarTamano !== false && bytes > reglas.maxBytes) {
            return {
              error:
                "La API alcanzó su límite de tamaño (" +
                Math.round(reglas.maxBytes / 1024) +
                " KB). Borra registros o sube limites.maxBytes en su plano.",
              status: 413,
            };
          }

          try {
            const guardado = await almacen.guardar(spec.nombre, copia, leido.sha);
            cache.borrarPrefijo("indice:" + spec.nombre + ":");
            return { ...resultado, guardado };
          } catch (error) {
            if (error.status === 409 && intento === 0) {
              ultimoFallo = error;
              continue;
            }
            throw error;
          }
        }
        return {
          error: "No pude guardar. Inténtalo otra vez.",
          status: 409,
          detalle: ultimoFallo ? ultimoFallo.message : "",
        };
      };

      if (metodo === "POST") {
        if (id) {
          http.enviarJson(req, res, 405, { error: "Para crear, no envíes un id en la ruta." }, { publico: true, cabeceras: cabecerasBase });
          return;
        }
        const revisado = validarEntrada(recurso, entrada, true);
        if (revisado.error) {
          http.enviarJson(req, res, 400, { error: revisado.error }, { publico: true, cabeceras: cabecerasBase });
          return;
        }
        const mejorado = normalizacionSegura(
          recurso,
          revisado.valor,
          normaliza.length > 0
            ? await publicas.enriquecer(recurso, revisado.valor, { activo: config.enriquecer })
            : { valores: revisado.valor, aplicados: [] }
        );
        const ahora = new Date().toISOString();
        const fila = { id: nuevoId(), creado: ahora, ...mejorado.valores };
        const resultado = await mutar((estado) => {
          estado.recursos[recurso.nombre].push(fila);
          return { dato: fila, status: 201 };
        }, true);
        const cabeceras = { ...cabecerasBase };
        if (mejorado.aplicados && mejorado.aplicados.length) cabeceras["X-Normalizado"] = mejorado.aplicados.join(",");
        http.enviarJson(
          req,
          res,
          resultado.status || (resultado.error ? 400 : 201),
          resultado.error ? { error: resultado.error } : { dato: resultado.dato },
          { publico: true, cabeceras }
        );
        return;
      }

      if (metodo === "PUT") {
        if (!id) {
          http.enviarJson(req, res, 400, { error: "Falta el id en la ruta." }, { publico: true, cabeceras: cabecerasBase });
          return;
        }
        const revisado = validarEntrada(recurso, entrada, false);
        if (revisado.error) {
          http.enviarJson(req, res, 400, { error: revisado.error }, { publico: true, cabeceras: cabecerasBase });
          return;
        }
        const mejorado = normalizacionSegura(
          recurso,
          revisado.valor,
          normaliza.length > 0
            ? await publicas.enriquecer(recurso, revisado.valor, { activo: config.enriquecer })
            : { valores: revisado.valor, aplicados: [] }
        );
        const resultado = await mutar((estado) => {
          const lista = estado.recursos[recurso.nombre];
          const indice = indiceMod.crearIndice(lista);
          const actual = indice.obtener(id);
          if (!actual) return { error: "No encontré ese registro.", status: 404 };
          for (const [clave, valor] of Object.entries(mejorado.valores || {})) {
            if (valor === null) delete actual[clave];
            else actual[clave] = valor;
          }
          actual.actualizado = new Date().toISOString();
          return { dato: actual, status: 200 };
        }, false);
        http.enviarJson(
          req,
          res,
          resultado.status || (resultado.error ? 400 : 200),
          resultado.error ? { error: resultado.error } : { dato: resultado.dato },
          {
            publico: true,
            cabeceras: {
              ...cabecerasBase,
              ...(mejorado.aplicados.length ? { "X-Normalizado": mejorado.aplicados.join(",") } : {}),
            },
          }
        );
        return;
      }

      if (metodo === "DELETE") {
        if (!id) {
          http.enviarJson(req, res, 400, { error: "Falta el id en la ruta." }, { publico: true, cabeceras: cabecerasBase });
          return;
        }
        const resultado = await mutar((estado) => {
          const lista = estado.recursos[recurso.nombre];
          const indice = indiceMod.crearIndice(lista);
          const posicion = indice.posicion(id);
          if (posicion === -1) return { error: "No encontré ese registro.", status: 404 };
          const [borrado] = lista.splice(posicion, 1);
          return { dato: borrado, status: 200 };
        }, false, false);
        http.enviarJson(
          req,
          res,
          resultado.status || (resultado.error ? 400 : 200),
          resultado.error ? { error: resultado.error } : { dato: resultado.dato },
          { publico: true, cabeceras: cabecerasBase }
        );
        return;
      }

      http.enviarJson(
        req,
        res,
        405,
        { error: "Método no permitido." },
        { publico: true, cabeceras: { ...cabecerasBase, Allow: "GET, HEAD, POST, PUT, DELETE, OPTIONS" } }
      );
    } catch (error) {
      http.enviarJson(
        req,
        res,
        error.status || 500,
        { error: mensajeSeguro(error, "No pude completar la operación. Inténtalo otra vez.") },
        { publico: true, cabeceras: cabecerasBase }
      );
    }
  };
}

module.exports = { crear };
