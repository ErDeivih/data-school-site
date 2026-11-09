// sitio/disponibilidad.js — ¿este recurso se puede usar ahora, y por qué? (T48).
//
// Script clásico, sin DOM. Lo importante: **no se pregunta a `navigator.onLine`**.
//
// `onLine` dice si hay una interfaz de red, no si el recurso concreto está. Un portal con wifi puede no
// tener el paquete descargado, y uno sin wifi puede tenerlo todo. Así que la respuesta se deduce de lo
// que hay GUARDADO y de lo que el manifiesto dice, y se distinguen tres estados:
//
//   completo · el paquete está entero y se puede usar sin red
//   parcial  · está a medias: se puede empezar, pero algo falta
//   ausente  · no está: hace falta red o descargarlo
//
// Y la app declara sus CAPACIDADES según eso, no según el icono de conexión.
"use strict";

(function (raiz) {
  const ESTADOS = { COMPLETO: "completo", PARCIAL: "parcial", AUSENTE: "ausente" };

  /** Lo que el portal guarda de cada paquete: sus recursos con su ruta. */
  function guardado(almacen, id) {
    try {
      const crudo = almacen.get("aprender.v1.paquete." + id);
      if (!crudo) return null;
      const v = JSON.parse(crudo);
      return Array.isArray(v.recursos) ? v : null;
    } catch (e) { return null; }
  }

  /**
   * Estado de un paquete del manifiesto. `almacen` es inyectable.
   * Un paquete está PARCIAL si tiene alguno de sus recursos guardados pero no todos.
   */
  function estadoPaquete(almacen, paquete) {
    const p = paquete && typeof paquete === "object" ? paquete : {};
    const recursos = Array.isArray(p.recursos) ? p.recursos : [];
    const g = guardado(almacen, p.id);
    if (!g) {
      return { id: p.id, estado: ESTADOS.AUSENTE, tiene: 0, total: recursos.length, motivo: "no está descargado: hace falta red o descargarlo" };
    }
    const rutas = new Set((g.recursos || []).map((r) => String(r.ruta || "")));
    const tiene = recursos.filter((r) => rutas.has(String(r.ruta))).length;
    if (!recursos.length) return { id: p.id, estado: ESTADOS.PARCIAL, tiene: 0, total: 0, motivo: "el paquete no declara recursos: no se puede dar por bueno" };
    if (tiene === recursos.length) return { id: p.id, estado: ESTADOS.COMPLETO, tiene, total: recursos.length, motivo: "descargado y verificado" };
    return { id: p.id, estado: ESTADOS.PARCIAL, tiene, total: recursos.length, motivo: "a medias: faltan " + (recursos.length - tiene) + " de " + recursos.length + " recursos" };
  }

  /** Estado de un recurso concreto, buscándolo en los paquetes del manifiesto. */
  function estadoRecurso(almacen, manifiesto, ruta) {
    const lista = Array.isArray(manifiesto) ? manifiesto : [];
    const objetivo = String(ruta || "");
    for (const p of lista) {
      if (!p.recursos.some((r) => String(r.ruta) === objetivo)) continue;
      const e = estadoPaquete(almacen, p);
      return { ...e, recurso: objetivo, paquete: p.id };
    }
    return { estado: ESTADOS.AUSENTE, recurso: objetivo, paquete: null, motivo: "ningún paquete del catálogo incluye ese recurso" };
  }

  /**
   * Qué se puede hacer. `contexto` dice si hay service worker y si estamos en file://.
   * Las capacidades NO dependen de `navigator.onLine`: dependen de lo guardado.
   */
  function capacidades(almacen, manifiesto, contexto) {
    const c = contexto && typeof contexto === "object" ? contexto : {};
    const lista = Array.isArray(manifiesto) ? manifiesto : [];
    const estados = lista.map((p) => estadoPaquete(almacen, p));
    const completos = estados.filter((e) => e.estado === ESTADOS.COMPLETO).length;
    const parciales = estados.filter((e) => e.estado === ESTADOS.PARCIAL).length;
    const ausentes = estados.filter((e) => e.estado === ESTADOS.AUSENTE).length;

    // Lo que vive en el equipo: siempre.
    const siempre = [
      { que: "Ficha del concepto", como: "el contenido publicado se cachea con el service worker", requiere: "service-worker" },
      { que: "Repaso y sesión", como: "el estado va en el equipo", requiere: null },
      { que: "Notas y dudas", como: "se guardan en el equipo", requiere: null },
      { que: "Entregas y borradores", como: "se guardan en el equipo", requiere: null },
    ];
    // Lo que necesita un paquete descargado. NO se ata a un id concreto: si mañana el catálogo cambia,
    // la capacidad seguiría diciendo la verdad. Basta con que haya UN paquete completo.
    const algunCompleto = completos > 0;
    const conPaquete = (que) => ({
      que, como: "necesita al menos un paquete descargado y verificado",
      requiere: "paquete-completo", disponible: algunCompleto,
    });

    return {
      hayServiceWorker: c.hayServiceWorker === true,
      esFile: c.esFile === true,
      resumen: { completos, parciales, ausentes, total: lista.length },
      estados,
      capacidades: [
        ...siempre.map((x) => ({ ...x, disponible: x.requiere === null ? true : c.hayServiceWorker === true })),
        conPaquete("Laboratorio con datos descargados"),
        conPaquete("Proyecto con datos descargados"),
      ],
      // Lo prometido se dice con precisión según dónde se abra.
      aviso: c.esFile === true
        ? "Abierto como fichero (file://): no hay service worker, así que la ficha y la búsqueda necesitan el portal servido. Lo que esté en el equipo —repaso, notas, entregas y los paquetes descargados— funciona igual."
        : (c.hayServiceWorker === true
          ? "Servido con service worker: los recursos estáticos se cachean y la app abre sin red."
          : "Servido sin service worker: sin red no se podrá abrir la app, aunque los datos del equipo siguen ahí."),
    };
  }

  /** Una línea por paquete para la vista, sin obligar a componer nada en la plantilla. */
  function filas(almacen, manifiesto) {
    return (Array.isArray(manifiesto) ? manifiesto : []).map((p) => {
      const e = estadoPaquete(almacen, p);
      return { id: p.id, nombre: p.nombre || p.id, estado: e.estado, detalle: e.motivo, tiene: e.tiene, total: e.total };
    });
  }

  const Disponibilidad = { ESTADOS, estadoPaquete, estadoRecurso, capacidades, filas };
  if (typeof module !== "undefined" && module.exports) module.exports = Disponibilidad;
  raiz.Disponibilidad = Disponibilidad;
})(typeof globalThis !== "undefined" ? globalThis : this);
