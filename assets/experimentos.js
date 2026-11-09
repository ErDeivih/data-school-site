// sitio/experimentos.js — cálculo de la mesa de experimentos (T29).
//
// Script clásico, sin DOM. Trabaja sobre las filas ya leídas de un dataset del portal.
//
// Todo lo que la mesa enseña sale de aquí: si la tabla y el resumen no se calculan en el mismo sitio,
// acaban discrepando. Y las funciones son puras, así que se prueban con datos conocidos.
"use strict";

(function (raiz) {
  /** Convierte el CSV en filas de objetos usando la cabecera. Tolera CRLF y líneas vacías. */
  function leerCsv(texto) {
    const lineas = String(texto || "").replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (!lineas.length) return { columnas: [], filas: [] };
    const columnas = lineas[0].split(",").map((c) => c.trim());
    const filas = lineas.slice(1).map((l) => {
      const vals = l.split(",");
      const o = {};
      columnas.forEach((c, i) => { o[c] = vals[i] === undefined ? "" : vals[i].trim(); });
      return o;
    });
    return { columnas, filas };
  }

  const numero = (v) => {
    // Una celda VACÍA no es un cero: `Number("")` da 0, y ese cero entraba en las medias y las hundía
    // (con 1, vacío, «no» y 3 la media salía 1,333 en vez de 2).
    const texto = String(v == null ? "" : v).trim();
    if (texto === "") return null;
    const n = Number(texto.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  /** Estadísticos de una columna numérica. Los vacíos no cuentan, y se dice cuántos quedaron fuera. */
  function estadisticas(filas, columna) {
    const valores = [];
    let noNumericos = 0;
    for (const f of filas) {
      const n = numero(f[columna]);
      if (n === null) { if (String(f[columna] || "").trim() !== "") noNumericos++; continue; }
      valores.push(n);
    }
    if (!valores.length) return { n: 0, media: null, mediana: null, minimo: null, maximo: null, desviacion: null, noNumericos };
    const orden = [...valores].sort((a, b) => a - b);
    const suma = valores.reduce((s, x) => s + x, 0);
    const media = suma / valores.length;
    const medio = Math.floor(orden.length / 2);
    const mediana = orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
    // Desviación con n-1: es una MUESTRA de lecturas, no la población entera.
    const varianza = valores.length > 1 ? valores.reduce((s, x) => s + (x - media) ** 2, 0) / (valores.length - 1) : 0;
    return {
      n: valores.length,
      media: redondear(media),
      mediana: redondear(mediana),
      minimo: orden[0],
      maximo: orden[orden.length - 1],
      desviacion: redondear(Math.sqrt(varianza)),
      noNumericos,
    };
  }

  const redondear = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

  /** Histograma con el número de cubos que pida la persona. Determinista para los mismos datos. */
  function histograma(filas, columna, cubos) {
    const valores = filas.map((f) => numero(f[columna])).filter((n) => n !== null);
    if (!valores.length) return { cubos: [], total: 0 };
    const k = Math.max(1, Math.min(50, Math.floor(Number(cubos) || 5)));
    const minimo = Math.min(...valores), maximo = Math.max(...valores);
    const ancho = maximo === minimo ? 1 : (maximo - minimo) / k;
    const cuenta = new Array(k).fill(0);
    for (const v of valores) {
      const i = maximo === minimo ? 0 : Math.min(k - 1, Math.floor((v - minimo) / ancho));
      cuenta[i]++;
    }
    return {
      total: valores.length,
      cubos: cuenta.map((n, i) => ({
        desde: redondear(minimo + i * ancho),
        hasta: redondear(minimo + (i + 1) * ancho),
        n,
        // La proporción es lo que se compara entre histogramas de distinto tamaño.
        proporcion: redondear(n / valores.length),
      })),
    };
  }

  /** Agrupa por una columna de texto y agrega una numérica. Sirve para comparar segmentos. */
  function agrupar(filas, porColumna, columna, agregado) {
    const grupos = new Map();
    for (const f of filas) {
      const clave = String(f[porColumna] || "").trim() || "(vacío)";
      if (!grupos.has(clave)) grupos.set(clave, []);
      const n = numero(f[columna]);
      if (n !== null) grupos.get(clave).push(n);
    }
    const op = agregado === "conteo" ? null : (agregado === "mediana" ? "mediana" : (agregado === "maximo" ? "maximo" : "media"));
    return [...grupos.entries()].map(([clave, vals]) => {
      let valor = null;
      if (op === null) valor = vals.length;
      else if (vals.length) {
        const orden = [...vals].sort((a, b) => a - b);
        if (op === "mediana") { const m = Math.floor(orden.length / 2); valor = orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2; }
        else if (op === "maximo") valor = orden[orden.length - 1];
        else valor = vals.reduce((s, x) => s + x, 0) / vals.length;
      }
      return { grupo: clave, n: vals.length, valor: valor === null ? null : redondear(valor) };
    }).sort((a, b) => (b.valor ?? -Infinity) - (a.valor ?? -Infinity));
  }

  const Experimentos = { leerCsv, estadisticas, histograma, agrupar, redondear };
  if (typeof module !== "undefined" && module.exports) module.exports = Experimentos;
  raiz.Experimentos = Experimentos;
})(typeof globalThis !== "undefined" ? globalThis : this);
