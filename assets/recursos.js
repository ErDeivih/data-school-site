// sitio/recursos.js — estados puros de disponibilidad (T21).
// Los descriptores deConcepto/deActividad son históricos e incompletos. La UI usa el inventario
// generado por scripts/generar-offline.mjs y el proveedor CacheStorage de sitio/offline.js.
//
// Script clásico, sin DOM. Dos ideas, y la segunda es la que importa:
//
//   1. DECLARAR. Un concepto no «es» un fichero: para abrirlo hacen falta los assets, el portal (que trae
//      el manifiesto), el índice de búsqueda y el fichero de su FASE. Declararlo permite comprobar después
//      cada pieza por separado, en vez de dar por bueno el conjunto.
//
//   2. COMPROBAR LO GUARDADO. Ni `navigator.onLine` ni un comprobante de descarga demuestran que el
//      material esté ahí: se mira qué recursos hay, si su huella coincide y cuáles faltan. Un recurso
//      borrado o corrupto da PARCIAL, no COMPLETO.
"use strict";

(function (raiz) {
  const ESTADOS = { COMPLETO: "completo", PARCIAL: "parcial", AUSENTE: "ausente", DESCONOCIDO: "desconocido" };

  // Lo que hace falta para pintar cualquier pantalla del portal.
  const BASE = [
    { ruta: "assets/app.js", papel: "scripts" },
    { ruta: "assets/estilo.css", papel: "estilos" },
    { ruta: "datos/portal.js", papel: "contenido" },
    { ruta: "datos/busqueda.js", papel: "contenido" },
  ];

  /** Los recursos de un concepto: la base, más el fichero de SU fase. */
  function deConcepto(manifiesto, id) {
    const m = manifiesto && typeof manifiesto === "object" ? manifiesto : {};
    const c = (m.conceptos || {})[id];
    if (!c) return { id, tipo: "concepto", ok: false, motivo: "ese concepto no está en el manifiesto", recursos: [] };
    const fase = c.fid ? "datos/fase-" + String(c.fid) + ".js" : null;
    if (!fase) return { id, tipo: "concepto", ok: false, motivo: "el concepto no declara su fase: no se puede saber qué fichero lo contiene", recursos: [] };
    return {
      id, tipo: "concepto", ok: true, motivo: "",
      recursos: [...BASE, { ruta: fase, papel: "contenido", fase: String(c.fid) }],
    };
  }

  /** Los recursos de un dataset del catálogo, con su huella si la declara. */
  function deDataset(conjunto) {
    const c = conjunto && typeof conjunto === "object" ? conjunto : {};
    if (!c.fichero) return { id: c.id || "", tipo: "dataset", ok: false, motivo: "el conjunto no declara fichero", recursos: [] };
    return {
      id: String(c.id || ""), tipo: "dataset", ok: true, motivo: "",
      recursos: [{ ruta: String(c.fichero), papel: "datos", sha256: c.checksum ? String(c.checksum) : null }],
    };
  }

  /**
   * Estado a partir de lo REALMENTE guardado.
   * `guardado` es un mapa ruta -> { sha256 } de lo que hay en el equipo.
   * Si no se conoce una ruta, es AUSENTE; si hay algo pero la huella no coincide, PARCIAL.
   */
  function estado(requeridos, guardado, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const lista = Array.isArray(requeridos) ? requeridos : [];
    const hay = guardado && typeof guardado === "object" ? guardado : null;
    if (!hay) return { estado: ESTADOS.DESCONOCIDO, motivo: "no se ha podido leer lo descargado en este equipo", faltan: [], danados: [], total: lista.length, presentes: 0 };
    if (!lista.length) return { estado: ESTADOS.DESCONOCIDO, motivo: "el recurso no declara qué necesita", faltan: [], danados: [], total: 0, presentes: 0 };

    const faltan = [];
    const danados = [];
    const sinVerificar = [];
    for (const r of lista) {
      const g = hay[r.ruta];
      if (!g) { faltan.push(r.ruta); continue; }
      // La huella solo se compara si las dos partes la declaran; si falta, no se da por buena.
      if (!r.sha256 || !g.sha256) sinVerificar.push(r.ruta);
      else if (String(r.sha256).replace(/^sha256:/, "") !== String(g.sha256).replace(/^sha256:/, "")) danados.push(r.ruta);
    }
    const presentes = lista.length - faltan.length - danados.length;
    if (!faltan.length && !danados.length && sinVerificar.length) return { estado: ESTADOS.DESCONOCIDO, motivo: "hay contenido sin huella comprobable", faltan, danados, sinVerificar, total: lista.length, presentes };
    if (!faltan.length && !danados.length) {
      return { estado: ESTADOS.COMPLETO, motivo: "está descargado y comprobado", faltan, danados, total: lista.length, presentes };
    }
    if (presentes === 0 && !danados.length) {
      return { estado: ESTADOS.AUSENTE, motivo: "no está descargado: hace falta conexión o descargarlo", faltan, danados, total: lista.length, presentes };
    }
    const partes = [];
    if (faltan.length) partes.push("faltan " + faltan.length + " de " + lista.length);
    if (danados.length) partes.push(danados.length + " con la huella distinta");
    return {
      estado: ESTADOS.PARCIAL,
      motivo: "está a medias: " + partes.join(" y "),
      accion: danados.length ? "volver a descargar lo dañado" : "completar la descarga",
      faltan, danados, total: lista.length, presentes,
    };
  }

  /** Para pintar: estado de un recurso con su etiqueta y su acción. */
  function ficha(requeridos, guardado) {
    const e = estado(requeridos, guardado);
    return { ...e, etiqueta: e.estado, accion: e.accion || (e.estado === ESTADOS.AUSENTE ? "descargar" : e.estado === ESTADOS.PARCIAL ? "completar" : "") };
  }

  /**
   * Los recursos de un laboratorio o de un proyecto: la base, más el dataset que declara su metadato.
   * El metadato ya trae `datos` (comprobado: 8 de 8 laboratorios y 10 de 10 proyectos), así que no hay
   * que adivinarlo por el título ni por el código de la vista.
   */
  function deActividad(modulo, manifiesto, id, tipo) {
    const lista = (modulo && Array.isArray(modulo[modulo.META ? "META" : "PROYECTOS"]))
      ? (modulo.META || modulo.PROYECTOS)
      : [];
    const m = lista.find((x) => x && x.id === id);
    if (!m) return { id, tipo, ok: false, motivo: "ese " + tipo + " no está en el catálogo", recursos: [] };
    const conj = ((manifiesto && Array.isArray(manifiesto.conjuntos)) ? manifiesto.conjuntos : []).find((c) => c && c.id === m.datos);
    if (!conj) {
      // Sin manifiesto no se puede comprobar la huella, pero SÍ se puede decir qué fichero hace falta y
      // si está. Se declara con la ruta convencional y se marca `sinHuella`, para no confundir «no lo
      // puedo comprobar» con «no lo necesito».
      if (!m.datos) {
        return { id, tipo, ok: false, motivo: "no declara dataset y sin él no se puede saber qué necesita", recursos: [...BASE] };
      }
      return {
        id, tipo, ok: true, datos: String(m.datos), sinHuella: true,
        motivo: "dataset declarado por convención: falta su huella para comprobar la integridad",
        recursos: [...BASE, { ruta: "datos/datasets/" + String(m.datos) + ".csv", papel: "datos", sha256: null }],
      };
    }
    return { id, tipo, ok: true, motivo: "", datos: String(m.datos), sinHuella: false, recursos: [...BASE, ...deDataset(conj).recursos] };
  }

  const deLaboratorio = (modulo, manifiesto, id) => deActividad(modulo, manifiesto, id, "laboratorio");
  const deProyecto = (modulo, manifiesto, id) => deActividad(modulo, manifiesto, id, "proyecto");

  /** Compatibilidad con consumidores antiguos: un recibo no acredita almacenamiento. */
  function guardadoDelEquipo() {
    // Compatibilidad: los recibos históricos nunca prueban que los bytes sigan guardados.
    // El proveedor real es Offline.inventario(), que lee CacheStorage y calcula SHA-256.
    return null;
  }

  const Recursos = { ESTADOS, BASE, deConcepto, deDataset, deLaboratorio, deProyecto, estado, ficha, guardadoDelEquipo };
  if (typeof module !== "undefined" && module.exports) module.exports = Recursos;
  raiz.Recursos = Recursos;
})(typeof globalThis !== "undefined" ? globalThis : this);
