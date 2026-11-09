// sitio/conflictos.js — fusionar sin perder trabajo de nadie (T44).
//
// Script clásico, sin DOM. Tres reglas, y las tres existen porque la alternativa es perder datos en
// silencio:
//
//   1. DOS EDICIONES SIMULTÁNEAS CONSERVAN LAS DOS. No se elige una y se tira la otra: se guardan como
//      VARIANTES y se pide una resolución explícita. Quien edita no puede perder lo suyo porque el otro
//      guardó medio segundo antes.
//   2. UN SNAPSHOT VIEJO NO RESUCITA UN BORRADO. La marca de borrado gana a cualquier copia con
//      contador menor. Resucitar sin querer es peor que perder un cambio: el borrado fue una decisión.
//   3. EL RELOJ NO DECIDE. Dos equipos con horas distintas no pueden tener razón por tener el reloj
//      adelantado, así que cuando los contadores empatan y los relojes no, NO se elige: se avisa.
//
// La autoridad es el CONTADOR de versión, que solo sube cuando alguien edita de verdad.
"use strict";

(function (raiz) {
  const RESOLUCION = { NINGUNA: "ninguna", REQUIERE: "requiere", TOMADA: "tomada" };

  /** Una entidad con su contador, su marca de borrado y sus variantes si las hubiera. */
  function normalizar(e) {
    const x = e && typeof e === "object" ? e : {};
    return {
      id: String(x.id == null ? "" : x.id),
      version: Number.isInteger(x.version) ? x.version : 0,
      borrada: x.borrada === true,
      contenido: x.contenido === undefined ? null : x.contenido,
      actualizado: typeof x.actualizado === "string" ? x.actualizado : null,
      variantes: Array.isArray(x.variantes) ? x.variantes : [],
      resolucion: x.resolucion === RESOLUCION.REQUIERE || x.resolucion === RESOLUCION.TOMADA ? x.resolucion : RESOLUCION.NINGUNA,
      motivo: typeof x.motivo === "string" ? x.motivo : "",
    };
  }

  /** ¿Son el mismo contenido? Se compara de forma canónica para no confundir el orden de claves. */
  function iguales(a, b) {
    const canonico = (v) => {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      if (Array.isArray(v)) return "[" + v.map(canonico).join(",") + "]";
      return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonico(v[k])).join(",") + "}";
    };
    return canonico(a) === canonico(b);
  }

  /**
   * Fusiona dos versiones de la MISMA entidad. Nunca descarta contenido sin decirlo.
   * Devuelve la entidad fusionada, con `resolucion` y `motivo` explicando qué ha pasado.
   */
  function fusionar(local, remoto) {
    const a = normalizar(local);
    const b = normalizar(remoto);
    if (a.id && b.id && a.id !== b.id) {
      return { ...a, resolucion: RESOLUCION.REQUIERE, motivo: "son entidades distintas: no se fusionan" };
    }
    const id = a.id || b.id;

    // ── Regla 2: la marca de borrado gana a un snapshot viejo ──────────────
    if (a.borrada || b.borrada) {
      const borrada = a.borrada ? a : b;
      const otra = a.borrada ? b : a;
      if (otra.version <= borrada.version) {
        // Llega una copia más vieja (o igual) que el borrado: NO resucita.
        return {
          ...borrada, id, version: borrada.version,
          resolucion: RESOLUCION.TOMADA,
          motivo: otra.version < borrada.version
            ? "una copia de la versión " + otra.version + " no resucita un borrado de la " + borrada.version
            : "la copia y el borrado están en la misma versión: manda el borrado",
        };
      }
      // Edición MÁS NUEVA que el borrado: no se aplica sola, pero tampoco se tira.
      return {
        ...borrada, id,
        variantes: [...borrada.variantes, { contenido: otra.contenido, version: otra.version, actualizado: otra.actualizado, de: "posterior al borrado" }],
        resolucion: RESOLUCION.REQUIERE,
        motivo: "hay una edición posterior al borrado (versión " + otra.version + " frente a " + borrada.version + "): hay que decidir si se conserva",
      };
    }

    // ── Regla 1: dos ediciones simultáneas conservan las dos ───────────────
    if (a.version === b.version) {
      if (iguales(a.contenido, b.contenido)) {
        return { ...a, id, resolucion: RESOLUCION.NINGUNA, motivo: "mismo contenido en las dos: nada que resolver" };
      }
      // Misma versión y contenido distinto: las dos son válidas y ninguna puede ganar sola.
      const relojes = a.actualizado && b.actualizado && a.actualizado !== b.actualizado;
      return {
        id, version: a.version, borrada: false, contenido: a.contenido,
        actualizado: a.actualizado,
        variantes: [
          { contenido: a.contenido, version: a.version, actualizado: a.actualizado, de: "local" },
          { contenido: b.contenido, version: b.version, actualizado: b.actualizado, de: "remoto" },
        ],
        resolucion: RESOLUCION.REQUIERE,
        // Regla 3: si además los relojes no coinciden, se dice, porque entonces el reloj no sirve
        // ni para ordenar ni para desempatar.
        motivo: relojes
          ? "dos ediciones de la misma versión con relojes distintos (" + a.actualizado + " y " + b.actualizado + "): el reloj no decide, hay que elegir"
          : "dos ediciones de la misma versión: las dos se conservan y hay que elegir",
      };
    }

    // ── Versiones distintas: gana la mayor, y se dice ─────────────────────
    const gana = a.version > b.version ? a : b;
    const pierde = a.version > b.version ? b : a;
    return {
      ...gana, id,
      variantes: gana.variantes.length ? gana.variantes : [{ contenido: pierde.contenido, version: pierde.version, actualizado: pierde.actualizado, de: "versión anterior" }],
      resolucion: RESOLUCION.TOMADA,
      motivo: "gana la versión " + gana.version + " frente a la " + pierde.version + "; la anterior se conserva como variante",
    };
  }

  /**
   * Resolución explícita: se elige una de las variantes y se sube el contador.
   * No se puede resolver sin elegir, ni elegir algo que no esté entre las variantes.
   */
  function resolver(entidad, eleccion) {
    const e = normalizar(entidad);
    if (e.resolucion !== RESOLUCION.REQUIERE) return { ok: false, motivo: "esta entidad no está pendiente de resolución", entidad: e };
    const indice = Number(eleccion);
    if (!Number.isInteger(indice) || indice < 0 || indice >= e.variantes.length) {
      return { ok: false, motivo: "hay que elegir una de las " + e.variantes.length + " variantes", entidad: e };
    }
    const elegida = e.variantes[indice];
    return {
      ok: true, motivo: "resuelta eligiendo la variante " + indice,
      entidad: {
        ...e,
        contenido: elegida.contenido,
        // Sube el contador: la resolución es una edición más y no puede volver a empatar.
        version: Math.max(e.version, elegida.version) + 1,
        borrada: false,
        variantes: e.variantes,
        resolucion: RESOLUCION.TOMADA,
        motivo: "resuelta a mano",
      },
    };
  }

  /** ¿Hay algo pendiente de decidir? Sirve para avisar sin abrir la entidad. */
  function pendientes(lista) {
    const l = Array.isArray(lista) ? lista : [];
    return l.filter((x) => normalizar(x).resolucion === RESOLUCION.REQUIERE);
  }

  const Conflictos = { RESOLUCION, fusionar, resolver, pendientes, normalizar };
  if (typeof module !== "undefined" && module.exports) module.exports = Conflictos;
  raiz.Conflictos = Conflictos;
})(typeof globalThis !== "undefined" ? globalThis : this);
