// @ts-nocheck
/**
 * Regenera la copia local del catálogo de APIs públicas sin clave.
 *
 *   npm run fuentes
 *
 * Lee el README de `public-apis/public-apis` (licencia MIT) desde GitHub, se
 * queda con las filas `Auth = No` y `HTTPS = Yes`, y escribe
 * `catalogos/fuentes-publicas.json`.
 *
 * Esa copia es el respaldo de `/api/fuentes` cuando GitHub no responde y, al
 * estar dentro del repositorio, Vercel la empaqueta con la función.
 *
 * Requiere red. Si no la hay, no toca el archivo y sale con error para que se
 * note en Actions.
 */

import fs from "node:fs";
import path from "node:path";
import fuentesGithub from "../lib/fuentes-github.js";

const DESTINO = path.resolve(process.cwd(), "catalogos", "fuentes-publicas.json");

const catalogo = await fuentesGithub.descubrir({ forzar: true });
if (!catalogo.enVivo) {
  console.error("[fuentes] No pude leer GitHub: " + (catalogo.aviso || "sin detalle"));
  console.error("[fuentes] La copia local no se ha modificado.");
  process.exit(1);
}

const datos = {
  origen: catalogo.origen,
  licencia: catalogo.licencia,
  actualizado: catalogo.actualizado,
  nota: "Copia congelada del README de public-apis (filas Auth=No y HTTPS=Yes). Se regenera con npm run fuentes.",
  total: catalogo.total,
  categorias: catalogo.categorias,
  fuentes: catalogo.fuentes,
};

fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, JSON.stringify(datos, null, 1) + "\n");
const kb = (fs.statSync(DESTINO).size / 1024).toFixed(1);
console.log(
  "[fuentes] " + datos.total + " APIs sin clave en " + datos.categorias.length + " categorías -> " + DESTINO + " (" + kb + " KB)"
);
