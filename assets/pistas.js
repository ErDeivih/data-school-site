// sitio/pistas.js — pistas que no soplan la respuesta y cobertura medida de verdad (T27).
//
// Script clásico, sin DOM ni almacenamiento.
//
// Dos reglas que se incumplen solas si no se escriben:
//
//   1. UNA PISTA NO COPIA LA SOLUCIÓN. Se comprueba contra el texto de la opción correcta: si la
//      contiene, la pista no sirve —señala el camino o señala el destino, no las dos cosas— y se
//      degrada. Con respuesta breve o numérica se comprueba contra la respuesta aceptada.
//
//   2. SI NO HAY PISTA, SE DICE QUE ES UN REPASO CONTEXTUAL, no se disfraza de pista propia. Un
//      «repasa el concepto» no es una pista: es un respaldo, y la persona tiene derecho a saber que
//      no le están ayudando con ESTA pregunta.
//
// Y la cobertura se calcula desde las preguntas REALMENTE usadas —las claves que hay en `intentos`—
// contra las que existen, no desde una cifra fija inventada.
"use strict";

(function (raiz) {
  /** Quita tildes, mayúsculas y puntuación para comparar de forma justa. */
  function plano(t) {
    return String(t == null ? "" : t)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, " ")
      .trim();
  }

  /** ¿La pista contiene la respuesta? Se compara con lo correcto de cada tipo de pregunta. */
  function soplaLaRespuesta(pregunta, pista) {
    const p = plano(pista);
    if (!p) return false;
    const candidatos = [];
    const q = pregunta && typeof pregunta === "object" ? pregunta : {};
    if (Array.isArray(q.o) && Number.isInteger(q.a) && q.o[q.a - 1] !== undefined) candidatos.push(String(q.o[q.a - 1]));
    if (q.valor !== undefined) candidatos.push(String(q.valor));
    for (const a of q.aceptadas || []) candidatos.push(String(a));
    for (const texto of candidatos) {
      const c = plano(texto);
      if (!c) continue;
      // Coincidencia completa de la respuesta dentro de la pista: eso la delata.
      if (p === c || p.includes(c)) return true;
      // O al revés, cuando la respuesta es corta y la pista la repite entera.
      if (c.length >= 4 && c.includes(p) && p.length >= 4) return true;
    }
    return false;
  }

  /**
   * La pista que se puede dar, con su naturaleza declarada.
   * @returns {{tipo: "propia"|"contextual"|"ninguna", texto: string, motivo: string}}
   */
  function pistaDe(pregunta, contexto) {
    const q = pregunta && typeof pregunta === "object" ? pregunta : {};
    const propia = typeof q.pista === "string" ? q.pista.trim() : "";
    if (propia && !soplaLaRespuesta(q, propia)) {
      return { tipo: "propia", texto: propia, motivo: "" };
    }
    const donde = contexto && typeof contexto === "object" && contexto.titulo ? String(contexto.titulo) : "";
    if (propia) {
      // Tenía pista, pero delataba: se degrada y se dice por qué en vez de enseñarla igual.
      return {
        tipo: "contextual",
        texto: donde ? "Esta pregunta no tiene una pista que no desvele la respuesta. Repasa el concepto «" + donde + "»." : "Esta pregunta no tiene una pista que no desvele la respuesta: repasa el concepto entero.",
        motivo: "la pista original contenía la respuesta",
      };
    }
    return {
      tipo: "contextual",
      texto: donde ? "No hay pista para esta pregunta. Es un repaso contextual de «" + donde + "»." : "No hay pista para esta pregunta: es un repaso contextual del concepto.",
      motivo: "no hay pista propia",
    };
  }

  /**
   * Cobertura REAL: preguntas usadas (las que aparecen en el historial) contra las que existen.
   * No hay ninguna cifra fija: si el historial está vacío, la cobertura es cero, no un número bonito.
   *
   * @param {object} intentos  mapa clave -> lista de intentos
   * @param {number} totalPreguntas las que existen en el contenido
   */
  function cobertura(intentos, totalPreguntas) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    const usadas = Object.keys(mapa).filter((k) => Array.isArray(mapa[k]) && mapa[k].length > 0);
    const total = Number.isInteger(totalPreguntas) && totalPreguntas > 0 ? totalPreguntas : 0;
    return {
      usadas: usadas.length,
      total,
      proporcion: total ? Math.min(1, usadas.length / total) : 0,
      // Una pregunta usada con respuestas distintas en fechas distintas, para revisión por muestra.
      conHistorial: usadas.filter((k) => mapa[k].length > 1).length,
    };
  }

  /**
   * Muestra para revisión: las preguntas con más de un intento, con su último resultado. Se guarda la
   * MUESTRA, no un resumen que oculte de dónde sale.
   */
  function muestraParaRevision(intentos, maximo) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    const tope = Number.isInteger(maximo) && maximo > 0 ? maximo : 10;
    return Object.entries(mapa)
      .filter(([, lista]) => Array.isArray(lista) && lista.length > 0)
      .map(([clave, lista]) => ({
        clave,
        intentos: lista.length,
        ultimo: lista[lista.length - 1] || null,
        fallos: lista.filter((x) => x && x.correcta === false).length,
      }))
      // Primero las que peor van: más fallos y después más intentos.
      .sort((a, b) => b.fallos - a.fallos || b.intentos - a.intentos)
      .slice(0, tope);
  }

  const Pistas = { plano, soplaLaRespuesta, pistaDe, cobertura, muestraParaRevision };
  if (typeof module !== "undefined" && module.exports) module.exports = Pistas;
  raiz.Pistas = Pistas;
})(typeof globalThis !== "undefined" ? globalThis : this);
