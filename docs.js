// Explorador interactivo OpenAPI 3.0 del Taller Vivo.
// Lee /api/<nombre>/openapi.json (generado desde el plano) y lo pinta sin
// dependencias externas, con generador de código en cURL, JavaScript y Python.

const METODOS = ["get", "post", "put", "delete"];
const COLORES = {
  get: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  post: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  put: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  delete: "border-rose-500/40 bg-rose-500/15 text-rose-300",
};
const BOTON =
  "chip-interactivo rounded-lg px-3 py-2 text-xs text-ivory disabled:cursor-not-allowed disabled:opacity-50";

const parametroApi = new URLSearchParams(location.search).get("api");
const selector = document.querySelector("#selector");
const tituloPagina = document.querySelector("#titulo");
const resumenPagina = document.querySelector("#resumen");
const aviso = document.querySelector("#aviso");
const contenido = document.querySelector("#contenido");

let apis = [];

/* Selector de atmósfera visual sincronizado con la portada ---------------- */

const TEMAS = ["tema-fragua", "tema-nebulosa", "tema-bosque"];
const botonesTema = document.querySelectorAll(".boton-tema");

function aplicarTema(tema) {
  const elegido = TEMAS.includes(tema) ? tema : "tema-fragua";
  const raiz = document.documentElement;
  for (const clase of TEMAS) raiz.classList.remove(clase);
  raiz.classList.add(elegido);
  for (const boton of botonesTema) {
    const activo = boton.getAttribute("data-tema") === elegido;
    boton.className =
      "boton-tema rounded-full px-2.5 py-1 font-medium transition-all " +
      (activo ? "chip-activo" : "text-stone hover:text-ivory");
  }
  try {
    localStorage.setItem("taller:tema", elegido);
  } catch {
    /* sin almacenamiento local */
  }
}

try {
  const guardado = localStorage.getItem("taller:tema");
  if (guardado) aplicarTema(guardado);
} catch {
  /* continúa con tema por defecto */
}

for (const boton of botonesTema) {
  boton.addEventListener("click", () => aplicarTema(boton.getAttribute("data-tema")));
}

function h(etiqueta, propiedades, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(propiedades || {})) {
    if (clave === "class") nodo.className = valor;
    else if (clave === "text") nodo.textContent = valor;
    else if (clave.startsWith("on") && typeof valor === "function") {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (valor !== undefined && valor !== null) {
      nodo.setAttribute(clave, valor);
    }
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.appendChild(
      typeof hijo === "string" || typeof hijo === "number" ? document.createTextNode(String(hijo)) : hijo
    );
  }
  return nodo;
}

function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

function avisar(texto, clase) {
  aviso.className =
    "mt-6 rounded-xl border p-4 text-sm leading-relaxed " + (clase || "border-line bg-panel text-stone");
  aviso.textContent = texto;
}

function ocultarAviso() {
  aviso.className = "mt-6 hidden";
  aviso.textContent = "";
}

function pascal(texto) {
  return (
    String(texto || "")
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join("") || "Recurso"
  );
}

function insignia(texto, tono) {
  return h(
    "span",
    {
      class: "rounded-full border px-3 py-1 text-xs " + (tono || "border-line text-stone"),
    },
    texto
  );
}

function boton(texto, alPulsar, extra) {
  const nodo = h("button", { type: "button", class: BOTON + (extra ? " " + extra : "") }, texto);
  if (alPulsar) nodo.addEventListener("click", alPulsar);
  return nodo;
}

async function traer(url) {
  const respuesta = await fetch(url, { cache: "no-store" });
  const texto = await respuesta.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  return { respuesta, json, texto };
}

/* Lista y selector ------------------------------------------------------- */

async function cargarLista() {
  try {
    const { respuesta, json } = await traer("/api/listar");
    if (respuesta.ok && json && Array.isArray(json.apis)) apis = json.apis;
  } catch {
    apis = [];
  }
  pintarSelector();
}

function pintarSelector() {
  vaciar(selector);
  selector.appendChild(h("option", { value: "" }, "🌐 Todas las APIs del taller"));
  let encontrada = false;
  for (const api of apis) {
    const opcion = h("option", { value: api.nombre }, (api.titulo || api.nombre) + " (/api/" + api.nombre + ")");
    if (api.nombre === parametroApi) {
      opcion.selected = true;
      encontrada = true;
    }
    selector.appendChild(opcion);
  }
  if (parametroApi && !encontrada) {
    selector.appendChild(h("option", { value: parametroApi, selected: "" }, parametroApi));
  }
  selector.addEventListener("change", () => {
    location.href = selector.value ? "/docs?api=" + encodeURIComponent(selector.value) : "/docs";
  });
}

