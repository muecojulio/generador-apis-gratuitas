"use strict";

/**
 * Genera un documento OpenAPI 3.0.3 a partir del plano de una API.
 *
 * El plano es solo datos (recursos, campos, límites, soloLectura, auth), así
 * que la documentación también es determinista: no hay documentos escritos a
 * mano por API. Se publica en:
 *
 *   /api/<nombre>/openapi.json
 *
 * y la vista bonita está en /docs?api=<nombre>. El mismo JSON se puede abrir en
 * Swagger Editor o en cualquier herramienta compatible con OpenAPI.
 */

const { limitesDe } = require("./limites");

const SEGURIDAD = [{ bearerAuth: [] }, { apiToken: [] }];

const EJEMPLOS_POR_NOMBRE = {
  nombre: "Camiseta de algodón",
  titulo: "Mi primera nota",
  cuerpo: "Un detalle de ejemplo.",
  descripcion: "Una descripción breve.",
  detalle: "Un detalle de ejemplo.",
  precio: 19.9,
  cuota: 25,
  cantidad: 2,
  existencias: 12,
  stock: 12,
  personas: 4,
  comensales: 2,
  capacidad: 6,
  edad: 30,
  mesa: "Mesa 4",
  numero: 4,
  correo: "ana@example.com",
  email: "ana@example.com",
  telefono: "555 123 4567",
  fecha: "2026-10-19",
  hora: "20:30",
  estado: "pendiente",
  activo: true,
  hecha: false,
  disponible: true,
  sku: "CAM-001",
  categoria: "Camisetas",
  unidad: "unidad",
  notas: "Sin cebolla, por favor.",
  etiqueta: "importante",
  nivel: "principiante",
  tipo: "entrada",
  cliente: "Ana Pérez",
};

