// sitio/incidencias.js — incidencias sin datos privados y publicación validada (T49).
//
// Script clásico, sin DOM.
//
//   INCIDENCIA: conserva QUÉ recurso y QUÉ revisión, que es lo que hace falta para reproducir el fallo.
//   Y NO se lleva lo que la persona escribió para sí misma: notas, dudas, entregas, correo. Si algo
//   privado viene en el contexto, se DESCARTA y se dice cuáles —no se envía en silencio—.
//
//   PUBLICACIÓN: valida las fuentes, genera versión nueva y se niega a dos cosas que suenan a comodidad
//   y son un agujero: editar `web/` (que es generado) y ejecutar comandos que llegan del cliente.
"use strict";

(function (raiz) {
  const LIMITES = { mensaje: 4000, contexto: 8000, claves: 20 };
  // Lo que NUNCA sale en una incidencia.
  const PRIVADAS = ["notas", "dudas", "entregas", "entrega-borrador", "correo", "email", "contrasena", "password", "token", "sesion", "cola", "conflictos"];
  const RECURSOS = /^(#\/|https?:\/\/|\/)[^\s]*$/;

  /** Índice de una revisión: si no viene, no se inventa; se dice que falta. */
  function crearIncidencia(datos) {
    const d = datos && typeof datos === "object" ? datos : {};
    const fuente = {
      recurso: String(d.recurso || "").trim(),
      revision: String(d.revision || "").trim(),
      mensaje: String(d.mensaje || "").trim(),
      contexto: d.contexto && typeof d.contexto === "object" && !Array.isArray(d.contexto) ? d.contexto : {},
    };
    if (!fuente.recurso) return { ok: false, motivo: "falta el recurso donde ocurrió" };
    if (!RECURSOS.test(fuente.recurso)) return { ok: false, motivo: "el recurso tiene que ser una ruta o un enlace" };
    if (!fuente.mensaje) return { ok: false, motivo: "falta contar qué pasó" };
    if (fuente.mensaje.length > LIMITES.mensaje) return { ok: false, motivo: "el mensaje pasa del límite" };
    if (!fuente.revision) {
      // Sin revisión no se puede reproducir: se dice, no se rellena con la fecha de hoy.
      return { ok: false, motivo: "falta la revisión del contenido: sin ella no se puede reproducir" };
    }

    // Se limpia el contexto: se descarta lo privado y se dice qué se descartó.
    const limpio = {};
    const descartadas = [];
    let tamano = 0;
    for (const [clave, valor] of Object.entries(fuente.contexto)) {
      const normal = clave.toLowerCase();
      if (PRIVADAS.some((p) => normal === p || normal.startsWith(p + "-") || normal.includes(p))) {
        descartadas.push(clave);
        continue;
      }
      if (Object.keys(limpio).length >= LIMITES.claves) { descartadas.push(clave); continue; }
      // Solo valores simples: un objeto anidado podría llevar cualquier cosa dentro.
      if (valor !== null && typeof valor === "object") { descartadas.push(clave); continue; }
      const texto = String(valor).slice(0, 200);
      tamano += texto.length;
      if (tamano > LIMITES.contexto) { descartadas.push(clave); continue; }
      limpio[clave] = texto;
    }

    return {
      ok: true, motivo: "",
      incidencia: {
        recurso: fuente.recurso,
        revision: fuente.revision,
        mensaje: fuente.mensaje,
        contexto: limpio,
        // Lo que se ha descartado se declara: una incidencia no puede llevarse lo privado «sin querer».
        descartadas: [...new Set(descartadas)],
        aviso: descartadas.length
          ? "Se ha descartado " + descartadas.length + " dato(s) privado(s) del contexto: " + [...new Set(descartadas)].join(", ") + ". La incidencia no los lleva."
          : "",
        creada: null,
      },
    };
  }

  /** Fuentes válidas para publicar: existen, no están vacías y no son la carpeta generada. */
  function validarFuentes(fuentes) {
    const lista = Array.isArray(fuentes) ? fuentes : [];
    const problemas = [];
    const validas = [];
    for (const f of lista) {
      const ruta = String(f || "").trim();
      if (!ruta) { problemas.push({ ruta, motivo: "ruta vacía" }); continue; }
      if (/^web[\\/]/.test(ruta) || ruta === "web") { problemas.push({ ruta, motivo: "`web/` es generado: se edita su fuente, no el resultado" }); continue; }
      if (/\.\.[\\/]/.test(ruta)) { problemas.push({ ruta, motivo: "la ruta sale de la carpeta de trabajo" }); continue; }
      if (/(^|[\\/])(\.\.?|node_modules)([\\/]|$)/.test(ruta)) { problemas.push({ ruta, motivo: "ruta que no es una fuente" }); continue; }
      validas.push(ruta);
    }
    return { ok: problemas.length === 0 && validas.length > 0, validas, problemas, motivo: problemas.length ? "hay fuentes que no valen: " + problemas.map((p) => p.ruta + " (" + p.motivo + ")").join("; ") : (validas.length ? "" : "no hay fuentes que publicar") };
  }

  /**
   * Publica una versión nueva. Se niega a ejecutar comandos: un cliente PROPONE contenido, no órdenes.
   * Y no escribe en `web/`: la versión se compone en memoria y se devuelve.
   */
  function publicar(entrada, historial) {
    const e = entrada && typeof entrada === "object" ? entrada : {};
    const h = Array.isArray(historial) ? historial : [];

    if (e.comando !== undefined || e.ejecutar !== undefined || e.shell !== undefined) {
      return { ok: false, motivo: "una publicación no ejecuta comandos enviados por el cliente" };
    }
    const fuentes = validarFuentes(e.fuentes);
    if (!fuentes.ok) return { ok: false, motivo: fuentes.motivo, problemas: fuentes.problemas };

    const contenido = e.contenido;
    if (contenido === null || typeof contenido !== "object") return { ok: false, motivo: "falta el contenido a publicar" };
    const texto = JSON.stringify(contenido);
    if (!texto || texto === "{}") return { ok: false, motivo: "el contenido está vacío" };
    if (/web[\\/]/i.test(texto)) return { ok: false, motivo: "el contenido no puede escribir en `web/`" };

    const version = {
      version: h.length + 1,
      fuentes: fuentes.validas,
      contenido,
      bytes: texto.length,
      publicada: false,
      revisada: true,
    };
    return { ok: true, motivo: "versión " + version.version + " preparada", version, historial: [...h, version] };
  }

  const Incidencias = { LIMITES, PRIVADAS, crearIncidencia, validarFuentes, publicar };
  if (typeof module !== "undefined" && module.exports) module.exports = Incidencias;
  raiz.Incidencias = Incidencias;
})(typeof globalThis !== "undefined" ? globalThis : this);
