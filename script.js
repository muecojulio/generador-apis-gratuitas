// La página viva del taller. Incluye diseñador visual en tiempo real,
// consola interactiva estilo Hoppscotch/Scalar, telemetría del servidor y
// explorador filtrable de APIs públicas sin clave.

import { RESERVADOS_API, analizar, huella, proponerNombre, slug } from "./lib/motor.mjs";

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

const soloLecturaInput = document.querySelector("#solo-lectura");
const conTokenInput = document.querySelector("#con-token");
const tokenModoInput = document.querySelector("#token-modo");
const maxRegistrosInput = document.querySelector("#max-registros");
const retencionInput = document.querySelector("#retencion");
const maxKbInput = document.querySelector("#max-kb");

const REPOS = "https://github.com/muecojulio/generador-apis-gratuitas";

/* 0. Entorno: web o app nativa, y servidor del taller --------------------- */

const CONFIG = Object.freeze(
  Object.assign({ nativo: false, apiBase: "", version: "1.0.0", compilado: "web" }, window.TALLER_CONFIG || {})
);

const CLAVE_SERVIDOR = "taller:servidor";

function normalizarServidor(valor) {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  try {
    const url = new URL(texto);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function leerPreferencia(clave) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarPreferencia(clave, valor) {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la sesión sigue funcionando */
  }
}

let servidorApi = normalizarServidor(leerPreferencia(CLAVE_SERVIDOR) || CONFIG.apiBase);

/** Convierte una ruta del taller en URL absoluta cuando hay servidor remoto. */
function urlApi(ruta) {
  const valor = String(ruta || "");
  if (!valor.startsWith("/") || valor.startsWith("//")) return valor;
  return servidorApi ? servidorApi.replace(/\/+$/, "") + valor : valor;
}

/** `fetch` que respeta el servidor configurado (web: mismo origen). */
function fetchApi(ruta, opciones) {
  return fetch(urlApi(ruta), opciones);
}

const ESCENARIOS = [
  {
    id: "tienda-barrio",
    icono: "🏪",
    etiqueta: "Comercio",
    titulo: "Tienda de Barrio",
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
  },
  {
    id: "atlas-viajes",
    icono: "🌍",
    etiqueta: "Normalización",
    titulo: "Atlas y Divisas",
    nombre: "atlas-viajes",
    texto: [
      "Tabla destinos con campos:",
      "- nombre (texto, obligatorio, máximo 90)",
      "- pais (texto, obligatorio, máximo 80)",
      "- ciudad (texto, obligatorio, máximo 80)",
      "- moneda (texto, obligatorio, máximo 12)",
      "- presupuesto-diario (número, obligatorio, mínimo 1)",
      "- visitado (sí o no)",
      "",
      "Tabla bitacoras con campos:",
      "- destino (texto, obligatorio)",
      "- fecha (fecha, obligatorio)",
      "- notas (texto, máximo 400)",
    ].join("\n"),
  },
  {
    id: "taqueria-sol",
    icono: "🌮",
    etiqueta: "Gastronomía",
    titulo: "Taquería & Pedidos",
    nombre: "taqueria-sol",
    texto: [
      "Tabla platillos con campos:",
      "- nombre (texto, obligatorio, máximo 70)",
      "- precio (número, obligatorio, mínimo 1)",
      "- picante (entero, mínimo 0, máximo 5)",
      "- vegetariano (sí o no)",
      "",
      "Tabla comandas con campos:",
      "- mesa (entero, obligatorio, mínimo 1)",
      "- platillo (texto, obligatorio)",
      "- cantidad (entero, obligatorio, mínimo 1)",
      "- entregada (sí o no)",
    ].join("\n"),
  },
  {
    id: "club-atletico",
    icono: "🏋️",
    etiqueta: "Deporte",
    titulo: "Club Deportivo",
    nombre: "club-atletico",
    texto: [
      "Tabla atletas con campos:",
      "- nombre (texto, obligatorio, máximo 80)",
      "- correo (email, obligatorio)",
      "- ciudad (texto, obligatorio)",
      "- alta (fecha, obligatorio)",
      "- activo (sí o no)",
      "",
      "Tabla entrenamientos con campos:",
      "- disciplina (texto, obligatorio)",
      "- duracion-minutos (entero, obligatorio, mínimo 10)",
      "- intensidad (texto, obligatorio)",
    ].join("\n"),
  },
  {
    id: "biblioteca-barrio",
    icono: "📚",
    etiqueta: "Cultura",
    titulo: "Biblioteca Abierta",
    nombre: "biblioteca-barrio",
    texto: [
      "Tabla libros con campos:",
      "- titulo (texto, obligatorio, máximo 120)",
      "- autor (texto, obligatorio, máximo 90)",
      "- anio (entero, mínimo 1450, máximo 2030)",
      "- disponible (sí o no)",
      "",
      "Tabla prestamos con campos:",
      "- libro (texto, obligatorio)",
      "- lector (email, obligatorio)",
      "- fecha-entrega (fecha, obligatorio)",
    ].join("\n"),
  },
  {
    id: "torneo-arcade",
    icono: "🎮",
    etiqueta: "Juegos",
    titulo: "Liga Arcade",
    nombre: "torneo-arcade",
    texto: [
      "Tabla jugadores con campos:",
      "- alias (texto, obligatorio, máximo 40)",
      "- pais (texto, obligatorio)",
      "- puntos-totales (entero, obligatorio, mínimo 0)",
      "- invicto (sí o no)",
      "",
      "Tabla partidas con campos:",
      "- juego (texto, obligatorio)",
      "- ganador (texto, obligatorio)",
      "- puntaje (entero, obligatorio, mínimo 0)",
      "- fecha (fecha, obligatorio)",
    ].join("\n"),
  },
];

const EJEMPLO = ESCENARIOS[0];

const MOTORES = {
  gemini: "Gemini (capa gratuita)",
  llm7: "LLM7 (sin clave)",
  kilo: "Kilo Gateway (sin clave)",
  ovh: "OVHcloud AI (sin clave)",
  pollinations: "Pollinations (sin clave)",
  groq: "Groq (clave gratuita)",
  openrouter: "OpenRouter (clave gratuita)",
  cerebras: "Cerebras (clave gratuita)",
  mistral: "Mistral (clave gratuita)",
  together: "Together (clave gratuita)",
  deepseek: "DeepSeek (clave gratuita)",
  huggingface: "Hugging Face (clave gratuita)",
  incluido: "lector del taller (sin IA)",
};

const COLORES_TIPO = {
  texto: "borde-info fondo-info tono-info",
  numero: "borde-aviso fondo-aviso tono-aviso",
  entero: "borde-extra fondo-extra tono-aviso",
  booleano: "borde-extra fondo-extra tono-extra",
  fecha: "borde-exito fondo-exito tono-exito",
  email: "borde-extra fondo-extra tono-extra",
};

const COLORES_METODO = {
  GET: "borde-exito fondo-exito tono-exito",
  POST: "borde-info fondo-info tono-info",
  PUT: "borde-aviso fondo-aviso tono-aviso",
  DELETE: "borde-peligro fondo-peligro tono-peligro",
};

const CAMPOS_MAGICOS = {
  pais: "🌍 REST Countries",
  moneda: "💱 Frankfurter BCE",
  ciudad: "📍 Open-Meteo Geo",
};

let pestanaPlano = "tablas";

function motorTexto(motor) {
  if (!motor) return "incluido";
  return MOTORES[motor] || motor;
}

function nombreValido(nombre) {
  return (
    typeof nombre === "string" &&
    nombre.length >= 2 &&
    nombre.length <= 48 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nombre) &&
    !RESERVADOS_API.has(nombre)
  );
}

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
  while (nodo && nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

function texto(tag, contenido, clase) {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  nodo.textContent = contenido;
  return nodo;
}

function enlace(contenido, href, clase, externo) {
  const nodo = document.createElement("a");
  nodo.href = href;
  nodo.textContent = contenido;
  if (clase) nodo.className = clase;
  if (externo) {
    nodo.target = "_blank";
    nodo.rel = "noreferrer";
  }
  return nodo;
}

function insignia(contenido, clase) {
  return texto("span", contenido, "rounded-full border px-2.5 py-0.5 text-[11px] " + (clase || "border-line text-stone"));
}

function limitesResumen(limites) {
  if (!limites) return "";
  const partes = [
    "máx. " + limites.maxRegistrosPorRecurso + " registros",
    Math.round(limites.maxBytes / 1024) + " KB",
  ];
  partes.push(limites.retencionDias ? "retención " + limites.retencionDias + " días" : "sin borrado automático");
  return partes.join(" · ");
}

async function copiar(textoCopiar, nodo, etiqueta) {
  try {
    await navigator.clipboard.writeText(textoCopiar);
    const antes = nodo.textContent;
    nodo.textContent = "✓ Copiado";
    setTimeout(() => (nodo.textContent = etiqueta || antes), 1800);
  } catch {
    nodo.textContent = "No se pudo copiar";
  }
}

/* 1. Apariencia: tema claro/oscuro y color de acento ---------------------- */

const TEMAS = ["tema-claro", "tema-oscuro"];
const ACENTOS = ["acento-indigo", "acento-jade", "acento-ambar", "acento-violeta"];
const botonesTema = document.querySelectorAll(".boton-tema");
const botonesAcento = document.querySelectorAll(".boton-acento");
const botonTemaBarra = document.querySelector("#boton-tema");
const iconoTema = document.querySelector("#icono-tema use");
const metaColor = document.querySelector('meta[name="theme-color"]');

function temaActual() {
  return document.documentElement.classList.contains("tema-oscuro") ? "tema-oscuro" : "tema-claro";
}

function acentoActual() {
  return ACENTOS.find((clase) => document.documentElement.classList.contains(clase)) || "acento-indigo";
}

function pintarBotonesApariencia() {
  const tema = temaActual();
  const acento = acentoActual();
  for (const boton of botonesTema) {
    boton.classList.toggle("chip-activo", boton.getAttribute("data-tema") === tema);
  }
  for (const boton of botonesAcento) {
    boton.classList.toggle("chip-activo", boton.getAttribute("data-acento") === acento);
  }
  if (iconoTema) iconoTema.setAttribute("href", tema === "tema-oscuro" ? "#i-sol" : "#i-luna");
  if (botonTemaBarra) {
    botonTemaBarra.setAttribute(
      "aria-label",
      tema === "tema-oscuro" ? "Cambiar al tema claro" : "Cambiar al tema oscuro"
    );
  }
  if (metaColor) metaColor.setAttribute("content", tema === "tema-oscuro" ? "#090c14" : "#f5f7fb");
}

function anunciarTema() {
  pintarBotonesApariencia();
  if (window.TALLER_NATIVO && typeof window.TALLER_NATIVO.actualizarBarra === "function") {
    window.TALLER_NATIVO.actualizarBarra(temaActual() === "tema-oscuro");
  }
}

function aplicarTema(tema) {
  const elegido = TEMAS.includes(tema) ? tema : "tema-claro";
  const raiz = document.documentElement;
  for (const clase of TEMAS) raiz.classList.remove(clase);
  raiz.classList.add(elegido);
  guardarPreferencia("taller:tema", elegido);
  anunciarTema();
}

function aplicarAcento(acento) {
  const elegido = ACENTOS.includes(acento) ? acento : "acento-indigo";
  const raiz = document.documentElement;
  for (const clase of ACENTOS) raiz.classList.remove(clase);
  raiz.classList.add(elegido);
  guardarPreferencia("taller:acento", elegido);
  pintarBotonesApariencia();
}

for (const boton of botonesTema) {
  boton.addEventListener("click", () => aplicarTema(boton.getAttribute("data-tema")));
}

for (const boton of botonesAcento) {
  boton.addEventListener("click", () => aplicarAcento(boton.getAttribute("data-acento")));
}

if (botonTemaBarra) {
  botonTemaBarra.addEventListener("click", () => {
    aplicarTema(temaActual() === "tema-oscuro" ? "tema-claro" : "tema-oscuro");
  });
}

pintarBotonesApariencia();

/* 2. Navegación por pestañas (escritorio y móvil) ------------------------- */

const PANELES = {
  inicio: { titulo: "Resumen" },
  disenar: { titulo: "Diseñar API" },
  probar: { titulo: "Consola de pruebas" },
  apis: { titulo: "Mis APIs" },
  fuentes: { titulo: "APIs públicas" },
  ajustes: { titulo: "Ajustes y aplicación" },
};

const tituloPanel = document.querySelector("#titulo-panel");
let panelActivo = "inicio";

function vibrar() {
  if (window.TALLER_NATIVO && typeof window.TALLER_NATIVO.vibrar === "function") {
    window.TALLER_NATIVO.vibrar();
  }
}

function navegar(panel, opciones) {
  const destino = PANELES[panel] ? panel : "inicio";
  const cambia = destino !== panelActivo;
  panelActivo = destino;

  for (const seccion of document.querySelectorAll("[data-panel-vista]")) {
    seccion.classList.toggle("activo", seccion.getAttribute("data-panel-vista") === destino);
  }
  for (const boton of document.querySelectorAll("[data-panel]")) {
    const activo = boton.getAttribute("data-panel") === destino;
    boton.classList.toggle("activo", activo);
    boton.setAttribute("aria-current", activo ? "page" : "false");
  }

  if (tituloPanel) tituloPanel.textContent = PANELES[destino].titulo;
  if (cambia && (!opciones || opciones.silencio !== true)) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrar();
  }

  try {
    const url = new URL(location.href);
    url.hash = "/" + destino;
    history.replaceState(null, "", url);
  } catch {
    /* sin historial disponible */
  }

  document.dispatchEvent(new CustomEvent("taller:panel", { detail: { panel: destino } }));
  return destino;
}