const NOMBRE_CAMPO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function pascal(texto) {
  return String(texto || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join("") || "Recurso";
}

function referencia(nombre) {
  return { $ref: "#/components/schemas/" + nombre };
}

function ejemploDe(campo) {
  if (Array.isArray(campo.valores) && campo.valores.length) return campo.valores[0];
  if (Object.prototype.hasOwnProperty.call(EJEMPLOS_POR_NOMBRE, campo.nombre)) {
    return EJEMPLOS_POR_NOMBRE[campo.nombre];
  }
  if (campo.tipo === "numero") return 10.5;
  if (campo.tipo === "entero") return 3;
  if (campo.tipo === "booleano") return true;
  if (campo.tipo === "fecha") return "2026-10-19";
  if (campo.tipo === "email") return "ana@example.com";
  return "Texto de ejemplo";
}

function esquemaCampo(campo) {
  const base = {};
  if (campo.tipo === "numero") base.type = "number";
  else if (campo.tipo === "entero") base.type = "integer";
  else if (campo.tipo === "booleano") base.type = "boolean";
  else base.type = "string";

  if (campo.tipo === "email") base.format = "email";
  if (campo.tipo === "fecha") base.format = "date";
  if (Array.isArray(campo.valores) && campo.valores.length) base.enum = campo.valores.slice();
  if (typeof campo.min === "number") {
    if (campo.tipo === "texto" || campo.tipo === "email") base.minLength = campo.min;
    else base.minimum = campo.min;
  }
  if (typeof campo.max === "number") {
    if (campo.tipo === "texto" || campo.tipo === "email") base.maxLength = campo.max;
    else base.maximum = campo.max;
  }
  base.example = ejemploDe(campo);
  base.description = describirCampo(campo);
  return base;
}

function describirCampo(campo) {
  const partes = [];
  if (campo.requerido) partes.push("obligatorio");
  if (campo.tipo && campo.tipo !== "texto") partes.push("tipo " + campo.tipo);
  if (Array.isArray(campo.valores) && campo.valores.length) {
    partes.push("valores: " + campo.valores.join(", "));
  }
  if (typeof campo.min === "number") {
    partes.push((campo.tipo === "texto" || campo.tipo === "email" ? "mínimo " + campo.min + " caracteres" : "mínimo " + campo.min));
  }
  if (typeof campo.max === "number") {
    partes.push((campo.tipo === "texto" || campo.tipo === "email" ? "máximo " + campo.max + " caracteres" : "máximo " + campo.max));
  }
  return partes.length ? partes.join(" · ") : "Campo de la API";
}

function ejemploObjeto(recurso) {
  const ejemplo = {};
  for (const campo of recurso.campos) ejemplo[campo.nombre] = ejemploDe(campo);
  return ejemplo;
}

function esquemaRegistro(recurso, entrada, parcial) {
  const properties = {};
  for (const campo of recurso.campos) {
    if (!NOMBRE_CAMPO.test(campo.nombre)) continue;
    properties[campo.nombre] = esquemaCampo(campo);
  }
  if (!entrada) {
    properties.id = {
      type: "string",
      description: "Identificador generado por el taller.",
      example: "ej-" + recurso.nombre + "-1",
    };
    properties.creado = {
      type: "string",
      format: "date-time",
      description: "Fecha de creación en ISO 8601.",
      example: "2026-10-19T12:00:00.000Z",
    };
    properties.actualizado = {
      type: "string",
      format: "date-time",
      description: "Última actualización en ISO 8601 (puede no aparecer).",
      example: "2026-10-19T12:30:00.000Z",
    };
  }
  const obligatorios = recurso.campos
    .filter((campo) => campo.requerido && NOMBRE_CAMPO.test(campo.nombre))
    .map((campo) => campo.nombre);
  const requeridos = parcial ? [] : entrada ? obligatorios : ["id", "creado", ...obligatorios];
  const esquema = { type: "object", properties };
  if (requeridos.length) esquema.required = requeridos;
  if (entrada) esquema.additionalProperties = false;
  return esquema;
}

function parametrosListado() {
  return [
    {
      name: "buscar",
      in: "query",
      required: false,
      description: "Filtra por texto en cualquier campo (no distingue mayúsculas).",
      schema: { type: "string", example: "algodón" },
    },
    {
      name: "desde",
      in: "query",
      required: false,
      description: "Índice del primer registro (paginación).",
      schema: { type: "integer", minimum: 0, default: 0 },
    },
    {
      name: "limite",
      in: "query",
      required: false,
      description: "Cantidad máxima de registros devueltos (1 a 100).",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  ];
}

function parametroId(recurso) {
  return {
    name: "id",
    in: "path",
    required: true,
    description: "Identificador del registro de " + recurso.titulo.toLowerCase() + ".",
    schema: { type: "string", example: "ej-" + recurso.nombre + "-1" },
  };
}

function respuestaError(descripcion) {
  return {
    description: descripcion,
    content: { "application/json": { schema: referencia("Error") } },
  };
}

function descripcionInfo(spec, limites) {
  const partes = [];
  if (spec.resumen) partes.push(spec.resumen);
  partes.push("API publicada por el Taller de APIs gratuitas (GitHub Free + Vercel Hobby).");
  if (spec.soloLectura) partes.push("Modo solo lectura: únicamente se puede consultar.");
  if (spec.auth) {
    partes.push(
      spec.auth.modo === "todo"
        ? "Autenticación por token: se pide para leer y escribir."
        : "Autenticación por token: se pide para crear, actualizar o borrar."
    );
  }
  partes.push(
    "Límites: " +
      limites.maxRegistrosPorRecurso +
      " registros por recurso, " +
      Math.round(limites.maxBytes / 1024) +
      " KB por API" +
      (limites.retencionDias ? " y retención de " + limites.retencionDias + " días." : " y sin borrado automático.")
  );
  return partes.join("\n\n");
}

/**
 * @param {object} spec plano de la API
 * @param {{baseUrl?: string}} [opciones]
 */
function generar(spec, opciones) {
  const limites = limitesDe(spec);
  const base = String((opciones && opciones.baseUrl) || "").replace(/\/+$/, "");
  const recursos = Array.isArray(spec.recursos) ? spec.recursos : [];
  const schemas = {
    Error: {
      type: "object",
      properties: { error: { type: "string", example: "No encontré ese registro." } },
      required: ["error"],
    },
  };
  const paths = {};
  const tags = [];
  const protectedAll = Boolean(spec.auth && spec.auth.modo === "todo");
  const security = (metodo) => {
    if (!spec.auth) return undefined;
    if (spec.auth.modo === "todo") return SEGURIDAD;
    return ["GET", "HEAD"].includes(metodo) ? undefined : SEGURIDAD;
  };

  for (const recurso of recursos) {
    const nombreSchema = pascal(recurso.nombre);
    const nombreEntrada = nombreSchema + "Entrada";
    const nombreParcial = nombreSchema + "EntradaParcial";
    const nombreLista = nombreSchema + "Lista";
    const nombreRespuesta = nombreSchema + "Respuesta";
    const tag = recurso.titulo || recurso.nombre;
    tags.push({ name: tag, description: "Recursos de " + recurso.nombre + "." });

    schemas[nombreSchema] = esquemaRegistro(recurso, false);
    schemas[nombreEntrada] = esquemaRegistro(recurso, true);
    schemas[nombreParcial] = esquemaRegistro(recurso, true, true);
    schemas[nombreLista] = {
      type: "object",
      properties: {
        datos: { type: "array", items: referencia(nombreSchema) },
        total: { type: "integer", description: "Total de registros que coinciden con el filtro.", example: 1 },
      },
      required: ["datos", "total"],
    };
    schemas[nombreRespuesta] = {
      type: "object",
      properties: { dato: referencia(nombreSchema) },
      required: ["dato"],
    };

    const baseRuta = "/api/" + spec.nombre + "/" + recurso.nombre;
    const comun = { tags: [tag], "x-recurso": recurso.nombre };

    paths[baseRuta] = {
      get: {
        ...comun,
        operationId: "listar-" + spec.nombre + "-" + recurso.nombre,
        summary: "Listar " + recurso.titulo,
        description: "Devuelve los registros de " + recurso.titulo.toLowerCase() + ". " + (spec.soloLectura ? "La API es de solo lectura." : "No modifica nada."),
        parameters: parametrosListado(),
        ...(security("GET") ? { security: security("GET") } : {}),
        responses: {
          200: {
            description: "Lista de registros.",
            content: { "application/json": { schema: referencia(nombreLista) } },
          },
          ...(spec.auth && spec.auth.modo === "todo" ? { 401: respuestaError("Falta el token o no es correcto.") } : {}),
          404: respuestaError("La API no existe."),
        },
      },
    };

    if (!spec.soloLectura) {
      paths[baseRuta].post = {
        ...comun,
        operationId: "crear-" + spec.nombre + "-" + recurso.nombre,
        summary: "Crear " + recurso.titulo,
        description: "Crea un registro. Los campos obligatorios se validan antes de guardar.",
        ...(security("POST") ? { security: security("POST") } : {}),
        requestBody: {
          required: true,
          description: "Datos del nuevo registro.",
          content: {
            "application/json": {
              schema: referencia(nombreEntrada),
              example: ejemploObjeto(recurso),
            },
          },
        },
        responses: {
          201: {
            description: "Registro creado.",
            content: { "application/json": { schema: referencia(nombreRespuesta) } },
          },
          400: respuestaError("Los datos no cumplen las reglas del plano."),
          ...(spec.auth ? { 401: respuestaError("Falta el token o no es correcto.") } : {}),
          409: respuestaError("Se alcanzó el límite de registros o hubo un choque al guardar."),
          413: respuestaError("La API alcanzó su límite de tamaño."),
          503: respuestaError("Falta configurar el almacenamiento (GITHUB_PAT)."),
        },
      };
    }

    paths[baseRuta + "/{id}"] = {
      get: {
        ...comun,
        operationId: "obtener-" + spec.nombre + "-" + recurso.nombre,
        summary: "Consultar un registro de " + recurso.titulo,
        parameters: [parametroId(recurso)],
        ...(security("GET") ? { security: security("GET") } : {}),
        responses: {
          200: {
            description: "Registro encontrado.",
            content: { "application/json": { schema: referencia(nombreRespuesta) } },
          },
          ...(spec.auth && spec.auth.modo === "todo" ? { 401: respuestaError("Falta el token o no es correcto.") } : {}),
          404: respuestaError("No existe ese registro."),
        },
      },
    };

    if (!spec.soloLectura) {
      paths[baseRuta + "/{id}"].put = {
        ...comun,
        operationId: "actualizar-" + spec.nombre + "-" + recurso.nombre,
        summary: "Actualizar un registro de " + recurso.titulo,
        description: "Actualiza solo los campos enviados; el resto se conserva.",
        parameters: [parametroId(recurso)],
        ...(security("PUT") ? { security: security("PUT") } : {}),
        requestBody: {
          required: true,
          description: "Campos que cambian.",
          content: {
            "application/json": {
              schema: referencia(nombreParcial),
              example: ejemploObjeto(recurso),
            },
          },
        },
        responses: {
          200: {
            description: "Registro actualizado.",
            content: { "application/json": { schema: referencia(nombreRespuesta) } },
          },
          400: respuestaError("Los datos no cumplen las reglas del plano."),
          ...(spec.auth ? { 401: respuestaError("Falta el token o no es correcto.") } : {}),
          404: respuestaError("No existe ese registro."),
          413: respuestaError("La API alcanzó su límite de tamaño."),
        },
      };
      paths[baseRuta + "/{id}"].delete = {
        ...comun,
        operationId: "borrar-" + spec.nombre + "-" + recurso.nombre,
        summary: "Borrar un registro de " + recurso.titulo,
        parameters: [parametroId(recurso)],
        ...(security("DELETE") ? { security: security("DELETE") } : {}),
        responses: {
          200: {
            description: "Registro borrado.",
            content: { "application/json": { schema: referencia(nombreRespuesta) } },
          },
          ...(spec.auth ? { 401: respuestaError("Falta el token o no es correcto.") } : {}),
          404: respuestaError("No existe ese registro."),
        },
      };
    }
  }

  const documento = {
    openapi: "3.0.3",
    info: {
      title: spec.titulo || spec.nombre || "API",
      version: "1.0.0",
      description: descripcionInfo(spec, limites),
      license: { name: "MIT" },
    },
    servers: [{ url: base || "/", description: base ? "Servidor de este taller" : "Mismo servidor" }],
    tags,
    paths,
    components: {
      schemas,
      ...(spec.auth
        ? {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "Token de la API",
                description: "Envía «Authorization: Bearer <token>».",
              },
              apiToken: {
                type: "apiKey",
                in: "header",
                name: "X-API-Token",
                description: "Envía el token en la cabecera X-API-Token.",
              },
            },
          }
        : {}),
    },
    "x-taller": {
      nombre: spec.nombre || "",
      motor: spec.motor || "incluido",
      soloLectura: Boolean(spec.soloLectura),
      autenticacion: spec.auth
        ? {
            tipo: "token",
            modo: spec.auth.modo === "todo" ? "todo" : "escritura",
            cabeceras: ["Authorization: Bearer <token>", "X-API-Token: <token>"],
            nota: "El token se creó en el navegador. El plano solo guarda su huella SHA-256.",
          }
        : null,
      limites,
      documentacion: "/docs?api=" + encodeURIComponent(spec.nombre || ""),
      manifiesto: "/api/" + (spec.nombre || ""),
    },
  };

  // Si la API es solo lectura, dejamos constancia explícita en el documento.
  if (spec.soloLectura) documento["x-taller"].nota = "Modo solo lectura: no se publican rutas de escritura.";
  if (protectedAll) documento["x-taller"].autenticacion.protege = "lectura y escritura";

  return documento;
}

/** URL absoluta del OpenAPI a partir de la petición, para Swagger Editor. */
function baseDe(req) {
  const cabeceras = (req && req.headers) || {};
  const hostBruto = cabeceras["x-forwarded-host"] || cabeceras.host || "";
  const host = Array.isArray(hostBruto) ? hostBruto[0] : String(hostBruto).split(",")[0].trim();
  if (!host || !/^[a-zA-Z0-9.\-:\[\]]+$/.test(host)) return "";
  const protocoloBruto = cabeceras["x-forwarded-proto"] || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const protocolo = Array.isArray(protocoloBruto) ? protocoloBruto[0] : String(protocoloBruto).split(",")[0].trim();
  return (protocolo === "http" ? "http" : "https") + "://" + host;
}

module.exports = { generar, baseDe };
