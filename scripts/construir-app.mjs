// @ts-nocheck
/**
 * Prepara la app nativa: genera `app-web/` con la interfaz del taller, su
 * configuración de entorno, el puente de Capacitor ya empaquetado y el CSS.
 *
 *   node scripts/construir-app.mjs            # solo prepara app-web/
 *   node scripts/construir-app.mjs --sync     # además ejecuta `cap sync`
 *
 * El HTML, el script y los estilos son los mismos del sitio: una sola interfaz
 * para web, Android e iOS. Lo único que cambia es `configuracion.js`, que en la
 * app apunta al servidor remoto y activa el puente nativo.
 *
 * Servidor por defecto de la app (se puede cambiar sin recompilar desde
 * Ajustes, o al compilar con la variable TALLER_SERVIDOR).
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const SALIDA = path.join(RAIZ, "app-web");
const PAQUETE = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));

const SERVIDOR = (process.env.TALLER_SERVIDOR || "https://generador-apis-gratuitas.vercel.app").replace(/\/+$/, "");
const VERSION = PAQUETE.version || "1.0.0";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https: http://localhost:*",
].join("; ");

function copiar(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origen, destino);
}

function copiarCarpeta(origen, destino) {
  if (!fs.existsSync(origen)) return;
  for (const entrada of fs.readdirSync(origen, { withFileTypes: true })) {
    const desde = path.join(origen, entrada.name);
    const hasta = path.join(destino, entrada.name);
    if (entrada.isDirectory()) copiarCarpeta(desde, hasta);
    else copiar(desde, hasta);
  }
}

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });

// 1. Interfaz: el mismo index.html del sitio, con una CSP propia de la app.
const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
if (!html.includes("Content-Security-Policy")) {
  const conCsp = html.replace(
    '<meta charset="utf-8" />',
    '<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="' + CSP + '" />'
  );
  fs.writeFileSync(path.join(SALIDA, "index.html"), conCsp);
} else {
  fs.writeFileSync(path.join(SALIDA, "index.html"), html);
}

copiar(path.join(RAIZ, "script.js"), path.join(SALIDA, "script.js"));
copiar(path.join(RAIZ, "favicon.svg"), path.join(SALIDA, "favicon.svg"));
copiar(path.join(RAIZ, "lib/motor.mjs"), path.join(SALIDA, "lib/motor.mjs"));
copiar(path.join(RAIZ, "assets/estilos.css"), path.join(SALIDA, "assets/estilos.css"));
copiarCarpeta(path.join(RAIZ, "assets/fuentes"), path.join(SALIDA, "assets/fuentes"));
copiarCarpeta(path.join(RAIZ, "assets/iconos"), path.join(SALIDA, "assets/iconos"));

// 2. Configuración: servidor remoto y modo nativo.
const configuracion = fs.readFileSync(path.join(RAIZ, "configuracion.js"), "utf8");
const bloque = `var CONFIG = {
    nativo: true,
    apiBase: ${JSON.stringify(SERVIDOR)},
    version: ${JSON.stringify(VERSION)},
    compilado: "nativo",
  };`;
const configuracionNativa = configuracion.replace(/var CONFIG = \{[\s\S]*?\n  \};/, bloque);
if (!configuracionNativa.includes('"nativo":true') && !configuracionNativa.includes("nativo: true")) {
  throw new Error("No pude inyectar la configuración nativa en configuracion.js");
}
fs.writeFileSync(path.join(SALIDA, "configuracion.js"), configuracionNativa);

// 3. Puente de Capacitor empaquetado con esbuild (una sola petición local).
const esbuild = require("esbuild");
const resultado = esbuild.buildSync({
  entryPoints: [path.join(RAIZ, "app/nativo.js")],
  bundle: true,
  format: "esm",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  outfile: path.join(SALIDA, "nativo.js"),
  logLevel: "silent",
});
if (!fs.existsSync(path.join(SALIDA, "nativo.js"))) {
  throw new Error("esbuild no generó app-web/nativo.js: " + JSON.stringify(resultado));
}

// 4. Espejo de los iconos en el proyecto Android (los usa Capacitor al abrir).
const iconosAndroid = path.join(RAIZ, "assets/iconos/android");
if (fs.existsSync(iconosAndroid)) {
  for (const densidad of fs.readdirSync(iconosAndroid)) {
    const destino = path.join(RAIZ, "android/app/src/main/res/mipmap-" + densidad);
    if (!fs.existsSync(destino)) continue;
    for (const archivo of fs.readdirSync(path.join(iconosAndroid, densidad))) {
      copiar(path.join(iconosAndroid, densidad, archivo), path.join(destino, archivo));
    }
  }
}

const tamanos = fs.readdirSync(SALIDA, { withFileTypes: true }).filter((e) => e.isFile()).length;
console.log("App preparada en app-web/ (" + tamanos + " archivos) · servidor " + SERVIDOR + " · versión " + VERSION);

if (process.argv.includes("--sync")) {
  const cap = spawnSync(
    process.execPath,
    [path.join(RAIZ, "node_modules/@capacitor/cli/bin/capacitor"), "sync"],
    { cwd: RAIZ, stdio: "inherit" }
  );
  if (cap.status !== 0) process.exit(cap.status || 1);
}