/* Fuentes públicas y proveedores de IA ----------------------------------- */

async function cargarExtras(contenedor) {
  try {
    const [fuentes, proveedores] = await Promise.all([
      traer("/api/fuentes?limite=8&githubLimite=0").then((r) => r.json),
      traer("/api/proveedores").then((r) => r.json),
    ]);
    contenedor.querySelector("[data-cargando]")?.remove();
    const listaFuentes = h("div", { class: "mt-3 flex flex-wrap gap-2" });
    for (const fuente of (fuentes && fuentes.fuentes) || []) {
      listaFuentes.appendChild(
        h(
          "a",
          {
            href: fuente.ejemplo,
            target: "_blank",
            rel: "noreferrer",
            class: "chip-interactivo rounded-full px-3 py-1 text-xs text-stone hover:text-clay",
          },
          "🌍 " + fuente.nombre
        )
      );
    }
    if (listaFuentes.childNodes.length) {
      contenedor.appendChild(
        h("p", { class: "mt-4 text-xs uppercase tracking-wider text-stone" }, "Conectores públicos sin clave")
      );
      contenedor.appendChild(listaFuentes);
    }
    if (fuentes && fuentes.github) {
      contenedor.appendChild(
        h(
          "p",
          { class: "mt-3 text-xs leading-relaxed text-stone" },
          "Además hay " + fuentes.github.total + " APIs sin clave descubiertas en public-apis. ",
          h("a", { href: "/api/fuentes?githubLimite=200", class: "text-clay hover:underline" }, "Ver el catálogo")
        )
      );
    }
    if (proveedores) {
      const cajaProveedores = h("div", { id: "proveedores" });
      const orden = (proveedores.orden || []).join(" → ");
      cajaProveedores.appendChild(
        h(
          "p",
          { class: "mt-3 text-xs leading-relaxed text-stone" },
          "Modelos IA: " + (orden || "lector incluido") + ". ",
          h("a", { href: "/api/proveedores", class: "text-clay hover:underline" }, "Ver estado"),
          "."
        )
      );
      const conClave = (proveedores.conClave || []).filter((item) => item.configurado).length;
      cajaProveedores.appendChild(
        h(
          "p",
          { class: "mt-1 text-xs leading-relaxed text-stone" },
          conClave
            ? "Hay " + conClave + " proveedor(es) con clave configurada como respaldo."
            : "No hay claves de IA configuradas: si los servicios públicos fallan, se usa el lector incluido."
        )
      );
      contenedor.appendChild(cajaProveedores);
    }
  } catch {
    contenedor.querySelector("[data-cargando]")?.remove();
    contenedor.appendChild(
      h("p", { class: "mt-3 text-xs leading-relaxed text-stone" }, "No pude cargar las fuentes públicas ahora mismo.")
    );
  }
}

/* Portada de documentación ---------------------------------------------- */

