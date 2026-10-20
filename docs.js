// Documentación automática del taller.
// Lee /api/<nombre>/openapi.json (generado desde el plano) y lo pinta sin
// dependencias externas. El botón de probar solo hace lecturas GET.

const METODOS = ["get", "post", "put", "delete"];
const COLORES = {
  get: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  post: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  put: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  delete: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};
const BOTON =
  "rounded-lg border border-line px-3 py-2 text-xs text-ivory transition-colors hover:border-clay hover:text-clay disabled:cursor-not-allowed disabled:opacity-50";

const parametroApi = new URLSearchParams(location.search).get("api");
const selector = document.querySelector("#selector");
const tituloPagina = document.querySelector("#titulo");
const resumenPagina = document.querySelector("#resumen");
const aviso = document.querySelector("#aviso");
const contenido = document.querySelector("#contenido");

let apis = [];

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
    nodo.appendChild(typeof hijo === "string" || typeof hijo === "number" ? document.createTextNode(String(hijo)) : hijo);
  }
  return nodo;
}

function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

function avisar(texto, clase) {
  aviso.className =
    "mt-6 rounded-xl border p-4 text-sm leading-relaxed " +
    (clase || "border-line bg-panel text-stone");
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
      class:
        "rounded-full border px-3 py-1 text-xs " +
        (tono || "border-line text-stone"),
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
  selector.appendChild(h("option", { value: "" }, "Todas las APIs"));
  let encontrada = false;
  for (const api of apis) {
    const opcion = h("option", { value: api.nombre }, api.titulo || api.nombre);
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

/* Portada de documentación ---------------------------------------------- */

function renderIndice() {
  document.title = "Documentación — Taller de APIs gratuitas";
  tituloPagina.textContent = "Documentación";
  resumenPagina.textContent =
    "Cada API del taller publica un documento OpenAPI generado desde su plano. Elige una para ver recursos, campos, límites y ejemplos.";
  vaciar(contenido);

  if (!apis.length) {
    contenido.appendChild(
      h(
        "div",
        { class: "rounded-[20px] border border-line bg-panel p-6" },
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
            class:
              "mt-4 inline-block rounded-xl bg-clay px-4 py-2.5 text-sm font-medium text-ink hover:bg-deep",
          },
          "Crear la primera API"
        )
      )
    );
    return;
  }

  const rejilla = h("div", { class: "grid gap-4 md:grid-cols-2" });
  for (const api of apis) {
    const ficha = h("article", {
      class: "flex flex-col rounded-[20px] border border-line bg-panel p-5",
    });
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
    ficha.appendChild(encabezado);
    ficha.appendChild(h("p", { class: "mt-1 font-mono text-xs text-clay" }, "/api/" + api.nombre));
    if (api.resumen) {
      ficha.appendChild(h("p", { class: "mt-2 text-sm leading-relaxed text-stone" }, api.resumen));
    }

    const marcas = h("div", { class: "mt-3 flex flex-wrap gap-2" });
    if (api.soloLectura) marcas.appendChild(insignia("Solo lectura", "border-amber-500/40 text-amber-300"));
    if (api.protegida) {
      marcas.appendChild(
        insignia("Token · " + (api.modoToken === "todo" ? "todo" : "escritura"), "border-sky-500/40 text-sky-300")
      );
    }
    if (api.recursos && api.recursos.length) {
      marcas.appendChild(insignia(api.recursos.length + " recurso" + (api.recursos.length === 1 ? "" : "s")));
    }
    if (marcas.childNodes.length) ficha.appendChild(marcas);

    if (api.limites) {
      ficha.appendChild(
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

    const enlaces = h("div", { class: "mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs" });
    enlaces.appendChild(
      h(
        "a",
        { href: "/docs?api=" + encodeURIComponent(api.nombre), class: "text-clay hover:underline" },
        "Documentación"
      )
    );
    enlaces.appendChild(
      h("a", { href: "/api/" + api.nombre, class: "text-stone hover:text-ivory", target: "_blank", rel: "noreferrer" }, "API")
    );
    enlaces.appendChild(
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
    );
    ficha.appendChild(enlaces);
    rejilla.appendChild(ficha);
  }
  contenido.appendChild(rejilla);

  contenido.appendChild(
    h(
      "section",
      { class: "mt-8 rounded-[20px] border border-line p-5" },
      h("h2", { class: "font-display text-2xl" }, "Lo que hay dentro de cada documento"),
      h(
        "ul",
        { class: "mt-3 grid gap-2 text-sm leading-relaxed text-stone sm:grid-cols-2" },
        h("li", {}, "· Esquemas de cada recurso, con tipos, obligatorios y reglas."),
        h("li", {}, "· Rutas GET, POST, PUT y DELETE con sus códigos de respuesta."),
        h("li", {}, "· Límites de registros, tamaño y retención."),
        h("li", {}, "· Si la API pide token, las dos cabeceras que acepta."),
        h("li", {}, "· Ejemplos listos para copiar como curl."),
        h("li", {}, "· Enlace directo a Swagger Editor para probar el documento completo.")
      )
    )
  );
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
        { class: "rounded-[20px] border border-line bg-panel p-5" },
        h("h2", { class: "font-display text-2xl" }, "Sin token"),
        h(
          "p",
          { class: "mt-2 text-sm leading-relaxed text-stone" },
          "Esta API no pide autenticación: cualquiera puede leer y escribir. Si quieres protegerla, vuelve a generarla con la opción de token."
        ),
        h(
          "a",
          { href: "/", class: "mt-3 inline-block text-sm text-clay hover:underline" },
          "Crear una versión con token"
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
    class: "mt-3 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-sm text-ivory placeholder:text-stone/70",
  });
  entrada.value = guardado;
  const mensaje = h("p", { class: "mt-2 text-xs text-stone" }, guardado ? "Hay un token guardado en esta pestaña." : "");

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
      { class: "rounded-[20px] border border-line bg-panel p-5" },
      h("h2", { class: "font-display text-2xl" }, "Token"),
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
        ". La documentación y el manifiesto siguen abiertos."
      )
    ),
    entrada,
  };
}

