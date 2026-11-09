// sitio/sincronizacion.js — cola de operaciones que sobrevive a red, timeout y sesión (T43).
//
// Script clásico, sin DOM. El envío se INYECTA: así se prueba el comportamiento con un servidor de
// mentira que falla de formas concretas (timeout, sin red, 401, 409) sin levantar nada.
//
// La regla que hace que esto funcione: una operación que no sabemos si llegó se queda en la cola con
// SU MISMO operationId. Al reenviarla, el servidor de T42 contesta 200 «repetida» y no aplica nada
// dos veces. Un timeout no es un fallo: es una duda, y la duda se resuelve reenviando lo mismo.
"use strict";

(function (raiz) {
  const MAX_INTENTOS_AVISO = 5;

  function estadoInicial() {
    return { operaciones: [], sesionCaducada: false, ultimoError: null };
  }

  /** Encola una operación. El mismo operationId no se encola dos veces: se reemplaza el payload. */
  function encolar(estado, operacion) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    const op = operacion && typeof operacion === "object" ? operacion : {};
    if (!op.operationId || !op.tipo) return { ...e, rechazada: "falta operationId o tipo" };
    const lista = Array.isArray(e.operaciones) ? [...e.operaciones] : [];
    const i = lista.findIndex((x) => x.operationId === op.operationId);
    const nueva = { operationId: String(op.operationId), tipo: String(op.tipo), payload: op.payload || {}, intentos: 0, ultimoError: null };
    if (i >= 0) lista[i] = { ...nueva, intentos: lista[i].intentos || 0 };
    else lista.push(nueva);
    return { ...e, operaciones: lista, rechazada: null };
  }

  /**
   * Intenta enviar todo lo pendiente. `enviar(op)` devuelve uno de:
   *   { resultado: "ok" }        · aplicada o repetida: se saca de la cola
   *   { resultado: "conflicto" } · 409: no se reintenta, pero se aparta para poder mirarla
   *   { resultado: "sin-sesion" }· 401: NO se pierde nada y se para
   *   { resultado: "red" }       · sin conexión o timeout: se queda y se reintenta después
   */
  async function drenar(estado, enviar) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    const pendientes = Array.isArray(e.operaciones) ? [...e.operaciones] : [];
    if (typeof enviar !== "function") return { estado: e, hechas: 0, rechazadas: 0, pendiente: pendientes.length, parada: "sin-enviador" };

    let hechas = 0, rechazadas = 0;
    const quedan = [];
    const apartadas = [];
    let sesionCaducada = false;
    let parada = null;
    let ultimoError = null;

    for (const op of pendientes) {
      if (sesionCaducada) { quedan.push(op); continue; }
      let r;
      try { r = await enviar(op); } catch (error) { r = { resultado: "red", error: error.message }; }
      const resultado = (r && r.resultado) || "red";
      if (resultado === "ok") { hechas++; continue; }
      if (resultado === "conflicto") { rechazadas++; apartadas.push({ ...op, motivo: (r && r.motivo) || "conflicto" }); continue; }
      if (resultado === "sin-sesion") {
        // La sesión caducó: la cola se conserva ENTERA, no se pierde lo que no se ha enviado.
        sesionCaducada = true;
        parada = "sesion-caducada";
        quedan.push(op);
        continue;
      }
      // Red o timeout: se queda, con su mismo id, y se cuenta el intento.
      ultimoError = (r && r.error) || "sin conexión";
      quedan.push({ ...op, intentos: (op.intentos || 0) + 1, ultimoError });
    }

    return {
      estado: { ...e, operaciones: quedan, sesionCaducada: sesionCaducada || e.sesionCaducada === true, apartadas, ultimoError },
      hechas, rechazadas, pendiente: quedan.length, parada,
      // Aviso cuando una operación lleva demasiados intentos: es lo que evita un bucle silencioso.
      aviso: quedan.some((x) => (x.intentos || 0) >= MAX_INTENTOS_AVISO)
        ? "Hay operaciones que llevan " + MAX_INTENTOS_AVISO + " intentos sin poder enviarse."
        : null,
    };
  }

  /**
   * Convergencia de dos contextos: UNIÓN por operationId. Ni se duplica lo repetido ni se pierde lo
   * que solo tiene uno. Es lo que hace que dos pestañas no se pisen.
   */
  function converger(a, b) {
    const la = (a && Array.isArray(a.operaciones) ? a.operaciones : []);
    const lb = (b && Array.isArray(b.operaciones) ? b.operaciones : []);
    const porId = new Map();
    for (const op of [...lb, ...la]) {
      if (!op || !op.operationId) continue;
      const previa = porId.get(op.operationId);
      if (!previa) { porId.set(op.operationId, op); continue; }
      // Si está en los dos, se queda la que más se ha intentado: es la que tiene más historia.
      if ((op.intentos || 0) > (previa.intentos || 0)) porId.set(op.operationId, op);
    }
    return {
      operaciones: [...porId.values()],
      sesionCaducada: (a && a.sesionCaducada === true) || (b && b.sesionCaducada === true),
      ultimoError: (a && a.ultimoError) || (b && b.ultimoError) || null,
    };
  }

  /** ¿Queda algo por enviar? Sirve para decidir si se enseña el aviso de «sin conexión». */
  function pendientes(estado) {
    return (estado && Array.isArray(estado.operaciones)) ? estado.operaciones.length : 0;
  }

  const Sincronizacion = { estadoInicial, encolar, drenar, converger, pendientes, MAX_INTENTOS_AVISO };
  if (typeof module !== "undefined" && module.exports) module.exports = Sincronizacion;
  raiz.Sincronizacion = Sincronizacion;
})(typeof globalThis !== "undefined" ? globalThis : this);
