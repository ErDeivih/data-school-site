// sitio/entregas.js — validar entregas y versionarlas sin publicarlas (T34).
//
// Script clásico, sin DOM. Aquí vive la parte que tiene que ser difícil de saltarse:
//
//   · NOMBRES DE ARCHIVO: se aceptan solo los inocuos. Nada de rutas, ni «..», ni caracteres de
//     control, ni dobles extensiones que oculten un ejecutable. Lo que no pasa, se rechaza con motivo.
//   · TIPOS: una entrega es TEXTO. Se comprueba el contenido, no solo la extensión: si parece un
//     ejecutable o lleva una ruta absoluta, se rechaza.
//   · LÍMITES: tamaño y líneas acotados, y el rechazo dice cuál se pasó.
//   · VERSIONES: entregar crea una versión NUEVA; nunca sobrescribe la anterior. Se puede comparar.
//   · SIN PUBLICAR POR DEFECTO: una entrega nace local. Publicarla exige un acto explícito.
"use strict";

(function (raiz) {
  const LIMITES = {
    nombreLargo: 80,
    tamanoMaximo: 64 * 1024,      // 64 KB de texto: una entrega, no un volcado
    lineasMaximas: 2000,
  };
  const EXTENSIONES = [".md", ".txt", ".csv", ".json", ".sql", ".py", ".r", ".js", ".ipynb"];

  /**
   * ¿El nombre es inocuo? Devuelve { ok, motivo }.
   * Rechaza rutas, «..», separadores, caracteres de control, nombres vacíos o demasiado largos, y
   * extensiones que no están en la lista.
   */
  function validarNombre(nombre) {
    const n = String(nombre == null ? "" : nombre).trim();
    if (!n) return { ok: false, motivo: "el nombre está vacío" };
    if (n.length > LIMITES.nombreLargo) return { ok: false, motivo: "el nombre pasa de " + LIMITES.nombreLargo + " caracteres" };
    if (/[\u0000-\u001f\u007f]/.test(n)) return { ok: false, motivo: "el nombre lleva caracteres de control" };
    if (/[\\/]/.test(n)) return { ok: false, motivo: "el nombre lleva una ruta: se acepta un fichero, no una ruta" };
    if (n.includes("..")) return { ok: false, motivo: "el nombre lleva «..»: se acepta un fichero, no un salto de carpeta" };
    if (n.startsWith(".")) return { ok: false, motivo: "un nombre no empieza por punto" };
    if (!/^[A-Za-z0-9._ -]+$/.test(n)) return { ok: false, motivo: "el nombre lleva caracteres que no se aceptan" };
    const minus = n.toLowerCase();
    const ext = EXTENSIONES.find((e) => minus.endsWith(e));
    if (!ext) return { ok: false, motivo: "la extensión no está entre las aceptadas (" + EXTENSIONES.join(", ") + ")" };
    // Doble extensión que esconda un ejecutable: «trabajo.exe.md» también se rechaza.
    const antes = minus.slice(0, minus.length - ext.length);
    if (/\.(exe|bat|cmd|ps1|sh|dll|scr|js)$/.test(antes)) return { ok: false, motivo: "el nombre esconde un ejecutable detrás de una extensión aceptada" };
    return { ok: true, motivo: "" };
  }

  /**
   * ¿El contenido es texto de una entrega? No se ejecuta nada jamás: solo se mira.
   * Rechaza binario, rutas absolutas y shebangs de sistema.
   */
  function validarContenido(texto) {
    const t = String(texto == null ? "" : texto);
    if (t.length > LIMITES.tamanoMaximo) return { ok: false, motivo: "pasa de " + Math.round(LIMITES.tamanoMaximo / 1024) + " KB" };
    const lineas = t.split("\n").length;
    if (lineas > LIMITES.lineasMaximas) return { ok: false, motivo: "pasa de " + LIMITES.lineasMaximas + " líneas" };
    // Un byte nulo es la señal más fiable de que esto no es texto.
    if (t.includes("\u0000")) return { ok: false, motivo: "tiene un byte nulo: no es texto" };
    if (/[\u0001-\u0008\u000e-\u001f]/.test(t)) return { ok: false, motivo: "tiene caracteres de control: no es texto" };
    // Rutas absolutas de sistema: se aceptan rutas relativas, no el disco entero.
    if (/\b[A-Za-z]:\\/.test(t)) return { ok: false, motivo: "lleva una ruta absoluta de Windows" };
    if (/(^|\s)\/(etc|usr|bin|home)\//.test(t)) return { ok: false, motivo: "lleva una ruta absoluta de sistema" };
    if (/^#!\s*\//.test(t)) return { ok: false, motivo: "empieza por un shebang: no se aceptan ejecutables" };
    return { ok: true, motivo: "", lineas, tamano: t.length };
  }

  /** Valida una entrega completa: nombre, tipo y contenido. */
  function validarEntrega(entrega) {
    const e = entrega && typeof entrega === "object" ? entrega : {};
    const nombre = validarNombre(e.nombre);
    if (!nombre.ok) return { ok: false, motivo: "nombre: " + nombre.motivo };
    const contenido = validarContenido(e.contenido);
    if (!contenido.ok) return { ok: false, motivo: "contenido: " + contenido.motivo };
    if (String(e.contenido).trim() === "") return { ok: false, motivo: "la entrega está vacía" };
    return { ok: true, motivo: "", lineas: contenido.lineas, tamano: contenido.tamano };
  }

  /**
   * Crea una versión nueva. NUNCA sobrescribe: la anterior se conserva, y se devuelve el número que
   * le toca. Así se puede comparar lo que se entregó antes con lo de ahora.
   */
  function versionar(historial, entrega, ahora) {
    const lista = Array.isArray(historial) ? historial : [];
    const v = validarEntrega(entrega);
    if (!v.ok) return { ok: false, motivo: v.motivo, historial: lista };
    const numero = lista.length + 1;
    const nueva = {
      version: numero,
      nombre: String(entrega.nombre).trim(),
      contenido: String(entrega.contenido),
      lineas: v.lineas,
      tamano: v.tamano,
      creada: typeof ahora === "string" ? ahora : null,
      // Nace LOCAL. Publicar es un acto aparte y explícito.
      publicada: false,
    };
    return { ok: true, motivo: "", version: nueva, historial: [...lista, nueva] };
  }

  /** ¿Se puede comparar? Solo si hay dos versiones distintas. */
  function comparar(historial, a, b) {
    const lista = Array.isArray(historial) ? historial : [];
    const va = lista.find((x) => x.version === Number(a));
    const vb = lista.find((x) => x.version === Number(b));
    if (!va || !vb || va.version === vb.version) return { ok: false, motivo: "hacen falta dos versiones distintas", cambios: null };
    const la = String(va.contenido).split("\n");
    const lb = String(vb.contenido).split("\n");
    let iguales = 0;
    const menor = Math.min(la.length, lb.length);
    for (let i = 0; i < menor; i++) if (la[i] === lb[i]) iguales++;
    return {
      ok: true,
      motivo: "",
      cambios: {
        de: va.version, a: vb.version,
        lineasAntes: la.length, lineasDespues: lb.length,
        iguales, distintas: Math.max(la.length, lb.length) - iguales,
      },
    };
  }

  const Entregas = { LIMITES, EXTENSIONES, validarNombre, validarContenido, validarEntrega, versionar, comparar };
  if (typeof module !== "undefined" && module.exports) module.exports = Entregas;
  raiz.Entregas = Entregas;
})(typeof globalThis !== "undefined" ? globalThis : this);
