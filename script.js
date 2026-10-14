// La página del taller. Todo el trabajo pesado vive en el servidor:
// aquí solo se lee el formulario, se pide la API y se informa del resultado.

import { analizar, huella, proponerNombre, slug } from "./lib/motor.mjs";

const forma = document.querySelector("#forma");
const nombreInput = document.querySelector("#nombre");
const descripcionInput = document.querySelector("#descripcion");
const secretoInput = document.querySelector("#secreto");
const ruta = document.querySelector("#ruta");
const cuenta = document.querySelector("#cuenta");
const estado = document.querySelector("#estado");
const enviar = document.querySelector("#enviar");
const plano = document.querySelector("#plano");
const lista = document.querySelector("#lista");
const resultado = document.querySelector("#resultado");

const REPOS = "https://github.com/muecojulio/generador-apis-gratuitas";
const EJEMPLO = {
  nombre: "tienda-barrio",
  texto: [
    "Tabla productos con campos:",
    "- nombre (texto, obligatorio, máximo 80)",
    "- precio (número, obligatorio, mínimo 0)",
    "- existencias (entero, obligatorio)",
    "- activo (sí o no)",
    "",
    "Tabla categorias con campos nombre y descripcion.",
    "Quiero listar, crear, actualizar y borrar.",
    "El precio no puede ser negativo.",
  ].join("\n"),
};

const MOTORES = {
  gemini: "Gemini (capa gratuita)",
  llm7: "LLM7 (sin clave)",
  kilo: "Kilo Gateway (sin clave)",
  ovh: "OVHcloud AI (sin clave)",
  pollinations: "Pollinations (sin clave)",
  incluido: "lector del taller (sin IA)",
};