function fuentesVacia() {
  const caja = document.querySelector("#fuentes");
  return Boolean(caja && !caja.childElementCount);
}

for (const boton of document.querySelectorAll("[data-panel]")) {
  boton.addEventListener("click", () => navegar(boton.getAttribute("data-panel")));
}

for (const boton of document.querySelectorAll("[data-ir]")) {
  boton.addEventListener("click", () => navegar(boton.getAttribute("data-ir")));
}

function panelDelHash() {
  const bruto = String(location.hash || "").replace(/^#\/?/, "");
  return PANELES[bruto] ? bruto : "";
}

window.addEventListener("hashchange", () => {
  const destino = panelDelHash();
  if (destino) navegar(destino, { silencio: true });
});

/* 2. Galería de Escenarios Creativos y Asistente de Bloques --------------- */

const galeriaEscenarios = document.querySelector("#galeria-escenarios");

function cargarEscenario(escenario) {
  if (!escenario) return;
  nombreInput.value = escenario.nombre;
  descripcionInput.value = escenario.texto;
  refrescarMeta();
  if (galeriaEscenarios) {
    for (const tarjeta of galeriaEscenarios.querySelectorAll("[data-escenario]")) {
      const activo = tarjeta.getAttribute("data-escenario") === escenario.id;
      tarjeta.className =
        "flex flex-col justify-between rounded-2xl p-3 text-left transition-all " +
        (activo ? "tarjeta-destacada" : "tarjeta-viva tarjeta-elevada");
    }
  }
}

function pintarGaleriaEscenarios() {
  if (!galeriaEscenarios) return;
  vaciar(galeriaEscenarios);
  for (const escenario of ESCENARIOS) {
    const tarjeta = document.createElement("button");
    tarjeta.type = "button";
    tarjeta.setAttribute("data-escenario", escenario.id);
    tarjeta.className = "tarjeta-viva tarjeta-elevada flex flex-col justify-between rounded-2xl p-3 text-left";

    const arriba = document.createElement("div");
    const filaIcono = document.createElement("div");
    filaIcono.className = "flex items-center justify-between gap-1";
    filaIcono.appendChild(texto("span", escenario.icono, "text-lg"));
    filaIcono.appendChild(
      texto("span", escenario.etiqueta, "rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-stone")
    );
    arriba.appendChild(filaIcono);
    arriba.appendChild(texto("p", escenario.titulo, "mt-2 text-xs font-semibold text-ivory"));
    tarjeta.appendChild(arriba);

    tarjeta.appendChild(texto("p", "/api/" + escenario.nombre, "mt-2 font-mono text-[10px] text-clay"));
    tarjeta.addEventListener("click", () => cargarEscenario(escenario));
    galeriaEscenarios.appendChild(tarjeta);
  }
}

pintarGaleriaEscenarios();

const fragmentosBloques = {
  tabla: "\n\nTabla nuevos_registros con campos:\n- nombre (texto, obligatorio, máximo 80)\n- activo (sí o no)",
  texto: "\n- descripcion (texto, obligatorio, máximo 160)",
  numero: "\n- importe (número, obligatorio, mínimo 0)",
  fecha: "\n- fecha-registro (fecha, obligatorio)",
  email: "\n- contacto (email, obligatorio)",
  pais: "\n- pais (texto, obligatorio, máximo 80)",
  moneda: "\n- moneda (texto, obligatorio, máximo 10)",
  ciudad: "\n- ciudad (texto, obligatorio, máximo 80)",
};

for (const boton of document.querySelectorAll("[data-insertar]")) {
  boton.addEventListener("click", () => {
    const tipo = boton.getAttribute("data-insertar");
    const fragmento = fragmentosBloques[tipo] || "";
    if (!fragmento) return;
    if (!descripcionInput.value.trim()) {
      descripcionInput.value = "Tabla elementos con campos:" + fragmento;
    } else {
      descripcionInput.value = descripcionInput.value.replace(/\s*$/, "") + fragmento;
    }
    refrescarMeta();
    descripcionInput.focus();
  });
}

/* 3. Estudio Visual del Plano en Tiempo Real (Tablas, Rutas, JSON) -------- */

function valorMuestraCampo(campo) {
  const nombre = campo.nombre.toLowerCase();
  if (nombre === "pais") return "México";
  if (nombre === "moneda") return "MXN";
  if (nombre === "ciudad") return "Ciudad de México";
  if (campo.tipo === "email") return "ana@taller.dev";
  if (campo.tipo === "fecha") return "2026-10-25";
  if (campo.tipo === "booleano") return true;
  if (campo.tipo === "entero") return campo.min != null ? Math.max(1, campo.min) : 12;
  if (campo.tipo === "numero") return campo.min != null ? Math.max(19.5, campo.min) : 49.9;
  return "Ejemplo de " + campo.nombre;
}

function construirMuestraJson(diseno) {
  const recurso = diseno.recursos[0];
  if (!recurso) return {};
  const ejemplo = { id: "rec_01j8x9k2" };
  for (const campo of recurso.campos) {
    ejemplo[campo.nombre] = valorMuestraCampo(campo);
  }
  ejemplo.creado = "2026-10-25T18:30:00.000Z";
  ejemplo.actualizado = "2026-10-25T18:30:00.000Z";
  return {
    recurso: recurso.nombre,
    ruta: "/api/" + diseno.nombre + "/" + recurso.nombre,
    ejemploRespuesta: {
      total: 1,
      datos: [ejemplo],
    },
  };
}

function dibujarPlano() {
  const titulo = plano.querySelector("h2");
  const ayuda = plano.querySelector("p");
  vaciar(plano);
  plano.appendChild(titulo);
  plano.appendChild(ayuda);

  const nombre = nombreActual();
  const descripcion = descripcionInput.value.trim();

  if (!nombre || descripcion.length < 20) {
    const vacio = document.createElement("div");
    vacio.className = "mt-4 rounded-2xl border border-dashed border-line bg-ink/50 p-5 text-center";
    vacio.appendChild(texto("p", "🧬 El lienzo de arquitectura está listo", "text-sm font-medium text-ivory"));
    vacio.appendChild(
      texto(
        "p",
        "Elige una de las 6 chispas creativas de arriba o escribe al menos 20 caracteres para ver el diagrama de tablas, rutas HTTP y JSON en tiempo real.",
        "mt-1 text-xs leading-relaxed text-stone"
      )
    );
    const botonRapido = texto(
      "button",
      "⚡ Cargar ejemplo «Atlas y Divisas»",
      "chip-interactivo mt-3 rounded-xl px-3.5 py-2 text-xs font-medium text-clay"
    );
    botonRapido.type = "button";
    botonRapido.addEventListener("click", () => cargarEscenario(ESCENARIOS[1]));
    vacio.appendChild(botonRapido);
    plano.appendChild(vacio);
    return;
  }

  const diseno = analizar(descripcion, nombre);
  const soloLectura = Boolean(soloLecturaInput && soloLecturaInput.checked) || diseno.soloLectura;
  const totalCampos = diseno.recursos.reduce((acc, r) => acc + r.campos.length, 0);
  const totalRutas = diseno.recursos.length * (soloLectura ? 1 : 4);
  const magicos = [];
  for (const r of diseno.recursos) {
    for (const c of r.campos) {
      if (CAMPOS_MAGICOS[c.nombre] && !magicos.includes(c.nombre)) magicos.push(c.nombre);
    }
  }

  // Resumen numérico de arquitectura
  const resumenGrid = document.createElement("div");
  resumenGrid.className = "mt-4 grid grid-cols-3 gap-2";
  for (const [etiqueta, valor, tono] of [
    ["Tablas", String(diseno.recursos.length), "text-ivory"],
    ["Campos", String(totalCampos), "text-clay"],
    ["Endpoints", String(totalRutas), "tono-exito"],
  ]) {
    const celda = document.createElement("div");
    celda.className = "rounded-xl border border-line bg-ink/80 px-3 py-2 text-center";
    celda.appendChild(texto("p", valor, "font-display text-xl " + tono));
    celda.appendChild(texto("p", etiqueta, "text-[10px] uppercase tracking-wider text-stone"));
    resumenGrid.appendChild(celda);
  }
  plano.appendChild(resumenGrid);

  if (magicos.length) {
    const avisoMagico = document.createElement("div");
    avisoMagico.className =
      "mt-3 rounded-xl border borde-exito fondo-exito px-3 py-2 text-[11px] tono-exito";
    avisoMagico.textContent =
      "✨ Enriquecimiento activo: los campos «" +
      magicos.join(", ") +
      "» se normalizarán automáticamente con APIs públicas sin clave.";
    plano.appendChild(avisoMagico);
  }

  // Selector de pestañas del plano
  const barraPestanas = document.createElement("div");
  barraPestanas.className = "mt-4 flex flex-wrap gap-1.5 border-b border-line pb-2.5";
  for (const [id, nombrePestana] of [
    ["tablas", "🗂️ Tablas (" + diseno.recursos.length + ")"],
    ["rutas", "⚡ Rutas (" + totalRutas + ")"],
    ["json", "🧬 JSON Muestra"],
  ]) {
    const b = texto(
      "button",
      nombrePestana,
      "chip-interactivo rounded-lg px-2.5 py-1 text-xs font-medium " +
        (pestanaPlano === id ? "chip-activo" : "text-stone")
    );
    b.type = "button";
    b.addEventListener("click", () => {
      pestanaPlano = id;
      dibujarPlano();
    });
    barraPestanas.appendChild(b);
  }
  plano.appendChild(barraPestanas);

  const cuerpoPlano = document.createElement("div");
  cuerpoPlano.className = "mt-3 space-y-3";

  if (pestanaPlano === "tablas") {
    for (const recurso of diseno.recursos) {
      const tarjetaTabla = document.createElement("div");
      tarjetaTabla.className = "rounded-xl border border-line bg-ink/90 p-3.5";

      const cab = document.createElement("div");
      cab.className = "flex items-center justify-between gap-2 border-b border-line/70 pb-2";
      cab.appendChild(texto("p", "📦 " + recurso.titulo, "text-sm font-semibold text-ivory"));
      cab.appendChild(
        texto("code", "/api/" + diseno.nombre + "/" + recurso.nombre, "font-mono text-[11px] text-clay")
      );
      tarjetaTabla.appendChild(cab);

      const listaCampos = document.createElement("div");
      listaCampos.className = "mt-2.5 space-y-1.5";
      for (const campo of recurso.campos) {
        const filaCampo = document.createElement("div");
        filaCampo.className = "flex flex-wrap items-center justify-between gap-1.5 text-xs";

        const izq = document.createElement("div");
        izq.className = "flex items-center gap-1.5";
        izq.appendChild(texto("code", campo.nombre, "font-mono text-ivory"));
        if (campo.requerido) {
          izq.appendChild(
            texto("span", "req", "rounded border border-clay/40 bg-clay/10 px-1.5 py-0.5 text-[10px] text-clay")
          );
        }
        if (CAMPOS_MAGICOS[campo.nombre]) {
          izq.appendChild(
            texto(
              "span",
              CAMPOS_MAGICOS[campo.nombre],
              "rounded border borde-exito fondo-exito px-1.5 py-0.5 text-[10px] tono-exito"
            )
          );
        }
        filaCampo.appendChild(izq);

        const der = document.createElement("div");
        der.className = "flex items-center gap-1.5";
        const reglas = [];
        if (campo.min != null) reglas.push("≥" + campo.min);
        if (campo.max != null) reglas.push("≤" + campo.max);
        if (reglas.length) der.appendChild(texto("span", reglas.join(" "), "font-mono text-[10px] text-stone"));
        der.appendChild(
          texto(
            "span",
            campo.tipo,
            "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase " +
              (COLORES_TIPO[campo.tipo] || "border-line text-stone")
          )
        );
        filaCampo.appendChild(der);
        listaCampos.appendChild(filaCampo);
      }
      tarjetaTabla.appendChild(listaCampos);
      cuerpoPlano.appendChild(tarjetaTabla);
    }
  } else if (pestanaPlano === "rutas") {
    const cajaRutas = document.createElement("div");
    cajaRutas.className = "space-y-1.5 rounded-xl border border-line bg-ink/90 p-3 font-mono text-xs";
    for (const recurso of diseno.recursos) {
      const base = "/api/" + diseno.nombre + "/" + recurso.nombre;
      const metodos = soloLectura
        ? [["GET", base]]
        : [
            ["GET", base],
            ["POST", base],
            ["PUT", base + "/{id}"],
            ["DELETE", base + "/{id}"],
          ];
      for (const [m, urlRuta] of metodos) {
        const fila = document.createElement("div");
        fila.className = "flex items-center gap-2 py-0.5";
        fila.appendChild(
          texto(
            "span",
            m,
            "w-14 rounded border px-1.5 py-0.5 text-center text-[10px] font-bold " + COLORES_METODO[m]
          )
        );
        fila.appendChild(texto("span", urlRuta, "truncate text-ivory"));
        cajaRutas.appendChild(fila);
      }
    }
    cuerpoPlano.appendChild(cajaRutas);
  } else {
    const muestra = construirMuestraJson(diseno);
    const pre = texto(
      "pre",
      JSON.stringify(muestra, null, 2),
      "max-h-64 overflow-auto rounded-xl border border-line bg-ink/90 p-3 font-mono text-[11px] leading-relaxed tono-exito"
    );
    cuerpoPlano.appendChild(pre);
  }

  plano.appendChild(cuerpoPlano);
}

function refrescarMeta() {
  const nombre = nombreActual();
  ruta.textContent = nombre ? "/api/" + nombre : "/api/";
  cuenta.textContent = String(descripcionInput.value.length);
  dibujarPlano();
}

/* 4. Telemetría en Vivo (/api/salud y /api/proveedores) ------------------- */

async function cargarTelemetria() {
  const pulsoEstado = document.querySelector("#pulso-estado");
  const pulsoLateral = document.querySelector("#pulso-lateral");
  const estadoConexion = document.querySelector("#estado-conexion");
  const statApis = document.querySelector("#stat-apis");
  const statFunciones = document.querySelector("#stat-funciones");
  const statMotores = document.querySelector("#stat-motores");
  const radarIa = document.querySelector("#radar-ia");

  try {
    const [resSalud, resProv] = await Promise.all([
      fetchApi("/api/salud", { cache: "no-store" }),
      fetchApi("/api/proveedores", { cache: "no-store" }),
    ]);
    if (resSalud.ok) {
      const salud = await resSalud.json();
      if (pulsoEstado) {
        pulsoEstado.textContent =
          "En línea · Caché " +
          (salud.cache ? salud.cache.entradas : 0) +
          " entradas · Normalización " +
          (salud.normalizacion && salud.normalizacion.activa ? "activa" : "lista");
      }
      if (pulsoLateral) pulsoLateral.textContent = "Servidor en línea";
      if (estadoConexion) {
        estadoConexion.textContent =
          "Conectado a " + (servidorApi || location.origin) + " · " + (salud.apis || 0) + " APIs disponibles";
      }
      if (statApis && typeof salud.apis === "number") statApis.textContent = String(salud.apis);
      if (statFunciones && typeof salud.funciones === "number") {
        statFunciones.textContent = salud.funciones + "/12";
      }
      if (statMotores && salud.modelos) {
        statMotores.textContent =
          salud.modelos.sinClave + " sin clave · " + salud.modelos.conClaveDisponibles + " con clave";
      }
    }
    if (resProv.ok && radarIa) {
      const prov = await resProv.json();
      vaciar(radarIa);
      const contenedorChips = document.createElement("div");
      contenedorChips.className = "flex flex-wrap gap-1.5";
      const listaOrden = (prov.orden || []).slice(0, 6);
      listaOrden.forEach((id, idx) => {
        contenedorChips.appendChild(
          texto(
            "span",
            idx + 1 + ". " + motorTexto(id),
            "rounded-lg border borde-exito fondo-exito px-2.5 py-1 font-mono text-[11px] tono-exito"
          )
        );
      });
      contenedorChips.appendChild(
        texto(
          "span",
          "⚡ Respaldo: Lector incluido",
          "rounded-lg border border-clay/40 bg-clay/10 px-2.5 py-1 font-mono text-[11px] text-clay"
        )
      );
      radarIa.appendChild(contenedorChips);
    }
  } catch {
    if (pulsoEstado) pulsoEstado.textContent = "Sin conexión con el servidor · el diseñador sigue disponible";
    if (pulsoLateral) pulsoLateral.textContent = "Sin conexión";
    if (estadoConexion) estadoConexion.textContent = "No pude contactar con " + (servidorApi || location.origin) + ".";
  }
}

/* 5. Consola Interactiva en Vivo y Generador Multilingüe ------------------ */

const consolaRutaInput = document.querySelector("#consola-ruta");
const consolaBuscarInput = document.querySelector("#consola-buscar");
const consolaLimiteSelect = document.querySelector("#consola-limite");
const consolaEjecutarBtn = document.querySelector("#consola-ejecutar");
const consolaSalida = document.querySelector("#consola-salida");
const consolaMeta = document.querySelector("#consola-meta");
const consolaCodigo = document.querySelector("#consola-codigo");
const consolaCopiarBtn = document.querySelector("#consola-copiar-codigo");
let lenguajeConsola = "curl";

function urlCompletaConsola() {
  let baseRuta = (consolaRutaInput && consolaRutaInput.value.trim()) || "/api/ejemplo-notas/notas";
  if (!baseRuta.startsWith("/")) baseRuta = "/" + baseRuta;
  const url = new URL(baseRuta, servidorApi || location.origin);
  const buscar = consolaBuscarInput && consolaBuscarInput.value.trim();
  const limite = consolaLimiteSelect && consolaLimiteSelect.value.trim();
  if (buscar) url.searchParams.set("buscar", buscar);
  if (limite) url.searchParams.set("limite", limite);
  return url;
}

function generarFragmentoCodigo(url, lenguaje) {
  const href = url.href;
  if (lenguaje === "js") {
    return [
      "// JavaScript (fetch nativo en navegador o Node 22)",
      'const res = await fetch("' + href + '", {',
      '  headers: { Accept: "application/json" }',
      "});",
      "const datos = await res.json();",
      "console.log(res.status, datos);",
    ].join("\n");
  }
  if (lenguaje === "python") {
    return [
      "# Python (requests)",
      "import requests",
      "",
      'respuesta = requests.get("' + href + '", timeout=10)',
      "print(respuesta.status_code, respuesta.headers.get('ETag'))",
      "print(respuesta.json())",
    ].join("\n");
  }
  if (lenguaje === "httpie") {
    return [
      "# HTTPie CLI",
      'http GET "' + href + '" Accept:application/json',
    ].join("\n");
  }
  return [
    "# Terminal cURL",
    'curl -i -s "' + href + '" \\',
    '  -H "Accept: application/json"',
  ].join("\n");
}

function actualizarCodigoConsola() {
  if (!consolaCodigo) return;
  const url = urlCompletaConsola();
  consolaCodigo.textContent = generarFragmentoCodigo(url, lenguajeConsola);
}

async function ejecutarConsola(rutaForzada) {
  if (rutaForzada && consolaRutaInput) {
    consolaRutaInput.value = rutaForzada;
    for (const boton of document.querySelectorAll(".boton-endpoint")) {
      const activo = boton.getAttribute("data-endpoint") === rutaForzada;
      boton.className =
        "boton-endpoint chip-interactivo rounded-xl px-3 py-1.5 font-mono text-xs " +
        (activo ? "chip-activo" : "text-stone");
    }
  }
  actualizarCodigoConsola();
  if (!consolaSalida || !consolaMeta) return;

  const url = urlCompletaConsola();
  consolaSalida.textContent = "⏳ Consultando " + url.pathname + url.search + " …";
  vaciar(consolaMeta);
  consolaMeta.appendChild(insignia("Consultando…", "borde-aviso tono-aviso"));

  const t0 = performance.now();
  try {
    const respuesta = await fetchApi(url.pathname + url.search, { cache: "no-store" });
    const ms = Math.max(1, Math.round(performance.now() - t0));
    const textoRespuesta = await respuesta.text();
    let formateado = textoRespuesta;
    let totalRegistros = null;
    try {
      const json = JSON.parse(textoRespuesta);
      formateado = JSON.stringify(json, null, 2);
      if (Array.isArray(json.datos)) totalRegistros = json.datos.length;
      else if (Array.isArray(json.apis)) totalRegistros = json.apis.length;
    } catch {
      /* texto plano */
    }

    vaciar(consolaMeta);
    consolaMeta.appendChild(
      insignia(
        "HTTP " + respuesta.status,
        respuesta.ok
          ? "borde-exito fondo-exito tono-exito"
          : "borde-peligro fondo-peligro tono-peligro"
      )
    );
    consolaMeta.appendChild(insignia(ms + " ms", "borde-info tono-info"));
    if (totalRegistros !== null) {
      consolaMeta.appendChild(insignia(totalRegistros + " ítems", "border-clay/40 text-clay"));
    }
    const etag = respuesta.headers.get("etag");
    if (etag) consolaMeta.appendChild(insignia("ETag " + etag, "border-line text-stone"));

    consolaSalida.textContent = formateado;
  } catch (error) {
    vaciar(consolaMeta);
    consolaMeta.appendChild(insignia("Error de red", "borde-peligro tono-peligro"));
    consolaSalida.textContent = "// No se pudo consultar: " + (error.message || error);
  }
}

for (const boton of document.querySelectorAll(".boton-endpoint")) {
  boton.addEventListener("click", () => ejecutarConsola(boton.getAttribute("data-endpoint")));
}

for (const boton of document.querySelectorAll(".boton-lenguaje")) {
  boton.addEventListener("click", () => {
    lenguajeConsola = boton.getAttribute("data-lenguaje") || "curl";
    for (const otro of document.querySelectorAll(".boton-lenguaje")) {
      const activo = otro === boton;
      otro.className =
        "boton-lenguaje chip-interactivo rounded-lg px-2.5 py-1 font-mono text-[11px] " +
        (activo ? "chip-activo" : "text-stone");
    }
    actualizarCodigoConsola();
  });
}

if (consolaEjecutarBtn) consolaEjecutarBtn.addEventListener("click", () => ejecutarConsola());
if (consolaRutaInput) consolaRutaInput.addEventListener("input", actualizarCodigoConsola);
if (consolaBuscarInput) consolaBuscarInput.addEventListener("input", actualizarCodigoConsola);
if (consolaLimiteSelect) consolaLimiteSelect.addEventListener("change", () => ejecutarConsola());
if (consolaCopiarBtn) {
  consolaCopiarBtn.addEventListener("click", () =>
    copiar(consolaCodigo ? consolaCodigo.textContent : "", consolaCopiarBtn, "Copiar código")
  );
}

/* 6. Catálogo de APIs Publicadas (#lista) --------------------------------- */

async function cargarLista() {
  vaciar(lista);
  lista.appendChild(texto("p", "Cargando catálogo de APIs…", "py-4 text-sm text-stone"));
  let apis = [];
  let fallo = null;
  try {
    const respuesta = await fetchApi("/api/listar", { cache: "no-store" });
    if (!respuesta.ok) throw new Error("el servidor respondió " + respuesta.status);
    const json = await respuesta.json();
    apis = Array.isArray(json.apis) ? json.apis : [];
  } catch (error) {
    fallo = error;
  }
  vaciar(lista);
  if (fallo) {
    const caja = document.createElement("div");
    caja.className = "tarjeta-viva col-span-full rounded-2xl p-5 text-sm text-stone";
    caja.appendChild(texto("p", "No pude leer la lista de APIs (" + (fallo.message || fallo) + ").", ""));
    const reintentar = document.createElement("button");
    reintentar.type = "button";
    reintentar.className = "mt-3 text-clay underline-offset-4 hover:underline";
    reintentar.textContent = "Reintentar";
    reintentar.addEventListener("click", cargarLista);
    caja.appendChild(reintentar);
    lista.appendChild(caja);
    return;
  }
  if (!apis.length) {
    lista.appendChild(
      texto(
        "p",
        "Todavía no hay APIs publicadas. Escribe arriba la primera.",
        "col-span-full py-4 text-sm text-stone"
      )
    );
    return;
  }

  for (const api of apis) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-viva tarjeta-elevada flex flex-col justify-between rounded-2xl p-5";

    const superior = document.createElement("div");
    const cabecera = document.createElement("div");
    cabecera.className = "flex items-start justify-between gap-2";
    cabecera.appendChild(
      enlace(
        api.titulo || api.nombre,
        urlApi(api.ruta || "/api/" + api.nombre),
        "font-display text-xl text-ivory underline-offset-4 hover:text-clay hover:underline"
      )
    );
    cabecera.appendChild(insignia(motorTexto(api.motor), "border-clay/40 text-clay"));
    superior.appendChild(cabecera);

    superior.appendChild(
      texto("p", urlApi(api.ruta || "/api/" + api.nombre), "mt-1 font-mono text-xs tono-exito")
    );

    if (api.resumen) {
      superior.appendChild(texto("p", api.resumen, "mt-2 text-xs leading-relaxed text-stone"));
    }

    if (Array.isArray(api.recursos) && api.recursos.length) {
      const recursosBox = document.createElement("div");
      recursosBox.className = "mt-3 flex flex-wrap gap-1.5";
      for (const rec of api.recursos) {
        const nombreRec = typeof rec === "string" ? rec : rec.nombre;
        if (!nombreRec) continue;
        recursosBox.appendChild(
          texto(
            "span",
            "📦 " + nombreRec,
            "rounded-lg border border-line bg-ink/80 px-2 py-0.5 font-mono text-[11px] text-ivory"
          )
        );
      }
      superior.appendChild(recursosBox);
    }

    const marcas = document.createElement("div");
    marcas.className = "mt-3 flex flex-wrap gap-1.5";
    if (api.soloLectura) marcas.appendChild(insignia("solo lectura", "borde-aviso tono-aviso"));
    if (api.protegida) {
      marcas.appendChild(
        insignia("token · " + (api.modoToken === "todo" ? "todo" : "escritura"), "borde-info tono-info")
      );
    }
    if (api.limites) {
      marcas.appendChild(
        insignia(api.limites.maxRegistrosPorRecurso + " regs · " + Math.round(api.limites.maxBytes / 1024) + " KB")
      );
    }
    if (marcas.childNodes.length) superior.appendChild(marcas);
    tarjeta.appendChild(superior);

    const inferior = document.createElement("div");
    inferior.className = "mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 pt-3 text-xs";

    const enlacesIzq = document.createElement("div");
    enlacesIzq.className = "flex flex-wrap items-center gap-3";
    enlacesIzq.appendChild(
      enlace(
        "Documentación",
        urlApi(api.documentacion || "/docs?api=" + encodeURIComponent(api.nombre)),
        "font-medium text-clay hover:underline"
      )
    );
    enlacesIzq.appendChild(
      enlace(
        "openapi.json",
        urlApi(api.openapi || "/api/" + api.nombre + "/openapi.json"),
        "text-stone hover:text-ivory",
        true
      )
    );
    inferior.appendChild(enlacesIzq);

    const primerRecurso =
      Array.isArray(api.recursos) && api.recursos.length
        ? typeof api.recursos[0] === "string"
          ? api.recursos[0]
          : api.recursos[0].nombre
        : "";
    const rutaPrueba = primerRecurso ? "/api/" + api.nombre + "/" + primerRecurso : "/api/" + api.nombre;

    const botonProbar = texto(
      "button",
      "⚡ Probar en consola",
      "chip-interactivo rounded-lg px-2.5 py-1 font-mono text-[11px] text-ivory"
    );
    botonProbar.type = "button";
    botonProbar.addEventListener("click", () => {
      navegar("probar");
      ejecutarConsola(rutaPrueba);
    });
    inferior.appendChild(botonProbar);

    tarjeta.appendChild(inferior);
    lista.appendChild(tarjeta);
  }
}