function renderIndice() {
  document.title = "Explorador OpenAPI — Taller Vivo de APIs";
  tituloPagina.textContent = "Explorador OpenAPI 3.0";
  resumenPagina.textContent =
    "Cada API del taller publica un documento OpenAPI generado desde su plano. Elige una para explorar recursos, campos, límites y probar peticiones en vivo.";
  vaciar(contenido);

  if (!apis.length) {
    contenido.appendChild(
      h(
        "div",
        { class: "tarjeta-viva rounded-[24px] p-6" },
        h("h2", { class: "font-display text-2xl" }, "Todavía no hay APIs publicadas"),
        h(
          "p",
          { class: "mt-2 max-w-xl text-sm leading-relaxed text-stone" },
          "Escribe una descripción en la página principal. En uno o dos minutos aparecerá aquí su documentación."
        ),
        h(
          "a",
          {
            href: "/",
            class: "boton-brillo mt-4 inline-block rounded-xl px-4 py-2.5 text-sm font-semibold",
          },
          "Crear la primera API"
        )
      )
    );
    return;
  }

  const rejilla = h("div", { class: "grid gap-5 md:grid-cols-2 lg:grid-cols-3" });
  for (const api of apis) {
    const ficha = h("article", {
      class: "tarjeta-viva tarjeta-elevada flex flex-col justify-between rounded-[22px] p-5",
    });
    const superior = h("div", {});
    const encabezado = h("div", { class: "flex flex-wrap items-start justify-between gap-2" });
    encabezado.appendChild(
      h(
        "a",
        {
          href: "/docs?api=" + encodeURIComponent(api.nombre),
          class: "font-display text-2xl text-ivory underline-offset-4 hover:text-clay hover:underline",
        },
        api.titulo || api.nombre
      )
    );
    superior.appendChild(encabezado);
    superior.appendChild(h("p", { class: "mt-1 font-mono text-xs text-emerald-300" }, "/api/" + api.nombre));
    if (api.resumen) {
      superior.appendChild(h("p", { class: "mt-2 text-sm leading-relaxed text-stone" }, api.resumen));
    }

    const marcas = h("div", { class: "mt-3 flex flex-wrap gap-2" });
    if (api.soloLectura) marcas.appendChild(insignia("Solo lectura", "border-amber-500/40 text-amber-300"));
    if (api.protegida) {
      marcas.appendChild(
        insignia("Token · " + (api.modoToken === "todo" ? "todo" : "escritura"), "border-sky-500/40 text-sky-300")
      );
    }
    if (api.recursos && api.recursos.length) {
      marcas.appendChild(
        insignia(
          "📦 " + api.recursos.length + " recurso" + (api.recursos.length === 1 ? "" : "s"),
          "border-clay/40 text-clay"
        )
      );
    }
    if (marcas.childNodes.length) superior.appendChild(marcas);

    if (api.limites) {
      superior.appendChild(
        h(
          "p",
          { class: "mt-3 text-xs leading-relaxed text-stone" },
          "Máximo " +
            api.limites.maxRegistrosPorRecurso +
            " registros por recurso · " +
            Math.round(api.limites.maxBytes / 1024) +
            " KB" +
            (api.limites.retencionDias
              ? " · retención de " + api.limites.retencionDias + " días"
              : " · sin borrado automático")
        )
      );
    }
    ficha.appendChild(superior);

    const enlaces = h(
      "div",
      { class: "mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs" },
      h(
        "a",
        {
          href: "/docs?api=" + encodeURIComponent(api.nombre),
          class: "chip-interactivo rounded-lg px-3 py-1.5 font-medium text-clay",
        },
        "📖 Abrir Estudio OpenAPI →"
      ),
      h(
        "div",
        { class: "flex items-center gap-3" },
        h(
          "a",
          { href: "/api/" + api.nombre, class: "text-stone hover:text-ivory", target: "_blank", rel: "noreferrer" },
          "API"
        ),
        h(
          "a",
          {
            href: "/api/" + api.nombre + "/openapi.json",
            class: "text-stone hover:text-ivory",
            target: "_blank",
            rel: "noreferrer",
          },
          "openapi.json"
        )
      )
    );
    ficha.appendChild(enlaces);
    rejilla.appendChild(ficha);
  }
  contenido.appendChild(rejilla);

  const extras = h("section", { id: "fuentes-publicas", class: "tarjeta-viva mt-8 rounded-[24px] p-6" });
  extras.appendChild(h("h2", { class: "font-display text-2xl" }, "Fuentes públicas y cadena de modelos IA"));
  extras.appendChild(
    h(
      "p",
      { class: "mt-2 text-sm leading-relaxed text-stone" },
      "El taller normaliza países, monedas y ciudades con servicios sin clave y usa modelos gratuitos: primero los públicos y, si no responden, los que se activan con una variable de entorno."
    )
  );
  const cargandoExtras = h(
    "p",
    { class: "mt-3 text-xs text-stone", "data-cargando": "1" },
    "Cargando fuentes públicas…"
  );
  extras.appendChild(cargandoExtras);
  contenido.appendChild(extras);
  cargarExtras(extras);
}

/* Documento de una API --------------------------------------------------- */

function enlaceExterno(texto, url) {
  return h(
    "a",
    {
      href: url,
      target: "_blank",
      rel: "noreferrer",
      class: "text-clay underline-offset-4 hover:underline",
    },
    texto
  );
}

