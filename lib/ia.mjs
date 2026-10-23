// @ts-nocheck
/**
 * Cadena de modelos de lenguaje GRATIS.
 *
 * Nadie paga nada aquí: no hay OpenAI de pago, no hay tarjeta, no hay facturación.
 * GitHub Models cerró el 30 de julio de 2026, así que el taller prueba primero
 * los servicios públicos que **no piden clave ni registro**, y solo después los
 * que se activan con una variable de entorno (si existe). Esa es la regla:
 *
 *   sin clave primero → con clave como respaldo → lector incluido al final.
 *
 * Orden por defecto (`GENERADOR_ESTRATEGIA=gratis`):
 *   1. LLM7            sin clave ni registro
 *   2. Kilo Gateway    sin clave (mejor con KILO_API_KEY, pero funciona sin ella)
 *   3. OVHcloud AI     sin clave ni registro (capa anónima)
 *   4. Pollinations    sin clave ni registro
 *   5. Gemini          solo si existe GEMINI_API_KEY
 *   6. GROQ            solo si existe GROQ_API_KEY
 *   7. OpenRouter      solo si existe OPENROUTER_API_KEY (modelos :free)
 *   8. Cerebras        solo si existe CEREBRAS_API_KEY
 *   9. Mistral         solo si existe MISTRAL_API_KEY
 *  10. Together        solo si existe TOGETHER_API_KEY
 *  11. DeepSeek        solo si existe DEEPSEEK_API_KEY
 *  12. Hugging Face    solo si existe HF_TOKEN
 *
 * Si ningún modelo contesta, el taller NO se rompe: scripts/disenar.mjs usa el
 * lector incluido (lib/motor.mjs), que funciona sin internet y sin claves.
 *
 * Variables:
 *   GENERADOR_PROVEEDOR   fuerza un proveedor: gemini, llm7, kilo, ovh,
 *                         pollinations, groq, openrouter, cerebras, mistral,
 *                         together, deepseek, huggingface o incluido.
 *   GENERADOR_ESTRATEGIA  gratis (por defecto), calidad (claves primero),
 *                         sin-clave (solo públicos) o con-clave (solo claves).
 *   GENERADOR_SIN_IA=1    salta la IA por completo y usa solo el lector incluido.
 *
 * Los servicios sin clave aparecen en listas públicas de GitHub (por ejemplo
 * `public-apis/public-apis` y la documentación de cada proyecto). Son gratuitos
 * pero intermitentes: por eso hay varios y por eso la clave es solo un respaldo.
 */

import { normalizar } from "./motor.mjs";

const PROVEEDOR_MS = 10000;
const PROVEEDOR_MS_CLAVE = 16000;
const LIMITE_POR_PROVEEDOR_MS = 18000;
const LIMITE_TOTAL_MS = 120000;

export const SISTEMA = `Eres el arquitecto de un taller de APIs REST gratuitas.
Devuelves ÚNICAMENTE un objeto JSON, sin markdown, sin comentarios y sin código, con esta forma exacta:
{
  "titulo": "nombre corto",
  "resumen": "una frase de lo que hace la API",
  "soloLectura": false,
  "limites": {
    "maxRegistrosPorRecurso": 500,
    "maxBytes": 262144,
    "retencionDias": 0
  },
  "recursos": [
    {
      "nombre": "productos",
      "titulo": "Productos",
      "campos": [
        {"nombre": "precio", "tipo": "numero", "requerido": true, "min": 0, "max": null}
      ]
    }
  ]
}
Reglas:
- tipo solo puede ser: texto, numero, entero, booleano, email, fecha.
- Entre 1 y 6 recursos. Entre 1 y 12 campos por recurso.
- Los nombres de recursos y campos van en minúsculas, sin acentos y sin espacios.
- No incluyas id, creado ni actualizado: el sistema los pone solo.
- Respeta tablas, campos, obligatorios, mínimos, máximos, valores permitidos y si piden solo lectura.
- No inventes recursos que la persona no pidió.
- Si algo es ambiguo, elige la opción más simple y útil.
- Si la persona pide validaciones (por ejemplo "el precio no puede ser negativo"), tradúcelas a min o max.
- Si pide "solo lectura" o "sin crear ni borrar", pon "soloLectura": true.
- Si pide un máximo de registros, un tamaño o una retención de días, refléjalo en "limites".
- No incluyas tokens ni contraseñas: la autenticación se configura aparte.`;

let fetchActual = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

