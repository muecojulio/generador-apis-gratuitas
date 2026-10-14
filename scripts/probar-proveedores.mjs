// @ts-nocheck
/**
 * Comprueba qué modelos gratuitos están respondiendo ahora mismo.
 *
 *   node scripts/probar-proveedores.mjs
 *
 * No guarda nada y no crea ninguna API: solo pregunta a cada servicio y cuenta
 * si contestó. Sirve para saber por qué una API se generó con el lector incluido.
 */

import { pedirPlano, proveedoresSinClave } from "../lib/ia.mjs";

const DESCRIPCION = [
  "Tabla libros con campos:",
  "- titulo (texto, obligatorio, máximo 120)",
  "- autor (texto, obligatorio)",
  "- anyo (entero, mínimo 0)",
  "- leido (sí o no)",
  "Quiero listar y crear.",
].join("\n");

const objetivos = process.env.SOLO ? [process.env.SOLO] : ["gemini", "llm7", "kilo", "ovh", "pollinations"];

console.log("Comprobando modelos gratuitos (nada de pago, ninguna tarjeta).\n");
if (!process.env.GEMINI_API_KEY) {
  console.log("- Gemini: no hay GEMINI_API_KEY; se salta. (Créala gratis en https://aistudio.google.com/apikey)\n");
}
for (const proveedor of proveedoresSinClave()) {
  console.log("- " + proveedor.id + ": " + proveedor.nombre + " -> " + proveedor.url);
}
console.log("");

for (const objetivo of objetivos) {
  const inicio = Date.now();
  const respuesta = await pedirPlano({
    descripcion: DESCRIPCION,
    nombre: "prueba-proveedores",
    proveedor: objetivo,
    aviso: (texto) => console.log("   · " + texto),
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  if (respuesta) {
    const recursos = respuesta.spec.recursos.map((recurso) => recurso.nombre).join(", ");
    console.log("OK   " + objetivo + " respondió en " + segundos + "s -> " + recursos + "\n");
  } else {
    console.log("FALLA " + objetivo + " no sirvió (" + segundos + "s); el taller usaría el lector incluido.\n");
  }
}
console.log("Fin. El taller nunca se queda sin opciones: si nadie responde, usa el lector incluido.");
