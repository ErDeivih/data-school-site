// sitio/marca.js — la marca, en un solo sitio.
//
// Está aquí y no repartida por el HTML porque la marca cambia de vez en cuando y, cuando cambia, no
// debe haber dos verdades: la comprobación del pipeline lee NOMBRE de este fichero y exige que el
// HTML generado lo lleve. Si algún día se renombra otra vez, se cambia aquí y la comprobación sigue
// midiendo lo mismo.
//
// La clave del consentimiento NO se rige por la marca: se llama `muestra.v1.consentimiento` desde
// antes y cambiarla dejaría huérfano lo que la gente ya aceptó.
"use strict";

(function (raiz) {
  const Marca = {
    NOMBRE: "Data School",
    SIGLA: "DS",
    LEMA: "Una idea por ficha, con el código ejecutado.",
    LEMA: "Una idea por ficha, con el código ejecutado.",
    // Nombre con el que se guardó el consentimiento. NO seguir a la marca.
    CLAVE_CONSENTIMIENTO: "muestra.v1.consentimiento",
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Marca;
  raiz.Marca = Marca;
})(typeof globalThis !== "undefined" ? globalThis : this);
