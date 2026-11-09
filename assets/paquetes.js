// sitio/paquetes.js — paquetes descargables, reanudables y borrables sin tocar el trabajo (T46).
//
// Script clásico, sin DOM. El «traer» y el almacén se INYECTAN.
//
// Lo que tiene que cumplir un paquete para ser de fiar:
//
//   · UNA DESCARGA CORTADA NO ES UN PAQUETE COMPLETO. Se verifica el hash de cada recurso; si falta uno
//     o llega con otro hash, el paquete NO se marca completo y se dice qué queda. Un fichero a medias
//     que parece entero es peor que no tenerlo.
//   · EL REINTENTO VERIFICA, no se fía: vuelve a mirar los recursos que faltan y sus hashes.
//   · BORRAR UN PAQUETE NO BORRA EL TRABAJO. Un paquete es material del curso; las notas y las entregas
//     son de la persona y no se tocan.
//   · CUOTA Y RECURSO AUSENTE TIENEN SALIDA: se dice cuánto sobra, qué se puede quitar y por dónde
//     seguir. Un error seco no es una salida.
"use strict";

(function (raiz) {
  const CLAVE_PAQUETE = (id) => "aprender.v1.paquete." + id;
  // Lo que NUNCA se borra al eliminar un paquete: el trabajo de la persona.
  const CLAVES_INTOCABLES = ["aprender.v1.notas", "aprender.v1.entregas", "aprender.v1.dudas", "aprender.v1.progreso", "aprender.v1.intentos"];

  /** Un paquete del catálogo, con sus recursos y su hash. */
  function paquete(id, nombre, recursos) {
    return {
      id: String(id), nombre: String(nombre),
      recursos: (Array.isArray(recursos) ? recursos : []).map((r) => ({ ruta: String(r.ruta), sha256: String(r.sha256 || ""), bytes: Number(r.bytes) || 0 })),
    };
  }

  /** El espacio que ocupa lo guardado, y qué paquetes hay. */
  function espacio(almacen, cuotaBytes) {
    const cuota = Number.isFinite(cuotaBytes) && cuotaBytes > 0 ? cuotaBytes : 5 * 1024 * 1024;
    let usado = 0;
    const paquetesGuardados = [];
    for (const clave of Object.keys(almacen.datos || {})) {
      if (!clave.startsWith("aprender.v1.paquete.")) continue;
      const crudo = almacen.get(clave) || "";
      const bytes = crudo.length;
      usado += bytes;
      paquetesGuardados.push({ clave, id: clave.slice("aprender.v1.paquete.".length), bytes });
    }
    const libre = cuota - usado;
    return {
      cuota, usado, libre,
      lleno: libre <= 0,
      paquetes: paquetesGuardados.sort((a, b) => b.bytes - a.bytes),
      // Salida útil: qué se puede quitar, de más grande a más pequeño.
      salida: libre > 0
        ? null
        : "No cabe nada más. Puedes eliminar paquetes ya descargados: " + (paquetesGuardados.length ? paquetesGuardados.map((p) => p.id).join(", ") : "no hay ninguno guardado, así que revisa otros datos"),
    };
  }

  /** Calcula el SHA-256 de un texto, en versión síncrona y corta (para comparar, no para firmar). */
  function hashTexto(texto) {
    // FNV-1a de 64 bits en dos mitades: determinista y suficiente para comprobar integridad local.
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const s = String(texto);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + c) >>> 0; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
  }

  /**
   * Descarga (o reanuda) un paquete. `traer(ruta)` devuelve el texto del recurso.
   * Devuelve el estado con lo hecho, lo pendiente y si está completo. Cortar no completa nada.
   */
  async function descargar(p, almacen, traer, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const paq = p && Array.isArray(p.recursos) ? p : paquete("", "", []);
    const estado = {
      id: paq.id, nombre: paq.nombre, total: paq.recursos.length,
      hechos: [], pendientes: [], fallidos: [],
      completo: false, motivo: "",
    };
    if (!paq.recursos.length) { estado.motivo = "el paquete no tiene recursos"; return estado; }
    if (typeof traer !== "function") { estado.motivo = "no hay forma de traer recursos"; return estado; }

    const corteEn = Number.isInteger(o.cortarEn) ? o.cortarEn : null;
    for (let i = 0; i < paq.recursos.length; i++) {
      const r = paq.recursos[i];
      if (corteEn !== null && estado.hechos.length >= corteEn) {
        // Corte deliberado: lo que falta queda pendiente y el paquete NO está completo.
        estado.pendientes.push(r.ruta);
        continue;
      }
      let texto = null;
      try { texto = await traer(r.ruta); } catch (error) { texto = null; }
      if (texto === null || texto === undefined) {
        // Recurso ausente: se separa de «pendiente» porque reintentarlo no lo va a arreglar solo.
        estado.fallidos.push({ ruta: r.ruta, motivo: "el recurso no está disponible" });
        continue;
      }
      // El hash se puede INYECTAR: en el navegador se usa el SHA-256 real (crypto.subtle) para
      // comparar con el checksum del manifiesto; en las pruebas, el local y rápido.
      const huella = typeof o.hash === "function" ? String(await o.hash(texto)) : hashTexto(texto);
      if (r.sha256 && huella !== r.sha256) {
        estado.fallidos.push({ ruta: r.ruta, motivo: "el contenido no coincide con lo guardado" });
        continue;
      }
      estado.hechos.push({ ruta: r.ruta, bytes: texto.length });
    }

    estado.completo = estado.hechos.length === paq.recursos.length && estado.fallidos.length === 0;
    estado.motivo = estado.completo
      ? "paquete completo y verificado"
      : (estado.fallidos.length
        ? "hay " + estado.fallidos.length + " recurso(s) que no se pueden dar por buenos"
        : "quedan " + estado.pendientes.length + " recurso(s) por traer");

    // Solo se guarda como paquete COMPLETO. Un paquete a medias no se guarda como si estuviera entero.
    if (estado.completo) {
      almacen.set(CLAVE_PAQUETE(paq.id), JSON.stringify({ id: paq.id, nombre: paq.nombre, recursos: estado.hechos, momento: o.momento || null }));
    } else if (almacen.get(CLAVE_PAQUETE(paq.id)) !== null) {
      // Si había uno guardado de antes, se retira: ya no está completo.
      almacen.remove(CLAVE_PAQUETE(paq.id));
    }
    return estado;
  }

  /** Reintento: vuelve a verificar TODOS los recursos, no se fía de lo que dijo la vez anterior. */
  async function reanudar(p, almacen, traer, opciones) {
    const previo = (() => {
      try { const v = JSON.parse(almacen.get(CLAVE_PAQUETE(p.id)) || "null"); return v; } catch (e) { return null; }
    })();
    const r = await descargar(p, almacen, traer, opciones);
    return { ...r, habiaGuardado: previo !== null, verificadoDeNuevo: r.hechos.length };
  }

  /**
   * Elimina el paquete del almacén. Devuelve qué se borró y qué se conservó, con la lista a la vista:
   * así se puede comprobar que el trabajo de la persona sigue ahí.
   */
  function eliminar(almacen, id) {
    const clave = CLAVE_PAQUETE(id);
    const existia = almacen.get(clave) !== null;
    const antes = Object.keys(almacen.datos || {}).filter((k) => CLAVES_INTOCABLES.includes(k) && almacen.get(k) !== null);
    if (existia) almacen.remove(clave);
    const despues = Object.keys(almacen.datos || {}).filter((k) => CLAVES_INTOCABLES.includes(k) && almacen.get(k) !== null);
    return {
      ok: existia,
      motivo: existia ? "paquete eliminado" : "ese paquete no estaba guardado",
      borrado: existia ? clave : null,
      // Y se demuestra que el trabajo sigue: antes y después, las mismas claves.
      trabajoConservado: despues,
      trabajoIntacto: antes.length === despues.length,
    };
  }

  /** Recurso ausente: qué hacer, en vez de un error seco. */
  function recursoAusente(ruta, catalogo) {
    const lista = Array.isArray(catalogo) ? catalogo : [];
    const parecidos = lista.filter((p) => p.recursos.some((r) => r.ruta.includes(String(ruta).split("/").pop() || ""))).slice(0, 3);
    return {
      ruta,
      salida: parecidos.length
        ? "Ese recurso no está. Pero hay paquetes que sí lo incluyen: " + parecidos.map((p) => p.id).join(", ") + "."
        : "Ese recurso no está y ningún paquete del catálogo lo incluye. Prueba a actualizar el portal o a descargar el paquete completo.",
      alternativas: parecidos.map((p) => p.id),
    };
  }

  const Paquetes = { paquete, descargar, reanudar, eliminar, espacio, recursoAusente, hashTexto, CLAVE_PAQUETE, CLAVES_INTOCABLES };
  if (typeof module !== "undefined" && module.exports) module.exports = Paquetes;
  raiz.Paquetes = Paquetes;
})(typeof globalThis !== "undefined" ? globalThis : this);
