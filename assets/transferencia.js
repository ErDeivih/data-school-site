// sitio/transferencia.js — inventario, comparación y cambio de cuenta (T45).
//
// Script clásico, sin DOM. El almacén se INYECTA.
//
// Tres cosas que un portal tiene que hacer bien y casi ninguno hace:
//
//   1. INVENTARIO COMPLETO: exportar TODO lo admitido, no solo el progreso. Si falta una entidad, la
//      persona cree que se llevó sus datos y no se los llevó.
//   2. COMPARAR local y cuenta, y decir qué hay en cada lado, para poder DECIDIR con una copia en la
//      mano. Decidir sin ver es apostar.
//   3. CAMBIAR DE CUENTA SIN FILTRAR: al cerrar la sesión de A y abrir la de B, los datos de A no
//      pueden quedarse ahí. Se ofrece la copia y se limpia; nunca se limpia sin más.
"use strict";

(function (raiz) {
  /** Las entidades admitidas: la lista de lo que se exporta y se compara. */
  const ENTIDADES = [
    { clave: "aprender.v1.progreso", nombre: "Progreso", cuenta: "claves" },
    { clave: "aprender.v1.srs", nombre: "Repaso espaciado", cuenta: "claves" },
    { clave: "aprender.v1.intentos", nombre: "Intentos", cuenta: "hechos" },
    { clave: "aprender.v1.notas", nombre: "Notas", cuenta: "claves" },
    { clave: "aprender.v1.dudas", nombre: "Dudas", cuenta: "claves" },
    { clave: "aprender.v1.favoritos", nombre: "Favoritos", cuenta: "claves" },
    { clave: "aprender.v1.entregas", nombre: "Entregas", cuenta: "hechos" },
    { clave: "aprender.v1.entrega-borrador", nombre: "Borrador de entrega", cuenta: "claves" },
    { clave: "aprender.v1.dias", nombre: "Días de estudio", cuenta: "claves" },
    { clave: "aprender.v1.pref", nombre: "Preferencias", cuenta: "claves" },
    { clave: "aprender.v1.ultimo", nombre: "Último concepto", cuenta: "claves" },
    { clave: "aprender.v1.conflictos", nombre: "Conflictos pendientes", cuenta: "hechos" },
    { clave: "aprender.v1.cola", nombre: "Cola de sincronización", cuenta: "hechos" },
    { clave: "aprender.v1.borrador", nombre: "Borrador de sesión", cuenta: "claves" },
    // La sesión en curso también es de la persona: si no se borra, quien entre después ve por dónde
    // iba el anterior. Faltaba en el inventario y la prueba lo destapó.
    { clave: "aprender.v1.sesion", nombre: "Sesión en curso", cuenta: "claves" },
    { clave: "aprender.v1.notas", nombre: "Notas", cuenta: "claves" },
  ].filter((e, i, lista) => lista.findIndex((x) => x.clave === e.clave) === i);

  /** Claves que NO son datos de la persona y no se borran al cambiar de cuenta. */
  const CLAVES_DEL_PORTAL = ["aprender.v2.esquema", "aprender.v2.copia", "aprender.v2.paso", "aprender.v1.migrado-f01", "aprender.v1.copia-antes-de-bajar"];

  const leerJson = (almacen, clave) => {
    try {
      const crudo = almacen.get(clave);
      if (crudo === null || crudo === undefined || crudo === "") return null;
      const v = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
      return v === null || v === undefined ? null : v;
    } catch (e) { return null; }
  };

  /** Cuántos hechos hay dentro de una entidad, según su forma. */
  function contarEntidad(v, tipo) {
    if (v === null) return 0;
    if (tipo === "hechos") {
      if (Array.isArray(v)) return v.length;
      if (Array.isArray(v.operaciones)) return v.operaciones.length;
      if (v && typeof v === "object") return Object.values(v).reduce((s, x) => s + (Array.isArray(x) ? x.length : 1), 0);
      return 0;
    }
    if (Array.isArray(v)) return v.length;
    return v && typeof v === "object" ? Object.keys(v).length : 1;
  }

  /** Huella corta y estable: sirve para decir «difiere» sin copiar los datos. */
  function huella(v) {
    const texto = (() => {
      const canonico = (x) => {
        if (x === null || typeof x !== "object") return JSON.stringify(x);
        if (Array.isArray(x)) return "[" + x.map(canonico).join(",") + "]";
        return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canonico(x[k])).join(",") + "}";
      };
      try { return canonico(v); } catch (e) { return String(v); }
    })();
    let h = 0;
    for (let i = 0; i < texto.length; i++) { h = (h * 31 + texto.charCodeAt(i)) >>> 0; }
    return h.toString(16).slice(0, 12);
  }

  /** Foto de lo que hay: por entidad, cuánto y con qué huella. */
  function instantanea(almacen) {
    const entidades = {};
    let totalHechos = 0;
    for (const e of ENTIDADES) {
      const v = leerJson(almacen, e.clave);
      const n = contarEntidad(v, e.cuenta);
      totalHechos += n;
      entidades[e.nombre] = { clave: e.clave, hay: v !== null, cuenta: n, huella: v === null ? null : huella(v) };
    }
    return { entidades, totalHechos, momento: null };
  }

  /**
   * Compara local y cuenta entidad a entidad. Cada lado dice qué tiene; la recomendación es SIEMPRE
   * «haz copia antes de decidir», porque ninguna comparación sabe qué quiere la persona.
   */
  function comparar(local, cuenta) {
    const a = local && local.entidades ? local.entidades : {};
    const b = cuenta && cuenta.entidades ? cuenta.entidades : {};
    const nombres = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const filas = nombres.map((nombre) => {
      const x = a[nombre] || { hay: false, cuenta: 0, huella: null };
      const y = b[nombre] || { hay: false, cuenta: 0, huella: null };
      let estado = "iguales";
      if (x.hay && !y.hay) estado = "solo-local";
      else if (!x.hay && y.hay) estado = "solo-cuenta";
      else if (!x.hay && !y.hay) estado = "vacio";
      else if (x.huella !== y.huella) estado = "difieren";
      return { nombre, estado, local: x.cuenta, cuenta: y.cuenta, diferencia: x.cuenta - y.cuenta };
    });
    const cuentaEstado = (e) => filas.filter((f) => f.estado === e).length;
    return {
      filas,
      resumen: {
        soloLocal: cuentaEstado("solo-local"), soloCuenta: cuentaEstado("solo-cuenta"),
        difieren: cuentaEstado("difieren"), iguales: cuentaEstado("iguales"), vacio: cuentaEstado("vacio"),
      },
      // La recomendación no elige por nadie: dice qué hacer para poder elegir.
      recomendacion: "Haz una copia antes de decidir: exporta lo que tengas ahora y guarda el fichero. Sin copia, cualquier decisión es irreversible.",
    };
  }

  /** Exporta TODAS las entidades admitidas, con su envoltorio versionado. */
  function exportar(almacen, momento) {
    const entidades = {};
    const conteos = {};
    for (const e of ENTIDADES) {
      const v = leerJson(almacen, e.clave);
      if (v === null) continue;
      entidades[e.clave] = v;
      conteos[e.nombre] = contarEntidad(v, e.cuenta);
    }
    return {
      version: 2,
      momento: typeof momento === "string" ? momento : null,
      entidades,
      conteos,
      admitidas: ENTIDADES.length,
      // Se dice explícitamente qué NO va dentro, para que nadie suponga que se lo lleva todo.
      noIncluye: [
        "La contraseña ni el identificador de sesión.",
        "La copia de migración ni el estado del esquema: son de este equipo, no tuyos.",
        "Ningún dato de otra persona.",
      ],
    };
  }

  /** Importa un paquete: valida, dice qué va a escribir y escribe. No borra lo que no venga. */
  function importar(almacen, paquete, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    if (!paquete || typeof paquete !== "object") return { ok: false, motivo: "no hay paquete", escritas: 0 };
    if (paquete.version !== 2) return { ok: false, motivo: "el paquete es de la versión " + String(paquete.version) + " y este portal entiende la 2", escritas: 0 };
    const entidades = paquete.entidades && typeof paquete.entidades === "object" ? paquete.entidades : null;
    if (!entidades) return { ok: false, motivo: "el paquete no trae entidades", escritas: 0 };
    const admitidas = new Set(ENTIDADES.map((e) => e.clave));
    const desconocidas = Object.keys(entidades).filter((k) => !admitidas.has(k));
    if (desconocidas.length) return { ok: false, motivo: "el paquete trae claves que este portal no admite: " + desconocidas.join(", "), escritas: 0 };

    // Copia recuperable ANTES de escribir, si se pide (que es lo que hace la interfaz).
    let copia = null;
    if (o.copia !== false) { copia = exportar(almacen, "antes de importar"); }
    let escritas = 0;
    for (const [clave, valor] of Object.entries(entidades)) {
      almacen.set(clave, JSON.stringify(valor));
      escritas++;
    }
    return { ok: true, motivo: "importadas " + escritas + " entidades", escritas, desconocidas: [], copia };
  }

  /**
   * Cambiar de cuenta: devuelve TODO lo de la persona en un paquete y limpia el equipo, para que quien
   * entre después no vea nada de quien estaba antes.
   */
  function cambiarDeCuenta(almacen, momento) {
    const paquete = exportar(almacen, momento || "cambio de cuenta");
    const borradas = [];
    for (const e of ENTIDADES) {
      if (almacen.get(e.clave) !== null) { almacen.remove(e.clave); borradas.push(e.clave); }
    }
    // Y la cola de sincronización también: llevaba operaciones de la cuenta anterior.
    if (almacen.get("aprender.v1.cola") !== null) { almacen.remove("aprender.v1.cola"); borradas.push("aprender.v1.cola"); }
    // Lo del portal (esquema, copia de migración) se queda: no es de nadie.
    return {
      ok: true, paquete, borradas: [...new Set(borradas)],
      conservadas: CLAVES_DEL_PORTAL.filter((k) => almacen.get(k) !== null),
      // Si el paquete no traía nada, se dice: cambiar de cuenta sin datos no es un error.
      aviso: Object.keys(paquete.entidades).length === 0
        ? "No había datos que llevarse: el equipo queda limpio igualmente."
        : "Llevate el paquete (descárgalo) antes de entrar con otra cuenta: en el equipo ya no queda nada.",
    };
  }

  const Transferencia = { ENTIDADES, CLAVES_DEL_PORTAL, instantanea, comparar, exportar, importar, cambiarDeCuenta, contarEntidad, huella };
  if (typeof module !== "undefined" && module.exports) module.exports = Transferencia;
  raiz.Transferencia = Transferencia;
})(typeof globalThis !== "undefined" ? globalThis : this);
