// sitio/ciencia.js — validar particiones y métricas de un proyecto de datos (T37).
//
// Script clásico, sin DOM. Dos validadores que existen porque son los dos errores que más veces
// parecen un buen resultado:
//
//   1. FUGA: el entrenamiento ha visto el futuro. No da error, da una nota mejor. Aquí se busca
//      comparando las fechas de los dos conjuntos, y se dice CUÁNTAS filas del entrenamiento son
//      posteriores a la primera de prueba.
//   2. MÉTRICA MAL CALCULADA: alguien declara una exactitud que no sale de sus números. Se recalcula
//      desde la matriz y se compara; si no coincide, se dice cuánto se desvía.
//
// Y una distinción que se pierde casi siempre: qué comprueba la máquina y qué se autoevalúa. Un número
// se verifica; una conclusión se defiende.
"use strict";

(function (raiz) {
  const num = (v) => {
    const t = String(v == null ? "" : v).trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const fecha = (v) => {
    const t = String(v == null ? "" : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
  };

  /**
   * ¿Hay fuga temporal? Se compara la PRIMERA fecha de prueba con las del entrenamiento.
   * Devuelve las filas del entrenamiento que no deberían estar ahí, no solo un sí o un no.
   */
  function detectarFuga(entrenamiento, prueba, campo) {
    const c = String(campo || "fecha");
    const ent = (Array.isArray(entrenamiento) ? entrenamiento : []).map((f) => fecha(f && f[c])).filter(Boolean).sort();
    const pru = (Array.isArray(prueba) ? prueba : []).map((f) => fecha(f && f[c])).filter(Boolean).sort();
    if (!ent.length || !pru.length) {
      return { limpio: null, motivo: "faltan fechas: no se puede comprobar la partición", fugas: 0, primeraPrueba: null, posteriores: [] };
    }
    const primeraPrueba = pru[0];
    const posteriores = ent.filter((d) => d >= primeraPrueba);
    return {
      limpio: posteriores.length === 0,
      motivo: posteriores.length === 0
        ? "el entrenamiento termina antes de que empiece la prueba"
        : posteriores.length + " filas del entrenamiento son posteriores al inicio de la prueba",
      fugas: posteriores.length,
      primeraPrueba,
      ultimaEntrenamiento: ent[ent.length - 1],
      posteriores: posteriores.slice(0, 10),
    };
  }

  /**
   * Recalcula una métrica desde la matriz y la compara con la declarada.
   * Una métrica sin denominador no se recalcula: se dice que no se puede, en vez de dar un cero.
   */
  function revisarMetrica(matriz, declarada, nombre) {
    const m = matriz && typeof matriz === "object" ? matriz : {};
    const vp = num(m.vp) || 0, fp = num(m.fp) || 0, vn = num(m.vn) || 0, fn = num(m.fn) || 0;
    const nombreNormal = String(nombre || "exactitud").toLowerCase();
    let correcta = null, denominador = null, detalle = "";
    if (nombreNormal.startsWith("exact") || nombreNormal.startsWith("accuracy")) {
      correcta = vp + vn; denominador = vp + fp + vn + fn; detalle = "aciertos sobre el total";
    } else if (nombreNormal.startsWith("sensib") || nombreNormal.startsWith("recall")) {
      correcta = vp; denominador = vp + fn; detalle = "positivos acertados sobre positivos reales";
    } else if (nombreNormal.startsWith("precis")) {
      correcta = vp; denominador = vp + fp; detalle = "positivos acertados sobre positivos predichos";
    } else if (nombreNormal.startsWith("especif")) {
      correcta = vn; denominador = vn + fp; detalle = "negativos acertados sobre negativos reales";
    } else {
      return { ok: null, motivo: "no se sabe recalcular «" + nombreNormal + "»", recalculada: null, declarada: num(declarada) };
    }
    if (!denominador) {
      return { ok: null, motivo: "no hay denominador: la métrica no se puede calcular", recalculada: null, declarada: num(declarada), detalle };
    }
    const recalculada = correcta / denominador;
    const d = num(declarada);
    if (d === null) return { ok: false, motivo: "no se ha declarado ningún valor", recalculada, declarada: null, detalle };
    // Se admite el redondeo a dos decimales: la diferencia se mide, no se adivina.
    const desvio = Math.abs(recalculada - d);
    return {
      ok: desvio <= 0.015,
      motivo: desvio <= 0.015 ? "coincide con la matriz" : "no sale de la matriz: se desvía " + Math.round(desvio * 1000) / 1000,
      recalculada: Math.round(recalculada * 1000) / 1000,
      declarada: d,
      desvio: Math.round(desvio * 1000) / 1000,
      detalle,
    };
  }

  /**
   * Separa lo que se comprueba solo de lo que hay que razonar. Una rúbrica que mezcla las dos cosas
   * deja creer que una conclusión está «validada» cuando solo la ha mirado alguien.
   */
  function separarValidacion(proyecto) {
    const p = proyecto && typeof proyecto === "object" ? proyecto : {};
    const auto = Array.isArray(p.validacionAutomatica) ? p.validacionAutomatica : [];
    const manual = Array.isArray(p.validacionAutoevaluada) ? p.validacionAutoevaluada : [];
    return {
      automatica: auto,
      autoevaluada: manual,
      total: auto.length + manual.length,
      // Si no hay nada automático, se dice: un proyecto sin nada comprobable no está validado.
      soloRazonamiento: auto.length === 0,
      mezcla: auto.length > 0 && manual.length > 0,
    };
  }

  const Ciencia = { detectarFuga, revisarMetrica, separarValidacion };
  if (typeof module !== "undefined" && module.exports) module.exports = Ciencia;
  raiz.Ciencia = Ciencia;
})(typeof globalThis !== "undefined" ? globalThis : this);
