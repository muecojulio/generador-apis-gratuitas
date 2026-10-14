"use strict";

const almacenReal = require("./almacen");

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function segmentos(req, nombre) {
  if (req.query && Array.isArray(req.query.ruta)) return req.query.ruta.map(String);
  if (req.query && typeof req.query.ruta === "string" && req.query.ruta) return [req.query.ruta];
  const url = new URL(req.url || "/", "http://localhost");
  let path = decodeURIComponent(url.pathname);
  const base = "/api/" + nombre;
  if (path === base || path === base + "/") return [];
  if (path.startsWith(base + "/")) path = path.slice(base.length + 1);
  else path = path.replace(/^\/+/, "");
  return path.split("/").filter(Boolean).map((parte) => decodeURIComponent(parte));
}

function consulta(req) {
  const url = new URL(req.url || "/", "http://localhost");
  return url.searchParams;
}

async function cuerpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (!req.body.trim()) return {};
    return JSON.parse(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const texto = Buffer.concat(chunks).toString("utf8");
  if (!texto.trim()) return {};
  return JSON.parse(texto);
}

function vacio(valor) {
  return valor === undefined || valor === null || (typeof valor === "string" && valor.trim() === "");
}

function validarCampo(campo, valor, creando) {
  if (vacio(valor)) {
    if (campo.requerido && creando) return "«" + campo.nombre + "» es obligatorio.";
    return null;
  }
  if (campo.valores && campo.valores.length && !campo.valores.includes(String(valor))) {
    return "«" + campo.nombre + "» debe ser uno de: " + campo.valores.join(", ") + ".";
  }
  if (campo.tipo === "texto") {
    if (typeof valor !== "string") return "«" + campo.nombre + "» debe ser texto.";
    const texto = valor.trim();
    const min = campo.min || 0;
    const max = campo.max || 500;
    if (texto.length < min) return "«" + campo.nombre + "» es demasiado corto.";
    if (texto.length > max) return "«" + campo.nombre + "» admite como máximo " + max + " caracteres.";
    return null;
  }
  if (campo.tipo === "email") {
    if (typeof valor !== "string" || !CORREO.test(valor.trim())) return "«" + campo.nombre + "» no es un correo.";
    if (valor.trim().length > (campo.max || 160)) return "«" + campo.nombre + "» es demasiado largo.";
    return null;
  }
  if (campo.tipo === "numero" || campo.tipo === "entero") {
    const numero = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
    if (!Number.isFinite(numero)) return "«" + campo.nombre + "» debe ser un número.";
    if (campo.tipo === "entero" && !Number.isInteger(numero)) return "«" + campo.nombre + "» debe ser un número entero.";
    if (campo.min != null && numero < campo.min) return "«" + campo.nombre + "» no puede ser menor que " + campo.min + ".";
    if (campo.max != null && numero > campo.max) return "«" + campo.nombre + "» no puede ser mayor que " + campo.max + ".";
    return null;
  }
  if (campo.tipo === "booleano") {
    if (typeof valor === "boolean") return null;
    if (typeof valor === "number" && (valor === 0 || valor === 1)) return null;
    if (typeof valor === "string" && /^(true|false|si|sí|no|1|0)$/i.test(valor.trim())) return null;
    return "«" + campo.nombre + "» debe ser sí o no.";
  }
  if (campo.tipo === "fecha") {
    const texto = String(valor).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(texto) || Number.isNaN(Date.parse(texto))) {
      return "«" + campo.nombre + "» debe ser una fecha, por ejemplo 2026-10-13.";
    }
    return null;
  }
  return null;
}

function normalizarValor(campo, valor) {
  if (vacio(valor)) return undefined;
  if (campo.tipo === "texto" || campo.tipo === "email") return String(valor).trim();
  if (campo.tipo === "fecha") return String(valor).trim();
  if (campo.tipo === "numero") return Number(String(valor).replace(",", "."));
  if (campo.tipo === "entero") return Number(String(valor).replace(",", "."));
  if (campo.tipo === "booleano") {
    if (typeof valor === "boolean") return valor;
    if (typeof valor === "number") return valor === 1;
    return /^(true|si|sí|1)$/i.test(String(valor).trim());
  }
  return valor;
}

