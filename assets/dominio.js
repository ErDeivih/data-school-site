// dominio.js — el dominio de Data School, sin DOM, sin almacenamiento y sin pintar nada.
//
// Por qué existe (T09): hasta ahora las reglas vivían dentro de `app.js`, un fichero de 6800
// líneas que necesita un navegador para ejecutarse. Eso obligaba a probarlas abriendo Chrome y
// pulsando botones, y a que las pruebas "extrajeran" funciones copiándolas, que es una forma
// educada de probar una copia en vez del original.
//
// Este fichero se carga de dos maneras y las dos tienen que funcionar:
//   · en el navegador, con <script src>, también desde file:// (por eso no es un módulo ES:
//     los módulos no cargan por file:// por CORS);
//   · en Node, con `import "./dominio.js"`, que ejecuta el script clásico y deja el objeto en
//     globalThis.Dominio. Las pruebas leen funciones REALES, no una copia.
//
// Regla que se respeta aquí y hay que seguir respetando: nada de `document`, `localStorage` ni
// `fetch`. Si una función necesita el almacén, se le pasa como argumento.

(function (raiz) {
  "use strict";

  // ── Fechas ────────────────────────────────────────────────────────────────
  // Dos cosas distintas que se confundían:
  //   · un INSTANTE se guarda en UTC, que para eso está;
  //   · un DÍA (racha, vencimiento, aplazo) es LOCAL, el del estudiante.
  const zonaDelNavegador = () => {
    try {
      if (typeof Intl === "undefined") return "UTC";
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch { return "UTC"; }
  };

  const formateadores = new Map();
  const formateadorDe = (zona) => {
    if (!formateadores.has(zona)) {
      // `en-CA` da AAAA-MM-DD, el formato que ya usa todo el almacén.
      formateadores.set(zona, new Intl.DateTimeFormat("en-CA", {
        timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
      }));
    }
    return formateadores.get(zona);
  };

  /** El día local de un instante (por defecto, ahora) en una zona. */
  function diaDeInstante(ms, zona = zonaDelNavegador()) {
    const instante = ms === undefined ? Date.now() : ms;
    try {
      return formateadorDe(zona).format(new Date(instante));
    } catch {
      // Zona desconocida: la fecha del sistema es mejor que una inventada.
      const d = new Date(instante);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }

  /** El día local de hoy. Es el que cuenta para rachas, vencimientos y aplazos. */
  const hoyISO = (zona) => diaDeInstante(Date.now(), zona);

  /**
   * Aritmética de DÍAS sobre un calendario sin horas. Se hace en UTC a medianoche a propósito:
   * un día es un día, y así el cambio de horario no suma ni quita una hora que descuadre la
   * cuenta. No es usar UTC para el día del estudiante; es contar días sin reloj.
   */
  function sumarDias(iso, dias) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  /** Días enteros entre dos fechas AAAA-MM-DD. */
  function diasEntre(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  }

  const esFechaISO = (t) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t);

  // ── Retención: días distintos, no repeticiones ────────────────────────────
  // Contrato F01. `reps` cuenta repeticiones y sube en cada acierto, aunque sea el mismo día;
  // por eso no sirve para decidir si algo se recuerda. Lo que se recuerda se mide en días.
  const DIAS_CONSOLIDADA = 3;

  /**
   * Añade un día al conjunto de una entrada de repaso. Idempotente: la misma fecha no entra dos
   * veces, que es justo lo que impide que repetir el mismo día cuente como varios.
   * Devuelve `true` si la entrada cambió.
   */
  function anotarDiaDeAcierto(entrada, dia = hoyISO(), maximo = 60) {
    if (!entrada || typeof entrada !== "object") return false;
    if (!Array.isArray(entrada.dias)) entrada.dias = [];
    if (entrada.dias.includes(dia)) return false;
    entrada.dias.push(dia);
    entrada.dias.sort();
    // Solo hacen falta los últimos días para decidir; así no crece sin fin en un almacén pequeño.
    if (entrada.dias.length > maximo) entrada.dias = entrada.dias.slice(-maximo);
    return true;
  }

  /** Días distintos con acierto que tiene una entrada de repaso. */
  const diasConAcierto = (entrada) => (entrada && Array.isArray(entrada.dias) ? entrada.dias.length : 0);

  /**
   * ¿Está consolidada esta entrada? Exige días distintos. Si la entrada es anterior al contrato
   * y no tiene `dias`, se cae a `reps` para no borrar de golpe lo que ya estaba consolidado.
   */
  function consolidada(entrada, minimo = DIAS_CONSOLIDADA) {
    if (!entrada || typeof entrada !== "object") return false;
    const dias = diasConAcierto(entrada);
    if (dias > 0) return dias >= minimo;
    return Number.isFinite(entrada.reps) && entrada.reps >= minimo;
  }

  /**
   * Rellena `dias` desde un historial de intentos (migración al contrato F01). Solo cuentan los
   * aciertos, y cada fecha una vez. Si hay aciertos pero ninguna fecha utilizable, se asigna UN
   * día: un acierto sin fecha es un día, no tres.
   */
  function diasDesdeIntentos(historial, entrada, diaDeRespaldo) {
    const hist = Array.isArray(historial) ? historial : [];
    const fechas = [...new Set(hist
      .filter((i) => i && i.correcta === true && esFechaISO(i.fecha))
      .map((i) => i.fecha))].sort();
    if (fechas.length) return fechas.slice(-60);
    const aciertos = entrada && Number.isFinite(entrada.aciertos) ? entrada.aciertos : 0;
    if (aciertos > 0) return [esFechaISO(diaDeRespaldo) ? diaDeRespaldo : hoyISO()];
    return [];
  }

  raiz.Dominio = Object.freeze({
    zonaDelNavegador, diaDeInstante, hoyISO, sumarDias, diasEntre, esFechaISO,
    DIAS_CONSOLIDADA, anotarDiaDeAcierto, diasConAcierto, consolidada, diasDesdeIntentos,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
