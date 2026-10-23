// @ts-nocheck
/**
 * Medición de los índices y de la caché.
 *
 *   npm run medir
 *
 * El taller no tiene una base de datos SQL: los datos viven en un JSON. Aun así,
 * conviene medir si «indexar» aporta algo antes de añadir complejidad. Este
 * script compara, con 5.000 registros (el máximo por recurso):
 *
 *   - buscar un registro por id: Array.find (lineal) frente a Map (directo)
 *   - filtrar por texto: repetir toLowerCase() en cada búsqueda frente al
 *     índice de texto preparado
 *   - leer lo mismo dos veces: sin caché frente a la caché del taller
 *
 * No es una prueba que deba fallar: solo informa. Los números son de tu equipo.
 */

import { performance } from "node:perf_hooks";
import indiceMod from "../lib/indice.js";
import cache from "../lib/cache.js";

const TOTAL = 5000;
const consultas = 2000;

const filas = Array.from({ length: TOTAL }, (_, i) => ({
  id: "registro-" + i,
  titulo: "Producto número " + i,
  descripcion: "Una descripción de ejemplo con acentos: café, niño, acción.",
  precio: i % 100,
}));

function medir(nombre, veces, fn) {
  // Calentamiento: la primera vuelta paga la compilación del JIT.
  fn(0);
  const inicio = performance.now();
  for (let i = 0; i < veces; i += 1) fn(i);
  const ms = performance.now() - inicio;
  return { nombre, ms, porOperacion: (ms / veces) * 1000 };
}

const buscados = Array.from({ length: consultas }, (_, i) => "registro-" + ((i * 7) % TOTAL));

const sinIndice = medir("Array.find por id", consultas, (i) => {
  const id = buscados[i % buscados.length];
  const fila = filas.find((item) => item.id === id);
  if (!fila) throw new Error("no encontrado");
});

const indice = indiceMod.crearIndice(filas);
const conIndice = medir("Map por id", consultas, (i) => {
  const fila = indice.obtener(buscados[i % buscados.length]);
  if (!fila) throw new Error("no encontrado");
});

const busquedaVieja = medir("buscar (texto, sin índice)", 50, () => {
  const aguja = "café";
  const encontradas = filas.filter((fila) =>
    Object.entries(fila).some(
      ([clave, valor]) => clave !== "id" && String(valor).toLowerCase().includes(aguja)
    )
  );
  if (!encontradas.length) throw new Error("sin resultados");
});

const busquedaNueva = medir("buscar (texto, con índice)", 50, () => {
  const encontradas = indice.buscar("cafe");
  if (!encontradas.length) throw new Error("sin resultados");
});

// La caché no gana por copiar un objeto: gana por evitar la ida y vuelta a
// GitHub. Se simula una lectura remota de 5 ms (en producción son 200–600 ms).
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

cache.limpiar();
const inicioSin = performance.now();
for (let i = 0; i < 20; i += 1) await dormir(5);
const sinCache = { ms: performance.now() - inicioSin };

cache.poner("prueba", { datos: filas }, 60000);
const inicioCon = performance.now();
for (let i = 0; i < 20; i += 1) cache.obtener("prueba");
const conCache = { ms: performance.now() - inicioCon };

// Single flight: diez peticiones simultáneas de la misma clave -> una sola carga.
cache.borrar("unica");
let ejecuciones = 0;
await Promise.all(
  Array.from({ length: 10 }, () =>
    cache.recordar("unica", 60000, async () => {
      ejecuciones += 1;
      await dormir(5);
      return "valor";
    })
  )
);

const factor = (a, b) => (a.ms / Math.max(b.ms, 0.0001)).toFixed(1) + "×";

console.log("Registros: " + TOTAL + " · consultas: " + consultas + "\n");
console.log("Índice por id");
console.log("  Array.find : " + sinIndice.ms.toFixed(1) + " ms (" + sinIndice.porOperacion.toFixed(2) + " µs/consulta)");
console.log("  Map        : " + conIndice.ms.toFixed(1) + " ms (" + conIndice.porOperacion.toFixed(2) + " µs/consulta)");
console.log("  Ventaja    : " + factor(sinIndice, conIndice) + " más rápido con índice\n");
console.log("Búsqueda de texto (50 consultas)");
console.log("  Sin índice : " + busquedaVieja.ms.toFixed(1) + " ms");
console.log("  Con índice : " + busquedaNueva.ms.toFixed(1) + " ms");
console.log("  Ventaja    : " + factor(busquedaVieja, busquedaNueva) + " más rápido con índice\n");
console.log("Caché (20 lecturas; remoto simulado de 5 ms)");
console.log("  Sin caché  : " + sinCache.ms.toFixed(2) + " ms");
console.log("  Con caché  : " + conCache.ms.toFixed(2) + " ms");
console.log("  Ventaja    : " + factor(sinCache, conCache) + " menos tiempo\n");
console.log("Single flight (10 peticiones a la vez de la misma clave)");
console.log("  Cargas reales: " + ejecuciones + " (debería ser 1)\n");
console.log("Caché del taller:", JSON.stringify(cache.estadisticas()));
console.log(
  "\nNota: el índice se construye una vez por lectura y se guarda ligado al sha del archivo;" +
    " cuando los datos no cambian, no se vuelve a construir."
);
