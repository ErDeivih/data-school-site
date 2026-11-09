// sitio/sesion.js — motor de sesión de estudio (T20).
//
// Script clásico, como dominio.js: funciona sobre file:// y se puede importar desde Node.
// No toca DOM, ni almacenamiento, ni red. Recibe datos y devuelve un plan y un estado; quién
// guarda y quién pinta es de app.js.
//
// Las tres reglas de T20 que se resuelven aquí, y ninguna es cosmética:
//
//   1. NO DUPLICAR PREGUNTAS COMPARTIDAS POR RUTAS. Un mismo concepto puede estar en tres rutas y
//      sus preguntas son las mismas: si la sesión se arma por ruta y suma, la persona responde la
//      misma pregunta tres veces y el resumen la cuenta tres veces.
//   2. EL PRESUPUESTO NO TRUNCA RESPUESTAS. Si se acaba el tiempo, se dejan de OFRECER preguntas
//      nuevas; lo ya respondido no se toca. Recortar por tiempo lo hecho sería perder trabajo.
//   3. EL RESUMEN CUENTA LO COMPLETADO, no lo planificado. Un resumen que dice «20 preguntas» cuando
//      se planificaron 20 y se respondieron 3 es una mentira cómoda.
"use strict";

(function (raiz) {
  /** Clave estable de una pregunta: concepto + índice dentro de la ficha. */
  function claveDePregunta(conceptoId, indice) {
    return `${conceptoId}#${indice}`;
  }

  /**
   * Arma el plan de una sesión.
   *
   * @param {object} opciones
   * @param {Array<{id: string, preguntas: number}>} opciones.conceptos  conceptos candidatos, en orden
   * @param {number} [opciones.limite]     cuántas preguntas se quieren como máximo
   * @param {Set<string>} [opciones.yaHechas] claves ya respondidas antes, para no repetirlas
   * @returns {{items: Array<{clave: string, concepto: string, indice: number}>, repetidas: number, truncadas: number}}
   */
  function planDeSesion(opciones) {
    const conceptos = Array.isArray(opciones && opciones.conceptos) ? opciones.conceptos : [];
    const limite = Number.isInteger(opciones && opciones.limite) && opciones.limite > 0 ? opciones.limite : 20;
    const yaHechas = opciones && opciones.yaHechas instanceof Set ? opciones.yaHechas : new Set();

    const vistas = new Set();
    const items = [];
    let repetidas = 0;
    let truncadas = 0;

    for (const c of conceptos) {
      if (!c || typeof c.id !== "string") continue;
      const n = Number.isInteger(c.preguntas) && c.preguntas > 0 ? c.preguntas : 0;
      for (let i = 0; i < n; i++) {
        const clave = claveDePregunta(c.id, i);
        // Regla 1: una pregunta se ofrece UNA vez por sesión, por muchas rutas que la compartan.
        if (vistas.has(clave)) { repetidas++; continue; }
        vistas.add(clave);
        if (yaHechas.has(clave)) continue;
        // Regla 2: si no cabe, se deja fuera del plan; nunca se recorta una ya incluida.
        if (items.length >= limite) { truncadas++; continue; }
        items.push({ clave, concepto: c.id, indice: i });
      }
    }

    return { items, repetidas, truncadas };
  }

  /**
   * Estado de una sesión en curso. Es lo único que hay que guardar para poder cerrar y volver.
   *
   * @param {{clave: string}[]} items
   * @param {number} minutosPresupuesto
   */
  function estadoInicial(items, minutosPresupuesto) {
    return {
      version: 1,
      items: (items || []).map((it) => ({ clave: it.clave, concepto: it.concepto, indice: it.indice })),
      posicion: 0,
      respuestas: {},
      minutosPresupuesto: Number.isFinite(minutosPresupuesto) ? minutosPresupuesto : null,
      empezadaEn: null,
      terminada: false,
    };
  }

  /**
   * Responde la pregunta actual y avanza. No borra nada: si ya estaba respondida, se reemplaza.
   * Devuelve un estado NUEVO; no muta el que entra.
   */
  /**
   * ¿Es una respuesta de verdad? Se mira el TIPO, no la veracidad: el índice 0 puede ser una opción
   * válida y con truthiness se descartaría. Y null, undefined, NaN o un negativo no son respuesta.
   */
  function esRespuestaValida(elegida, opciones) {
    // Entero positivo. En este contenido las opciones van de 1 a n —el campo `a` de una pregunta es
    // 2 cuando la correcta es la segunda—, así que el 0 NO es una opción y no puede contar. Si se
    // conoce el número de opciones, además no puede pasarse: un valor fuera del dominio no es
    // respuesta.
    if (typeof elegida !== "number" || !Number.isInteger(elegida) || elegida < 1) return false;
    if (Number.isInteger(opciones) && opciones > 0 && elegida > opciones) return false;
    return true;
  }

  /**
   * Responde la pregunta actual. Una respuesta que no es válida NO TIENE EFECTO: no avanza, no se
   * guarda y no cuenta. Antes se guardaba null y el resumen la contaba como completada.
   */
  function responder(estado, elegida, opciones) {
    if (!estado || !Array.isArray(estado.items) || estado.terminada) return estado;
    const it = estado.items[estado.posicion];
    if (!it) return estado;
    if (!esRespuestaValida(elegida, opciones)) return estado;
    const respuestas = { ...estado.respuestas, [it.clave]: { elegida, ts: null } };
    const posicion = estado.posicion + 1;
    return { ...estado, respuestas, posicion, terminada: posicion >= estado.items.length };
  }

  /**
   * CONTESTA sin avanzar. Es lo que permite corregir en el acto: la respuesta queda guardada y la
   * pregunta sigue en pantalla para enseñar si era correcta y por qué. Avanzar es otro gesto.
   */
  function contestar(estado, elegida, opciones) {
    if (!estado || !Array.isArray(estado.items) || estado.terminada) return estado;
    const it = estado.items[estado.posicion];
    if (!it) return estado;
    if (!esRespuestaValida(elegida, opciones)) return estado;
    const respuestas = { ...estado.respuestas, [it.clave]: { elegida, ts: null } };
    return { ...estado, respuestas };
  }

  /**
   * Contesta guardando ADEMÁS si era correcta, sin corregir en pantalla. Es lo que necesita el modo
   * diferido: la corrección se guarda para poder entregarla, pero no se revela hasta entregar.
   */
  function contestarConCorreccion(estado, elegida, opciones, correcta) {
    if (!estado || !Array.isArray(estado.items) || estado.terminada) return estado;
    const it = estado.items[estado.posicion];
    if (!it) return estado;
    if (!esRespuestaValida(elegida, opciones)) return estado;
    const respuestas = { ...estado.respuestas, [it.clave]: { elegida, correcta: correcta === true } };
    return { ...estado, respuestas };
  }

  /** Respuestas que aún no se han registrado en el camino compartido. */
  function pendientesDeEntregar(estado) {
    const respuestas = (estado && estado.respuestas) || {};
    const entregadas = (estado && estado.entregadas) || {};
    return Object.keys(respuestas).filter((k) => entregadas[k] !== true);
  }

  /** Marca todas las respuestas actuales como entregadas, para no registrarlas dos veces. */
  function marcarEntregadas(estado) {
    if (!estado) return estado;
    const entregadas = { ...(estado.entregadas || {}) };
    for (const k of Object.keys(estado.respuestas || {})) entregadas[k] = true;
    return { ...estado, entregadas };
  }

  /** Avanza a la siguiente sin tocar respuestas ni omisiones. */
  function avanzar(estado) {
    if (!estado || !Array.isArray(estado.items) || estado.terminada) return estado;
    if (!estado.items[estado.posicion]) return estado;
    const posicion = estado.posicion + 1;
    return { ...estado, posicion, terminada: posicion >= estado.items.length };
  }

  /**
   * Pasa a la siguiente SIN contestar. Es un gesto legítimo y se cuenta aparte: omitir no es
   * responder, y un resumen que los mezcla miente sobre lo que la persona ha hecho.
   */
  function omitir(estado) {
    if (!estado || !Array.isArray(estado.items) || estado.terminada) return estado;
    const it = estado.items[estado.posicion];
    if (!it) return estado;
    const omitidas = { ...(estado.omitidas || {}), [it.clave]: true };
    const posicion = estado.posicion + 1;
    return { ...estado, omitidas, posicion, terminada: posicion >= estado.items.length };
  }

  /**
   * El presupuesto se agotó. La sesión NO se cierra y NO se toca ninguna respuesta: solo deja de
   * ofrecer preguntas nuevas. Si el usuario quiere seguir, hay que decírselo explícitamente con
   * `seguir`.
   */
  function agotarPresupuesto(estado) {
    if (!estado) return estado;
    return { ...estado, presupuestoAgotado: true };
  }

  /**
   * Resumen de lo COMPLETADO. `planificadas` se devuelve aparte, y a propósito: para que quien lo
   * pinte tenga que decidir cuál enseña, y no pueda confundirlas sin querer.
   */
  function resumen(estado, modo = estado && estado.modo) {
    const items = Array.isArray(estado && estado.items) ? estado.items : [];
    const respuestas = (estado && estado.respuestas) || {};
    const omitidas = (estado && estado.omitidas) || {};
    // Completada es solo la que tiene una respuesta VÁLIDA guardada. Omitir no completa.
    const conRespuesta = items.filter((it) => esRespuestaValida(respuestas[it.clave] && respuestas[it.clave].elegida));
    const completadas = conRespuesta;
    const totalOmitidas = items.filter((it) => omitidas[it.clave] === true && !esRespuestaValida(respuestas[it.clave] && respuestas[it.clave].elegida));
    // T20 · Estos estados NO son el mismo y no se pueden sumar entre sí sin decirlo:
    //   respondida · hay una opción válida guardada
    //   correcta   · además se sabe que acierta (solo tras corregir)
    //   entregada  · esa respuesta ya se ha entregado (modo diferido)
    //   autoevaluada · práctica manual: la persona declara cómo le salió
    const de = (clave) => respuestas[clave] || {};
    const mapaEntregadas = (estado && estado.entregadas) || {};
    const corregida = (it) => modo !== "diferida" || estado?.entregada === true ||
      mapaEntregadas[it.clave] === true || de(it.clave).entregada === true;
    const correctas = conRespuesta.filter((it) => corregida(it) && de(it.clave).correcta === true);
    const incorrectas = conRespuesta.filter((it) => corregida(it) && de(it.clave).correcta === false);
    const sinCorregir = conRespuesta.filter((it) => !corregida(it) ||
      (de(it.clave).correcta !== true && de(it.clave).correcta !== false));
    const entregadas = conRespuesta.filter((it) => mapaEntregadas[it.clave] === true || de(it.clave).entregada === true);
    // La autoevaluación es de la práctica: se cuenta sobre TODAS las actividades, no solo sobre las
    // que tienen una opción válida, porque una práctica no se contesta eligiendo.
    const autoevaluadas = items.filter((it) => {
      const x = de(it.clave).autoevaluacion;
      return typeof x === "string" && x.length > 0;
    });
    return {
      planificadas: items.length,
      completadas: completadas.length,
      // Alias explicito: «respondida» es lo que la gente entiende por hecha, y es lo mismo que completadas.
      respondidas: completadas.length,
      omitidas: totalOmitidas.length,
      pendientes: items.length - completadas.length - totalOmitidas.length,
      correctas: correctas.length,
      incorrectas: incorrectas.length,
      sinCorregir: sinCorregir.length,
      entregadas: entregadas.length,
      sinEntregar: completadas.length - entregadas.length,
      autoevaluadas: autoevaluadas.length,
      posicion: estado && Number.isInteger(estado.posicion) ? estado.posicion : 0,
      terminada: !!(estado && estado.terminada),
      presupuestoAgotado: !!(estado && estado.presupuestoAgotado),
    };
  }

  const Sesion = {
    claveDePregunta, planDeSesion, estadoInicial, responder, contestar, contestarConCorreccion, avanzar, omitir,
    pendientesDeEntregar, marcarEntregadas,
    esRespuestaValida, agotarPresupuesto, resumen,
    /** Lo elegido en la pregunta actual, o null. */
    respuestaActual(estado) {
      if (!estado || !Array.isArray(estado.items)) return null;
      const it = estado.items[estado.posicion];
      if (!it) return null;
      const r = (estado.respuestas || {})[it.clave];
      return r && esRespuestaValida(r.elegida) ? r : null;
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Sesion;
  raiz.Sesion = Sesion;
})(typeof globalThis !== "undefined" ? globalThis : this);