/* 7. Opciones, generación y espera de publicación ------------------------- */

function numeroCampo(entrada, defecto, minimo, maximo) {
  const valor = Number(entrada.value);
  if (!Number.isFinite(valor)) return defecto;
  return Math.min(maximo, Math.max(minimo, Math.trunc(valor)));
}

function limitesDelFormulario() {
  return {
    maxRegistrosPorRecurso: numeroCampo(maxRegistrosInput, 500, 1, 5000),
    maxBytes: numeroCampo(maxKbInput, 256, 4, 512) * 1024,
    retencionDias: numeroCampo(retencionInput, 0, 0, 3650),
  };
}

function generarToken() {
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
    throw new Error("Este navegador no puede crear un token seguro. Abre el sitio con HTTPS.");
  }
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return "taller_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(textoPlano) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error("Este navegador no puede calcular la huella del token. Abre el sitio con HTTPS.");
  }
  const datos = new TextEncoder().encode(textoPlano);
  const huellaBinaria = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(huellaBinaria), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function opcionesDeFormulario() {
  let token = "";
  let tokenHash = "";
  let tokenAccion = "quitar";
  if (conTokenInput.checked) {
    token = generarToken();
    tokenHash = await sha256(token);
    tokenAccion = "poner";
  }

  return {
    token,
    cuerpo: {
      soloLectura: soloLecturaInput.checked,
      limites: limitesDelFormulario(),
      tokenAccion,
      tokenHash,
      tokenModo: tokenModoInput.value === "todo" ? "todo" : "escritura",
    },
  };
}

