// @ts-nocheck
/**
 * El lector: convierte una descripción en un plano (tablas, campos y reglas).
 *
 * Es determinista y no ejecuta nada de nadie: solo texto -> datos. Lo usan el
 * navegador (para la vista previa) y GitHub Actions (cuando no hay ningún modelo
 * de IA disponible). Nunca escribe código.
 */

const TIPOS = ["texto", "numero", "entero", "booleano", "email", "fecha"];
const RESERVADOS_CAMPO = new Set(["id", "creado", "actualizado"]);
const RESERVADOS_API = new Set([
  "generar",
  "listar",
  "estado",
  "salud",
  "spec",
  "specs",
  "index",
  "lib",
  "scripts",
  "data",
  "api",
  "assets",
  "public",
  "static",
]);

/** Palabras que nunca son el nombre de un campo. */
const PALABRAS_VACIAS =
  /^(?:quiero|necesito|puedo|podr[ií]a|debe|deben|deber[ií]a|listar|crear|actualizar|borrar|eliminar|consultar|ver|obtener|agregar|a[ñn]adir|editar|modificar|guardar|buscar|filtrar|ordenar|paginar|subir|descargar|mostrar|todas|todos|toda|todo|cada|adem[áa]s|tambi[ée]n|con|sin|para|por|que|como|c[oó]mo|cuando|donde|el|la|los|las|un|una|unos|unas|del|de|al|en|es|son|se|su|sus|y|o|u|si|no|m[áa]s|menos|ejemplo|dato|datos|registro|registros)\b/i;

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
 * Propone un nombre de ruta a partir de la descripción.
 * "Tabla productos con campos:" -> "productos"
 * @param {string} texto
 * @returns {string}
 */