function panelAuth(x, nombre) {
  if (!x.autenticacion) {
    return {
      nodo: h(
        "section",
        { class: "tarjeta-viva rounded-[22px] p-5" },
        h("h2", { class: "font-display text-2xl" }, "🔓 Acceso Abierto (Sin token)"),
        h(
          "p",
          { class: "mt-2 text-sm leading-relaxed text-stone" },
          "Esta API no pide autenticación: cualquiera puede leer y escribir. Si quieres protegerla, vuelve a generarla con la opción de token SHA-256."
        ),
        h(
          "a",
          { href: "/", class: "mt-3 inline-block text-sm text-clay hover:underline" },
          "Crear una versión con token →"
        )
      ),
      entrada: null,
    };
  }

  const clave = "taller:token:" + nombre;
  let guardado = "";
  try {
    guardado = sessionStorage.getItem(clave) || "";
  } catch {
    guardado = "";
  }
  const entrada = h("input", {
    type: "password",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "Pega aquí el token de esta API",
    class:
      "mt-3 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-sm text-ivory placeholder:text-stone/70",
  });
  entrada.value = guardado;
  const mensaje = h(
    "p",
    { class: "mt-2 text-xs text-stone" },
    guardado ? "Hay un token guardado en esta pestaña." : ""
  );

  const guardar = boton("Guardar en esta pestaña", () => {
    try {
      if (entrada.value.trim()) sessionStorage.setItem(clave, entrada.value.trim());
      else sessionStorage.removeItem(clave);
      mensaje.textContent = entrada.value.trim()
        ? "Token guardado solo en esta pestaña. Se usa al probar lecturas."
        : "Token borrado de esta pestaña.";
    } catch {
      mensaje.textContent = "Este navegador no permite guardar el token; puedes pegarlo y probar igual.";
    }
  });
  const borrar = boton("Borrar", () => {
    entrada.value = "";
    try {
      sessionStorage.removeItem(clave);
    } catch {
      /* nada */
    }
    mensaje.textContent = "Token borrado de esta pestaña.";
  });

  const modo =
    x.autenticacion && x.autenticacion.modo === "todo"
      ? "Todas las peticiones, incluidas las lecturas, piden token."
      : "Las lecturas son públicas; crear, actualizar y borrar piden token.";
  return {
    nodo: h(
      "section",
      { class: "tarjeta-viva rounded-[22px] p-5" },
      h("h2", { class: "font-display text-2xl" }, "🔐 Protección por Token SHA-256"),
      h("p", { class: "mt-2 text-sm leading-relaxed text-stone" }, modo),
      h(
        "p",
        { class: "mt-2 text-xs leading-relaxed text-stone" },
        "El plano del repositorio solo guarda la huella SHA-256. El token se creó en el navegador y no está escrito en ninguna parte del proyecto."
      ),
      entrada,
      h("div", { class: "mt-3 flex flex-wrap gap-2" }, guardar, borrar),
      mensaje,
      h(
        "p",
        { class: "mt-3 text-xs leading-relaxed text-stone" },
        "Cabeceras: ",
        h("code", { class: "text-ivory" }, "Authorization: Bearer <token>"),
        " o ",
        h("code", { class: "text-ivory" }, "X-API-Token: <token>"),
        "."
      )
    ),
    entrada,
  };
}

function panelLimites(x) {
  const limites = x.limites || {};
  return h(
    "section",
    { class: "tarjeta-viva rounded-[22px] p-5" },
    h("h2", { class: "font-display text-2xl" }, "⚖️ Cuotas y Retención"),
    h(
      "p",
      { class: "mt-3 text-sm leading-relaxed text-stone" },
      "Máximo " + (limites.maxRegistrosPorRecurso || "—") + " registros por recurso."
    ),
    h(
      "p",
      { class: "mt-1 text-sm leading-relaxed text-stone" },
      "Tamaño máximo del archivo de datos: " + Math.round((limites.maxBytes || 0) / 1024) + " KB."
    ),
    h(
      "p",
      { class: "mt-1 text-sm leading-relaxed text-stone" },
      limites.retencionDias
        ? "Retención: los registros de más de " + limites.retencionDias + " días se descartan al leer o escribir."
        : "Retención: sin borrado automático (0 días)."
    ),
    h(
      "p",
      { class: "mt-3 text-xs leading-relaxed text-stone" },
      "Las respuestas incluyen X-Limite-Registros, ETag y soporte condicional 304."
    )
  );
}

