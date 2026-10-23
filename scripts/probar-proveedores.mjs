// @ts-nocheck
/**
 * Comprueba qué modelos gratuitos están respondiendo ahora mismo.
 *
 *   node scripts/probar-proveedores.mjs
 *   SOLO=llm7 node scripts/probar-proveedores.mjs
 *
 * No guarda nada y no crea ninguna API: solo pregunta a cada servicio y cuenta
 * si contestó. Sirve para saber por qué una API se generó con el lector incluido.
 *
 * Usa la misma cadena que el taller: primero los servicios públicos sin clave y
 * después los que tengan una variable de entorno configurada.
 */

import { estadoProveedores, probarProveedores } from "../lib/ia.mjs";

const estado = estadoProveedores();
const solo = String(process.env.SOLO || "").trim().toLowerCase();

console.log("Comprobando modelos gratuitos (nada de pago, ninguna tarjeta).");
console.log("Estrategia: " + estado.estrategia + " · orden: " + (estado.orden.join(" → ") || "ninguno") + "\n");

for (const proveedor of estado.sinClave) {
  console.log("- " + proveedor.id + ": " + proveedor.nombre + " -> " + proveedor.url);
}
for (const proveedor of estado.conClave) {
  if (proveedor.configurado) console.log("- " + proveedor.id + ": clave configurada (" + proveedor.variable + ")");
}
if (!estado.conClave.some((proveedor) => proveedor.configurado)) {
  console.log("- Sin claves de IA configuradas: si los públicos fallan, se usa el lector incluido.");
}
console.log("");

const prueba = await probarProveedores({ solo });
for (const resultado of prueba.resultados) {
  const marca = resultado.ok ? "OK   " : "FALLA";
  const detalle = resultado.error ? " -> " + resultado.error : "";
  console.log(
    marca + " " + resultado.id + " (" + resultado.modelo + ") " + resultado.ms + " ms" + detalle
  );
}
if (!prueba.resultados.length) {
  console.log("No hay proveedores que probar con esa selección. Revisa SOLO o GENERADOR_ESTRATEGIA.");
}
console.log("\nFin. El taller nunca se queda sin opciones: si nadie responde, usa el lector incluido.");
