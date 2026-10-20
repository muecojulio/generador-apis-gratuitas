// La página del taller. Todo el trabajo pesado vive en el servidor:
// aquí solo se lee el formulario, se piden APIs y se informa del resultado.

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

const soloLecturaInput = document.querySelector("#solo-lectura");
const conTokenInput = document.querySelector("#con-token");
const tokenModoInput = document.querySelector("#token-modo");
const maxRegistrosInput = document.querySelector("#max-registros");
const retencionInput = document.querySelector("#retencion");
const maxKbInput = document.querySelector("#max-kb");

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

function motorTexto(motor) {
  if (!motor) return "incluido";
  return MOTORES[motor] || motor;
}

const RESERVADOS = new Set([
  "api",
  "assets",
  "data",
  "docs",
  "estado",
  "generar",
  "index",
  "lib",
  "listar",
  "public",
  "salud",
  "scripts",
  "spec",
  "specs",
  "static",
]);

function nombreValido(nombre) {
  return (
    typeof nombre === "string" &&
    nombre.length >= 2 &&
    nombre.length <= 48 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nombre) &&
    !RESERVADOS.has(nombre)
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
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
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
  return texto("span", contenido, "rounded-full border px-2 py-0.5 text-[11px] " + (clase || "border-line text-stone"));
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
    nodo.textContent = "Copiado";
    setTimeout(() => (nodo.textContent = etiqueta || antes), 1800);
  } catch {
    nodo.textContent = "No se pudo copiar";
  }
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
    const fila = document.createElement("div");
    fila.className = "flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between";

    const izquierda = document.createElement("div");
    izquierda.appendChild(
      enlace(
        api.titulo || api.nombre,
        api.ruta || "/api/" + api.nombre,
        "font-medium text-ivory underline-offset-4 hover:text-clay hover:underline"
      )
    );
    const meta = document.createElement("p");
    meta.className = "mt-1 font-mono text-xs text-stone";
    meta.textContent = (api.ruta || "/api/" + api.nombre) + "  ·  " + motorTexto(api.motor);
    izquierda.appendChild(meta);

    const marcas = document.createElement("div");
    marcas.className = "mt-2 flex flex-wrap gap-2";
    if (api.soloLectura) marcas.appendChild(insignia("solo lectura", "border-amber-500/40 text-amber-300"));
    if (api.protegida) {
      marcas.appendChild(
        insignia("token · " + (api.modoToken === "todo" ? "todo" : "escritura"), "border-sky-500/40 text-sky-300")
      );
    }
    if (api.limites) {
      marcas.appendChild(insignia(api.limites.maxRegistrosPorRecurso + " regs · " + Math.round(api.limites.maxBytes / 1024) + " KB"));
    }
    if (marcas.childNodes.length) izquierda.appendChild(marcas);

    const derecha = document.createElement("div");
    derecha.className = "flex flex-wrap items-center gap-3 text-xs";
    derecha.appendChild(
      enlace("Documentación", api.documentacion || "/docs?api=" + encodeURIComponent(api.nombre), "text-clay hover:underline")
    );
    derecha.appendChild(
      enlace("openapi.json", api.openapi || "/api/" + api.nombre + "/openapi.json", "text-stone hover:text-ivory", true)
    );
    derecha.appendChild(
      enlace("Abrir API", api.ruta || "/api/" + api.nombre, "text-stone hover:text-ivory", true)
    );

    fila.appendChild(izquierda);
    fila.appendChild(derecha);
    lista.appendChild(fila);
  }
}

/* Opciones: solo lectura, límites y token -------------------------------- */

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
  const respuesta = await fetch("/api/generar", {
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
        if (json.titulo) avisoMotor = motorTexto(json.motor);
        const corrida = json.corrida;
        if (corrida && (corrida.resultado === "failure" || corrida.resultado === "cancelled")) {
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

function mostrarResultado(nombre, manifiesto, extras) {
  const caja = resultado;
  extras = extras || {};
  vaciar(caja);
  caja.className = "mt-5 rounded-xl border border-line bg-ink p-4";
  const enlaceApi = location.origin + "/api/" + nombre;

  manifiesto = manifiesto || {};
  caja.appendChild(
    texto(
      "p",
      extras.pendiente
        ? "Publicando. Guarda el token que aparece abajo."
        : "¡Lista! Tu API ya responde.",
      "font-medium text-ivory"
    )
  );
  const ancla = enlace(enlaceApi, "/api/" + nombre, "mt-1 block break-all font-mono text-xs text-clay underline-offset-4 hover:underline", true);
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
      "Documentación",
      manifiesto.documentacion || "/docs?api=" + encodeURIComponent(nombre),
      "text-clay underline-offset-4 hover:underline"
    )
  );
  documentos.appendChild(
    enlace(
      "openapi.json",
      manifiesto.openapi || "/api/" + nombre + "/openapi.json",
      "text-stone underline-offset-4 hover:text-ivory hover:underline",
      true
    )
  );
  caja.appendChild(documentos);

  if (extras.token) {
    const cajaToken = document.createElement("div");
    cajaToken.className = "mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4";
    cajaToken.appendChild(
      texto("p", "Guarda este token ahora. No se puede recuperar.", "text-sm font-medium text-amber-200")
    );
    const codigo = texto("code", extras.token, "mt-2 block break-all font-mono text-xs text-ivory");
    cajaToken.appendChild(codigo);
    const copiarToken = texto(
      "button",
      "Copiar token",
      "mt-3 rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-200 hover:border-amber-300"
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
    if (manifiesto.rutas.length > 14) rutas.appendChild(texto("p", "… y " + (manifiesto.rutas.length - 14) + " más"));
    caja.appendChild(rutas);

    const primerRecurso = (manifiesto.recursos && manifiesto.recursos[0] && manifiesto.recursos[0].nombre) || "";
    if (primerRecurso) {
      const botonCurl = texto(
        "button",
        "Copiar ejemplo de curl",
        "mt-3 rounded-lg border border-line px-3 py-2 text-xs text-ivory hover:border-clay hover:text-clay"
      );
      botonCurl.type = "button";
      botonCurl.addEventListener("click", () =>
        copiar("curl " + location.origin + "/api/" + nombre + "/" + primerRecurso, botonCurl)
      );
      caja.appendChild(botonCurl);
    }
  }
  caja.classList.remove("hidden");
  caja.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* Envío del formulario principal */

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
    estado.textContent = "Ese nombre no vale: usa letras minúsculas, números y guiones (2 a 48) y evita rutas internas como docs o generar.";
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
  nombreInput.value = EJEMPLO.nombre;
  descripcionInput.value = EJEMPLO.texto;
  refrescarMeta();
  descripcionInput.focus();
});

document.querySelector("#recargar").addEventListener("click", cargarLista);
nombreInput.addEventListener("input", refrescarMeta);
descripcionInput.addEventListener("input", refrescarMeta);

conTokenInput.addEventListener("change", () => {
  tokenModoInput.disabled = !conTokenInput.checked;
});
tokenModoInput.disabled = !conTokenInput.checked;

refrescarMeta();
cargarLista();