function validarEntrada(recurso, entrada, creando) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { error: "El cuerpo debe ser un objeto JSON." };
  }
  /** @type {Record<string, unknown>} */
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

function semilla(spec) {
  const recursos = {};
  for (const recurso of spec.recursos) {
    const ejemplos = (spec.ejemplos && spec.ejemplos[recurso.nombre]) || [];
    recursos[recurso.nombre] = ejemplos.map((item, indice) => {
      const fila = {
        id: item.id ? String(item.id).slice(0, 80) : "ej-" + recurso.nombre + "-" + (indice + 1),
        creado: item.creado || "2026-01-01T00:00:00.000Z",
      };
      for (const campo of recurso.campos) {
        if (item[campo.nombre] !== undefined) fila[campo.nombre] = item[campo.nombre];
      }
      return fila;
    });
  }
  return { recursos };
}

async function cargar(spec, almacen) {
  try {
    const remoto = await almacen.leer(spec.nombre);
    if (remoto.datos && remoto.datos.recursos) {
      return { estado: remoto.datos, sha: remoto.sha };
    }
  } catch (error) {
    if (error.status === 403 || error.status === 429) {
      return { estado: semilla(spec), sha: null };
    }
    throw error;
  }
  return { estado: semilla(spec), sha: null };
}

function clonar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

function manifiesto(spec) {
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
  return {
    nombre: spec.nombre,
    titulo: spec.titulo,
    resumen: spec.resumen,
    motor: spec.motor || "incluido",
    huella: spec.huella || "",
    soloLectura: Boolean(spec.soloLectura),
    recursos: spec.recursos.map((recurso) => ({
      nombre: recurso.nombre,
      titulo: recurso.titulo,
      campos: recurso.campos,
    })),
    rutas,
  };
}

