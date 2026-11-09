// Plan de Hoy (T20 · F03). Generado para Data School.
//
// Compone las actividades del día por PRIORIDAD, con motivo, coste en minutos, enlace e
// identificador estable. Es aditivo: no sustituye a `Sesion.planDeSesion`, que sigue componiendo
// solo preguntas de cuestionario. Aquí se añaden lectura y práctica, que tienen criterios propios.
//
// Prioridad (F03), de más a menos urgente:
//   1 · reanudar        lo que quedó a medias se retoma antes que nada
//   2 · repaso vencido  revisiones cuya fecha ya pasó
//   3 · práctica        práctica pendiente declarada
//   4 · itinerario      siguiente paso de la ruta
//
// Reglas que este módulo garantiza:
//   · un mismo recurso no se ofrece dos veces (deduplicación por id estable)
//   · una actividad que no cabe en el presupuesto NO se recorta: va a `noCaben` con su coste,
//     para que la pantalla pueda ofrecer «empezar una parte» o «aplazarla»
//   · el presupuesto nunca se sobrepasa
//   · el coste de cada tipo es explícito y se puede consultar sin componer un plan
(function (raiz) {
  "use strict";

  // Coste en minutos por tipo de actividad. La lectura pesa más que una pregunta: se lee un
  // apartado, no una línea. La práctica es la más cara porque incluye trabajo propio.
  const COSTE = { review: 2, quiz: 2, read: 6, practice: 12 };

  // Tipos admitidos, con su criterio de «completado», que NO es el mismo para todos:
  // una lectura se completa por presencia y final; una práctica, por autoevaluación declarada.
  const TIPOS = {
    review: { etiqueta: "Repaso", cierraPor: "respuesta correcta" },
    quiz: { etiqueta: "Pregunta", cierraPor: "respuesta registrada" },
    read: { etiqueta: "Lectura", cierraPor: "presencia y final" },
    practice: { etiqueta: "Práctica", cierraPor: "autoevaluación declarada" },
  };

  const FUENTES = ["reanudar", "repasos", "practicas", "itinerario"];
  const MOTIVOS = {
    reanudar: "lo dejaste a medias",
    repasos: "el repaso está vencido",
    practicas: "la práctica está pendiente",
    itinerario: "es el siguiente paso de tu ruta",
  };

  function costeDe(tipo) {
    return Object.prototype.hasOwnProperty.call(COSTE, tipo) ? COSTE[tipo] : null;
  }

  /**
   * @param {object} opciones
   * @param {number} opciones.minutos      presupuesto elegido en Hoy (10, 20, 40 o uno propio)
   * @param {object} [opciones.fuentes]    { reanudar, repasos, practicas, itinerario } → listas
   * @param {Set}    [opciones.yaHechas]   ids que ya están cerrados y no se vuelven a ofrecer
   * @returns {{items: object[], noCaben: object[], totalMinutos: number, minutos: number,
   *            recortado: boolean, porTipo: object}}
   */
  function planDeHoy(opciones) {
    const minutos = Number.isFinite(opciones && opciones.minutos) && opciones.minutos >= 0
      ? Math.floor(opciones.minutos) : 0;
    const fuentes = (opciones && opciones.fuentes) || {};
    const yaHechas = opciones && opciones.yaHechas instanceof Set ? opciones.yaHechas : new Set();

    const items = [];
    const noCaben = [];
    const vistos = new Set();
    let total = 0;

    for (const fuente of FUENTES) {
      const lista = Array.isArray(fuentes[fuente]) ? fuentes[fuente] : [];
      for (const a of lista) {
        if (!a || typeof a.id !== "string" || !a.id) continue;
        // El tipo tiene que ser uno de los admitidos: sin él no se puede saber su coste ni su cierre.
        if (!TIPOS[a.tipo]) continue;
        // Deduplicación: el mismo recurso puede llegar por varias rutas (repaso y práctica a la vez).
        if (vistos.has(a.id)) continue;
        vistos.add(a.id);
        if (yaHechas.has(a.id)) continue;

        const coste = costeDe(a.tipo);
        const actividad = {
          id: a.id,
          tipo: a.tipo,
          concepto: typeof a.concepto === "string" ? a.concepto : "",
          enlace: typeof a.enlace === "string" ? a.enlace : "",
          motivo: typeof a.motivo === "string" && a.motivo ? a.motivo : MOTIVOS[fuente],
          fuente,
          minutos: coste,
          // T20 · El índice de la pregunta DENTRO de su ficha viaja con la actividad. Sin él, la sesión
          // no sabe qué pregunta de la ficha toca abrir y descarta todas las de tipo pregunta.
          indice: Number.isInteger(a.indice) ? a.indice : null,
        };

        // No cabe: se declara con su coste para ofrecer parte o aplazamiento. Nunca se recorta.
        if (total + coste > minutos) { noCaben.push(actividad); continue; }
        total += coste;
        items.push(actividad);
      }
    }

    const porTipo = {};
    for (const it of items) porTipo[it.tipo] = (porTipo[it.tipo] || 0) + 1;

    return {
      items,
      noCaben,
      totalMinutos: total,
      minutos,
      recortado: noCaben.length > 0,
      porTipo,
    };
  }

  /** Qué se puede ofrecer con una actividad que no cabe: empezar una parte o aplazarla. */
  function opcionesParaNoCabe(actividad, minutosLibres) {
    const coste = actividad && Number.isFinite(actividad.minutos) ? actividad.minutos : null;
    if (coste === null) return { puedeParte: false, puedeAplazar: true, motivo: "sin coste conocido" };
    const libre = Number.isFinite(minutosLibres) && minutosLibres > 0 ? minutosLibres : 0;
    return {
      puedeParte: libre > 0 && libre < coste,
      minutosParte: libre > 0 && libre < coste ? libre : 0,
      puedeAplazar: true,
      motivo: libre > 0
        ? "quedan " + libre + " min y necesita " + coste
        : "no queda tiempo: necesita " + coste + " min",
    };
  }

  /** Compara las opciones de Hoy (10, 20, 40 y una propia) para enseñar qué entra en cada una. */
  function compararPresupuestos(opciones, lista) {
    const valores = Array.isArray(lista) && lista.length ? lista : [10, 20, 40];
    return valores.map((m) => {
      const p = planDeHoy({ ...opciones, minutos: m });
      return { minutos: m, actividades: p.items.length, totalMinutos: p.totalMinutos, noCaben: p.noCaben.length, porTipo: p.porTipo };
    });
  }

  // Presupuestos que ofrece Hoy, además de una selección propia.
  const PRESUPUESTOS = [10, 20, 40];

  /** Normaliza el presupuesto elegido: 10, 20, 40 o uno propio dentro de un rango razonable. */
  function minutosElegidos(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return 20;
    const entero = Math.round(n);
    if (entero < 5) return 5;
    if (entero > 240) return 240;
    return entero;
  }

  /**
   * Qué se puede hacer cuando se acaba el tiempo. Las tres opciones CONSERVAN el trabajo hecho:
   * ninguna entrega, ninguna descarta respuestas y ninguna da por completado lo pendiente.
   * Es la parte de F03 que impide que el reloj decida por la persona.
   */
  function decidirAlAgotar(datos) {
    const hechas = Number.isFinite(datos && datos.respondidas) ? Math.max(0, Math.floor(datos.respondidas)) : 0;
    const quedan = Number.isFinite(datos && datos.pendientes) ? Math.max(0, Math.floor(datos.pendientes)) : 0;
    const comun = { entregaAutomatica: false, descartaRespuestas: false, cuentaPendientesComoCompletadas: false };
    return {
      continuar: { ...comun, efecto: "seguir sin límite de tiempo", conservaBorrador: true, respondidas: hechas },
      pausar: { ...comun, efecto: "guardar y volver luego", conservaBorrador: true, respondidas: hechas, recuperable: true },
      terminar: { ...comun, efecto: "cerrar la sesión ahora", conservaBorrador: true, respondidas: hechas, pendientes: quedan },
    };
  }

  /**
   * ¿Se puede restaurar este borrador sobre la pregunta que hay delante? (F03)
   *
   * Un borrador guardado puede ser de otra pregunta, de otra revisión del contenido o de otro tipo de
   * actividad. Restaurarlo a ciegas contestaría una pregunta que nadie ha leído. Aquí se comprueba
   * todo eso ANTES de pintar nada, y se devuelve el motivo para poder decir por qué no se recupera.
   *
   * El índice 0 es una respuesta VÁLIDA: por eso no se usa truthiness en ningún punto.
   */
  function validarBorrador(borrador, esperado) {
    const b = borrador && typeof borrador === "object" ? borrador : null;
    const e = esperado && typeof esperado === "object" ? esperado : null;
    if (!b) return { ok: false, motivo: "no hay borrador" };
    if (!e) return { ok: false, motivo: "no se sabe qué pregunta toca" };
    // Solo se compara la clave si el borrador DECLARA la suya. Las respuestas guardadas por la sesión
    // son `{elegida}` y no llevan `clave`: exigirla invalidaba respuestas válidas y las borraba.
    if (typeof e.clave === "string" && typeof b.clave === "string" && b.clave !== e.clave) {
      return { ok: false, motivo: "el borrador es de otra pregunta", obsoleto: true };
    }
    // La revisión del contenido cambia el enunciado y las opciones: un borrador de otra revisión no vale.
    if (e.revision !== undefined && b.revision !== undefined && String(b.revision) !== String(e.revision)) {
      return { ok: false, motivo: "el contenido cambió de revisión", obsoleto: true };
    }
    if (e.tipo !== undefined && b.tipo !== undefined && b.tipo !== e.tipo) {
      return { ok: false, motivo: "el borrador es de otro tipo de actividad", obsoleto: true };
    }
    const opciones = Number.isInteger(e.opciones) && e.opciones > 0 ? e.opciones : null;
    const elegida = b.elegida;
    // En este contenido las opciones van de 1 a n (el campo `a` de una pregunta vale 2 cuando la
    // correcta es la segunda), así que el 0 NO es una opción. Válida solo si es un entero dentro del
    // dominio que existe AHORA: `null`, `undefined`, una cadena o un número fuera de rango no cuentan.
    if (!Number.isInteger(elegida) || elegida < 1) {
      return { ok: false, motivo: "la respuesta guardada no es una opción de esta pregunta" };
    }
    if (opciones !== null && elegida > opciones) {
      return { ok: false, motivo: "la respuesta guardada no es una opción de esta pregunta" };
    }
    return { ok: true, motivo: "", elegida };
  }

  const PlanHoy = {
    COSTE, TIPOS, FUENTES, MOTIVOS, PRESUPUESTOS,
    costeDe, planDeHoy, opcionesParaNoCabe, compararPresupuestos,
    minutosElegidos, decidirAlAgotar, validarBorrador,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = PlanHoy;
  raiz.PlanHoy = PlanHoy;
})(typeof globalThis !== "undefined" ? globalThis : this);