function tablaEsquema(recurso, esquema) {
  const requeridos = new Set(esquema.required || []);
  const filas = [];
  for (const [nombre, campo] of Object.entries(esquema.properties || {})) {
    const sistema = ["id", "creado", "actualizado"].includes(nombre);
    let tipo = campo.type || "object";
    if (campo.format) tipo += " · " + campo.format;
    if (Array.isArray(campo.enum)) tipo += " · uno de: " + campo.enum.join(", ");
    const reglas = [];
    if (campo.minLength !== undefined) reglas.push("mín. " + campo.minLength + " caracteres");
    if (campo.maxLength !== undefined) reglas.push("máx. " + campo.maxLength + " caracteres");
    if (campo.minimum !== undefined) reglas.push("mín. " + campo.minimum);
    if (campo.maximum !== undefined) reglas.push("máx. " + campo.maximum);
    filas.push(
      h(
        "tr",
        { class: "border-t border-line/80 align-top" },
        h(
          "td",
          { class: "py-2.5 pr-3 font-mono text-xs text-ivory" },
          nombre,
          sistema
            ? h(
                "span",
                { class: "ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] text-stone" },
                "sistema"
              )
            : null
        ),
        h("td", { class: "py-2.5 pr-3 font-mono text-xs text-sky-300" }, tipo),
        h(
          "td",
          { class: "py-2.5 pr-3 text-xs " + (requeridos.has(nombre) ? "font-semibold text-clay" : "text-stone") },
          requeridos.has(nombre) ? "Sí" : "No"
        ),
        h("td", { class: "py-2.5 text-xs text-stone" }, reglas.join(" · ") || campo.description || "—")
      )
    );
  }
  return h(
    "div",
    { class: "tarjeta-viva mt-3 overflow-x-auto rounded-2xl p-4" },
    h(
      "table",
      { class: "w-full min-w-[520px] text-left" },
      h(
        "thead",
        {},
        h(
          "tr",
          { class: "text-[11px] uppercase tracking-wider text-stone" },
          h("th", { class: "pb-2 pr-3 font-medium" }, "Campo"),
          h("th", { class: "pb-2 pr-3 font-medium" }, "Tipo"),
          h("th", { class: "pb-2 pr-3 font-medium" }, "Obligatorio"),
          h("th", { class: "pb-2 font-medium" }, "Reglas")
        )
      ),
      h("tbody", {}, filas)
    )
  );
}

function ejemploCuerpo(op) {
  try {
    return op.requestBody.content["application/json"].example || null;
  } catch {
    return null;
  }
}

function rutaDeEjemplo(ruta, op) {
  let salida = ruta;
  for (const parametro of op.parameters || []) {
    if (parametro.in !== "path") continue;
    const valor = (parametro.schema && (parametro.schema.example || parametro.example)) || "id";
    salida = salida.replace("{" + parametro.name + "}", String(valor));
  }
  return salida;
}

function snippetDe(lenguaje, metodo, ruta, op) {
  const urlCompleta = location.origin + rutaDeEjemplo(ruta, op);
  const cuerpo = ejemploCuerpo(op);
  const m = metodo.toUpperCase();

  if (lenguaje === "js") {
    const opciones = [`  method: "${m}"`];
    const headers = {};
    if (cuerpo) headers["Content-Type"] = "application/json";
    if (op.security) headers.Authorization = "Bearer TU_TOKEN";
    if (Object.keys(headers).length) {
      opciones.push("  headers: " + JSON.stringify(headers));
    }
    if (cuerpo) {
      opciones.push("  body: JSON.stringify(" + JSON.stringify(cuerpo) + ")");
    }
    return [
      'const res = await fetch("' + urlCompleta + '", {',
      opciones.join(",\n"),
      "});",
      "const datos = await res.json();",
      "console.log(res.status, datos);",
    ].join("\n");
  }

  if (lenguaje === "python") {
    const args = ['"' + urlCompleta + '"'];
    if (op.security) args.push('headers={"Authorization": "Bearer TU_TOKEN"}');
    if (cuerpo) args.push("json=" + JSON.stringify(cuerpo));
    return ["import requests", "", "r = requests." + metodo.toLowerCase() + "(" + args.join(", ") + ")", "print(r.status_code, r.json())"].join("\n");
  }

  let comando = "curl -X " + m + ' "' + urlCompleta + '"';
  if (cuerpo) {
    comando += ' \\\n  -H "Content-Type: application/json" \\\n  -d ' + "'" + JSON.stringify(cuerpo) + "'";
  }
  if (op.security) comando += ' \\\n  -H "Authorization: Bearer TU_TOKEN"';
  return comando;
}