function panelLimites(x) {
  const limites = x.limites || {};
  return h(
    "section",
    { class: "rounded-[20px] border border-line bg-panel p-5" },
    h("h2", { class: "font-display text-2xl" }, "Límites de esta API"),
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
      "Las respuestas incluyen X-Limite-Registros y, si hay retención, X-Retencion-Dias."
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
        { class: "border-t border-line align-top" },
        h(
          "td",
          { class: "py-2 pr-3 font-mono text-xs text-ivory" },
          nombre,
          sistema ? h("span", { class: "ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] text-stone" }, "sistema") : null
        ),
        h("td", { class: "py-2 pr-3 text-xs text-stone" }, tipo),
        h(
          "td",
          { class: "py-2 pr-3 text-xs " + (requeridos.has(nombre) ? "text-clay" : "text-stone") },
          requeridos.has(nombre) ? "Sí" : "No"
        ),
        h("td", { class: "py-2 text-xs text-stone" }, reglas.join(" · ") || campo.description || "—")
      )
    );
  }
  return h(
    "div",
    { class: "mt-3 overflow-x-auto" },
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

function curlDe(metodo, ruta, op) {
  let comando = "curl -X " + metodo.toUpperCase() + ' "' + location.origin + rutaDeEjemplo(ruta, op) + '"';
  const cuerpo = ejemploCuerpo(op);
  if (cuerpo) {
    comando += ' \\\n  -H "Content-Type: application/json" \\\n  -d ' + "'" + JSON.stringify(cuerpo) + "'";
  }
  if (op.security) comando += ' \\\n  -H "Authorization: Bearer TU_TOKEN"';
  return comando;
}

function botonCopiar(texto) {
  return boton("Copiar curl", async (evento) => {
    const nodo = evento.currentTarget;
    try {
      await navigator.clipboard.writeText(texto);
      nodo.textContent = "Copiado";
      setTimeout(() => (nodo.textContent = "Copiar curl"), 1800);
    } catch {
      nodo.textContent = "No se pudo copiar";
    }
  });
}

function tarjetaEndpoint(ruta, metodo, op, token) {
  const tarjeta = h("article", { class: "rounded-xl border border-line bg-ink p-4" });
  const cabecera = h("div", { class: "flex flex-wrap items-center gap-3" });
  cabecera.appendChild(
    h(
      "span",
      { class: "rounded-md border px-2 py-1 font-mono text-[11px] font-semibold uppercase " + COLORES[metodo] },
      metodo
    )
  );
  cabecera.appendChild(h("code", { class: "break-all font-mono text-xs text-ivory" }, ruta));
  if (op.security) {
    cabecera.appendChild(insignia("token", "border-sky-500/40 text-sky-300"));
  }
  tarjeta.appendChild(cabecera);
  tarjeta.appendChild(h("p", { class: "mt-2 text-sm font-medium text-ivory" }, op.summary || ""));
  if (op.description) {
    tarjeta.appendChild(h("p", { class: "mt-1 text-sm leading-relaxed text-stone" }, op.description));
  }

  const parametros = op.parameters || [];
  if (parametros.length) {
    const caja = h("div", { class: "mt-3 border-t border-line pt-3" });
    caja.appendChild(h("p", { class: "text-[11px] uppercase tracking-wider text-stone" }, "Parámetros"));
    for (const parametro of parametros) {
      caja.appendChild(
        h(
          "p",
          { class: "mt-1 text-xs leading-relaxed text-stone" },
          h("code", { class: "text-ivory" }, parametro.name),
          " · " + parametro.in + (parametro.required ? " · obligatorio" : "") +
            (parametro.description ? " · " + parametro.description : "")
        )
      );
    }
    tarjeta.appendChild(caja);
  }

  const cuerpo = ejemploCuerpo(op);
  if (cuerpo) {
    tarjeta.appendChild(h("p", { class: "mt-3 text-[11px] uppercase tracking-wider text-stone" }, "Cuerpo de ejemplo"));
    tarjeta.appendChild(
      h(
        "pre",
        { class: "mt-2 overflow-x-auto rounded-lg bg-panel p-3 font-mono text-[11px] leading-relaxed text-stone" },
        JSON.stringify(cuerpo, null, 2)
      )
    );
  }

  const respuestas = Object.entries(op.responses || {});
  if (respuestas.length) {
    const caja = h("div", { class: "mt-3 border-t border-line pt-3" });
    caja.appendChild(h("p", { class: "text-[11px] uppercase tracking-wider text-stone" }, "Respuestas"));
    for (const [codigo, respuesta] of respuestas) {
      caja.appendChild(
        h(
          "p",
          { class: "mt-1 text-xs text-stone" },
          h("code", { class: "text-ivory" }, codigo),
          " · " + (respuesta.description || "")
        )
      );
    }
    tarjeta.appendChild(caja);
  }

  const acciones = h("div", { class: "mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3" });
  acciones.appendChild(botonCopiar(curlDe(metodo, ruta, op)));

  const camposRuta = [];
  if (metodo === "get") {
    for (const parametro of op.parameters || []) {
      if (parametro.in !== "path") continue;
      const entrada = h("input", {
        type: "text",
        placeholder: parametro.name,
        class: "w-32 rounded-lg border border-line bg-panel px-2 py-2 font-mono text-xs text-ivory placeholder:text-stone/70",
      });
      camposRuta.push({ parametro, entrada });
      acciones.appendChild(entrada);
    }
    const salida = h(
      "pre",
      { class: "mt-3 hidden overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-panel p-3 font-mono text-[11px] leading-relaxed text-stone" }
    );
    acciones.appendChild(
      boton("Probar", async () => {
        let url = ruta;
        for (const { parametro, entrada } of camposRuta) {
          if (!entrada.value.trim()) {
            salida.className =
              "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-[11px] leading-relaxed text-amber-200";
            salida.textContent = "Escribe «" + parametro.name + "» para probar.";
            return;
          }
          url = url.replace("{" + parametro.name + "}", encodeURIComponent(entrada.value.trim()));
        }
        const tieneLimite = (op.parameters || []).some((p) => p.in === "query" && p.name === "limite");
        if (tieneLimite) url += (url.includes("?") ? "&" : "?") + "limite=5";
        const cabeceras = {};
        if (op.security) {
          const clave = token && token.entrada && token.entrada.value.trim();
          if (!clave) {
            salida.className =
              "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-[11px] leading-relaxed text-amber-200";
            salida.textContent = "Escribe tu token en el panel de arriba y vuelve a probar.";
            return;
          }
          cabeceras.Authorization = "Bearer " + clave;
        }
        salida.className =
          "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-panel p-3 font-mono text-[11px] leading-relaxed text-stone";
        salida.textContent = "Consultando…";
        try {
          const respuesta = await fetch(url, { headers: cabeceras, cache: "no-store" });
          const texto = await respuesta.text();
          let cuerpo = texto;
          try {
            cuerpo = JSON.stringify(JSON.parse(texto), null, 2);
          } catch {
            /* texto tal cual */
          }
          salida.textContent = "HTTP " + respuesta.status + "\n" + cuerpo;
          salida.classList.remove("hidden");
        } catch (error) {
          salida.textContent = "No se pudo consultar: " + (error.message || error);
          salida.classList.remove("hidden");
        }
      })
    );
    tarjeta.appendChild(acciones);
    tarjeta.appendChild(salida);
    return tarjeta;
  }

  tarjeta.appendChild(acciones);
  return tarjeta;
}

function renderDocumento(nombre, doc) {
  const x = doc["x-taller"] || {};
  const info = doc.info || {};
  document.title = (info.title || nombre) + " — Documentación";
  tituloPagina.textContent = info.title || nombre;
  resumenPagina.textContent = (info.description || "").split("\n\n")[0] || "API publicada por el taller.";

  vaciar(contenido);

  const meta = h("div", { class: "flex flex-wrap gap-2" });
  meta.appendChild(insignia("/api/" + nombre, "border-clay/50 text-clay"));
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
  contenido.appendChild(meta);

  const enlaces = h("div", { class: "mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" });
  const urlOpenapi = new URL("/api/" + encodeURIComponent(nombre) + "/openapi.json", location.href).href;
  enlaces.appendChild(
    h("a", { href: "/api/" + encodeURIComponent(nombre) + "/openapi.json", class: "text-clay hover:underline", target: "_blank", rel: "noreferrer" }, "Ver openapi.json")
  );
  enlaces.appendChild(
    enlaceExterno(
      "Abrir en Swagger Editor",
      "https://editor.swagger.io/?url=" + encodeURIComponent(urlOpenapi)
    )
  );
  enlaces.appendChild(
    h("a", { href: "/api/" + encodeURIComponent(nombre), class: "text-stone hover:text-ivory", target: "_blank", rel: "noreferrer" }, "Manifiesto de la API")
  );
  enlaces.appendChild(h("a", { href: "/", class: "text-stone hover:text-ivory" }, "Crear otra API"));
  contenido.appendChild(enlaces);

  const paneles = h("div", { class: "mt-6 grid gap-4 lg:grid-cols-2" });
  paneles.appendChild(panelLimites(x));
  const auth = panelAuth(x, nombre);
  paneles.appendChild(auth.nodo);
  contenido.appendChild(paneles);

  if (info.description) {
    contenido.appendChild(
      h(
        "section",
        { class: "mt-6 rounded-[20px] border border-line p-5" },
        h("h2", { class: "font-display text-2xl" }, "Sobre esta API"),
        h("p", { class: "mt-2 whitespace-pre-line text-sm leading-relaxed text-stone" }, info.description)
      )
    );
  }

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
        h("h2", { class: "font-display text-3xl" }, grupo.titulo),
        h("code", { class: "font-mono text-xs text-stone" }, "/api/" + nombre + "/" + clave)
      )
    );

    const esquema = schemas[pascal(clave)];
    if (esquema) {
      seccion.appendChild(h("h3", { class: "mt-4 text-sm font-medium uppercase tracking-wider text-stone" }, "Campos"));
      seccion.appendChild(tablaEsquema(clave, esquema));
    }

    seccion.appendChild(h("h3", { class: "mt-6 text-sm font-medium uppercase tracking-wider text-stone" }, "Rutas"));
    const caja = h("div", { class: "mt-3 space-y-3" });
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
        { class: "mt-8 rounded-xl border border-line bg-panel p-5 text-sm text-stone" },
        "Esta API no publicó rutas todavía. Revisa su manifiesto."
      )
    );
  }

  contenido.appendChild(
    h(
      "p",
      { class: "mt-10 border-t border-line pt-5 text-xs leading-relaxed text-stone" },
      "Documento generado automáticamente desde el plano de la API. Si cambias el plano, esta página y el openapi.json cambian con él."
    )
  );
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
          { class: "rounded-[20px] border border-line bg-panel p-5" },
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
      avisar("No pude leer el documento OpenAPI (HTTP " + respuesta.status + ").", "border-rose-500/40 bg-rose-500/5 text-rose-200");
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
