// @ts-nocheck
/**
 * Genera los iconos y las pantallas de arranque de la app nativa a partir de
 * un SVG propio (sin servicios externos ni fuentes que falten en la CI).
 *
 *   node scripts/generar-iconos.mjs
 *
 * Produce:
 *   assets/iconos/                     iconos web + apple-touch-icon
 *   assets/iconos/android/mipmap-<densidad>/  iconos de Android (legacy, round, adaptive)
 *   android/app/src/main/res/drawable-<tamano>/ pantallas de arranque al tamaño original
 *   ios/App/App/Assets.xcassets/       icono 1024 y splash 2732
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const AZUL = "#4f46e5";
const VIOLETA = "#7c3aed";
const CIAN = "#22d3ee";

/** Icono completo: cuadrado redondeado con degradado y trazo ascendente. */
function svgIcono({ fondo = true, margen = 0 } = {}) {
  const glifo = `
    <g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
      <path d="M300 706 L468 520 L588 612 L742 372" stroke-width="58" />
      <path d="M252 790 H772" stroke-width="38" opacity="0.42" />
    </g>
    <circle cx="468" cy="520" r="30" fill="#ffffff" />
    <circle cx="742" cy="372" r="34" fill="${CIAN}" />
    <circle cx="300" cy="706" r="26" fill="#ffffff" opacity="0.9" />
  `;
  const escala = 1 - margen * 2;
  const traslado = 1024 * margen;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${AZUL}" />
        <stop offset="60%" stop-color="${VIOLETA}" />
        <stop offset="100%" stop-color="${AZUL}" />
      </linearGradient>
      <radialGradient id="brillo" cx="0.2" cy="0.1" r="0.8">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
    </defs>
    ${fondo ? '<rect x="0" y="0" width="1024" height="1024" rx="228" fill="url(#fondo)" />' : ""}
    ${fondo ? '<rect x="0" y="0" width="1024" height="1024" rx="228" fill="url(#brillo)" />' : ""}
    <g transform="translate(${traslado} ${traslado}) scale(${escala})">${glifo}</g>
  </svg>`;
}

function svgSplash(ancho, alto) {
  const lado = Math.round(Math.min(ancho, alto) * 0.36);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
    <defs>
      <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${AZUL}" />
        <stop offset="100%" stop-color="${VIOLETA}" />
      </linearGradient>
    </defs>
    <rect width="${ancho}" height="${alto}" fill="#f5f7fb" />
    <g transform="translate(${(ancho - lado) / 2} ${(alto - lado) / 2})">
      <svg width="${lado}" height="${lado}" viewBox="0 0 1024 1024">
        <rect x="0" y="0" width="1024" height="1024" rx="228" fill="url(#fondo)" />
        <g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">
          <path d="M300 706 L468 520 L588 612 L742 372" stroke-width="58" />
          <path d="M252 790 H772" stroke-width="38" opacity="0.42" />
        </g>
        <circle cx="468" cy="520" r="30" fill="#ffffff" />
        <circle cx="742" cy="372" r="34" fill="${CIAN}" />
        <circle cx="300" cy="706" r="26" fill="#ffffff" opacity="0.9" />
      </svg>
    </g>
  </svg>`;
}

async function png(svg, ancho, alto, destino, opciones = {}) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  let imagen = sharp(Buffer.from(svg), { density: 384 }).resize(ancho, alto, { fit: "fill" });
  if (opciones.circular) {
    const mascara = Buffer.from(
      `<svg width="${ancho}" height="${alto}"><circle cx="${ancho / 2}" cy="${alto / 2}" r="${Math.min(ancho, alto) / 2}" fill="#fff" /></svg>`
    );
    imagen = sharp(await imagen.png().toBuffer()).composite([{ input: mascara, blend: "dest-in" }]);
  }
  await imagen.png({ compressionLevel: 9 }).toFile(destino);
  return destino;
}

const generados = [];
const iconos = path.join(RAIZ, "assets/iconos");
const iconoSvg = svgIcono();
const glifoSvg = svgIcono({ fondo: false, margen: 0.22 });

for (const [tamano, nombre] of [
  [512, "icono-512.png"],
  [192, "icono-192.png"],
  [180, "icono-180.png"],
  [1024, "icono-1024.png"],
]) {
  generados.push(await png(iconoSvg, tamano, tamano, path.join(iconos, nombre)));
}

// Android: iconos por densidad (legacy, redondo y primer plano adaptativo).
const DENSIDADES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};
for (const [densidad, tamano] of Object.entries(DENSIDADES)) {
  const carpeta = path.join(iconos, "android", "mipmap-" + densidad);
  generados.push(await png(iconoSvg, tamano, tamano, path.join(carpeta, "ic_launcher.png")));
  generados.push(await png(iconoSvg, tamano, tamano, path.join(carpeta, "ic_launcher_round.png"), { circular: true }));
  const primerPlano = Math.round(tamano * 2.25);
  generados.push(await png(glifoSvg, primerPlano, primerPlano, path.join(carpeta, "ic_launcher_foreground.png")));
}

// Android: pantallas de arranque al mismo tamaño que trae Capacitor.
const recursos = path.join(RAIZ, "android/app/src/main/res");
const directoriosArranque = fs
  .readdirSync(recursos)
  .filter((nombre) => nombre === "drawable" || nombre.startsWith("drawable-"));

for (const directorio of directoriosArranque) {
  const archivo = path.join(recursos, directorio, "splash.png");
  if (!fs.existsSync(archivo)) continue;
  const { width, height } = await sharp(archivo).metadata();
  if (!width || !height) continue;
  await png(svgSplash(width, height), width, height, archivo);
  generados.push(archivo);
}

// iOS: icono 1024 y splash 2732 (sin transparencia, como exige App Store).
const iosIconos = path.join(RAIZ, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
if (fs.existsSync(iosIconos)) {
  const iconoIos = path.join(iosIconos, "AppIcon-512@2x.png");
  const contenido = fs.readFileSync(path.join(iosIconos, "Contents.json"), "utf8");
  if (contenido.includes("AppIcon-512@2x.png")) {
    generados.push(await png(iconoSvg, 1024, 1024, iconoIos));
  }
  const splashIos = path.join(RAIZ, "ios/App/App/Assets.xcassets/Splash.imageset");
  if (fs.existsSync(splashIos)) {
    for (const archivo of fs.readdirSync(splashIos)) {
      if (!archivo.endsWith(".png")) continue;
      generados.push(await png(svgSplash(2732, 2732), 2732, 2732, path.join(splashIos, archivo)));
    }
  }
}

// Icono cuadrado para las notificaciones de Android (blanco sobre transparente).
const notificacion = path.join(iconos, "android", "notificacion.png");
fs.mkdirSync(path.dirname(notificacion), { recursive: true });
await sharp(Buffer.from(svgIcono({ fondo: false })), { density: 300 })
  .resize(96, 96)
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(notificacion);
generados.push(notificacion);

console.log("Iconos y arranques generados: " + generados.length + " archivos.");