function tarjetaEndpoint(ruta, metodo, op, token) {
  const tarjeta = h("article", { class: "tarjeta-viva rounded-2xl p-5" });
  const cabecera = h("div", { class: "flex flex-wrap items-center gap-3" });
  cabecera.appendChild(
    h(
      "span",
      { class: "rounded-md border px-2.5 py-1 font-mono text-xs font-bold uppercase " + COLORES[metodo] },
      metodo
    )
  );
  cabecera.appendChild(h("code", { class: "break-all font-mono text-sm text-ivory" }, ruta));
  if (op.security) {
    cabecera.appendChild(insignia("🔐 token", "border-sky-500/40 text-sky-300"));
  }
  tarjeta.appendChild(cabecera);
  tarjeta.appendChild(h("p", { class: "mt-2 text-sm font-medium text-ivory" }, op.summary || ""));
  if (op.description) {
    tarjeta.appendChild(h("p", { class: "mt-1 text-xs leading-relaxed text-stone" }, op.description));
  }

  // Bloque multilingüe de código (cURL, JS, Python)
  let lenguajeActivo = "curl";
  const visorCodigo = h(
    "pre",
    {
      class:
        "consola-terminal mt-2 overflow-x-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed text-ivory",
    },
    snippetDe("curl", metodo, ruta, op)
  );

  const barraLenguajes = h("div", { class: "mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3" });
  const tabsIzq = h("div", { class: "flex flex-wrap gap-1.5" });
  for (const [idLeng, etiq] of [
    ["curl", "cURL"],
    ["js", "JavaScript"],
    ["python", "Python"],
  ]) {
    const bLeng = h(
      "button",
      {
        type: "button",
        class:
          "chip-interactivo rounded-lg px-2.5 py-1 font-mono text-[11px] " +
          (idLeng === lenguajeActivo ? "chip-activo" : "text-stone"),
      },
      etiq
    );
    bLeng.addEventListener("click", () => {
      lenguajeActivo = idLeng;
      visorCodigo.textContent = snippetDe(lenguajeActivo, metodo, ruta, op);
      for (const hermano of tabsIzq.querySelectorAll("button")) {
        hermano.className =
          "chip-interactivo rounded-lg px-2.5 py-1 font-mono text-[11px] " +
          (hermano === bLeng ? "chip-activo" : "text-stone");
      }
    });
    tabsIzq.appendChild(bLeng);
  }
  barraLenguajes.appendChild(tabsIzq);

  barraLenguajes.appendChild(
    boton("Copiar código", async (evento) => {
      const nodo = evento.currentTarget;
      try {
        await navigator.clipboard.writeText(visorCodigo.textContent);
        nodo.textContent = "✓ Copiado";
        setTimeout(() => (nodo.textContent = "Copiar código"), 1800);
      } catch {
        nodo.textContent = "No se pudo copiar";
      }
    })
  );
  tarjeta.appendChild(barraLenguajes);
  tarjeta.appendChild(visorCodigo);

  const camposRuta = [];
  if (metodo === "get") {
    const acciones = h("div", { class: "mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3" });
    for (const parametro of op.parameters || []) {
      if (parametro.in !== "path") continue;
      const entrada = h("input", {
        type: "text",
        placeholder: parametro.name,
        class:
          "w-32 rounded-lg border border-line bg-ink px-2.5 py-2 font-mono text-xs text-ivory placeholder:text-stone/70",
      });
      camposRuta.push({ parametro, entrada });
      acciones.appendChild(entrada);
    }

    const tieneBuscar = (op.parameters || []).some((p) => p.in === "query" && p.name === "buscar");
    let entradaBuscar = null;
    if (tieneBuscar) {
      entradaBuscar = h("input", {
        type: "text",
        placeholder: "?buscar=…",
        class:
          "w-36 rounded-lg border border-line bg-ink px-2.5 py-2 font-mono text-xs text-ivory placeholder:text-stone/70",
      });
      acciones.appendChild(entradaBuscar);
    }

    const salida = h("pre", {
      class:
        "consola-terminal mt-3 hidden overflow-x-auto whitespace-pre-wrap break-words rounded-xl p-3 font-mono text-[11px] leading-relaxed text-emerald-200",
    });

    acciones.appendChild(
      boton(
        "▶ Ejecutar GET en vivo",
        async () => {
          let url = ruta;
          for (const { parametro, entrada } of camposRuta) {
            if (!entrada.value.trim()) {
              salida.className =
                "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-[11px] leading-relaxed text-amber-200";
              salida.textContent = "Escribe «" + parametro.name + "» para probar.";
              return;
            }
            url = url.replace("{" + parametro.name + "}", encodeURIComponent(entrada.value.trim()));
          }
          const paramsQuery = new URLSearchParams();
          const tieneLimite = (op.parameters || []).some((p) => p.in === "query" && p.name === "limite");
          if (tieneLimite) paramsQuery.set("limite", "5");
          if (entradaBuscar && entradaBuscar.value.trim()) paramsQuery.set("buscar", entradaBuscar.value.trim());
          const qs = paramsQuery.toString();
          if (qs) url += (url.includes("?") ? "&" : "?") + qs;

          const cabeceras = {};
          if (op.security) {
            const clave = token && token.entrada && token.entrada.value.trim();
            if (!clave) {
              salida.className =
                "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-[11px] leading-relaxed text-amber-200";
              salida.textContent = "Escribe tu token en el panel de arriba y vuelve a probar.";
              return;
            }
            cabeceras.Authorization = "Bearer " + clave;
          }
          salida.className =
            "consola-terminal mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl p-3 font-mono text-[11px] leading-relaxed text-emerald-200";
          salida.textContent = "⏳ Consultando…";
          const t0 = performance.now();
          try {
            const respuesta = await fetch(url, { headers: cabeceras, cache: "no-store" });
            const ms = Math.max(1, Math.round(performance.now() - t0));
            const texto = await respuesta.text();
            let cuerpo = texto;
            try {
              cuerpo = JSON.stringify(JSON.parse(texto), null, 2);
            } catch {
              /* texto tal cual */
            }
            salida.textContent = "// HTTP " + respuesta.status + " · " + ms + " ms\n" + cuerpo;
            salida.classList.remove("hidden");
          } catch (error) {
            salida.textContent = "No se pudo consultar: " + (error.message || error);
            salida.classList.remove("hidden");
          }
        },
        "boton-brillo font-semibold"
      )
    );
    tarjeta.appendChild(acciones);
    tarjeta.appendChild(salida);
  }

  return tarjeta;
}