/** Solo para pruebas: sustituye la red por una función falsa. */
export function fijarFetch(fn) {
  fetchActual = fn || null;
}

function recortar(valor, max) {
  const texto = String(valor == null ? "" : valor);
  return texto.length > max ? texto.slice(0, max) + "…" : texto;
}

/** Petición HTTP con reloj propio: nunca se queda colgada. */
async function traer(url, opciones, ms) {
  if (!fetchActual) return { status: 0, texto: "", error: "sin red" };
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ms || PROVEEDOR_MS);
  try {
    const respuesta = await fetchActual(url, { ...opciones, signal: control.signal });
    const texto = await respuesta.text();
    return { status: respuesta.status, texto };
  } catch (error) {
    // `fetch failed` a secas no dice nada: se añade la causa (DNS, TLS, reloj).
    const causa = error && error.cause && (error.cause.code || error.cause.message);
    const mensaje = error && error.message ? error.message : String(error);
    return { status: 0, texto: "", error: recortar(causa ? mensaje + " (" + causa + ")" : mensaje, 140) };
  } finally {
    clearTimeout(reloj);
  }
}

/** Saca el JSON de una respuesta que puede traer texto alrededor, ```json o razonamiento. */
export function extraerJson(texto) {
  let limpio = String(texto || "")
    .replace(/^\uFEFF/, "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*$/gi, "")
    .trim();
  const cercas = limpio.split("```");
  if (cercas.length >= 3) {
    const dentro = cercas[1].replace(/^json/i, "").trim();
    if (dentro.includes("{")) limpio = dentro;
  }
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin < inicio) throw new Error("no devolvió JSON");
  const json = JSON.parse(limpio.slice(inicio, fin + 1));
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("no devolvió un objeto");
  return json;
}

/** Un plano sirve solo si trae al menos un recurso con al menos un campo. */
function revisarPlano(bruto) {
  const lista = Array.isArray(bruto.recursos)
    ? bruto.recursos
    : Array.isArray(bruto.resources)
      ? bruto.resources
      : Array.isArray(bruto.tablas)
        ? bruto.tablas
        : [];
  if (!lista.length) throw new Error("plano sin recursos");
  const conCampos = lista.filter(
    (item) => item && Array.isArray(item.campos || item.fields) && (item.campos || item.fields).length
  );
  if (!conCampos.length) throw new Error("plano sin campos");
  return true;
}

function textoDeMensaje(mensaje) {
  if (!mensaje) return "";
  if (typeof mensaje.content === "string") return mensaje.content;
  if (Array.isArray(mensaje.content)) {
    return mensaje.content.map((parte) => (typeof parte === "string" ? parte : parte && parte.text) || "").join("");
  }
  return "";
}

const INSTRUCCION = (descripcion) =>
  "Diseña el plano de esta API a partir de la descripción de la persona. Responde solo con el JSON.\n\n" +
  "Descripción de la persona:\n\n" +
  descripcion;

/* Proveedores sin clave ni registro --------------------------------------- */

export const SIN_CLAVE = [
  {
    id: "llm7",
    nombre: "LLM7 (sin clave ni registro)",
    url: "https://api.llm7.io/v1/chat/completions",
    catalogo: "https://api.llm7.io/v1/models",
    clave: "unused",
    ms: PROVEEDOR_MS,
    modelos: ["gpt-4o-mini-2024-07-18", "gpt-4o-mini", "gpt-4.1-nano-2025-04-14", "gpt-oss-20b"],
  },
  {
    id: "kilo",
    nombre: "Kilo Gateway (sin clave ni registro)",
    url: "https://api.kilo.ai/api/gateway/chat/completions",
    catalogo: "https://api.kilo.ai/api/gateway/models",
    clave: process.env.KILO_API_KEY || "",
    ms: 8000,
    modelos: ["nvidia/nemotron-3-ultra-550b-a55b:free", "kilo-auto/free"],
  },
  {
    id: "ovh",
    nombre: "OVHcloud AI Endpoints (sin clave ni registro)",
    url: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
    catalogo: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models",
    clave: "",
    ms: PROVEEDOR_MS,
    modelos: ["gpt-oss-120b", "Qwen3-32B", "Mistral-Small-3.2-24B-Instruct-2506"],
  },
  {
    id: "pollinations",
    nombre: "Pollinations (sin clave ni registro)",
    url: "https://text.pollinations.ai/openai",
    catalogo: "",
    clave: "",
    ms: PROVEEDOR_MS,
    modelos: ["openai"],
  },
];

