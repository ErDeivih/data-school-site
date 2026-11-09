// sitio/avisos.js — avisos dentro de la app, que enlazan al cambio y se pueden reducir (T51).
//
// Script clásico, sin DOM. Tres reglas:
//
//   1. UN AVISO DE CORRECCIÓN ENLAZA AL CAMBIO. No dice «se actualizó un contenido»: dice QUÉ concepto
//      y QUÉ cambió, con el enlace. Un aviso sin destino no sirve para nada.
//   2. LEÍDO Y ARCHIVADO PERSISTEN. Se guardan en el estado, así que siguen ahí al reabrir: un aviso que
//      reaparece cada vez enseña a ignorarlos.
//   3. LAS PREFERENCIAS REDUCEN. Cada tipo se puede apagar, y lo apagado no se enseña —pero TAMPOCO se
//      borra—. Y no hay push ni correo: los canales son los de la app, y no se finge otro.
"use strict";

(function (raiz) {
  const TIPOS = ["correccion", "novedad", "recordatorio"];
  const CANALES = ["en-la-app"];
  const CLAVE_PREF = "aprender.v1.avisos-pref";
  const PREF_POR_DEFECTO = { correccion: true, novedad: true, recordatorio: true };

  function estadoInicial() {
    return { avisos: [], prefs: { ...PREF_POR_DEFECTO } };
  }

  /** Crea un aviso. Si es de corrección, EXIGE el concepto y qué cambió: sin eso no hay enlace. */
  function crear(datos, ahora) {
    const d = datos && typeof datos === "object" ? datos : {};
    const tipo = TIPOS.includes(String(d.tipo)) ? String(d.tipo) : null;
    if (!tipo) return { ok: false, motivo: "tipo de aviso desconocido: " + String(d.tipo) };
    if (!d.id) return { ok: false, motivo: "falta el identificador del aviso" };
    if (!d.mensaje) return { ok: false, motivo: "falta el mensaje" };
    if (tipo === "correccion") {
      if (!d.concepto) return { ok: false, motivo: "un aviso de corrección sin concepto no tiene a dónde enlazar" };
      if (!d.cambio) return { ok: false, motivo: "un aviso de corrección tiene que decir qué cambió" };
    }
    return {
      ok: true, motivo: "",
      aviso: {
        id: String(d.id), tipo, mensaje: String(d.mensaje),
        concepto: d.concepto ? String(d.concepto) : null,
        cambio: d.cambio ? String(d.cambio) : null,
        // El enlace se calcula aquí: una plantilla no puede inventarse la ruta.
        enlace: d.concepto ? "#/c/" + String(d.concepto) : null,
        creado: typeof ahora === "string" ? ahora : null,
        leido: false, archivado: false,
      },
    };
  }

  /** Añade sin duplicar por id. */
  function agregar(estado, aviso) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    const lista = Array.isArray(e.avisos) ? [...e.avisos] : [];
    if (!aviso || !aviso.id) return e;
    const i = lista.findIndex((x) => x.id === aviso.id);
    if (i >= 0) lista[i] = aviso; else lista.push(aviso);
    return { ...e, avisos: lista };
  }

  /** Marca leído o archivado. Persistir es escribir el estado; aquí se devuelve cambiado. */
  function marcar(estado, id, que) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    if (!["leido", "archivado"].includes(que)) return e;
    return { ...e, avisos: (e.avisos || []).map((a) => (a.id === id ? { ...a, [que]: true } : a)) };
  }

  /** Los que se enseñan: ni archivados ni de un tipo apagado. Lo apagado NO se borra. */
  function visibles(estado) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    const prefs = { ...PREF_POR_DEFECTO, ...(e.prefs || {}) };
    const lista = Array.isArray(e.avisos) ? e.avisos : [];
    const mostrados = lista.filter((a) => !a.archivado && prefs[a.tipo] !== false);
    return {
      avisos: mostrados,
      // Se dice cuántos se ocultan y por qué: no desaparecen por arte de magia.
      ocultosPorPreferencia: lista.filter((a) => !a.archivado && prefs[a.tipo] === false).length,
      archivados: lista.filter((a) => a.archivado).length,
      sinLeer: mostrados.filter((a) => !a.leido).length,
    };
  }

  /** Cambia una preferencia. Solo los tipos conocidos y solo booleano. */
  function preferencia(estado, tipo, valor) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    if (!TIPOS.includes(String(tipo))) return { ...e, error: "tipo desconocido: " + String(tipo) };
    return { ...e, prefs: { ...PREF_POR_DEFECTO, ...(e.prefs || {}), [String(tipo)]: valor === true } };
  }

  /** Serializa para guardar; y vuelve. Lo que se guarda es el estado, no la pantalla. */
  function serializar(estado) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    return JSON.stringify({ avisos: e.avisos || [], prefs: { ...PREF_POR_DEFECTO, ...(e.prefs || {}) } });
  }
  function deserializar(texto) {
    try {
      const v = JSON.parse(String(texto || ""));
      if (!v || !Array.isArray(v.avisos)) return estadoInicial();
      return { avisos: v.avisos, prefs: { ...PREF_POR_DEFECTO, ...(v.prefs || {}) } };
    } catch (e) { return estadoInicial(); }
  }

  /**
   * No hay push ni correo. Esta función existe para que la respuesta sea explícita y no una promesa
   * vacía: si alguien pide otro canal, se le dice que no hay.
   */
  function enviarPor(canal) {
    const c = String(canal || "");
    if (CANALES.includes(c)) return { ok: true, motivo: "se muestra dentro de la app" };
    return { ok: false, motivo: "este portal no envía avisos por «" + (c || "(vacío)") + "»: solo dentro de la app, sin permisos de push ni correos" };
  }

  const Avisos = { TIPOS, CANALES, PREF_POR_DEFECTO, estadoInicial, crear, agregar, marcar, visibles, preferencia, serializar, deserializar, enviarPor };
  if (typeof module !== "undefined" && module.exports) module.exports = Avisos;
  raiz.Avisos = Avisos;
})(typeof globalThis !== "undefined" ? globalThis : this);
