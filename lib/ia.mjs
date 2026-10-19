// @ts-nocheck
/**
 * Cadena de modelos de lenguaje GRATIS.
 *
 * Nadie paga nada aquí: no hay OpenAI de pago, no hay tarjeta, no hay facturación.
 * GitHub Models cerró el 30 de julio de 2026, así que el taller prueba, en este orden:
 *
 *   1. Gemini  -> solo si existe la variable GEMINI_API_KEY (capa gratuita de Google,
 *                 se crea en aistudio.google.com sin tarjeta). Es el mejor plano.
 *   2. Kilo Gateway   -> sin clave y sin registro (modelos ":free").
 *   3. LLM7           -> sin clave ni registro ("Bearer unused").
 *   4. OVHcloud AI    -> sin clave ni registro (capa anónima, pocas peticiones por minuto).
 *   5. Pollinations   -> sin clave ni registro (endpoint clásico de texto).
 *
 * Si ninguno contesta, el taller NO se rompe: scripts/disenar.mjs usa el lector
 * incluido (lib/motor.mjs), que funciona sin internet y sin ninguna clave.
 *
 * Variables opcionales:
 *   GEMINI_API_KEY        clave gratuita de Google AI Studio.
 *   GENERADOR_PROVEEDOR   "gemini" | "llm7" | "kilo" | "ovh" | "pollinations" | "incluido"
 *   GENERADOR_SIN_IA=1    salta la IA por completo y usa solo el lector incluido.
 */

import { normalizar } from "./motor.mjs";

const PROVEEDOR_MS = 15000;
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

function recortar(valor, max) {
  const texto = String(valor == null ? "" : valor);
  return texto.length > max ? texto.slice(0, max) + "…" : texto;
}

/** Petición HTTP con reloj propio: nunca se queda colgada. */
async function traer(url, opciones, ms) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ms || PROVEEDOR_MS);
  try {
    const respuesta = await fetch(url, { ...opciones, signal: control.signal });
    const texto = await respuesta.text();
    return { status: respuesta.status, texto };
  } catch (error) {
    return { status: 0, texto: "", error: recortar(error && error.message ? error.message : error, 140) };
  } finally {
    clearTimeout(reloj);
  }
}

/** Saca el JSON de una respuesta que puede traer texto alrededor, ```json o razonamiento. */
export function extraerJson(texto) {
  let limpio = String(texto || "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .trim();
  const cercas = limpio.split("```");
  if (cercas.length >= 3) limpio = cercas[1].replace(/^json/i, "");
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1 || fin < inicio) throw new Error("no devolvió JSON");
  return JSON.parse(limpio.slice(inicio, fin + 1));
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
  const conCampos = lista.filter((item) => item && Array.isArray(item.campos || item.fields) && (item.campos || item.fields).length);
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

/** Llamada estilo OpenAI (Kilo, LLM7, OVHcloud, Pollinations). */
async function chatCompatible(proveedor, modelo, descripcion, ms) {
  const cabeceras = { "Content-Type": "application/json" };
  const clave = proveedor.clave;
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
    ms || PROVEEDOR_MS
  );
  if (res.status !== 200) {
    const detalle = res.error ? " (red: " + res.error + ")" : res.texto ? ": " + recortar(res.texto.replace(/\s+/g, " "), 160) : "";
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
    PROVEEDOR_MS + 10000
  );
  if (res.status === 404) {
    const error = new Error("modelo no disponible");
    error.saltarModelo = true;
    throw error;
  }
  if (res.status === 400 && !conPensamientoCero) {
    const error = new Error("reintentar sin pensamiento");
    error.saltarModelo = true;
    throw error;
  }
  if (res.status !== 200) throw new Error("HTTP " + res.status + ": " + recortar(res.texto.replace(/\s+/g, " "), 160));
  const json = JSON.parse(res.texto);
  if (json.promptFeedback && json.promptFeedback.blockReason) throw new Error("la descripción fue rechazada por el filtro de seguridad");
  const partes = ((((json.candidates || [])[0] || {}).content || {}).parts) || [];
  const texto = partes.map((parte) => parte.text || "").join("").trim();
  if (!texto) throw new Error("respuesta vacía");
  return texto;
}

const MODELOS_GEMINI = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];

