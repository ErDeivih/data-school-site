// sitio/ingenieria.js — deduplicar, repetir sin duplicar y controlar la calidad (T36).
//
// Script clásico, sin DOM. Lo que se demuestra aquí con fixtures pequeños es lo que en producción se
// da por hecho y casi nunca se prueba:
//
//   · DEDUPLICAR: la misma fila dos veces no cuenta dos veces, y se dice CUÁNTAS se quitaron.
//   · REPETICIÓN SEGURA (idempotencia): cargar lo mismo dos veces deja el mismo resultado, no el doble.
//   · CONTROLES DE CALIDAD: y sobre todo, que FALLEN cuando deben. Un control que nunca falla es
//     decoración.
"use strict";

(function (raiz) {
  const texto = (v) => String(v == null ? "" : v).trim();

  /** Quita repetidos por la clave dada. Devuelve las filas únicas y las que se descartaron. */
  function deduplicar(filas, clave) {
    const lista = Array.isArray(filas) ? filas : [];
    const c = String(clave || "id");
    const vistas = new Set();
    const unicas = [];
    const descartadas = [];
    for (const f of lista) {
      const k = texto(f && f[c]);
      // Una clave vacía NO identifica una fila: si se usara como clave, todas las vacías se
      // colapsarían en una, que es justo el error que este control tiene que evitar.
      if (k === "") { unicas.push(f); continue; }
      if (vistas.has(k)) { descartadas.push(f); continue; }
      vistas.add(k);
      unicas.push(f);
    }
    return {
      clave: c,
      entrada: lista.length,
      salida: unicas.length,
      quitadas: descartadas.length,
      unicas,
      descartadas,
      // Sin clave, no se deduplica nada: se dice, en vez de fingir que se hizo.
      sinClave: lista.filter((f) => texto(f && f[c]) === "").length,
    };
  }

  /**
   * Carga idempotente: aplicar dos veces la misma carga da lo mismo que aplicarla una vez.
   * Se devuelve también la comprobación, porque el valor está en poder enseñarla.
   */
  function cargarDosVeces(filas, clave) {
    const una = deduplicar(filas, clave);
    // La idempotencia se mide sobre las filas CON clave: son las unicas que se pueden reconocer al
    // repetir. Las que vienen sin clave no se pueden deduplicar, y fingir que si seria el error que
    // este fixture existe para ensenar.
    const conClave = una.unicas.filter((f) => texto(f && f[clave]) !== "");
    const dos = deduplicar(conClave.concat(conClave), clave);
    const primeraConClave = conClave.length;
    return {
      primeraVez: primeraConClave,
      segundaVez: dos.salida,
      idempotente: primeraConClave === dos.salida,
      quitadasEnLaSegunda: dos.quitadas,
      sinClave: una.sinClave,
      totalTrasDosCargas: dos.salida + una.sinClave * 2,
      avisoSinClave: una.sinClave
        ? "Hay " + una.sinClave + " filas sin clave: no se pueden reconocer al repetir la carga, asi que no hay idempotencia posible para ellas."
        : "",
    };
  }

  /**
   * Controles de calidad. Cada control declara qué mira y devuelve las filas que lo incumplen.
   * `ok` es cierto solo si NINGÚN control encuentra nada.
   */
  function controles(filas, reglas) {
    const lista = Array.isArray(filas) ? filas : [];
    const r = reglas && typeof reglas === "object" ? reglas : {};
    const resultados = [];

    if (r.clave) {
      const vistas = new Map();
      for (const f of lista) {
        const k = texto(f && f[r.clave]);
        if (k === "") continue;
        vistas.set(k, (vistas.get(k) || 0) + 1);
      }
      const repetidas = [...vistas.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ clave: k, veces: n }));
      resultados.push({ control: "sin repetidos por " + r.clave, fallos: repetidas.length, detalle: repetidas });
    }

    for (const col of r.obligatorias || []) {
      const vacias = lista.filter((f) => texto(f && f[col]) === "").length;
      resultados.push({ control: "sin vacíos en " + col, fallos: vacias, detalle: [] });
    }

    for (const [col, [minimo, maximo]] of Object.entries(r.rangos || {})) {
      const fuera = lista.filter((f) => {
        const n = Number(texto(f && f[col]).replace(",", "."));
        return Number.isFinite(n) && (n < minimo || n > maximo);
      }).length;
      resultados.push({ control: "dentro de rango en " + col + " (" + minimo + " a " + maximo + ")", fallos: fuera, detalle: [] });
    }

    const totalFallos = resultados.reduce((s, x) => s + x.fallos, 0);
    return { reglas: Object.keys(r).length, resultados, totalFallos, ok: totalFallos === 0 };
  }

  const Ingenieria = { deduplicar, cargarDosVeces, controles };
  if (typeof module !== "undefined" && module.exports) module.exports = Ingenieria;
  raiz.Ingenieria = Ingenieria;
})(typeof globalThis !== "undefined" ? globalThis : this);