/* Proveedores que se activan con una variable de entorno ------------------ */

export const CON_CLAVE = [
  {
    id: "gemini",
    nombre: "Google Gemini (capa gratuita)",
    variable: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta",
    catalogo: "",
    ms: PROVEEDOR_MS_CLAVE,
    modelos: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
    tipo: "gemini",
  },
  {
    id: "groq",
    nombre: "Groq (capa gratuita)",
    variable: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    catalogo: "https://api.groq.com/openai/v1/models",
    ms: PROVEEDOR_MS_CLAVE,
    modelos: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b"],
  },
  {
    id: "openrouter",
    nombre: "OpenRouter (modelos :free)",
    variable: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/chat/completions",
    catalogo: "https://openrouter.ai/api/v1/models",
    ms: PROVEEDOR_MS_CLAVE,
    soloGratis: true,
    cabeceras: {
      "HTTP-Referer": "https://github.com/muecojulio/generador-apis-gratuitas",
      "X-Title": "Taller de APIs gratuitas",
    },
    modelos: [
      "deepseek/deepseek-chat-v3-0324:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen3-235b-a22b:free",
      "google/gemma-3-27b-it:free",
    ],
  },
  {
    id: "cerebras",
    nombre: "Cerebras (capa gratuita)",
    variable: "CEREBRAS_API_KEY",
    url: "https://api.cerebras.ai/v1/chat/completions",
    catalogo: "https://api.cerebras.ai/v1/models",
    ms: PROVEEDOR_MS_CLAVE,
    modelos: ["llama3.1-8b", "gpt-oss-120b", "qwen-3-32b"],
  },
  {
    id: "mistral",
    nombre: "Mistral AI (capa gratuita)",
    variable: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1/chat/completions",
    catalogo: "https://api.mistral.ai/v1/models",
    ms: PROVEEDOR_MS_CLAVE,
    modelos: ["mistral-small-latest", "open-mistral-nemo"],
  },
  {
    id: "together",
    nombre: "Together AI (modelos gratuitos)",
    variable: "TOGETHER_API_KEY",
    url: "https://api.together.xyz/v1/chat/completions",
    catalogo: "https://api.together.xyz/v1/models",
    ms: PROVEEDOR_MS_CLAVE,
    soloGratis: true,
    modelos: ["meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", "meta-llama/Llama-Vision-Free"],
  },
  {
    id: "deepseek",
    nombre: "DeepSeek (capa gratuita)",
    variable: "DEEPSEEK_API_KEY",
    url: "https://api.deepseek.com/chat/completions",
    catalogo: "",
    ms: PROVEEDOR_MS_CLAVE,
    modelos: ["deepseek-chat"],
  },
  {
    id: "huggingface",
    nombre: "Hugging Face Inference (capa gratuita)",
    variable: "HF_TOKEN",
    url: "https://router.huggingface.co/v1/chat/completions",
    catalogo: "",
    ms: PROVEEDOR_MS_CLAVE,
    modelos: ["meta-llama/Llama-3.1-8B-Instruct", "Qwen/Qwen2.5-7B-Instruct"],
  },
];

const TODOS = [
  ...SIN_CLAVE.map((proveedor) => ({ ...proveedor, tipo: "sin-clave" })),
  ...CON_CLAVE.map((proveedor) => ({ ...proveedor, tipo: "entorno" })),
];

function configurado(proveedor) {
  if (proveedor.tipo === "sin-clave") return true;
  return Boolean(proveedor.variable && process.env[proveedor.variable]);
}

/** Orden efectivo según la estrategia y las claves presentes. */
export function cadenaProveedores() {
  const estrategia = String(process.env.GENERADOR_ESTRATEGIA || "gratis").trim().toLowerCase();
  const claveDisponible = (proveedor) => proveedor.tipo === "entorno" && configurado(proveedor);
  const sinClave = TODOS.filter((proveedor) => proveedor.tipo === "sin-clave");
  const conClave = TODOS.filter(claveDisponible);
  if (estrategia === "sin-clave" || estrategia === "gratis-sin-clave") return sinClave;
  if (estrategia === "con-clave" || estrategia === "solo-clave") return conClave;
  if (estrategia === "calidad" || estrategia === "claves-primero") return [...conClave, ...sinClave];
  return [...sinClave, ...conClave];
}