async function conGemini(descripcion, aviso) {
  if (!process.env.GEMINI_API_KEY) throw new Error("sin GEMINI_API_KEY");
  let ultimo = "ningún modelo de Gemini respondió";
  for (const modelo of MODELOS_GEMINI) {
    for (const silencio of [false, true]) {
      try {
        const texto = await chatGemini(modelo, descripcion, silencio);
        aviso("gemini/" + modelo + " respondió");
        return extraerJson(texto);
      } catch (error) {
        if (error.saltarModelo) break;
        ultimo = modelo + ": " + error.message;
      }
    }
  }
  throw new Error(ultimo);
}

const PROVEEDORES = [
  {
    id: "llm7",
    nombre: "LLM7 (sin clave ni registro)",
    url: "https://api.llm7.io/v1/chat/completions",
    catalogo: "https://api.llm7.io/v1/models",
    clave: "unused",
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
    modelos: ["gpt-oss-120b", "Qwen3-32B", "Mistral-Small-3.2-24B-Instruct-2506"],
  },
  {
    id: "pollinations",
    nombre: "Pollinations (sin clave ni registro)",
    url: "https://text.pollinations.ai/openai",
    catalogo: "",
    clave: "",
    modelos: ["openai"],
  },
];

const NO_CHAT = /embed|whisper|tts|audio|speech|image|vision|flux|stable|diffus|rerank|moderation|guard|ocr|video|clip|bge|e5-|jina|sdxl|dall/i;

/** Busca un modelo de chat en el catálogo público del proveedor. */
async function descubrirModelo(proveedor, aviso, ms) {
  if (!proveedor.catalogo) return null;
  const cabeceras = {};
  if (proveedor.clave) cabeceras.Authorization = "Bearer " + proveedor.clave;
  const res = await traer(proveedor.catalogo, { headers: cabeceras }, ms || PROVEEDOR_MS);
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
    .filter((id) => typeof id === "string" && id.length > 1 && !NO_CHAT.test(id));
  if (!ids.length) return null;
  const preferido = ids.find((id) => /instruct|chat|gpt|llama|qwen|mistral|deepseek|glm|gemma|nemotron/i.test(id)) || ids[0];
  aviso(proveedor.id + ": catálogo sugiere " + preferido);
  return preferido;
}

const MODELO_DESCONOCIDO = /HTTP 4(00|04)|does not exist|model_not_found|not a valid model|unknown model/i;

async function conProveedor(proveedor, descripcion, aviso) {
  const errores = [];
  for (const modelo of proveedor.modelos) {
    try {
      const texto = await chatCompatible(proveedor, modelo, descripcion, proveedor.ms);
      aviso(proveedor.id + "/" + modelo + " respondió");
      return extraerJson(texto);
    } catch (error) {
      errores.push(modelo + ": " + error.message);
      // Si el modelo ya no existe, el catálogo del proveedor nos dirá cuál usar.
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
 * Pide un plano a la IA gratuita. Devuelve { spec, proveedor } o null si nadie respondió.
 * `spec` ya viene normalizado y validado, listo para escribir en api/<nombre>/spec.json.
 */
export async function pedirPlano({ descripcion, nombre, proveedor, aviso }) {
  const decir = typeof aviso === "function" ? aviso : () => {};
  const pedido = String(proveedor || process.env.GENERADOR_PROVEEDOR || "").trim().toLowerCase();
  // "auto", "gratis" o vacío significan: prueba todo en orden.
  const forzado = pedido === "auto" || pedido === "gratis" || pedido === "cualquiera" ? "" : pedido;
  if (process.env.GENERADOR_SIN_IA === "1" || forzado === "incluido" || forzado === "sin-ia") {
    decir("IA desactivada a propósito: se usa el lector incluido.");
    return null;
  }

  const intentos = [];
  const quiereGemini = process.env.GEMINI_API_KEY && forzado !== "sin-clave";
  if (quiereGemini) intentos.push({ id: "gemini", nombre: "Gemini (capa gratuita)", correr: conGemini });
  if (forzado !== "gemini") {
    for (const item of PROVEEDORES) {
      if (forzado && forzado !== "sin-clave" && forzado !== item.id) continue;
      intentos.push({ id: item.id, nombre: item.nombre, correr: (texto, decirFn) => conProveedor(item, texto, decirFn) });
    }
  }
  if (!intentos.length) {
    decir("No hay ningún proveedor de IA configurado: se usa el lector incluido.");
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
      const bruto = await intento.correr(descripcion, decir);
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

/** Lista de proveedores sin clave, útil para el flujo de prueba y para la documentación. */
export function proveedoresSinClave() {
  return PROVEEDORES.map((item) => ({ id: item.id, nombre: item.nombre, url: item.url, modelos: item.modelos }));
}