export function proponerNombre(texto) {
  const primera =
    String(texto || "")
      .split("\n")
      .map((linea) => linea.trim())
      .find(Boolean) || "";
  let base = primera;
  const porApi = base.match(/\bapi\s+(?:de|del|para|sobre)\s+([a-záéíóúüñ][\wáéíóúüñ-]{2,24})/i);
  if (porApi) {
    base = porApi[1];
  } else {
    base = base
      .replace(/^(?:quiero|necesito|hazme|crea|crear|dame)\b/i, "")
      .replace(/^(?:una?|la|el|mi)\s+/i, "")
      .replace(
        /^(?:api|tabla|tablas|recurso|entidad|colecci[oó]n|lista|listado|base\s+de\s+datos)\s+(?:de\s+|del\s+|para\s+|sobre\s+)?/i,
        ""
      )
      .split(/\s+con\s+(?:los\s+|sus\s+)?campos?|[:.(,]/i)[0];
  }
  const limpio = slug(base);
  return slugValido(limpio) ? limpio : "mi-api";
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
  if (/\bfecha\b|calendario|\bdate\b|nacimiento/.test(f)) return "fecha";
  if (/s[ií]\s*o\s*no|booleano|boolean|verdadero|falso|\bbool\b/.test(f)) return "booleano";
  if (/^(activo|activa|hecha|hecho|publicado|publicada|visible|completado|completada|pagado|pagada)$/.test(nombre)) {
    return "booleano";
  }
  if (/entero|integer|existencias|stock|cantidad|unidades|prioridad|edad|a[ñn]os?|d[ií]as?|plazos?/.test(f)) return "entero";
  if (/n[uú]mero|numero|precio|monto|importe|costo|coste|total|salario|sueldo|peso|altura|nota|calificaci[oó]n|descuento|porcentaje|decimal/.test(f)) {
    return "numero";
  }
  return "texto";
}

/**
 * Parte el texto en frases cortas: por saltos de línea, viñetas y puntos
 * seguidos de mayúscula. Así una descripción en un solo párrafo también se entiende.
 * @param {string} texto
 * @returns {string[]}
 */
function partirEnFrases(texto) {
  const limpio = String(texto || "").replace(/\r/g, "").replace(/[•·]\s*/g, "\n");
  const frases = [];
  let actual = "";
  for (let i = 0; i < limpio.length; i += 1) {
    const ch = limpio[i];
    if (ch === "\n" || ch === ";") {
      if (actual.trim()) frases.push(actual.trim());
      actual = "";
      continue;
    }
    actual += ch;
    if (ch === "." || ch === "!" || ch === "?") {
      const siguiente = limpio.slice(i + 1).match(/^\s+(\S)/);
      if (!siguiente || /[A-ZÁÉÍÓÚÑ«"']/.test(siguiente[1])) {
        if (actual.trim()) frases.push(actual.trim());
        actual = "";
      }
    }
  }
  if (actual.trim()) frases.push(actual.trim());
  return frases.filter((frase) => frase.length > 1);
}

/**
 * Separa una lista de campos: comas, " y ", " e " y puntos y coma,
 * respetando lo que va dentro de paréntesis.
 * @param {string} texto
 * @returns {string[]}
 */
function partirLista(texto) {
  let limpio = String(texto || "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^.{0,80}?\bcampos?\b\s*[:.]?\s*/i, "")
    .replace(/^.{0,60}?\bcon\s+(?=[a-záéíóúüñ][\wáéíóúüñ -]{1,30}\s*(?:\(|,|\s+y\s))/i, "")
    .replace(/\s*\.\s*$/, "")
    .trim();

  const partes = [];
  let actual = "";
  let nivel = 0;
  for (let i = 0; i < limpio.length; i += 1) {
    const ch = limpio[i];
    if (ch === "(" || ch === "[") nivel += 1;
    if (ch === ")" || ch === "]") nivel = Math.max(0, nivel - 1);
    const resto = limpio.slice(i);
    const separador = nivel === 0 && (ch === "," || ch === ";" || /^\s+(?:y|e)\s+/i.test(resto));
    if (separador) {
      partes.push(actual);
      actual = "";
      if (ch === "," || ch === ";") continue;
      i += resto.match(/^\s+(?:y|e)\s+/i)[0].length - 1;
      continue;
    }
    actual += ch;
  }
  if (actual.trim()) partes.push(actual);
  return partes.map((parte) => parte.trim()).filter(Boolean);
}

/**
 * Lee un campo suelto: "precio (número, obligatorio, mínimo 0)" o "nombre: texto".
 * @param {string} fragmento
 * @returns {{nombre:string,tipo:string,requerido:boolean,min?:number,max?:number}|null}
 */
function leerCampo(fragmento) {
  let pieza = String(fragmento || "").replace(/^\s*[-*•]\s+/, "").trim();
  if (!pieza) return null;

  let detalle = "";
  const parentesis = pieza.match(/\(([^)]*)\)/);
  if (parentesis) {
    detalle = parentesis[1];
    pieza = (pieza.slice(0, parentesis.index) + " " + pieza.slice(parentesis.index + parentesis[0].length)).trim();
  }
  pieza = pieza.replace(/\([^)]*\)/g, " ");
  const corte = pieza.match(/^([^:]{1,44}?)\s*:\s*(.+)$/);
  if (corte) {
    pieza = corte[1];
    detalle += " " + corte[2];
  }

  const crudo = pieza.replace(/^["'«[\]]+|["'»[\]]+$/g, "").replace(/[.\s]+$/, "").trim();
  if (!crudo) return null;
  const palabras = crudo.split(/\s+/).filter(Boolean);
  if (palabras.length > 3 && !detalle) return null;
  if (palabras.length > 1 && PALABRAS_VACIAS.test(palabras[0])) return null;
  if (PALABRAS_VACIAS.test(crudo) && palabras.length <= 1) return null;

  const nombre = slug(crudo);
  if (!nombre || nombre.length < 2 || nombre.length > 40) return null;
  if (RESERVADOS_CAMPO.has(nombre)) return null;

  const tipo = tipoDe(detalle, nombre);
  const campo = {
    nombre,
    tipo,
    requerido: /obligat|requerid|required|necesari|imprescindib/i.test(detalle),
  };
  const maximo = detalle.match(/m[aá]x(?:imo)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  const minimo = detalle.match(/m[ií]n(?:imo)?\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
  if (maximo) campo.max = Number(maximo[1].replace(",", "."));
  if (minimo) campo.min = Number(minimo[1].replace(",", "."));
  if (campo.min == null && (tipo === "numero" || tipo === "entero") && /no\s+puede\s+ser\s+negativ|positiv/i.test(detalle)) {
    campo.min = 0;
  }
  return campo;
}

/**
 * @param {string} texto
 * @param {{nombre:string,titulo:string,campos:object[]}} recurso
 */
function absorberCampos(texto, recurso) {
  const frases = String(texto)
    .split(/[.!?]\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((frase) => frase.replace(/^(?:y|e|adem[áa]s|tambi[ée]n)\s+/i, ""));
  for (const frase of frases) {
    const conLista = /\(|\bcampos?\b|,|\s(?:y|e)\s/i.test(frase);
    const esDeseo = /\b(quiero|necesito|podr[ií]a|deber[ií]a|debe(?:n)?|permite|haz(?:me)?|que\s+se\s+pueda|los\s+usuarios)\b/i.test(frase);
    if (esDeseo && !conLista) continue;
    for (const parte of partirLista(frase)) {
      const campo = leerCampo(parte);
      if (!campo) continue;
      if (recurso.campos.some((existente) => existente.nombre === campo.nombre)) continue;
      recurso.campos.push(campo);
      if (recurso.campos.length >= 12) return;
    }
  }
}

/**
 * Reconoce el inicio de una tabla dentro de una frase.
 * @param {string} frase
 * @returns {{titulo:string,nombre:string,cola:string}|null}
 */
function leerCabecera(frase) {
  const m = String(frase).match(
    /^(?:las?\s+|los?\s+|el\s+|una?\s+)?(?:tablas?|recursos?|entidades?|colecciones?|listados?|listas?)\s+(.+)$/i
  );
  if (!m) return null;
  let resto = m[1].trim().replace(/^["'«]+/, "").replace(/^(?:de|del|de\s+la|de\s+los)\s+/i, "");
  const conCampos = resto.match(
    /^(.*?)\s*(?:con\s+(?:los\s+|sus\s+)?campos?|campos?)\s*:?\s*(.*)$/i
  );
  const conDosPuntos = resto.match(/^([^:]{1,60}?)\s*:\s*(.*)$/);
  let titulo = resto;
  let cola = "";
  if (conCampos) {
    titulo = conCampos[1];
    cola = conCampos[2] || "";
  } else if (conDosPuntos) {
    titulo = conDosPuntos[1];
    cola = conDosPuntos[2] || "";
  }
  titulo = titulo.replace(/["'«»]/g, "").replace(/[.:;]+$/, "").trim();
  if (!titulo || titulo.length > 60) return null;
  const nombre = slug(titulo);
  if (!nombre) return null;
  return { titulo: capitalizar(titulo), nombre, cola: String(cola || "").replace(/^[-:.\s]+/, "") };
}

/**
 * ¿La frase trae una lista de campos? Acepta viñetas, "(tipo)", la palabra
 * "campos" o un "con nombre, precio y stock" dentro de una frase corriente.
 * @param {string} frase
 * @returns {boolean}
 */
function pareceListaDeCampos(frase) {
  if (/^\s*[-*•]/.test(frase)) return true;
  if (/\bcampos?\b/i.test(frase)) return true;
  if (/\([^)]*\)/.test(frase)) return true;
  const con = String(frase).match(/\bcon\s+(.+)$/i);
  if (con && /,|\s(?:y|e)\s/i.test(con[1])) {
    const primeraPalabra = con[1].split(/\s+/)[0] || "";
    if (!PALABRAS_VACIAS.test(primeraPalabra)) return true;
  }
  return false;
}

/**
 * Reglas sueltas escritas en lenguaje natural.
 * @param {string} texto
 * @param {Array<{campos:object[]}>} recursos
 */
function aplicarReglas(texto, recursos) {
  const sinNegativos = /no\s+puede(?:n)?\s+ser\s+negativ|mayor\s+o\s+igual\s+a\s+0|no\s+acepta\s+negativ/i.test(texto);
  const NUMERICOS = ["precio", "monto", "importe", "costo", "coste", "total", "salario", "sueldo", "cantidad", "stock", "existencias", "peso", "descuento"];
  const vacios = [...texto.matchAll(/([a-záéíóúüñ][\wáéíóúüñ-]{1,24})\s+no\s+puede(?:n)?\s+(?:estar\s+)?(?:vac[ií]o|vac[ií]a|en\s+blanco)/gi)].map(
    (m) => slug(m[1])
  );
  const obligatorios = [...texto.matchAll(/([a-záéíóúüñ][\wáéíóúüñ-]{1,24})\s+(?:es|son)\s+obligatori/gi)].map((m) => slug(m[1]));
  for (const recurso of recursos) {
    for (const campo of recurso.campos) {
      if (sinNegativos && NUMERICOS.includes(campo.nombre) && campo.min == null) campo.min = 0;
      if (vacios.includes(campo.nombre) || obligatorios.includes(campo.nombre)) campo.requerido = true;
    }
  }
}

/**
 * Normaliza cualquier plano (de la IA, de un archivo o del lector) a la forma
 * que usa el taller. Aquí se cortan los excesos: 6 recursos y 12 campos.
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
    motor: String(motorNombre || "incluido").slice(0, 24),
    recursos,
  };
}

/**
 * Lee una descripción en español y arma el plano. Sin claves y sin internet.
 * @param {string} descripcion
 * @param {string} nombre
 */
export function analizar(descripcion, nombre) {
  const texto = String(descripcion || "").replace(/\r/g, "");
  const frases = partirEnFrases(texto);
  /** @type {Array<{nombre:string,titulo:string,campos:any[]}>} */
  const recursos = [];
  /** @type {{nombre:string,titulo:string,campos:any[]}|null} */
  let actual = null;

  // ¿La descripción empieza hablando de una cosa? "Una API de recetas con ..."
  const sugerencia = texto.match(/\bapi\s+(?:de|del|para|sobre|que\s+guarde)\s+([a-záéíóúüñ][\wáéíóúüñ]{2,20})/i);

  const asegurar = () => {
    if (!actual) {
      const titulo = sugerencia ? sugerencia[1] : nombre.replace(/-/g, " ");
      actual = { nombre: slug(titulo) || "registros", titulo: capitalizar(titulo), campos: [] };
      recursos.push(actual);
    }
    return actual;
  };

  for (const frase of frases) {
    const cabecera = leerCabecera(frase);
    if (cabecera) {
      actual = { nombre: cabecera.nombre, titulo: cabecera.titulo, campos: [] };
      recursos.push(actual);
      if (cabecera.cola) absorberCampos(cabecera.cola, actual);
      continue;
    }
    if (pareceListaDeCampos(frase)) {
      absorberCampos(frase, asegurar());
    }
  }

  // Si una tabla se quedó sin campos, le damos dos útiles.
  for (const recurso of recursos) {
    if (!recurso.campos.length) {
      recurso.campos.push(
        { nombre: "titulo", tipo: "texto", requerido: true, min: 1, max: 120 },
        { nombre: "detalle", tipo: "texto", requerido: false, max: 2000 }
      );
    }
  }

  aplicarReglas(texto, recursos);

  const soloLectura = /s[oó]lo\s+lectura|solo\s+consultar|sin\s+(escritura|borrar|crear|actualizar)/i.test(texto);
  const plano = normalizar(
    {
      titulo: capitalizar(String(nombre || "").replace(/-/g, " ")),
      resumen: texto.replace(/\s+/g, " ").trim().slice(0, 280),
      soloLectura,
      recursos,
    },
    nombre,
    "incluido"
  );
  return { ...plano, huella: huella(texto) };
}
