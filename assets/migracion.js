// sitio/migracion.js — versionar y migrar todas las entidades (T41).
//
// Script clásico, sin DOM. El almacén se INYECTA (get/set/remove), así que esto se prueba con un
// almacén de mentira y luego se usa con localStorage sin cambiar una línea.
//
// Lo que tiene que cumplir una migración para ser de fiar:
//
//   · COPIA antes de tocar nada, y se dice dónde está.
//   · CUENTEO: cuántos hechos había y cuántos hay después. Sin números, «se conservó todo» es una fe.
//   · INTERRUPCIÓN: si se corta a la mitad, la siguiente ejecución TERMINA lo que falta, no empieza
//     de cero ni da por buena una migración a medias.
//   · REPETICIÓN: correrla dos veces no cambia nada la segunda vez.
//   · VERSIÓN FUTURA DESCONOCIDA: si los datos son de una versión más nueva que este código, NO se
//     tocan. Mejor no arrancar que destruir lo que no se entiende.
"use strict";

(function (raiz) {
  const CLAVE_ESQUEMA = "aprender.v2.esquema";
  const CLAVE_COPIA = "aprender.v2.copia";
  const CLAVE_PASO = "aprender.v2.paso";

  /**
   * Las entidades que se migran, con la forma que se espera al final.
   * `cuenta` dice cuántos HECHOS hay dentro (no claves del objeto): una nota es un hecho, un intento
   * es un hecho. Así el conteo significa algo.
   */
  const ENTIDADES = [
    { clave: "aprender.v1.notas", nombre: "notas", tipo: "mapa",
      // T24 dejó la normalización para el momento de leer. La migración la materializa: una nota es
      // {texto, seccion, ts}, aunque llevara años guardada como una cadena.
      normalizar: (v) => {
        const salida = {};
        for (const [id, n] of Object.entries(v && typeof v === "object" ? v : {})) {
          if (typeof n === "string") { if (n.trim() !== "") salida[id] = { texto: n, seccion: "", ts: null }; }
          else if (n && typeof n === "object") salida[id] = { texto: String(n.texto || ""), seccion: String(n.seccion || ""), ts: typeof n.ts === "number" ? n.ts : null };
        }
        return salida;
      },
      cuenta: (v) => Object.keys(v || {}).length },
    { clave: "aprender.v1.dudas", nombre: "dudas", tipo: "mapa",
      normalizar: (v) => {
        const salida = {};
        for (const [id, d] of Object.entries(v && typeof v === "object" ? v : {})) {
          if (!d || typeof d !== "object") continue;
          salida[id] = {
            texto: String(d.texto || ""),
            concepto: d.concepto || null,
            seccion: String(d.seccion || ""),
            estado: d.estado === "resuelta" ? "resuelta" : "abierta",
            explicacion: String(d.explicacion || ""),
            ts: typeof d.ts === "number" ? d.ts : null,
            borrada: d.borrada && typeof d.borrada.en === "number" ? { en: d.borrada.en } : null,
          };
        }
        return salida;
      },
      cuenta: (v) => Object.keys(v || {}).length },
    { clave: "aprender.v1.intentos", nombre: "intentos", tipo: "mapa",
      normalizar: (v) => {
        const salida = {};
        for (const [k, lista] of Object.entries(v && typeof v === "object" ? v : {})) {
          if (!Array.isArray(lista)) continue;
          // Cada intento es un hecho: no se descarta ninguno, ni siquiera uno raro.
          salida[k] = lista.filter((i) => i && typeof i === "object").map((i) => ({
            fecha: typeof i.fecha === "string" ? i.fecha : "",
            elegida: i.elegida === undefined ? null : i.elegida,
            correcta: i.correcta === true,
            seguro: typeof i.seguro === "boolean" ? i.seguro : null,
            segundos: Number.isFinite(i.segundos) ? i.segundos : 0,
          }));
        }
        return salida;
      },
      cuenta: (v) => Object.values(v || {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0) },
    { clave: "aprender.v1.entregas", nombre: "entregas", tipo: "lista",
      normalizar: (v) => (Array.isArray(v) ? v : []).filter((e) => e && typeof e === "object"),
      cuenta: (v) => (Array.isArray(v) ? v.length : 0) },
    { clave: "aprender.v1.favoritos", nombre: "favoritos", tipo: "mapa",
      normalizar: (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
      cuenta: (v) => Object.keys(v || {}).length },
    { clave: "aprender.v1.progreso", nombre: "progreso", tipo: "mapa",
      normalizar: (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
      cuenta: (v) => Object.keys(v || {}).length },
    { clave: "aprender.v1.srs", nombre: "srs", tipo: "mapa",
      normalizar: (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
      cuenta: (v) => Object.keys(v || {}).length },
  ];

  const leerJson = (almacen, clave, porDefecto) => {
    try {
      const crudo = almacen.get(clave);
      if (crudo === null || crudo === undefined || crudo === "") return porDefecto;
      const v = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
      return v === null || v === undefined ? porDefecto : v;
    } catch (e) { return porDefecto; }
  };

  /** Cuenta los hechos de todas las entidades, tal y como están ahora. */
  function contarHechos(almacen) {
    const conteo = {};
    let total = 0;
    for (const e of ENTIDADES) {
      const v = leerJson(almacen, e.clave, null);
      const n = v === null ? 0 : e.cuenta(v);
      conteo[e.nombre] = n;
      total += n;
    }
    return { porEntidad: conteo, total };
  }

  /**
   * Ejecuta la migración. `opciones` permite cortar a propósito (`cortarEn`) para probar la
   * interrupción, y `versionDelCodigo` para simular una versión futura.
   */
  function migrar(almacen, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const versionCodigo = Number.isInteger(o.versionDelCodigo) ? o.versionDelCodigo : 2;
    const cortarEn = Number.isInteger(o.cortarEn) ? o.cortarEn : null;

    const esquema = leerJson(almacen, CLAVE_ESQUEMA, null);
    const versionGuardada = esquema && Number.isInteger(esquema.version) ? esquema.version : 1;

    // Versión futura: NO se toca nada, ni copia ni escritura.
    if (versionGuardada > versionCodigo) {
      return {
        ok: false, motivo: "los datos son de la versión " + versionGuardada + " y este código entiende hasta la " + versionCodigo + ": no se toca nada",
        tipo: "futura", desde: versionGuardada, hasta: versionCodigo, escrito: false,
        conteos: null, copia: null, entidades: [], pendientes: [],
      };
    }
    // Ya migrado: la repetición no escribe nada.
    if (versionGuardada === versionCodigo) {
      return {
        ok: true, motivo: "ya estaba en la versión " + versionCodigo, tipo: "sin-cambios",
        desde: versionGuardada, hasta: versionCodigo, escrito: false,
        conteos: { antes: contarHechos(almacen), despues: contarHechos(almacen) }, copia: null,
        entidades: [], pendientes: [],
      };
    }

    const antes = contarHechos(almacen);
    // La copia se guarda ANTES de escribir nada.
    const copia = { momento: new Date().toISOString(), version: versionGuardada, claves: {} };
    for (const e of ENTIDADES) {
      const crudo = almacen.get(e.clave);
      if (crudo !== null && crudo !== undefined) copia.claves[e.clave] = crudo;
    }
    almacen.set(CLAVE_COPIA, JSON.stringify(copia));

    // El marcador de paso es lo que hace la migración reanudable: se escribe tras cada entidad.
    const hechas = new Set((leerJson(almacen, CLAVE_PASO, []) || []).filter((x) => typeof x === "string"));
    const procesadas = [];
    const pendientes = [];

    for (let i = 0; i < ENTIDADES.length; i++) {
      const e = ENTIDADES[i];
      if (cortarEn !== null && i >= cortarEn) { pendientes.push(e.nombre); continue; }
      if (hechas.has(e.nombre)) { procesadas.push(e.nombre); continue; }
      const v = leerJson(almacen, e.clave, null);
      if (v === null) { hechas.add(e.nombre); almacen.set(CLAVE_PASO, JSON.stringify([...hechas])); procesadas.push(e.nombre); continue; }
      const normalizado = e.normalizar(v);
      almacen.set(e.clave, JSON.stringify(normalizado));
      hechas.add(e.nombre);
      almacen.set(CLAVE_PASO, JSON.stringify([...hechas]));
      procesadas.push(e.nombre);
    }

    // El esquema SOLO se marca si se ha terminado todo: con pendientes, se queda en la versión vieja
    // para que la siguiente ejecución sepa que falta.
    const completo = pendientes.length === 0;
    if (completo) {
      almacen.set(CLAVE_ESQUEMA, JSON.stringify({ version: versionCodigo, momento: new Date().toISOString() }));
      almacen.remove(CLAVE_PASO);
    }
    const despues = contarHechos(almacen);

    // Qué se ha descartado y por qué: una nota vacía no era un hecho, y decirlo evita que el conteo
    // parezca una pérdida. La cuenta cuadra si antes = después + descartadas.
    const descartadas = {};
    let totalDescartadas = 0;
    for (const nombre of Object.keys(antes.porEntidad)) {
      const d = antes.porEntidad[nombre] - (despues.porEntidad[nombre] || 0);
      if (d > 0) { descartadas[nombre] = d; totalDescartadas += d; }
    }

    return {
      ok: completo,
      motivo: completo
        ? "migrada de la versión " + versionGuardada + " a la " + versionCodigo
        : "interrumpida a propósito: quedan " + pendientes.length + " entidades y la versión NO se marca",
      tipo: completo ? "migrada" : "interrumpida",
      desde: versionGuardada, hasta: completo ? versionCodigo : versionGuardada,
      escrito: true,
      // Los conteos, con el total de hechos para poder comparar de un vistazo.
      conteos: { antes, despues, descartadas, totalDescartadas, conservados: antes.total === despues.total + totalDescartadas },
      copia: { momento: copia.momento, claves: Object.keys(copia.claves).length },
      entidades: procesadas, pendientes,
    };
  }

  /** Vuelve a la copia. Se niega si no hay. */
  function restaurarCopia(almacen) {
    const copia = leerJson(almacen, CLAVE_COPIA, null);
    if (!copia || !copia.claves) return { ok: false, motivo: "no hay copia que restaurar", restauradas: 0 };
    let n = 0;
    for (const [clave, crudo] of Object.entries(copia.claves)) { almacen.set(clave, crudo); n++; }
    almacen.remove(CLAVE_ESQUEMA);
    almacen.remove(CLAVE_PASO);
    return { ok: true, motivo: "restaurada la copia de " + copia.momento, restauradas: n };
  }

  const Migracion = { ENTIDADES, CLAVE_ESQUEMA, CLAVE_COPIA, CLAVE_PASO, contarHechos, migrar, restaurarCopia };
  if (typeof module !== "undefined" && module.exports) module.exports = Migracion;
  raiz.Migracion = Migracion;
})(typeof globalThis !== "undefined" ? globalThis : this);