function renderDocumento(nombre, doc) {
  const x = doc["x-taller"] || {};
  const info = doc.info || {};
  document.title = (info.title || nombre) + " — Explorador OpenAPI";
  tituloPagina.textContent = info.title || nombre;
  resumenPagina.textContent = (info.description || "").split("\n\n")[0] || "API publicada por el taller.";

  vaciar(contenido);

  const meta = h("div", { class: "flex flex-wrap gap-2" });
  meta.appendChild(insignia("/api/" + nombre, "border-clay/50 text-clay font-mono"));
  if (x.soloLectura) meta.appendChild(insignia("Solo lectura", "border-amber-500/40 text-amber-300"));
  if (x.autenticacion) {
    meta.appendChild(
      insignia(
        "Token · " + (x.autenticacion.modo === "todo" ? "todo" : "escritura"),
        "border-sky-500/40 text-sky-300"
      )
    );
  }
  meta.appendChild(insignia("OpenAPI " + (doc.openapi || "3.0.3")));
  if (x.normalizacion && x.normalizacion.campos) {
    meta.appendChild(
      insignia("✨ Normaliza " + x.normalizacion.campos.join(", "), "border-emerald-500/40 text-emerald-300")
    );
  }
  contenido.appendChild(meta);

  const enlaces = h("div", { class: "mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" });
  const urlOpenapi = new URL("/api/" + encodeURIComponent(nombre) + "/openapi.json", location.href).href;
  enlaces.appendChild(
    h(
      "a",
      {
        href: "/api/" + encodeURIComponent(nombre) + "/openapi.json",
        class: "text-clay hover:underline",
        target: "_blank",
        rel: "noreferrer",
      },
      "Ver openapi.json ↗"
    )
  );
  enlaces.appendChild(
    enlaceExterno("Abrir en Swagger Editor ↗", "https://editor.swagger.io/?url=" + encodeURIComponent(urlOpenapi))
  );
  enlaces.appendChild(
    h(
      "a",
      {
        href: "/api/" + encodeURIComponent(nombre),
        class: "text-stone hover:text-ivory",
        target: "_blank",
        rel: "noreferrer",
      },
      "Manifiesto de la API"
    )
  );
  enlaces.appendChild(h("a", { href: "/", class: "text-stone hover:text-ivory" }, "Crear otra API"));
  enlaces.appendChild(h("a", { href: "/privacidad", class: "text-stone hover:text-ivory" }, "Privacidad"));
  contenido.appendChild(enlaces);

  const paneles = h("div", { class: "mt-6 grid gap-4 lg:grid-cols-2" });
  paneles.appendChild(panelLimites(x));
  const auth = panelAuth(x, nombre);
  paneles.appendChild(auth.nodo);
  contenido.appendChild(paneles);

  const grupos = new Map();
  for (const [ruta, operaciones] of Object.entries(doc.paths || {})) {
    for (const metodo of METODOS) {
      const op = operaciones[metodo];
      if (!op) continue;
      const clave = op["x-recurso"] || (op.tags && op.tags[0]) || "otros";
      if (!grupos.has(clave)) grupos.set(clave, { titulo: (op.tags && op.tags[0]) || clave, operaciones: [] });
      grupos.get(clave).operaciones.push({ ruta, metodo, op });
    }
  }

  const schemas = (doc.components && doc.components.schemas) || {};
  for (const [clave, grupo] of grupos) {
    const seccion = h("section", { class: "mt-10" });
    seccion.appendChild(
      h(
        "div",
        { class: "flex flex-wrap items-end justify-between gap-2" },
        h("h2", { class: "font-display text-3xl" }, "📦 " + grupo.titulo),
        h("code", { class: "font-mono text-xs text-clay" }, "/api/" + nombre + "/" + clave)
      )
    );

    const esquema = schemas[pascal(clave)];
    if (esquema) {
      seccion.appendChild(
        h("h3", { class: "mt-4 text-xs font-semibold uppercase tracking-wider text-stone" }, "Esquema de Campos")
      );
      seccion.appendChild(tablaEsquema(clave, esquema));
    }

    seccion.appendChild(
      h("h3", { class: "mt-6 text-xs font-semibold uppercase tracking-wider text-stone" }, "Operaciones REST")
    );
    const caja = h("div", { class: "mt-3 space-y-4" });
    for (const { ruta, metodo, op } of grupo.operaciones) {
      caja.appendChild(tarjetaEndpoint(ruta, metodo, op, auth));
    }
    seccion.appendChild(caja);
    contenido.appendChild(seccion);
  }

  if (!grupos.size) {
    contenido.appendChild(
      h(
        "div",
        { class: "tarjeta-viva mt-8 rounded-2xl p-5 text-sm text-stone" },
        "Esta API no publicó rutas todavía. Revisa su manifiesto."
      )
    );
  }
}