/** Estado de la cadena, sin hacer ninguna petición de red. */
export function estadoProveedores() {
  const estrategia = String(process.env.GENERADOR_ESTRATEGIA || "gratis").trim().toLowerCase();
  const cadena = cadenaProveedores();
  return {
    estrategia: estrategia || "gratis",
    orden: cadena.map((proveedor) => proveedor.id),
    sinClave: SIN_CLAVE.map((proveedor) => ({
      id: proveedor.id,
      nombre: proveedor.nombre,
      url: proveedor.url,
      modelos: proveedor.modelos,
      listo: true,
    })),
    conClave: CON_CLAVE.map((proveedor) => ({
      id: proveedor.id,
      nombre: proveedor.nombre,
      variable: proveedor.variable,
      configurado: configurado(proveedor),
      modelos: proveedor.modelos,
      listo: configurado(proveedor),
    })),
    sinIA: process.env.GENERADOR_SIN_IA === "1",
    documentacion: "/docs#proveedores",
  };
}

/* Llamadas ---------------------------------------------------------------- */

/** Llamada estilo OpenAI (Kilo, LLM7, OVHcloud, Pollinations y los de clave). */
async function chatCompatible(proveedor, modelo, descripcion, ms) {
  const cabeceras = { "Content-Type": "application/json", ...(proveedor.cabeceras || {}) };
  const clave = proveedor.clave !== undefined ? proveedor.clave : process.env[proveedor.variable];
  if (clave) cabeceras.Authorization = "Bearer " + clave;
  const res = await traer(
    proveedor.url,
    {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify({
        model: modelo,
        temperature: 0.2,
        max_tokens: 2200,
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: INSTRUCCION(descripcion) },
        ],
      }),
    },
    ms || proveedor.ms || PROVEEDOR_MS
  );
  if (res.status !== 200) {
    const detalle = res.error
      ? " (red: " + res.error + ")"
      : res.texto
        ? ": " + recortar(res.texto.replace(/\s+/g, " "), 160)
        : "";
    throw new Error("HTTP " + res.status + detalle);
  }
  let json;
  try {
    json = JSON.parse(res.texto);
  } catch {
    throw new Error("respuesta ilegible");
  }
  const opciones = json.choices || [];
  const texto = textoDeMensaje((opciones[0] || {}).message) || recortar(json.output_text || "", 20000);
  if (!texto.trim()) throw new Error("respuesta vacía");
  return texto;
}

