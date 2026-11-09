// sitio/quant.js — retornos, costes y límites, sin prometer rentabilidad (T38).
//
// Script clásico, sin DOM. Cuenta lo que se puede contar de una serie de precios:
//
//   · RETORNOS diarios y acumulados, con la fórmula explícita.
//   · DRAWDOWN: cuánto se ha caído desde el máximo anterior, que es lo que de verdad se sufre.
//   · COSTES sobre el resultado: un bruto sin costes no es un resultado.
//   · y un GUARDIÁN DE LENGUAJE: si un texto afirma rentabilidad real o ganancia garantizada, se
//     rechaza. Un laboratorio enseña a medir; prometer ganancia es otra cosa, y no se hace aquí.
"use strict";

(function (raiz) {
  const num = (v) => {
    const t = String(v == null ? "" : v).trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const red = (x, d = 6) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

  /** Serie ordenada por fecha. Devuelve retornos simples, acumulado y drawdown. */
  function serie(precios, campo) {
    const c = String(campo || "cierre");
    const filas = (Array.isArray(precios) ? precios : [])
      .map((f) => ({ fecha: String((f && f.fecha) || ""), valor: num(f && f[c]) }))
      .filter((f) => f.valor !== null && f.valor > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (filas.length < 2) return { n: filas.length, retornos: [], acumulado: null, drawdown: null, motivo: "hacen falta al menos dos precios" };

    const retornos = [];
    for (let i = 1; i < filas.length; i++) {
      // Retorno simple: (precio de hoy / precio de ayer) - 1.
      retornos.push({ fecha: filas[i].fecha, r: red(filas[i].valor / filas[i - 1].valor - 1) });
    }
    // Acumulado: el producto de (1 + r), que es lo que crece el capital, no la suma.
    let acumulado = 1;
    for (const x of retornos) acumulado *= 1 + x.r;
    // Drawdown: la mayor caída desde un máximo previo.
    let pico = filas[0].valor, peor = 0;
    for (const f of filas) {
      if (f.valor > pico) pico = f.valor;
      const caida = f.valor / pico - 1;
      if (caida < peor) peor = caida;
    }
    const media = retornos.reduce((s, x) => s + x.r, 0) / retornos.length;
    const varianza = retornos.length > 1 ? retornos.reduce((s, x) => s + (x.r - media) ** 2, 0) / (retornos.length - 1) : 0;
    return {
      n: filas.length,
      desde: filas[0].fecha,
      hasta: filas[filas.length - 1].fecha,
      retornos,
      acumulado: red(acumulado - 1),
      drawdown: red(peor),
      mediaDiaria: red(media),
      // Volatilidad diaria y anualizada (raíz de 252 sesiones).
      volatilidadDiaria: red(Math.sqrt(varianza)),
      volatilidadAnual: red(Math.sqrt(varianza) * Math.sqrt(252)),
      motivo: "",
    };
  }

  /**
   * Aplica costes al resultado. Se cobran por operación sobre el capital, no «cuando conviene»:
   * un bruto sin costes no es un resultado, es una hipótesis.
   */
  function conCostes(bruto, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const operaciones = Math.max(0, Math.floor(Number(o.operaciones) || 0));
    const porOperacion = Math.max(0, Number(o.porOperacion) || 0);
    const b = Number.isFinite(Number(bruto)) ? Number(bruto) : 0;
    const coste = operaciones * porOperacion;
    const neto = b - coste;
    return {
      bruto: red(b, 6), operaciones, porOperacion,
      coste: red(coste, 6), neto: red(neto, 6),
      // Si el coste se come el bruto, se dice en vez de enseñar un neto negativo sin explicación.
      seComeElBruto: b > 0 && neto <= 0,
    };
  }

  // Frases que afirman rentabilidad real. Si aparecen, el texto no vale para un laboratorio.
  const PROHIBIDAS = [
    /ganancia(s)? garantizada/i,
    /rentabilidad (real|asegurada|garantizada)/i,
    /beneficio (seguro|garantizado)/i,
    /vas a ganar/i,
    /dinero (fácil|seguro)/i,
    /sin riesgo/i,
    /triplic(a|ar) (tu|el) (capital|dinero)/i,
  ];

  /**
   * Revisa un texto contra las afirmaciones prohibidas. Devuelve lo encontrado, no solo un booleano:
   * para poder corregirlo hay que ver la frase.
   */
  function revisarLenguaje(texto) {
    const t = String(texto == null ? "" : texto);
    const halladas = PROHIBIDAS.filter((re) => re.test(t)).map((re) => (t.match(re) || [""])[0]);
    return {
      ok: halladas.length === 0,
      halladas: [...new Set(halladas)],
      motivo: halladas.length === 0
        ? "no promete rentabilidad"
        : "afirma rentabilidad real o ganancia asegurada: " + [...new Set(halladas)].join(", "),
      // El aviso va siempre: el laboratorio mide, no recomienda.
      aviso: "Este laboratorio enseña a medir sobre datos históricos sintéticos; no es una recomendación ni una predicción.",
    };
  }

  const Quant = { serie, conCostes, revisarLenguaje, PROHIBIDAS };
  if (typeof module !== "undefined" && module.exports) module.exports = Quant;
  raiz.Quant = Quant;
})(typeof globalThis !== "undefined" ? globalThis : this);
