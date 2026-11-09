// sitio/rubricas.js — rúbricas versionadas y comparación de reentregas (T39).
//
// Script clásico, sin DOM.
//
// Tres cosas que una nota sola no da:
//   · VERSIÓN de la rúbrica: si los pesos cambian, se sabe, y no se compara lo incomparable.
//   · AUTOMÁTICO frente a MANUAL: qué ha medido la máquina y qué ha decidido una persona.
//   · REENTREGA: qué criterio MEJORÓ y cuál empeoró, no solo la nota nueva. Una nota sin comparación
//     no dice si se ha aprendido algo.
"use strict";

(function (raiz) {
  /** Huella estable de una rúbrica: sus criterios y sus pesos. Sirve para detectar cambios. */
  function huella(rubrica) {
    const lista = Array.isArray(rubrica) ? rubrica : [];
    const texto = lista.map((c) => String(c.id || "") + ":" + String(c.peso || 0) + ":" + String(c.criterio || "")).join("|");
    let h = 0;
    for (let i = 0; i < texto.length; i++) { h = (h * 31 + texto.charCodeAt(i)) >>> 0; }
    return { version: "r" + h.toString(16).slice(0, 8), criterios: lista.length, texto };
  }

  /**
   * Compara dos evaluaciones del MISMO proyecto. Devuelve qué mejoró y qué empeoró, criterio a
   * criterio, y una frase que lo dice. Si la rúbrica cambió entre las dos, NO se comparan las notas:
   * se avisa, porque sería comparar dos escalas distintas.
   */
  function compararReentrega(antes, despues) {
    const a = antes && typeof antes === "object" ? antes : {};
    const b = despues && typeof despues === "object" ? despues : {};
    const da = Array.isArray(a.detalle) ? a.detalle : [];
    const db = Array.isArray(b.detalle) ? b.detalle : [];
    if (!da.length || !db.length) return { ok: false, motivo: "faltan evaluaciones que comparar", mejoraron: [], empeoraron: [], igual: [] };

    if (a.rubricaVersion && b.rubricaVersion && a.rubricaVersion !== b.rubricaVersion) {
      return {
        ok: false,
        motivo: "la rúbrica cambió entre las dos entregas (" + a.rubricaVersion + " → " + b.rubricaVersion + "): las notas no son comparables",
        mejoraron: [], empeoraron: [], igual: [],
      };
    }

    const porCriterio = new Map(da.map((d) => [d.criterio, d]));
    const mejoraron = [], empeoraron = [], igual = [];
    for (const d of db) {
      const previo = porCriterio.get(d.criterio);
      if (!previo) continue;
      if (d.nivel > previo.nivel) mejoraron.push({ criterio: d.criterio, antes: previo.nivel, ahora: d.nivel });
      else if (d.nivel < previo.nivel) empeoraron.push({ criterio: d.criterio, antes: previo.nivel, ahora: d.nivel });
      else igual.push({ criterio: d.criterio, nivel: d.nivel });
    }

    const notaAntes = Number(a.nota) || 0;
    const notaDespues = Number(b.nota) || 0;
    const delta = Math.round((notaDespues - notaAntes) * 10) / 10;
    // La frase dice QUÉ cambió, no solo cuánto: «mejoró» sin decir en qué no enseña.
    const explicacion = mejoraron.length === 0 && empeoraron.length === 0
      ? "Ningún criterio cambió de nivel: la reentrega no mejora ni empeora lo que se mide."
      : [
          mejoraron.length ? "mejoró en " + mejoraron.map((x) => "«" + x.criterio + "»").join(", ") : "",
          empeoraron.length ? "empeoró en " + empeoraron.map((x) => "«" + x.criterio + "»").join(", ") : "",
        ].filter(Boolean).join("; ") + ".";
    return { ok: true, motivo: "", notaAntes, notaDespues, delta, mejoraron, empeoraron, igual, explicacion };
  }

  /**
   * Separa los resultados automáticos de los manuales. Un criterio es automático si su evidencia se
   * puede comprobar sola (una matriz, una fecha, una métrica); si no, lo decide una persona.
   */
  function separarResultados(detalle, proyecto) {
    const lista = Array.isArray(detalle) ? detalle : [];
    const p = proyecto && typeof proyecto === "object" ? proyecto : {};
    // Se marca en la RUBRICA, no se adivina por el texto: emparejar frases daba cero coincidencias y
    // habria dejado todos los criterios como manuales.
    const porCriterio = new Map((Array.isArray(p.rubrica) ? p.rubrica : []).map((c) => [c.criterio, c]));
    const esAuto = (criterio) => {
      const c = porCriterio.get(criterio);
      return !!(c && c.automatico === true);
    };
    const automaticos = lista.filter((d) => esAuto(d.criterio));
    const manuales = lista.filter((d) => !esAuto(d.criterio));
    return {
      automaticos, manuales,
      automaticosPendientes: automaticos.filter((d) => d.nivel < 3).length,
      manualesPendientes: manuales.filter((d) => d.nivel < 3).length,
      // Y se dice cuál manda: la nota final es de la máquina solo en la parte automática.
      aviso: manuales.length
        ? "La parte manual la valora una persona: la máquina no puede decidir si una conclusión está bien razonada."
        : "Todos los criterios de esta entrega se pueden comprobar automáticamente.",
    };
  }

  const Rubricas = { huella, compararReentrega, separarResultados };
  if (typeof module !== "undefined" && module.exports) module.exports = Rubricas;
  raiz.Rubricas = Rubricas;
})(typeof globalThis !== "undefined" ? globalThis : this);