/** Llamada a Google Gemini (capa gratuita). */
async function chatGemini(modelo, descripcion, conPensamientoCero) {
  const res = await traer(
    "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SISTEMA }] },
        contents: [{ role: "user", parts: [{ text: INSTRUCCION(descripcion) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2400,
          responseMimeType: "application/json",
          ...(conPensamientoCero ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    },
    PROVEEDOR_MS_CLAVE + 4000
  );
  if (res.status === 404) {
    const error = new Error("modelo no disponible");
    error.saltarModelo = true;
    throw error;
  }
  if (res.status === 400 && !conPensamientoCero) {
    // Algunos modelos rechazan `thinkingConfig`: se reintenta sin él.
    const error = new Error("reintentar sin pensamiento");
    error.reintentar = true;
    throw error;
  }
  if (res.status !== 200) {
    throw new Error("HTTP " + res.status + ": " + recortar(res.texto.replace(/\s+/g, " "), 160));
  }
  let json;
  try {
    json = JSON.parse(res.texto);
  } catch {
    throw new Error("respuesta ilegible");
  }
  if (json.promptFeedback && json.promptFeedback.blockReason) {
    throw new Error("la descripción fue rechazada por el filtro de seguridad");
  }
  const partes = ((((json.candidates || [])[0] || {}).content || {}).parts) || [];
  const texto = partes.map((parte) => parte.text || "").join("").trim();
  if (!texto) throw new Error("respuesta vacía");
  return texto;
}

async function conGemini(descripcion, aviso) {
  if (!process.env.GEMINI_API_KEY) throw new Error("sin GEMINI_API_KEY");
  let ultimo = "ningún modelo de Gemini respondió";
  for (const modelo of CON_CLAVE.find((item) => item.id === "gemini").modelos) {
    for (const silencio of [false, true]) {
      try {
        const texto = await chatGemini(modelo, descripcion, silencio);
        aviso("gemini/" + modelo + " respondió");
        return extraerJson(texto);
      } catch (error) {
        if (error.saltarModelo) break; // ese modelo no existe: pasa al siguiente
        if (error.reintentar) continue; // mismo modelo, sin pensamiento
        ultimo = modelo + ": " + error.message;
      }
    }
  }
  throw new Error(ultimo);
}

const NO_CHAT = /embed|whisper|tts|audio|speech|image|vision|flux|stable|diffus|rerank|moderation|guard|ocr|video|clip|bge|e5-|jina|sdxl|dall/i;

/** Busca un modelo de chat en el catálogo público del proveedor. */
async function descubrirModelo(proveedor, aviso, ms) {
  if (!proveedor.catalogo) return null;
  const cabeceras = {};
  const clave = proveedor.clave !== undefined ? proveedor.clave : process.env[proveedor.variable];
  if (clave) cabeceras.Authorization = "Bearer " + clave;
  const res = await traer(proveedor.catalogo, { headers: cabeceras }, ms || proveedor.ms || PROVEEDOR_MS);
  if (res.status !== 200 || !res.texto) return null;
  let json;
  try {
    json = JSON.parse(res.texto);
  } catch {
    return null;
  }
  const lista = json.data || json.models || [];
  const ids = lista
    .map((item) => (typeof item === "string" ? item : item && (item.id || item.name)))
    .filter((id) => typeof id === "string" && id.length > 1 && !NO_CHAT.test(id))
    .filter((id) => (proveedor.soloGratis ? /:free$|-free$|free$/i.test(id) : true));
  if (!ids.length) return null;
  const preferido =
    ids.find((id) => /instruct|chat|gpt|llama|qwen|mistral|deepseek|glm|gemma|nemotron/i.test(id)) || ids[0];
  aviso(proveedor.id + ": catálogo sugiere " + preferido);
  return preferido;
}

const MODELO_DESCONOCIDO = /HTTP 4(00|04)|does not exist|model_not_found|not a valid model|unknown model/i;

async function conProveedor(proveedor, descripcion, aviso) {
  const errores = [];
  const inicio = Date.now();
  for (const modelo of proveedor.modelos) {
    if (Date.now() - inicio > LIMITE_POR_PROVEEDOR_MS) {
      errores.push("tiempo agotado");
      break;
    }
    try {
      const texto = await chatCompatible(proveedor, modelo, descripcion, proveedor.ms);
      aviso(proveedor.id + "/" + modelo + " respondió");
      return extraerJson(texto);
    } catch (error) {
      errores.push(modelo + ": " + error.message);
      if (MODELO_DESCONOCIDO.test(error.message)) break;
    }
  }
  try {
    const modelo = await descubrirModelo(proveedor, aviso, proveedor.ms);
    if (modelo && !proveedor.modelos.includes(modelo)) {
      const texto = await chatCompatible(proveedor, modelo, descripcion, proveedor.ms);
      aviso(proveedor.id + "/" + modelo + " respondió");
      return extraerJson(texto);
    }
  } catch (error) {
    errores.push("catálogo: " + error.message);
  }
  throw new Error(errores.join(" | ") || "no respondió");
}

/**
 * Pide un plano a la IA gratuita. Devuelve { spec, proveedor } o null si nadie
 * respondió. `spec` ya viene normalizado y validado, listo para escribir en
 * api/<nombre>/spec.json.
 */
export async function pedirPlano({ descripcion, nombre, proveedor, aviso }) {
  const decir = typeof aviso === "function" ? aviso : () => {};
  const pedido = String(proveedor || process.env.GENERADOR_PROVEEDOR || "").trim().toLowerCase();
  // "auto", "gratis" o vacío significan: usa la estrategia configurada.
  const forzado = ["auto", "gratis", "cualquiera"].includes(pedido) ? "" : pedido;
  if (process.env.GENERADOR_SIN_IA === "1" || forzado === "incluido" || forzado === "sin-ia") {
    decir("IA desactivada a propósito: se usa el lector incluido.");
    return null;
  }

  let intentos = cadenaProveedores();
  if (forzado === "sin-clave") intentos = intentos.filter((item) => item.tipo === "sin-clave");
  else if (forzado === "con-clave" || forzado === "solo-clave") intentos = intentos.filter((item) => item.tipo === "entorno");
  else if (forzado) intentos = intentos.filter((item) => item.id === forzado);

  if (!intentos.length) {
    decir("No hay ningún proveedor de IA configurado para «" + (pedido || "auto") + "»: se usa el lector incluido.");
    return null;
  }

  const fin = Date.now() + LIMITE_TOTAL_MS;
  const fallos = [];
  for (const intento of intentos) {
    if (Date.now() > fin) {
      fallos.push("tiempo agotado antes de " + intento.id);
      break;
    }
    try {
      const bruto =
        intento.id === "gemini" ? await conGemini(descripcion, decir) : await conProveedor(intento, descripcion, decir);
      revisarPlano(bruto);
      const spec = normalizar(bruto, nombre, intento.id);
      if (!spec.recursos.length) throw new Error("plano vacío");
      return { spec, proveedor: intento.id };
    } catch (error) {
      const mensaje = intento.id + ": " + (error && error.message ? error.message : error);
      decir("No sirvió " + mensaje);
      fallos.push(mensaje);
    }
  }
  decir("Ningún modelo gratuito respondió. Detalle: " + fallos.join(" | "));
  return null;
}

/* Diagnóstico ------------------------------------------------------------- */

const PRUEBA_SISTEMA = "Responde solo con JSON válido, sin explicaciones.";
const PRUEBA_USUARIO = 'Devuelve exactamente {"ok":true}';

async function probarGemini(proveedor, ms) {
  const modelo = proveedor.modelos[0];
  const res = await traer(
    "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PRUEBA_USUARIO }] }],
        systemInstruction: { parts: [{ text: PRUEBA_SISTEMA }] },
        generationConfig: { maxOutputTokens: 32, temperature: 0, responseMimeType: "application/json" },
      }),
    },
    ms || 6000
  );
  return { estado: res.status, modelo, texto: res.texto };
}

async function probarCompatible(proveedor, ms) {
  const modelo = proveedor.modelos[0];
  const cabeceras = { "Content-Type": "application/json", ...(proveedor.cabeceras || {}) };
  const clave = proveedor.clave !== undefined ? proveedor.clave : process.env[proveedor.variable];
  if (clave) cabeceras.Authorization = "Bearer " + clave;
  const res = await traer(
    proveedor.url,
    {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        max_tokens: 32,
        messages: [
          { role: "system", content: PRUEBA_SISTEMA },
          { role: "user", content: PRUEBA_USUARIO },
        ],
      }),
    },
    ms || 6000
  );
  return { estado: res.status, modelo, texto: res.texto || res.error || "" };
}

