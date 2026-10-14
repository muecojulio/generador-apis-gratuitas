// @ts-nocheck
/**
 * Lector puro: convierte una descripción en un plano JSON.
 * No ejecuta código de nadie. Lo usan el navegador y GitHub Actions.
 */

const TIPOS = ["texto", "numero", "entero", "booleano", "email", "fecha"];
const RESERVADOS_CAMPO = new Set(["id", "creado", "actualizado"]);
const RESERVADOS_API = new Set([
  "generar",
  "listar",
  "salud",
  "lib",
  "scripts",
  "specs",
  "data",
  "api",
  "assets",
  "public",
  "static",
]);

/**
 * @param {unknown} valor
 * @returns {string}
 */
export function slug(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
export function slugValido(valor) {
  const nombre = String(valor ?? "");
  return (
    nombre.length >= 2 &&
    nombre.length <= 48 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nombre) &&
    !RESERVADOS_API.has(nombre)
  );
}

/**
 * @param {string} texto
 * @returns {string}
 */
export function huella(texto) {
  let h = 2166136261;
  const s = String(texto || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * @param {string} texto
 * @returns {string}
 */
export function proponerNombre(texto) {
  const primera = String(texto || "")
    .split("\n")
    .map((linea) => linea.trim())
    .find(Boolean);
  const base = slug(String(primera || "mi-api").split(/[:.(]/)[0]);
  return slugValido(base) ? base : "mi-api";
}

/**
 * @param {string} texto
 * @returns {string}
 */
function capitalizar(texto) {
  const limpio = String(texto || "").trim();
  if (!limpio) return "API";
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * @param {string} detalle
 * @param {string} nombre
 * @returns {"texto"|"numero"|"entero"|"booleano"|"email"|"fecha"}
 */
function tipoDe(detalle, nombre) {
  const f = `${detalle} ${nombre}`.toLowerCase();
  if (/e-?mail|correo/.test(f)) return "email";
  if (/\bfecha\b|calendario|\bdate\b/.test(f)) return "fecha";
  if (/s[ií]\s*o\s*no|booleano|boolean|verdadero|falso/.test(f)) return "booleano";
  if (nombre === "activo" || nombre === "hecha" || nombre === "publicado") return "booleano";
  if (/entero|\binteger\b|existencias|\bstock\b/.test(f)) return "entero";
  if (/n[uú]mero|\bnumero\b|precio|monto|decimal|importe|costo/.test(f)) return "numero";
  return "texto";
}

/**
 * @param {string} texto
 * @returns {string[]}
 */
function partirLista(texto) {
  const limpio = texto
    .replace(/^[-*•]\s+/, "")
    .replace(/^(?:con\s+)?campos?\s*[:.]?\s*/i, "")
    .trim();
  /** @type {string[]} */
  const partes = [];
  let actual = "";
  let nivel = 0;
  for (const ch of limpio) {
    if (ch === "(") nivel += 1;
    if (ch === ")") nivel = Math.max(0, nivel - 1);
    if (ch === "," && nivel === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += ch;
  }
  if (actual.trim()) partes.push(actual);
  /** @type {string[]} */
  const fin = [];
  for (const parte of partes) {
    if (parte.includes("(")) fin.push(parte);
    else fin.push(...parte.split(/\s+y\s+/i));
  }
  return fin.map((parte) => parte.trim()).filter(Boolean);
}

/**
 * @param {string} fragmento
 * @returns {{nombre:string,tipo:string,requerido:boolean,min?:number,max?:number}|null}
 */
function leerCampo(fragmento) {
  const pieza = fragmento.replace(/^[-*•]\s+/, "").trim();
  const coincidencia = pieza.match(
    /^["'«]?([a-záéíóúüñA-ZÁÉÍÓÚÜÑ_][a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9 _.-]{0,40}?)["'»]?\s*(?:\(([^)]*)\)|[:\-]\s*(.+))?$/
  );
  if (!coincidencia) return null;
  const nombre = slug(coincidencia[1]);
  if (!nombre || RESERVADOS_CAMPO.has(nombre)) return null;
  const detalle = `${coincidencia[2] || ""} ${coincidencia[3] || ""}`;
  const tipo = tipoDe(`${detalle} ${pieza}`, nombre);
  const campo = {
    nombre,
    tipo,
    requerido: /obligat|requerid|required|necesari/i.test(detalle),
  };
  const maximo = detalle.match(/m[aá]x(?:imo)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  const minimo = detalle.match(/m[ií]n(?:imo)?\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  if (maximo) campo.max = Number(maximo[1].replace(",", "."));
  if (minimo) campo.min = Number(minimo[1].replace(",", "."));
  if (
    campo.min == null &&
    /no\s+puede\s+ser\s+negativ|mayor\s+o\s+igual\s+a\s+0|positivo/i.test(detalle) &&
    (tipo === "numero" || tipo === "entero")
  ) {
    campo.min = 0;
  }
  return campo;
}

/**
 * @param {string} texto
 * @param {{nombre:string,titulo:string,campos:Array<{nombre:string,tipo:string,requerido:boolean,min?:number,max?:number}>}} recurso
 */
function absorberCampos(texto, recurso) {
  for (const parte of partirLista(texto)) {
    const campo = leerCampo(parte);
    if (!campo) continue;
    if (recurso.campos.some((existente) => existente.nombre === campo.nombre)) continue;
    recurso.campos.push(campo);
  }
}

/**
 * @param {unknown} entrada
 * @param {string} nombreForzado
 * @param {string} motorNombre
 */
export function normalizar(entrada, nombreForzado, motorNombre) {
  const bruto = entrada && typeof entrada === "object" ? /** @type {Record<string, unknown>} */ (entrada) : {};
  const nombre = slug(nombreForzado);
  const lista = Array.isArray(bruto.recursos)
    ? bruto.recursos
    : Array.isArray(bruto.resources)
      ? bruto.resources
      : Array.isArray(bruto.tablas)
        ? bruto.tablas
        : [];

  /** @type {Array<{nombre:string,titulo:string,campos:object[]}>} */
  const recursos = [];
  const usados = new Set();

  for (const item of lista.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const origen = /** @type {Record<string, unknown>} */ (item);
    let nombreRecurso = slug(origen.nombre || origen.name || origen.tabla || "");
    if (!nombreRecurso) continue;
    if (usados.has(nombreRecurso)) nombreRecurso = `${nombreRecurso}-2`.slice(0, 40);
    if (usados.has(nombreRecurso)) continue;
    usados.add(nombreRecurso);

    const crudos = Array.isArray(origen.campos)
      ? origen.campos
      : Array.isArray(origen.fields)
        ? origen.fields
        : [];
    /** @type {object[]} */
    const campos = [];
    const camposUsados = new Set();
    for (const campo of crudos.slice(0, 16)) {
      if (!campo || typeof campo !== "object") continue;
      const c = /** @type {Record<string, unknown>} */ (campo);
      const nombreCampo = slug(c.nombre || c.name || "");
      if (!nombreCampo || RESERVADOS_CAMPO.has(nombreCampo) || camposUsados.has(nombreCampo)) continue;
      camposUsados.add(nombreCampo);
      const tipoTexto = String(c.tipo || c.type || "texto").toLowerCase();
      const tipo = TIPOS.includes(tipoTexto) ? tipoTexto : "texto";
      /** @type {{nombre:string,tipo:string,requerido:boolean,min?:number,max?:number,valores?:string[]}} */
      const limpio = {
        nombre: nombreCampo,
        tipo,
        requerido: Boolean(c.requerido ?? c.required ?? c.obligatorio),
      };
      if (typeof c.min === "number" && Number.isFinite(c.min)) limpio.min = c.min;
      if (typeof c.max === "number" && Number.isFinite(c.max)) limpio.max = c.max;
      if (Array.isArray(c.valores)) {
        const valores = c.valores.map((v) => String(v).slice(0, 40)).filter(Boolean).slice(0, 12);
        if (valores.length) limpio.valores = valores;
      }
      if (tipo === "texto" && limpio.max == null) limpio.max = 500;
      if (tipo === "email" && limpio.max == null) limpio.max = 160;
      if ((tipo === "texto" || tipo === "email") && limpio.min != null) {
        limpio.min = Math.max(0, Math.trunc(limpio.min));
      }
      campos.push(limpio);
    }
    if (!campos.length) {
      campos.push({ nombre: "titulo", tipo: "texto", requerido: true, min: 1, max: 120 });
    }
    recursos.push({
      nombre: nombreRecurso,
      titulo: capitalizar(String(origen.titulo || origen.title || nombreRecurso).slice(0, 60)),
      campos,
    });
    if (recursos.length === 6) break;
  }

  if (!recursos.length) {
    recursos.push({
      nombre: "registros",
      titulo: "Registros",
      campos: [
        { nombre: "titulo", tipo: "texto", requerido: true, min: 1, max: 120 },
        { nombre: "detalle", tipo: "texto", requerido: false, max: 2000 },
      ],
    });
  }

  return {
    nombre,
    titulo: capitalizar(String(bruto.titulo || nombre.replace(/-/g, " ")).slice(0, 80)),
    resumen: String(bruto.resumen || bruto.summary || "").replace(/\s+/g, " ").trim().slice(0, 280),
    soloLectura: Boolean(bruto.soloLectura || bruto.solo_lectura),
    motor: motorNombre === "gemini" ? "gemini" : "analizador",
    recursos,
  };
}

/**
 * @param {string} descripcion
 * @param {string} nombre
 */
export function analizar(descripcion, nombre) {
  const texto = String(descripcion || "").replace(/\r/g, "");
  /** @type {Array<{nombre:string,titulo:string,campos:any[]}>} */
  const recursos = [];
  /** @type {{nombre:string,titulo:string,campos:any[]}|null} */
  let actual = null;

  const cerrar = () => {
    if (actual && actual.campos.length) recursos.push(actual);
    actual = null;
  };
  const asegurar = () => {
    if (!actual) actual = { nombre: "registros", titulo: "Registros", campos: [] };
    return actual;
  };

  for (const bruta of texto.split("\n")) {
    const linea = bruta.trim();
    if (!linea) continue;
    const enc = linea.match(
      /^(?:tabla|recurso|entidad|colecci[oó]n|lista)\s+["'«]?(.+)$/i
    );
    if (enc) {
      cerrar();
      const cuerpo = String(enc[1] || "").replace(/["'»]+$/g, "").trim();
      const corte = cuerpo.split(/\s+con\b\s*|\s*:\s*/i);
      const titulo = String(corte[0] || "")
        .trim()
        .replace(/[.:;]+$/, "");
      actual = {
        nombre: slug(titulo) || "registros",
        titulo: capitalizar(titulo),
        campos: [],
      };
      const resto = cuerpo.slice(titulo.length).replace(/^[\s:.-]+/, "");
      if (resto) absorberCampos(resto, actual);
      continue;
    }
    if (/^[-*•]\s+/.test(linea) || /campos?\b/i.test(linea)) {
      absorberCampos(linea, asegurar());
    }
  }
  cerrar();

  if (/no puede ser negativo|no pueden ser negativos/i.test(texto)) {
    for (const recurso of recursos) {
      for (const campo of recurso.campos) {
        if (campo.min == null && (campo.nombre === "precio" || campo.nombre === "monto" || campo.nombre === "costo")) {
          campo.min = 0;
        }
      }
    }
  }

  const soloLectura = /s[oó]lo\s+lectura|solo\s+consultar|sin\s+(escritura|borrar|crear|actualizar)/i.test(texto);
  const plano = normalizar(
    {
      titulo: capitalizar(String(nombre || "").replace(/-/g, " ")),
      resumen: texto.replace(/\s+/g, " ").trim().slice(0, 280),
      soloLectura,
      recursos,
    },
    nombre,
    "analizador"
  );
  return { ...plano, huella: huella(texto) };
}