function crear(spec, opciones) {
  const almacen = (opciones && opciones.almacen) || almacenReal;
  return async function handler(req, res) {
    try {
      if (req.method === "OPTIONS") {
        enviar(res, 204, {});
        return;
      }
      const partes = segmentos(req, spec.nombre);
      if (partes.length === 0 && req.method === "GET") {
        enviar(res, 200, manifiesto(spec));
        return;
      }
      const recurso = spec.recursos.find((item) => item.nombre === partes[0]);
      if (!recurso) {
        enviar(res, 404, {
          error: "No existe ese recurso.",
          recursos: spec.recursos.map((item) => item.nombre),
        });
        return;
      }
      const id = partes[1] ? String(partes[1]) : "";
      if (partes.length > 2) {
        enviar(res, 404, { error: "Esa ruta no existe." });
        return;
      }
      if (spec.soloLectura && req.method !== "GET") {
        enviar(res, 405, { error: "Esta API es solo de lectura." });
        return;
      }

      if (req.method === "GET") {
        const { estado } = await cargar(spec, almacen);
        const lista = (estado.recursos && estado.recursos[recurso.nombre]) || [];
        if (id) {
          const fila = lista.find((item) => item.id === id);
          if (!fila) enviar(res, 404, { error: "No encontré ese registro." });
          else enviar(res, 200, { dato: fila });
          return;
        }
        const params = consulta(req);
        const buscar = (params.get("buscar") || "").trim().toLowerCase();
        let filtrada = lista;
        if (buscar) {
          filtrada = lista.filter((item) =>
            Object.entries(item).some(([clave, valor]) => clave !== "id" && String(valor).toLowerCase().includes(buscar))
          );
        }
        const desde = Math.max(0, Number(params.get("desde") || 0) || 0);
        const limite = Math.min(100, Math.max(1, Number(params.get("limite") || 50) || 50));
        const pagina = filtrada.slice(desde, desde + limite);
        enviar(res, 200, { datos: pagina, total: filtrada.length });
        return;
      }

      if (!almacen.token()) {
        enviar(res, 503, {
          error: "Falta la clave GITHUB_PAT en Vercel. La consulta funciona; guardar cambios, todavía no.",
        });
        return;
      }

      let entrada = {};
      if (req.method === "POST" || req.method === "PUT") {
        try {
          entrada = await cuerpo(req);
        } catch {
          enviar(res, 400, { error: "El cuerpo no es JSON válido." });
          return;
        }
      }

      const mutar = async (fn) => {
        for (let intento = 0; intento < 2; intento += 1) {
          const { estado, sha } = await cargar(spec, almacen);
          const copia = clonar(estado);
          if (!copia.recursos) copia.recursos = {};
          if (!Array.isArray(copia.recursos[recurso.nombre])) copia.recursos[recurso.nombre] = [];
          const resultado = fn(copia);
          if (resultado && resultado.error) return resultado;
          try {
            await almacen.guardar(spec.nombre, copia, sha);
            return resultado;
          } catch (error) {
            if (error.status === 409 && intento === 0) continue;
            throw error;
          }
        }
        return { error: "No pude guardar. Inténtalo otra vez.", status: 409 };
      };

      if (req.method === "POST") {
        if (id) {
          enviar(res, 405, { error: "Para crear, no envíes un id en la ruta." });
          return;
        }
        const revisado = validarEntrada(recurso, entrada, true);
        if (revisado.error) {
          enviar(res, 400, { error: revisado.error });
          return;
        }
        const ahora = new Date().toISOString();
        const fila = { id: nuevoId(), creado: ahora, ...revisado.valor };
        const resultado = await mutar((estado) => {
          estado.recursos[recurso.nombre].push(fila);
          return { dato: fila, status: 201 };
        });
        enviar(res, resultado.status || (resultado.error ? 400 : 201), resultado.error ? { error: resultado.error } : { dato: resultado.dato });
        return;
      }

      if (req.method === "PUT") {
        if (!id) {
          enviar(res, 400, { error: "Falta el id en la ruta." });
          return;
        }
        const revisado = validarEntrada(recurso, entrada, false);
        if (revisado.error) {
          enviar(res, 400, { error: revisado.error });
          return;
        }
        const resultado = await mutar((estado) => {
          const lista = estado.recursos[recurso.nombre];
          const indice = lista.findIndex((item) => item.id === id);
          if (indice === -1) return { error: "No encontré ese registro.", status: 404 };
          const actual = lista[indice];
          for (const [clave, valor] of Object.entries(revisado.valor || {})) {
            if (valor === null) delete actual[clave];
            else actual[clave] = valor;
          }
          actual.actualizado = new Date().toISOString();
          lista[indice] = actual;
          return { dato: actual, status: 200 };
        });
        enviar(res, resultado.status || (resultado.error ? 400 : 200), resultado.error ? { error: resultado.error } : { dato: resultado.dato });
        return;
      }

      if (req.method === "DELETE") {
        if (!id) {
          enviar(res, 400, { error: "Falta el id en la ruta." });
          return;
        }
        const resultado = await mutar((estado) => {
          const lista = estado.recursos[recurso.nombre];
          const indice = lista.findIndex((item) => item.id === id);
          if (indice === -1) return { error: "No encontré ese registro.", status: 404 };
          const [borrado] = lista.splice(indice, 1);
          return { dato: borrado, status: 200 };
        });
        enviar(res, resultado.status || (resultado.error ? 400 : 200), resultado.error ? { error: resultado.error } : { dato: resultado.dato });
        return;
      }

      enviar(res, 405, { error: "Método no permitido." });
    } catch (error) {
      const status = error.status || 500;
      enviar(res, status, { error: error.message || "Error interno." });
    }
  };
}

module.exports = { crear };
