import { performance } from "node:perf_hooks";
import indiceMod from "../lib/indice.js";

const TAMANOS = [100, 500, 2000, 5000];
const VUELTAS = 600;
const CATEGORIAS = ["bebidas", "panaderia", "lacteos", "verduras", "postres", "especias"];

function fabricarDatos(cantidad) {
  const filas = [];
  for (let i = 0; i < cantidad; i += 1) {
    filas.push({
      id: "reg-" + (i + 1),
      creado: "2026-10-18T12:00:00.000Z",
      nombre: i === cantidad - 1 ? "Camiseta de algodón orgánico" : "Producto de prueba número " + (i + 1),
      categoria: CATEGORIAS[i % CATEGORIAS.length],
      precio: ((i % 90) + 10) * 1.25,
      activo: i % 3 !== 0,
      notas: "Observación extensa sobre el artículo " + (i + 1) + " en el almacén central.",
    });
  }
  return filas;
}

function medir(fn) {
  const inicio = performance.now();
  fn();
  return performance.now() - inicio;
}

console.log("Comparación de búsqueda lineal frente al índice en memoria (lib/indice.js)");
console.log("Cada prueba repite " + VUELTAS + " consultas sobre el mismo conjunto de registros.\n");

for (const n of TAMANOS) {
  const datos = fabricarDatos(n);
  const ultimoId = "reg-" + n;
  const mitadId = "reg-" + Math.ceil(n / 2);

  let tiempoConstruir = 0;
  let indice = null;
  tiempoConstruir = medir(() => {
    indice = indiceMod.crearIndice(datos);
  });

  // 1. Por ID al final de la lista (peor caso del recorrido lineal).
  const idSinIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const hallado = datos.find((item) => item.id === ultimoId);
      if (!hallado) throw new Error("No hallado");
    }
  });
  const idConIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const hallado = indice.obtener(ultimoId);
      if (!hallado) throw new Error("No hallado");
    }
  });

  // 2. Posición física para DELETE (findIndex vs indice.posicion).
  const posSinIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const pos = datos.findIndex((item) => item.id === ultimoId);
      if (pos === -1) throw new Error("No hallado");
    }
  });
  const posConIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const pos = indice.posicion(ultimoId);
      if (pos === -1) throw new Error("No hallado");
    }
  });

  // 3. Filtro exacto por campo secundario (?categoria=especias).
  const campoSinIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const lista = datos.filter((item) => String(item.categoria).toLowerCase() === "especias");
      if (!lista.length) throw new Error("Sin resultados");
    }
  });
  const campoConIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const lista = indice.filtrarPorCampo("categoria", "especias");
      if (!lista.length) throw new Error("Sin resultados");
    }
  });

  // 4. Filtro compuesto por varios campos (?categoria=especias&activo=true).
  const compuestoSinIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const lista = datos.filter(
        (item) => String(item.categoria).toLowerCase() === "especias" && item.activo === true
      );
      if (!lista.length) throw new Error("Sin resultados");
    }
  });
  const compuestoConIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const lista = indice.filtrar({ categoria: "especias", activo: "true" });
      if (!lista.length) throw new Error("Sin resultados");
    }
  });

  // 5. Búsqueda de texto libre (?buscar=algodón).
  const textoSinIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      const aguja = "algodón".toLowerCase();
      const lista = datos.filter((item) => JSON.stringify(item).toLowerCase().includes(aguja));
      if (lista.length !== 1) throw new Error("Resultado inesperado");
    }
  });
  const textoConIndice = medir(() => {
    for (let v = 0; v < VUELTAS; v += 1) {
      // Con el índice se encuentra aunque quien busca escriba sin tilde.
      const lista = indice.buscar("algodon");
      if (lista.length !== 1) throw new Error("Resultado inesperado");
    }
  });

  if (indice.obtener(mitadId).id !== mitadId) throw new Error("Índice inconsistente");

  const gananciaId = (idSinIndice / Math.max(idConIndice, 0.01)).toFixed(1);
  const gananciaPos = (posSinIndice / Math.max(posConIndice, 0.01)).toFixed(1);
  const gananciaCampo = (campoSinIndice / Math.max(campoConIndice, 0.01)).toFixed(1);
  const gananciaCompuesto = (compuestoSinIndice / Math.max(compuestoConIndice, 0.01)).toFixed(1);
  const gananciaTexto = (textoSinIndice / Math.max(textoConIndice, 0.01)).toFixed(1);
  const est = indice.estadisticas();

  console.log(
    "Registros: " +
      n +
      " | construir índice: " +
      tiempoConstruir.toFixed(2) +
      " ms (campos indexados: " +
      est.camposIndexados +
      ", trigramas únicos: " +
      est.trigramasUnicos +
      ")"
  );
  console.log(
    "  obtener(id)       sin índice: " +
      idSinIndice.toFixed(2).padStart(7) +
      " ms | con índice: " +
      idConIndice.toFixed(2).padStart(6) +
      " ms (" +
      gananciaId +
      "× más rápido)"
  );
  console.log(
    "  posicion(id)      sin índice: " +
      posSinIndice.toFixed(2).padStart(7) +
      " ms | con índice: " +
      posConIndice.toFixed(2).padStart(6) +
      " ms (" +
      gananciaPos +
      "× más rápido)"
  );
  console.log(
    "  filtrarPorCampo   sin índice: " +
      campoSinIndice.toFixed(2).padStart(7) +
      " ms | con índice: " +
      campoConIndice.toFixed(2).padStart(6) +
      " ms (" +
      gananciaCampo +
      "× más rápido)"
  );
  console.log(
    "  filtrar(2 campos) sin índice: " +
      compuestoSinIndice.toFixed(2).padStart(7) +
      " ms | con índice: " +
      compuestoConIndice.toFixed(2).padStart(6) +
      " ms (" +
      gananciaCompuesto +
      "× más rápido)"
  );
  console.log(
    "  buscar(texto)     sin índice: " +
      textoSinIndice.toFixed(2).padStart(7) +
      " ms | con índice: " +
      textoConIndice.toFixed(2).padStart(6) +
      " ms (" +
      gananciaTexto +
      "× más rápido, y sin distinguir tildes)\n"
  );
}
