import fs from "node:fs";
import path from "node:path";
import { analizar, normalizar, slugValido, huella } from "../lib/motor.mjs";

const SISTEMA = `Eres el arquitecto de un taller de APIs REST gratuitas.
Devuelves ÚNICAMENTE un objeto JSON, sin markdown y sin código, con esta forma exacta:
{
  "titulo": "nombre corto",
  "resumen": "una frase de lo que hace la API",
  "soloLectura": false,
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
- nombres en minúsculas y sin acentos.
- No incluyas id, creado ni actualizado.
- Respeta tablas, campos, obligatorios, mínimos, máximos y si piden solo lectura.
- No inventes recursos que la persona no pidió.
- Si algo es ambiguo, elige la opción más simple y útil.`;

const MODELOS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash"];

function escribir(relativo, contenido) {
  const raiz = process.cwd();
  const destino = path.resolve(raiz, relativo);
  if (!destino.startsWith(raiz + path.sep)) {
    throw new Error("Ruta rechazada: " + relativo);
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
}

function envolver(nombre) {
  return (
    '"use strict";\n' +
    "const { crear } = require(\"../../lib/runtime\");\n" +
    "module.exports = crear(require(\"../../specs/" +
    nombre +
    ".json\"));\n"
  );
}

function extraerJson(texto) {
  const limpio = String(texto || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1) throw new Error("La IA no devolvió JSON.");
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

async function pedirGemini(modelo, descripcion, conPensamientoCero) {
  const clave = process.env.GEMINI_API_KEY;
  const cuerpo = {
    systemInstruction: { parts: [{ text: SISTEMA }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Diseña el plano de esta API. Descripción de la persona:\n\n" +
              descripcion,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      ...(conPensamientoCero ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  const respuesta = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": clave,
      },
      body: JSON.stringify(cuerpo),
    }
  );
  const texto = await respuesta.text();
  return { status: respuesta.status, texto };
}

async function gemini(descripcion) {
  if (!process.env.GEMINI_API_KEY) return null;
  let ultimo = "Ningún modelo gratuito respondió.";
  for (const modelo of MODELOS) {
    for (const silencio of [false, true]) {
      const res = await pedirGemini(modelo, descripcion, silencio);
      if (res.status === 404) break;
      if (res.status === 400 && !silencio) continue;
      if (res.status !== 200) {
        ultimo = modelo + " respondió " + res.status + ": " + res.texto.slice(0, 240);
        continue;
      }
      const json = JSON.parse(res.texto);
      const bloqueo = json.promptFeedback && json.promptFeedback.blockReason;
      if (bloqueo) throw new Error("La descripción fue rechazada por el filtro de seguridad.");
      const partes = (((json.candidates || [])[0] || {}).content || {}).parts || [];
      const unido = partes.map((parte) => parte.text || "").join("").trim();
      if (!unido) {
        ultimo = modelo + " no escribió un plano.";
        continue;
      }
      return extraerJson(unido);
    }
  }
  throw new Error(ultimo);
}

function actualizarCatalogo(spec) {
  const ruta = path.resolve("catalogo.json");
  let catalogo = { apis: [] };
  if (fs.existsSync(ruta)) {
    catalogo = JSON.parse(fs.readFileSync(ruta, "utf8"));
  }
  const apis = (catalogo.apis || []).filter((api) => api.nombre !== spec.nombre);
  apis.unshift({
    nombre: spec.nombre,
    titulo: spec.titulo,
    resumen: spec.resumen,
    motor: spec.motor,
    publicado: new Date().toISOString(),
  });
  fs.writeFileSync(ruta, JSON.stringify({ apis }, null, 2) + "\n");
}

const nombre = String(process.env.NOMBRE || "").trim();
const descripcion = String(process.env.DESCRIPCION || "").trim().slice(0, 8000);

if (!slugValido(nombre)) {
  console.error("Nombre inválido. Usa letras minúsculas, números y guiones.");
  process.exit(1);
}
if (descripcion.length < 20) {
  console.error("La descripción es demasiado corta.");
  process.exit(1);
}

let spec;
let motor = "analizador";
if (process.env.GEMINI_API_KEY) {
  try {
    const plano = await gemini(descripcion);
    spec = normalizar(plano, nombre, "gemini");
    motor = "gemini";
    console.log("Plano creado con Gemini (capa gratuita).");
  } catch (error) {
    console.error("Gemini falló:", error.message);
    process.exit(1);
  }
} else {
  spec = analizar(descripcion, nombre);
  console.log("Sin GEMINI_API_KEY: usé el lector incluido.");
}

spec.motor = motor;
spec.huella = huella(descripcion);
if (!spec.resumen) spec.resumen = descripcion.replace(/\s+/g, " ").slice(0, 280);

escribir("specs/" + nombre + ".json", JSON.stringify(spec, null, 2) + "\n");
escribir("api/" + nombre + "/index.js", envolver(nombre));
escribir("api/" + nombre + "/[...ruta].js", envolver(nombre));
actualizarCatalogo(spec);
console.log("Listo: api/" + nombre + "/");