function dormir(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function nombreActual() {
  const escrito = slug(nombreInput.value);
  if (escrito) return escrito;
  if (descripcionInput.value.trim().length >= 8) return proponerNombre(descripcionInput.value);
  return "";
}

function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

function texto(tag, contenido, clase) {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  nodo.textContent = contenido;
  return nodo;
}

/* Vista previa: el mismo lector que usa el servidor, corriendo en tu navegador. */

function dibujarPlano() {
  const titulo = plano.querySelector("h2");
  const ayuda = plano.querySelector("p");
  vaciar(plano);
  plano.appendChild(titulo);
  plano.appendChild(ayuda);

  const nombre = nombreActual();
  const descripcion = descripcionInput.value.trim();
  if (!nombre || descripcion.length < 20) return;

  const diseno = analizar(descripcion, nombre);
  const bloque = document.createElement("div");
  bloque.className = "mt-4 space-y-3";

  for (const recurso of diseno.recursos) {
    const caja = document.createElement("div");
    caja.appendChild(texto("p", recurso.titulo, "text-sm font-medium text-ivory"));
    caja.appendChild(
      texto(
        "p",
        recurso.campos
          .map((campo) => {
            const marcas = [];
            if (campo.requerido) marcas.push("obligatorio");
            if (campo.min != null) marcas.push("min " + campo.min);
            if (campo.max != null) marcas.push("max " + campo.max);
            return campo.nombre + (marcas.length ? " (" + marcas.join(", ") + ")" : "");
          })
          .join("  ·  "),
        "mt-1 text-sm leading-relaxed text-stone"
      )
    );
    bloque.appendChild(caja);
  }

  const rutas = document.createElement("div");
  rutas.className = "mt-4 space-y-1 border-t border-line pt-3 font-mono text-xs text-stone";
  for (const recurso of diseno.recursos) {
    const base = "/api/" + diseno.nombre + "/" + recurso.nombre;
    rutas.appendChild(texto("p", "GET    " + base));
    if (!diseno.soloLectura) {
      rutas.appendChild(texto("p", "POST   " + base));
      rutas.appendChild(texto("p", "PUT    " + base + "/{id}"));
      rutas.appendChild(texto("p", "DELETE " + base + "/{id}"));
    }
  }
  bloque.appendChild(rutas);
  plano.appendChild(bloque);
}

function refrescarMeta() {
  const nombre = nombreActual();
  ruta.textContent = nombre ? "/api/" + nombre : "/api/";
  cuenta.textContent = String(descripcionInput.value.length);
  dibujarPlano();
}

/* Lista de APIs publicadas */

async function cargarLista() {
  vaciar(lista);
  lista.appendChild(texto("p", "Cargando…", "py-4 text-sm text-stone"));
  let apis = [];
  try {
    const respuesta = await fetch("/api/listar", { cache: "no-store" });
    if (respuesta.ok) {
      const json = await respuesta.json();
      apis = json.apis || [];
    }
  } catch {
    apis = [];
  }
  vaciar(lista);
  if (!apis.length) {
    lista.appendChild(
      texto("p", "Todavía no hay APIs publicadas. Escribe arriba la primera.", "py-4 text-sm text-stone")
    );
    return;
  }
  for (const api of apis) {
    const fila = document.createElement("a");
    fila.className = "flex flex-col gap-1 py-4 hover:bg-panel/60 sm:flex-row sm:items-baseline sm:justify-between";
    fila.href = api.ruta || "/api/" + api.nombre;
    fila.appendChild(texto("span", api.titulo || api.nombre, "font-medium text-ivory"));
    const meta = document.createElement("span");
    meta.className = "font-mono text-xs text-stone";
    const motor = MOTORES[api.motor] || api.motor || "incluido";
    meta.textContent = (api.ruta || "/api/" + api.nombre) + "  ·  " + motor;
    fila.appendChild(meta);
    lista.appendChild(fila);
  }
}

/* Espera a que Vercel publique la API */

async function esperarPublicacion(nombre, marca) {
  const inicio = Date.now();
  let fallo = "";
  let avisoMotor = "";

  while (Date.now() - inicio < 300000) {
    await dormir(5000);

    try {
      const respuesta = await fetch("/api/estado?nombre=" + encodeURIComponent(nombre), { cache: "no-store" });
      if (respuesta.ok) {
        const json = await respuesta.json();
        if (json.titulo) avisoMotor = MOTORES[json.motor] || json.motor || "";
        const corrida = json.corrida;
        if (corrida && corrida.resultado === "failure") {
          fallo = corrida.url || REPOS + "/actions";
          break;
        }
        if (corrida && corrida.resultado === "cancelled") {
          fallo = corrida.url || REPOS + "/actions";
          break;
        }
        if (corrida && (corrida.estado === "queued" || corrida.estado === "in_progress")) {
          estado.textContent = "La carpeta se está escribiendo en GitHub… (motor: " + (avisoMotor || "por decidir") + ")";
        }
        if (json.publicada) {
          estado.textContent = "Carpeta lista. Vercel está publicando la función…";
        }
      }
    } catch {
      /* Si el estado no responde, seguimos probando la API directamente. */
    }

    try {
      const respuesta = await fetch("/api/" + nombre, { cache: "no-store" });
      const tipo = respuesta.headers.get("content-type") || "";
      if (respuesta.ok && tipo.includes("json")) {
        const json = await respuesta.json();
        if (json && json.huella === marca) return json;
      }
    } catch {
      /* Todavía no está desplegada. */
    }
  }

  if (fallo) {
    const error = new Error("La creación se detuvo. Mira el detalle en la pestaña Actions.");
    error.enlace = fallo;
    throw error;
  }
  const error = new Error("Sigue en camino. Abre la ruta en un momento.");
  error.enlace = location.origin + "/api/" + nombre;
  throw error;
}

/* Resultado con instrucciones listas para copiar */

function mostrarResultado(nombre, manifiesto) {
  vaciar(resultado);
  resultado.className = "mt-5 rounded-xl border border-line bg-ink p-4";
  const enlace = location.origin + "/api/" + nombre;

  resultado.appendChild(texto("p", "¡Lista! Tu API ya responde.", "font-medium text-ivory"));
  const ancla = document.createElement("a");
  ancla.href = "/api/" + nombre;
  ancla.target = "_blank";
  ancla.rel = "noreferrer";
  ancla.className = "mt-1 block break-all font-mono text-xs text-clay underline-offset-4 hover:underline";
  ancla.textContent = enlace;
  resultado.appendChild(ancla);

  const motor = MOTORES[manifiesto.motor] || manifiesto.motor || "incluido";
  resultado.appendChild(texto("p", "Motor: " + motor, "mt-2 text-xs text-stone"));

  if (Array.isArray(manifiesto.rutas) && manifiesto.rutas.length) {
    const caja = document.createElement("div");
    caja.className = "mt-3 space-y-1 border-t border-line pt-3 font-mono text-xs text-stone";
    for (const rutaApi of manifiesto.rutas.slice(0, 14)) caja.appendChild(texto("p", rutaApi));
    if (manifiesto.rutas.length > 14) caja.appendChild(texto("p", "… y " + (manifiesto.rutas.length - 14) + " más"));
    resultado.appendChild(caja);

    const primerRecurso = (manifiesto.recursos && manifiesto.recursos[0] && manifiesto.recursos[0].nombre) || "";
    if (primerRecurso) {
      const copiar = document.createElement("button");
      copiar.type = "button";
      copiar.className =
        "mt-3 rounded-lg border border-line px-3 py-2 text-xs text-ivory hover:border-clay hover:text-clay";
      copiar.textContent = "Copiar ejemplo de curl";
      copiar.addEventListener("click", async () => {
        const orden = "curl " + location.origin + "/api/" + nombre + "/" + primerRecurso;
        try {
          await navigator.clipboard.writeText(orden);
          copiar.textContent = "Copiado";
          setTimeout(() => (copiar.textContent = "Copiar ejemplo de curl"), 2000);
        } catch {
          copiar.textContent = orden;
        }
      });
      resultado.appendChild(copiar);
    }
  }
  resultado.classList.remove("hidden");
}

/* Envío */

forma.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const descripcion = descripcionInput.value.trim().slice(0, 8000);
  const nombre = nombreActual();
  resultado.classList.add("hidden");

  if (!nombre || descripcion.length < 20) {
    estado.textContent = "Escribe un nombre y cuenta las tablas, los campos y las acciones deseadas.";
    return;
  }

  enviar.disabled = true;
  estado.textContent = "Pidiendo la carpeta. Esto usa solo planes gratuitos y tarda uno o dos minutos.";

  try {
    const respuesta = await fetch("/api/generar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, descripcion, secreto: secretoInput.value }),
    });
    const json = await respuesta.json().catch(() => ({}));

    if (respuesta.status === 404 || respuesta.status === 405) {
      estado.textContent =
        "Esta vista no tiene servidor. Abre el sitio publicado en Vercel para que el botón pueda trabajar.";
      return;
    }
    if (!respuesta.ok) {
      estado.textContent = json.error || "No pude empezar.";
      if (json.ayuda) {
        estado.appendChild(document.createTextNode(" "));
        const ancla = document.createElement("a");
        ancla.href = json.ayuda;
        ancla.className = "text-clay underline-offset-4 hover:underline";
        ancla.textContent = "Cómo arreglarlo";
        estado.appendChild(ancla);
      }
      return;
    }

    const marca = huella(descripcion);
    const manifiesto = await esperarPublicacion(json.nombre || nombre, marca);
    estado.textContent = json.actualiza ? "API actualizada." : "API creada.";
    mostrarResultado(json.nombre || nombre, manifiesto);
    await cargarLista();
  } catch (error) {
    estado.textContent = error.message + " ";
    if (error.enlace) {
      const ancla = document.createElement("a");
      ancla.href = error.enlace;
      ancla.className = "text-clay underline-offset-4 hover:underline";
      ancla.textContent = "Ver";
      estado.appendChild(ancla);
    }
  } finally {
    enviar.disabled = false;
  }
});

document.querySelector("#ejemplo").addEventListener("click", () => {
  nombreInput.value = EJEMPLO.nombre;
  descripcionInput.value = EJEMPLO.texto;
  refrescarMeta();
  descripcionInput.focus();
});

document.querySelector("#recargar").addEventListener("click", cargarLista);
nombreInput.addEventListener("input", refrescarMeta);
descripcionInput.addEventListener("input", refrescarMeta);

refrescarMeta();
cargarLista();