async function cargarDocumento(nombre) {
  avisar("Cargando la documentación de /api/" + nombre + "…");
  try {
    const { respuesta, json } = await traer("/api/" + encodeURIComponent(nombre) + "/openapi.json");
    if (respuesta.status === 404) {
      ocultarAviso();
      tituloPagina.textContent = "Esa API no existe (todavía)";
      resumenPagina.textContent = "Puede que la estés creando ahora mismo. Vuelve en un minuto o revisa el catálogo.";
      vaciar(contenido);
      contenido.appendChild(
        h(
          "div",
          { class: "tarjeta-viva rounded-[22px] p-5" },
          h("p", { class: "text-sm leading-relaxed text-stone" }, "No encontré /api/" + nombre + "/openapi.json."),
          h(
            "div",
            { class: "mt-4 flex flex-wrap gap-4 text-sm" },
            h("a", { href: "/", class: "text-clay hover:underline" }, "Volver al taller"),
            h("a", { href: "/docs", class: "text-clay hover:underline" }, "Ver todas las APIs")
          )
        )
      );
      return;
    }
    if (!respuesta.ok || !json) {
      avisar(
        "No pude leer el documento OpenAPI (HTTP " + respuesta.status + ").",
        "border-rose-500/40 bg-rose-500/5 text-rose-200"
      );
      return;
    }
    ocultarAviso();
    renderDocumento(nombre, json);
  } catch (error) {
    avisar("No pude leer la documentación: " + (error.message || error), "border-rose-500/40 bg-rose-500/5 text-rose-200");
  }
}

async function principal() {
  await cargarLista();
  if (parametroApi) {
    await cargarDocumento(parametroApi);
  } else {
    renderIndice();
  }
}

principal();