/**
 * Prueba real de uno o varios proveedores. No crea APIs ni toca el repositorio.
 * Devuelve una lista con el resultado de cada uno (sin lanzar excepciones).
 */
export async function probarProveedores({ solo } = {}) {
  const estrategia = String(process.env.GENERADOR_ESTRATEGIA || "gratis").toLowerCase();
  const cadena = cadenaProveedores();
  const objetivo = String(solo || "").trim().toLowerCase();
  const lista = objetivo ? cadena.filter((item) => item.id === objetivo) : cadena;
  // En paralelo: probar doce proveedores en serie no cabe en el tiempo de una
  // función de Vercel. Cada uno tiene su propio reloj de 6 s.
  const resultados = await Promise.all(
    lista.map(async (proveedor) => {
      const inicio = Date.now();
      try {
        const salida =
          proveedor.id === "gemini"
            ? await probarGemini(proveedor, 6000)
            : await probarCompatible(proveedor, 6000);
        return {
          id: proveedor.id,
          tipo: proveedor.tipo,
          ok: salida.estado === 200,
          estado: salida.estado,
          modelo: salida.modelo,
          ms: Date.now() - inicio,
          error: salida.estado === 200 ? null : recortar(String(salida.texto || "").replace(/\s+/g, " "), 140),
        };
      } catch (error) {
        return {
          id: proveedor.id,
          tipo: proveedor.tipo,
          ok: false,
          estado: 0,
          modelo: proveedor.modelos[0],
          ms: Date.now() - inicio,
          error: recortar(error && error.message, 140),
        };
      }
    })
  );
  return { estrategia, resultados, hora: new Date().toISOString() };
}

/** Lista de proveedores sin clave, útil para el flujo de prueba y la documentación. */
export function proveedoresSinClave() {
  return SIN_CLAVE.map((item) => ({ id: item.id, nombre: item.nombre, url: item.url, modelos: item.modelos }));
}

/** Todos los proveedores conocidos, para la documentación. */
export function proveedoresConClave() {
  return CON_CLAVE.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    variable: item.variable,
    modelos: item.modelos,
    configurado: configurado({ ...item, tipo: "entorno" }),
  }));
}
