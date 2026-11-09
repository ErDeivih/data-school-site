// sitio/recordatorios.js — recordatorios opt-in que nunca bloquean el estudio (T55).
//
// Script clásico, sin DOM. El permiso y la programación se INYECTAN, y eso permite probar lo que de
// verdad importa:
//
//   · RECHAZAR EL PERMISO NO BLOQUEA ESTUDIAR. El estado devuelve siempre `estudioDisponible: true`,
//     pase lo que pase con el permiso. Un recordatorio es un extra, no una puerta.
//   · DESACTIVAR CANCELA los avisos programados: no basta con dejar de programar; los ya puestos se
//     retiran. Si no, seguirían llegando después de decir que no.
//   · UN ENLACE ABRE EL RECURSO CORRECTO, y si no lo es, se dice: un enlace roto no puede llevar a la
//     portada sin explicar por qué.
"use strict";

(function (raiz) {
  const ESTADOS_PERMISO = ["concedido", "denegado", "no-pedido"];
  const RUTAS_VALIDAS = /^#\/(c|sesion|informe|avisos|proyectos|paquetes|conflictos|transferencia|mapa|notas|dudas|buscar)(\/[^?#]*)?$/;

  function estadoInicial() {
    return { permiso: "no-pedido", programados: [], activo: false, estudioDisponible: true };
  }

  /**
   * Pide el permiso con la función que se le dé. Nunca lanza y nunca deja el estudio inaccesible:
   * si el permiso falla, se registra el motivo y se sigue.
   */
  async function pedirPermiso(estado, pedir) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    if (typeof pedir !== "function") {
      return { ...e, permiso: "denegado", motivo: "no hay forma de pedir permiso", estudioDisponible: true };
    }
    let respuesta;
    try { respuesta = await pedir(); }
    catch (error) { respuesta = { concedido: false, motivo: error && error.message ? error.message : "error al pedir permiso" }; }
    const concedido = respuesta && respuesta.concedido === true;
    return {
      ...e,
      permiso: concedido ? "concedido" : "denegado",
      motivo: concedido ? "" : String((respuesta && respuesta.motivo) || "el permiso no se concedió"),
      // Lo importante: el estudio sigue disponible en los dos casos.
      estudioDisponible: true,
    };
  }

  /** Programa recordatorios SOLO si hay permiso. Sin permiso no se programa nada y se dice. */
  function programar(estado, recordatorios, ahora) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    if (e.permiso !== "concedido") {
      return { ...e, programados: [], activo: false, motivo: "sin permiso no se programa ningún recordatorio", estudioDisponible: true };
    }
    const lista = (Array.isArray(recordatorios) ? recordatorios : [])
      .filter((r) => r && r.cuando && RUTAS_VALIDAS.test(String(r.enlace || "")))
      .map((r, i) => ({ id: String(r.id || "r" + (i + 1)), cuando: String(r.cuando), enlace: String(r.enlace), titulo: String(r.titulo || "Recordatorio") }));
    return {
      ...e, programados: lista, activo: lista.length > 0, motivo: "",
      descartados: (Array.isArray(recordatorios) ? recordatorios.length : 0) - lista.length,
      estudioDisponible: true,
    };
  }

  /** Desactiva: además de no programar, CANCELA los que hubiera. */
  function desactivar(estado, cancelar) {
    const e = estado && typeof estado === "object" ? estado : estadoInicial();
    const cuantos = Array.isArray(e.programados) ? e.programados.length : 0;
    let cancelados = 0;
    if (typeof cancelar === "function") {
      try { cancelados = Number(cancelar(cuantos)) || 0; } catch (error) { cancelados = 0; }
    }
    return {
      ...e, programados: [], activo: false,
      // Se dice cuántos se han cancelado de verdad, no cuántos se pretendía.
      cancelados: typeof cancelar === "function" ? cancelados : cuantos,
      motivo: cuantos ? "desactivados y cancelados " + (typeof cancelar === "function" ? cancelados : cuantos) + " recordatorio(s)" : "no había ninguno programado",
      estudioDisponible: true,
    };
  }

  /** Un enlace abre SU recurso: se valida la ruta y se devuelve el destino. */
  function destinoDe(enlace) {
    const texto = String(enlace || "").trim();
    if (!texto) return { ok: false, motivo: "el enlace está vacío", destino: null };
    const limpio = texto.startsWith("#") ? texto : "#" + texto.replace(/^\/?/, "/");
    if (!RUTAS_VALIDAS.test(limpio)) return { ok: false, motivo: "ese enlace no lleva a un recurso conocido", destino: null, intento: limpio };
    return { ok: true, motivo: "", destino: limpio };
  }

  const Recordatorios = { ESTADOS_PERMISO, estadoInicial, pedirPermiso, programar, desactivar, destinoDe, RUTAS_VALIDAS };
  if (typeof module !== "undefined" && module.exports) module.exports = Recordatorios;
  raiz.Recordatorios = Recordatorios;
})(typeof globalThis !== "undefined" ? globalThis : this);
