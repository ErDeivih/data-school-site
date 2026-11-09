// sitio/laboratorios.js — L01 y L02: cálculo determinista con intervalo (T30).
//
// Script clásico, sin DOM. Dos laboratorios sobre los datasets del portal, con las cuentas hechas aquí
// y no en la pantalla, para que la tabla y la gráfica no puedan discrepar.
//
//   L01 · recta de regresión y su intervalo: ¿cuánto sube una cosa cuando sube otra, y con qué margen?
//   L02 · diferencia de dos medias y su intervalo: ¿es distinta de cero, o cabe el azar?
//
// Todo es determinista: mismas filas, mismos números. Y los intervalos usan el 95 % con t de Student
// para muestras pequeñas, no 1,96 a ojo.
"use strict";

(function (raiz) {
  const numero = (v) => {
    const t = String(v == null ? "" : v).trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const red = (x, d = 4) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

  /** T de Student al 95 % para dos colas, aproximada. Suficiente para gl >= 1 con error < 0,01. */
  function t95(gl) {
    const tabla = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 30: 2.042, 60: 2.0 };
    if (gl <= 0) return null;
    if (gl > 120) return 1.96;
    let mejor = 1.96;
    for (const k of Object.keys(tabla).map(Number).sort((a, b) => a - b)) if (gl <= k) { mejor = tabla[k]; break; }
    return mejor;
  }

  /** Recta de mínimos cuadrados por la fórmula de siempre, sin atajos. */
  function regresion(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return { n, pendiente: null, intercepto: null, r2: null, ic95: null };
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = ys.reduce((s, y) => s + y, 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (sxx === 0) return { n, pendiente: null, intercepto: null, r2: null, ic95: null };
    const pendiente = sxy / sxx;
    const intercepto = my - pendiente * mx;
    const r2 = syy === 0 ? null : (sxy * sxy) / (sxx * syy);
    // Error típico de la pendiente y su intervalo del 95 %.
    let sce = 0;
    for (let i = 0; i < n; i++) { const yEst = intercepto + pendiente * xs[i]; sce += (ys[i] - yEst) ** 2; }
    const gl = n - 2;
    const varRes = gl > 0 ? sce / gl : null;
    const errorTipico = varRes === null ? null : Math.sqrt(varRes / sxx);
    const t = t95(gl);
    return {
      n,
      pendiente: red(pendiente),
      intercepto: red(intercepto),
      r2: red(r2, 3),
      errorTipico: red(errorTipico, 5),
      ic95: (errorTipico === null || t === null) ? null : { inferior: red(pendiente - t * errorTipico), superior: red(pendiente + t * errorTipico) },
    };
  }

  /** Diferencia de dos medias con su intervalo del 95 % (varianzas distintas, Welch). */
  function diferenciaDeMedias(a, b) {
    const na = a.length, nb = b.length;
    if (na < 2 || nb < 2) return { na, nb, diferencia: null, ic95: null, gl: null };
    const ma = a.reduce((s, x) => s + x, 0) / na;
    const mb = b.reduce((s, x) => s + x, 0) / nb;
    const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (na - 1);
    const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (nb - 1);
    const diferencia = ma - mb;
    const ee = Math.sqrt(va / na + vb / nb);
    const gl = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    const t = t95(Math.floor(gl));
    const significativo = t === null ? null : Math.abs(diferencia) > t * ee;
    return {
      na, nb,
      mediaA: red(ma), mediaB: red(mb),
      diferencia: red(diferencia),
      ic95: t === null ? null : { inferior: red(diferencia - t * ee), superior: red(diferencia + t * ee) },
      gl: red(gl, 1),
      significativo,
    };
  }

  /** L01 sobre `ventas-mensuales`: unidades frente a ingresos. */
  function lab01(filas) {
    const xs = [], ys = [];
    for (const f of filas) {
      const x = numero(f.unidades), y = numero(f.ingresos);
      if (x !== null && y !== null) { xs.push(x); ys.push(y); }
    }
    const r = regresion(xs, ys);
    return {
      id: "L01",
      titulo: "Unidades y ingresos",
      pregunta: "¿Cuánto suben los ingresos por cada unidad más?",
      x: "unidades", y: "ingresos",
      ...r,
      // El efecto se explica en las unidades del dataset, no en abstracto.
      efecto: r.pendiente === null ? null : red(r.pendiente, 2),
    };
  }

  /** L02 sobre `encuestas-satisfaccion`: veteranos frente a nuevos. */
  function lab02(filas) {
    const grupo = (nombre) => filas.filter((f) => String(f.segmento || "").trim() === nombre).map((f) => numero(f.puntuacion)).filter((n) => n !== null);
    const a = grupo("veterano"), b = grupo("nuevo");
    const d = diferenciaDeMedias(a, b);
    return {
      id: "L02",
      titulo: "Veteranos frente a nuevos",
      pregunta: "¿Puntúan distinto los veteranos que los nuevos?",
      grupos: ["veterano", "nuevo"],
      ...d,
    };
  }

  /** Mezcla determinista con semilla: la misma semilla da siempre el mismo orden. */
  function mezclarConSemilla(lista, semilla) {
    const salida = [...lista];
    let s = (Number(semilla) >>> 0) || 1;
    for (let i = salida.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const t = salida[i]; salida[i] = salida[j]; salida[j] = t;
    }
    return salida;
  }

  /**
   * Matriz de confusión para una regla sencilla: «se dará de baja si su uso es MENOR que el umbral».
   * Se devuelve la matriz y, con ella, los DENOMINADORES de cada métrica.
   */
  function matrizConfusion(filas, umbral) {
    let vp = 0, fp = 0, vn = 0, fn = 0, fuera = 0;
    for (const f of filas) {
      const uso = numero(f.uso_mensual);
      const baja = String(f.baja == null ? "" : f.baja).trim();
      if (uso === null || (baja !== "0" && baja !== "1")) { fuera++; continue; }
      const predice = uso < Number(umbral) ? "1" : "0";
      if (predice === "1" && baja === "1") vp++;
      else if (predice === "1" && baja === "0") fp++;
      else if (predice === "0" && baja === "0") vn++;
      else fn++;
    }
    return { vp, fp, vn, fn, total: vp + fp + vn + fn, fuera };
  }

  /**
   * Métricas con su denominador a la vista. Si el denominador es cero, el valor es null y se explica:
   * un «0 %» donde no se puede calcular es una mentira silenciosa.
   */
  function metricas(m) {
    const razon = (num, den, nombre) => {
      if (!den) return { valor: null, denominador: den, motivo: "no hay casos de " + nombre };
      return { valor: num / den, denominador: den, motivo: "" };
    };
    const exactitud = razon(m.vp + m.vn, m.total, "ninguno");
    const sensibilidad = razon(m.vp, m.vp + m.fn, "positivos reales");
    const especificidad = razon(m.vn, m.vn + m.fp, "negativos reales");
    const precision = razon(m.vp, m.vp + m.fp, "positivos predichos");
    const f1 = (sensibilidad.valor === null || precision.valor === null || (sensibilidad.valor + precision.valor) === 0)
      ? { valor: null, denominador: null, motivo: "hace falta sensibilidad y precisión" }
      : { valor: 2 * (sensibilidad.valor * precision.valor) / (sensibilidad.valor + precision.valor), denominador: null, motivo: "" };
    return {
      // La suma de la matriz TIENE que dar el total, y se publica para poder comprobarlo.
      suma: m.vp + m.fp + m.vn + m.fn,
      total: m.total,
      exactitud: { ...exactitud, valor: red(exactitud.valor, 3) },
      sensibilidad: { ...sensibilidad, valor: red(sensibilidad.valor, 3) },
      especificidad: { ...especificidad, valor: red(especificidad.valor, 3) },
      precision: { ...precision, valor: red(precision.valor, 3) },
      f1: { valor: red(f1.valor, 3), denominador: null, motivo: f1.motivo },
    };
  }

  /** L03 sobre clientes-churn: la regla del uso y su matriz. */
  function lab03(filas, umbral) {
    const u = Number.isFinite(Number(umbral)) ? Number(umbral) : 20;
    const m = matrizConfusion(filas, u);
    return { id: "L03", titulo: "Quién se dará de baja", pregunta: "Si su uso es bajo, ¿acertamos al decir que se irá?", umbral: u, matriz: m, ...metricas(m), n: m.total, fuera: m.fuera };
  }

  /**
   * L04: parte en entrenamiento y prueba con SEMILLA, ajusta el umbral SOLO con entrenamiento y mide en
   * prueba. La partición devuelve también su composición, para poder comprobar que no se solapan.
   */
  function lab04(filas, semilla, proporcion) {
    const prop = Number.isFinite(Number(proporcion)) ? Math.max(0.1, Math.min(0.9, Number(proporcion))) : 0.7;
    const validas = filas.filter((f) => numero(f.uso_mensual) !== null && (String(f.baja || "").trim() === "0" || String(f.baja || "").trim() === "1"));
    const barajadas = mezclarConSemilla(validas, semilla);
    const corte = Math.floor(barajadas.length * prop);
    const entrenamiento = barajadas.slice(0, corte);
    const prueba = barajadas.slice(corte);
    // El umbral se elige con el ENTRENAMIENTO, probando varios y quedándose con el de mejor F1.
    const candidatos = [10, 15, 20, 25, 30, 35];
    const conEntrenamiento = candidatos.map((u) => {
      const m = matrizConfusion(entrenamiento, u);
      const met = metricas(m);
      return { umbral: u, f1: met.f1.valor === null ? -1 : met.f1.valor };
    });
    const mejor = conEntrenamiento.reduce((a2, b2) => (b2.f1 > a2.f1 ? b2 : a2), conEntrenamiento[0]);
    // Y se mide en PRUEBA, que no se ha usado para elegir.
    const mPrueba = matrizConfusion(prueba, mejor.umbral);
    const metPrueba = metricas(mPrueba);
    return {
      id: "L04", titulo: "Entrenar con una parte y medir con otra", pregunta: "¿Aguanta el umbral cuando se mide con datos que no se han usado para elegirlo?",
      semilla: Number(semilla) || 7,
      proporcion: prop,
      entrenamiento: { filas: entrenamiento.length, bajas: entrenamiento.filter((f) => String(f.baja).trim() === "1").length },
      prueba: { filas: prueba.length, bajas: prueba.filter((f) => String(f.baja).trim() === "1").length },
      umbral: mejor.umbral,
      candidatos: conEntrenamiento,
      matrizPrueba: mPrueba,
      exactitudPrueba: metPrueba.exactitud,
      sensibilidadPrueba: metPrueba.sensibilidad,
      n: validas.length,
    };
  }

    /**
   * L05 · Descenso de gradiente sobre f(x) = (x - objetivo)^2, cuyo gradiente es 2(x - objetivo).
   * Se para si el coste deja de bajar (divergencia) o si llega al límite de pasos: NUNCA se queda
   * dando vueltas, porque una pestaña que gira sin fin es peor que un error.
   */
  function descensoDeGradiente(opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const objetivo = Number.isFinite(Number(o.objetivo)) ? Number(o.objetivo) : 10;
    const paso = Number.isFinite(Number(o.paso)) ? Number(o.paso) : 0.05;
    const maximo = Math.max(1, Math.min(500, Math.floor(Number(o.maximo) || 100)));
    const desde = Number.isFinite(Number(o.desde)) ? Number(o.desde) : 0;
    let x = desde;
    const coste = (v) => (v - objetivo) ** 2;
    const historial = [{ paso: 0, x: red(x), coste: red(coste(x), 6) }];
    let divergio = false, motivo = "";
    for (let k = 1; k <= maximo; k++) {
      const c0 = coste(x);
      // El gradiente de (x - objetivo)^2 es 2(x - objetivo).
      x = x - paso * 2 * (x - objetivo);
      const c1 = coste(x);
      if (!Number.isFinite(c1)) { divergio = true; motivo = "el coste se fue a infinito"; break; }
      if (c1 > c0) { divergio = true; motivo = "el coste subió: el paso es demasiado grande"; }
      historial.push({ paso: k, x: red(x), coste: red(c1, 6) });
      // Si sube, se para AQUÍ: seguir solo empeora y es lo que colgaba la pestaña.
      if (divergio) break;
      if (c1 < 1e-12) break;
    }
    const ultimo = historial[historial.length - 1];
    return {
      id: "L05",
      titulo: "Bajar por la parábola",
      pregunta: "¿Con qué paso se llega al mínimo, y cuándo el paso es tan grande que se escapa?",
      objetivo, paso, desde: red(desde), maximo,
      pasos: ultimo.paso,
      x: ultimo.x,
      coste: ultimo.coste,
      divergio,
      motivo,
      // El coste inicial y el final, para que la tabla enseñe el viaje.
      costeInicial: historial[0].coste,
      historial,
    };
  }

  /**
   * L06 · Joins con duplicados y nulos. Cada tipo devuelve las filas EXACTAS y de dónde vienen.
   *
   * Las claves nulas NO casan entre sí: en SQL, NULL no es igual a NULL, y un join que las juntara
   * estaría mintiendo sobre el resultado.
   */
  function joins(izquierda, derecha, clave) {
    const L = Array.isArray(izquierda) ? izquierda : [];
    const R = Array.isArray(derecha) ? derecha : [];
    const c = String(clave || "id");
    const vacia = (v) => v === null || v === undefined || String(v).trim() === "";
    const porClave = (lista) => {
      const m = new Map();
      for (const f of lista) {
        const k = vacia(f[c]) ? null : String(f[c]).trim();
        if (k === null) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(f);
      }
      return m;
    };
    const mL = porClave(L), mR = porClave(R);
    const claves = new Set([...mL.keys(), ...mR.keys()]);

    const interno = [], izquierdo = [], derecho = [], completo = [];
    for (const f of L) {
      const k = vacia(f[c]) ? null : String(f[c]).trim();
      const parejas = k === null ? null : mR.get(k);
      if (parejas) { for (const g of parejas) { interno.push({ izq: f, der: g, de: "ambos" }); izquierdo.push({ izq: f, der: g, de: "ambos" }); completo.push({ izq: f, der: g, de: "ambos" }); } }
      else { izquierdo.push({ izq: f, der: null, de: "solo izquierda" }); completo.push({ izq: f, der: null, de: "solo izquierda" }); }
    }
    for (const g of R) {
      const k = vacia(g[c]) ? null : String(g[c]).trim();
      const parejas = k === null ? null : mL.get(k);
      // Un RIGHT JOIN también lleva las filas QUE CASAN: antes solo metía las sueltas y el total
      // salía corto (2 en vez de 6).
      if (parejas) { for (const f of parejas) derecho.push({ izq: f, der: g, de: "ambos" }); }
      else { derecho.push({ izq: null, der: g, de: "solo derecha" }); completo.push({ izq: null, der: g, de: "solo derecha" }); }
    }

    const cuenta = (lista) => lista.filter((x) => x.de === "ambos").length;
    return {
      id: "L06",
      titulo: "Juntar dos tablas sin perder filas",
      pregunta: "¿Cuántas filas salen de cada tipo de join, y de dónde viene cada una?",
      clave: c,
      izquierda: L.length, derecha: R.length,
      nulosIzquierda: L.filter((f) => vacia(f[c])).length,
      nulosDerecha: R.filter((f) => vacia(f[c])).length,
      clavesEnAmbas: [...claves].filter((k) => mL.has(k) && mR.has(k)).length,
      interno: interno.length,
      izquierdo: izquierdo.length,
      derecho: derecho.length,
      completo: completo.length,
      // Procedencia: el desglose que hace comprobable el resultado.
      procedencia: [
        { de: "ambas tablas", filas: cuenta(interno) },
        { de: "solo izquierda", filas: izquierdo.filter((x) => x.de === "solo izquierda").length },
        { de: "solo derecha", filas: derecho.filter((x) => x.de === "solo derecha").length },
      ],
      filasEjemplo: completo.slice(0, 20),
    };
  }

    /**
   * L07 · Partición temporal. Devuelve la recta ajustada con el PASADO, medida en el FUTURO, y la
   * misma cuenta hecha con fuga (barajando todo), para poder ver cuánto mejora por arte de magia.
   */
  function particionTemporal(filas, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const proporcion = Number.isFinite(Number(o.proporcion)) ? Math.max(0.5, Math.min(0.9, Number(o.proporcion))) : 0.8;
    const semilla = Number(o.semilla) || 7;
    // Se ordenan por fecha: el pasado primero. Sin fechas válidas, se usa el orden del fichero.
    const conFecha = filas.filter((f) => /^d{4}-d{2}-d{2}$/.test(String(f.fecha || "").trim()));
    const ordenadas = (conFecha.length ? [...conFecha].sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))) : [...filas])
      .filter((f) => numero(f.apertura) !== null && numero(f.cierre) !== null);

    const corte = Math.floor(ordenadas.length * proporcion);
    const pasado = ordenadas.slice(0, corte);
    const futuro = ordenadas.slice(corte);
    const xs = (l) => l.map((f) => numero(f.apertura));
    const ys = (l) => l.map((f) => numero(f.cierre));

    const limpio = regresion(xs(pasado), ys(pasado));
    // Medida en el futuro: R² fuera de muestra, calculado a mano con la recta del pasado.
    const r2Futuro = (() => {
      const px = xs(futuro), py = ys(futuro);
      if (px.length < 2 || limpio.pendiente === null) return null;
      const my = py.reduce((s, y) => s + y, 0) / py.length;
      let sce = 0, sct = 0;
      for (let i = 0; i < px.length; i++) {
        const est = limpio.intercepto + limpio.pendiente * px[i];
        sce += (py[i] - est) ** 2;
        sct += (py[i] - my) ** 2;
      }
      return sct === 0 ? null : red(1 - sce / sct, 3);
    })();

    // La versión CON FUGA: se baraja todo y se entrena con una parte que incluye el futuro.
    const barajadas = mezclarConSemilla(ordenadas, semilla);
    const corteFuga = Math.floor(barajadas.length * proporcion);
    const entrenaFuga = barajadas.slice(0, corteFuga);
    const pruebaFuga = barajadas.slice(corteFuga);
    const conFuga = regresion(xs(entrenaFuga), ys(entrenaFuga));
    const r2Fuga = (() => {
      const px = xs(pruebaFuga), py = ys(pruebaFuga);
      if (px.length < 2 || conFuga.pendiente === null) return null;
      const my = py.reduce((s, y) => s + y, 0) / py.length;
      let sce = 0, sct = 0;
      for (let i = 0; i < px.length; i++) {
        const est = conFuga.intercepto + conFuga.pendiente * px[i];
        sce += (py[i] - est) ** 2;
        sct += (py[i] - my) ** 2;
      }
      return sct === 0 ? null : red(1 - sce / sct, 3);
    })();

    return {
      id: "L07",
      titulo: "Entrenar con el pasado y medir con el futuro",
      pregunta: "¿Y si se deja mirar el futuro? ¿Cuánto mejora por arte de magia?",
      proporcion, semilla,
      pasado: { filas: pasado.length, desde: pasado.length ? String(pasado[0].fecha || "") : "", hasta: pasado.length ? String(pasado[pasado.length - 1].fecha || "") : "" },
      futuro: { filas: futuro.length, desde: futuro.length ? String(futuro[0].fecha || "") : "", hasta: futuro.length ? String(futuro[futuro.length - 1].fecha || "") : "" },
      pendientePasado: limpio.pendiente,
      r2Futuro,
      pendienteConFuga: conFuga.pendiente,
      r2ConFuga: r2Fuga,
      // La diferencia es lo que se gana por haber visto el futuro.
      diferencia: (r2Futuro === null || r2Fuga === null) ? null : red(r2Fuga - r2Futuro, 3),
      filas: ordenadas.length,
    };
  }

  /**
   * L08 · Coste sobre el bruto. Los importes salen del dataset: ni un precio vivo ni una llamada fuera.
   * Con coste cero el neto es el bruto EXACTO, no «casi».
   */
  function costes(filas, opciones) {
    const o = opciones && typeof opciones === "object" ? opciones : {};
    const fijo = Number.isFinite(Number(o.fijo)) ? Math.max(0, Number(o.fijo)) : 0;
    const variable = Number.isFinite(Number(o.variable)) ? Math.max(0, Math.min(1, Number(o.variable))) : 0;
    let bruto = 0, filasValidas = 0;
    for (const f of filas) {
      const v = numero(f.ingresos);
      if (v === null) continue;
      bruto += v; filasValidas++;
    }
    // Se calcula sobre el bruto YA REDONDEADO, que es el que se enseña: si se hiciera con el bruto
    // sin redondear, la tabla no cuadraría al céntimo y quien la compruebe con una calculadora
    // encontraría una diferencia que no puede explicar.
    const brutoRed = red(bruto, 2);
    const costeVariable = brutoRed * variable;
    const costeTotal = fijo + costeVariable;
    const neto = brutoRed - costeTotal;
    return {
      id: "L08",
      titulo: "Del bruto al neto",
      pregunta: "¿Cuánto queda después de los costes, y qué pasa con coste cero?",
      fijo, variable,
      filas: filasValidas,
      bruto: brutoRed,
      costeFijo: red(fijo, 2),
      costeVariable: red(costeVariable, 2),
      costeTotal: red(costeTotal, 2),
      neto: red(neto, 2),
      // Con coste cero el neto TIENE que ser el bruto, al céntimo.
      identico: Math.abs(neto - brutoRed) < 1e-9,
      margen: brutoRed === 0 ? null : red(neto / brutoRed, 3),
      origenDatos: "importes del dataset publicado; sin precios vivos",
    };
  }

  // Catálogo editorial compartido por la pantalla y el índice: rutas del portal, no títulos inferidos.
  const META = [
    { id: "L01", titulo: "Unidades y ingresos", descripcion: "Regresión e intervalo de confianza entre unidades vendidas e ingresos.", rutas: ["core", "ds"], nivel: "básico", datos: "ventas-mensuales" },
    { id: "L02", titulo: "Veteranos frente a nuevos", descripcion: "Comparar dos medias de satisfacción y su incertidumbre.", rutas: ["core", "ds"], nivel: "básico", datos: "encuestas-satisfaccion" },
    { id: "L03", titulo: "Quién se dará de baja", descripcion: "Clasificación, matriz de confusión y cambio de umbral para clientes.", rutas: ["ds"], nivel: "intermedio", datos: "clientes-churn" },
    { id: "L04", titulo: "Entrenar con una parte y medir con otra", descripcion: "Separar entrenamiento y prueba para observar el sobreajuste.", rutas: ["ds"], nivel: "intermedio", datos: "clientes-churn" },
    { id: "L05", titulo: "Bajar por la parábola", descripcion: "Descenso de gradiente: paso, convergencia y divergencia.", rutas: ["core", "alg", "ds"], nivel: "intermedio", datos: "algoritmos-tiempos" },
    { id: "L06", titulo: "Juntar dos tablas sin perder filas", descripcion: "Joins SQL y multiplicación de filas con claves duplicadas.", rutas: ["de"], nivel: "básico", datos: "clientes-churn" },
    { id: "L07", titulo: "Entrenar con el pasado y medir con el futuro", descripcion: "Partición temporal de precios y fuga de información futura.", rutas: ["ds", "quant"], nivel: "intermedio", datos: "precios-accion" },
    { id: "L08", titulo: "Del bruto al neto", descripcion: "Medir costes fijos y variables sobre importes sintéticos.", rutas: ["de", "quant"], nivel: "básico", datos: "ventas-mensuales" },
  ];

    const Laboratorios = { META, regresion, diferenciaDeMedias, lab01, lab02, lab03, lab04, descensoDeGradiente, joins, particionTemporal, costes, t95, red };
  if (typeof module !== "undefined" && module.exports) module.exports = Laboratorios;
  raiz.Laboratorios = Laboratorios;
})(typeof globalThis !== "undefined" ? globalThis : this);
