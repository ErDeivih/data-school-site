// Agenda de sesión (T20 · F03) — generado para Data School.
//
// Una AGENDA es la lista estable de actividades del día: lectura, práctica, repaso y preguntas, cada
// una con su clave, su motivo, su coste y —lo que faltaba— la EVIDENCIA que la cierra. El mismo plan
// alimenta la lista, el paso actual, la recuperación y el resumen; no se recalcula en cada pintado.
//
// Dominio puro: sin DOM, sin almacén. Se guarda fuera y se lee tal cual.
(function (raiz) {
  "use strict";

  const TIPOS = {
    read: {
      etiqueta: "Lectura",
      // La lectura se cierra con presencia (tiempo en pantalla) Y final (haber llegado al final).
      evidencia: ["presencia", "final"],
      coste: 6,
    },
    practice: {
      etiqueta: "Práctica",
      // La práctica manual la cierra la persona: se declara cómo salió. No hay corrección automática.
      evidencia: ["autoevaluacion"],
      coste: 12,
    },
    review: {
      etiqueta: "Repaso",
      evidencia: ["respuesta"],
      coste: 2,
    },
    quiz: {
      etiqueta: "Pregunta",
      evidencia: ["respuesta"],
      coste: 2,
    },
  };

  const FUENTES = ["reanudar", "repaso", "practica", "itinerario"];
  const MOTIVOS = {
    reanudar: "lo dejaste a medias",
    repaso: "el repaso está vencido",
    practica: "la práctica está pendiente",
    itinerario: "es el siguiente paso de tu ruta",
  };

  const costeDe = (tipo) => (TIPOS[tipo] ? TIPOS[tipo].coste : null);

  /** Identidad estable de una actividad: no cambia entre pintados ni al reabrir. */
  function idDe(fuente, tipo, concepto, indice) {
    const base = fuente + ":" + tipo + ":" + concepto;
    return Number.isInteger(indice) ? base + "#" + indice : base;
  }

  /**
   * Construye la agenda. Las fuentes llegan ya ordenadas por prioridad; aquí solo se compone, se
   * deduplica por clave y se decide qué cabe. Lo que no cabe queda con su coste para poder ofrecer
   * «empezar una parte» o posponer, que son acciones reales.
   */
  function crear(opciones) {
    const minutos = Number.isFinite(opciones?.minutos) && opciones.minutos >= 0 ? Math.floor(opciones.minutos) : 0;
    const fuentes = opciones?.fuentes || {};
    const completadas = opciones?.completadas instanceof Set ? opciones.completadas : new Set();
    const actividades = [];
    const noCaben = [];
    const vistas = new Set();
    let total = 0;

    for (const fuente of FUENTES) {
      const lista = Array.isArray(fuentes[fuente]) ? fuentes[fuente] : [];
      for (const a of lista) {
        if (!a || typeof a.concepto !== "string" || !a.concepto) continue;
        if (!TIPOS[a.tipo]) continue;
        const indice = Number.isInteger(a.indice) ? a.indice : null;
        const id = typeof a.id === "string" && a.id ? a.id : idDe(fuente, a.tipo, a.concepto, indice);
        const clave = typeof a.clave === "string" && a.clave ? a.clave : (indice === null ? a.concepto : a.concepto + "#" + indice);
        // Se deduplica por CLAVE, no por id: la misma pregunta puede llegar por repaso y por itinerario,
        // y el id lleva la fuente, así que por id entraría dos veces.
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        const coste = costeDe(a.tipo);
        const actividad = {
          id,
          tipo: a.tipo,
          concepto: a.concepto,
          indice,
          clave,
          motivo: typeof a.motivo === "string" && a.motivo ? a.motivo : MOTIVOS[fuente],
          fuente,
          minutos: coste,
          evidencia: (TIPOS[a.tipo].evidencia || []).slice(),
          completada: completadas.has(id),
        };
        // Lo ya completado cuenta como hecho, pero no consume presupuesto de hoy.
        if (actividad.completada) { actividades.push(actividad); continue; }
        if (total + coste > minutos) { noCaben.push(actividad); continue; }
        total += coste;
        actividades.push(actividad);
      }
    }

    return {
      minutos,
      totalMinutos: total,
      actividades,
      noCaben,
      recortado: noCaben.length > 0,
      creadaEn: opciones?.creadaEn || null,
    };
  }

  /** ¿La evidencia presentada cierra esta actividad? Cada tipo exige lo suyo. */
  function evidenciaBasta(actividad, evidencia) {
    if (!actividad || !TIPOS[actividad.tipo]) return { ok: false, motivo: "actividad desconocida" };
    const e = evidencia && typeof evidencia === "object" ? evidencia : {};
    const tipo = actividad.tipo;
    if (tipo === "read") {
      if (!(Number(e.segundos) >= 0)) return { ok: false, motivo: "la lectura necesita tiempo en pantalla" };
      if (e.llegóAlFinal !== true && e.llegoAlFinal !== true) return { ok: false, motivo: "la lectura necesita llegar al final" };
      if (Number(e.segundos) <= 0) return { ok: false, motivo: "el tiempo de presencia debe ser mayor que cero" };
      return { ok: true, motivo: "" };
    }
    if (tipo === "practice") {
      const v = e.autoevaluacion;
      if (!(typeof v === "string" && v.length)) return { ok: false, motivo: "la práctica la cierra la autoevaluación, no una visita" };
      return { ok: true, motivo: "" };
    }
    // quiz y review
    const n = e.elegida;
    if (!Number.isInteger(n) || n < 1) return { ok: false, motivo: "una respuesta válida tiene que ser una opción" };
    if (Number.isInteger(e.opciones) && n > e.opciones) return { ok: false, motivo: "la opción está fuera de la pregunta" };
    return { ok: true, motivo: "" };
  }

  /** Marca una actividad como completada, guardando la evidencia que la cierra. Es idempotente. */
  function completar(agenda, id, evidencia) {
    if (!agenda || !Array.isArray(agenda.actividades)) return agenda;
    const actividad = agenda.actividades.find((a) => a.id === id);
    if (!actividad) return agenda;
    if (actividad.completada) return agenda; // ya estaba: no se duplica ni se reescribe
    const veredicto = evidenciaBasta(actividad, evidencia);
    if (!veredicto.ok) return agenda;
    return {
      ...agenda,
      actividades: agenda.actividades.map((a) => (a.id === id
        ? { ...a, completada: true, evidencia: { ...(evidencia || {}), cerradaEn: (evidencia && evidencia.cerradaEn) || null } }
        : a)),
    };
  }

  /** La actividad que toca ahora: la primera no completada, en el orden de la agenda. */
  function siguiente(agenda) {
    if (!agenda || !Array.isArray(agenda.actividades)) return null;
    // Posponer es una acción explícita: la actividad deja de ser la actual pero SIGUE pendiente.
    return agenda.actividades.find((a) => !a.completada && !a.pospuesta) || null;
  }

  /**
   * Resumen POR TIPO: lo que la sesión no sabía decir. Distingue completadas y pendientes de cada tipo,
   * y no llama «sesión completada» mientras quede alguna actividad del plan.
   */
  function resumen(agenda) {
    const actividades = Array.isArray(agenda?.actividades) ? agenda.actividades : [];
    const porTipo = {};
    for (const tipo of Object.keys(TIPOS)) {
      const lista = actividades.filter((a) => a.tipo === tipo);
      if (!lista.length) continue;
      porTipo[tipo] = {
        etiqueta: TIPOS[tipo].etiqueta,
        total: lista.length,
        completadas: lista.filter((a) => a.completada).length,
        pendientes: lista.filter((a) => !a.completada).length,
      };
    }
    const completadas = actividades.filter((a) => a.completada).length;
    const pospuestas = actividades.filter((a) => !a.completada && a.pospuesta).length;
    const pendientes = actividades.length - completadas;
    return {
      total: actividades.length,
      completadas,
      pendientes,
      pospuestas,
      porTipo,
      // «Terminada» exige que no quede NADA del plan, no solo que se acaben las preguntas.
      terminada: actividades.length > 0 && pendientes === 0,
      minutos: agenda?.minutos || 0,
      totalMinutos: agenda?.totalMinutos || 0,
    };
  }

  /** Qué se puede hacer con una actividad que no cabe: son acciones, no adornos. */
  function opcionesParaNoCabe(actividad, minutosLibres) {
    const coste = actividad && Number.isFinite(actividad.minutos) ? actividad.minutos : null;
    const libre = Number.isFinite(minutosLibres) && minutosLibres > 0 ? minutosLibres : 0;
    if (coste === null) return { puedeParte: false, minutosParte: 0, puedePosponer: true, motivo: "sin coste conocido" };
    return {
      puedeParte: libre > 0 && libre < coste,
      minutosParte: libre > 0 && libre < coste ? libre : 0,
      puedePosponer: true,
      motivo: libre > 0 ? "quedan " + libre + " min y necesita " + coste : "no queda tiempo: necesita " + coste + " min",
    };
  }

  const Agenda = {
    TIPOS, FUENTES, MOTIVOS,
    costeDe, idDe, crear, evidenciaBasta, completar, siguiente, resumen, opcionesParaNoCabe,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Agenda;
  raiz.Agenda = Agenda;
})(typeof globalThis !== "undefined" ? globalThis : this);
