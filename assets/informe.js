// sitio/informe.js — cobertura, retención y práctica, separadas y con denominador (T40).
//
// Script clásico, sin DOM. Lo que hace útil un informe no es un número grande: es que cada cifra diga
// DE QUÉ es y sobre cuántas cosas se ha calculado.
//
//   · COBERTURA: cuántas preguntas distintas se han usado, sobre cuántas existen.
//   · RETENCIÓN: de las que se acertaron, cuántas se volvieron a acertar después. No es lo mismo que
//     acertar: acertar una vez puede ser suerte o memoria de un minuto.
//   · PRÁCTICA: cuántos intentos, en cuántos días distintos y con qué constancia.
//
// Y el SIGUIENTE PASO sale de los datos: nombra el concepto que peor va, no un «sigue practicando».
"use strict";

(function (raiz) {
  const num = (x) => (Number.isFinite(x) ? x : 0);
  const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

  /** Fechas distintas del historial, en orden. Base de casi todo lo demás. */
  function dias(intentos) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    const conjunto = new Set();
    for (const lista of Object.values(mapa)) {
      for (const i of Array.isArray(lista) ? lista : []) {
        const f = String((i && i.fecha) || "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(f)) conjunto.add(f);
      }
    }
    return [...conjunto].sort();
  }

  /** Cobertura: preguntas distintas usadas sobre las que existen. Siempre con su denominador. */
  function cobertura(intentos, totalPreguntas) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    const usadas = Object.keys(mapa).filter((k) => Array.isArray(mapa[k]) && mapa[k].length > 0);
    const total = Number.isInteger(totalPreguntas) && totalPreguntas > 0 ? totalPreguntas : 0;
    const d = dias(mapa);
    return {
      valor: usadas.length,
      denominador: total,
      porcentaje: pct(usadas.length, total),
      // Sin denominador no hay porcentaje: se dice «—», no un 0 que parece un resultado.
      motivo: total ? "" : "no se sabe cuántas preguntas hay: sin denominador no hay porcentaje",
      desde: d[0] || null,
      hasta: d[d.length - 1] || null,
    };
  }

  /**
   * Retención: de las preguntas acertadas alguna vez, cuántas se acertaron OTRA vez después.
   * Es la cifra que distingue haber acertado de haber aprendido.
   */
  function retencion(intentos) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    let acertadasAlgunaVez = 0, repetidasBien = 0;
    const ejemplos = [];
    for (const [clave, lista] of Object.entries(mapa)) {
      const intentosValidos = (Array.isArray(lista) ? lista : []).filter((i) => i && typeof i.correcta === "boolean");
      const primeraBien = intentosValidos.findIndex((i) => i.correcta === true);
      if (primeraBien < 0) continue;
      acertadasAlgunaVez++;
      const despues = intentosValidos.slice(primeraBien + 1);
      if (despues.some((i) => i.correcta === true)) {
        repetidasBien++;
        if (ejemplos.length < 5) ejemplos.push(clave);
      }
    }
    return {
      valor: repetidasBien,
      denominador: acertadasAlgunaVez,
      porcentaje: pct(repetidasBien, acertadasAlgunaVez),
      motivo: acertadasAlgunaVez ? "" : "todavía no hay ninguna pregunta acertada que se pueda volver a acertar",
      ejemplos,
    };
  }

  /** Práctica: intentos, días distintos y racha más larga. Sin juicios, solo lo que pasó. */
  function practica(intentos) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    let intentosTotales = 0, aciertos = 0;
    for (const lista of Object.values(mapa)) {
      for (const i of Array.isArray(lista) ? lista : []) {
        intentosTotales++;
        if (i && i.correcta === true) aciertos++;
      }
    }
    const d = dias(mapa);
    // Racha: días consecutivos más largos.
    let racha = 0, actual = 0;
    for (let i = 0; i < d.length; i++) {
      if (i === 0) { actual = 1; }
      else {
        const previo = new Date(d[i - 1] + "T00:00:00Z").getTime();
        const ahora = new Date(d[i] + "T00:00:00Z").getTime();
        actual = (ahora - previo === 86400000) ? actual + 1 : 1;
      }
      if (actual > racha) racha = actual;
    }
    return {
      intentos: intentosTotales,
      dias: d.length,
      desde: d[0] || null,
      hasta: d[d.length - 1] || null,
      racha,
      aciertos,
      // La tasa de acierto NO es retención: se llama por su nombre para no confundirlas.
      tasaDeAcierto: intentosTotales ? Math.round((aciertos / intentosTotales) * 1000) / 10 : null,
    };
  }

  /**
   * El siguiente paso, sacado de los datos. Nombra un concepto concreto y dice por qué ese.
   * Si no hay nada que proponer, lo dice: es mejor que inventarse una tarea.
   */
  function siguientePaso(intentos, conceptos) {
    const mapa = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    const nombres = conceptos && typeof conceptos === "object" ? conceptos : {};
    let peor = null;
    for (const [clave, lista] of Object.entries(mapa)) {
      const l = (Array.isArray(lista) ? lista : []).filter((i) => i && typeof i.correcta === "boolean");
      if (!l.length) continue;
      const fallos = l.filter((i) => i.correcta === false).length;
      if (fallos === 0) continue;
      const concepto = clave.split("#")[0];
      const candidato = { clave, concepto, fallos, intentos: l.length, ultimo: l[l.length - 1] };
      if (!peor || fallos > peor.fallos || (fallos === peor.fallos && l.length > peor.intentos)) peor = candidato;
    }
    if (!peor) {
      return {
        hay: false,
        texto: "No hay ninguna pregunta fallada en el historial: el siguiente paso es empezar una sesión con más preguntas para tener algo que corregir.",
        concepto: null, clave: null,
      };
    }
    const titulo = (nombres[peor.concepto] && nombres[peor.concepto].t) || peor.concepto;
    return {
      hay: true,
      concepto: peor.concepto,
      clave: peor.clave,
      fallos: peor.fallos,
      intentos: peor.intentos,
      // Nombra el concepto, cuenta los fallos y propone la acción concreta.
      texto: "Repasa «" + titulo + "»: has fallado " + peor.fallos + " de " + peor.intentos + " veces en esa pregunta. Abre su ficha y vuelve a intentarla.",
    };
  }

  /** Informe completo, con las tres cifras separadas y sus fechas. */
  function informe(intentos, totalPreguntas, conceptos) {
    return {
      cobertura: cobertura(intentos, totalPreguntas),
      retencion: retencion(intentos),
      practica: practica(intentos),
      siguiente: siguientePaso(intentos, conceptos),
      // Las tres NO se suman ni se promedian: miden cosas distintas.
      aviso: "Cobertura, retención y práctica miden cosas distintas y no se combinan en una sola nota.",
    };
  }

  /**
   * Exporta SOLO lo seleccionado. Ni un campo de más: lo que no se marca, no sale.
   * El JSON y el HTML distinguen lo comprobado de lo autoevaluado.
   */
  function exportar(informeCompleto, seleccion) {
    const s = seleccion && typeof seleccion === "object" ? seleccion : {};
    const elegido = {};
    for (const clave of ["cobertura", "retencion", "practica", "siguiente"]) {
      if (s[clave] === true) elegido[clave] = informeCompleto[clave];
    }
    const secciones = Object.keys(elegido);
    const json = { generado: null, secciones, datos: elegido, nota: "Solo contiene las secciones seleccionadas." };
    const html = [
      "<article>",
      "<h1>Informe de aprendizaje</h1>",
      secciones.includes("cobertura") ? "<h2>Cobertura</h2><p>" + elegido.cobertura.valor + " de " + elegido.cobertura.denominador + " preguntas (" + (elegido.cobertura.porcentaje === null ? "—" : elegido.cobertura.porcentaje + " %") + ").</p>" : "",
      secciones.includes("retencion") ? "<h2>Retención</h2><p>" + elegido.retencion.valor + " de " + elegido.retencion.denominador + " acertadas se volvieron a acertar.</p>" : "",
      secciones.includes("practica") ? "<h2>Práctica</h2><p>" + elegido.practica.intentos + " intentos en " + elegido.practica.dias + " días.</p>" : "",
      secciones.includes("siguiente") ? "<h2>Siguiente paso</h2><p>" + String(elegido.siguiente.texto) + "</p>" : "",
      "<p><small>Lo comprobado son números de tu historial; lo autoevaluado lo decides tú.</small></p>",
      "</article>",
    ].filter(Boolean).join("\n");
    return { json, html, secciones, vacio: secciones.length === 0 };
  }

  const Informe = { informe, cobertura, retencion, practica, siguientePaso, exportar, dias };
  if (typeof module !== "undefined" && module.exports) module.exports = Informe;
  raiz.Informe = Informe;
})(typeof globalThis !== "undefined" ? globalThis : this);
