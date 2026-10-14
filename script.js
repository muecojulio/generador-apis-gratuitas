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

function dormir(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function nombreActual() {
  const escrito = slug(nombreInput.value);
  if (escrito) return escrito;
  if (descripcionInput.value.trim().length >= 8) return proponerNombre(descripcionInput.value);
  return "";
}

function ponerTexto(nodo, texto) {
  nodo.textContent = texto;
}

function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

function linea(texto, clase) {
  const p = document.createElement("p");
  p.className = clase;
  p.textContent = texto;
  return p;
}

function dibujarPlano() {
  const titulo = plano.querySelector("h2");
  const ayuda = plano.querySelector("p");
  vaciar(plano);
  plano.appendChild(titulo);
  plano.appendChild(ayuda);
  const nombre = nombreActual();
  const texto = descripcionInput.value.trim();
  if (!nombre || texto.length < 20) return;
  const diseno = analizar(texto, nombre);
  const bloque = document.createElement("div");
  bloque.className = "mt-4 space-y-3";
  for (const recurso of diseno.recursos) {
    const caja = document.createElement("div");
    const tituloRecurso = document.createElement("p");
    tituloRecurso.className = "text-sm font-medium text-ivory";
    tituloRecurso.textContent = recurso.titulo;
    caja.appendChild(tituloRecurso);
    const campos = document.createElement("p");
    campos.className = "mt-1 text-sm leading-relaxed text-stone";
    campos.textContent = recurso.campos
      .map((campo) => campo.nombre + (campo.requerido ? " · obligatorio" : ""))
      .join("  ·  ");
    caja.appendChild(campos);
    bloque.appendChild(caja);
  }
  const rutas = document.createElement("div");
  rutas.className = "mt-4 space-y-1 border-t border-line pt-3 font-mono text-xs text-stone";
  for (const recurso of diseno.recursos) {
    const base = "/api/" + diseno.nombre + "/" + recurso.nombre;
    rutas.appendChild(linea("GET  " + base, ""));
    if (!diseno.soloLectura) {
      rutas.appendChild(linea("POST " + base, ""));
      rutas.appendChild(linea("PUT  " + base + "/{id}", ""));
      rutas.appendChild(linea("DELETE " + base + "/{id}", ""));
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

async function cargarLista() {
  vaciar(lista);
  let apis = [];
  try {
    const respuesta = await fetch("/api/listar");
    if (respuesta.ok) {
      const json = await respuesta.json();
      apis = json.apis || [];
    }
  } catch {
    apis = [];
  }
  if (!apis.length) {
    lista.appendChild(linea("Todavía no hay APIs publicadas.", "py-4 text-sm text-stone"));
    return;
  }
  for (const api of apis) {
    const fila = document.createElement("a");
    fila.className = "flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between";
    fila.href = "/api/" + api.nombre;
    const fuerte = document.createElement("span");
    fuerte.className = "font-medium text-ivory";
    fuerte.textContent = api.titulo || api.nombre;
    const camino = document.createElement("span");
    camino.className = "font-mono text-xs text-stone";
    camino.textContent = "/api/" + api.nombre;
    fila.appendChild(fuerte);
    fila.appendChild(camino);
    lista.appendChild(fila);
  }
}

async function esperarPublicacion(nombre, marca) {
  const inicio = Date.now();
  let fallo = "";
  while (Date.now() - inicio < 240000) {
    await dormir(8000);
    try {
      const corridas = await fetch(
        "https://api.github.com/repos/muecojulio/generador-apis-gratuitas/actions/workflows/generar-api.yml/runs?per_page=8",
        { headers: { Accept: "application/vnd.github+json" } }
      );
      if (corridas.ok) {
        const json = await corridas.json();
        const mia = (json.workflow_runs || []).find((corrida) => {
          const titulo = String(corrida.display_title || corrida.name || "");
          return titulo.includes(nombre) && new Date(corrida.created_at).getTime() > inicio - 20000;
        });
        if (mia && mia.conclusion === "failure") {
          fallo = mia.html_url || REPOS + "/actions";
          break;
        }
      }
    } catch {
      /* La API local sigue siendo la señal buena. */
    }
    try {
      const respuesta = await fetch("/api/" + nombre, { cache: "no-store" });
      const tipo = respuesta.headers.get("content-type") || "";
      if (respuesta.ok && tipo.includes("json")) {
        const json = await respuesta.json();
        if (json && json.huella === marca) return json;
      }
    } catch {
      /* Sigue el despliegue. */
    }
    estado.textContent = "La carpeta ya se está creando. Falta que el sitio la publique…";
  }
  if (fallo) {
    const error = new Error("La creación se detuvo.");
    error.enlace = fallo;
    throw error;
  }
  const error = new Error("Sigue en camino. Abre la ruta en un momento.");
  error.enlace = location.origin + "/api/" + nombre;
  throw error;
}

forma.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const descripcion = descripcionInput.value.trim().slice(0, 8000);
  const nombre = nombreActual();
  if (!nombre || descripcion.length < 20) {
    estado.textContent = "Escribe un nombre y cuenta las tablas, los campos y las acciones.";
    return;
  }
  enviar.disabled = true;
  estado.textContent = "Pedí la carpeta. Esto usa solo el plan gratuito y tarda un minuto o dos.";
  const marca = huella(descripcion);
  try {
    const respuesta = await fetch("/api/generar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        descripcion,
        secreto: secretoInput.value,
      }),
    });
    const json = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 404) {
      estado.textContent =
        "En esta vista el botón todavía no llega a GitHub. Ábrelo en el sitio publicado de Vercel.";
      return;
    }
    if (!respuesta.ok) {
      estado.textContent = json.error || "No pude empezar.";
      return;
    }
    const listaApi = await esperarPublicacion(json.nombre || nombre, marca);
    estado.textContent = "";
    const ancla = document.createElement("a");
    ancla.className = "text-clay underline-offset-4 hover:underline";
    ancla.href = "/api/" + (json.nombre || nombre);
    ancla.textContent = location.origin + "/api/" + (json.nombre || nombre);
    estado.appendChild(document.createTextNode((listaApi.titulo || "Lista") + ". "));
    estado.appendChild(ancla);
    await cargarLista();
  } catch (error) {
    estado.textContent = "";
    estado.appendChild(document.createTextNode(error.message + " "));
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
