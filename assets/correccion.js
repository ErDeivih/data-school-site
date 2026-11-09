// sitio/correccion.js — corregir respuestas con REGLAS DECLARADAS (T26).
//
// Script clásico, sin DOM ni almacenamiento, como dominio.js y sesion.js: se puede importar desde Node.
//
// La idea que hace falta: hoy todo el contenido es de opción múltiple, y ampliar tipos no puede
// consistir en comparar cadenas en cada pantalla. Cada pregunta DECLARA cómo se corrige, y aquí vive
// la única implementación de esas reglas.
//
// Tipos y sus reglas:
//   · opcion   — `a`: índice 1-based de la correcta. Un valor fuera de rango no es respuesta.
//   · numerica — `valor`, y opcionalmente `tolerancia` (absoluta), `toleranciaRelativa`, `unidad` y
//                `unidadesAceptadas`. La respuesta puede traer la unidad escrita.
//   · breve    — `aceptadas`: lista de formas válidas. Se comparan normalizadas (tildes, mayúsculas,
//                espacios y puntuación final), porque exigir la tilde no mide conocimiento.
//
// Y una respuesta INCOMPLETA no es un fallo más: se distingue con su motivo, para poder decir «te
// falta la unidad» en vez de «mal».
"use strict";

(function (raiz) {
  /** Normaliza texto para comparar: sin tildes, minúsculas, espacios colapsados, sin punto final. */
  function normalizarTexto(t) {
    return String(t == null ? "" : t)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.;]+$/, "")
      .trim();
  }

  const UNIDADES_DEL_NUMERO = {
    "%": ["%", "por ciento", "porciento", "pct"],
    "€": ["€", "eur", "euros", "euro"],
    "$": ["$", "usd", "dolares", "dolar"],
    "": ["", "u", "ud", "uds", "unidades", "veces"],
  };

  /**
   * Intenta leer un número de un texto, y de paso su unidad.
   * Acepta coma o punto decimal, separador de miles simple y espacios («1 250,5 %»).
   */
  function leerNumero(texto) {
    let s = String(texto == null ? "" : texto).trim();
    if (!s) return null;
    // La unidad son las letras o símbolos que se peguen al final del número.
    const m = s.match(/^([+\-]?\d[\d\s.,]*)\s*([^\d\s].*)?$/);
    if (!m) return null;
    let crudo = m[1].replace(/\s+/g, "");
    // Si hay coma y punto, el último es el decimal y el otro es de miles.
    if (crudo.includes(",") && crudo.includes(".")) {
      if (crudo.lastIndexOf(",") > crudo.lastIndexOf(".")) crudo = crudo.replace(/\./g, "").replace(",", ".");
      else crudo = crudo.replace(/,/g, "");
    } else if (crudo.includes(",")) {
      crudo = crudo.replace(",", ".");
    }
    const valor = Number(crudo);
    if (!Number.isFinite(valor)) return null;
    return { valor, unidad: normalizarTexto(m[2] || "") };
  }

  function unidadAceptada(dada, pregunta) {
    // Lo que se compara es lo que ESCRIBIÓ la persona contra la unidad declarada y sus alias. Antes
    // se comparaba contra la lista canónica y salía siempre verdadero, así que «25» sin unidad pasaba
    // como si la tuviera.
    const esperada = normalizarTexto(pregunta.unidad || "");
    if (!esperada) return true;
    const aceptadas = new Set([esperada]);
    for (const alias of pregunta.unidadesAceptadas || []) aceptadas.add(normalizarTexto(alias));
    for (const c of UNIDADES_DEL_NUMERO[String(pregunta.unidad || "")] || []) aceptadas.add(normalizarTexto(c));
    return aceptadas.has(normalizarTexto(dada));
  }

  /**
   * Corrige una respuesta.
   *
   * @returns {{estado: "correcta"|"incorrecta"|"incompleta"|"invalida", motivo: string}}
   */
  function corregir(pregunta, respuesta) {
    const p = pregunta && typeof pregunta === "object" ? pregunta : {};
    const tipo = p.tipo || (Array.isArray(p.o) ? "opcion" : "breve");

    if (tipo === "opcion") {
      const n = Number(respuesta);
      const opciones = Array.isArray(p.o) ? p.o.length : 0;
      if (!Number.isInteger(n) || n < 1 || (opciones && n > opciones)) {
        return { estado: "invalida", motivo: "no es una opción de esta pregunta" };
      }
      return n === p.a
        ? { estado: "correcta", motivo: "" }
        : { estado: "incorrecta", motivo: "" };
    }

    if (tipo === "numerica") {
      const texto = respuesta == null ? "" : String(respuesta).trim();
      if (!texto) return { estado: "incompleta", motivo: "no has escrito nada" };
      const leido = leerNumero(texto);
      if (!leido) return { estado: "invalida", motivo: "no se entiende como número" };
      const esperado = Number(p.valor);
      if (!Number.isFinite(esperado)) return { estado: "invalida", motivo: "la pregunta no declara su valor" };
      // La unidad se comprueba antes: si falta, la respuesta está INCOMPLETA, no mal.
      if (p.unidad && !unidadAceptada(leido.unidad, p)) {
        if (!leido.unidad) return { estado: "incompleta", motivo: "falta la unidad: se esperaba " + p.unidad };
        return { estado: "incorrecta", motivo: "la unidad no es la que se pide (" + p.unidad + ")" };
      }
      const absoluta = Number.isFinite(p.tolerancia) ? Math.abs(p.tolerancia) : 0;
      const relativa = Number.isFinite(p.toleranciaRelativa) ? Math.abs(p.toleranciaRelativa) * Math.abs(esperado) : 0;
      const margen = Math.max(absoluta, relativa);
      return Math.abs(leido.valor - esperado) <= margen
        ? { estado: "correcta", motivo: "" }
        : { estado: "incorrecta", motivo: "" };
    }

    // breve
    const texto = respuesta == null ? "" : String(respuesta).trim();
    if (!texto) return { estado: "incompleta", motivo: "no has escrito nada" };
    const aceptadas = Array.isArray(p.aceptadas) ? p.aceptadas : [];
    if (!aceptadas.length) return { estado: "invalida", motivo: "la pregunta no declara respuestas aceptadas" };
    const limpio = normalizarTexto(texto);
    return aceptadas.some((a) => normalizarTexto(a) === limpio)
      ? { estado: "correcta", motivo: "" }
      : { estado: "incorrecta", motivo: "" };
  }

  /**
   * El intento tal y como hay que guardarlo: con la revisión del contenido, la ayuda pedida, la
   * confianza declarada y la justificación escrita. Sin esto no se puede saber cuánto costó acertar:
   * un acierto con tres pistas y mucha duda no es lo mismo que uno a la primera.
   */
  function intentoCompleto(opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    return {
      fecha: typeof o.fecha === "string" ? o.fecha : null,
      elegida: o.elegida === undefined ? null : o.elegida,
      correcta: o.correcta === true,
      estado: typeof o.estado === "string" ? o.estado : null,
      revision: typeof o.revision === "string" ? o.revision : "",
      ayuda: Number.isInteger(o.ayuda) && o.ayuda > 0 ? o.ayuda : 0,
      confianza: ["baja", "media", "alta"].includes(o.confianza) ? o.confianza : null,
      justificacion: typeof o.justificacion === "string" ? o.justificacion : "",
      seguro: o.seguro === true ? true : (o.seguro === false ? false : null),
      segundos: Number.isFinite(o.segundos) ? o.segundos : 0,
    };
  }

  const Correccion = { normalizarTexto, leerNumero, corregir, intentoCompleto };
  if (typeof module !== "undefined" && module.exports) module.exports = Correccion;
  raiz.Correccion = Correccion;
})(typeof globalThis !== "undefined" ? globalThis : this);