async function pedirApi(payload) {
  const respuesta = await fetchApi("/api/generar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 404 || respuesta.status === 405) {
    const error = new Error(
      "Esta vista no tiene servidor. Abre el sitio publicado en Vercel para que este botón pueda trabajar."
    );
    error.sinServidor = true;
    throw error;
  }
  if (!respuesta.ok) {
    const error = new Error(json.error || "No pude empezar.");
    error.ayuda = json.ayuda || "";
    throw error;
  }
  return json;
}

async function esperarPublicacion(nombre, marca) {
  const inicio = Date.now();
  let fallo = "";
  let avisoMotor = "";

  while (Date.now() - inicio < 300000) {
    await dormir(5000);

    try {
      const respuesta = await fetchApi("/api/estado?nombre=" + encodeURIComponent(nombre), { cache: "no-store" });
      if (respuesta.ok) {
        const json = await respuesta.json();
        if (json.titulo) avisoMotor = motorTexto(json.motor);
        const corrida = json.corrida;
        if (corrida && (corrida.resultado === "failure" || corrida.resultado === "cancelled")) {
          fallo = corrida.url || REPOS + "/actions";
          break;
        }
        if (corrida && (corrida.estado === "queued" || corrida.estado === "in_progress")) {
          estado.textContent =
            "La carpeta se está escribiendo en GitHub… (motor: " + (avisoMotor || "por decidir") + ")";
        }
        if (json.publicada) {
          estado.textContent = "Carpeta lista. Vercel está publicando la función…";
        }
      }
    } catch {
      /* Si el estado no responde, seguimos probando la API directamente. */
    }

    try {
      const respuesta = await fetchApi("/api/" + nombre, { cache: "no-store" });
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
  error.enlace = urlApi("/api/" + nombre);
  throw error;
}

function mostrarResultado(nombre, manifiesto, extras) {
  const caja = resultado;
  extras = extras || {};
  vaciar(caja);
  caja.className = "tarjeta-destacada mt-5 rounded-2xl p-5";
  const enlaceApi = urlApi("/api/" + nombre);

  manifiesto = manifiesto || {};
  caja.appendChild(
    texto(
      "p",
      extras.pendiente ? "⏳ Publicando tu API. Guarda el token abajo." : "🎉 ¡Lista! Tu API ya responde en la nube.",
      "font-display text-xl text-ivory"
    )
  );
  const ancla = enlace(
    enlaceApi,
    urlApi("/api/" + nombre),
    "mt-1 block break-all font-mono text-xs text-clay underline-offset-4 hover:underline",
    true
  );
  caja.appendChild(ancla);

  if (extras.pendiente) {
    caja.appendChild(
      texto(
        "p",
        "La carpeta y la función todavía se están publicando. Esta tarjeta se actualizará sola cuando termine.",
        "mt-2 text-xs leading-relaxed text-stone"
      )
    );
  }
  if (manifiesto.motor) {
    caja.appendChild(texto("p", "Motor: " + motorTexto(manifiesto.motor), "mt-2 text-xs text-stone"));
  }
  if (manifiesto.origen) caja.appendChild(texto("p", "Origen: " + manifiesto.origen, "mt-1 text-xs text-stone"));

  const documentos = document.createElement("div");
  documentos.className = "mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs";
  documentos.appendChild(
    enlace(
      "📖 Abrir Documentación",
      urlApi(manifiesto.documentacion || "/docs?api=" + encodeURIComponent(nombre)),
      "font-medium text-clay underline-offset-4 hover:underline"
    )
  );
  documentos.appendChild(
    enlace(
      "openapi.json",
      urlApi(manifiesto.openapi || "/api/" + nombre + "/openapi.json"),
      "text-stone underline-offset-4 hover:text-ivory hover:underline",
      true
    )
  );
  caja.appendChild(documentos);

  if (extras.token) {
    const cajaToken = document.createElement("div");
    cajaToken.className = "mt-4 rounded-xl border borde-aviso fondo-aviso p-4";
    cajaToken.appendChild(
      texto("p", "🔐 Guarda este token ahora. No se puede recuperar.", "text-sm font-medium tono-aviso")
    );
    const codigo = texto("code", extras.token, "mt-2 block break-all font-mono text-xs text-ivory");
    cajaToken.appendChild(codigo);
    const copiarToken = texto(
      "button",
      "Copiar token",
      "mt-3 rounded-lg border borde-aviso px-3 py-2 text-xs tono-aviso hover:borde-aviso"
    );
    copiarToken.type = "button";
    copiarToken.addEventListener("click", () => copiar(extras.token, copiarToken, "Copiar token"));
    cajaToken.appendChild(copiarToken);
    cajaToken.appendChild(
      texto(
        "p",
        "En el repositorio solo queda su huella SHA-256. Úsalo en Authorization: Bearer <token> o en X-API-Token.",
        "mt-2 text-xs leading-relaxed text-stone"
      )
    );
    caja.appendChild(cajaToken);
  }

  if (manifiesto.limites) {
    caja.appendChild(texto("p", "Límites: " + limitesResumen(manifiesto.limites) + ".", "mt-3 text-xs text-stone"));
  }
  if (manifiesto.normalizacion && manifiesto.normalizacion.campos && manifiesto.normalizacion.campos.length) {
    caja.appendChild(
      texto(
        "p",
        "Normaliza con APIs públicas: " + manifiesto.normalizacion.campos.join(", ") + ".",
        "mt-1 text-xs tono-exito"
      )
    );
  }
  if (manifiesto.autenticacion) {
    caja.appendChild(
      texto(
        "p",
        "Token: " + (manifiesto.autenticacion.modo === "todo" ? "pide para leer y escribir." : "pide para escribir."),
        "mt-1 text-xs text-stone"
      )
    );
  }

  if (Array.isArray(manifiesto.rutas) && manifiesto.rutas.length) {
    const rutas = document.createElement("div");
    rutas.className = "mt-3 space-y-1 border-t border-line pt-3 font-mono text-xs text-stone";
    for (const rutaApi of manifiesto.rutas.slice(0, 14)) rutas.appendChild(texto("p", rutaApi));
    if (manifiesto.rutas.length > 14) {
      rutas.appendChild(texto("p", "… y " + (manifiesto.rutas.length - 14) + " más"));
    }
    caja.appendChild(rutas);

    const primerRecurso = (manifiesto.recursos && manifiesto.recursos[0] && manifiesto.recursos[0].nombre) || "";
    if (primerRecurso) {
      const acciones = document.createElement("div");
      acciones.className = "mt-3 flex flex-wrap gap-2";

      const botonProbarApi = texto("button", "⚡ Probar ahora en la consola", "boton boton-primario text-xs");
      botonProbarApi.type = "button";
      botonProbarApi.addEventListener("click", () => {
        navegar("probar");
        ejecutarConsola("/api/" + nombre + "/" + primerRecurso);
      });
      acciones.appendChild(botonProbarApi);

      const botonCurl = texto("button", "Copiar ejemplo de curl", "boton boton-secundario text-xs");
      botonCurl.type = "button";
      botonCurl.addEventListener("click", () =>
        copiar("curl " + urlApi("/api/" + nombre + "/" + primerRecurso), botonCurl, "Copiar ejemplo de curl")
      );
      acciones.appendChild(botonCurl);
      caja.appendChild(acciones);
    }
  }
  caja.classList.remove("hidden");
  caja.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

forma.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const descripcion = descripcionInput.value.trim().slice(0, 8000);
  const nombre = nombreActual();
  resultado.classList.add("hidden");

  if (!nombre || descripcion.length < 20) {
    estado.textContent = "Escribe un nombre y cuenta las tablas, los campos y las acciones deseadas.";
    return;
  }
  if (!nombreValido(nombre)) {
    estado.textContent =
      "Ese nombre no vale: usa letras minúsculas, números y guiones (2 a 48) y evita rutas internas como docs o generar.";
    return;
  }

  enviar.disabled = true;
  estado.textContent = "Pidiendo la carpeta. Esto usa solo planes gratuitos y tarda uno o dos minutos.";

  let opciones;
  try {
    opciones = await opcionesDeFormulario();
  } catch (error) {
    estado.textContent = error.message;
    enviar.disabled = false;
    return;
  }

  try {
    const json = await pedirApi({
      nombre,
      descripcion,
      secreto: secretoInput.value,
      ...opciones.cuerpo,
    });

    mostrarResultado(
      json.nombre || nombre,
      { documentacion: json.documentacion, openapi: json.openapi },
      { token: opciones.token, pendiente: true }
    );
    const manifiesto = await esperarPublicacion(json.nombre || nombre, huella(descripcion));
    estado.textContent = json.actualiza ? "API actualizada." : "API creada.";
    mostrarResultado(json.nombre || nombre, manifiesto, { token: opciones.token });
    await cargarLista();
  } catch (error) {
    estado.textContent = error.message + " ";
    if (error.enlace) {
      estado.appendChild(enlace("Ver", error.enlace, "text-clay underline-offset-4 hover:underline"));
    }
    if (error.ayuda) {
      estado.appendChild(document.createTextNode(" "));
      estado.appendChild(enlace("Cómo arreglarlo", error.ayuda, "text-clay underline-offset-4 hover:underline"));
    }
  } finally {
    enviar.disabled = false;
  }
});

document.querySelector("#ejemplo").addEventListener("click", () => {
  cargarEscenario(EJEMPLO);
  descripcionInput.focus();
});

const sorprendemeBtn = document.querySelector("#sorprendeme");
if (sorprendemeBtn) {
  let ultimoIndice = 0;
  sorprendemeBtn.addEventListener("click", () => {
    ultimoIndice = (ultimoIndice + 1 + Math.floor(Math.random() * (ESCENARIOS.length - 1))) % ESCENARIOS.length;
    cargarEscenario(ESCENARIOS[ultimoIndice]);
  });
}

document.querySelector("#recargar").addEventListener("click", cargarLista);
nombreInput.addEventListener("input", refrescarMeta);
descripcionInput.addEventListener("input", refrescarMeta);
if (soloLecturaInput) soloLecturaInput.addEventListener("change", refrescarMeta);

conTokenInput.addEventListener("change", () => {
  tokenModoInput.disabled = !conTokenInput.checked;
});
tokenModoInput.disabled = !conTokenInput.checked;

/* 8. Explorador de APIs Públicas sin Clave (#fuentes-publicas) ------------ */

const fuentesCaja = document.querySelector("#fuentes");
const probarFuentesBoton = document.querySelector("#probar-fuentes");
const buscarFuentesInput = document.querySelector("#buscar-fuentes");
const filtrosFuentes = document.querySelectorAll(".filtro-fuente");

let categoriaFuenteActiva = "";
let temporizadorBusquedaFuentes = null;

function tarjetaFuente(fuente, prueba) {
  const tarjeta = document.createElement("article");
  tarjeta.className = "tarjeta-viva tarjeta-elevada flex flex-col justify-between rounded-2xl p-4";

  const arriba = document.createElement("div");
  const cabecera = document.createElement("div");
  cabecera.className = "flex flex-wrap items-center justify-between gap-2";
  cabecera.appendChild(texto("p", fuente.nombre, "text-sm font-semibold text-ivory"));
  cabecera.appendChild(insignia(fuente.categoria || "Varias", "border-clay/40 text-clay"));
  arriba.appendChild(cabecera);

  arriba.appendChild(texto("p", fuente.descripcion || "", "mt-2 text-xs leading-relaxed text-stone"));

  if (Array.isArray(fuente.usos) && fuente.usos.length) {
    const usos = document.createElement("p");
    usos.className = "mt-2 font-mono text-[11px] tono-exito";
    usos.textContent = "✨ Normaliza el campo: " + fuente.usos.join(", ");
    arriba.appendChild(usos);
  }
  tarjeta.appendChild(arriba);

  const pie = document.createElement("div");
  pie.className = "mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2.5 text-xs";

  const enlaces = document.createElement("div");
  enlaces.className = "flex flex-wrap items-center gap-3";
  enlaces.appendChild(enlace("Probar JSON ↗", fuente.ejemplo, "font-medium text-clay hover:underline", true));
  if (fuente.docs) enlaces.appendChild(enlace("Docs", fuente.docs, "text-stone hover:text-ivory", true));
  if (fuente.github) enlaces.appendChild(enlace("GitHub", fuente.github, "text-stone hover:text-ivory", true));
  pie.appendChild(enlaces);

  if (prueba) {
    pie.appendChild(
      insignia(
        prueba.ok
          ? "● " + prueba.ms + " ms"
          : "sin respuesta" + (prueba.estado ? " · HTTP " + prueba.estado : ""),
        prueba.ok ? "borde-exito fondo-exito tono-exito" : "borde-aviso tono-aviso"
      )
    );
  }
  tarjeta.appendChild(pie);
  return tarjeta;
}

async function cargarFuentes(opciones) {
  if (!fuentesCaja) return;
  const probar = Boolean(opciones && opciones.probar);
  const buscar = (buscarFuentesInput && buscarFuentesInput.value.trim()) || "";
  const categoria = categoriaFuenteActiva;

  vaciar(fuentesCaja);
  fuentesCaja.appendChild(
    texto(
      "p",
      probar ? "⚡ Probando latencia en vivo de las fuentes públicas…" : "Cargando catálogo de fuentes públicas…",
      "text-sm text-stone"
    )
  );

  const params = new URLSearchParams({
    limite: "10",
    githubLimite: "18",
  });
  if (buscar) params.set("buscar", buscar);
  if (categoria) params.set("categoria", categoria);
  if (probar) params.set("probar", "1");

  let json = null;
  try {
    const respuesta = await fetchApi("/api/fuentes?" + params.toString(), {
      cache: "no-store",
    });
    json = await respuesta.json();
    if (!respuesta.ok) throw new Error(json.error || "No pude leer las fuentes.");
  } catch (error) {
    vaciar(fuentesCaja);
    fuentesCaja.appendChild(
      texto("p", "No pude cargar las fuentes públicas: " + (error.message || error), "text-sm text-stone")
    );
    return;
  }

  vaciar(fuentesCaja);
  const pruebas = new Map((json.prueba || []).map((item) => [item.id, item]));
  const fuentesCuradas = json.fuentes || [];

  if (fuentesCuradas.length) {
    const rejilla = document.createElement("div");
    rejilla.className = "grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3";
    for (const fuente of fuentesCuradas) rejilla.appendChild(tarjetaFuente(fuente, pruebas.get(fuente.id)));
    fuentesCaja.appendChild(rejilla);
  }

  if (json.github) {
    const bloque = document.createElement("div");
    bloque.className = "tarjeta-viva mt-5 rounded-2xl p-5";

    const titulo = document.createElement("div");
    titulo.className = "flex flex-wrap items-center justify-between gap-2";
    titulo.appendChild(
      texto("h3", "🌐 Descubiertas en GitHub (public-apis/public-apis)", "font-display text-xl text-ivory")
    );
    const insigniasDerecha = document.createElement("div");
    insigniasDerecha.className = "flex flex-wrap items-center gap-2";
    insigniasDerecha.appendChild(
      insignia(
        (json.github.totalCoincidencias != null ? json.github.totalCoincidencias : json.github.total || 0) +
          " coincidencias de " +
          (json.github.total || 0) +
          " sin clave",
        "borde-exito fondo-exito tono-exito"
      )
    );
    titulo.appendChild(insigniasDerecha);
    bloque.appendChild(titulo);

    bloque.appendChild(
      texto(
        "p",
        "Catálogo comunitario bajo licencia MIT filtrado a las APIs que no piden clave y usan HTTPS. Respaldado localmente en catalogos/fuentes-publicas.json.",
        "mt-1.5 text-xs leading-relaxed text-stone"
      )
    );

    if (json.github.fuentes && json.github.fuentes.length) {
      const listaGithub = document.createElement("div");
      listaGithub.className = "mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3";
      for (const fuente of json.github.fuentes) {
        const item = document.createElement("a");
        item.href = fuente.url;
        item.target = "_blank";
        item.rel = "noreferrer";
        item.className =
          "flex flex-col justify-between rounded-xl border border-line bg-ink/80 p-3 transition-colors hover:border-clay";

        const cabItem = document.createElement("div");
        cabItem.className = "flex items-start justify-between gap-2";
        cabItem.appendChild(texto("span", fuente.nombre, "text-xs font-semibold text-clay"));
        cabItem.appendChild(
          texto(
            "span",
            fuente.categoriaEs || fuente.categoria || "",
            "rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-stone"
          )
        );
        item.appendChild(cabItem);

        if (fuente.descripcion) {
          item.appendChild(texto("p", fuente.descripcion, "mt-1.5 line-clamp-2 text-[11px] text-stone"));
        }
        listaGithub.appendChild(item);
      }
      bloque.appendChild(listaGithub);
    } else {
      bloque.appendChild(
        texto("p", "No hay coincidencias con ese filtro. Prueba otra palabra o categoría.", "mt-3 text-xs text-stone")
      );
    }

    const pieGithub = document.createElement("div");
    pieGithub.className = "mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3 text-xs";
    pieGithub.appendChild(
      enlace(
        "Ver JSON completo (/api/fuentes?githubLimite=200) ↗",
        "/api/fuentes?githubLimite=200",
        "font-mono text-clay hover:underline",
        true
      )
    );
    pieGithub.appendChild(
      enlace("Política de Privacidad", urlApi("/privacidad"), "text-stone hover:text-ivory")
    );
    bloque.appendChild(pieGithub);
    fuentesCaja.appendChild(bloque);
  }
}

for (const boton of filtrosFuentes) {
  boton.addEventListener("click", () => {
    categoriaFuenteActiva = boton.getAttribute("data-cat") || "";
    for (const otro of filtrosFuentes) {
      const activo = otro === boton;
      otro.className =
        "filtro-fuente chip-interactivo rounded-lg px-2.5 py-1.5 " + (activo ? "chip-activo" : "text-stone");
    }
    cargarFuentes();
  });
}

if (buscarFuentesInput) {
  buscarFuentesInput.addEventListener("input", () => {
    clearTimeout(temporizadorBusquedaFuentes);
    temporizadorBusquedaFuentes = setTimeout(() => cargarFuentes(), 220);
  });
}

if (probarFuentesBoton) {
  probarFuentesBoton.addEventListener("click", async () => {
    probarFuentesBoton.disabled = true;
    probarFuentesBoton.textContent = "⏳ Midiendo…";
    await cargarFuentes({ probar: true });
    probarFuentesBoton.textContent = "⚡ Medir latencia en vivo";
    setTimeout(() => (probarFuentesBoton.disabled = false), 60000);
  });
}

/* 9. Ajustes: servidor, apariencia y app nativa --------------------------- */

const servidorInput = document.querySelector("#servidor-api");
const guardarServidorBtn = document.querySelector("#guardar-servidor");
const estadoServidor = document.querySelector("#estado-servidor");
const pastillaServidor = document.querySelector("#pastilla-servidor");
const textoServidor = document.querySelector("#texto-servidor");
const botonCompartir = document.querySelector("#compartir-app");
const botonLimpiar = document.querySelector("#limpiar-datos");
const avisoRed = document.querySelector("#aviso-red");

function anfitrionVisible() {
  if (servidorApi) {
    try {
      return new URL(servidorApi).host;
    } catch {
      return servidorApi;
    }
  }
  return location.host || "este dispositivo";
}

function pintarServidor() {
  if (servidorInput) {
    servidorInput.value = servidorApi;
    servidorInput.placeholder = CONFIG.nativo
      ? "https://tu-sitio.vercel.app"
      : location.origin || "https://tu-sitio.vercel.app";
  }
  if (textoServidor) textoServidor.textContent = CONFIG.nativo ? "App" : "Nube";
  if (pastillaServidor) pastillaServidor.title = "Servidor: " + (servidorApi || location.origin);
}

function aplicarServidor(valor, opciones) {
  const limpio = normalizarServidor(valor);
  const avisar = !opciones || opciones.avisar !== false;
  if (valor && !limpio) {
    if (estadoServidor) {
      estadoServidor.textContent =
        "Esa dirección no es válida. Escribe una URL completa con https://, por ejemplo https://tu-sitio.vercel.app";
    }
    return false;
  }
  servidorApi = limpio;
  guardarPreferencia(CLAVE_SERVIDOR, limpio);
  pintarServidor();
  if (avisar && estadoServidor) {
    estadoServidor.textContent = limpio
      ? "Guardado. Las peticiones irán a " + limpio + "."
      : "Usando el mismo origen de la web (" + location.origin + ").";
  }
  cargarTelemetria();
  cargarLista();
  if (!fuentesVacia()) cargarFuentes();
  actualizarCodigoConsola();
  if (!document.querySelector('[data-panel-vista="probar"]').classList.contains("activo")) {
    /* la consola se ejecutará cuando el usuario entre; no gastamos peticiones */
  } else {
    ejecutarConsola();
  }
  return true;
}

if (guardarServidorBtn) {
  guardarServidorBtn.addEventListener("click", () => {
    const valor = servidorInput ? servidorInput.value.trim().replace(/\/+$/, "") : "";
    if (!aplicarServidor(valor)) return;
    guardarServidorBtn.textContent = "Guardado ✓";
    setTimeout(() => (guardarServidorBtn.textContent = "Guardar"), 1800);
  });
}

const reintentarConexion = document.querySelector("#reintentar-conexion");
if (reintentarConexion) reintentarConexion.addEventListener("click", cargarTelemetria);

if (botonCompartir) {
  botonCompartir.addEventListener("click", async () => {
    const destino = servidorApi || location.origin;
    const datos = {
      titulo: "Taller de APIs",
      texto: "Diseña, publica y prueba APIs reales gratis desde el móvil.",
      url: destino,
    };
    try {
      if (window.TALLER_NATIVO && typeof window.TALLER_NATIVO.compartir === "function") {
        await window.TALLER_NATIVO.compartir(datos);
      } else if (navigator.share) {
        await navigator.share(datos);
      } else {
        await navigator.clipboard.writeText(datos.url);
        botonCompartir.textContent = "Enlace copiado ✓";
        setTimeout(() => (botonCompartir.textContent = "Compartir"), 1800);
      }
    } catch {
      /* el usuario canceló o no hay share disponible */
    }
  });
}

if (botonLimpiar) {
  botonLimpiar.addEventListener("click", () => {
    const seguro = window.confirm("¿Borrar tema, acento y servidor guardados en este dispositivo?");
    if (!seguro) return;
    for (const clave of ["taller:tema", "taller:acento", CLAVE_SERVIDOR]) guardarPreferencia(clave, null);
    servidorApi = normalizarServidor(CONFIG.apiBase);
    pintarServidor();
    aplicarTema("tema-claro");
    aplicarAcento("acento-indigo");
    if (estadoServidor) estadoServidor.textContent = "Preferencias borradas. Se usan los valores por defecto.";
    cargarTelemetria();
  });
}

function pintarEstadoNativo(extra) {
  const datos = extra || {};
  const modo = document.querySelector("#nativo-modo");
  const version = document.querySelector("#nativo-version");
  const plataforma = document.querySelector("#nativo-plataforma");
  const red = document.querySelector("#nativo-red");
  if (modo) modo.textContent = CONFIG.nativo ? "App nativa" : "Web";
  if (version) version.textContent = "v" + CONFIG.version;
  if (plataforma) plataforma.textContent = datos.plataforma || (CONFIG.nativo ? "Capacitor" : "Navegador");
  if (red) red.textContent = datos.red || (navigator.onLine ? "En línea" : "Sin conexión");
}

function vigilarRed(conectado) {
  if (avisoRed) avisoRed.classList.toggle("hidden", conectado);
  const red = document.querySelector("#nativo-red");
  if (red) red.textContent = conectado ? "En línea" : "Sin conexión";
  if (conectado) cargarTelemetria();
}

window.addEventListener("online", () => vigilarRed(true));
window.addEventListener("offline", () => vigilarRed(false));

async function iniciarNativo() {
  pintarEstadoNativo();
  if (!CONFIG.nativo) return;
  const insignia = document.querySelector("#insignia-app");
  if (insignia) insignia.classList.remove("hidden");
  const ctaDescarga = document.querySelector("#cta-descarga");
  if (ctaDescarga) {
    ctaDescarga.textContent = "Compartir la app";
    ctaDescarga.setAttribute("data-ir", "ajustes");
  }
  try {
    const modulo = await import("./nativo.js");
    if (modulo && typeof modulo.iniciarNativo === "function") {
      const info = await modulo.iniciarNativo({
        panel: () => panelActivo,
        irA: (panel) => navegar(panel),
        alCambiarRed: (conectado) => vigilarRed(conectado),
      });
      pintarEstadoNativo(info || {});
    }
  } catch (error) {
    console.warn("No pude iniciar el puente nativo:", error);
  }
}

/* Inicialización con escenario vivo para que nunca luzca vacío ----------- */

pintarServidor();
navegar(panelDelHash() || "inicio", { silencio: true });
cargarEscenario(ESCENARIOS[0]);
cargarTelemetria();
cargarLista();
actualizarCodigoConsola();
ejecutarConsola("/api/ejemplo-notas/notas");
if (fuentesCaja) cargarFuentes();
vigilarRed(navigator.onLine !== false);
iniciarNativo();
