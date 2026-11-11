// app.js — portal de aprendizaje. Sin dependencias, funciona desde file://
(() => {
  "use strict";

  const P = window.PORTAL;
  const CATALOGO = { ...P.conceptos, ...(P.recursos || {}) };
  const enlaceRecurso = (id) => CATALOGO[id]?.href || "#/c/" + encodeURIComponent(id);
  const GLOSARIO = window.GLOSARIO || [];
  // La marca, en un solo sitio: `sitio/marca.js` la define y este fichero la lee.
  // Si falta (una copia suelta sin su armazón), se queda vacía y no se inventa un nombre.
  const MARCA = (window.Marca && window.Marca.NOMBRE) || "";
  // El nombre de un fichero descargado sale de la marca, no escrito a mano: si la marca
  // cambia, los ficheros cambian con ella.
  const MARCA_ARCHIVO = MARCA.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // ── El catálogo de proyectos como portfolio (T14) ─────────────────────────
  // Un proyecto puede venir de una copia antigua del catálogo sin `roles`, `entregable`,
  // `tiempoHoras`, `rutaAprendizaje` ni `herramientas`. Aquí se leen siempre con guardas y
  // cada bloque de la ficha se pinta SOLO si su campo existe: la vista no se rompe y no se
  // inventa nada (ni títulos de conceptos, ni licencias, ni horas).
  const ROLES_PROYECTO = {
    "ingeniero-de-ia": "Ingeniero de IA",
    "ingeniero-de-datos": "Ingeniero de datos",
    "cientifico-de-datos": "Científico de datos",
  };
  const rolLegible = (id) => ROLES_PROYECTO[id] ||
    String(id || "").replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  const comoLista = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined && x !== "") : []);
  const comoTexto = (v) => (typeof v === "string" ? v.trim() : "");
  // El filtro de la lista es una decisión de la PANTALLA, no una ruta: vive en memoria para no
  // inventar rutas nuevas ni cambiar el hash que ya usan los enlaces guardados.
  const filtroProyectos = { rol: "", nivel: "", area: "", orden: "relevancia" };

  // El indice de busqueda es el fichero mas grande del portal (mas de 1 MB): se carga
  // solo cuando se usa el buscador, no al abrir la pagina.
  let busquedaCargada = false, cargaBusqueda = null, errorBusqueda = null;
  function cargarBusqueda() {
    if (busquedaCargada || window.BUSQUEDA) { busquedaCargada = true; return Promise.resolve(); }
    if (cargaBusqueda) return cargaBusqueda;
    errorBusqueda = null;
    cargaBusqueda = new Promise((res, rej) => {
      const script = document.createElement("script");
      script.src = "datos/busqueda.js";
      script.onload = () => { busquedaCargada = true; res(); };
      script.onerror = () => { script.remove(); errorBusqueda = new Error("No se pudo cargar el índice completo"); rej(errorBusqueda); };
      document.head.appendChild(script);
    }).finally(() => { cargaBusqueda = null; });
    return cargaBusqueda;
  }
  const indiceLigero = Object.values(CATALOGO).map((c) => ({
    id: c.id, x: [c.t, c.s || "", (c.g || []).join(" "), c.s || ""].join(" \u0001 ")
      .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  }));
  const indice = () => window.BUSQUEDA || indiceLigero;
  // Instrumentación opt-in para las pruebas; nombres fijos, sin consultas ni datos personales.
  function medirCoste(nombre, inicio) {
    if (!window.__MEDIR_BIBLIOTECA) return;
    performance.clearMeasures(nombre);
    performance.measure(nombre, { start: inicio, end: performance.now() });
  }


  // T17 · Aislamiento por perfil. Hasta ahora TODAS las claves eran aprender.v1.* para todo el
  // mundo, así que dos personas en el mismo navegador compartían el progreso: la segunda veía lo
  // de la primera y sus respuestas se mezclaban. Cada perfil lleva su sufijo.
  //
  // El invitado NO lleva sufijo, a propósito: así lo ya guardado sigue leyéndose sin migrar nada
  // y quien nunca eligió perfil no pierde su avance. El perfil es un nombre local, sin correo ni
  // contraseña: identificar la persona no exige pedirle datos.
  const PERFIL = (() => { try { return localStorage.getItem("aprender.perfil") || ""; } catch { return ""; } })();
  const claveDe = (base) => (PERFIL ? base + "." + PERFIL : base);
  // Sufijo para las claves que se escriben literales dentro de la llamada (sessionStorage): el
  // comprobador legal lee el literal de ahi y no se puede mover a una constante.
  const sufijoPerfil = PERFIL ? "." + PERFIL : "";

  // T20 · Modo de corrección de la sesión. «inmediata» corrige al responder; «diferida» guarda sin
  // revelar nada y es ENTREGAR el que registra los intentos. Cualquier otro valor se lee como
  // inmediata, que es el comportamiento por defecto.
  // T20 · Los tres modos existen en el motor (`MODOS_RESPUESTA`). Antes esta función devolvía solo
  // «diferida» o «inmediata», así que el modo interactivo —con pistas y reintentos, ya implementado en
  // la ficha— era INALCANZABLE desde la interfaz. Ahora se respeta si es uno de los tres.
  const MODOS_VALIDOS = ["inmediata", "diferida", "interactiva"];
  const modoSesion = () => {
    const m = leerSesion()?.sesion?.modo || pref.modoSesion;
    return MODOS_VALIDOS.includes(m) ? m : "inmediata";
  };
  // T19 · Copia del borrador que sobrevive al cierre de la pestaña (ver leerSesion/escribirSesion).
  const CLAVE_BORRADOR = claveDe("aprender.v1.borrador");
  const CLAVES = {
    progreso: claveDe("aprender.v1.progreso"),
    srs: claveDe("aprender.v1.srs"),
    pref: claveDe("aprender.v1.pref"),
    dias: claveDe("aprender.v1.dias"),
    ultimo: claveDe("aprender.v1.ultimo"),
    intentos: claveDe("aprender.v1.intentos"),
    sesion: claveDe("aprender.v1.sesion"),
  };

  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // ── Estado persistente ────────────────────────────────────────────────
  const leer = (clave, porDefecto) => {
    try { const x = localStorage.getItem(clave); return x ? JSON.parse(x) : porDefecto; }
    catch { return porDefecto; }
  };
  // Si el navegador no deja guardar (modo privado, cuota llena), tragarse el error en silencio
  // es una mentira: el requisito se marca en pantalla y al recargar ya no esta. Se apunta el
  // fallo para que la vista de la ficha pueda decirlo en voz alta, una vez, con su motivo.
  let almacenFalla = false;
  // T17 · Guardar puede fallar, y hasta ahora fallaba en silencio: se marcaba `almacenFalla` pero
  // nadie lo enseñaba. Devuelve {ok, motivo} y COMPRUEBA RELEYENDO, porque `setItem` puede no
  // lanzar y aun así no haber dejado lo pedido: escribir y suponer no es guardar.
  let falloGuardado = null;
  const escribir = (clave, valor) => {
    const texto = JSON.stringify(valor);
    try {
      localStorage.setItem(clave, texto);
      if (localStorage.getItem(clave) !== texto) throw Object.assign(new Error("no coincide"), { name: "NoCoincide" });
      almacenFalla = false; falloGuardado = null;
      return { ok: true, motivo: null };
    } catch (err) {
      const motivo = (err && err.name) || "desconocido";
      almacenFalla = true; falloGuardado = { clave, motivo };
      avisarFalloGuardado();
      return { ok: false, motivo };
    }
  };

  // T17 · El aviso dice qué ha pasado, qué se puede perder y ofrece salvar una copia. Es feo a
  // propósito: un aviso que se puede ignorar sin entenderlo no sirve de nada.
  function avisarFalloGuardado() {
    if (document.getElementById("aviso-guardado")) return;
    const caja = document.createElement("div");
    caja.id = "aviso-guardado";
    caja.setAttribute("role", "alert");
    caja.className = "aviso aviso-guardado";
    caja.innerHTML = "<p><strong>No se ha podido guardar.</strong> Este navegador no tiene sitio " +
      "(o no deja guardar), asi que lo que hagas ahora puede perderse al cerrar. " +
      "Puedes descargar una copia de todo tu progreso.</p>" +
      '<p><a class="boton activo" id="bajar-copia" href="#" download="' + MARCA_ARCHIVO + '-copia.json">Descargar copia</a> ' +
      '<button type="button" class="boton" id="cerrar-aviso">Entendido</button></p>';
    document.body.appendChild(caja);
    $("#bajar-copia").addEventListener("click", (ev) => {
      ev.preventDefault();
      const copia = { momento: new Date().toISOString(), version: 1, claves: {} };
      try {
        for (let n = 0; n < localStorage.length; n++) {
          const k = localStorage.key(n);
          if (k && k.startsWith("aprender.")) copia.claves[k] = localStorage.getItem(k);
        }
      } catch { /* sin acceso: se baja lo que haya */ }
      const blob = new Blob([JSON.stringify(copia, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url; enlace.download = MARCA_ARCHIVO + "-copia.json";
      document.body.appendChild(enlace); enlace.click(); enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
    $("#cerrar-aviso").addEventListener("click", () => caja.remove());
  }

  let progreso = leer(CLAVES.progreso, {});   // id -> { visto, dominado, ts }
  let srs = leer(CLAVES.srs, {});              // "id#n" -> { ef, iv, reps, venc, aciertos, fallos }
  let pref = leer(CLAVES.pref, { tema: "auto", repasoDia: 20, objetivoDia: 20 });

  // T15 · Experiencia declarada en la orientación. Valores cerrados; cualquier otra cosa se lee
  // como «sin decir», que es el estado de quien omitió los tres pasos.
  const EXPERIENCIAS = {
    "empiezo": "Empiezo de cero",
    "algo": "He tocado algo",
    "trabajo": "Trabajo con esto",
  };
  const experiencia = () => (EXPERIENCIAS[pref.experiencia] ? pref.experiencia : "");
  let dias = leer(CLAVES.dias, {});            // "AAAA-MM-DD" -> preguntas respondidas ese dia
  let ultimo = leer(CLAVES.ultimo, null);      // ultimo concepto abierto, para poder continuar
  // Historial de intentos: "id#n" -> [{fecha, elegida, correcta, seguro, segundos}], los cinco
  // ultimos. Es lo unico que permite reconstruir mas tarde QUE se respondio, no solo cuantas.
  let intentos = leer(CLAVES.intentos, {});

  // T13 · Notas y favoritos de la ficha. Van en su propio almacén y no dentro de `progreso`: son
  // texto libre y marcas personales, no evidencia de aprendizaje, y mezclarlos haría que la
  // exportación de progreso llevara dentro lo que alguien escribió para sí.
  let notas = leer("aprender.v1.notas", {});
  // T25 · Dudas. Cada una guarda a qué ficha y a qué sección pertenece, su estado y, si se resolvió,
  // la explicación. Borrar NO destruye: mueve a la papelera con la fecha, y a los 30 días se vacía.
  let dudas = leer("aprender.v1.dudas", {});
  const DIAS_PAPELERA = 30;
  // Reloj del módulo, en un solo sitio: una prueba puede controlarlo sin tocar el del sistema.
  const ahoraMs = () => Date.now();

  function crearDuda(id, texto, concepto, seccion) {
    if (!id || !String(texto).trim()) return false;
    dudas[id] = {
      texto: String(texto),
      concepto: concepto || null,
      seccion: seccion || "",
      estado: "abierta",
      explicacion: "",
      ts: ahoraMs(),
      borrada: null,
    };
    escribir("aprender.v1.dudas", dudas);
    return true;
  }
  function resolverDuda(id, explicacion) {
    const d = dudas[id];
    if (!d) return false;
    dudas[id] = { ...d, estado: "resuelta", explicacion: String(explicacion || ""), resueltaEn: ahoraMs() };
    escribir("aprender.v1.dudas", dudas);
    return true;
  }
  function reabrirDuda(id) {
    const d = dudas[id];
    if (!d) return false;
    dudas[id] = { ...d, estado: "abierta", explicacion: "" };
    escribir("aprender.v1.dudas", dudas);
    return true;
  }
  function borrarDuda(id) {
    const d = dudas[id];
    if (!d || d.borrada) return false;
    dudas[id] = { ...d, borrada: { en: ahoraMs() } };
    escribir("aprender.v1.dudas", dudas);
    return true;
  }
  function restaurarDuda(id) {
    const d = dudas[id];
    if (!d || !d.borrada) return false;
    dudas[id] = { ...d, borrada: null };
    escribir("aprender.v1.dudas", dudas);
    return true;
  }
  /** Vacía la papelera lo que lleve más de 30 días. Se llama al arrancar y al abrir la vista. */
  function vaciarPapelera() {
    const limite = ahoraMs() - DIAS_PAPELERA * 24 * 60 * 60 * 1000;
    let quitadas = 0;
    for (const [id, d] of Object.entries(dudas)) {
      if (d && d.borrada && typeof d.borrada.en === "number" && d.borrada.en < limite) { delete dudas[id]; quitadas++; }
    }
    if (quitadas) escribir("aprender.v1.dudas", dudas);
    return quitadas;
  }
  vaciarPapelera();
  let favoritos = leer("aprender.v1.favoritos", {});

  // Las fechas viven en el dominio (sitio/dominio.js), que se carga antes que este fichero.
  // Aquí solo se les pone nombre para no tocar las cientos de llamadas que ya existen: no hay
  // una segunda copia, hay un alias. Si mañana cambia cómo se calcula un día, cambia en un sitio.
  const D = globalThis.Dominio;
  const { hoyISO, sumarDias, diasEntre, diaDeInstante } = D;
  const diasEntreISO = diasEntre;
  const ZONA = D.zonaDelNavegador;

  // ── Migración al contrato F01: rellenar los días de lo ya respondido ───────
  // Las preguntas contestadas antes de este contrato no tienen `dias`, así que con la regla
  // nueva contarían cero días y se perdería el historial de golpe. Aquí se reconstruye desde
  // las fechas reales de `intentos`, que sí existen. Dos reglas para no inventar nada:
  //   · solo cuentan los intentos ACERTADOS, y cada fecha una sola vez;
  //   · si una pregunta tiene aciertos pero ninguna fecha utilizable, se le asigna UN día (el de
  //     su último intento), no varios: un acierto sin fecha es un día, no tres.
  // Se ejecuta una vez y deja marca, para no repetir el trabajo en cada arranque.
  function migrarDiasDeAciertos() {
    if (leer("aprender.v1.migrado-f01", false) === true) return 0;
    let tocadas = 0;
    for (const clave of Object.keys(srs)) {
      const t = srs[clave];
      if (!t || typeof t !== "object" || Array.isArray(t)) continue;
      if (Array.isArray(t.dias) && t.dias.length) continue;
      const hist = Array.isArray(intentos[clave]) ? intentos[clave] : [];
      const fechas = [...new Set(hist
        .filter((i) => i && i.correcta === true && typeof i.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha))
        .map((i) => i.fecha))].sort();
      if (fechas.length) { t.dias = fechas.slice(-60); tocadas++; }
      else if (typeof t.aciertos === "number" && t.aciertos > 0) {
        t.dias = [typeof t.ultimo === "string" ? t.ultimo : hoyISO()];
        tocadas++;
      }
    }
    // T17 · La bandera de migrado SOLO se pone si el destino se ha guardado de verdad. Antes se
    // ponia siempre: con la cuota llena, la escritura de los dias fallaba, la bandera quedaba
    // puesta igual y la migracion no volvia a intentarse NUNCA. Los dias se perdian para siempre
    // y en silencio. Ahora, si el destino no se guarda, se sale sin marcar y se reintenta.
    if (tocadas) {
      const guardado = escribir(CLAVES.srs, srs);
      if (!guardado.ok) return 0;
    }
    escribir("aprender.v1.migrado-f01", true);
    return tocadas;
  }
  migrarDiasDeAciertos();

  /** Dias seguidos con al menos una pregunta respondida. */
  function racha() {
    let n = 0;
    const d = new Date(hoyISO() + "T00:00:00Z");
    if (!dias[hoyISO()]) d.setUTCDate(d.getUTCDate() - 1);   // hoy aun sin actividad: no rompe la racha
    while (dias[d.toISOString().slice(0, 10)]) { n++; d.setUTCDate(d.getUTCDate() - 1); }
    return n;
  }

  function anotarRespuesta() {
    const h = hoyISO();
    dias[h] = (dias[h] || 0) + 1;
    escribir(CLAVES.dias, dias);
  }

  // ── Carga perezosa del contenido por fase ─────────────────────────────
  const fasesCargadas = new Set();
  window.CONTENIDO = window.CONTENIDO || {};
  function cargarFase(fid) {
    if (window.CONTENIDO[fid]) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = `datos/fase-${fid}.js`;
      s.onload = () => res();
      s.onerror = () => rej(new Error(`No se pudo cargar datos/fase-${fid}.js`));
      document.head.appendChild(s);
    });
  }

  /**
   * Carga las fases a las que pertenecen unos identificadores de concepto.
   *
   * Existe por un fallo real: `#/repaso` montaba la sesion antes de que estuviera cargado el
   * contenido de las fichas, asi que `contenidoDe(id)` devolvia `null`, todas las preguntas se
   * saltaban por «no encuentro esa pregunta» y la sesion terminaba sola diciendo que no habia
   * nada. Se veia como un portal sin preguntas, no como un error. La cola se sirve entera antes
   * de empezar a preguntar, y el fallo de red no se traga: si una fase no carga, se dice.
   */
  function cargarFasesDe(ids) {
    const fases = [...new Set((Array.isArray(ids) ? ids : []).map((id) => P.conceptos[id]?.fid).filter(Boolean))];
    return Promise.all(fases.map((fid) => cargarFase(fid)));
  }

  // Los textos legales son 78 KB: se cargan solo si alguien entra en esas páginas, no al
  // abrir el portal. Si la capa de plataforma no está puesta, el fichero no existe y la
  // carga falla en silencio (la ruta cae en el inicio, sin romper nada).
  let legalPedido = null;
  function cargarLegal() {
    if (window.LEGAL) return Promise.resolve();
    if (legalPedido) return legalPedido;
    legalPedido = new Promise((res) => {
      const s = document.createElement("script");
      s.src = "datos/legal.js";
      s.onload = () => res();
      s.onerror = () => { legalPedido = null; res(); };
      document.head.appendChild(s);
    });
    return legalPedido;
  }
  const contenidoDe = (id) => { const m = P.conceptos[id]; return m ? window.CONTENIDO[m.fid]?.[id] : null; };  const orden = ordenDe(P);

  // ── La política de evaluación y las competencias (fase 10) ────────────
  //
  // Las dos viven en `contenido/`, no aquí: son decisiones que se revisan y se versionan sin
  // tocar la interfaz, y `generar.mjs` las valida antes de copiarlas a `datos/evaluacion.js`
  // (los pesos tienen que sumar 1,000, y un tipo de criterio que el portal no sepa evaluar es un
  // error de contenido, no un dato raro que haya que tolerar al pintar).
  //
  // El fichero es pequeño, pero se carga con la misma función perezosa que los textos legales y
  // no con una etiqueta `<script>` en el `index.html`, por una razón que no es el tamaño: si
  // estuviera en el HTML, `#/fase/f01` pintaría sus criterios de cierre en el primer render y
  // «Mi progreso» no. Cargarlo aquí, antes del primer render, hace que las dos vistas vean lo
  // mismo desde el primer instante.
  let evaluacionPedida = null;
  function cargarEvaluacion() {
    if (window.EVALUACION) return Promise.resolve();
    if (evaluacionPedida) return evaluacionPedida;
    evaluacionPedida = new Promise((res) => {
      const s = document.createElement("script");
      s.src = "datos/evaluacion.js";
      // El fichero es parte del portal generado: si falta, alguien borró `web/datos` a medias.
      // Se sigue sin él —la nota se calcula con los pesos por defecto— en vez de dejar la
      // portada en blanco, y la vista de la fase lo dice en voz alta.
      s.onload = () => res();
      s.onerror = () => { evaluacionPedida = null; res(); };
      document.head.appendChild(s);
    });
    return evaluacionPedida;
  }

  /**
   * La política de evaluación, con respaldo. El respaldo repite los pesos de la fase 0 a
   * propósito: si `datos/evaluacion.js` no está, la nota tiene que seguir siendo la misma que
   * ayer, y no otra inventada en el sitio más difícil de auditar.
   */
  const PESOS_RESPALDO = [{ id: "preguntas", peso: 0.45, nombre: "Preguntas acertadas" }, { id: "practica", peso: 0.35, nombre: "Problemas prácticos resueltos" }, { id: "repaso", peso: 0.2, nombre: "Repaso espaciado al día" }];
  function politicaEvaluacion() {
    const bruto = window.EVALUACION && window.EVALUACION.evaluacion;
    const e = bruto && typeof bruto === "object" && Array.isArray(bruto.pesos) && bruto.pesos.length ? bruto : null;
    if (e) return e;
    return { pesos: PESOS_RESPALDO, descarte: { fraccion: 0.1 }, estado: { repeticiones_para_consolidada: 3 }, cierre: {}, insignias: { lista: [] }, nota_minima_global: { minimo: 0.7 } };
  }

  /** Las competencias declaradas, o una lista vacía. Una competencia sin `fichas` no se puede medir. */
  function competenciasDeclaradas() {
    const c = window.EVALUACION && window.EVALUACION.competencias;
    if (!c || typeof c !== "object" || !Array.isArray(c.competencias)) return { formula: "", umbral: 0, repeticiones: 0, lista: [] };
    return {
      formula: typeof c.formula === "string" ? c.formula : "",
      umbral: typeof c.umbral === "number" ? c.umbral : 0,
      repeticiones: Number.isInteger(c.repeticiones_para_adquirida) ? c.repeticiones_para_adquirida : 2,
      lista: c.competencias.filter((x) => x && typeof x === "object" && Array.isArray(x.fichas)),
    };
  }

  // El orden de lectura del temario —fase y, dentro de la fase, identificador— en un solo sitio.
  // Es la única cuenta que hay: la usan la lista de lo pendiente, la recomendación y el
  // `j`/`k` de la ficha. Dos órdenes distintos en el mismo portal serían dos respuestas a
  // «¿qué va antes?», y una de las dos estaría mal.
  function ordenDe(P_) {
    const conceptos = P_ && typeof P_ === "object" && P_.conceptos && typeof P_.conceptos === "object" && !Array.isArray(P_.conceptos) ? P_.conceptos : {};
    return Object.values(conceptos)
      .filter((c) => c && typeof c === "object" && typeof c.id === "string")
      .sort((a, b) => a.f - b.f || a.id.localeCompare(b.id));
  }

  // ── Progreso ──────────────────────────────────────────────────────────
  function marcar(id, campo, valor) {
    const actual = progreso[id] || {};
    if (valor === undefined) valor = !actual[campo];
    progreso[id] = { ...actual, [campo]: valor, ts: Date.now() };
    if (campo === "dominado" && valor) progreso[id].visto = true;
    escribir(CLAVES.progreso, progreso);
  }
  function resumenProgreso() {
    let vistos = 0, dominados = 0;
    for (const id of Object.keys(P.conceptos)) {
      const p = progreso[id];
      if (p?.visto) vistos++;
      if (p?.dominado) dominados++;
    }
    const total = Object.keys(P.conceptos).length;
    return { total, vistos, dominados, pct: total ? Math.round((vistos / total) * 100) : 0 };
  }

  // Lo que se guarda al exportar tiene que ser exactamente lo que se borra y lo que se vuelve
  // a cargar: si las tres listas se separan, exportar y recuperar deja de devolver lo mismo.
  // `pref` es la excepcion a proposito: las preferencias no son progreso, y por eso el boton
  // de borrar no las toca. Aqui van para que cambiar de equipo no obligue a reconfigurarlo.
  const estadoGuardado = () => ({ progreso, srs, pref, dias, ultimo, intentos, favoritos, notas });

  // Cargar un progreso guardado es sustituir, no completar: lo que trae el fichero manda, y
  // lo que no trae se queda vacio. Cada campo se valida por su cuenta porque un fichero de
  // una version anterior, o editado a mano, no puede tumbar el portal ni colar datos raros:
  // lo que no tenga la forma esperada se descarta y el estado se recalcula con lo que quede.
  function cargarEstadoGuardado(datos) {
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
    const fuente = obj(datos) || {};
    progreso = obj(fuente.progreso) || {};
    srs = obj(fuente.srs) || {};
    dias = obj(fuente.dias) || {};
    intentos = obj(fuente.intentos) || {};
    ultimo = typeof fuente.ultimo === "string" && P.conceptos[fuente.ultimo] ? fuente.ultimo : null;
    const preferencias = obj(fuente.pref);
    if (preferencias) pref = preferencias;
    escribir(CLAVES.progreso, progreso);
    escribir(CLAVES.srs, srs);
    escribir(CLAVES.dias, dias);
    escribir(CLAVES.ultimo, ultimo);
    escribir(CLAVES.intentos, intentos);
    escribir(CLAVES.pref, pref);
  // T22 · Las colecciones también se importan, y solo si vienen. Un fichero guardado antes de que
  // existieran no las trae, y vaciarlas por eso sería perder lo que la persona ya tenía.
  const favImportado = obj(fuente.favoritos);
  if (favImportado) { favoritos = favImportado; escribir("aprender.v1.favoritos", favoritos); }
  const notasImportadas = obj(fuente.notas);
  if (notasImportadas) { notas = notasImportadas; escribir("aprender.v1.notas", notas); }
  }

  // ── Estado comprobado y historial de intentos ─────────────────────────
  //
  // El estado de una ficha NO se guarda en ninguna parte: se calcula a partir de hechos
  // (lo leido, lo respondido, lo resuelto) cada vez que hace falta. Es la decision que
  // sostiene todo lo demas: si el estado fuera una clave, bastaria con editarla para
  // decir que se ha terminado el temario, y el informe de progreso seria decorativo.
  //
  // Lo que entra aqui son DATOS CRUDOS y lo que sale es una conclusion. Por eso la funcion
  // es pura —no lee localStorage ni la fecha del sistema—: se le pasa hasta el dia de hoy,
  // que es el unico dato que cambia solo. Asi se puede probar fuera del navegador y una
  // prueba no deja de servir manana.

  // Tiempo minimo, en segundos, con la ficha en pantalla para dar R1 por cumplido. Son los
  // valores que fijo la especificacion 01 mientras no haya una medicion real de lectura: el
  // nivel mas alto lleva formulas y codigo y se mira mas despacio. `avanzado` va con
  // `intermedio` porque la especificacion no le da valor propio y inventarse uno seria peor
  // que heredarlo del escalon de al lado.
  const MINIMOS_LECTURA = { "básico": 20, "intermedio": 30, "avanzado": 30, "experto": 45 };
  const minimoSegundos = (nivel) => MINIMOS_LECTURA[nivel] || MINIMOS_LECTURA["intermedio"];

  // Como se llama cada estado y con que simbolo se pinta. El simbolo solo no vale: hay
  // gente que no distingue ■ de □, y el color no es informacion. Van los dos.
  const ESTADOS = {
    "pendiente": { rotulo: "Pendiente", simbolo: "", clase: "" },
    "a-medias": { rotulo: "A medias", simbolo: "◐", clase: "medias" },
    "hecho": { rotulo: "Hecha", simbolo: "□", clase: "hecho" },
    "dominado": { rotulo: "Dominada", simbolo: "■", clase: "dominado" },
    "aplazado": { rotulo: "Aplazada", simbolo: "⋯", clase: "aplazada" },
  };

  // ── Lectura de lo guardado, campo a campo ─────────────────────────────
  // Cada lectura valida SU campo y devuelve null si no tiene la forma esperada. Importa
  // porque el progreso se puede importar de otro equipo, editar a mano o venir de una
  // version anterior: un campo raro tiene que dejar el requisito sin cumplir, nunca tirar
  // la vista ni, mucho menos, convertir la ficha en «hecha».

  function leerLeido(reg) {
    if (!reg || typeof reg !== "object" || Array.isArray(reg)) return null;
    const l = reg.leido;
    if (!l || typeof l !== "object" || Array.isArray(l)) return null;
    if (typeof l.ts !== "number" || !Number.isFinite(l.ts)) return null;
    const seg = typeof l.segundos === "number" && Number.isFinite(l.segundos) && l.segundos >= 0 ? l.segundos : 0;
    return { ts: l.ts, segundos: seg };
  }

  function leerPractica(reg) {
    if (!reg || typeof reg !== "object" || Array.isArray(reg)) return null;
    const p = reg.practica;
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    return p;
  }

  // ── Aplazar sin mentir (funcionalidad 7) ──────────────────────────────
  //
  // Aplazar es la valvula de escape de la vida real: una semana de trabajo, una gripe. La regla
  // que se copia de Moodle (anulacion por usuario) tiene dos mitades y las dos importan:
  //   · la excepcion SUSTITUYE a la regla general para esa ficha, o sea que deja de pedirse, y
  //   · NO la borra del informe: sigue contando con el estado que le toca por sus hechos.
  // Por eso el aplazo es un dato mas dentro de `progreso[id]` y el estado se sigue calculando:
  // lo unico que cambia es cual de los dos estados se enseña.
  //
  // Las dos cosas que se exigen son fecha y motivo, y el motivo no es un adorno: sin el, dentro
  // de un mes no hay forma de saber si la ficha se aplazo por trabajo o por pereza, y aplazar
  // pasa a ser la manera comoda de no hacer nada sin decirlo.
  const MOTIVO_MAX = 200;

  /** Una fecha con la forma AAAA-MM-DD que ademas exista: 2026-02-30 tiene la forma y no es un dia. */
  function esFechaISO(t) {
    if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    const d = new Date(t + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
  }

  // Dias de calendario entre dos fechas ISO, no horas: da igual a que hora del dia se mire, y a
  // las 23:59 de un dia no puede salir un numero distinto que a las 00:01.

  /**
   * Si un aplazo se puede guardar tal cual y, si no, que hay que arreglar. Funcion pura: el dia de
   * hoy entra como parametro, que es lo unico que permite probar las tres fronteras —ayer, hoy y
   * manana— sin depender del calendario de la maquina que ejecuta la prueba.
   *
   * @param {string} hasta   AAAA-MM-DD, el dia en que la ficha vuelve a pedirse
   * @param {string} motivo  por que se aplaza, en una linea
   * @param {string} [hoy]   AAAA-MM-DD; por defecto, el dia del equipo
   * @returns {{ok:boolean, aviso:string, hasta?:string, motivo?:string, dias?:number}}
   */
  function aplazoValido(hasta, motivo, hoy) {
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const texto = String(motivo == null ? "" : motivo).trim().replace(/\s+/g, " ");
    if (!esFechaISO(hasta)) {
      return { ok: false, aviso: "La fecha tiene que ser un día real escrito como AAAA-MM-DD, por ejemplo 2026-11-03." };
    }
    // El aplazo es para el futuro. Una fecha que ya llego no aplaza nada: la ficha volveria a
    // pedirse en el mismo instante, y guardarla daria la sensacion de haber hecho algo.
    if (hasta <= dia) {
      return { ok: false, aviso: `El aplazo tiene que terminar después de hoy (${dia}). Si ya puedes con esta ficha, no la aplaces: ábrela y sigue.` };
    }
    if (texto.length < 3) {
      return { ok: false, aviso: "Escribe por qué la aplazas. Es lo que dentro de un mes te dirá si el motivo era bueno." };
    }
    if (texto.length > MOTIVO_MAX) {
      return { ok: false, aviso: `El motivo no puede pasar de ${MOTIVO_MAX} caracteres: con una línea basta.` };
    }
    return { ok: true, aviso: "", hasta, motivo: texto, dias: diasEntre(dia, hasta) };
  }

  function leerAplazado(reg, hoy) {
    if (!reg || typeof reg !== "object" || Array.isArray(reg)) return null;
    const a = reg.aplazado;
    if (!a || typeof a !== "object" || Array.isArray(a)) return null;
    // Se valida la fecha entera, no solo su forma: un «2026-13-45» guardado a mano nunca seria
    // menor que hoy al comparar como texto, y la ficha quedaria aplazada para siempre sin avisar.
    if (!esFechaISO(a.hasta)) return null;
    // Con la fecha ya llegada, la excepcion caduca sola y la ficha vuelve a su estado calculado:
    // no hay que acordarse de deshacerla. Se compara con `<=` a proposito, porque el dia que
    // vence es justo el dia en que vuelve a pedirse.
    if (a.hasta <= hoy) return null;
    return { hasta: a.hasta, motivo: typeof a.motivo === "string" ? a.motivo.slice(0, MOTIVO_MAX) : "", ts: typeof a.ts === "number" ? a.ts : 0 };
  }

  /**
   * Las fichas aplazadas que siguen vigentes, de la que vuelve antes a la que vuelve despues.
   * Funcion pura y total: lo que no entiende lo descarta en vez de lanzar, porque `progreso` se
   * puede importar de otro equipo o editar a mano, y una lista que se cae entera por un dato raro
   * no sirve para nada.
   *
   * @returns {Array<{id:string, hasta:string, motivo:string, ts:number, dias:number}>}
   */
  function aplazadasVigentes(progreso, hoy) {
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const fuente = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso : {};
    const lista = [];
    for (const id of Object.keys(fuente)) {
      const a = leerAplazado(fuente[id], dia);
      if (a) lista.push({ id, hasta: a.hasta, motivo: a.motivo, ts: a.ts, dias: diasEntre(dia, a.hasta) });
    }
    // Orden estable: primero la que vuelve antes y, a igualdad de fecha, por identificador. Una
    // lista que cambia de orden entre dos pintados es una lista en la que no se puede confiar.
    lista.sort((a, b) => (a.hasta === b.hasta ? a.id.localeCompare(b.id) : a.hasta < b.hasta ? -1 : 1));
    return lista;
  }

  /** «vuelve manana», «vuelve en 6 dias». Se dice en dias porque es lo que se entiende de un vistazo. */
  function vuelveCuando(hasta, hoy) {
    const d = diasEntre(hoy, hasta);
    if (d <= 0) return "vuelve hoy";
    if (d === 1) return "vuelve mañana";
    if (d < 7) return `vuelve en ${d} días`;
    const semanas = Math.round(d / 7);
    return semanas === 1 ? "vuelve en 1 semana" : `vuelve en ${semanas} semanas`;
  }

  // `intentos` es la unica clave donde se guarda QUE se respondio. El estado se puede
  // calcular sin ella (con `srs` basta), pero sin ella no se puede enseñar el historial: el
  // historial es de la fase 6, y aqui solo se guarda, con su recorte, para que exista.

  /**
   * El estado de una ficha, calculado. Funcion pura: no lee nada de fuera ni escribe nada.
   *
   * @param {object} progreso  id -> {visto, dominado, leido, practica, aplazado, ...}
   * @param {object} srs       "id#n" -> {ef, iv, reps, venc, aciertos, fallos}
   * @param {string} id        el concepto del que se quiere el estado
   * @param {object} c         su entrada del indice: {q: preguntas, pr: practicas, n: nivel}
   * @param {string} [hoy]     AAAA-MM-DD; por defecto, el dia del equipo. Entra como parametro
   *                           para que la prueba sea determinista: una prueba que depende del
   *                           dia deja de servir manana.
   * @returns {{estado:string, requisitos:Array, cumplidos:number, total:number,
   *            siguiente:string, avisos:string[], aplazado:object|null, insignia:{simbolo,rotulo,clase}}}
   */
  function estadoConcepto(progreso, srs, id, c, hoy) {
    const dia = typeof hoy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(hoy) ? hoy : hoyISO();
    const concepto = c && typeof c === "object" ? c : {};
    const reg = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso[id] : null;
    const tarjetas = srs && typeof srs === "object" && !Array.isArray(srs) ? srs : {};
    const avisos = [];

    if (progreso && typeof progreso === "object" && !Array.isArray(progreso) && reg !== undefined && reg !== null && (typeof reg !== "object" || Array.isArray(reg))) {
      avisos.push("Lo guardado de esta ficha no tiene la forma esperada, así que no se le da nada por hecho. Se puede seguir estudiando: los datos nuevos se guardan bien.");
    }

    const nPreguntas = Number.isInteger(concepto.q) && concepto.q > 0 ? concepto.q : 0;
    const nPracticas = Number.isInteger(concepto.pr) && concepto.pr > 0 ? concepto.pr : 0;
    const clavesDe = [];
    for (let n = 0; n < nPreguntas; n++) clavesDe.push(`${id}#${n}`);

    // R2 y R3 salen de `srs`, que es el estado del repaso espaciado. Se recorre solo el
    // rango de preguntas que la ficha declara: si `srs` trae claves de más (una ficha que
    // encogio, una importación mezclada), esas no cuentan, en vez de regalar el requisito.
    let hechas = 0, acertadas = 0;
    for (const clave of clavesDe) {
      const t = tarjetas[clave];
      if (!t || typeof t !== "object" || Array.isArray(t)) continue;
      const a = Number(t.aciertos), f = Number(t.fallos);
      if (!Number.isFinite(a) || !Number.isFinite(f) || a < 0 || f < 0) continue;
      if (a + f > 0) hechas++;
      if (a > 0) acertadas++;
    }
    const todasRespondidas = nPreguntas > 0 && hechas >= nPreguntas;
    const todasAcertadas = nPreguntas > 0 && acertadas >= nPreguntas;

    const leido = leerLeido(reg);
    const minimo = minimoSegundos(concepto.n);
    const leidaDeVerdad = !!leido && leido.segundos >= minimo;

    const marca = leerPractica(reg);
    let resueltas = 0;
    if (marca) {
      for (let k = 0; k < nPracticas; k++) {
        const m = marca[String(k)];
        if (m && typeof m === "object" && !Array.isArray(m) && m.resuelto === true) resueltas++;
      }
    }
    const practicaOk = nPracticas === 0 || resueltas >= nPracticas;

    // ── Consolidada (contrato F01), calculada ANTES de la lista de requisitos ──────────────
    // Va aquí y no después a propósito: la primera vez que añadí R5 definí estas constantes
    // DEBAJO del array y las usé DENTRO, así que al construir la lista estaban en zona muerta
    // temporal. El ReferenceError tumbó dos suites (auditor a código 1 y estados a 2 de 7) y el
    // diagnóstico inicial —«algo asume cuatro requisitos»— era falso: los consumidores son
    // genéricos (est.cumplidos, est.total, est.requisitos.map). Es el tercer TDZ de este
    // programa; el orden de declaración importa y no perdona.
    const CONS = 3;   // días distintos con acierto; coincide con repsConsolidada de la política
    const clavesFicha = typeof clavesDeConcepto === "function" ? clavesDeConcepto(id) : [];
    const consolidadas = clavesFicha.filter((k) => {
      const t = srs[k];
      return !!(t && Array.isArray(t.dias) && t.dias.length >= CONS);
    }).length;
    const consolidadaFicha = nPreguntas > 0 && consolidadas >= nPreguntas;

    const requisitos = [
      {
        id: "R1", nombre: "Leída", cumplido: leidaDeVerdad,
        // Se dice el motivo exacto, con el numero: «falta algo» no dice a nadie que hacer.
        // Y se separan los dos casos, porque son dos acciones distintas las que faltan.
        motivo: leidaDeVerdad ? "" :
          !leido ? `Se cumple al llegar al final del artículo y estar ${minimo} s en pantalla.`
            : `Ya has llegado al final; faltan ${Math.max(1, Math.ceil(minimo - leido.segundos))} s con la ficha abierta.`,
        detalle: leido ? (leido.segundos >= 60 ? `${Math.round(leido.segundos / 60)} min en pantalla` : `${leido.segundos} s en pantalla`) : "",
      },
      {
        id: "R2", nombre: "Preguntas respondidas", cumplido: todasRespondidas,
        motivo: nPreguntas === 0 ? "" : todasRespondidas ? "" : `Llevas ${hechas} de ${nPreguntas}: falta responder ${nPreguntas - hechas}.`,
        detalle: nPreguntas ? `${hechas} de ${nPreguntas}` : "esta ficha no tiene preguntas",
      },
      {
        id: "R3", nombre: "Aprobada", cumplido: todasAcertadas,
        motivo: nPreguntas === 0 ? "" : todasAcertadas ? "" : `Acertadas ${acertadas} de ${nPreguntas}: falta acertar ${nPreguntas - acertadas} alguna vez.`,
        detalle: nPreguntas ? `${acertadas} de ${nPreguntas}` : "",
      },
      {
        id: "R4", nombre: "Práctica resuelta", cumplido: practicaOk,
        motivo: nPracticas === 0 ? "" : practicaOk ? "" : `Resueltos ${resueltas} de ${nPracticas}.`,
        detalle: nPracticas ? `${resueltas} de ${nPracticas}` : "esta ficha no tiene problemas prácticos",
      },
      // R5 · el cuarto hecho del contrato, con su nombre y su cuenta. Hasta ahora solo existía
      // como «dominada» en la escalera, y se confundía con «hecha», que en realidad suma tres
      // hechos (leída + respondida + aprobada). Aquí tiene su propia casilla: acertar en días
      // distintos, que es lo único que demuestra recordar.
      {
        id: "R5", nombre: "Consolidada en días distintos", cumplido: consolidadaFicha,
        motivo: nPreguntas === 0 ? "" : consolidadaFicha ? "" : `Consolidadas ${consolidadas} de ${nPreguntas}: acertar en días distintos, no repetir el mismo día.`,
        detalle: nPreguntas ? `${consolidadas} de ${nPreguntas}` : "esta ficha no tiene preguntas que consolidar",
      },
    ];

    // R1 abre la puerta a lo demas: sin haber leido la ficha, responder las preguntas no
    // demuestra nada. En cambio R4 no se exige para «hecha» —resolver un problema practico
    // cuesta mas que leer— sino para «dominada». Esa es toda la diferencia entre los dos.
    const r1 = requisitos[0].cumplido, r2 = requisitos[1].cumplido, r3 = requisitos[2].cumplido, r4 = requisitos[3].cumplido;
    const baseHecha = nPreguntas === 0 ? r1 : (r1 && r2 && r3);

    // ── El último peldaño, ahora alcanzable (contrato F01) ────────────────
    // El dato se calcula arriba, junto a R5, para que el requisito y el peldaño no puedan
    // discrepar: son el mismo hecho, no dos cuentas parecidas.
    const evidenciaDominio = consolidadaFicha;
    // El botón «Dominado» SÍ escribe: `marcar()` guarda `progreso[id][campo]` con clave
    // calculada, así que `dominado` existe de verdad. Las busquedas por «dominado: true» no lo
    // encontraban y di por muerto un campo vivo: quitar su efecto dejó el botón sin hacer nada.
    // Se restaura, y queda anotado que el contrato F01 discute que ese gesto conceda el último
    // peldaño: la decisión (autoevaluación como distintivo aparte) es de T13, no se toma aquí a
    // costa de romper lo que el usuario ya usa.
    const marcaManual = !!(reg && typeof reg === "object" && !Array.isArray(reg) && reg.dominado);
    const reclamaDominado = evidenciaDominio || marcaManual;
    // Y la autoevaluación, que NO es evidencia: se guarda aparte y se muestra con su nombre.
    const autoevaluada = !!(reg && typeof reg === "object" && !Array.isArray(reg) && reg.autoevaluacion);

    const faltan = requisitos.filter((r) => !r.cumplido).map((r) => r.nombre.toLowerCase());
    const motivoDe = (hasta) => {
      const pendientes = requisitos.filter((r) => !r.cumplido && hasta.includes(r.id));
      // El motivo se escribe para que se entienda que hacer a continuacion, no para
      // justificar el calculo: es lo que vera alguien que no sabe como funciona esto.
      if (pendientes.length === 1) return pendientes[0].motivo;
      return "Falta: " + pendientes.map((r) => r.nombre.toLowerCase()).join(", ") + ".";
    };

    let estadoSinAplazo;
    if (baseHecha && r4 && reclamaDominado) estadoSinAplazo = "dominado";
    else if (baseHecha) estadoSinAplazo = "hecho";
    else if (leido || hechas > 0 || resueltas > 0 || reclamaDominado) estadoSinAplazo = "a-medias";
    else estadoSinAplazo = "pendiente";

    // La prueba anti-regalo: se puede haber pulsado «marcar como dominado» sin cumplir nada.
    // Se respeta el clic (no se borra lo que la persona hizo) pero el estado NO se regala, y
    // el aviso dice que falta, que es lo unico util que se puede decir aqui.
    if (reclamaDominado && estadoSinAplazo !== "dominado") {
      avisos.push(`Está marcada como dominada, pero los requisitos no se cumplen todavía (${faltan.join(", ")}), así que cuenta como «${ESTADOS[estadoSinAplazo].rotulo.toLowerCase()}». En cuanto se cumplan, pasará a dominada sin volver a pulsar nada.`);
    }

    // Aplazar es la excepcion, y por eso se aplica la ultima: tapa el estado calculado pero
    // no lo borra. Cuando vence la fecha, reaparece tal cual estaba.
    //
    // Se devuelven los dos estados porque hacen falta para dos cosas distintas: `estado` es lo que
    // se enseña y `estadoSinAplazo` es lo que cuenta en el informe. Esa segunda mitad es la regla de
    // Moodle que impide que aplazar sea una manera de hacer desaparecer trabajo del recuento.
    const aplazado = leerAplazado(reg, dia);
    const estado = aplazado ? "aplazado" : estadoSinAplazo;

    const ordenRequisitos = ["R1", "R2", "R3", "R4"];
    const ins = ESTADOS[estado];
    return {
      estado,
      estadoSinAplazo,
      requisitos,
      cumplidos: requisitos.filter((r) => r.cumplido).length,
      total: requisitos.length,
      // Cual es el siguiente requisito que se puede cumplir y aun no lo esta. Es lo que
      // convierte el panel en una lista de tareas en vez de un cuadro de luces.
      siguiente: ordenRequisitos.find((k) => { const r = requisitos.find((x) => x.id === k); return r && !r.cumplido; }) || "",
      motivo: estado === "aplazado" ? "" : motivoDe(ordenRequisitos),
      avisos,
      aplazado,
      practicaResueltas: resueltas,
      practicaTotal: nPracticas,
      preguntasHechas: hechas,
      preguntasTotal: nPreguntas,
      preguntasAcertadas: acertadas,
      insignia: { simbolo: ins.simbolo, rotulo: ins.rotulo, clase: ins.clase },
    };
  }

  /** El estado de la ficha que se esta mirando, con los datos de este navegador. */
  const estadoDe = (id, hoy) => estadoConcepto(progreso, srs, id, P.conceptos[id] || {}, hoy);

  // ── La pastilla de estado, en los cuatro sitios donde se mira ─────────
  //
  // El mismo estado se enseña en `#/fase`, en `#/ruta`, en el arbol lateral y en el glosario, y
  // en los cuatro tiene que decir LO MISMO: si el arbol dijera «visto» mientras la ficha dice
  // «a medias», la persona no sabria a cual de los dos creer. Por eso la pastilla se construye
  // en un solo sitio y sale de `estadoConcepto`, que es la unica fuente de verdad: ni el arbol
  // ni el glosario vuelven a mirar `progreso[id].visto` por su cuenta.
  //
  // El simbolo va en un `span` aparte con `aria-hidden` y la palabra en el texto: quien usa un
  // lector de pantalla oye «A medias» y no «circulo mitad relleno», y quien distingue mal los
  // simbolos lee la palabra. Se añade `title` porque en el arbol lateral la pastilla se queda
  // en el simbolo mas la palabra, y al pasar por encima se lee el estado entero sin ambiguedad.
  function pastillaEstado(id, claseExtra, hoy) {
    return pastillaEstadoDesde(id, estadoDe(id, hoy), claseExtra);
  }

  /**
   * Lo mismo, con el estado ya calculado y un identificador opcional.
   *
   * El `id` solo lo pone la ficha (`#pastilla-estado`): el arbol tiene 438 pastillas y el
   * glosario otras tantas, asi que ahi no cabe un identificador por elemento, y repetirlo seria
   * un documento invalido. La comprobacion de la interfaz busca ese identificador en la ficha.
   */
  function pastillaEstadoDesde(id, est, claseExtra, idElemento) {
    const { simbolo, rotulo, clase } = est.insignia;
    const titulo = `Estado de esta ficha: ${rotulo.toLowerCase()}`;
    return `<span class="pastilla pastilla-estado estado-${clase}${claseExtra ? " " + claseExtra : ""}" data-estado-id="${esc(id)}"${idElemento ? ` id="${esc(idElemento)}"` : ""} title="${esc(titulo)}" role="img" aria-label="${esc(titulo)}"${simbolo ? ` data-simbolo="${esc(simbolo)}"` : ""}>${simbolo ? `<span class="estado-simbolo" aria-hidden="true">${esc(simbolo)}</span> ` : ""}<span class="estado-texto">${esc(rotulo)}</span></span>`;
  }

  // ── El panel «Requisitos de esta ficha» ───────────────────────────────
  //
  // Hoy la ficha tenía dos botones —«visto» y «dominado»— que se podían pulsar sin leer nada, y
  // el panel es la respuesta a eso: enseña QUE hace falta para darla por hecha, uno por uno, y
  // cuanto queda de cada cosa. No es un cuadro de luces, es una lista de tareas.
  //
  // Dos decisiones que se ven en el HTML y conviene no deshacer sin querer:
  //
  //  · Los requisitos se despliegan de forma progresiva. Los que todavía no se PUEDEN cumplir
  //    salen atenuados con el motivo escrito («se cumple al llegar al final del artículo»), en
  //    vez de salir apagados y ya está: un requisito en gris sin explicación se lee como un
  //    fallo del portal. Se marcan, pero no se esconden: esconderlos obligaría a adivinar qué
  //    falta para poder dominar la ficha.
  //
  //  · El pie dice el estado en palabras. La persona que abre la ficha por primera vez no sabe
  //    que «hecho» significa que se cumplen R1, R2 y R3, y la práctica no; eso se escribe aquí
  //    una vez, en el sitio donde se pregunta, y no en una página de ayuda que nadie abre.
  //
  // El estado NO se guarda: se recalcula de `progreso` y `srs` en cada pintado. Eso es lo que
  // hace que editar una clave a mano no regale una ficha y que cambiar la definición de un
  // requisito recalcule hacia atrás las 438.

  /**
   * Por qué un requisito todavía NO SE PUEDE cumplir, o cadena vacía si ya se puede.
   *
   * La diferencia importa y es la que sostiene el despliegue progresivo: R2 y R3 dependen de R1
   * —sin llegar al final del artículo, responder preguntas no demuestra nada— y hasta entonces
   * salen atenuados. R4 no depende de nadie: su problema práctico está en el artículo y se puede
   * resolver cuando se quiera, así que no se atenúa nunca. Lo único que se dice de R4 es DÓNDE
   * está su botón, y eso es una indicación, no un bloqueo; mezclar las dos cosas dejaría la
   * práctica en gris para siempre y parecería que el portal no deja hacerla.
   */
  function bloqueoRequisito(r, est) {
    if (r.id !== "R2" && r.id !== "R3") return "";
    return est.requisitos.some((x) => x.id === "R1" && x.cumplido) ? "" : "se abre al llegar al final del artículo";
  }

  /** Dónde está el botón que cumple este requisito, cuando no está en este panel. */
  function dondeSeCumple(r) {
    return r.id === "R4" && !r.cumplido ? "se marca en su problema, más abajo" : "";
  }

  /**
   * El panel de requisitos de una ficha, ya calculado su estado.
   *
   * @param {string} id    el concepto
   * @param {object} est   lo que devuelve `estadoConcepto`
   * @returns {string} el HTML del panel
   */
  function panelRequisitos(id, est) {
    const filas = est.requisitos.map((r) => {
      const bloqueo = r.cumplido ? "" : bloqueoRequisito(r, est);
      const nota = r.cumplido ? "" : dondeSeCumple(r);
      // La regla vertical dice de un vistazo qué está cumplido y qué no, igual que en la lista
      // de prerrequisitos: el color acompaña, pero la marca la da la regla.
      const clase = r.cumplido ? "cumplido" : bloqueo ? "bloqueado" : "pendiente";
      // El motivo y el detalle nunca se enseñan los dos: cuando el requisito está cumplido, el
      // motivo está vacío por definición, y cuando no lo está, el detalle es la cuenta que ya
      // dice el propio motivo («Llevas 1 de 2»). Repetirlo dos veces alarga la lista sin decir
      // nada nuevo.
      const cola = r.cumplido
        ? `<span class="requisito-detalle">${esc(r.detalle || "cumplido")}</span>`
        : `<span class="requisito-motivo">${esc(r.motivo || "todavía no se cumple")}</span>${bloqueo ? `<span class="requisito-bloqueo">${esc(bloqueo)}</span>` : ""}${nota ? `<span class="requisito-donde">${esc(nota)}</span>` : ""}`;
      return `<li class="requisito requisito-${clase}${r.cumplido ? "" : " requisito-abierto"}" id="requisito-${esc(r.id.toLowerCase())}">
        <span class="requisito-marca" aria-hidden="true">${r.cumplido ? "✓" : "·"}</span>
        <span class="requisito-nombre">${esc(r.nombre)}<span class="visualmente-oculto">: ${r.cumplido ? "cumplido" : "sin cumplir"}</span></span>
        ${cola}
      </li>`;
    }).join("");

    const completa = est.cumplidos === est.total;
    const pendiente = est.estado === "aplazado" ? "" :
      completa ? "Están los cuatro: la ficha está hecha. «Dominada» es otra cosa y la decides tú: quiere decir que puedes explicársela a alguien sin mirar."
        : "Se cumple en el orden en que se lee: primero llegar al final del artículo, después las preguntas, y por último la práctica. La práctica no bloquea «hecha», bloquea «dominada».";
    // El aviso de almacenamiento se repite aquí, en el pie del panel, y no solo arriba: el panel
    // es donde se ve el requisito marcarse, así que es donde hay que decir que eso no se va a
    // guardar. Un aviso en otra parte de la página se lee cuando ya es tarde.
    const aviso = almacenFalla
      ? `<p class="nota-pie requisitos-almacen">Este navegador no deja guardar en este equipo: lo que marques aquí se perderá al cerrar la pestaña. Para no perderlo, exporta el progreso desde <a href="#/progreso">Mi progreso</a> antes de cerrar.</p>`
      : "";
    return `<section class="requisitos" id="requisitos-ficha" aria-labelledby="requisitos-titulo">      <p class="requisitos-cabecera" id="requisitos-titulo">Requisitos de esta ficha: ${est.cumplidos} de ${est.total}${est.estado === "aplazado" ? " (aplazada)" : ""}</p>
      <ul class="requisitos-lista">${filas}</ul>
      ${pendiente ? `<p class="nota-pie requisitos-pie">${esc(pendiente)}</p>` : ""}
      ${aviso}
    </section>`;
  }

  // ── Los prerrequisitos como ruta (funcionalidad 5) ────────────────────
  //
  // El grafo ya existia y ya estaba cuidado, pero en el portal era una nota al pie: una lista
  // de enlaces. Aqui pasa a OPERAR: dice en que estado esta cada prerrequisito, avisa cuando
  // falta alguno y decide cual es el siguiente concepto.
  //
  // Lo que NO hace, y es la decision mas importante de esta funcionalidad: no bloquea nada.
  // La ficha se abre entera, se lee entera y se trabaja entera aunque falten prerrequisitos.
  // La documentacion de Moodle se pregunta a si misma si forzar el orden es lo que uno quiere;
  // aqui la respuesta es no, porque quien estudia solo es la misma persona que decide el orden
  // y no hay nadie a quien pedir que le abra la puerta. Un bloqueo duro en una maquina sin
  // servidor es una puerta cerrada con la llave dentro. Por eso en este bloque no hay ni un
  // `return` que corte el pintado de la ficha ni un `disabled`: solo informacion.

  // Como se lee cada estado de un prerrequisito. Los tres primeros son los de `ESTADOS` —el
  // estado de la ficha de la especificacion 01— porque un prerrequisito no tiene un estado
  // propio: tiene el suyo, y aqui solo se traduce a una frase util para quien lo lee.
  const ROTULO_PREREQ = {
    "dominado": "dominado",
    "hecho": "hecha",
    "a-medias": "a medias",
    "pendiente": "sin empezar",
    "aplazado": "aplazada",
  };
  const SIMBOLO_PREREQ = { "dominado": "✓", "hecho": "✓", "a-medias": "◐", "pendiente": "○", "aplazado": "⏸" };

  /**
   * Traduce el resultado de `estadoConcepto` a lo que hay que decir de un prerrequisito.
   * Existe separada porque se usa en tres sitios —la nota al pie, el aviso y la recomendacion—
   * y tener la traduccion en un solo sitio es lo que impide que digan cosas distintas.
   */
  function resumenPrerequisito(est) {
    const e = est && typeof est.estado === "string" ? est.estado : "pendiente";
    const clave = ROTULO_PREREQ[e] ? e : "pendiente";
    // El estado dice si esta cumplido, y `hecho` y `dominado` son los dos unicos que lo estan:
    // haberla empezado no es haberla acabado, y de ahi sale el aviso.
    const cumplido = clave === "hecho" || clave === "dominado";
    let detalle = ROTULO_PREREQ[clave];
    if (clave === "a-medias") {
      const faltan = Number(est?.preguntasTotal) - Number(est?.preguntasHechas);
      detalle = Number.isFinite(faltan) && faltan > 0
        ? `la empezaste y te falta${faltan === 1 ? "" : "n"} responder ${faltan} pregunta${faltan === 1 ? "" : "s"}`
        : "la empezaste y aún no la has terminado";
    } else if (clave === "aplazado" && est?.aplazado?.hasta) {
      detalle = `la aplazaste hasta el ${est.aplazado.hasta}`;
    } else if (clave === "dominado" || clave === "hecho") {
      detalle = ROTULO_PREREQ[clave];
    }
    return { estado: clave, cumplido, simbolo: SIMBOLO_PREREQ[clave], detalle };
  }

  /**
   * El estado de cada prerrequisito de una ficha, en el orden en que la ficha los declara.
   * Funcion pura: no lee localStorage. `contar` es la puerta para lo que necesite saber en que
   * estado esta el prerrequisito sin volver a calcularlo.
   *
   * Un prerrequisito que apunta a un concepto que no existe se DEVUELVE, marcado, en vez de
   * saltarse en silencio: esconderlo dejaria un hueco que nadie sabria explicar. Quien decide
   * que hacer con el es `siguienteRecomendado`, que lo ignora porque no se puede esperar a algo
   * que no existe. `_comprobar-prerequisitos.mjs` deberia hacerlo imposible, pero el portal no
   * puede depender de que todas las herramientas se hayan ejecutado.
   *
   * @param {object} progreso  id -> datos de la ficha, tal como se guardan
   * @param {object} c         la entrada del indice: {id, t, p: [...], ...}
   * @param {object} [opciones] {srs, hoy, contar}
   * @returns {Array<{id, titulo, existe, estado, cumplido, simbolo, detalle}>}
   */
  function estadoPrerequisitos(progreso, c, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const tarjetas = op.srs && typeof op.srs === "object" && !Array.isArray(op.srs) ? op.srs : {};
    const dia = typeof op.hoy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(op.hoy) ? op.hoy : hoyISO();
    const contar = typeof op.contar === "function" ? op.contar : estadoConcepto;
    const concepto = c && typeof c === "object" && !Array.isArray(c) ? c : {};
    const lista = Array.isArray(concepto.p) ? concepto.p : [];
    const salida = [];
    for (const id of lista) {
      if (typeof id !== "string" || !id) continue;
      const meta = P.conceptos[id];
      if (!meta) {
        salida.push({
          id, titulo: id, existe: false, estado: "inexistente", cumplido: false, simbolo: "?",
          detalle: "esta ficha no existe, así que no se puede cumplir",
        });
        continue;
      }
      const r = resumenPrerequisito(contar(progreso, tarjetas, id, meta, dia));
      salida.push({ id, titulo: meta.t, existe: true, ...r });
    }
    return salida;
  }

  /**
   * El aviso de «esto usa vocabulario que aún no has empezado». Devuelve el texto y el enlace,
   * no el HTML, para poder probarlo sin navegador; quien pinta decide como se ve.
   * Un prerrequisito inexistente NO genera aviso: no se le puede pedir a nadie que cumpla algo
   * que no existe, y decirlo aqui solo asustaria sin dar salida.
   *
   * @returns {{hay:boolean, faltan:Array, texto:string}}
   */
  function avisoPrerequisitos(progreso, c, opciones) {
    const lista = estadoPrerequisitos(progreso, c, opciones);
    const faltan = lista.filter((x) => x.existe && !x.cumplido);
    if (!faltan.length) return { hay: false, faltan: [], texto: "" };
    const nombres = faltan.map((x) => x.titulo).join(", ");
    const sinEmpezar = faltan.filter((x) => x.estado === "pendiente").length;
    // Se dice QUE falta y QUE hacer, en ese orden. Un aviso que solo dice «faltan
    // prerrequisitos» obliga a adivinar cual y por donde se empieza.
    const texto = `Esta ficha usa vocabulario de ${nombres}, que ${faltan.length === 1 ? "aún no tienes cumplido" : "aún no tienes cumplidos"}. ` +
      (sinEmpezar ? `${sinEmpezar === 1 ? "Una no la has empezado" : sinEmpezar + " no las has empezado"}. ` : "") +
      `Si te atascas, empieza por ahí; si no, sigue leyendo: no hay nada cerrado.`;
    return { hay: true, faltan, texto };
  }

  // Una preferencia que empieza encendida no se puede leer con `||`: `pref.avisarPrerequisitos`
  // vale `false` de verdad cuando alguien lo apaga, y `false || true` seria `true`. Se compara
  // contra `false` explicitamente, que ademas hace que un valor basura (una cadena, un numero)
  // deje el aviso encendido en vez de apagarlo sin que nadie lo haya pedido.
  const avisarPrerequisitos = () => pref.avisarPrerequisitos !== false;

  /** Que ruta sigue la recomendacion, o "" si no hay ninguna elegida. */
  function rutaActiva() {
    const r = pref.rutaActiva;
    return typeof r === "string" && P.rutas[r] ? r : "";
  }

  // ── Cual es el siguiente concepto, con el orden de las fases ───────────

  const plural = (n, singular, plural_) => `${n} ${n === 1 ? singular : plural_}`;

  /** Los prerrequisitos que de verdad impiden dar algo por apoyado: los que existen y no estan. */
  const prereqsPendientes = (lista) => lista.filter((x) => x.existe && !x.cumplido);

  // En que fase esta alguien: la primera que le queda a medias. Si ya lo tiene todo hecho, la
  // ultima. Es lo que hace que la recomendacion empiece por donde esta, y no por la fase 0.
  function faseEnCurso(estadoDeConcepto, orden) {
    for (const c of orden) {
      if (!["hecho", "dominado"].includes(estadoDeConcepto(c.id).estadoSinAplazo)) return c.f;
    }
    return orden.length ? orden[orden.length - 1].f : 0;
  }

  /**
   * El siguiente concepto que toca, con el orden de fases que el `README.md` declara como el
   * unico recomendado. Funcion pura: `orden` entra como parametro en vez de leerse de fuera,
   * que es lo que permite probarla con un grafo fabricado a mano.
   *
   * Los cuatro niveles de preferencia, en este orden:
   *   1. sin empezar, con todos los prerrequisitos cumplidos, en la fase en curso;
   *   2. lo mismo, en cualquier fase posterior (seguir una ruta sin quedarse parado);
   *   3. lo mismo, en cualquier fase (una fase anterior que quedo a medias no puede tapar todo);
   *   4. si nada cumple: el que menos prerrequisitos pendientes tenga, diciendolo claro.
   *
   * Nunca devuelve vacio mientras quede algo sin hacer: un «undefined» en la portada deja a
   * quien estudia mirando una pantalla en blanco, que es peor que una recomendacion imperfecta.
   *
   * @param {object} progreso  id -> datos de la ficha
   * @param {object} P_        el indice: {conceptos: {...}, rutas: {...}}
   * @param {object} pref_     las preferencias (rutaActiva, ordenRecomendado)
   * @param {Array}  orden_    los conceptos ya ordenados por fase y luego por identificador
   * @param {object} [opciones] {srs, hoy, contar, tope}
   * @returns {{id, titulo, fase, motivo, aviso, cumplePrerequisitos, pendientes, total,
   *            roto, cortado, candidatos}|null}
   */
  function siguienteRecomendado(progreso, P_, pref_, orden_, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const indice = P_ && typeof P_ === "object" ? P_ : {};
    const conceptos = indice.conceptos && typeof indice.conceptos === "object" ? indice.conceptos : {};
    const rutas = indice.rutas && typeof indice.rutas === "object" ? indice.rutas : {};
    const prefs = pref_ && typeof pref_ === "object" ? pref_ : {};
    const tarjetas = op.srs && typeof op.srs === "object" && !Array.isArray(op.srs) ? op.srs : {};
    const dia = typeof op.hoy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(op.hoy) ? op.hoy : hoyISO();
    const contar = typeof op.contar === "function" ? op.contar : estadoConcepto;
    const conOrden = (Array.isArray(orden_) ? orden_ : []).filter((c) => c && typeof c.id === "string" && conceptos[c.id]);
    // El tope de profundidad es el numero de conceptos. No es una precaucion decorativa: el
    // grafo es aciclico por construccion, pero si alguien edita un frontmatter a mano y no
    // ejecuta `_romper-ciclos.mjs`, la recomendacion no puede quedarse colgada mirando el grafo.
    const tope = Number.isInteger(op.tope) && op.tope > 0 ? op.tope : conOrden.length;
    // La posicion de cada concepto dentro del orden recomendado. Es el desempate de todos los
    // niveles: sin el, el resultado dependeria del orden de las claves del objeto, que cambia
    // con solo anadir una ficha y convertiria la recomendacion en una loteria.
    const posicion = new Map(conOrden.map((c, i) => [c.id, i]));

    if (!conOrden.length) {
      return { id: null, titulo: "", fase: null, motivo: "no hay ningún concepto publicado en este portal", aviso: "", cumplePrerequisitos: false, pendientes: 0, total: 0, roto: 0, cortado: false, candidatos: 0 };
    }

    const ruta = typeof prefs.rutaActiva === "string" && rutas[prefs.rutaActiva] ? prefs.rutaActiva : "";
    // `pref.ordenRecomendado` existe con un solo valor («fases») y aqui no se lee a proposito: el
    // orden recomendado es el de las fases y no hay otro, asi que no hay nada que decidir. La
    // preferencia esta declarada para que quede escrito que ese es el orden, y para que el dia que
    // se anada otro no cambie el significado de lo ya guardado. Tolerarla sin usarla es correcto:
    // lo que no se puede es inventarse un segundo orden que nadie ha pedido.

    // El estado se calcula UNA vez por concepto y se guarda: recorrer 438 conceptos calculando
    // su estado en cada nivel de preferencia seria hacer el mismo trabajo cuatro veces, y el
    // informe de la fase 8 va a llamar a esto con historiales largos.
    const est = new Map();
    const estadoDeUno = (id) => {
      if (!est.has(id)) est.set(id, contar(progreso, tarjetas, id, conceptos[id] || {}, dia));
      return est.get(id);
    };
    // La lista de prerrequisitos, tambien una sola vez por ficha. Cada elemento de la lista
    // vuelve a preguntar por el estado de otra ficha, asi que sin esta memoria el mismo trabajo
    // se repetiria una vez por nivel de preferencia y otra por el recuento del final.
    const prereqs = new Map();
    const prereqDe = (id) => {
      if (!prereqs.has(id)) prereqs.set(id, estadoPrerequisitos(progreso, conceptos[id], { srs: tarjetas, hoy: dia, contar }));
      return prereqs.get(id);
    };

    // Sin empezar = no hay ni un hecho suyo guardado. Se mira el estado ademas de `progreso`
    // porque un intento viejo de una version anterior del portal puede vivir solo en `srs`, y
    // decirle a alguien «no la has empezado» cuando lleva tres preguntas hechas es mentirle.
    const registrado = (id) => {
      const r = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso[id] : null;
      if (r && typeof r === "object" && !Array.isArray(r) && Object.keys(r).length) return true;
      const prefijo = id + "#";
      for (const clave of Object.keys(tarjetas)) if (clave.startsWith(prefijo)) return true;
      return false;
    };
    const faceta = (id) => {
      const e = estadoDeUno(id);
      const lista = prereqDe(id);
      const roto = lista.filter((x) => !x.existe).length;
      const faltan = prereqsPendientes(lista);
      return {
        c: conceptos[id],
        est: e,
        roto,
        faltan,
        pendientes: faltan.length,
        total: lista.length,
        // Una ficha aplazada no puede ser «lo siguiente»: aplazarla es justo quitarla de delante.
        aplazada: e.estado === "aplazado",
        empezada: registrado(id) || e.estado !== "pendiente",
        acabada: e.estadoSinAplazo === "hecho" || e.estadoSinAplazo === "dominado",
      };
    };

    const enCurso = faseEnCurso(estadoDeUno, conOrden);
    // Hasta que fase se puede proponer. Es la parte de «no se salta el orden de fases» que no
    // puede salir del grafo: hay fichas de F09 sin ningun prerrequisito —`que-es-un-mercado`—,
    // asi que por grafo solo se podrian proponer el primer dia. Se podrian, y no se hace: quien
    // empieza no necesita saber que existe, necesita saber por donde empezar. El nivel 3 sigue
    // existiendo para no quedarse parado —una fase anterior a medias no puede tapar el temario
    // entero—, pero mira hacia delante, no hacia el final.
    const hasta = enCurso + 1;
    const enVentana = (f) => f <= hasta;
    const candidatos = (desdeFase) => conOrden.filter((c) => {
      const f = faceta(c.id);
      if (f.acabada || f.aplazada || f.empezada || f.pendientes > 0) return false;
      if (desdeFase !== null && c.f < desdeFase) return false;
      if (!enVentana(c.f)) return false;
      if (ruta && !(Array.isArray(c.r) && c.r.includes(ruta))) return false;
      return true;
    });

    const grupos = [candidatos(enCurso), candidatos(enCurso + 1), candidatos(null)];
    let elegido = null, nivel = 0;
    for (let k = 0; k < grupos.length && !elegido; k++) {
      if (grupos[k].length) { elegido = grupos[k][0]; nivel = k + 1; }
    }
    const alternativas = grupos.reduce((s, g) => s + g.length, 0);

    // El bloqueo por ciclo solo puede venir de un frontmatter editado a mano: se recorre hacia
    // atras desde el elegido (o desde el primer concepto por orden si no hay elegido) contando
    // pasos, y si se pasa del tope se declara en vez de seguir. `visitados` corta el bucle; el
    // tope existe ademas para que un grafo raro no pueda encadenar 438 saltos antes de cortar.
    const visitados = new Set();
    let nodo = elegido ? elegido.id : conOrden[0].id, pasos = 0, cortado = false;
    while (nodo && !cortado) {
      if (visitados.has(nodo) || pasos >= tope) { cortado = true; break; }
      visitados.add(nodo);
      pasos++;
      const siguiente = conceptos[nodo] && Array.isArray(conceptos[nodo].p) ? conceptos[nodo].p.find((x) => conceptos[x]) : null;
      nodo = siguiente || null;
    }
    const AYUDA_CICLO = " hay un ciclo en los prerrequisitos";

    // Nivel 4: no hay ninguno con los prerrequisitos hechos. Se dice cual es el mas cercano y
    // cuanto le falta, porque «no hay nada» no es una respuesta util cuando queda temario.
    if (!elegido) {
      const dentroDeLaVentana = (id) => enVentana(conceptos[id].f);
      const sinTerminar = conOrden.filter((c) => { const f = faceta(c.id); return !f.acabada && !f.aplazada; });
      const restantes = sinTerminar.filter((c) => dentroDeLaVentana(c.id) && (!ruta || (Array.isArray(c.r) && c.r.includes(ruta))));
      if (!restantes.length) {
        // Tres finales distintos, y hay que distinguirlos porque la salida es distinta en cada
        // uno: cambiar de ruta, seguir con lo que ya esta empezado, o parar porque no queda nada.
        const enOtrasRutas = ruta ? sinTerminar.some((c) => dentroDeLaVentana(c.id)) : false;
        // Nada sin empezar dentro de la ventana, pero si fuera: no se propone —seria saltarse el
        // orden— y se dice con todas las letras, que es lo unico que evita que parezca un fallo.
        const fuera = sinTerminar.filter((c) => !dentroDeLaVentana(c.id));
        const motivo = !sinTerminar.length
          ? "no queda nada pendiente: el temario publicado entero está hecho o aplazado"
          : enOtrasRutas
            ? `no queda nada sin empezar dentro de la ruta ${rutas[ruta].nombre} con los prerrequisitos hechos: lo que falta de esta ruta no es lo que te toca ahora, y cambiar de ruta no oculta nada ni pierde progreso`
            : fuera.length
              ? `no hay ninguno sin empezar con los prerrequisitos hechos hasta la fase ${hasta}; lo siguiente está en la fase ${fuera[fuera.length - 1].f}, y llegar ahí antes de tiempo no ayuda`
              : "no queda nada sin empezar con los prerrequisitos hechos; lo que queda lo tienes a medias, y eso se termina desde su ficha";
        return { id: null, titulo: "", fase: null, nivel: 4, motivo, aviso: "", cumplePrerequisitos: false, pendientes: 0, total: 0, roto: 0, cortado, candidatos: 0 };
      }
      // El desempate es explicito: menos prerrequisitos pendientes y, a igualdad, el orden de
      // las fases. Con `sort` estable de Node y del navegador, dos llamadas seguidas dan el
      // mismo id, que es lo que exige la prueba de determinismo.
      restantes.sort((a, b) => {
        const fa = faceta(a.id), fb = faceta(b.id);
        return fa.pendientes - fb.pendientes || posicion.get(a.id) - posicion.get(b.id);
      });
      const c = restantes[0];
      const f = faceta(c.id);
      const aviso = cortado ? AYUDA_CICLO.trim() : "";
      return {
        id: c.id, titulo: c.t, fase: c.f, nivel: 4, candidatos: 0,
        motivo: `no hay ninguno con los prerrequisitos hechos dentro de lo que te toca; el más cercano es «${c.t}», le falta${f.pendientes === 1 ? "" : "n"} ${plural(f.pendientes, "prerrequisito", "prerrequisitos")} de ${f.total}${f.roto ? ` y ${plural(f.roto, "prerrequisito apunta", "prerrequisitos apuntan")} a una ficha que no existe` : ""}`,
        aviso: aviso ? aviso + (aviso.endsWith(".") ? "" : ".") : "",
        cumplePrerequisitos: false, pendientes: f.pendientes, total: f.total, roto: f.roto, cortado,
      };
    }

    // El motivo dice de donde sale la eleccion, no como se ha calculado: quien lo lee quiere
    // saber por que esa ficha y no otra, y «nivel 2» no significa nada fuera de este fichero.
    // Y se escribe entero para los dos casos —con prerrequisitos y sin ellos—: «tienes hechos los
    // 0 prerrequisitos que pide: no pide ninguno» es cierto y no hay quien lo lea.
    const f = faceta(elegido.id);
    const donde = nivel === 1 ? "es la fase por la que vas" : nivel === 2 ? "es la siguiente fase que te toca" : "está en otra fase, pero es lo que te toca";
    let motivo = f.total === 0
      ? `«${elegido.t}» no la has empezado y no pide ningún prerrequisito`
      : `«${elegido.t}» no la has empezado y tienes hechos los ${plural(f.total, "prerrequisito", "prerrequisitos")} que pide`;
    motivo += `; ${donde}`;
    if (ruta) motivo += `, dentro de la ruta ${rutas[ruta].nombre}`;
    motivo += ".";
    if (f.roto) motivo += ` (${plural(f.roto, "prerrequisito", "prerrequisitos")} de esta ficha apunta a una ficha que no existe y se ignora${f.roto === 1 ? "" : "n"})`;
    return {
      id: elegido.id, titulo: elegido.t, fase: elegido.f, nivel, motivo,
      aviso: cortado ? AYUDA_CICLO.trim() : "",
      cumplePrerequisitos: true, pendientes: 0, total: f.total, roto: f.roto, cortado,
      candidatos: alternativas, siguienteFase: enCurso,
    };
  }

  /** La recomendacion con los datos de este navegador. */
  const recomendacion = () => siguienteRecomendado(progreso, P, pref, orden, { srs, hoy: hoyISO() });

  // ── Lo que me falta hoy (fase 5) ──────────────────────────────────────
  //
  // Una sola lista que responde «¿qué hago ahora?» sin recorrer 438 fichas. Lo que se copia de
  // Canvas no es el flujo de actividad, es esto: una lista CORTA, ordenada por lo que más ayuda,
  // con el motivo de cada fila y lo que cuesta. El fallo real de quien estudia solo no es
  // recordar 438 fichas: es recordar cuatro pendientes.
  //
  // El orden es la tabla de la especificación 02, entera y comprobable: repaso vencido, fichas a
  // medias, aplazadas que vencen hoy y, por último, el concepto nuevo. No hay ningún orden por
  // «importancia» calculada: un orden que no se puede leer en la pantalla no se puede discutir,
  // y una lista en la que no se puede confiar no sirve para decidir nada.
  //
  // Cuánto cuesta cada cosa sale de la decisión 4 de la fase 0: la lectura va a 150 palabras por
  // minuto —el material lleva fórmulas y código intercalado y a ese ritmo se para uno a mirar— y
  // cada pregunta del repaso son 20 segundos. El presupuesto por nivel de una ficha entera
  // —leerla, teclear el código y resolver la práctica— es `MINUTOS_NIVEL`, en la sección del
  // plan; aquí se cuenta lo que cuesta leerla y responderla, que es lo que se hace hoy.
  const PALABRAS_POR_MINUTO = 150;
  const SEGUNDOS_POR_PREGUNTA = 20;
  // Cuántas filas se enseñan como mucho, si nadie dice otra cosa. El tope es la mitad de la
  // funcionalidad: una lista de 438 elementos es exactamente el problema que esto resuelve, y
  // por eso lo que queda fuera se cuenta en voz alta en vez de desaparecer.
  const PENDIENTES_MAX = 5;

  /**
   * Cuándo se tocó una ficha por última vez, para desempatar el grupo de las que están a medias.
   * Se miran las tres marcas que escribe el portal —la del botón, la de la lectura y la del
   * aplazo— porque no se escriben a la vez: quedarse con una sola daría por olvidadas fichas
   * que se tocaron ayer.
   */
  function tocadoEn(reg) {
    if (!reg || typeof reg !== "object" || Array.isArray(reg)) return 0;
    const n = (x) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
    return Math.max(n(reg.ts), n(reg.leido?.ts), n(reg.aplazado?.ts));
  }

  /**
   * Los minutos que cuesta una ficha: su lectura a 150 palabras por minuto más sus preguntas.
   *
   * Las palabras son las suyas, no las de la tabla por nivel: la ficha más corta del portal y la
   * más larga se leen en la mitad de tiempo la una que la otra, y decir «6 minutos» a las dos
   * sería cómodo y falso. El índice trae `palabras` desde que el generador las cuenta con la
   * misma función que `_medir-lectura.mjs`, así que no hay dos cuentas distintas.
   *
   * Si un índice viejo no las trae, se usa el presupuesto entero por nivel de `MINUTOS_NIVEL`:
   * prefiere pasarse antes que enseñar un cero, porque un cero aquí es una promesa que no se
   * puede cumplir.
   */
  function minutosDeFicha(c) {
    const palabras = c && Number.isInteger(c.palabras) && c.palabras > 0 ? c.palabras : null;
    const lectura = palabras === null
      ? (MINUTOS_NIVEL[c?.n] || MINUTOS_NIVEL["intermedio"])
      : Math.max(1, Math.round(palabras / PALABRAS_POR_MINUTO));
    const preguntas = c && Number.isInteger(c.q) && c.q > 0 ? (c.q * SEGUNDOS_POR_PREGUNTA) / 60 : 0;
    return Math.max(1, Math.round(lectura + preguntas));
  }

  /** «18 min», «1 h 10 min»: los dos formatos que se leen de un vistazo en una cabecera. */
  function duracion(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), resto = m % 60;
    return resto ? `${h} h ${resto} min` : `${h} h`;
  }

  // Los cuatro grupos del orden, con su número delante porque el orden ES la funcionalidad: se
  // enseña en la pantalla en vez de quedarse en un `sort` que nadie puede leer.
  const GRUPOS_PENDIENTES = ["repaso", "a-medias", "aplazado", "nuevo"];
  const ROTULO_GRUPO = {
    "repaso": "1 · Repaso vencido",
    "a-medias": "2 · A medias",
    "aplazado": "3 · Aplazada, vuelve hoy",
    "nuevo": "4 · Nuevo: el siguiente de tu ruta",
  };
  // Cómo se llama cada grupo cuando se elige en el filtro: el mismo nombre que arriba, sin el
  // número, porque en una lista desplegable el número no ordena nada.
  const ROTULO_FILTRO = {
    "repaso": "repaso vencido",
    "a-medias": "a medias",
    "aplazado": "aplazadas que vencen hoy",
    "nuevo": "nuevo",
  };
  // La regla del orden, en las palabras de la especificación: se enseña en la pantalla, porque un
  // orden que no se puede leer no se puede comprobar. Aquí va solo la lista de grupos; quién la
  // enseña le pone delante que es fija y que no se configura.
  const REGLA_PENDIENTES = "primero el repaso vencido, luego lo que está a medias, luego lo aplazado que vence hoy y, por último, el concepto nuevo";

  /**
   * Lo que hay que hacer hoy, en el orden de la especificación 02. Función pura y total: no lee
   * `localStorage`, no mira el reloj —el día entra como parámetro, que es lo único que permite
   * probar «ayer, hoy y mañana» sin depender del calendario de la máquina— y lo que no entiende
   * lo descarta contándolo, en vez de lanzar. Una lista que se cae entera por un dato raro no
   * sirve para decidir nada.
   *
   * Cada ficha sale UNA vez, en el primer grupo en el que encaja: repetirla en dos grupos sería
   * pedir dos veces lo mismo y hacer que la lista pareciera más larga de lo que es.
   *
   * @param {object} prog      id -> lo guardado de esa ficha
   * @param {object} tarjetas  "id#n" -> estado de SM-2 de esa pregunta
   * @param {object} P_        el índice: {conceptos, rutas}
   * @param {object} pref_     las preferencias: pendientesMax, filtroPendientes, rutaActiva
   * @param {string} hoy       AAAA-MM-DD
   * @param {object} [opciones] {dias} para contar también los días ilegibles
   * @returns {{filas:Array, total:number, delFiltro:number, mostradas:number, fuera:number,
   *            minutos:number, minutosFuera:number, raros:number, filtro:string, max:number,
   *            porGrupo:object, vacia:boolean, mensajeVacio:string}}
   */
  function pendientesDeHoy(prog, tarjetas, P_, pref_, hoy, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const indice = P_ && typeof P_ === "object" && !Array.isArray(P_) ? P_ : {};
    const conceptos = indice.conceptos && typeof indice.conceptos === "object" && !Array.isArray(indice.conceptos) ? indice.conceptos : {};
    const prefs = pref_ && typeof pref_ === "object" && !Array.isArray(pref_) ? pref_ : {};
    const registros = prog && typeof prog === "object" && !Array.isArray(prog) ? prog : {};
    const srs_ = tarjetas && typeof tarjetas === "object" && !Array.isArray(tarjetas) ? tarjetas : {};
    let raros = 0;

    // 1. Lo guardado que no se entiende. Se cuenta y se ignora, pero NO se limpia en silencio:
    // borrar el historial de alguien porque un campo no cuadra es peor que decir que no cuadra.
    // Un aplazo con la fecha ilegible entra aquí: sin fecha no se puede saber si vence hoy.
    for (const id of Object.keys(registros)) {
      const r = registros[id];
      if (r === null || typeof r !== "object" || Array.isArray(r)) { raros++; continue; }
      if (r.aplazado !== undefined && !(r.aplazado && typeof r.aplazado === "object" && !Array.isArray(r.aplazado) && esFechaISO(r.aplazado.hasta))) raros++;
    }
    // Una tarjeta sin `venc` legible no se puede poner en una fecha, y esta lista es de fechas.
    // Sin contarla, una pregunta invisible desaparecería de la cola sin que nadie lo supiera.
    for (const clave of Object.keys(srs_)) {
      const t = srs_[clave];
      if (t === null || typeof t !== "object" || Array.isArray(t) || !esFechaISO(t.venc)) raros++;
    }
    const dias_ = op.dias;
    if (dias_ && typeof dias_ === "object" && !Array.isArray(dias_)) {
      for (const k of Object.keys(dias_)) {
        const v = dias_[k];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || !esFechaISO(k)) raros++;
      }
    }

    const orden_ = ordenDe(indice);
    const filas = [];

    // ── Grupo 1: repaso vencido ───────────────────────────────────────────
    // Se copia el criterio de la cola de repaso entera: solo fichas marcadas como vistas y sin
    // aplazo vigente. Si la lista ofreciera preguntas que la sesión de repaso luego no sirve,
    // la lista mentiría justo en la fila que más se usa.
    const vencidas = [];
    for (const c of orden_) {
      const reg = registros[c.id];
      if (!reg || typeof reg !== "object" || Array.isArray(reg) || reg.visto !== true) continue;
      if (leerAplazado(reg, dia)) continue;
      const n = Number.isInteger(c.q) && c.q > 0 ? c.q : 0;
      for (let k = 0; k < n; k++) {
        const t = srs_[`${c.id}#${k}`];
        if (!t || typeof t !== "object" || Array.isArray(t) || !esFechaISO(t.venc) || t.venc > dia) continue;
        vencidas.push({ clave: `${c.id}#${k}`, ficha: c.id, venc: t.venc, fallos: Number.isFinite(Number(t.fallos)) ? Number(t.fallos) : 0 });
      }
    }
    // La más vieja primero y, a igualdad de fecha, de la que más se ha fallado: es el orden del
    // grupo en la especificación, y aquí decide de qué habla el motivo de la fila. Sin este
    // desempate, dos preguntas del mismo día saldrían en el orden de las claves del objeto.
    vencidas.sort((a, b) => (a.venc === b.venc ? (b.fallos - a.fallos || a.clave.localeCompare(b.clave)) : (a.venc < b.venc ? -1 : 1)));
    if (vencidas.length) {
      const atraso = diasEntre(vencidas[0].venc, dia);
      const fichas = new Set(vencidas.map((v) => v.ficha)).size;
      // El motivo se escribe desde el lado de quien lo lee —«venció hace 6 días»— y no con el
      // cálculo que lo produjo, que no le importa a nadie.
      const cuando = atraso <= 0 ? "vencen hoy"
        : vencidas.length === 1 ? (atraso === 1 ? "venció ayer" : `venció hace ${atraso} días`)
          : (atraso === 1 ? "la más antigua venció ayer" : `la más antigua venció hace ${atraso} días`);
      filas.push({
        grupo: "repaso", id: null,
        titulo: plural(vencidas.length, "pregunta de repaso", "preguntas de repaso"),
        motivo: cuando + (fichas > 1 ? `, en ${plural(fichas, "ficha", "fichas")}` : "") +
          (vencidas[0].fallos > 0 ? `; la que más has fallado lleva ${plural(vencidas[0].fallos, "fallo", "fallos")}` : ""),
        minutos: Math.max(1, Math.round((vencidas.length * SEGUNDOS_POR_PREGUNTA) / 60)),
        enlace: "#/repaso", preguntas: vencidas.length, fichas,
      });
    }

    // ── Grupo 3: aplazadas que vencen hoy ─────────────────────────────────
    // Se calcula ANTES que el grupo 2 a propósito: una aplazada que vence hoy y que además está
    // a medias sale en el grupo 3, que es el que dice lo que pasa («te la aplazaste hasta hoy»).
    // El `<=` es el mismo que usa el estado: el día que vence es el día en que vuelve a pedirse.
    const vencen = [];
    for (const c of orden_) {
      const reg = registros[c.id];
      if (!reg || typeof reg !== "object" || Array.isArray(reg)) continue;
      const a = reg.aplazado;
      if (!a || typeof a !== "object" || Array.isArray(a) || !esFechaISO(a.hasta) || a.hasta > dia) continue;
      vencen.push({ c, hasta: a.hasta, motivo: typeof a.motivo === "string" ? a.motivo.slice(0, MOTIVO_MAX) : "" });
    }
    vencen.sort((a, b) => (a.hasta === b.hasta ? a.c.id.localeCompare(b.c.id) : (a.hasta < b.hasta ? -1 : 1)));
    const yaEnAplazo = new Set(vencen.map((v) => v.c.id));

    // ── Grupo 2: fichas a medias ──────────────────────────────────────────
    // «A medias» es el estado calculado: algo empezado y algo sin cumplir. Una ficha con el
    // aplazo vigente no entra —dejar de pedirse es exactamente lo que se pidió al aplazarla—,
    // y por eso el aplazo no borra nada: sigue contando en el informe con su estado de verdad.
    const medias = [];
    for (const c of orden_) {
      if (yaEnAplazo.has(c.id)) continue;
      const reg = registros[c.id];
      if (reg && typeof reg === "object" && !Array.isArray(reg) && leerAplazado(reg, dia)) continue;
      const est = estadoConcepto(registros, srs_, c.id, c, dia);
      if (est.estadoSinAplazo !== "a-medias") continue;
      medias.push({ c, est, faltan: est.total - est.cumplidos, ts: tocadoEn(reg) });
    }
    // Menos requisitos pendientes primero —lo que está a un paso va antes que lo que está a
    // cuatro— y, a igualdad, lo tocado más recientemente, que es lo que se tiene fresco.
    medias.sort((a, b) => (a.faltan - b.faltan || b.ts - a.ts || a.c.id.localeCompare(b.c.id)));

    for (const m of medias) {
      filas.push({
        grupo: "a-medias", id: m.c.id, titulo: m.c.t,
        // El motivo lo escribe `estadoConcepto`, que es quien sabe qué falta: dos sitios diciendo
        // por qué una ficha está a medias acabarían diciendo cosas distintas.
        motivo: m.est.motivo || `le faltan ${plural(m.faltan, "requisito", "requisitos")}`,
        minutos: minutosDeFicha(m.c), enlace: `#/c/${m.c.id}`, faltan: m.faltan, cumplidos: m.est.cumplidos, total: m.est.total,
      });
    }
    for (const v of vencen) {
      filas.push({
        grupo: "aplazado", id: v.c.id, titulo: v.c.t,
        motivo: v.hasta === dia ? "te la aplazaste hasta hoy" : `la aplazaste hasta el ${v.hasta}, y ya venció`,
        minutos: minutosDeFicha(v.c), enlace: `#/c/${v.c.id}`, hasta: v.hasta, aplazoMotivo: v.motivo,
      });
    }

    // ── Grupo 4: el siguiente concepto nuevo ──────────────────────────────
    // La recomendación de siempre, con su motivo. Si ya está en la lista por otro grupo no se
    // repite: cuando no queda nada sin empezar, la recomendación cae al «más cercano», que
    // puede ser justo una ficha que ya está arriba a medias.
    const rec = siguienteRecomendado(registros, indice, prefs, orden_, { srs: srs_, hoy: dia });
    const yaEsta = new Set(filas.map((f) => f.id).filter(Boolean));
    if (rec && rec.id && conceptos[rec.id] && !yaEsta.has(rec.id)) {
      filas.push({
        grupo: "nuevo", id: rec.id, titulo: rec.titulo, motivo: rec.motivo,
        minutos: minutosDeFicha(conceptos[rec.id]), enlace: `#/c/${rec.id}`, aviso: rec.aviso || "",
      });
    }

    // ── El filtro y el tope ───────────────────────────────────────────────
    const filtro = GRUPOS_PENDIENTES.includes(prefs.filtroPendientes) ? prefs.filtroPendientes : "";
    const pasa = filtro ? filas.filter((f) => f.grupo === filtro) : filas;
    // Un tope mal puesto —0, negativo, un texto, un decimal— no puede vaciar la lista ni lanzar:
    // se usa el de siempre y no se pregunta nada. Una lista que se rompe por una preferencia
    // rara es una lista que se rompe sola.
    const max = Number.isInteger(prefs.pendientesMax) && prefs.pendientesMax > 0 ? prefs.pendientesMax : PENDIENTES_MAX;
    const mostradas = pasa.slice(0, max);
    const porGrupo = { repaso: 0, "a-medias": 0, aplazado: 0, nuevo: 0 };
    for (const f of filas) porGrupo[f.grupo]++;

    // El estado vacío no puede decir solo «no hay nada»: eso deja a quien lo lee igual que
    // estaba. Dice qué hacer para que la lista tenga algo, que es lo único útil aquí.
    let mensajeVacio = "";
    if (!mostradas.length) {
      mensajeVacio = filtro && filas.length
        ? `El filtro «${ROTULO_FILTRO[filtro]}» no deja ninguna fila ahora mismo. Quítalo para ver ${filas.length === 1 ? "la que tienes" : `las ${filas.length} que tienes`}.`
        : rec && !rec.id
          ? `${rec.motivo}. Puedes repasar el temario entero en «Las fases» o cambiar de ruta.`
          : "No tienes nada pendiente todavía, y eso es normal el primer día: la lista se llena sola. Abre una ficha —el buscador está en la tecla «/»—, marca una como vista y sus preguntas entrarán en la cola de repaso; en cuanto dejes una a medias, aparecerá aquí.";
    }

    return {
      filas: mostradas,
      total: filas.length,
      delFiltro: pasa.length,
      mostradas: mostradas.length,
      fuera: pasa.length - mostradas.length,
      minutos: mostradas.reduce((s, f) => s + f.minutos, 0),
      minutosFuera: pasa.slice(max).reduce((s, f) => s + f.minutos, 0),
      raros,
      filtro,
      max,
      porGrupo,
      vacia: mostradas.length === 0,
      mensajeVacio,
    };
  }

  /** La lista de hoy con los datos de este navegador. El día entra como parámetro. */
  const pendientesAhora = (hoy) => pendientesDeHoy(progreso, srs, P, pref, hoy, { dias });

  // ── El informe: huecos, abandono, actividad y riesgo (fase 8) ─────────
  //
  // El informe no es una nota: es un mapa. Con 438 fichas, el abandono de verdad no es una ficha
  // suelta sino una fase entera que se queda a medias y no se vuelve a abrir, y un porcentaje
  // global tapa justo eso. Lo que hay aqui son funciones PURAS que derivan el mapa de lo que ya
  // esta guardado: esta fase no anade ninguna clave nueva, y por eso los textos legales que
  // nombran lo que se guarda siguen diciendo la verdad sin tocarlos.
  //
  // El dia de hoy entra siempre como parametro: es el unico dato que cambia solo, y una prueba
  // que depende del calendario deja de servir mañana sin que nadie se entere.

  // Los filtros del mapa, en el orden en que se pintan. `fase` no es un estado: es «solo la fase
  // por la que voy», que es la pregunta que de verdad se hace al mirar 438 celdas.
  const FILTROS_HUECOS = ["", "pendiente", "a-medias", "hecho", "dominado", "aplazado", "fase"];
  const ROTULO_FILTRO_HUECOS = { "": "Todas", "pendiente": "Sin empezar", "a-medias": "A medias", "hecho": "Hechas", "dominado": "Dominadas", "aplazado": "Aplazadas", "fase": "Solo la fase en curso" };

  // El criterio del mapa es el MISMO que el de la lista de una fase y el de la pastilla de la
  // ficha: los cinco estados de `estadoConcepto`, sin inventar un sexto para el informe. Dos
  // criterios distintos para lo mismo serian dos respuestas a «¿como va esta ficha?», y una de
  // las dos estaria mal.
  const REGLA_HUECOS = "Los cinco estados salen del mismo cálculo que el resto del portal: leída, preguntas respondidas, aprobada y práctica resuelta. El aplazo se enseña encima, pero no borra el estado de debajo.";

  // Cuantos dias sin tocar una fase a medias hacen falta para llamarla abandonada. Es preferencia
  // y no constante escondida porque depende de la vida de cada uno: quien estudia los fines de
  // semana no se puede medir con el mismo rasero que quien estudia todos los dias.
  const DIAS_ABANDONO = 14;

  // La agregacion de la actividad es la regla que usa Canvas, y hoy solo tiene un modo: `auto`.
  // Se guarda como preferencia para que el dia que exista otro no haya que cambiar el formato.
  const AGRUPAR_ACTIVIDAD = "auto";

  // Los tramos de esa regla: por dia los ultimos 90, por semana de ahi hasta los 400 dias atras y
  // por mes a partir de ahi. Los topes (90, 45 y 60 barras) son lo que impide que cinco años de
  // historial se conviertan en 1.800 barras y en una vista que no abre.
  const TRAMO_ACTIVIDAD = { dias: 90, semanas: 45, meses: 60, hastaSemanas: 400 };

  // Las cuatro reglas de «Como vas», con su umbral escrito al lado. Ni una mas, y NINGUNA
  // entrenada: esto lo puede leer cualquiera, discutir el umbral y comprobar por que salta, que
  // es exactamente lo que un modelo no permite. El bloque se llama «Como vas» y no «riesgo de
  // abandono» porque describe hechos; no diagnostica a nadie.
  const REGLAS_RIESGO = [
    { id: "sin-actividad", rotulo: "Días sin responder nada", umbral: 7, unidad: "días seguidos" },
    { id: "aplazadas-vencidas", rotulo: "Aplazadas que ya vencieron", umbral: 3, unidad: "fichas" },
    { id: "fallo-reciente", rotulo: "Fallos en la fase en curso", umbral: 40, unidad: "por ciento en 7 días" },
    { id: "fase-parada", rotulo: "Fase en curso sin avance", umbral: 14, unidad: "días parada" },
  ];

  /**
   * El dia (AAAA-MM-DD) de una marca de tiempo en milisegundos, o «» si no hay fecha que valga.
   *
   * Un `ts` de 0 NO cuenta como fecha: es el relleno que llevan los datos de ejemplo y tambien lo
   * que queda en un fichero editado a mano. Darlo por bueno fecharia el ultimo avance en 1970 y el
   * informe diria que una fase lleva veinte mil dias parada, que es peor que no decir nada.
   */
  function diaDeMarca(ts) {
    if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return "";
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  /**
   * La fecha de un aplazo GUARDADO, aunque ya haya vencido, o «» si no hay ninguno.
   *
   * `leerAplazado` devuelve null en cuanto la fecha llega, y hace bien: a partir de ese dia la
   * ficha vuelve a su estado calculado, sin que nadie tenga que acordarse de deshacer nada. Pero
   * el informe necesita saber que ese aplazo EXISTIO y que su fecha ya paso, porque «la aplacé
   * hasta el martes y el martes ya pasó» es justo la ficha que se queda mirando al techo.
   */
  function aplazoGuardado(reg) {
    if (!reg || typeof reg !== "object" || Array.isArray(reg)) return "";
    const a = reg.aplazado;
    if (!a || typeof a !== "object" || Array.isArray(a)) return "";
    return esFechaISO(a.hasta) ? a.hasta : "";
  }

  /**
   * El dia mas reciente con constancia de actividad, o «» si no hay ninguno.
   *
   * Se miran las dos fuentes porque son la misma cosa contada dos veces: el contador de `dias`
   * (que se escribe al responder) y la fecha de cada intento guardado. Quedarse con una sola haria
   * que un historial importado a medias pareciera un mes de silencio.
   */
  function ultimoDiaConActividad(dias_, intentos_, hoy) {
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const fuente = dias_ && typeof dias_ === "object" && !Array.isArray(dias_) ? dias_ : {};
    const historial = intentos_ && typeof intentos_ === "object" && !Array.isArray(intentos_) ? intentos_ : {};
    let ultimo = "";
    const mete = (f) => { if (esFechaISO(f) && diasEntre(f, dia) >= 0 && f > ultimo) ultimo = f; };
    for (const k of Object.keys(fuente)) {
      const n = Number(fuente[k]);
      if (Number.isFinite(n) && n > 0) mete(k);
    }
    for (const clave of Object.keys(historial)) {
      const lista = historial[clave];
      if (!Array.isArray(lista)) continue;
      for (const x of lista) {
        if (x && typeof x === "object" && !Array.isArray(x) && typeof x.fecha === "string") mete(x.fecha);
      }
    }
    return ultimo;
  }

  /**
   * La ultima fecha en la que paso algo en una ficha, en AAAA-MM-DD, o «» si nada lo demuestra.
   *
   * Cuenta como avance todo lo que deja rastro CON FECHA: una respuesta del historial, una tarjeta
   * que se programo, la marca de lectura, la practica resuelta y el visto o el dominado. Lo que no
   * se puede fechar no se inventa: una fase sin fechas sale con «sin fecha de avance» en lugar de
   * con una fecha falsa, porque el informe es justo donde alguien va a mirar.
   *
   * Las fechas futuras se ignoran: un reloj mal puesto no puede hacer que una fase parada parezca
   * recien tocada.
   */
  function ultimoAvance(progreso, srs, intentos_, c, hoy) {
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const concepto = c && typeof c === "object" && !Array.isArray(c) ? c : {};
    const id = typeof concepto.id === "string" ? concepto.id : "";
    const registros = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso : {};
    const tarjetas = srs && typeof srs === "object" && !Array.isArray(srs) ? srs : {};
    const historial = intentos_ && typeof intentos_ === "object" && !Array.isArray(intentos_) ? intentos_ : {};
    const candidatas = [];
    const mete = (f) => { if (esFechaISO(f) && diasEntre(f, dia) >= 0) candidatas.push(f); };
    const reg = registros[id];
    if (reg && typeof reg === "object" && !Array.isArray(reg)) {
      mete(diaDeMarca(reg.ts));
      const leido = leerLeido(reg);
      if (leido) mete(diaDeMarca(leido.ts));
      const practica = leerPractica(reg);
      if (practica) for (const k of Object.keys(practica)) {
        const m = practica[k];
        if (m && typeof m === "object" && !Array.isArray(m)) mete(diaDeMarca(m.ts));
      }
    }
    const n = Number.isInteger(concepto.q) && concepto.q > 0 ? concepto.q : 0;
    for (let k = 0; k < n; k++) {
      const clave = `${id}#${k}`;
      const t = tarjetas[clave];
      if (t && typeof t === "object" && !Array.isArray(t) && typeof t.ultimo === "string") mete(t.ultimo);
      const lista = historial[clave];
      if (Array.isArray(lista) && lista.length) {
        const u = lista[lista.length - 1];
        if (u && typeof u === "object" && !Array.isArray(u) && typeof u.fecha === "string") mete(u.fecha);
      }
    }
    if (!candidatas.length) return "";
    // Las fechas ISO se ordenan como texto igual que como fechas, asi que no hay que convertirlas.
    return candidatas.sort()[candidatas.length - 1];
  }

  /**
   * El mapa de estados: las fichas agrupadas por fase, cada una con su estado, y el recuento por
   * estado. Funcion pura.
   *
   * Devuelve TODAS las fichas, cada una con `pasa` (si el filtro la deja dentro). Se devuelven
   * todas a proposito: una fase plegada tiene que poder decir «12 de 54» aunque el filtro deje
   * fuera 40, y para eso hace falta saber cuantas quedan dentro y cuantas fuera. Quien decide
   * cuantas celdas llegan al DOM es la vista, no esta funcion: el mapa se pinta plegado.
   *
   * @param {object} progreso  id -> datos de la ficha
   * @param {object} srs       "id#n" -> tarjeta de repaso
   * @param {object} P_        el indice del portal: {conceptos, fases, rutas}
   * @param {object} pref_     las preferencias (aqui solo se lee `filtroEstado`)
   * @param {string} hoy       AAAA-MM-DD; entra como parametro para poder probarlo
   * @returns {{total:number, suma:number, porEstado:object, fases:Array, filtro:string,
   *            mostradas:number, ocultas:number, vacio:boolean, mensajeVacio:string}}
   */
  function huecos(progreso, srs, P_, pref_, hoy) {
    const indice = P_ && typeof P_ === "object" && !Array.isArray(P_) ? P_ : {};
    const conceptos = indice.conceptos && typeof indice.conceptos === "object" && !Array.isArray(indice.conceptos) ? indice.conceptos : {};
    const prefs = pref_ && typeof pref_ === "object" && !Array.isArray(pref_) ? pref_ : {};
    const registros = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso : {};
    const tarjetas = srs && typeof srs === "object" && !Array.isArray(srs) ? srs : {};
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const lista = ordenDe(indice);
    const filtro = FILTROS_HUECOS.includes(prefs.filtroEstado) ? prefs.filtroEstado : "";
    const enCurso = faseEnCurso((id) => estadoConcepto(registros, tarjetas, id, conceptos[id] || {}, dia), lista);

    // Los grupos se pre-crean en el orden del temario para que el orden no dependa de las claves
    // de un objeto, que cambian con solo añadir una ficha. Una lista que cambia de orden entre dos
    // pintados es una lista en la que no se puede confiar.
    const grupos = (Array.isArray(indice.fases) ? indice.fases : []).map((f) => ({ id: f.id, n: f.n, corto: f.corto, celdas: [] }));
    const porId = new Map(grupos.map((g) => [g.id, g]));
    const porEstado = { "pendiente": 0, "a-medias": 0, "hecho": 0, "dominado": 0, "aplazado": 0 };
    for (const c of lista) {
      const est = estadoConcepto(registros, tarjetas, c.id, conceptos[c.id] || c, dia);
      porEstado[est.estado] = (porEstado[est.estado] || 0) + 1;
      const clave = typeof c.fid === "string" && c.fid ? c.fid : `f${c.f}`;
      if (!porId.has(clave)) {
        const nuevo = { id: clave, n: c.f, corto: clave, celdas: [] };
        porId.set(clave, nuevo);
        grupos.push(nuevo);
      }
      const pasa = !filtro || (filtro === "fase" ? c.f === enCurso : est.estado === filtro);
      porId.get(clave).celdas.push({
        id: c.id,
        titulo: typeof c.t === "string" ? c.t : c.id,
        nivel: typeof c.n === "string" ? c.n : "",
        fase: c.f,
        fid: clave,
        estado: est.estado,
        estadoSinAplazo: est.estadoSinAplazo,
        cumplidos: est.cumplidos,
        total: est.total,
        pasa,
        simbolo: est.insignia.simbolo,
        rotulo: est.insignia.rotulo,
        clase: est.insignia.clase,
      });
    }

    const fases = grupos.filter((g) => g.celdas.length).map((g) => {
      const cuenta = { "pendiente": 0, "a-medias": 0, "hecho": 0, "dominado": 0, "aplazado": 0 };
      let dentro = 0;
      for (const celda of g.celdas) {
        cuenta[celda.estado] = (cuenta[celda.estado] || 0) + 1;
        if (celda.pasa) dentro++;
      }
      return { id: g.id, n: g.n, corto: g.corto, total: g.celdas.length, cuenta, dentro, celdas: g.celdas };
    });
    const total = lista.length;
    const mostradas = fases.reduce((s, f) => s + f.dentro, 0);
    let mensajeVacio = "";
    if (total === 0) mensajeVacio = "Todavía no hay fichas que mapear. Cuando el portal tenga contenido, aquí saldrá el estado de cada una.";
    else if (mostradas === 0) mensajeVacio = `Con el filtro «${ROTULO_FILTRO_HUECOS[filtro] || filtro}» no queda ninguna ficha. Vuelve a «Todas» para ver el mapa entero.`;
    return {
      total,
      suma: Object.values(porEstado).reduce((s, n) => s + n, 0),
      porEstado,
      fases,
      filtro,
      filtroRotulo: ROTULO_FILTRO_HUECOS[filtro] || "",
      faseEnCurso: enCurso,
      mostradas,
      ocultas: total - mostradas,
      vacio: total === 0,
      vacioFiltro: total > 0 && mostradas === 0,
      mensajeVacio,
      regla: REGLA_HUECOS,
    };
  }

  /**
   * Las fases que se han quedado a medias y sin tocar: al menos una ficha «a medias» y ningun
   * avance fechado en los ultimos `diasAbandono` dias (14 por defecto). Funcion pura.
   *
   * Es la respuesta a «¿qué he dejado tirado?», y existe porque un porcentaje global no la
   * contesta nunca: con 438 fichas el abandono no es una ficha suelta, es una fase entera que
   * nadie vuelve a abrir.
   *
   * Cuenta con `estadoSinAplazo`, que es la regla de la fase 2: el aplazo sustituye a la regla
   * general para PEDIR la ficha, pero no la borra del informe.
   */
  function abandonadas(progreso, srs, P_, pref_, hoy, opciones) {
    const op = opciones && typeof opciones === "object" && !Array.isArray(opciones) ? opciones : {};
    const prefs = pref_ && typeof pref_ === "object" && !Array.isArray(pref_) ? pref_ : {};
    const indice = P_ && typeof P_ === "object" && !Array.isArray(P_) ? P_ : {};
    const conceptos = indice.conceptos && typeof indice.conceptos === "object" && !Array.isArray(indice.conceptos) ? indice.conceptos : {};
    const registros = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso : {};
    const tarjetas = srs && typeof srs === "object" && !Array.isArray(srs) ? srs : {};
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const tope = Number.isInteger(prefs.diasAbandono) && prefs.diasAbandono > 0 ? prefs.diasAbandono : DIAS_ABANDONO;
    const mapa = huecos(registros, tarjetas, indice, prefs, dia);
    const lista = [];
    for (const f of mapa.fases) {
      let medias = 0, empezadas = 0, aplazadas = 0, total = 0, ultimo = "", volver = null;
      for (const celda of f.celdas) {
        total++;
        if (celda.estado === "aplazado") aplazadas++;
        if (celda.estadoSinAplazo === "a-medias") {
          medias++;
          // Por donde volver: la ficha a medias que está MÁS cerca de estar hecha. Volver por la
          // que menos falta es lo que convierte el aviso en algo que se hace, en vez de en una
          // lista de reproches.
          if (!volver || celda.cumplidos > volver.cumplidos) {
            volver = { id: celda.id, titulo: celda.titulo, cumplidos: celda.cumplidos, total: celda.total };
          }
        }
        if (celda.estadoSinAplazo !== "pendiente") empezadas++;
        const av = ultimoAvance(registros, tarjetas, op.intentos, conceptos[celda.id] || { id: celda.id, q: 0 }, dia);
        if (av > ultimo) ultimo = av;
      }
      const diasParada = ultimo ? diasEntre(ultimo, dia) : null;
      if (medias >= 1 && (diasParada === null || diasParada >= tope)) {
        lista.push({ fid: f.id, n: f.n, corto: f.corto, medias, empezadas, aplazadas, total, ultimo, diasParada, volver });
      }
    }
    // Primero lo mas parado. `Infinity` para las que no tienen ninguna fecha: no se puede decir
    // cuanto llevan, y eso las pone delante, que es donde tienen que estar para que se miren.
    lista.sort((a, b) => {
      const da = a.diasParada === null ? Infinity : a.diasParada;
      const db = b.diasParada === null ? Infinity : b.diasParada;
      return db - da || a.n - b.n || a.fid.localeCompare(b.fid);
    });
    return { lista, diasAbandono: tope, total: lista.length, vacio: lista.length === 0 };
  }

  /**
   * La actividad por tramos: por dia los ultimos 90 dias, por semana de ahi hasta los 400 y por
   * mes a partir de ahi. Es la regla de agregacion que usa Canvas, y esta aqui por una razon de
   * tamaño: sin ella, cinco años de historial son 1.800 barras y una vista que no abre.
   *
   * Devuelve los cubos de mas viejo a mas nuevo, cada uno con su tramo y su cuenta. Los dias con
   * un valor que no es un numero, o negativo, cuentan como 0 y se DECLARAN en `raros`: limpiar
   * historia en silencio es justo lo que no se puede hacer en un informe, que es donde alguien va
   * a mirar precisamente cuando algo no cuadra.
   */
  function bucketsActividad(dias_, hoy, opciones) {
    const op = opciones && typeof opciones === "object" && !Array.isArray(opciones) ? opciones : {};
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const fuente = dias_ && typeof dias_ === "object" && !Array.isArray(dias_) ? dias_ : {};
    const porDia = new Map();
    let raros = 0;
    for (const k of Object.keys(fuente)) {
      if (!esFechaISO(k) || diasEntre(k, dia) < 0) { raros++; continue; }
      const bruto = fuente[k];
      const n = typeof bruto === "number" && Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto) : 0;
      if (bruto !== 0 && n === 0) raros++;
      porDia.set(k, n);
    }
    const suma = (desde, hasta) => { let n = 0; for (const [k, v] of porDia) if (k >= desde && k <= hasta) n += v; return n; };
    const atras = (n) => { const d = new Date(dia + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    const diaMes = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
    const mesDe = (iso) => iso.slice(5, 7) + "/" + iso.slice(0, 4);

    // El historial empieza en el dia mas viejo con dato: contar desde 1970 llenaria el informe de
    // miles de meses vacios que no informan de nada.
    let primero = "";
    for (const k of porDia.keys()) if (!primero || k < primero) primero = k;
    const total = [...porDia.values()].reduce((s, n) => s + n, 0);
    if (!primero) {
      // Sin ningún día con dato no hay gráfica: se dice que está vacía, que es muy distinto de
      // pintar barras a cero. La forma de lo que se devuelve es la misma que en el caso normal,
      // para que quien lo lea no tenga que distinguir dos objetos distintos.
      return {
        modo: "vacio", cubos: [], porTramo: { dia: 0, semana: 0, mes: 0 },
        raros, total: 0, sumaCubos: 0, recortados: 0, regla: "",
        agrupar: op.agrupar === AGRUPAR_ACTIVIDAD ? op.agrupar : AGRUPAR_ACTIVIDAD,
      };
    }
    const rango = diasEntre(primero, dia);

    // Tramo 1: los ultimos 90 dias, uno a uno. El bucle va de mas viejo a mas nuevo, que es el
    // orden en el que se lee una grafica.
    const porDiaCubos = [];
    for (let i = Math.min(TRAMO_ACTIVIDAD.dias, rango + 1) - 1; i >= 0; i--) {
      const iso = atras(i);
      porDiaCubos.push({ grano: "dia", desde: iso, hasta: iso, etiqueta: diaMes(iso), n: porDia.get(iso) || 0 });
    }
    // Tramo 2: de 90 a 400 dias atras, en bloques de siete dias. El bloque mas viejo se recorta en
    // el dia 90 y el mas nuevo en el ultimo dia del historial, para que ningun dia se cuente dos
    // veces entre este tramo y el anterior ni se pinten semanas vacias que no existieron. El bucle
    // empieza por el bloque MAS VIEJO (el de mas dias atras) y va bajando: por eso no hay que dar
    // la vuelta a la lista despues, y darsela era exactamente el fallo que se colo aqui.
    const porSemana = [];
    if (rango >= TRAMO_ACTIVIDAD.dias) {
      const altoMaximo = Math.min(TRAMO_ACTIVIDAD.hastaSemanas - 1, rango);
      for (let alto = altoMaximo; alto >= TRAMO_ACTIVIDAD.dias; alto -= 7) {
        const borde = Math.max(TRAMO_ACTIVIDAD.dias, alto - 6);
        const desde = atras(alto), hasta = atras(borde);
        porSemana.push({ grano: "semana", desde, hasta, etiqueta: "sem. " + diaMes(desde), n: suma(desde, hasta) });
        if (porSemana.length >= TRAMO_ACTIVIDAD.semanas) break;
      }
    }
    // Tramo 3: desde 400 dias atras, por mes natural. El dia 400 entra AQUI (y no en el tramo
    // semanal, que llega hasta el 399): si se quedara entre los dos, se perderia una respuesta por
    // el camino y el total de la grafica no cuadraria con el de los dias. Se conservan los ultimos
    // 60 meses y lo que se queda fuera se cuenta, no se tira en silencio.
    const porMes = [];
    let recortados = 0;
    if (rango >= TRAMO_ACTIVIDAD.hastaSemanas) {
      const meses = new Map();
      for (const [k, v] of porDia) {
        if (diasEntre(k, dia) < TRAMO_ACTIVIDAD.hastaSemanas) continue;
        const mes = k.slice(0, 7);
        meses.set(mes, (meses.get(mes) || 0) + v);
      }
      const claves = [...meses.keys()].sort();
      recortados = Math.max(0, claves.length - TRAMO_ACTIVIDAD.meses);
      for (const mes of claves.slice(-TRAMO_ACTIVIDAD.meses)) {
        porMes.push({ grano: "mes", desde: mes + "-01", hasta: mes + "-31", etiqueta: "mes " + mesDe(mes + "-01"), n: meses.get(mes) });
      }
    }

    const cubos = [...porMes, ...porSemana, ...porDiaCubos];
    const sumaCubos = cubos.reduce((s, c) => s + c.n, 0);
    const modo = porMes.length ? "dia+semana+mes" : porSemana.length ? "dia+semana" : "dia";
    const regla = `Hasta ${TRAMO_ACTIVIDAD.dias} días se cuenta por día; de ahí a ${TRAMO_ACTIVIDAD.hastaSemanas}, por semana; y más atrás, por mes.`;
    return {
      modo, cubos,
      porTramo: { dia: porDiaCubos.length, semana: porSemana.length, mes: porMes.length },
      raros, total, sumaCubos, recortados, regla,
      // La agrupacion que se ha usado, para poder enseñarla: `agruparActividad` hoy solo admite
      // «auto», que es exactamente esta regla, y cualquier otro valor cae aqui en vez de dejar la
      // vista sin agregacion. Que la preferencia se lea y se diga es lo que impide que sea decorativa.
      agrupar: op.agrupar === AGRUPAR_ACTIVIDAD ? op.agrupar : AGRUPAR_ACTIVIDAD,
    };
  }

  /**
   * «Como vas»: cuatro reglas explicitas con su umbral, y el numero de cada una a la vista. NI UN
   * MODELO ENTRENADO: cualquiera puede leer la regla, discutir el umbral y comprobar por que
   * salta, que es exactamente lo que no se puede hacer con una caja negra. Funcion pura.
   *
   * El dia 1 no dispara NADA, y no es cortesia: `diasSinActividad` seria tecnicamente infinito sin
   * una sola respuesta, y decirle a alguien que empieza que lleva una eternidad sin estudiar es
   * justo el mensaje que hay que evitar. Por eso las reglas 1, 3 y 4 exigen actividad anterior o
   * alguna ficha empezada, y la 2 exige un aplazo guardado, que tampoco existe el primer dia.
   *
   * @returns {{reglas:Array, senales:Array, hay:boolean, resumen:string, primerDia:boolean, ...}}
   */
  function riesgo(progreso, srs, P_, pref_, hoy, opciones) {
    const op = opciones && typeof opciones === "object" && !Array.isArray(opciones) ? opciones : {};
    const indice = P_ && typeof P_ === "object" && !Array.isArray(P_) ? P_ : {};
    const conceptos = indice.conceptos && typeof indice.conceptos === "object" && !Array.isArray(indice.conceptos) ? indice.conceptos : {};
    const registros = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso : {};
    const tarjetas = srs && typeof srs === "object" && !Array.isArray(srs) ? srs : {};
    const dias_ = op.dias && typeof op.dias === "object" && !Array.isArray(op.dias) ? op.dias : {};
    const historial = op.intentos && typeof op.intentos === "object" && !Array.isArray(op.intentos) ? op.intentos : {};
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const lista = ordenDe(indice);
    const enCurso = faseEnCurso((id) => estadoConcepto(registros, tarjetas, id, conceptos[id] || {}, dia), lista);
    const fase = (Array.isArray(indice.fases) ? indice.fases : []).find((f) => f.n === enCurso) || {};
    const nombreFase = typeof fase.id === "string" && fase.id ? fase.id.toUpperCase() : `F${enCurso}`;

    const ultimoDia = ultimoDiaConActividad(dias_, historial, dia);
    const diasSinActividad = ultimoDia ? diasEntre(ultimoDia, dia) : null;
    const hayActividadPrevia = !!ultimoDia;

    // Regla 1: dias sin responder nada.
    const dispara1 = hayActividadPrevia && diasSinActividad !== null && diasSinActividad >= 7;

    // Regla 2: aplazadas cuya fecha ya paso y que siguen sin estar hechas. Se lee el aplazo CRUDO
    // porque `leerAplazado` deja de verlo el mismo dia en que vence, que es justo el caso. Una
    // clave de `progreso` que no es de ninguna ficha del temario no cuenta: el informe es de las
    // 438 fichas, no de lo que alguien haya dejado escrito en el almacen.
    let vencidas = 0;
    for (const id of Object.keys(registros)) {
      if (!conceptos[id]) continue;
      const hasta = aplazoGuardado(registros[id]);
      if (!hasta || hasta > dia) continue;
      const est = estadoConcepto(registros, tarjetas, id, conceptos[id], dia);
      if (est.estadoSinAplazo !== "hecho" && est.estadoSinAplazo !== "dominado") vencidas++;
    }
    const dispara2 = vencidas >= 3;

    // Regla 3: fallos de los ultimos siete dias en la fase en curso. Se cuenta sobre el historial
    // de intentos, que es lo unico que trae la fecha de cada respuesta; `srs` solo tiene totales,
    // y con totales no se puede decir «en los ultimos siete dias».
    const desde7 = sumarDias(dia, -6);
    let res7 = 0, fallos7 = 0, mediasCurso = 0, empezadasCurso = 0, ultimoCurso = "";
    for (const clave of Object.keys(historial)) {
      const c = conceptos[String(clave).split("#")[0]];
      if (!c || c.f !== enCurso) continue;
      const suyos = historial[clave];
      if (!Array.isArray(suyos)) continue;
      for (const x of suyos) {
        if (!x || typeof x !== "object" || Array.isArray(x)) continue;
        const f = typeof x.fecha === "string" ? x.fecha : "";
        if (!esFechaISO(f) || f < desde7 || f > dia) continue;
        res7++;
        if (x.correcta !== true) fallos7++;
      }
    }
    const pctFallo = res7 ? Math.round((fallos7 / res7) * 100) : 0;
    const dispara3 = res7 > 0 && fallos7 * 100 >= 40 * res7;

    // Regla 4: la fase en curso parada, con fichas empezadas y ningun avance en 14 dias.
    for (const c of lista) {
      if (c.f !== enCurso) continue;
      const est = estadoConcepto(registros, tarjetas, c.id, conceptos[c.id] || c, dia);
      if (est.estadoSinAplazo === "a-medias") mediasCurso++;
      if (est.estadoSinAplazo !== "pendiente") empezadasCurso++;
      const av = ultimoAvance(registros, tarjetas, historial, c, dia);
      if (av > ultimoCurso) ultimoCurso = av;
    }
    const diasParada = ultimoCurso ? diasEntre(ultimoCurso, dia) : null;
    const dispara4 = empezadasCurso >= 1 && (diasParada === null || diasParada >= 14);

    const primerDia = !hayActividadPrevia && empezadasCurso === 0 && vencidas === 0;

    const detalle = {
      "sin-actividad": {
        dispara: dispara1, numero: diasSinActividad,
        dice: diasSinActividad === null ? "Todavía no has respondido nada." : `Llevas ${diasSinActividad} ${diasSinActividad === 1 ? "día" : "días"} sin responder nada.`,
        desactivar: "Se apaga con la primera pregunta que respondas. El día 1 no cuenta: sin ninguna respuesta anterior no hay señal.",
      },
      "aplazadas-vencidas": {
        dispara: dispara2, numero: vencidas,
        dice: `Tienes ${vencidas} ${vencidas === 1 ? "ficha aplazada" : "fichas aplazadas"} que ya vencieron y siguen sin estar hechas.`,
        desactivar: "Se apaga cuando queden menos de 3: quitándoles el aplazo o terminándolas.",
      },
      "fallo-reciente": {
        dispara: dispara3, numero: pctFallo,
        dice: res7 === 0 ? `En ${nombreFase} no has respondido nada en los últimos 7 días.`
          : `En ${nombreFase} has fallado ${fallos7} de ${res7} respuestas de los últimos 7 días (${pctFallo} %); puede que falte un prerrequisito.`,
        desactivar: "Se apaga cuando los fallos de los últimos 7 días bajen del 40 % de tus respuestas.",
      },
      "fase-parada": {
        dispara: dispara4, numero: diasParada,
        dice: diasParada === null
          ? `${nombreFase} no tiene ningún avance fechado y tiene ${mediasCurso} ${mediasCurso === 1 ? "ficha a medias" : "fichas a medias"}.`
          : `${nombreFase} lleva ${diasParada} ${diasParada === 1 ? "día" : "días"} parada con ${mediasCurso} ${mediasCurso === 1 ? "ficha a medias" : "fichas a medias"}.`,
        desactivar: "Se apaga en cuanto hagas algo en esa fase: leer una ficha, responder una pregunta o resolver una práctica.",
      },
    };
    const reglas = REGLAS_RIESGO.map((r) => ({ ...r, ...detalle[r.id] }));
    const senales = reglas.filter((r) => r.dispara);
    const resumen = senales.length === 0
      ? "Ninguna señal: sigue así."
      : `${senales.length} de las ${reglas.length} reglas están encendidas.`;
    return {
      reglas, senales, hay: senales.length > 0, resumen, primerDia,
      diasSinActividad, hayActividadPrevia, faseEnCurso: enCurso, nombreFase,
      vencidas, res7, fallos7, pctFallo, diasParada, mediasCurso, empezadasCurso,
    };
  }

  /**
   * Una fila por ficha, para poder mirar el informe fuera del portal: en una hoja de calculo, en R
   * o a mano. Funcion pura: devuelve los datos, no el fichero.
   *
   * La columna que importa es la ultima. Copiada de Open edX, distingue «no lo he intentado» de
   * «no puedo todavía», y esa diferencia evita que alguien lea «soy un desastre» cuando el
   * problema real es un prerrequisito del temario que nunca se cumple: son dos situaciones con
   * dos soluciones distintas, y una tabla que las junta miente.
   */
  function filasInforme(progreso, srs, P_, pref_, hoy, opciones) {
    const op = opciones && typeof opciones === "object" && !Array.isArray(opciones) ? opciones : {};
    const indice = P_ && typeof P_ === "object" && !Array.isArray(P_) ? P_ : {};
    const conceptos = indice.conceptos && typeof indice.conceptos === "object" && !Array.isArray(indice.conceptos) ? indice.conceptos : {};
    const registros = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso : {};
    const tarjetas = srs && typeof srs === "object" && !Array.isArray(srs) ? srs : {};
    const historial = op.intentos && typeof op.intentos === "object" && !Array.isArray(op.intentos) ? op.intentos : {};
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const columnas = ["id", "fase", "nivel", "estado", "requisitos_cumplidos", "preguntas_hechas", "preguntas_acertadas", "ultimo_intento", "ultima_visita", "ultimo_avance", "situacion"];
    const filas = [];
    const cuenta = { "no lo he intentado": 0, "no puedo todavía": 0, "en curso": 0, "terminada": 0 };
    for (const c of ordenDe(indice)) {
      const meta = conceptos[c.id] || c;
      const est = estadoConcepto(registros, tarjetas, c.id, meta, dia);
      const leido = leerLeido(registros[c.id]);
      // Un prerrequisito que no existe NO bloquea: no se le puede pedir a nadie que cumpla algo
      // que no está. Solo cuenta lo que existe y no se ha cumplido.
      const prereqs = estadoPrerequisitos(registros, meta, { srs: tarjetas, hoy: dia });
      const bloqueado = prereqs.some((x) => x.existe && !x.cumplido);
      const n = Number.isInteger(meta.q) && meta.q > 0 ? meta.q : 0;
      let ultimoIntento = "";
      for (let k = 0; k < n; k++) {
        const lista2 = historial[`${c.id}#${k}`];
        if (!Array.isArray(lista2) || !lista2.length) continue;
        const u = lista2[lista2.length - 1];
        const f = u && typeof u === "object" && !Array.isArray(u) && typeof u.fecha === "string" ? u.fecha : "";
        if (esFechaISO(f) && f > ultimoIntento) ultimoIntento = f;
      }
      const terminada = est.estadoSinAplazo === "hecho" || est.estadoSinAplazo === "dominado";
      const situacion = est.preguntasHechas > 0
        ? (terminada ? "terminada" : "en curso")
        : (bloqueado ? "no puedo todavía" : "no lo he intentado");
      cuenta[situacion]++;
      filas.push({
        id: c.id,
        fase: c.fid || `f${c.f}`,
        nivel: typeof meta.n === "string" ? meta.n : "",
        estado: est.estado,
        requisitos_cumplidos: `${est.cumplidos}/${est.total}`,
        preguntas_hechas: est.preguntasHechas,
        preguntas_acertadas: est.preguntasAcertadas,
        ultimo_intento: ultimoIntento,
        ultima_visita: leido ? diaDeMarca(leido.ts) : "",
        ultimo_avance: ultimoAvance(registros, tarjetas, historial, meta, dia),
        situacion,
      });
    }
    const resumen = {
      total: filas.length,
      noIntentadas: cuenta["no lo he intentado"],
      noPuedeTodavia: cuenta["no puedo todavía"],
      enCurso: cuenta["en curso"],
      terminadas: cuenta["terminada"],
      nota: "«no lo he intentado» y «no puedo todavía» no son lo mismo: la segunda dice que falta un prerrequisito del temario, y eso no se arregla estudiando más esta ficha.",
    };
    return { columnas, filas, resumen };
  }

  /**
   * El CSV de las filas del informe. Funcion pura.
   *
   * Las comas y las comillas se escapan de verdad: un titulo con coma, sin comillas, desplaza
   * todas las columnas de esa fila y el fichero deja de cuadrar en la hoja de calculo, que es
   * donde va a abrirse. Las lineas van con `\r\n`, que es lo que espera cualquier hoja de calculo.
   */
  function csvDeFilas(columnas, filas) {
    const celda = (v) => {
      const t = v === null || v === undefined ? "" : String(v);
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const cols = Array.isArray(columnas) && columnas.length ? columnas : Object.keys((Array.isArray(filas) && filas[0]) || {});
    const lineas = [cols.map(celda).join(",")];
    for (const f of (Array.isArray(filas) ? filas : [])) lineas.push(cols.map((c) => celda(f ? f[c] : "")).join(","));
    return lineas.join("\r\n") + "\r\n";
  }

  // ── Intentos: la nota que se enseña y el intervalo que se programa ────
  //
  // Estas dos cosas se parecen y no son lo mismo, y mezclarlas es el error clasico de
  // cualquier sistema de intentos:
  //
  //   · LA NOTA que se enseña es una politica. Se elige antes de empezar (`pref.cualCuenta`:
  //     la mejor, la ultima, la primera o la media) y sirve para decidir «¿como voy?».
  //   · EL INTERVALO del repaso espaciado sale SIEMPRE del ultimo intento. Repetir una
  //     pregunta hasta acertarla no es un evento de memoria: si el intervalo se calculara con
  //     el mejor intento, insistir inflaria los plazos, la pregunta volveria cada vez mas
  //     tarde y el repaso dejaria de servir justo donde mas hace falta.
  //
  // Por eso son dos funciones puras y separadas —`notaDe` e `intervaloDe`— y no una sola que
  // devuelva «el resultado»: una prueba tiene que poder demostrar que con los MISMOS intentos
  // `[fallo, acierto]` la nota es 1 con `cualCuenta: "mejor"` y el intervalo sigue siendo el
  // del fallo. Mientras las dos cuentas vivan en el mismo sitio, ese error puede volver.

  // Cuantos intentos se conservan por pregunta. El tope no es capricho: es lo que mantiene
  // `aprender.v1.intentos` lejos del limite de 1 MiB que la plataforma aplica a `PUT /api/progreso`.
  const TOPE_INTENTOS = 5;

  // Lo que se puede elegir en `pref.cualCuenta`, con el rotulo Y la explicacion en el mismo
  // sitio. Van juntos a proposito: son la misma decision contada dos veces, una para el boton
  // y otra para quien no sabe que significa «cuenta la mejor».
  const ROTULO_CUAL_CUENTA = {
    mejor: { rotulo: "La mejor", frase: "cuenta tu mejor respuesta a cada pregunta", ayuda: "Sirve para ver lo que ya sabes hacer, aunque algún día te salga mal. Es lo más parecido a «lo tengo aprendido»." },
    ultima: { rotulo: "La última", frase: "cuenta tu última respuesta a cada pregunta", ayuda: "Es lo que sabes hoy. Un fallo de esta mañana baja la nota aunque acertaras la semana pasada." },
    primera: { rotulo: "La primera", frase: "cuenta tu primera respuesta a cada pregunta", ayuda: "Es la foto de lo que sabías antes de estudiar, y por eso no se mueve por mucho que repitas." },
    media: { rotulo: "La media", frase: "cuenta la media de tus respuestas a cada pregunta", ayuda: "Puntúa cada respuesta igual, así que recoge también el camino: fallar y luego acertar da medio punto." },
  };
  const CUAL_CUENTA = ["mejor", "ultima", "primera", "media"];
  const CUAL_CUENTA_DEFECTO = "mejor";

  /**
   * Cual de los cuatro criterios esta activo. Un valor que no existe —una preferencia editada
   * a mano, un import de otro equipo— cae en el que hay por defecto en vez de dejar la nota
   * en blanco: una cifra que desaparece no se distingue de un cero.
   */
  function criterioCuenta(p) {
    const v = p && typeof p === "object" && !Array.isArray(p) ? p.cualCuenta : null;
    return CUAL_CUENTA.includes(v) ? v : CUAL_CUENTA_DEFECTO;
  }

  /**
   * Un intento guardado leido campo a campo, o `null` si no es ni un objeto.
   *
   * Se valida cada intento por separado porque esta clave se puede importar de otro equipo o
   * editar a mano, y un registro raro no puede tirar la vista ni, mucho menos, contar como
   * acierto. Dos decisiones que importan:
   *
   *   · Lo que no es un objeto se descarta. Un `null` o un numero en medio de la lista no es una
   *     respuesta: no lleva ni opcion ni resultado, y contarlo como fallo inventaria un intento.
   *   · Un intento que SI es un objeto pero no dice claramente que acerto se conserva y cuenta
   *     como fallo. Se queda en el historial porque existio, pero en caso de duda el portal no
   *     regala: un `correcta: "sí"` escrito a mano no vale como acierto.
   */
  function leerIntento(x) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const seg = Number(x.segundos);
    return {
      fecha: typeof x.fecha === "string" ? x.fecha : "",
      elegida: x.elegida ?? null,
      correcta: x.correcta === true,
      seguro: typeof x.seguro === "string" ? x.seguro : null,
      segundos: Number.isFinite(seg) && seg >= 0 ? Math.round(seg) : 0,
    };
  }

  /**
   * Los intentos guardados de una pregunta, del mas viejo al mas reciente.
   * Funcion pura y total: devuelve `[]` con cualquier entrada que no entienda.
   */
  function intentosDe(intentos, clave) {
    const fuente = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos[clave] : null;
    if (!Array.isArray(fuente)) return [];
    return fuente.map(leerIntento).filter(Boolean);
  }

  /** La nota de un intento, de 0 a 1. Se escribe una vez y la usan la media y la interfaz. */
  const gradoDeIntento = (i) => (i && i.correcta === true ? 1 : 0);

  /**
   * Cual de los intentos es el que MANDA para la nota: su indice dentro de la lista, o -1.
   *
   * Existe para que el resumen y la tabla del historial señalen la misma fila: dos sitios
   * eligiendo por su cuenta acabarian subrayando intentos distintos con la misma preferencia.
   * En caso de empate —dos aciertos y `mejor`— manda el PRIMERO que lo consiguio: es el que
   * demuestra que ya se sabia, y decir el ultimo seria contar la historia al reves.
   */
  function indiceQueCuenta(lista, cualCuenta) {
    const intentos_ = Array.isArray(lista) ? lista : [];
    if (!intentos_.length) return -1;
    const criterio = CUAL_CUENTA.includes(cualCuenta) ? cualCuenta : CUAL_CUENTA_DEFECTO;
    if (criterio === "primera") return 0;
    if (criterio === "ultima") return intentos_.length - 1;
    if (criterio === "mejor") return intentos_.reduce((mejor, x, i) => (gradoDeIntento(x) > gradoDeIntento(intentos_[mejor]) ? i : mejor), 0);
    return -1;   // la media no la encarna ningun intento concreto, y por eso no se subraya ninguno
  }

  /**
   * La nota que se enseña, segun la preferencia. Funcion pura.
   *
   * `null` cuando todavia no hay ningun intento, y eso NO es un cero: «no lo he intentado» y
   * «lo he hecho mal» son dos cosas distintas con dos soluciones distintas, y confundirlas es
   * lo que hace que una nota desanime.
   *
   * @param {Array} lista            intentos, del mas viejo al mas reciente
   * @param {string} cualCuenta      mejor · ultima · primera · media
   * @returns {number|null}          0..1, o null si no hay intentos
   */
  function notaDe(lista, cualCuenta) {
    const intentos_ = Array.isArray(lista) ? lista.map(leerIntento).filter(Boolean) : [];
    if (!intentos_.length) return null;
    const criterio = CUAL_CUENTA.includes(cualCuenta) ? cualCuenta : CUAL_CUENTA_DEFECTO;
    const grados = intentos_.map(gradoDeIntento);
    if (criterio === "mejor") return Math.max(...grados);
    if (criterio === "primera") return grados[0];
    if (criterio === "ultima") return grados[grados.length - 1];
    return grados.reduce((s, g) => s + g, 0) / grados.length;
  }

  /** La ultima respuesta, que es la unica que programa el repaso. `null` si no hay ninguna. */
  const ultimoIntento = (lista) => (Array.isArray(lista) && lista.length ? leerIntento(lista[lista.length - 1]) : null);

  /**
   * La calidad con la que un intento entra en SM-2, sobre la escala de siempre (0-5) y con el
   * suelo de 3 que separa «acierto» de «fallo». La seguridad declarada es opcional y por eso
   * `seguro` puede faltar: sin ella, un acierto vale 4 y un fallo vale 1, que es exactamente
   * lo que hacia este portal antes de que existiera el historial.
   *
   * La usan la programacion real y la simulacion de `intervaloDe`, y esa es la razon de que
   * este separada: dos sitios decidiendo la calidad por su cuenta acabarian dando dos repasos
   * distintos a la misma pregunta.
   */
  function calidadDe(acerto, seguro) {
    if (!acerto) return seguro === "bastante" || seguro === "mucho" ? 0 : 1;
    return seguro === "mucho" ? 5 : seguro === "poco" ? 3 : 4;
  }

  /**
   * El intervalo, en dias, que dejaria un intento segun SM-2. Funcion pura y SIMULACION: recibe
   * la tarjeta guardada, NO la toca, y devuelve lo que quedaria sin escribir nada. La tarjeta de
   * verdad la actualiza `programar`, que es el unico sitio que escribe.
   *
   * Existe para dos cosas. Una, que la calidad de un intento se decida en un solo sitio. Y dos,
   * la que sostiene esta fase: poder DEMOSTRAR, sin navegador, que con `[fallo, acierto]` y
   * `cualCuenta: "mejor"` la nota es 1 y el intervalo sale del ultimo intento —calidad 1, un
   * dia— y no del mejor, que daria seis. Esa es la prueba de que las dos cuentas no se mezclan.
   *
   * @param {object|null} tarjeta  {ef, iv, reps} tal como esta en `srs`, o nada si es nueva
   * @param {number} calidad       0..5, de `calidadDe`
   * @returns {{iv:number, reps:number, ef:number}}
   */
  function intervaloDe(tarjeta, calidad) {
    const t = tarjeta && typeof tarjeta === "object" && !Array.isArray(tarjeta) ? tarjeta : {};
    const q = Number(calidad);
    const calidadOk = Number.isFinite(q) ? Math.max(0, Math.min(5, Math.round(q))) : 1;
    const ef0 = Number.isFinite(Number(t.ef)) ? Number(t.ef) : 2.5;
    let reps = Number.isFinite(Number(t.reps)) && Number(t.reps) > 0 ? Math.floor(Number(t.reps)) : 0;
    let iv = Number.isFinite(Number(t.iv)) && Number(t.iv) > 0 ? Number(t.iv) : 0;
    // El corte esta en 3 y no en 2 a proposito, y es lo que hace que la seguridad declarada sirva
    // de algo: un acierto del que no se estaba seguro vale calidad 3 —«acierto a ciegas»— y vuelve
    // a un dia, mientras que un acierto normal (4) sigue su intervalo. Sin esto, decir «me lo he
    // jugado» no cambiaria el plazo y la pregunta de seguridad seria un adorno.
    if (calidadOk <= 3) { reps = 0; iv = 1; }
    else {
      reps += 1;
      iv = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(iv * ef0);
    }
    // El suelo de 1,3 no es decorativo: sin el, unos cuantos fallos seguidos dejarian el factor
    // por debajo de 1 y el intervalo se acortaria solo hasta desaparecer.
    const ef = Math.max(1.3, ef0 + (0.1 - (5 - calidadOk) * (0.08 + (5 - calidadOk) * 0.02)));
    return { iv, reps, ef };
  }

  /**
   * La politica de «cual cuenta» escrita para que se pueda leer ANTES de empezar y en el
   * mismo sitio en el que se responde. Funcion pura: recibe el rotulo para poder probarse sin
   * depender de las constantes del modulo.
   *
   * Dice las dos mitades a proposito. Enseñar solo la primera dejaria a la persona creyendo
   * que insistir hasta acertar alarga el repaso, y es justo lo contrario.
   */
  function politicaIntentos(cual, rotulos) {
    const tabla = rotulos && typeof rotulos === "object" ? rotulos : ROTULO_CUAL_CUENTA;
    const criterio = CUAL_CUENTA.includes(cual) ? cual : CUAL_CUENTA_DEFECTO;
    // `frase` ya empieza por «cuenta …» —se usa tambien a media frase, en la tabla de
    // `#/progreso`—, asi que aqui solo hay que ponerle la mayuscula: repetir el verbo delante
    // daba «Cuenta cuenta tu mejor respuesta».
    const frase = tabla[criterio].frase;
    const principio = frase.charAt(0).toUpperCase() + frase.slice(1);
    return `${principio}. El repaso espaciado, en cambio, se programa siempre con tu última respuesta: repetir una pregunta hasta acertarla no es acordarse de ella.`;
  }

  // ── Modos de respuesta, pistas y seguridad declarada (fase 7) ──────────
  //
  // Las cuatro piezas de esta fase —el modo, la pista, los reintentos y la seguridad— son
  // DECISIONES sobre datos que ya existen. Por eso viven aqui, como funciones puras: reciben lo
  // que hay y devuelven una conclusion, sin leer `localStorage`, sin tocar la pantalla y sin
  // mirar la fecha del sistema. Es lo que permite probarlas fuera del navegador y lo que hace
  // que una prueba siga sirviendo dentro de un año.

  // La sesion de repaso a medias vive en `sessionStorage`, no en `localStorage`, por un motivo
  // que no es de comodidad: veinte respuestas a ciegas sin entregar son un borrador de UNA
  // pestaña, no un dato de la persona. En `localStorage` sobrevivirian a cerrar el navegador y
  // aparecerian mañana como un examen empezado que ya nadie recuerda haber empezado.
  //
  // Los dos lectores avisan cuando el navegador no deja usarlo (modo privado, permisos) en vez de
  // fallar en silencio: el modo diferido PIERDE las respuestas si se recarga, y eso hay que decirlo
  // ANTES de empezar, no despues, con las veinte respuestas ya perdidas.
  let sesionFalla = false;
  const puedeGuardarSesion = () => {
    try { const s = window.sessionStorage; const k = "__prueba__"; s.setItem(k, "1"); s.removeItem(k); return true; }
    catch { return false; }
  };
  // Las dos claves se escriben LITERALES dentro de la llamada a `sessionStorage`, aunque arriba
  // exista `CLAVES.sesion`. No es duplicar por gusto: `plataforma/legal/_comprobar.mjs` cruza las
  // claves que el portal usa de verdad leyendo del codigo el nombre que aparece junto a
  // `sessionStorage.getItem/setItem`, y con una constante en medio ese cruce no veria nada y los
  // textos legales podrian quedarse mintiendo sin que la comprobacion se enterara.
  const leerSesion = () => {
    let pestaña = null, copia = null;
    try { pestaña = JSON.parse(sessionStorage.getItem("aprender.v1.sesion" + sufijoPerfil)); } catch { /* probar copia */ }
    try { copia = JSON.parse(localStorage.getItem(CLAVE_BORRADOR)); } catch { /* conservar pestaña */ }
    // Una pestaña restaurada puede traer una instantánea anterior a la copia persistente.
    // Los borradores antiguos sin fecha conservan la prioridad de pestaña que tenían.
    if (!pestaña) return copia;
    if (!copia) return pestaña;
    return (Number(copia.guardadoEn) || 0) > (Number(pestaña.guardadoEn) || 0) ? copia : pestaña;
  };
  const escribirSesion = (valor) => {
    try {
    const guardadoEn = Math.max(Date.now(), (Number(leerSesion()?.guardadoEn) || 0) + 1);
    const borrador = { ...valor, guardadoEn };
    sessionStorage.setItem("aprender.v1.sesion" + sufijoPerfil, JSON.stringify(borrador));
    // La copia es lo que hace que el borrador sobreviva a cerrar la pestaña.
    escribir(CLAVE_BORRADOR, borrador);
    sesionFalla = false; return true; }
    catch { sesionFalla = true; return false; }
  };
  const borrarSesion = () => { try { sessionStorage.removeItem("aprender.v1.sesion" + sufijoPerfil); try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* sin almacén */ } } catch { sesionFalla = true; } };

  // El modo de respuesta de la sesion, con su rotulo y su explicacion en el mismo sitio, por el
  // mismo motivo que `ROTULO_CUAL_CUENTA`: son la misma decision contada dos veces, una para el
  // boton y otra para quien no sabe que significa «diferida».
  const MODOS_RESPUESTA = ["inmediata", "diferida", "interactiva"];
  const MODO_RESPUESTA_DEFECTO = "inmediata";
  const ROTULO_MODO = {
    inmediata: {
      rotulo: "Inmediata",
      frase: "se corrige al pulsar",
      ayuda: "Pulsas una opción y el portal te dice en el momento si era esa, marca la correcta y te explica por qué. Es lo de siempre, y es lo que mejor enseña mientras se estudia.",
    },
    diferida: {
      rotulo: "Diferida",
      frase: "todo a ciegas hasta entregar",
      ayuda: "Respondes las preguntas de la sesión sin ver nada: ni acierto, ni explicación, ni cuál era la buena. Al entregar se corrige todo de una vez. Sirve para saber qué sabes de verdad, sin que la primera respuesta te chive las demás.",
    },
    interactiva: {
      rotulo: "Interactiva",
      frase: "reintentar con pista",
      ayuda: "Si fallas, no se te revela la respuesta: se marca la que elegiste como incorrecta y puedes probar otra vez, con una pista si la pides. Se agota al llegar al número de intentos (las pistas que pidas más uno, y nunca menos de tres).",
    },
  };

  // El modo que de verdad se va a usar. Un valor que no existe —una preferencia editada a mano,
  // un import de otro equipo— cae en la inmediata, que es el modo que NUNCA pierde una sesion
  // empezada: en diferido, un valor raro a mitad de examen borraria veinte respuestas a ciegas.
  function modoDe(p) {
    const v = p && typeof p === "object" && !Array.isArray(p) ? p.modoRespuesta : null;
    return MODOS_RESPUESTA.includes(v) ? v : MODO_RESPUESTA_DEFECTO;
  }

  /** Si se pregunta cuanto se esta seguro antes de corregir. Apagado por defecto: anadir preguntas
   *  a quien no las ha pedido es la forma mas rapida de que deje de responder. */
  const seguridadPedida = (p) => !!(p && typeof p === "object" && p.seguridadDeclarada === true);

  // Las tres respuestas posibles, con el porcentaje escrito y no solo el adjetivo: «bastante» sin
  // numero no significa lo mismo para dos personas, y aqui el numero decide la calidad del repaso.
  const SEGURIDADES = [
    { id: "poco", rotulo: "Poco seguro", detalle: "menos del 67 %", frase: "Poco seguro" },
    { id: "bastante", rotulo: "Bastante seguro", detalle: "más del 67 %", frase: "Bastante seguro" },
    { id: "mucho", rotulo: "Seguro del todo", detalle: "más del 80 %", frase: "Seguro del todo" },
  ];
  const SEGURIDAD_IDS = SEGURIDADES.map((s) => s.id);
  /** El rotulo de una seguridad guardada, o cadena vacia. Se lee en el historial y en el resumen. */
  const rotuloSeguridad = (id) => (SEGURIDADES.find((s) => s.id === id) || {}).rotulo || "";

  // ── La matriz de revision ──────────────────────────────────────────────
  // Cuatro momentos por ocho cosas, copiado de las opciones de revision de Moodle. Lo que
  // importa no es la tabla: son las DOS DEPENDENCIAS que la documentacion declara y que aqui se
  // imponen en el codigo. No se pueden confiar a la configuracion porque una combinacion
  // imposible no da un error: da una pantalla que enseña la respuesta correcta sin decir siquiera
  // que habia una pregunta, y eso no es una preferencia, es una contradiccion.
  const REVISION_ASPECTOS = [
    { id: "intento", rotulo: "Tu respuesta", exige: [] },
    { id: "acierto", rotulo: "Si acertaste", exige: ["intento"] },
    { id: "puntuacion", rotulo: "La puntuación máxima", exige: [] },
    { id: "nota", rotulo: "Tu nota", exige: ["puntuacion"] },
    { id: "realimentacion", rotulo: "La explicación de cada opción", exige: ["intento"] },
    { id: "general", rotulo: "La explicación general", exige: ["intento"] },
    { id: "correcta", rotulo: "La respuesta correcta", exige: ["intento"] },
    { id: "explicacion", rotulo: "Por qué esa es la buena", exige: ["intento"] },
  ];
  const REVISION_ETAPAS = ["durante", "entregar", "despues", "nunca"];
  /** El momento que se usa hoy: al entregar. Decidido aqui y no en cada llamada, para que la
   *  pantalla y la comprobacion hablen del mismo momento. */
  const REVISION_ETAPA_DEFECTO = "entregar";

  /** Una etapa con sentido, o la de por defecto. */
  const etapaDe = (v) => (REVISION_ETAPAS.includes(v) ? v : REVISION_ETAPA_DEFECTO);

  // Por que una combinacion es imposible, en una frase que se pueda enseñar. Dice QUE PASA y que
  // se ha hecho, no «error»: quien configuro «explicación» sin «intento» tiene que entender que
  // la explicacion habla de lo que el contesto, y que sin eso no se puede leer.
  function motivoDependencia(aspecto, falta) {
    const rotuloFalta = (REVISION_ASPECTOS.find((a) => a.id === falta) || {}).rotulo || falta;
    const porque = {
      intento: "la explicación y el acierto hablan de lo que contestaste, y sin tu respuesta delante no se entienden",
      puntuacion: "una nota sin saber sobre cuánto es una cifra que no significa nada",
    }[falta] || "depende de algo que no se muestra";
    return `Para mostrar «${aspecto.rotulo}» hay que mostrar «${rotuloFalta}»: ${porque}. Se ha activado.`;
  }

  /**
   * La matriz de revision corregida, con sus avisos. Funcion pura.
   *
   * Devuelve las ocho casillas resueltas y la lista de correcciones hechas, para que el portal
   * pueda decir en voz alta lo que ha cambiado en vez de obedecer a medias. Se aplica dos veces
   * —la primera correccion puede hacer falta para otra casilla— por si una cadena de
   * dependencias necesita mas de una pasada.
   */
  function revisionEfectiva(p) {
    const r = p && typeof p === "object" && !Array.isArray(p) ? p.revision : null;
    const bruto = {};
    for (const a of REVISION_ASPECTOS) {
      const guardado = r && typeof r === "object" && !Array.isArray(r) ? r[a.id] : null;
      const etapa = guardado && typeof guardado === "object" && !Array.isArray(guardado) ? guardado.etapa : guardado;
      bruto[a.id] = typeof etapa === "string" && REVISION_ETAPAS.includes(etapa) ? etapa : REVISION_ETAPA_DEFECTO;
    }
    const avisos = [];
    const aspectos = {};
    for (const a of REVISION_ASPECTOS) aspectos[a.id] = { ...a, etapa: bruto[a.id] };
    for (let pasada = 0; pasada < 2; pasada++) {
      for (const a of REVISION_ASPECTOS) {
        const casilla = aspectos[a.id];
        if (casilla.etapa === "nunca") continue;
        for (const necesita of a.exige) {
          const otro = aspectos[necesita];
          if (otro.etapa === "nunca") {
            otro.etapa = casilla.etapa;
            avisos.push({ aspecto: a.id, falta: necesita, texto: motivoDependencia(a, necesita) });
          } else if (REVISION_ETAPAS.indexOf(otro.etapa) > REVISION_ETAPAS.indexOf(casilla.etapa)) {
            // Mostrar algo mas tarde que aquello de lo que depende deja un hueco: se enseña a la
            // vez, y nunca despues de lo que lo explica.
            otro.etapa = casilla.etapa;
            avisos.push({ aspecto: a.id, falta: necesita, texto: motivoDependencia(a, necesita) });
          }
        }
      }
    }
    return { aspectos, avisos, corregida: avisos.length > 0 };
  }

  /**
   * Si una casilla se ve en un momento concreto. `etapa` es «durante», «entregar» o «despues»;
   * «nunca» no se ve en ninguno. Se calcula por orden de la lista, no por igualdad, porque
   * «después» incluye lo que se enseñó al entregar.
   */
  function revisionVisible(revision, aspecto, etapa) {
    const a = revision && revision.aspectos ? revision.aspectos[aspecto] : null;
    if (!a || !REVISION_ETAPAS.includes(a.etapa)) return false;
    if (a.etapa === "nunca") return false;
    return REVISION_ETAPAS.indexOf(a.etapa) <= REVISION_ETAPAS.indexOf(etapaDe(etapa));
  }

  /**
   * Cuantas pistas tiene una pregunta, contando la cascada. Funcion pura.
   *
   *   · el `pista:` de la propia pregunta, si lo lleva;
   *   · si no, la del `:::practica` de su ficha;
   *   · y si tampoco, su seccion «Errores tipicos».
   *
   * Devuelve la lista de escalones que existen, en orden. Nunca esta vacia en las 438 fichas
   * —todas tienen «Errores tipicos»— y ese es justo el motivo de que el modo interactivo pueda
   * existir hoy sin escribir 1173 pistas: un boton que a veces no hace nada es peor que no
   * tenerlo, y por eso el ultimo escalon es el que hace que el boton siempre haga algo.
   */
  function pistasDe(q, cont) {
    const escalones = [];
    const limpio = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
    const propia = limpio(q && q.pista);
    if (propia) escalones.push({ origen: "propia", texto: propia });
    // El primer problema practico CON pista, no el primero a secas: una ficha puede tener tres
    // problemas y solo el ultimo con pista, y el escalon existe si existe la pista.
    const practica = (Array.isArray(cont && cont.practicas) ? cont.practicas : [])
      .map((x) => limpio(x && x.pista)).find(Boolean);
    if (practica) escalones.push({ origen: "practica", texto: practica });
    const errores = limpio(cont && cont.errores);
    if (errores) escalones.push({ origen: "errores", texto: errores });
    return escalones;
  }

  /**
   * La pista que se enseña al pedir la numero `indice`, con su origen escrito.
   *
   * Se pide una y se enseña una: si se enseñaran todas de golpe, el escalon de «Errores
   * tipicos» saldria siempre y la pista propia —la que alguien se molesto en escribir para ESA
   * pregunta— no se distinguiria de un respaldo generico.
   */
  function pistaDe(q, cont, indice) {
    const escalones = pistasDe(q, cont);
    if (!escalones.length) return null;
    const n = Number.isInteger(indice) && indice >= 0 ? indice : 0;
    const elegido = escalones[Math.min(n, escalones.length - 1)];
    const deQuien = {
      propia: "Escrita para esta pregunta",
      practica: "Es la pista del problema práctico de esta ficha",
      errores: "No hay pista escrita para esta pregunta: esto es lo que la ficha avisa de los errores típicos",
    }[elegido.origen];
    return { origen: elegido.origen, texto: elegido.texto, deQuien, escalones: escalones.length };
  }

  /**
   * Cuantos intentos admite una pregunta segun las pistas que se hayan pedido, o `null` si no
   * hay tope. Es la regla de Moodle, tal cual: **pistas + uno, con un minimo de tres**.
   *
   *   · `pref.intentosMax` manda cuando es un numero positivo (1 en el examen a ciegas).
   *   · sin tope declarado: 1 + 0 pistas = 1, y el minimo lo sube a 3;
   *   · con dos pistas pedidas: 1 + 2 = 3, que ya llega al minimo;
   *   · con cuatro: 5, que es mas que el minimo y por eso manda la cuenta.
   *
   * Las pistas PEDIDAS, no las que existan: una pregunta de la que no se pide ninguna pista no
   * puede dar mas intentos que una en la que se pide, o bastaria con no pedirlas.
   */
  function intentosDisponibles(pistasPedidas, max) {
    const pistas = Number.isFinite(Number(pistasPedidas)) && Number(pistasPedidas) > 0 ? Math.floor(Number(pistasPedidas)) : 0;
    const tope = Number.isInteger(max) && max > 0 ? max : null;
    const porPistas = Math.max(3, pistas + 1);
    return tope === null ? porPistas : Math.min(tope, porPistas);
  }

  /**
   * El estado de los reintentos de una pregunta, paso a paso. Funcion pura y total.
   *
   * Existe por una regla que no se puede dejar a la interfaz: una vez acertada, la respuesta ya
   * no se cambia. Si se pudiera, el modo interactivo enseñaria a probar opciones hasta que una
   * suene, que es exactamente lo contrario de aprender.
   *
   * @returns {{intentos:number, max:number, disponibles:number, agotados:boolean, acertada:boolean, bloqueada:boolean}}
   */
  function estadoReintentos(e, accion, max) {
    const base = e && typeof e === "object" && !Array.isArray(e) ? e : {};
    const intentos = Number.isFinite(Number(base.intentos)) && Number(base.intentos) > 0 ? Math.floor(Number(base.intentos)) : 0;
    const pistasPedidas = Number.isFinite(Number(base.pistasPedidas)) && Number(base.pistasPedidas) > 0 ? Math.floor(Number(base.pistasPedidas)) : 0;
    const acertada = base.acertada === true;
    const tope = Number.isInteger(max) && max > 0 ? max : null;
    const permitidos = intentosDisponibles(pistasPedidas, tope);
    const bloqueada = acertada || intentos >= permitidos;
    if (accion === "pista") return { intentos, pistasPedidas: pistasPedidas + 1, acertada, max: permitidos, disponibles: Math.max(0, permitidos - intentos), agotados: intentos >= permitidos, bloqueada };
    if (accion === "acierto") {
      // Acertar dos veces no cuenta dos veces: la pregunta ya estaba resuelta y el segundo clic no
      // es un intento nuevo. Sin esta salida, un clic de mas contaria como repeticion y el
      // historial diria que hizo falta mas de lo que hizo falta.
      if (acertada) return { intentos, pistasPedidas, acertada: true, max: permitidos, disponibles: Math.max(0, permitidos - intentos), agotados: intentos >= permitidos, bloqueada: true };
      return { intentos: intentos + 1, pistasPedidas, acertada: true, max: permitidos, disponibles: Math.max(0, permitidos - (intentos + 1)), agotados: intentos + 1 >= permitidos, bloqueada: true };
    }
    // Una pregunta ya acertada no se puede volver a fallar: si se pudiera, el reintento serviria
    // para probar opciones hasta que una suene. La condicion no esta solo en la interfaz —que
    // ignora el clic— sino aqui, para que la regla se pueda demostrar sin navegador.
    if (accion === "fallo") {
      if (acertada) return { intentos, pistasPedidas, acertada, max: permitidos, disponibles: Math.max(0, permitidos - intentos), agotados: intentos >= permitidos, bloqueada: true };
      return { intentos: intentos + 1, pistasPedidas, acertada: false, max: permitidos, disponibles: Math.max(0, permitidos - (intentos + 1)), agotados: intentos + 1 >= permitidos, bloqueada: intentos + 1 >= permitidos };
    }
    return { intentos, pistasPedidas, acertada, max: permitidos, disponibles: Math.max(0, permitidos - intentos), agotados: intentos >= permitidos, bloqueada };
  }

  /**
   * Si una pregunta ya esta entregada de verdad en una sesion a ciegas.
   *
   * Se exige `correcta` booleana y no solo que exista la entrada: media respuesta —una opcion
   * elegida sin corregir— no es un intento, y contarla como uno programaria el repaso de algo
   * que no se ha respondido.
   */
  const respondida = (r) => !!(r && typeof r === "object" && !Array.isArray(r) && typeof r.correcta === "boolean");

  /** Cuantas respuestas de una sesion estan entregadas. Funcion pura, para poder contarlo sin
   *  depender de la pantalla. */
  function respuestasDe(respuestas) {
    const r = respuestas && typeof respuestas === "object" && !Array.isArray(respuestas) ? respuestas : {};
    return Object.keys(r).filter((k) => respondida(r[k])).length;
  }

  /**
   * La huella de la composicion de una cola. Existe para lo unico que hace peligroso guardar una
   * sesion a medias: las claves de pregunta son `id#n`, y si el temario cambia, «ficha#2» puede
   * pasar a ser otra pregunta. Diez respuestas a ciegas apuntadas a las preguntas equivocadas
   * serian peores que perderlas, asi que la sesion se ata a esta huella y se descarta si cambia.
   */
  function huellaCola(cola) {
    const lista = Array.isArray(cola) ? cola.filter((k) => typeof k === "string") : [];
    let h = 2166136261;
    for (const k of lista) {
      for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 31; h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16) + ":" + lista.length;
  }

  /**
   * Puntua una pregunta ya respondida. Funcion pura, y la que sostiene la decision escrita de
   * esta fase: **la nota que se enseña sale de `pref.cualCuenta` y la programacion del repaso
   * sale SIEMPRE del ultimo intento**.
   *
   * Las dos cifras salen juntas y de la misma llamada a proposito. Si cada una se calculara en su
   * sitio, la primera vez que alguien «arreglara» la nota para que usara el mejor intento, el
   * intervalo empezaria a calcularse con el mejor tambien, e insistir hasta acertar inflaria los
   * plazos hasta que el repaso dejaria de servir. Aqui eso no puede pasar sin que el caso 6 de
   * `_comprobar-quiz.mjs` se ponga en rojo.
   *
   * `null` en `mostrada` cuando no hay intentos, y eso NO es un cero.
   *
   * @param {Array} lista       intentos de esa pregunta, del mas viejo al mas reciente
   * @param {string} cualCuenta mejor · ultima · primera · media
   * @returns {{mostrada:number|null, criterio:string, intentos:number, ultimo:object|null,
   *            calidad:number|null, programacion:{calidad:number, iv:number, reps:number, ef:number}|null}}
   */
  function puntuar(lista, cualCuenta) {
    const intentos_ = Array.isArray(lista) ? lista.map(leerIntento).filter(Boolean) : [];
    const criterio = CUAL_CUENTA.includes(cualCuenta) ? cualCuenta : CUAL_CUENTA_DEFECTO;
    const mostrada = notaDe(intentos_, criterio);
    const ultimo = intentos_.length ? intentos_[intentos_.length - 1] : null;
    if (!ultimo) return { mostrada, criterio, intentos: 0, ultimo: null, calidad: null, programacion: null };
    const calidad = calidadDe(ultimo.correcta, ultimo.seguro);
    return { mostrada, criterio, intentos: intentos_.length, ultimo, calidad, programacion: intervaloDe(null, calidad) };
  }

  // El historial de intentos se guarda, pero es lo segundo que se mira: el estado ya se
  // puede calcular sin el. Aqui se recorta a los cinco ultimos en el momento de guardar,
  // que es donde hay que hacerlo: recortar al leer dejaria el fichero creciendo igual.
  function apuntarIntento(clave, intento) {
    const lista = Array.isArray(intentos[clave]) ? intentos[clave] : [];
    // T26 · El intento guarda lo que hace falta para interpretarlo: de qué revisión del contenido
    // salió, cuánta ayuda se pidió, cuánta confianza se declaró y con qué justificación. Sin esto,
    // un acierto con tres pistas no se distingue de uno a la primera.
    lista.push({
      fecha: typeof intento?.fecha === "string" ? intento.fecha : hoyISO(),
      elegida: intento?.elegida ?? null,
      correcta: intento?.correcta === true,
      seguro: intento?.seguro ?? null,
      segundos: Number.isFinite(intento?.segundos) ? intento.segundos : 0,
      revision: typeof intento?.revision === "string" ? intento.revision : "",
      ayuda: Number.isInteger(intento?.ayuda) && intento.ayuda > 0 ? intento.ayuda : 0,
      confianza: ["baja", "media", "alta"].includes(intento?.confianza) ? intento.confianza : null,
      justificacion: typeof intento?.justificacion === "string" ? intento.justificacion : "",
      estado: typeof intento?.estado === "string" ? intento.estado : null,
    });
    intentos[clave] = lista.slice(-TOPE_INTENTOS);
    escribir(CLAVES.intentos, intentos);
  }

  // ── Marcas que se ganan usando el portal, no pulsando un boton ────────
  const ahora = () => (typeof Date !== "undefined" && Date.now ? Date.now() : 0);
  const segundosEntre = (a, b) => Math.max(0, Math.min(600, Math.round((b - a) / 1000)));

  function marcarLeido(id, segundos) {
    const reg = progreso[id] && typeof progreso[id] === "object" && !Array.isArray(progreso[id]) ? progreso[id] : {};
    const antes = leerLeido(reg)?.segundos || 0;
    // Se guarda el maximo: una relectura corta no puede quitar lo que ya se habia cumplido.
    progreso[id] = { ...reg, leido: { ts: ahora(), segundos: Math.max(antes, Math.round(segundos)) } };
    escribir(CLAVES.progreso, progreso);
  }

  // R1 se comprueba al llegar al final del articulo, no al abrirlo: mirar el titulo y salir
  // no es haber leido la ficha. Se usan dos caminos porque ninguno funciona siempre: el
  // observador no existe en navegadores viejos, y el scroll no dispara si la ficha entera
  // cabe en pantalla (ahi el final ya esta a la vista, y se cumple de todas formas).
  let observadorLectura = null;
  let relojConcepto = null;

  function desconectarLectura() {
    pararVigilanciaLectura();   // el temporizador tambien se apaga al cambiar de ficha
    if (observadorLectura) { try { observadorLectura.disconnect(); } catch { /* ya estaba suelto */ } observadorLectura = null; }
    relojConcepto = null;
  }

  function marcarFichaLeida(id) {
    // Si mientras tanto se ha cambiado de ficha, esta marca ya no vale: el observador puede
    // dispararse justo despues de navegar y sellar la ficha anterior sin haberla leido.
    const abierta = rutaActual();
    if (abierta.vista !== "concepto" || abierta.arg !== id) { desconectarLectura(); return; }
    if (relojConcepto) marcarLeido(id, segundosEntre(relojConcepto, ahora()));
    else marcarLeido(id, minimoSegundos(P.conceptos[id]?.n));
    desconectarLectura();
    const sello = $("#sello-leido");
    if (sello) {
      sello.className = "sello-leido cumplido";
      sello.textContent = "✓ Leída";
    }
  }

  // Temporizador y oyente de visibilidad de la vigilancia de lectura. Viven fuera para que
  // `desconectarLectura` pueda apagarlos al navegar: un temporizador que sobrevive al cambio
  // de ficha marcaría la ficha anterior con el tiempo de la siguiente.
  let temporizadorLectura = null;
  let oyenteVisibilidad = null;

  function pararVigilanciaLectura() {
    if (temporizadorLectura) { clearInterval(temporizadorLectura); temporizadorLectura = null; }
    if (oyenteVisibilidad) { document.removeEventListener("visibilitychange", oyenteVisibilidad); oyenteVisibilidad = null; }
  }

  function vigilarLectura(id) {
    desconectarLectura();
    pararVigilanciaLectura();
    const art = $("#contenido-concepto");
    if (!art) return;

    const minimo = minimoSegundos(P.conceptos[id]?.n);   // segundos
    // Tiempo VISIBLE acumulado, no tiempo de pared: con la pestaña de fondo no se lee, y
    // contar ese rato sería regalar la marca. Además se reevalúa mientras el final siga a la
    // vista, porque el fallo de antes era exactamente este: si llegabas al final antes del
    // mínimo y te quedabas quieto, el observador no volvía a hablar, el tiempo pasaba y la
    // ficha no se marcaba nunca. Había que mover la página otra vez para que contara.
    let acumuladoMs = 0;
    let desde = document.visibilityState === "hidden" ? null : ahora();
    let finalVisible = false;
    let marcada = false;

    const cerrarTramo = () => { if (desde !== null) { acumuladoMs += ahora() - desde; desde = null; } };
    const abrirTramo = () => { if (desde === null && document.visibilityState !== "hidden") desde = ahora(); };
    const transcurridoMs = () => acumuladoMs + (desde !== null ? ahora() - desde : 0);

    const intentar = () => {
      if (marcada) return true;
      if (transcurridoMs() < minimo * 1000) return false;
      marcada = true;
      marcarFichaLeida(id);   // actualiza el progreso, el panel y el sello a la vez
      parar();
      return true;
    };

    const parar = () => {
      cerrarTramo();
      pararVigilanciaLectura();
      if (observadorLectura) { try { observadorLectura.disconnect(); } catch { /* ya estaba */ } observadorLectura = null; }
    };

    // La pestaña que se oculta deja de sumar en el acto; la que vuelve, reanuda. Y al volver
    // se reintenta, porque quizá ya se había cumplido el mínimo justo antes de ocultarla.
    // Al volver a la pestaña hay que RECALCULAR si el final está a la vista: al ocultarse, el
    // navegador puede dar el elemento por no intersectado, y como después no hay ningún
    // desplazamiento que vuelva a avisar, `finalVisible` se quedaría en falso para siempre y
    // el tiempo ya no contaría. Se mira la caja del elemento, que es la verdad del momento.
    const ultimoEl = art.lastElementChild || art;
    oyenteVisibilidad = () => {
      if (document.visibilityState === "hidden") { cerrarTramo(); return; }
      abrirTramo();
      const r = ultimoEl.getBoundingClientRect();
      finalVisible = r.top < window.innerHeight && r.bottom > 0;
      if (finalVisible) intentar();
    };
    document.addEventListener("visibilitychange", oyenteVisibilidad);

    if (typeof IntersectionObserver === "function") {
      observadorLectura = new IntersectionObserver((entradas) => {
        finalVisible = entradas.some((e) => e.isIntersecting);
        if (!finalVisible) { cerrarTramo(); return; }
        abrirTramo();
        intentar();
        // Mientras el final esté a la vista, se mira el reloj cada segundo. Es lo que hace que
        // quedarse quieto cuente: mirar solo al cambiar de intersección era el fallo.
        if (!marcada && !temporizadorLectura) {
          temporizadorLectura = setInterval(() => {
            if (document.visibilityState === "hidden") return;   // oculta no suma
            if (!finalVisible) { cerrarTramo(); return; }
            abrirTramo();
            intentar();
          }, 1000);
        }
      }, { threshold: 0.05 });
      observadorLectura.observe(art.lastElementChild || art);
      return;
    }

    // Sin IntersectionObserver (navegador viejo) no se puede saber si el final está a la
    // vista, así que se cuenta solo el tiempo de la pestaña visible y se comprueba al
    // desplazarse. Es peor que el observador, pero no miente: nunca marca de más.
    $("#principal")?.addEventListener("scroll", () => { abrirTramo(); intentar(); }, { passive: true });
    temporizadorLectura = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      abrirTramo();
      intentar();
    }, 1000);
  }

  // `campo` solo puede ser uno de estos tres. Antes era un parametro libre y una llamada con
  // un booleano escribia una clave «false» dentro de la marca: no rompia nada visible, pero
  // dejaba basura en el progreso y hacia que desmarcar no desmarcara. Con la lista cerrada,
  // ese fallo no puede volver. El valor lo pone quien llama: `true` para marcar, `false` para
  // desmarcar, que es un gesto legitimo y tiene que poder deshacerse.
  // T20 · `autoevaluacion` guarda CÓMO salió la práctica, no solo que se hizo. Es la declaración que
  // F03 exige para la práctica manual: la persona dice cómo le fue, no se finge corrección automática.
  const CAMPOS_PRACTICA = { resuelto: true, pista: true, solucion: true, autoevaluacion: true };

  function marcarPractica(id, k, campo, valor) {
    if (!CAMPOS_PRACTICA[campo]) return;
    const reg = progreso[id] && typeof progreso[id] === "object" && !Array.isArray(progreso[id]) ? progreso[id] : {};
    const marca = { ...(leerPractica(reg) || {}) };
    const actual = marca[String(k)] && typeof marca[String(k)] === "object" && !Array.isArray(marca[String(k)]) ? marca[String(k)] : {};
  // La autoevaluación es un TEXTO («me costó», «bien»), no un booleano: se guarda tal cual. El resto de
  // campos siguen siendo marcas de sí/no, donde `false` desmarca.
  marca[String(k)] = { ...actual, [campo]: typeof valor === "string" ? valor : valor !== false, ts: ahora() };
    progreso[id] = { ...reg, practica: marca };
    escribir(CLAVES.progreso, progreso);
  }

  function botonPractica(id, k, resuelto, autoevaluacion) {
    const auto = typeof autoevaluacion === "string" ? autoevaluacion : "";
    // «Cómo me salió» es la declaración de la práctica manual: tres opciones excluyentes, y se puede
    // cambiar o quitar (volver a pulsar la activa la desmarca).
    const comoMeSalio = `<span class="practica-auto">
        <span class="nota-pie">Cómo me salió:</span>
        ${[["bien", "Bien"], ["regular", "Regular"], ["mal", "Mal"]].map(([v, t]) =>
          `<button type="button" class="boton${auto === v ? " activo" : ""}" data-practica-autoevaluar="${v}" data-id="${id}" data-clave="${k}"
            aria-pressed="${auto === v ? "true" : "false"}">${t}</button>`).join("")}
      </span>`;
    return `<button type="button" class="boton practica-marcar ${resuelto ? "activo" : ""}" data-practica-marcar="${k}" data-id="${id}"
      aria-pressed="${resuelto ? "true" : "false"}">${resuelto ? "✓ Lo he resuelto yo" : "Lo he resuelto yo"}</button>${comoMeSalio}`;
  }

  // ── Guardar y quitar el aplazo ────────────────────────────────────────
  // Va en `progreso[id].aplazado`, dentro de la clave que ya existia, y no en una clave nueva: asi
  // el boton «Descargar mi progreso», el de borrar y el de cargar siguen valiendo sin tocarlos, y
  // los textos legales que ya nombran el aplazo no se quedan mintiendo.

  /**
   * Guarda el aplazo de una ficha sin tocar nada mas: lo leido, las preguntas respondidas, la
   * practica y la marca de dominado se quedan donde estaban.
   * @returns {{ok:boolean, aviso:string}} lo mismo que `aplazoValido`, para poder decir que falta
   */
  function aplazar(id, hasta, motivo) {
    const revision = aplazoValido(hasta, motivo, hoyISO());
    if (!revision.ok) return revision;
    const reg = progreso[id] && typeof progreso[id] === "object" && !Array.isArray(progreso[id]) ? progreso[id] : {};
    progreso[id] = { ...reg, aplazado: { hasta: revision.hasta, motivo: revision.motivo, ts: ahora() } };
    escribir(CLAVES.progreso, progreso);
    return revision;
  }

  /**
   * Quita el aplazo y nada mas. Se borra SOLO el campo `aplazado`: el historial —lo leido, los
   * intentos, la practica, la marca de dominado— sigue entero, que es lo que hace que adelantar
   * una ficha no cueste nada y se pueda hacer sin miedo a perder lo hecho.
   * @returns {boolean} si habia algo que quitar
   */
  function quitarAplazo(id) {
    const reg = progreso[id];
    if (!reg || typeof reg !== "object" || Array.isArray(reg) || !("aplazado" in reg)) return false;
    const copia = { ...reg };
    delete copia.aplazado;
    progreso[id] = copia;
    escribir(CLAVES.progreso, progreso);
    return true;
  }

  function botonDominado(id, juicio, motivo) {
    if (juicio) {
      return `<button type="button" class="boton activo" data-marcar="dominado" data-id="${id}">✓ Dominado</button>`;
    }
    // Deshabilitado de verdad, no escondido: se ve que existe, se ve por que no se puede
    // pulsar y se lee el motivo al lado. Esconderlo obligaria a adivinar que falta.
    return `<button type="button" class="boton" data-marcar="dominado" data-id="${id}" disabled
      title="${esc(motivo)}">Marcar como dominado</button>`;
  }

  // ── El bloque del aplazo, en sus dos estados ──────────────────────────
  // Es el mismo dato contado de dos maneras. Vigente: hasta cuando, por que, y sobre todo QUE NO
  // SE HA BORRADO, que es la duda que tiene cualquiera antes de aplazar algo. Sin aplazo: el
  // formulario, con la explicacion delante para no tener que fiarse.
  //
  // El formulario vive en los dos casos, dentro de un desplegable: cambiar la fecha es tan comun
  // como ponerla la primera vez, y un formulario abierto en medio de la ficha molesta a quien solo
  // ha venido a leer. El desplegable empieza cerrado y el atajo `p` lo abre.
  function bloqueAplazo(id, est) {
    const hoy = hoyISO();
    const vigente = est.aplazado;
    // El minimo es mañana: aplazar para hoy no aplaza nada, y el campo lo impide antes de enviar
    // para que nadie escriba un motivo y se encuentre el error despues.
    const minimo = sumarDias(hoy, 1);
    const propuesta = vigente ? vigente.hasta : sumarDias(hoy, 7);
    const cuenta = est.estadoSinAplazo === "pendiente" ? "" :
      ` En Mi progreso sigue contando como <strong>${esc(ESTADOS[est.estadoSinAplazo].rotulo.toLowerCase())}</strong>, que es lo que dicen tus hechos.`;
    return `
      ${vigente ? `<aside class="aplazo aplazo-vigente" id="aplazo-vigente">
        <p class="aplazo-titulo">Aplazada hasta el ${esc(vigente.hasta)} · ${esc(vuelveCuando(vigente.hasta, hoy))}</p>
        <p class="aplazo-motivo">Por qué: «${esc(vigente.motivo)}»</p>
        <p class="nota-pie">Mientras está aplazada no se pide: no aparece en la lista de lo pendiente ni en la cola
        de repaso. No se ha borrado nada.${cuenta} El ${esc(vigente.hasta)} vuelve sola, con lo que ya tuvieras hecho.</p>
        <p class="acciones-fila"><button type="button" class="boton" data-aplazo-quitar="${id}">Adelantarla: quitar el aplazo</button></p>
      </aside>` : ""}
      <details class="aplazo" id="aplazo-ficha">
        <summary>${vigente ? "Cambiar la fecha o el motivo del aplazo" : "Posponer esta ficha"}</summary>
        <form class="aplazo-form" id="form-aplazo" novalidate>
          <p class="nota-pie">Aplazar no borra nada y no baja ninguna nota: la ficha deja de pedirse —ni en lo
          pendiente ni en la cola de repaso— hasta el día que elijas, y ese día vuelve sola con lo que ya tuvieras
          hecho. El motivo se guarda en este equipo, contigo, para que dentro de un mes sepas qué pasó.</p>
          <p class="campo">
            <label for="aplazo-hasta">Volver a ella el día</label>
            <input type="date" id="aplazo-hasta" name="aplazo-hasta" min="${minimo}" value="${esc(propuesta)}">
          </p>
          <p class="campo">
            <label for="aplazo-motivo">Por qué la aplazas <span class="campo-ayuda">(una línea: es lo que te lo explicará dentro de un mes)</span></label>
            <input type="text" id="aplazo-motivo" name="aplazo-motivo" maxlength="${MOTIVO_MAX}" autocomplete="off"
              value="${vigente ? esc(vigente.motivo) : ""}" placeholder="Esta semana estoy con el proyecto del trabajo">
          </p>
          <p class="formulario-error" id="aplazo-error" role="alert" hidden></p>
          <p class="formulario-acciones"><button type="submit" class="boton-principal">${vigente ? "Guardar el aplazo nuevo" : "Aplazar hasta esa fecha"}</button></p>
        </form>
      </details>`;
  }

  // El bloque corto de `#/progreso`. Existe por la mitad de la regla de Moodle que se copia: la
  // excepcion sustituye a la regla general para esa ficha, pero NO la borra del informe. Sin este
  // bloque, aplazar pareceria hacer desaparecer trabajo, que es justo la mentira que hay que evitar.
  function bloqueAplazadas() {
    const hoy = hoyISO();
    const lista = aplazadasVigentes(progreso, hoy);
    if (!lista.length) {
      return `<p class="nota-pie">Ninguna ficha aplazada. Aplazar es para cuando la vida se pone en medio: la ficha
      deja de pedirse hasta el día que elijas, ese día vuelve sola y mientras tanto no se borra nada. Se hace con
      el botón «Posponer esta ficha», dentro de cada ficha.</p>`;
    }
    // Una sola pasada: de cada aplazada salen su fila y su parte del recuento, y el estado se
    // calcula una vez. El recuento es lo que demuestra que el aplazo no borra nada: la ficha
    // sigue sumando donde le toca.
    const filas = [];
    const cuentan = {};
    for (const a of lista) {
      const c = P.conceptos[a.id] || {};
      const est = estadoConcepto(progreso, srs, a.id, c, hoy);
      cuentan[est.estadoSinAplazo] = (cuentan[est.estadoSinAplazo] || 0) + 1;
      filas.push(`<tr>
        <td><a href="#/c/${a.id}">${esc(c.t || a.id)}</a></td>
        <td>${esc(a.hasta)}<br><span class="nota-pie">${esc(vuelveCuando(a.hasta, hoy))}</span></td>
        <td>${esc(a.motivo)}</td>
        <td>${esc(ESTADOS[est.estadoSinAplazo].rotulo)}</td>
        <td><button type="button" class="boton" data-aplazo-quitar="${a.id}">Quitar el aplazo</button></td>
      </tr>`);
    }
    const reparto = Object.entries(cuentan).map(([k, n]) => `${n} ${ESTADOS[k].rotulo.toLowerCase()}`).join(", ");
    // Todo el bloque en un solo elemento con identificador: la comprobacion de la interfaz tiene
    // que poder mirarlo entero sin adivinar cual de los dos hijos es el resumen.
    return `<div id="aplazadas">
    <p class="nota-pie">${lista.length === 1 ? "1 ficha aplazada" : lista.length + " fichas aplazadas"}.
    No desaparecen del informe: siguen contando con el estado que les toca por tus hechos (${esc(reparto)}).
    El día que vence cada una vuelve sola a lo pendiente, con su historial intacto.</p>
    <div class="tabla-envoltorio"><table>
      <thead><tr><th>Ficha</th><th>Vuelve</th><th>Por qué</th><th>Cuenta como</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    </div>`;
  }

  // ── Repaso espaciado (SM-2 simplificado) ──────────────────────────────
  // Cada pregunta es una tarjeta. La calidad sale de `calidadDe`, que mira el acierto y la
  // seguridad declarada; la tarjeta se actualiza AQUI, en el unico sitio que la toca.
  //
  // Lo que NO entra aqui es `pref.cualCuenta`: la nota que se enseña es una politica, el
  // intervalo es un hecho, y el intento que lo produce es el ULTIMO, siempre. Si esta funcion
  // mirara la preferencia, insistir hasta acertar alargaria el repaso y dejaria de servir.
  function programar(clave, acerto, seguro) {
    const t = srs[clave] || { ef: 2.5, iv: 0, reps: 0, aciertos: 0, fallos: 0 };
    const calidad = calidadDe(acerto, seguro);
    // El intervalo lo calcula `intervaloDe`, que es la MISMA cuenta que se usa para poder
    // demostrar sin navegador lo que va a pasar. Antes esta funcion tenia su propia copia con el
    // corte en 3 en vez de en 3 incluido, y las dos se separaron sin que nadie lo notara: la
    // simulacion decia una cosa y la programacion real hacia otra. El caso 5 de
    // `_comprobar-quiz.mjs` es lo que impide que vuelvan a separarse.
    const siguiente = intervaloDe(t, calidad);
    t.reps = siguiente.reps;
    t.iv = siguiente.iv;
    t.ef = siguiente.ef;
    t.venc = sumarDias(hoyISO(), t.iv);
    t.ultimo = hoyISO();
    if (acerto) t.aciertos++; else t.fallos++;

    // ── Días distintos con acierto (contrato F01) ─────────────────────────
    // `reps` cuenta REPETICIONES, no días. Con solo `reps`, tres aciertos seguidos en la misma
    // sesión declaraban la pregunta consolidada sin que hubiera pasado un día, que es lo
    // contrario de lo que esa palabra significa. `dias` es el conjunto de fechas LOCALES en las
    // que hubo acierto: se guarda una vez por fecha, y es lo que mide la retención.
    if (acerto) {
      if (!Array.isArray(t.dias)) t.dias = [];
      const hoy = hoyISO();
      if (!t.dias.includes(hoy)) {
        t.dias.push(hoy);
        // El conjunto se mantiene ordenado y acotado: solo hacen falta los últimos 60 días para
        // decidir si está consolidada, y así no crece sin fin en un almacén pequeño.
        t.dias.sort();
        if (t.dias.length > 60) t.dias = t.dias.slice(-60);
      }
      // Dos aciertos del mismo día no alargan el intervalo dos veces: si ya había un acierto
      // hoy, el vencimiento se queda donde estaba en vez de volver a multiplicarse.
      if (t.dias.length < 2 || t.dias[t.dias.length - 2] !== hoy) {
        t.venc = sumarDias(hoy, t.iv);
      }
    }

    srs[clave] = t;
    escribir(CLAVES.srs, srs);
    anotarRespuesta();
    return { calidad, reps: t.reps, iv: t.iv, ef: t.ef, venc: t.venc, dias: Array.isArray(t.dias) ? t.dias.length : 0 };
  }
  /**
   * Las claves de repaso de un concepto, calculadas SOLO con el indice del portal.
   *
   * Existe por un fallo real y dificil de ver: la cola de repaso se calculaba con
   * `contenidoDe(id).quizzes`, que necesita el fichero de la fase ya cargado, y el fichero se
   * cargaba... a partir de la cola. Resultado: cero preguntas vencidas en las 438 fichas, porque
   * no habia ninguna que cargar. El indice (`q`, el numero de preguntas de cada ficha) lo tiene el
   * portal desde el primer segundo, asi que la cola se puede calcular sin cargar nada: se cargan
   * los ficheros DESPUES, solo para pintar los enunciados.
   *
   * El numero de preguntas del indice y el del contenido los mantiene el mismo generador, y
   * `_comprobar-finalizacion.mjs` ya comprueba que cuadran.
   */
  function clavesDeConcepto(id) {
    const c = P.conceptos[id];
    const n = c && Number.isInteger(c.q) && c.q > 0 ? c.q : 0;
    return Array.from({ length: n }, (_, k) => `${id}#${k}`);
  }
  // Funcion declarada y no flecha por un motivo de las pruebas: los `_comprobar-*.mjs` sacan estas
  // piezas de `app.js` emparejando llaves, y una funcion flecha de una sola linea no se puede
  // extraer asi. Devolver el mismo array que el contenido es lo que hay que poder demostrar.
  function tarjetasDe(id) { return clavesDeConcepto(id); }

  function repasoPendiente(hoy) {
    const dia = esFechaISO(hoy) ? hoy : hoyISO();
    const vencidas = [], nuevas = [];
    for (const c of orden) {
      if (!progreso[c.id]?.visto) continue;   // primero se lee, luego se repasa
      // Una ficha aplazada no se pide hasta el dia que vence, y esto es la valvula de escape
      // entera: si sus preguntas siguieran en la cola, aplazar no serviria de nada. Lo que NO se
      // hace es tocar `srs`: el estado de cada pregunta se queda donde estaba, asi que el dia que
      // vuelve, vuelve con su intervalo, sus aciertos y sus fallos intactos.
      if (leerAplazado(progreso[c.id], dia)) continue;
      for (const clave of tarjetasDe(c.id)) {
        const t = srs[clave];
        if (!t) nuevas.push(clave);
        else if (t.venc <= dia) vencidas.push(clave);
      }
    }
    // `aplazadas` no es un adorno: si la cola encoge porque se aplazo algo, hay que poder decirlo.
    // Un recuento que baja solo se lee como «voy bien», y eso si seria mentir.
    return { vencidas, nuevas, aplazadas: aplazadasVigentes(progreso, dia) };
  }

  // ── Utilidades de vista ───────────────────────────────────────────────
  const pastillaNivel = (n) => `<span class="pastilla nivel-${n}">${esc(n)}</span>`;
  const pastillasRutas = (rutas) => rutas.map((r) => `<a class="pastilla ruta" href="#/ruta/${r}">${esc(P.rutas[r]?.sigla || "")} ${esc(P.rutas[r]?.nombre || r)}</a>`).join("");

  function tituloFase(n) { const f = P.fases.find((x) => x.n === n); return f ? `Fase ${f.n} · ${f.corto}` : `Fase ${n}`; }

  function listaConceptos(ids) {
    if (!ids.length) return `<p class="nota-pie">No hay conceptos que cumplan ese filtro.</p>`;
    return `<ul class="lista-conceptos">` + ids.map((id) => {
      const c = P.conceptos[id];
      const preguntas = c.q ? `${c.q} preguntas` : "";
      // El estado sale de `estadoConcepto` y no de `progreso[id].visto`, que es lo que había
      // antes: un clic en «marcar como visto» no es progreso, y la lista lo estaba contando
      // como si lo fuera. Ahora la pastilla dice lo mismo que la ficha, aplazo incluido.
      return `<li><span class="indice">${c.f}</span><div class="concepto-cuerpo"><a class="titulo" href="#/c/${id}">${esc(c.t)}</a>
        <span class="resumen">${esc(c.s)}</span>
        <span class="etiquetas">${pastillaNivel(c.n)}${preguntas ? `<span class="pastilla">${preguntas}</span>` : ""}${c.pr ? `<span class="pastilla">${c.pr} problema${c.pr > 1 ? "s" : ""} práctico${c.pr > 1 ? "s" : ""}</span>` : ""}${c.v ? `<span class="pastilla">${c.v} ejemplos verificados</span>` : ""}</span></div>
        ${pastillaEstadoDesde(id, estadoDe(id))}</li>`;
    }).join("") + `</ul>`;
  }

  // ── Vistas ────────────────────────────────────────────────────────────
  const vistas = {};

  // ── Preferencias que se eligen desde la ficha ─────────────────────────
  // Las dos viven dentro de `aprender.v1.pref`, que ya existia: no hay clave nueva, asi que los
  // textos legales y el boton de borrar siguen valiendo sin tocarlos.

  /** Enciende o apaga el aviso de prerrequisitos. Apagarlo no cambia ningun estado: solo la voz. */
  function fijarAvisoPrerequisitos(encendido) {
    pref.avisarPrerequisitos = encendido !== false;
    escribir(CLAVES.pref, pref);
  }

  /** Cual es la ruta que sigue la recomendacion. Sin ruta, la recomendacion mira el temario entero. */
  function fijarRutaActiva(clave) {
    pref.rutaActiva = typeof clave === "string" && P.rutas[clave] ? clave : "";
    escribir(CLAVES.pref, pref);
  }

  // ── Los prerrequisitos, contados en la ficha ──────────────────────────
  // Tres piezas que se pintan juntas: la lista con el estado de cada uno, el aviso de lo que
  // falta con su enlace, y la salida para apagar el aviso. Ninguna de las tres cierra nada.

  function listaPrerequisitos(id) {
    const lista = estadoPrerequisitos(progreso, P.conceptos[id], { srs, hoy: hoyISO() });
    if (!lista.length) return "";
    const faltan = lista.filter((x) => x.existe && !x.cumplido).length;
    const filas = lista.map((x) => {
      // El color y la regla lateral agrupan los estados en dos familias —cumplido y pendiente—
      // en vez de dar un tono distinto a cada uno: cuatro colores serian una leyenda que hay
      // que aprenderse, y con dos se ve de un vistazo si falta algo.
      const familia = x.cumplido ? "cumplido" : x.estado === "a-medias" ? "a-medias" : x.estado === "aplazado" ? "aplazado" : "pendiente";
      return `
      <li class="prereq prereq-${esc(familia)}${x.existe ? "" : " prereq-inexistente"}">
        <span class="prereq-simbolo" aria-hidden="true">${esc(x.simbolo)}</span>
        <a class="prereq-titulo" href="#/c/${esc(x.id)}">${esc(x.titulo)}</a>
        <span class="prereq-detalle">— ${esc(x.detalle)}</span>
      </li>`;
    }).join("");
    return `<section class="prerequisitos" id="prerequisitos">
      <p class="prereq-cabecera">Antes de este: ${lista.length - faltan} de ${lista.length} ${lista.length === 1 ? "prerrequisito cumplido" : "prerrequisitos cumplidos"}</p>
      <ul class="prereq-lista">${filas}</ul>
    </section>`;
  }

  function cajaAvisoPrerequisitos(id) {
    if (!avisarPrerequisitos()) {
      return `<p class="nota-pie" id="aviso-prereq-apagado">El aviso de prerrequisitos está apagado. No bloquea nada,
      así que no cambia nada más: la lista de arriba sigue diciendo en qué estado está cada uno.
      <button type="button" class="boton-enlace" data-aviso-prereq="si">Volver a encenderlo</button></p>`;
    }
    const a = avisoPrerequisitos(progreso, P.conceptos[id], { srs, hoy: hoyISO() });
    if (!a.hay) return "";
    const enlaces = a.faltan.map((x) => `<a class="enlace-interno" href="#/c/${esc(x.id)}">${esc(x.titulo)}</a>`).join(" · ");
    return `<details class="aviso aviso-aviso aviso-plegable" id="aviso-prerequisitos">
      <summary class="aviso-titulo">Falta un prerrequisito, y no cierra nada</summary>
      <div>
        <p>${esc(a.texto)}</p>
        <p class="acciones-fila">${enlaces}</p>
        <p class="nota-pie">Este aviso solo informa: la ficha está entera, se puede leer y se puede trabajar.
        <button type="button" class="boton-enlace" data-aviso-prereq="no">Apagarlo</button></p>
      </div>
    </details>`;
  }

  // ── La recomendacion, en la portada ───────────────────────────────────
  // El grafo deja de ser decoracion: aqui decide el siguiente concepto. Se enseña el motivo y,
  // si el motivo es que falta algo, se dice cuanto, en vez de dejar la portada sin propuesta.
  function bloqueRecomendacion() {
    const r = recomendacion();
    if (!r.id) {
      return `<p class="nota-pie" id="recomendacion">Nada que recomendar: ${esc(r.motivo)}.</p>`;
    }
    const c = P.conceptos[r.id];
    return `<div id="recomendacion">
      <p><a class="boton primario" href="#/c/${esc(r.id)}">▶ Siguiente: <strong>${esc(r.titulo)}</strong></a>
      <span class="nota-pie">Fase ${c.f} · ${esc(c.n)} · ${c.q ? c.q + " preguntas" : "sin preguntas"}</span></p>
      <p class="nota-pie">${esc(r.motivo)}.</p>
      ${r.aviso ? `<p class="nota-pie aviso-ciclo">${esc(r.aviso)}</p>` : ""}
      <p class="nota-pie">No es una nota ni una puerta: puedes abrir cualquier otra ficha cuando quieras.</p>
    </div>`;
  }

  // ── El bloque «Hoy» y la vista #/pendientes ───────────────────────────
  //
  // La misma lista en los dos sitios, pintada con las mismas piezas: si la portada y la vista
  // propia dijeran cifras distintas habría dos listas en el mismo portal y ninguna sería la
  // buena. Lo que cambia es cuánto se enseña. En la portada, las filas y nada más, porque la
  // portada se mira de paso; en `#/pendientes`, además, el filtro por motivo, el tope de filas y
  // las acciones de cada fila —posponer, adelantar—, que es a lo que se viene a esa página.
  //
  // Ni una fila se pinta sin motivo ni sin tiempo. Una lista de títulos sin decir por qué están
  // ahí obliga a abrirlos uno a uno, que es justo lo que esta funcionalidad viene a evitar.

  /**
   * Una fila: qué es, por qué está ahí, cuánto cuesta y el enlace que la abre. Las cuatro cosas
   * que pide la especificación, y en ese orden, porque así es como se lee.
   */
  function filaPendienteHtml(f, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const acciones = [];
    if (f.grupo === "aplazado") {
      acciones.push(`<button type="button" class="boton" data-aplazo-quitar="${esc(f.id)}">Ya puedo con ella: quitar el aplazo</button>`);
    }
    // Posponer desde la propia fila. Va dentro de un desplegable para que la lista siga siendo
    // una lista: un formulario abierto por fila convertiría esto en un formulario con filas.
    if (op.posponer && f.id) {
      const minimo = sumarDias(hoyISO(), 1);
      acciones.push(`<details class="pendiente-aplazo">
        <summary>Posponer esta ficha</summary>
        <form data-aplazo-fila="${esc(f.id)}" novalidate>
          <p class="campo"><label for="hasta-${esc(f.id)}">Volver a ella el día</label>
            <input type="date" id="hasta-${esc(f.id)}" name="hasta" min="${esc(minimo)}" value="${esc(sumarDias(hoyISO(), 7))}"></p>
          <p class="campo"><label for="motivo-${esc(f.id)}">Por qué la aplazas <span class="campo-ayuda">(una línea)</span></label>
            <input type="text" id="motivo-${esc(f.id)}" name="motivo" maxlength="${MOTIVO_MAX}" autocomplete="off" placeholder="Esta semana estoy con el proyecto del trabajo"></p>
          <p class="formulario-error" role="alert" hidden></p>
          <p class="formulario-acciones"><button type="submit" class="boton">Aplazarla hasta esa fecha</button></p>
        </form>
      </details>`);
    }
    // El motivo guardado del aplazo se enseña entero en la vista propia: es lo que dentro de un
    // mes explicará por qué esta ficha se pospuso, y recortarlo aquí lo haría inútil.
    const nota = op.posponer && f.grupo === "aplazado" && f.aplazoMotivo ? `<span class="pendiente-nota">Lo escribiste así: «${esc(f.aplazoMotivo)}»</span>` : "";
    return `<li class="pendiente pendiente-${esc(f.grupo)}" data-pendiente="${esc(f.grupo)}"${f.id ? ` data-id="${esc(f.id)}"` : ""}${op.idRecomendacion && f.grupo === "nuevo" ? ' id="recomendacion"' : ""}>
      <a class="pendiente-titulo" data-pendiente-fila href="${esc(f.enlace)}">${esc(f.titulo)}</a>
      ${op.marcaSeguir && f.id === op.marcaSeguir ? '<span class="pendiente-marca">Seguir donde lo dejaste</span>' : ""}
      <span class="pendiente-motivo">${esc(f.motivo)}</span>
      <span class="pendiente-tiempo">${esc(duracion(f.minutos))}</span>
      ${nota}
      ${acciones.length ? `<div class="acciones-fila pendiente-acciones">${acciones.join("")}</div>` : ""}
    </li>`;
  }

  /**
   * Las filas agrupadas por su grupo, con la etiqueta de cada grupo delante. La etiqueta lleva su
   * número porque el orden de la lista ES la funcionalidad: enseñarlo es lo que permite discutirlo
   * y comprobar que se cumple.
   */
  function listaPendienteHtml(r, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const pie = [];
    if (!op.propia && r.fuera) pie.push(`<p class="nota-pie" id="pendientes-fuera">Y ${r.fuera} más, por el mismo orden${r.minutosFuera ? ` (${duracion(r.minutosFuera)})` : ""}: <a href="#/pendientes">ver la lista entera, con filtro</a>.</p>`);
    else if (op.propia && r.fuera) pie.push(`<p class="nota-pie" id="pendientes-fuera">Y ${r.fuera} más, por el mismo orden${r.minutosFuera ? ` (${duracion(r.minutosFuera)})` : ""}. Sube el tope de filas para verlas.</p>`);
    if (r.raros) pie.push(`<p class="nota-pie" id="pendientes-raros">${plural(r.raros, "dato raro ignorado", "datos raros ignorados")}: no se ha borrado nada, pero no se han podido leer y no cuentan en esta lista.</p>`);
    if (r.vacia) return `<p class="pendientes-vacio" id="pendientes-vacio">${esc(r.mensajeVacio)}</p>${pie.join("")}`;
    let html = "";
    for (const grupo of GRUPOS_PENDIENTES) {
      const delGrupo = r.filas.filter((f) => f.grupo === grupo);
      if (!delGrupo.length) continue;
      html += `<p class="pendientes-grupo">${esc(ROTULO_GRUPO[grupo])}</p>
        <ul class="pendientes-filas">${delGrupo.map((f) => filaPendienteHtml(f, op)).join("")}</ul>`;
    }
    return html + pie.join("");
  }

  // Sin conexión y con la capa de plataforma puesta: la lista se calcula igual en local, así que
  // lo único que hay que decir es que lo que se ve es lo de este equipo. Ni un error ni un
  // esqueleto de carga: esta es la primera pantalla que se abre y no puede quedarse esperando.
  function avisoSinConexion() {
    if (!hayPlataforma() || !sesionConsultada || sesion) return "";
    return `<p class="nota-pie" id="aviso-sin-conexion">Sin conexión con tu cuenta, así que lo que ves es lo de este equipo.</p>`;
  }

  /** El bloque «Hoy» de la portada. Es lo primero que se lee, así que va antes que todo lo demás. */
  function bloqueHoy() {
    const hoy = hoyISO();
    const r = pendientesAhora(hoy);
    const hechasHoy = typeof dias[hoy] === "number" && Number.isFinite(dias[hoy]) && dias[hoy] > 0 ? dias[hoy] : 0;
    const objetivo = Number.isInteger(pref.objetivoDia) && pref.objetivoDia > 0 ? pref.objetivoDia : 20;
    const seguir = ultimo && P.conceptos[ultimo] ? P.conceptos[ultimo] : null;
    // El «seguir donde lo dejaste» no se pone el primero de la lista aunque sea lo último que se
    // abrió: subirlo por delante del repaso vencido rompería el orden que la propia lista enseña
    // en la pantalla, y el orden es la funcionalidad. Cuando la ficha está en la lista, se marca
    // ahí mismo —«Seguir donde lo dejaste»— y se ve sin tocar nada; cuando no está, porque ya no
    // tiene nada pendiente, va una línea encima con su enlace.
    const yaEnLaLista = !!(seguir && r.filas.some((f) => f.id === seguir.id));
    const cabecera = r.vacia ? "Hoy no tienes nada pendiente" : `Hoy tienes ${plural(r.mostradas, "cosa", "cosas")} (${duracion(r.minutos)})`;
    // `#recomendacion` es el sitio donde la portada dice cuál es el siguiente concepto, y tiene
    // que existir SIEMPRE, también cuando la recomendación cae en un grupo anterior y ya está
    // pintada arriba: si desapareciera sin decir nada, la portada dejaría de contestar a «¿por
    // dónde sigo?», que es la única pregunta que esta página tiene que responder.
    const conNuevo = r.filas.some((f) => f.grupo === "nuevo");
    // T12 · La acción principal, SIEMPRE. Antes solo aparecía si el último concepto no estaba en
    // la lista, así que en la visita normal —con algo a medias— no había ningún botón: la página
    // que responde «¿por dónde sigo?» respondía con tres párrafos y ninguna salida.
    const filaAccion = r && Array.isArray(r.filas) ? r.filas.find((f) => f && f.id) : null;
    const accionHoy = (seguir && seguir.id)
      ? { id: seguir.id, texto: "▶ Continuar donde lo dejaste" }
      : (filaAccion
        ? { id: filaAccion.id, texto: "▶ Empezar por aquí" }
        // T16 · Tercer recurso, y el que impide que la portada se quede sin botón: con una ruta
        // elegida, la lista puede estar vacía (nada empezado, prerrequisitos sin cumplir). En ese
        // caso se empieza por el primer concepto del itinerario de entrada de esa ruta. Sin esto,
        // elegir ruta dejaba la página que responde «¿por dónde sigo?» sin ninguna acción.
        : (() => {
            const rutaAct = typeof pref.rutaActiva === "string" ? pref.rutaActiva : "";
            const entrada = (Array.isArray(window.ITINERARIOS) ? window.ITINERARIOS : [])
              .find((x) => x && x.ruta === rutaAct && /entrada/.test(String(x.id)));
            const primero = entrada && Array.isArray(entrada.conceptos) ? entrada.conceptos[0] : null;
            return primero ? { id: primero, texto: "▶ Empezar por la ruta" } : null;
          })());

    const htmlHoy = `<section class="hoy" id="bloque-hoy" aria-labelledby="hoy-titulo">
      <h2 id="hoy-titulo">Hoy</h2>
      <p class="acciones-fila"><a class="boton" href="#/sesion">${leerSesion()?.sesion && !leerSesion().sesion.terminada ? "Retomar preguntas" : "Estudiar preguntas"}</a></p>
      <p class="hoy-cuenta" id="hoy-cuenta">${esc(cabecera)}</p>
      <p class="nota-pie" id="hoy-objetivo">${hechasHoy
        ? `Llevas ${hechasHoy} de ${objetivo} preguntas del objetivo de hoy.`
        : `Hoy todavía no has respondido ninguna pregunta; tu objetivo son ${objetivo}.`}</p>
      ${accionHoy ? `<p class="hoy-seguir"><a class="boton" href="#/c/${esc(accionHoy.id)}">${esc(accionHoy.texto)}</a></p>` : ""}
      <div class="hoy-sesion" id="hoy-sesion" role="group" aria-label="Cuánto tiempo tienes hoy">
        <span class="nota-pie" id="hoy-sesion-rotulo">Tiempo para hoy:</span>
        <a class="nota-pie" id="hoy-orientacion" href="#/orientacion" title="Elegir ruta, experiencia y tiempo">Qué busco</a>
        <span class="hoy-minutos">${[10, 20, 40].map((n) => `<button type="button" class="boton${objetivo === n ? " activo" : ""}" data-sesion="${n}" aria-pressed="${objetivo === n}">${n} min</button>`).join("")}</span>

        <label class="nota-pie" for="hoy-ruta">Ruta:</label>
        <select id="hoy-ruta" class="hoy-ruta" aria-label="Ruta de estudio">
          <option value=""${rutaActiva === "" ? " selected" : ""}>todas</option>
          ${Object.entries(P.rutas || {}).map(([k, v]) => `<option value="${esc(k)}"${rutaActiva === k ? " selected" : ""}>${esc(v.nombre || k)}</option>`).join("")}
        </select>
      </div>
      <div class="pendientes" id="lista-pendientes">${listaPendienteHtml(r, { idRecomendacion: true, marcaSeguir: seguir ? seguir.id : "" })}</div>
      ${conNuevo ? "" : bloqueRecomendacion()}
      <p class="nota-pie" id="hoy-pie"><a href="#/pendientes">Ver la lista entera, con filtro</a></p>
      ${avisoSinConexion()}
    </section>`;
    // T12 · La acción principal, primero: a 390x844 el botón tiene que verse sin leer nada.
    // Si la expresión no encaja (porque cambie el marcado), se devuelve el HTML tal cual: nunca
    // se rompe la portada por un reordenado que no encontró su sitio.
    const conAccionPrimero = htmlHoy.replace(
      /(<h2 id="hoy-titulo">Hoy<\/h2>)([\s\S]*?)(<p class="hoy-seguir">[\s\S]*?<\/p>)/,
      "$1$3$2",
    );
    // T16 · El selector de tiempo y ruta iba DESPUÉS de «Hoy tienes N cosas», partiendo en dos el
    // bloque que resume y lo resumido. Va antes de la cuenta: primero con cuánto tiempo cuentas,
    // después qué hay.
    const cajaSesion = conAccionPrimero.match(/<div class="hoy-sesion"[\s\S]*?<\/div>/);
    const conSelectorArriba = cajaSesion
      ? conAccionPrimero
          .replace(cajaSesion[0], "")
          .replace(/(<p class="hoy-cuenta")/, cajaSesion[0] + "$1")
      : conAccionPrimero;
    return conSelectorArriba;
  }

  vistas.pendientes = () => {
    const hoy = hoyISO();
    const r = pendientesAhora(hoy);
    const hechasHoy = typeof dias[hoy] === "number" && Number.isFinite(dias[hoy]) && dias[hoy] > 0 ? dias[hoy] : 0;
    const objetivo = Number.isInteger(pref.objetivoDia) && pref.objetivoDia > 0 ? pref.objetivoDia : 20;
    const cabecera = r.vacia ? "Ahora mismo no hay nada en la lista" : `Tienes ${plural(r.delFiltro, "cosa", "cosas")}${r.filtro ? " con este filtro" : ""} (${duracion(r.minutos + r.minutosFuera)})`;
    // El filtro lleva la cuenta de cada grupo: así se sabe qué hay detrás antes de filtrar, y
    // filtrar por algo que está a cero deja de ser una sorpresa.
    const filtros = ["", ...GRUPOS_PENDIENTES].map((g) => {
      const n = g ? r.porGrupo[g] || 0 : r.total;
      return `<option value="${esc(g)}" ${r.filtro === g ? "selected" : ""}>${g ? esc(ROTULO_FILTRO[g]) : "todo"} (${n})</option>`;
    }).join("");
    // El tope se elige aquí y no en una página de ajustes: es la preferencia que decide cuánto
    // ocupa la lista, y se decide mirándola.
    const topes = [...new Set([5, 10, 20, 50, r.max])].sort((a, b) => a - b);
    const opcionesTope = topes.map((n) => `<option value="${n}" ${r.max === n ? "selected" : ""}>${n}</option>`).join("");
    return `<div class="migas"><a href="#/">Inicio</a> › Lo que me falta hoy</div>
      <h1>Lo que me falta hoy</h1>
      <p class="entradilla">Una lista corta de cosas concretas, ordenada por lo que más ayuda, con el motivo de cada una
      y lo que cuesta. Contesta a una sola pregunta: «¿qué hago ahora?».</p>
      <p class="hoy-cuenta" id="pendientes-cuenta">${esc(cabecera)}</p>
      <p class="nota-pie" id="pendientes-objetivo">${hechasHoy
        ? `Llevas ${hechasHoy} de ${objetivo} preguntas del objetivo de hoy.`
        : `Hoy todavía no has respondido ninguna pregunta; tu objetivo son ${objetivo}.`}</p>
      <div class="acciones-fila">
        <label class="pastilla" for="filtro-pendientes">Enséñame solo:</label>
        <select id="filtro-pendientes" class="boton">${filtros}</select>
        <label class="pastilla" for="max-pendientes">Filas como mucho:</label>
        <select id="max-pendientes" class="boton">${opcionesTope}</select>
      </div>
      <div class="pendientes" id="lista-pendientes">${listaPendienteHtml(r, { posponer: true, propia: true })}</div>
      ${avisoSinConexion()}`;
  };

  // El filtro, el tope y el aplazo desde la fila. El aplazo pasa por `aplazoValido` y `aplazar`,
  // los mismos que usa la ficha, así que desde aquí no se puede guardar un aplazo que la ficha
  // rechazaría —sin motivo, sin fecha o con una fecha que ya pasó—: tener dos caminos con reglas
  // distintas es tener dos verdades sobre lo mismo.
  function conectarPendientes() {
    const filtro = $("#filtro-pendientes");
    if (filtro) filtro.addEventListener("change", () => {
      pref.filtroPendientes = GRUPOS_PENDIENTES.includes(filtro.value) ? filtro.value : "";
      escribir(CLAVES.pref, pref);
      render();
    });
    const max = $("#max-pendientes");
    if (max) max.addEventListener("change", () => {
      const n = Number(max.value);
      pref.pendientesMax = Number.isInteger(n) && n > 0 ? n : PENDIENTES_MAX;
      escribir(CLAVES.pref, pref);
      render();
    });
    $$("[data-aplazo-fila]").forEach((form) => form.addEventListener("submit", (e) => {
      // Sin `preventDefault` el navegador recarga la página con la fecha en la barra de
      // direcciones: se perdería el sitio de la lista y el aplazo no se guardaría.
      e.preventDefault();
      const caja = form.querySelector(".formulario-error");
      const revision = aplazoValido(form.querySelector('input[name="hasta"]').value, form.querySelector('input[name="motivo"]').value, hoyISO());
      if (!revision.ok) { caja.textContent = revision.aviso; caja.hidden = false; return; }
      aplazar(form.dataset.aplazoFila, revision.hasta, revision.motivo);
      render();
    }));
  }  vistas.inicio = () => {
    const r = resumenProgreso();
    // Cifras reales del catálogo, no escritas a mano: si crece el contenido, la portada crece.
    const recursos = (P.recursos && typeof P.recursos === "object") ? P.recursos : {};
    const nProyectos = Object.keys(recursos).filter((k) => k.startsWith("proj:")).length;
    const nLabs = Object.keys(recursos).filter((k) => k.startsWith("lab:")).length;
    const nPaquetes = Object.keys(window.PAQUETES || {}).length + (window.PAQUETES && window.PAQUETES.P65 ? 0 : 1);
    // Últimos paquetes publicados (orden de incorporación, según el estado del proyecto): la
    // portada deja de mandar al catálogo entero y ofrece la descarga directa de lo más reciente.
    const ULTIMOS_PAQUETES = ["P72", "P73", "P69", "P70", "P71", "P66"];
    const catalogoProyectos = (typeof Proyectos !== "undefined" ? Proyectos.PROYECTOS : []) || [];
    const proyectoPorId = new Map(catalogoProyectos.map((x) => [x.id, x]));
    const ultimosPaquetes = ULTIMOS_PAQUETES.map((id) => {
      const p = proyectoPorId.get(id);
      const q = (p && p.paquete) || (window.PAQUETES && window.PAQUETES[id]);
      if (!p || !q || !q.archivo) return "";
      const kb = Number.isFinite(Number(q.bytes)) ? Math.round(Number(q.bytes) / 1024) + " KB" : "";
      return `<li class="paquete-fila"><a class="paquete-titulo" href="#/proyectos/${esc(id)}">${esc(p.titulo)}</a><span class="paquete-meta">${esc(p.nivel || "")}${kb ? " · " + kb : ""}</span><a class="boton" href="paquetes/${esc(q.archivo)}" download aria-label="Descargar el paquete ${esc(p.titulo)}">Descargar ZIP</a></li>`;
    }).filter(Boolean).join("");
    return `
      <section class="portada" aria-labelledby="portada-titulo">
        <p class="portada-eyebrow">Data School · datos e IA en castellano</p>
        <h1 id="portada-titulo">Aprende datos e IA con el código a la vista</h1>
        <p class="portada-definicion">Un temario abierto para aprender haciendo: <strong>${r.total} fichas</strong> con el código ejecutado y su salida real, <strong>${nLabs} laboratorios</strong>, <strong>${nProyectos} proyectos</strong> con rúbrica y <strong>${nPaquetes} paquetes descargables</strong> con datos de ejemplo y verificador.</p>
        <form class="portada-buscar" id="portada-buscar-form" role="search">
          <label class="visualmente-oculto" for="portada-buscar-campo">Buscar en Data School</label>
          <input id="portada-buscar-campo" name="q" type="search" placeholder="Busca un concepto o un proyecto" autocomplete="off">
          <button type="submit" class="boton">Buscar</button>
        </form>
        <p class="acciones-fila portada-acciones">
          <a class="boton-principal" href="#/plan">Ver el temario</a>
          <a class="boton" href="#/rutas/bi">Ver caso de BI</a>
          <a class="boton" href="#/proyectos">Explorar los ${nProyectos} proyectos</a>
        </p>
        <ul class="portada-cifras">
          <li><strong>${r.total}</strong> fichas</li>
          <li><strong>${P.fases.length}</strong> fases</li>
          <li><strong>${nLabs}</strong> laboratorios</li>
          <li><strong>${nProyectos}</strong> proyectos</li>
          <li><strong>${nPaquetes}</strong> descargas</li>
        </ul>
      </section>

      <section class="portada-paraquien" aria-labelledby="portada-paraquien-titulo">
        <h2 id="portada-paraquien-titulo">¿Es para ti?</h2>
        <div class="portada-tarjetas">
          <a class="tarjeta portada-tarjeta" href="#/orientacion"><h3>Empiezo de cero</h3><p>Elige ruta y tiempo y te digo por dónde empezar. Sin registrarte y sin perder lo que lleves.</p><span class="portada-tarjeta-pie">Elegir por dónde empezar →</span></a>
          <a class="tarjeta portada-tarjeta" href="#/buscar"><h3>Ya trabajo con datos</h3><p>Busca por concepto, etiqueta o proyecto y ve directo a la ficha, al laboratorio o al paquete.</p><span class="portada-tarjeta-pie">Buscar en el catálogo →</span></a>
          <a class="tarjeta portada-tarjeta" href="#/proyectos"><h3>Quiero portfolio</h3><p>${nProyectos} proyectos con datos, hitos y rúbrica; ${nPaquetes} con el código descargable para empezar hoy.</p><span class="portada-tarjeta-pie">Ver los proyectos →</span></a>
        </div>
      </section>


      <section class="portada-paquetes" aria-labelledby="ultimos-paquetes">
        <h2 id="ultimos-paquetes">Últimos paquetes</h2>
        <p class="nota-pie">Los últimos añadidos: código comentado, datos de ejemplo y verificador. Descarga directa, sin cuenta.</p>
        <ul class="lista-paquetes">${ultimosPaquetes}</ul>
        <p class="nota-pie"><a href="#/proyectos">Ver los ${nPaquetes} paquetes y sus fichas</a> · <a href="#/aprender">Índice de aprendizaje: orden, tiempo y prerrequisitos</a> · <a href="#/ejemplo">Artículo de ejemplo</a> · <a href="#/rutas">Rutas de aprendizaje</a> · <a href="#/rutas/bi">Ruta BI</a> · <a href="#/proyectos-estrella">Proyectos estrella</a> · <a href="#/quien-esta-detras">Quién está detrás</a></p>
      </section>
    `;
  };

  vistas.fase = (fid) => {
    const f = P.fases.find((x) => x.id === fid);
    if (!f) return `<h1>Fase desconocida</h1>`;
    const ids = orden.filter((c) => c.fid === fid).map((c) => c.id);
    // Los criterios de cierre de la fase (fase 10). Las métricas se calculan una vez y se pasan
    // ya hechas: recorrer las 438 fichas otra vez para cada bloque sería trabajo repetido, y el
    // coste de esta vista lo nota cualquiera que abra una fase con el temario entero cargado.
    const politica = politicaEvaluacion();
    const metricas = metricasDe(progreso, srs, dias, P.conceptos, { hoy: hoyISO(), repsConsolidada: (politica.estado || {}).repeticiones_para_consolidada });
    return `<div class="migas"><a href="#/">Inicio</a> › Fase ${f.n}</div>
      <h1 class="fase-titulo">${f.num} ${esc(f.corto)}</h1>
      ${listaConceptos(ids)}
      ${bloqueCierre(fid, metricas, politica)}`;
  };

  // ── Orientación en tres pasos (T15) ───────────────────────────────────────
  // No es un formulario: es una pantalla que se puede omitir entera, y cada paso guarda lo suyo
  // en cuanto se elige. No toca ninguna marca de evidencia.
  vistas.orientacion = () => {
    const ruta = typeof pref.rutaActiva === "string" ? pref.rutaActiva : "";
    const exp = experiencia();
    const disp = Number.isInteger(pref.objetivoDia) ? pref.objetivoDia : 20;
    const paso = (n, titulo, cuerpo, elegido) => `<li class="paso-orientacion${elegido ? " hecho" : ""}">
      <h2>${n}. ${esc(titulo)}</h2>
      ${cuerpo}
    </li>`;
    const rutas = Object.entries(P.rutas || {}).map(([k, v]) => `<button type="button" class="boton${ruta === k ? " activo" : ""}" data-orienta="ruta" data-valor="${esc(k)}" aria-pressed="${ruta === k}">${esc(v.nombre || k)}</button>`).join("");
    const exps = Object.entries(EXPERIENCIAS).map(([k, v]) => `<button type="button" class="boton${exp === k ? " activo" : ""}" data-orienta="experiencia" data-valor="${esc(k)}" aria-pressed="${exp === k}">${esc(v)}</button>`).join("");
    const disps = [10, 20, 40].map((n) => `<button type="button" class="boton${disp === n ? " activo" : ""}" data-orienta="objetivoDia" data-valor="${n}" aria-pressed="${disp === n}">${n} min</button>`).join("");
    return `<div class="migas"><a href="#/">Inicio</a> › Orientación</div>
      <h1>Antes de empezar, tres cosas</h1>
      <p>Puedes omitirlo: el portal funciona sin decirlas, y esto se puede volver a abrir desde <a href="#/ayuda">Ayuda</a>. Solo cambia por dónde te propone empezar; no da nada por sabido.</p>
      <ol class="orientacion" id="orientacion">
        ${paso(1, "Qué quieres conseguir", `<div class="grupo-opciones" role="group" aria-label="Ruta">${rutas}</div>`, ruta !== "")}
        ${paso(2, "Cuánto has tocado ya", `<div class="grupo-opciones" role="group" aria-label="Experiencia">${exps}</div>`, exp !== "")}
        ${paso(3, "Cuánto tiempo tienes al día", `<div class="grupo-opciones" role="group" aria-label="Disponibilidad">${disps}</div>`, true)}
      </ol>
      <p class="acciones-orientacion">
        <a class="boton" href="#/">Omitir y empezar</a>
        <a class="boton activo" href="#/">Listo, empezar</a>
      </p>`;
  };

  // ── Diagnóstico opcional (T19) ─────────────────────────────────────────────
  // Seis conceptos, tres respuestas posibles, borrador que aguanta recargas y cierres, y ninguna
  // consecuencia sobre el progreso. Lo que sale al final es lo que la persona CREE que le falta.
  const DIAGNOSTICO_N = 6;
  const DIAGNOSTICO_OPCIONES = [
    { v: 0, texto: "No sabría explicarlo" },
    { v: 1, texto: "Con ayuda, sí" },
    { v: 2, texto: "Sí, sin mirar" },
  ];

  /** Los conceptos que se preguntan: los primeros de la ruta activa, o del itinerario de entrada. */
  function conceptosDelDiagnostico() {
    const rutaAct = typeof pref.rutaActiva === "string" ? pref.rutaActiva : "";
    const ids = orden.map((c) => c.id).filter((id) => !rutaAct || (P.conceptos[id] && (P.conceptos[id].r || []).includes(rutaAct)));
    const base = ids.length >= DIAGNOSTICO_N ? ids : orden.map((c) => c.id);
    return base.slice(0, DIAGNOSTICO_N);
  }

  // ── Sesión de estudio (T20) ────────────────────────────────────────────────
  // El motor esta en sitio/sesion.js (globalThis.Sesion). Aqui solo se arma el plan, se guarda
  // en el borrador y se pinta.
  // T20 · El plan sale de los MINUTOS elegidos en Hoy, no de un doce fijo. El coste por pregunta es
  // el mismo que usa el desglose del plan (1,5 min: leer el enunciado, pensar, elegir y leer por
  // qué), así que las dos pantallas cuentan lo mismo.
  const MIN_POR_PREGUNTA_SESION = 1.5;
  function hayActividadSesion(sesion) {
    return !!sesion && (Object.keys(sesion.respuestas || {}).length > 0 ||
      Object.keys(sesion.omitidas || {}).length > 0 || Object.keys(sesion.reintentos || {}).length > 0 ||
      (Array.isArray(sesion.agenda?.actividades) && sesion.agenda.actividades.some(a => a.completada)) ||
      (Number.isInteger(sesion.posicion) && sesion.posicion > 0));
  }
  function minutosDeLaSesion() {
    const n = Number(pref.objetivoDia);
    return Number.isFinite(n) && n > 0 ? n : 20;
  }

  /** Los conceptos candidatos: los de la ruta activa, o todo el principio si no hay ruta. */
  /**
   * Los cuatro grupos de la sesión, en el orden en que hay que atenderlos. Se devuelven todos para
   * poder enseñar de dónde sale el plan y para poder probarlo sin mirar el plan entero.
   */
  function gruposDeLaSesion() {
    const rutaAct = typeof pref.rutaActiva === "string" ? pref.rutaActiva : "";
    const deLaRuta = (id) => !rutaAct || (((P.conceptos[id] || {}).r || []).includes(rutaAct));
    const base = orden.map((c) => c.id).filter(deLaRuta);
    const conjunto = base.length ? base : orden.map((c) => c.id);
    const hoy = hoyISO();

    const tienePreguntas = (id) => (Number((P.conceptos[id] || {}).q) || 0) > 0;
    const estado = (id) => progreso[id] || {};
    const empezado = (id) => !!(estado(id).visto || estado(id).leido || estado(id).practica || estado(id).intentos);
    const consolidado = (id) => !!estado(id).dominado;

    // Repaso vencido: las claves de srs vencen por pregunta; se queda el concepto una sola vez.
    const vencidos = new Set();
    for (const [clave, t] of Object.entries(srs || {})) {
      if (!t || typeof t !== "object") continue;
      if (typeof t.venc === "string" && t.venc <= hoy) {
        const id = String(clave).split("#")[0];
        if (id) vencidos.add(id);
      }
    }

    const retomar = conjunto.filter((id) => empezado(id) && !consolidado(id) && !vencidos.has(id) && tienePreguntas(id));
    const repaso = conjunto.filter((id) => vencidos.has(id) && tienePreguntas(id));
    const PRACTICA_MAXIMA = 3;
    const practica = conjunto.filter((id) => {
      const c = P.conceptos[id] || {};
      return (Number(c.pr) || 0) > 0 && !(estado(id).practica) && !empezado(id) && !vencidos.has(id) && tienePreguntas(id);
    }).slice(0, PRACTICA_MAXIMA);
    const nuevo = conjunto.filter((id) => !empezado(id) && !vencidos.has(id) && tienePreguntas(id) &&
      !practica.includes(id));

    // El orden del plan: retomar, repaso, práctica y nuevo. El primero que aparezca manda, y el
    // orden dentro de cada grupo es el del índice, que respeta prerrequisitos.
    const ids = [...new Set([...retomar, ...repaso, ...practica, ...nuevo])];
    return { retomar, repaso, practica, nuevo, ids };
  }

  function conceptosDeLaSesion() {
    const g = gruposDeLaSesion();
    // T20 · El plan decide QUÉ conceptos entran y en qué orden (reanudar → repaso → práctica →
    // itinerario). Solo cuentan las actividades que se responden como pregunta (`quiz` y `review`):
    // la práctica y la lectura son otras actividades y no se convierten en preguntas de la sesión.
    const delPlan = planDeHoyDeLaSesion();
    const delQuiz = delPlan
      ? [...new Set(delPlan.items.filter((a) => a.tipo === "quiz" || a.tipo === "review").map((a) => a.concepto).filter(Boolean))]
      : [];
    // Si el presupuesto se lo ha comido todo la práctica, el plan no admite preguntas. En ese caso se
    // usa el orden de siempre: el plan manda cuando puede, pero no deja la sesión vacía.
    const ids = delQuiz.length ? delQuiz : g.ids;
    return ids.map((id) => ({ id, preguntas: Number((P.conceptos[id] || {}).q) || 0 })).filter((c) => c.preguntas > 0);
  }

  /**
   * T20 · El plan de Hoy con los cuatro grupos de la sesión. Cada actividad lleva tipo, motivo, coste,
   * enlace e id estable, y lo que no cabe en el presupuesto se declara en vez de recortarse. Es la
   * composición que exige F03; el motor de preguntas sigue recibiendo los ids de siempre.
   */
  function planDeHoyDeLaSesion() {
    if (typeof PlanHoy === "undefined") return null;
    const g = gruposDeLaSesion();
    const preguntasDe = (id) => Number((P.conceptos[id] || {}).q) || 0;
    // T20 · Una actividad por PREGUNTA, no por concepto. Por concepto, el plan contaba 2 minutos y la
    // sesión ejecutaba las tres preguntas de esa ficha: el presupuesto mentía.
    const comoPreguntas = (ids, tipo, prefijo) => (Array.isArray(ids) ? ids : []).flatMap((id) => {
      const n = preguntasDe(id);
      if (!n) return [{ id: prefijo + ":" + id, tipo: "read", concepto: id, enlace: "#/c/" + id }];
      return Array.from({ length: n }, (_, i) => ({
        id: prefijo + ":" + id + "#" + i, tipo, concepto: id, indice: i, enlace: "#/c/" + id,
      }));
    });
    return PlanHoy.planDeHoy({
      minutos: minutosDeLaSesion(),
      fuentes: {
        reanudar: comoPreguntas(g.retomar, "quiz", "reanudar"),
        repasos: (() => {
          const hoy = hoyISO();
          return Object.entries(srs || {})
            .filter(([clave, x]) => x && typeof x.venc === "string" && x.venc <= hoy && String(clave).includes("#"))
            .map(([clave]) => {
              const [id, idx] = String(clave).split("#");
              return { id: "repaso:" + clave, tipo: "review", concepto: id, indice: Number(idx), clave, enlace: "#/c/" + id };
            })
            .filter((a) => Number.isInteger(a.indice) && a.indice >= 0 && preguntasDe(a.concepto) > a.indice);
        })(),
        practicas: (Array.isArray(g.practica) ? g.practica : []).map((id) => ({
          id: "practica:" + id, tipo: "practice", concepto: id, enlace: "#/c/" + id,
        })),
        // T20 · El itinerario arranca con la LECTURA del primero y luego sus preguntas: sin esto el
        // plan no contenía ninguna actividad de lectura y ese paso no se ejecutaba nunca.
        itinerario: (Array.isArray(g.nuevo) && g.nuevo.length
          ? [{ id: "itinerario:lectura:" + g.nuevo[0], tipo: "read", concepto: g.nuevo[0], enlace: "#/c/" + g.nuevo[0] }]
            .concat(comoPreguntas(g.nuevo, "quiz", "itinerario"))
          : []),
      },
    });
  }

  /** Las actividades del plan que se RESPONDEN, como items del motor de sesión. */
  function itemsDeLaSesion() {
    const plan = planDeHoyDeLaSesion();
    if (!plan || !Array.isArray(plan.items)) return [];
    const dePregunta = plan.items
      .filter((a) => (a.tipo === "quiz" || a.tipo === "review") && Number.isInteger(a.indice));
    if (dePregunta.length) {
      return dePregunta.map((a) => ({ clave: Sesion.claveDePregunta(a.concepto, a.indice), concepto: a.concepto, indice: a.indice }));
    }
    // Si no hay preguntas en el plan, no se inventa una fuera del presupuesto.
    return [];
  }

  /**
   * T20 · La AGENDA del día. Sale del plan (que ya respeta presupuesto y prioridad) y se guarda en el
   * borrador: al reabrir se recupera la misma, no se recalcula otra lista.
   */
  /**
   * T20 · Sincroniza la agenda con la evidencia que ya existe: si la ficha acredita lectura (presencia
   * y final), su actividad se cierra. No se puede fingir esperando en la sesión.
   */
  function sincronizarAgenda(agenda) {
    if (!agenda || typeof Agenda === "undefined" || typeof leerLeido !== "function") return agenda;
    let actual = agenda;
    for (const act of agenda.actividades || []) {
      if (act.completada || act.tipo !== "read") continue;
      const leido = leerLeido(progreso[act.concepto]);
      if (!leido) continue;
      actual = Agenda.completar(actual, act.id, { segundos: leido.segundos, llegoAlFinal: true });
    }
    return actual;
  }

  function agendaDeLaSesion(borrador, sesion) {
    if (typeof Agenda === "undefined") return null;
    const guardada = sesion && sesion.agenda;
    if (guardada && Array.isArray(guardada.actividades)) {
      const hechas = (guardada.actividades || []).filter((x) => x.completada).length;
      const pospuestas = (guardada.actividades || []).filter((x) => !x.completada && x.pospuesta).length;
      if (hechas > 0 || pospuestas > 0) return sincronizarAgenda(guardada);
    }
    const plan = planDeHoyDeLaSesion();
    if (!plan) return null;
    const actividades = plan.items.map((a) => ({
      id: a.id || Agenda.idDe(a.fuente || "itinerario", a.tipo, a.concepto, a.indice),
      tipo: a.tipo, concepto: a.concepto, indice: a.indice, motivo: a.motivo, minutos: a.minutos,
    }));
    const nueva = Agenda.crear({ minutos: plan.minutos, fuentes: { itinerario: actividades }, creadaEn: new Date().toISOString() });
    if (!guardada || !Array.isArray(guardada.actividades)) return sincronizarAgenda(nueva);
    const yaEstan = new Set(nueva.actividades.map((x) => x.id));
    const faltan = guardada.actividades.filter((x) => !yaEstan.has(x.id));
    if (!faltan.length) return sincronizarAgenda(nueva);
    // Se fusiona RESPETANDO el presupuesto, y se sincroniza ANTES de recortar: una actividad con
    // evidencia no puede caerse por no caber, o nunca se cerraria.
    const fusionada = sincronizarAgenda({ ...nueva, actividades: nueva.actividades.concat(faltan) });
    let total = 0;
    const dentro = [];
    for (const a of fusionada.actividades) {
      if (a.completada) { dentro.push(a); continue; }
      const coste = Number(a.minutos) || 0;
      if (total + coste > fusionada.minutos) continue;
      total += coste;
      dentro.push(a);
    }
    return { ...fusionada, actividades: dentro, totalMinutos: total };
  }

  /**
   * T20 · Paso de PRÁCTICA. La agenda dice que toca práctica: se ofrece su ficha y se declara cómo
   * salió. Una visita no la cierra; solo la autoevaluación, que es lo que pide F03.
   */
  function practicaSesionHtml(act) {
    const titulo = (P.conceptos[act.concepto] || {}).t || act.concepto;
    const opciones = [["bien", "Bien"], ["regular", "Regular"], ["mal", "Mal"]]
      .map(([v, t2]) => `<button type="button" class="boton" data-agenda-autoevaluar="${v}">${t2}</button>`).join(" ");
    return `<section class="sesion-practica" id="sesion-practica" data-actividad="${esc(act.id)}">
        <h2>Práctica · ${esc(titulo)}</h2>
        <p class="nota-pie">${esc(act.motivo)} · ${act.minutos} min</p>
        <p>Haz la práctica en su ficha y vuelve a declarar cómo te salió. Abrir la ficha no la cierra.</p>
        <p class="acciones-fila"><a class="boton" href="#/c/${esc(act.concepto)}">Abrir la práctica</a></p>
        <p class="acciones-fila">${opciones}</p>
      </section>`;
  }

  /**
   * T20 · Cierra la actividad de la agenda que corresponde a la pregunta respondida. La clave es la
   * misma que usan ficha y repaso (`concepto#indice`), así que no hay que adivinar cuál era.
   */
  function cerrarActividadDeAgenda(agenda, concepto, indice, elegida, opciones) {
    if (!agenda || typeof Agenda === "undefined") return agenda;
    const clave = Sesion.claveDePregunta(concepto, indice);
    const act = (agenda.actividades || []).find((a) => a.clave === clave && !a.completada &&
      (a.tipo === "quiz" || a.tipo === "review"));
    if (!act) return agenda;
    return Agenda.completar(agenda, act.id, { elegida, opciones });
  }

  /**
   * T20 · Las SIETE categorías del contrato, separadas: respondido, omitido, entregado, correcto,
   * autoevaluado, leído y actividad completada. No se suman entre sí: una incorrecta está respondida
   * y no acertada, y una lectura no es una respuesta.
   */
  function categoriasHtml(sesion, r) {
    if (!sesion) return "";
    const agenda = sesion.agenda;
    const acts = agenda && Array.isArray(agenda.actividades) ? agenda.actividades : [];
    const leido = acts.filter((a) => a.tipo === "read" && a.completada).length;
    const auto = acts.filter((a) => a.tipo === "practice" && a.completada && a.evidencia && a.evidencia.autoevaluacion).length;
    const resumenAgenda = agenda && typeof Agenda !== "undefined" ? Agenda.resumen(agenda) : null;
    const filas = [
      ["respondido", r && r.respondidas],
      ["omitido", r && r.omitidas],
      ["entregado", r && r.entregadas],
      ["correcto", r && r.correctas],
      ["autoevaluado", auto],
      ["leído", leido],
      ["completado", resumenAgenda ? resumenAgenda.completadas : null],
    ];
    return `<section class="sesion-categorias" id="sesion-categorias">
        <h3>Qué has hecho, por categoría</h3>
        <ul>${filas.map(([k, v]) => `<li data-categoria="${k}"><strong>${k}</strong>: ${v == null ? "—" : v}</li>`).join("")}</ul>
        <p class="nota-pie">No se suman: una respuesta incorrecta está respondida y no acertada; una lectura no es una respuesta.</p>
      </section>`;
  }

  /** El resumen POR TIPO, que es lo que la sesión no sabía decir. */
  function resumenPorTipoHtml(sesion) {
    const agenda = sesion && sesion.agenda;
    if (!agenda || typeof Agenda === "undefined") return "";
    const r = Agenda.resumen(agenda);
    const filas = Object.entries(r.porTipo || {}).map(([tipo, d]) =>
      `<li data-tipo="${esc(tipo)}"><strong>${esc(d.etiqueta)}</strong>: ${d.completadas} de ${d.total}${d.pendientes ? " · " + d.pendientes + " pendiente(s)" : ""}</li>`).join("");
    if (!filas) return "";
    return `<section class="sesion-por-tipo" id="sesion-por-tipo" data-total="${r.total}" data-completadas="${r.completadas}" data-terminada="${r.terminada ? "1" : "0"}">
        <h3>Por tipo de actividad</h3>
        <ul>${filas}</ul>
        <p class="nota-pie">${r.terminada ? "No queda ninguna actividad del plan." : "Quedan " + r.pendientes + " actividad(es) del plan: la sesión no está terminada."}</p>
      </section>`;
  }

  /** El plan, contado en pantalla: qué entra, por qué y qué no cabe con su alternativa. */
  function planDeHoyHtml() {
    const plan = planDeHoyDeLaSesion();
    if (!plan) return "";
    if (!plan.items.length && !plan.noCaben.length) return "";
    const filas = plan.items.map((a) => `<li class="plan-fila" data-plan-id="${esc(a.id)}" data-plan-tipo="${esc(a.tipo)}">
        <strong>${esc((PlanHoy.TIPOS[a.tipo] || {}).etiqueta || a.tipo)}</strong>
        ${a.concepto ? `<a href="${esc(a.enlace)}">${esc(a.concepto)}</a>` : ""}
        <span class="nota-pie">${a.minutos} min · ${esc(a.motivo)}</span>
      </li>`).join("");
    // No caben pueden ser cientos (todo el temario sin empezar): se enseñan las primeras y se cuenta
    // el resto, porque una lista de 438 filas no se lee.
    const MAX_FUERA = 5;
    const fuera = plan.noCaben.slice(0, MAX_FUERA).map((a) => {
      const op = PlanHoy.opcionesParaNoCabe(a, Math.max(0, plan.minutos - plan.totalMinutos));
      return `<li class="plan-fila" data-plan-fuera-id="${esc(a.id)}">
        <strong>${esc((PlanHoy.TIPOS[a.tipo] || {}).etiqueta || a.tipo)}</strong>
        ${a.concepto ? `<a href="${esc(a.enlace)}">${esc(a.concepto)}</a>` : ""}
        <span class="nota-pie">${esc(op.motivo)}</span>
      </li>`;
    }).join("");
    const restantes = plan.noCaben.length - Math.min(plan.noCaben.length, MAX_FUERA);
    // Si la sesión ya tiene respuestas, el tiempo no se cambia a media sesión: se fija al empezar.
    const borradorSesion = leerSesion() || {};
    const fijado = hayActividadSesion(borradorSesion.sesion);
    const opciones = (PlanHoy.PRESUPUESTOS || []).concat([plan.minutos]);
    const selector = `<p class="acciones-fila sesion-minutos">
        <label for="sesion-minutos">Tiempo de Hoy:</label>
        <select id="sesion-minutos" data-plan-minutos="1"${fijado ? " disabled" : ""}>
          ${[...new Set(opciones)].sort((a, b) => a - b).map((m) => `<option value="${m}"${m === plan.minutos ? " selected" : ""}>${m} min</option>`).join("")}
        </select>
        <input type="number" id="sesion-minutos-propio" data-plan-minutos="1" min="5" max="240" step="1"
          value="${plan.minutos}" aria-label="Minutos propios"${fijado ? " disabled" : ""} />
        ${fijado ? '<span class="nota-pie">El tiempo se fija al empezar: ya hay actividad en esta sesión.</span>' : ""}
      </p>`;
    return `<section class="sesion-plan" id="sesion-plan" data-minutos="${plan.minutos}" data-total="${plan.totalMinutos}">
        <h2>Plan de Hoy · ${plan.minutos} min</h2>
        ${selector}
        <p class="nota-pie">Ocupa ${plan.totalMinutos} de ${plan.minutos} min${plan.recortado ? " · hay actividades que no caben" : ""}.</p>
        ${filas ? `<ul class="lista-plan">${filas}</ul>` : `<p>Con este tiempo no entra ninguna actividad.</p>`}
        ${fuera ? `<p class="nota-pie">No caben${restantes > 0 ? " (y " + restantes + " más)" : ""}:</p><ul class="lista-plan">${fuera}</ul>` : ""}
      </section>`;
  }

  /** El estado de la sesión, del borrador, creándolo si no existe o si es de otro plan. */
  function estadoDeLaSesion() {
    const borrador = leerSesion() || {};
    const guardado = borrador.sesion;
    const minutos = minutosDeLaSesion();
    if (guardado && Array.isArray(guardado.items) && guardado.items.length) {
      // T20 · Si todavía no hay respuestas, el borrador tiene que coincidir con el plan de AHORA. Antes
      // se reutilizaba cualquiera: una sesión creada con un item se quedaba con un item aunque el plan
      // anunciara cuatro. Con respuestas dadas NO se toca, para no borrar trabajo en curso.
      const sinRespuestas = !hayActividadSesion(guardado);
      const planAhora = itemsDeLaSesion();
      const iguales = planAhora.length === guardado.items.length &&
        planAhora.every((x, i) => x.clave === guardado.items[i].clave);
      if (!sinRespuestas || iguales) {
        const saneada = sesionSaneada(guardado);
        if (saneada !== guardado) {
          const recuperacionSesion = [...(Array.isArray(borrador.recuperacionSesion) ? borrador.recuperacionSesion : []),
            { guardadoEn: borrador.guardadoEn || null, respuestas: saneada.respuestasNoAplicadas }];
          const actualizado = { ...borrador, sesion: saneada, recuperacionSesion };
          escribirSesion(actualizado);
          return conPresupuesto(actualizado, saneada);
        }
        {
        // T20 · Al RECUPERAR también se sincroniza la agenda: una lectura acreditada cierra su
        // actividad aunque la sesión no se reconstruya.
        const agendaRec = agendaDeLaSesion(borrador, guardado);
        const final = agendaRec === guardado.agenda ? guardado : { ...guardado, agenda: agendaRec };
        if (final !== guardado) escribirSesion({ ...borrador, sesion: final });
        return conPresupuesto(borrador, final);
      }
      }
    }
    // T20 · Los items salen del PLAN: son sus actividades de pregunta, ya limitadas por el presupuesto.
    // Antes se recalculaban con `minutos / 1,5` y podían no caber en lo que el plan anunciaba.
    const items = itemsDeLaSesion();
    const nuevo = Sesion.estadoInicial(items, minutos);
    nuevo.modo = MODOS_VALIDOS.includes(pref.modoSesion) ? pref.modoSesion : "inmediata";
    nuevo.truncadas = 0;
    nuevo.repetidas = 0;
    // T20 · Se anota cuándo empezó: es lo que permite saber si el tiempo de Hoy se agotó.
    nuevo.iniciadaEn = new Date().toISOString();
    // T20 · La agenda se guarda con la sesión: misma lista al reabrir.
    const agendaNueva = agendaDeLaSesion(borrador, { ...nuevo, agenda: (guardado && guardado.agenda) || null });
    if (agendaNueva) nuevo.agenda = agendaNueva;
    escribirSesion({ ...borrador, sesion: nuevo });
    return nuevo;
  }

  /**
   * T20 · Un borrador con una respuesta que NO es una opción de su pregunta no vale: se descarta al
   * leerlo. Sin esto, un 99 guardado contaba como respondida y marcaba la correcta en la pantalla.
   */
  function sesionSaneada(estado) {
    if (!estado || !Array.isArray(estado.items) || !estado.respuestas) return estado;
    if (typeof PlanHoy === "undefined" || typeof PlanHoy.validarBorrador !== "function") return estado;
    const respuestas = { ...estado.respuestas };
    const respuestasNoAplicadas = { ...(estado.respuestasNoAplicadas || {}) };
    const entregadas = { ...(estado.entregadas || {}) };
    const textos = { ...(estado.textos || {}) };
    const reintentos = { ...(estado.reintentos || {}) };
    let tocado = false;
    for (const it of estado.items) {
      const r = respuestas[it.clave];
      if (!r) continue;
      const cont = typeof contenidoDe === "function" ? contenidoDe(it.concepto) : null;
      const q = cont && Array.isArray(cont.quizzes) ? cont.quizzes[it.indice] : null;
      const opciones = q && Array.isArray(q.o) ? q.o.length : null;
      const validacion = PlanHoy.validarBorrador(r, { clave: it.clave, opciones: opciones || undefined });
      if (!validacion.ok) {
        respuestasNoAplicadas[it.clave] = { respuesta: r, motivo: validacion.motivo,
          entregaAnterior: entregadas[it.clave], textoOriginal: textos[it.clave], reintentosAnteriores: reintentos[it.clave] };
        delete respuestas[it.clave];
        delete entregadas[it.clave];
        delete textos[it.clave];
        delete reintentos[it.clave];
        tocado = true;
      }
    }
    return tocado ? { ...estado, respuestas, respuestasNoAplicadas, entregadas, textos, reintentos } : estado;
  }

  /**
   * T20 · ¿Se agotó el tiempo de Hoy? Se marca UNA vez y no toca nada más: ni entrega ni descarta
   * ninguna respuesta. La pantalla decide después qué ofrecer (seguir, pausar o terminar).
   */
  function conPresupuesto(borrador, sesion) {
    if (sesion.presupuestoAgotado || sesion.terminada) return sesion;
    const desde = Date.parse(sesion.iniciadaEn || "");
    if (!Number.isFinite(desde)) return sesion;
    const minutos = Number.isFinite(sesion.minutos) && sesion.minutos > 0 ? sesion.minutos : minutosDeLaSesion();
    if (Date.now() - desde < minutos * 60000) return sesion;
    if (typeof Sesion === "undefined" || typeof Sesion.agotarPresupuesto !== "function") return sesion;
    const agotado = Sesion.agotarPresupuesto(sesion);
    escribirSesion({ ...borrador, sesion: agotado });
    return agotado;
  }

  /**
   * T20 · La lectura como actividad de la sesión. El plan ya la incluye (`read`, con su coste y su
   * motivo) pero la sesión solo recorría preguntas. Aquí se ofrece el paso, con las dos evidencias que
   * F03 pide: PRESENCIA (tiempo en pantalla) y FINAL (declararlo). No crea intento ni toca el SRS.
   */
  function lecturaSesionHtml(actividadAgenda) {
    const plan = planDeHoyDeLaSesion();
    // T20 · La lectura se ofrece por CONCEPTO, no por tipo de actividad: cuando el plan tiene
    // preguntas, sustituye la lectura por quizzes y el bloque desaparecía. Se toma el primero del plan
    // cuya lectura no esté acreditada, prefiriendo las actividades de tipo `read`.
    // Si la AGENDA manda leer, se ofrece exactamente el concepto de esa actividad. Antes esta función
    // elegía por su cuenta el primero del plan sin acreditar y podía abrir una ficha distinta de la que
    // la agenda declaraba, así que la lectura pendiente de la agenda no se cerraba nunca.
    let actividad;
    if (actividadAgenda && actividadAgenda.tipo === "read") {
      actividad = actividadAgenda;
    } else {
      const conConcepto = (plan?.items || []).filter((x) => x.concepto);
      const ordenadas = conConcepto.filter((x) => x.tipo === "read").concat(conConcepto.filter((x) => x.tipo !== "read"));
      actividad = ordenadas.find((x) => {
        const p = leerLeido(progreso[x.concepto]);
        return !(p && p.segundos >= minimoSegundos(P.conceptos[x.concepto]?.n));
      });
    }
    if (!actividad) return "";
    return `<section class="sesion-lectura" id="sesion-lectura" data-concepto="${esc(actividad.concepto)}">
      <h2>Antes de responder: leer</h2>
      <p><a href="#/c/${esc(actividad.concepto)}">Abrir la ficha: ${esc(P.conceptos[actividad.concepto]?.t || actividad.concepto)}</a>
        · ${actividad.minutos} min · ${esc(actividad.motivo)}</p>
      <p class="nota-pie">La lectura se registra en la ficha al llegar al final con tiempo de presencia.
        Esperar en esta pantalla no cuenta como leer el contenido.</p>
    </section>`;
  }
  function recuperacionSesionHtml() {
    const copia = leerSesion();
    const lista = Array.isArray(copia?.recuperacionSesion) ? copia.recuperacionSesion : [];
    const agendas = Array.isArray(copia?.agendasPendientes) ? copia.agendasPendientes : [];
    const respuestas = lista.length ? `<section class="sesion-recuperacion" id="sesion-recuperacion">
      <p role="status">Se conserva una copia de respuestas que no se pudieron aplicar a las preguntas actuales. Puedes responder de nuevo sin perder esa copia.</p>
      <button type="button" class="boton" data-sesion-descargar-recuperacion="1">Descargar respuestas recuperables</button>
    </section>` : "";
    const pendientes = agendas.map((entrada, i) => {
      const a = entrada?.sesion?.agenda;
      if (!Array.isArray(a?.actividades)) return "";
      const r = Agenda.resumen(a);
      return `<li>${r.pendientes} actividades pendientes de ${r.total}.
        <button type="button" class="boton" data-agenda-restaurar="${i}">Retomar agenda guardada</button></li>`;
    }).join("");
    return respuestas + (pendientes ? `<section id="agendas-guardadas"><h2>Agendas pendientes guardadas</h2><ul>${pendientes}</ul></section>` : "");
  }

  function tiempoAgotadoHtml() {
    const estado = estadoDeLaSesion();
    if (!estado || !estado.presupuestoAgotado || estado.terminada) return "";
    const r = Sesion.resumen(estado, modoSesion());
    const decidir = typeof PlanHoy !== "undefined" && PlanHoy.decidirAlAgotar
      ? PlanHoy.decidirAlAgotar({ respondidas: r.respondidas, pendientes: r.pendientes })
      : { continuar: {}, pausar: {}, terminar: {} };
    return `<section class="sesion-agotada" id="sesion-agotada" data-respondidas="${r.respondidas}" data-pendientes="${r.pendientes}">
        <h2>Se ha acabado el tiempo de Hoy</h2>
        <p>Has respondido <strong>${r.respondidas}</strong> y quedan <strong>${r.pendientes}</strong>. No se ha entregado ni descartado nada: lo que llevas hecho está guardado.</p>
        <p class="acciones-fila">
          <button type="button" class="boton activo" data-sesion-agotada="continuar">Seguir un poco más</button>
          <a class="boton" href="#/">Pausar y volver luego</a>
          <button type="button" class="boton" data-sesion-agotada="terminar">Terminar la sesión</button>
        </p>
        <p class="nota-pie">${esc(decidir.continuar.efecto || "")} · ${esc(decidir.pausar.efecto || "")} · ${esc(decidir.terminar.efecto || "")}</p>
      </section>`;
  }

  // ── Biblioteca y búsqueda facetada (T21) ───────────────────────────────────
  // Estado en la URL: consulta~ruta~nivel. Volver atrás conserva los resultados porque no hay
  // estado en memoria que perder.
  function partesDeBusqueda(arg) {
    const crudo = String(arg || "");
    const [consulta = "", ruta = "", nivel = "", tipo = "", pagina = "1", orden = "", solo = ""] = crudo.split("~");
    // Un decode fallido no puede romper la pantalla: se queda el texto tal cual.
    const des = (x) => { try { return decodeURIComponent(x); } catch { return String(x || ""); } };
    const tipos = ["", "concept", "lab", "project"];
    // F04 · El orden viaja en la URL, así que un enlace compartido conserva cómo estaba ordenada la
    // lista. «Relevancia» es el de siempre y no se escribe en la URL para no alargar los enlaces.
    const ordenes = ["", "alfabetico"];
    // F04 · Sobre qué conjunto se busca: todo el catálogo (por defecto) o solo lo que está descargado
    // en este equipo. Se declara en la URL para que un enlace no cambie de significado al abrirlo.
    const conjuntos = ["", "descargado"];
    return { consulta: des(consulta), ruta: des(ruta), nivel: des(nivel), tipo: tipos.includes(tipo) ? tipo : "", pagina: Number.isSafeInteger(Number(pagina)) && Number(pagina) > 0 ? Math.min(Number(pagina), 100) : 1, orden: ordenes.includes(orden) ? orden : "", solo: conjuntos.includes(solo) ? solo : "" };
  }
  // El enlace lleva los cuatro campos. Los enlaces antiguos de tres siguen funcionando: el tipo que
  // falta se lee como vacío, que significa «todos».
  // T21 · `~` separa los campos de esta ruta y `encodeURIComponent` NO lo escapa:
  // buscar «a~b» se partia en consulta «a» y faceta «b». Se codifica a mano.
  const campoBusqueda = (x) => encodeURIComponent(String(x ?? "")).replace(/~/g, "%7E");
  const enlaceBusqueda = (consulta, ruta, nivel, tipo, pagina = 1, orden = "", solo = "") => {
    // Solo se escriben los campos que llevan algo: una búsqueda simple queda «#/buscar/churn»,
    // sin las seis tildes históricas. El lector antiguo sigue aceptándolas.
    const campos = [consulta ?? "", ruta ?? "", nivel ?? "", tipo || ""];
    if (pagina > 1 || orden || solo) {
      campos.push(pagina > 1 ? String(pagina) : "");
      if (orden || solo) campos.push(orden);
      if (solo) campos.push(solo);
    }
    while (campos.length > 1 && campos[campos.length - 1] === "") campos.pop();
    return "#/buscar/" + campos.map(campoBusqueda).join("~");
  };

  // T21 · El formulario es GET con `action="#/buscar"`, así que enviaba a `#/buscar?q=…` y el
  // enrutador no acepta `?` dentro del hash: terminaba en «Esa dirección no lleva a ninguna parte».
  // Se intercepta y se navega al formato real, CONSERVANDO las facetas que ya estuvieran puestas.
  // Va aquí, en el arranque, y no dentro de `render()`: dentro se acumularía un oyente por repintado.
  document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (!form || form.id !== "buscador") return;
    ev.preventDefault();
    const caja = form.querySelector('input[name="q"]');
    const consulta = caja ? String(caja.value || "") : "";
    const actual = String(location.hash || "").replace(/^#\/buscar\/?/, "");
    const f = partesDeBusqueda(actual);
    location.hash = enlaceBusqueda(consulta, f.ruta, f.nivel, f.tipo, 1, f.orden, f.solo);
  });

  // ── Favoritos y colecciones (T22) ───────────────────────────────────────────
  // La colección vive en su propio almacén, así que marcar o desmarcar NO toca el dominio de la
  // ficha: no cambia el progreso ni la evidencia. Solo la lista.
  // ── Mapa de conocimiento (T23) ──────────────────────────────────────────────
  // La URL lleva: <vista>~<filtro>~<elegido>. Si algo sobra o falta, se lee como vacío: la pantalla
  // no se rompe por un enlace incompleto.
  const ESTADOS_MAPA = [
    { clave: "", etiqueta: "todos" },
    { clave: "pendiente", etiqueta: "sin empezar" },
    { clave: "medias", etiqueta: "a medias" },
    { clave: "hecho", etiqueta: "hechos" },
    { clave: "dominado", etiqueta: "dominados" },
  ];
  function estadoDeMapa(id) {
    const r = progreso[id] || {};
    if (r.dominado) return "dominado";
    if (r.practica || r.intentos || r.leido) return "medias";
    if (r.visto) return "medias";
    return "pendiente";
  }
  const ROTULO_ESTADO_MAPA = { pendiente: "sin empezar", medias: "a medias", hecho: "hecho", dominado: "dominado" };
  const enlaceMapa = (vista2, filtro, elegido) =>
    "#/mapa/" + encodeURIComponent(vista2) + "~" + encodeURIComponent(filtro) + "~" + encodeURIComponent(elegido || "");

  // ── Notas con anclaje (T24) ─────────────────────────────────────────────────
  // Una nota puede venir del formato viejo (una cadena) o del nuevo ({texto, seccion, ts}). Se
  // normaliza al leer para que la lista y la exportación no tengan que saber de dos formas.
  function notaNormalizada(id) {
    const cruda = notas[id];
    if (typeof cruda === "string") return { texto: cruda, seccion: "", ts: null };
    if (cruda && typeof cruda === "object") {
      return {
        texto: typeof cruda.texto === "string" ? cruda.texto : "",
        seccion: typeof cruda.seccion === "string" ? cruda.seccion : "",
        ts: typeof cruda.ts === "number" ? cruda.ts : null,
      };
    }
    return null;
  }
  const notasVivas = () => Object.keys(notas || {})
    .map((id) => ({ id, ...(notaNormalizada(id) || { texto: "", seccion: "", ts: null }) }))
    .filter((n) => String(n.texto).trim() !== "");

  function exportarNotasMarkdown() {
    const lista = notasVivas();
    const lineas = ["# Notas de " + (window.Marca ? window.Marca.NOMBRE : "el portal"), ""];
    for (const n of lista) {
      const c = P.conceptos[n.id] || {};
      lineas.push("## " + (c.t || n.id));
      lineas.push("");
      lineas.push("- Concepto: `" + n.id + "`");
      if (n.seccion) lineas.push("- Sección: " + n.seccion);
      if (n.ts) lineas.push("- Fecha: " + new Date(n.ts).toISOString().slice(0, 10));
      lineas.push("");
      // El cuerpo va como cita en bloque, para que no se confunda con el marcado del documento.
      lineas.push(String(n.texto).split("\n").map((l) => "> " + l).join("\n"));
      lineas.push("");
    }
    return lineas.join("\n");
  }

  // ── Dudas con papelera (T25) ────────────────────────────────────────────────
  const ESTADOS_DUDA = [
    { clave: "", etiqueta: "todas" },
    { clave: "abierta", etiqueta: "abiertas" },
    { clave: "resuelta", etiqueta: "resueltas" },
    { clave: "papelera", etiqueta: "papelera" },
  ];

  vistas.dudas = (arg) => {
    vaciarPapelera();
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* se queda tal cual */ }
    const [estado = "", consulta = ""] = crudo.split("~");
    const filtroEstado = ESTADOS_DUDA.some((e) => e.clave === estado) ? estado : "";

    const todas = Object.entries(dudas || {});
    const enPapelera = (d) => !!(d && d.borrada);
    const delEstado = (d) => (enPapelera(d) ? "papelera" : (d && d.estado) || "abierta");
    const filtradas = todas.filter(([, d]) => !filtroEstado || delEstado(d) === filtroEstado);
    const conTexto = consulta
      ? filtradas.filter(([, d]) => String(d.texto + " " + (d.explicacion || "") + " " + (d.seccion || "")).toLowerCase().includes(consulta.toLowerCase()))
      : filtradas;

    const cuenta = (clave) => todas.filter(([, d]) => delEstado(d) === clave).length;
    const filtros = ESTADOS_DUDA.map((e) => {
      const n = e.clave ? cuenta(e.clave) : todas.length;
      return `<a class="boton${filtroEstado === e.clave ? " activo" : ""}" href="#/dudas/${encodeURIComponent(e.clave)}~">${esc(e.etiqueta)} (${n})</a>`;
    }).join(" ");

    const filas = conTexto.map(([id, d]) => {
      const c = d.concepto ? P.conceptos[d.concepto] : null;
      const est = delEstado(d);
      const acciones = est === "papelera"
        ? `<button type="button" class="boton" data-duda-restaurar="${esc(id)}">Restaurar</button>`
        : est === "resuelta"
          ? `<p class="nota-pie"><strong>Se resolvió:</strong> ${esc(d.explicacion || "(sin explicación)")}</p>
             <button type="button" class="boton" data-duda-reabrir="${esc(id)}">Reabrir</button>
             <button type="button" class="boton" data-duda-borrar="${esc(id)}">Mover a la papelera</button>`
          : `<form class="form-duda" data-duda-resolver-form="${esc(id)}">
               <label class="nota-pie" for="exp-${esc(id)}">Qué la resolvió</label>
               <input type="text" id="exp-${esc(id)}" data-duda-explicacion="${esc(id)}" placeholder="la explicación o dónde está" />
               <button type="submit" class="boton activo">Resolver</button>
             </form>
             <button type="button" class="boton" data-duda-borrar="${esc(id)}">Mover a la papelera</button>`;
      return `<li class="duda-fila" data-duda-id="${esc(id)}">
        <p><span class="pastilla estado-${est}">${esc(est)}</span>
          ${c ? `<a href="#/c/${esc(d.concepto)}">${esc(c.t)}</a>` : esc(d.concepto || "sin ficha")}
          ${d.seccion ? `<span class="nota-pie">· ${esc(d.seccion)}</span>` : ""}</p>
        <p class="duda-texto">${esc(d.texto)}</p>
        ${acciones}
      </li>`;
    }).join("");

    return `<div class="migas"><a href="#/">Inicio</a> › Dudas</div>
      <h1>Dudas</h1>
      <p class="acciones-fila" role="group" aria-label="Filtrar por estado">${filtros}</p>

      <form class="form-duda" id="nueva-duda">
        <label class="nota-pie" for="duda-texto">Añadir una duda</label>
        <input type="text" id="duda-texto" data-duda-nueva="1" placeholder="qué no te cuadra" />
        <label class="nota-pie" for="duda-concepto">Ficha a la que pertenece (opcional)</label>
        <input type="text" id="duda-concepto" data-duda-concepto="1" placeholder="título o palabra" />
        <button type="submit" class="boton activo">Guardar la duda</button>
        <span class="nota-pie" id="duda-aviso" role="status"></span>
      </form>

      ${conTexto.length
        ? `<ul class="lista-dudas" id="lista-dudas">${filas}</ul>`
        : `<section class="sin-resultados estado-vacio" id="dudas-vacio">
            <h2 class="estado-titulo">${todas.length ? "Ninguna duda en este estado" : "Todavía no hay dudas"}</h2>
            <p>${todas.length ? "Prueba con otro estado." : "Apunta una arriba cuando algo no te cuadre. Se puede resolver, borrar y restaurar."}</p>
            <p class="acciones-fila"><a class="boton" href="#/dudas/">Ver todas</a> <a class="boton" href="#/mapa">Ir al mapa</a></p>
          </section>`}
      <p class="nota-pie">La papelera conserva ${DIAS_PAPELERA} días: borrar es reversible y, pasado ese plazo, se vacía sola. Borrar no pierde ni el texto ni la ficha a la que estaba anclada.</p>`;
  };

  vistas.notas = (arg) => {
    // El enrutador parte el hash y no decodifica: un filtro con tilde llega como %C3%B3 y no
    // encontraría nada. Se decodifica aquí, tolerando un escape incompleto.
    let crudoFiltro = String(arg || "");
    try { crudoFiltro = decodeURIComponent(crudoFiltro); } catch { /* se queda tal cual */ }
    const filtro = crudoFiltro.trim();
    const todas = notasVivas();
    const normal = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const fichas = todas.filter((n) => {
      if (!filtro) return true;
      const c = P.conceptos[n.id] || {};
      const heno = normal([n.texto, c.t || "", n.id, n.seccion].join(" "));
      return normal(filtro).split(/\s+/).filter(Boolean).every((t) => heno.includes(t));
    });

    const filas = fichas.map((n) => {
      const c = P.conceptos[n.id] || {};
      return `<li class="nota-fila" data-nota-id="${esc(n.id)}">
        <p><strong>${esc(c.t || n.id)}</strong>
          <span class="nota-pie">${n.seccion ? " · " + esc(n.seccion) : ""}${n.ts ? " · " + esc(new Date(n.ts).toLocaleDateString("es-ES")) : ""}</span></p>
        <p class="nota-cuerpo">${esc(n.texto)}</p>
        <p class="acciones-fila">
          <a class="boton" href="#/c/${esc(n.id)}">Ir a su ficha</a>
          <button type="button" class="boton" data-borrar-nota="${esc(n.id)}">Borrar la nota</button>
        </p>
      </li>`;
    }).join("");

    const sinNada = todas.length === 0;
    const sinResultados = !sinNada && fichas.length === 0;

    return `<div class="migas"><a href="#/">Inicio</a> › Notas</div>
      <h1>Notas</h1>
      <form class="buscador" id="buscador-notas" role="search" action="#/notas" method="get">
        <label class="nota-pie" for="q-notas">Buscar en tus notas y en su origen</label>
        <input type="search" id="q-notas" name="q" value="${esc(filtro)}" autocomplete="off" />
        <button type="submit" class="boton activo">Buscar</button>
      </form>
      <p class="acciones-fila">
        <span class="pastilla" id="notas-cuenta">${fichas.length} de ${todas.length} nota${todas.length === 1 ? "" : "s"}</span>
        <button type="button" class="boton" id="exportar-notas-md">Descargar en Markdown</button>
        <button type="button" class="boton" id="exportar-notas-json">Descargar en JSON</button>
      </p>
      ${sinNada ? `<div class="estado-vacio"><p class="estado-titulo">Todavía no has escrito ninguna nota</p>
        <p>Cada ficha tiene un campo de nota al final; lo que escribas aparece aquí con su origen.</p>
        <p class="acciones-fila"><a class="boton activo" href="#/buscar/">Buscar una ficha donde anotar</a></p></div>`
        : sinResultados ? `<section class="sin-resultados estado-vacio" id="notas-sin-resultados">
            <h2 class="estado-titulo">Ninguna nota coincide</h2>
            <p>No hay notas con «${esc(filtro)}» ni en el cuerpo ni en el origen.</p>
            <p class="acciones-fila"><a class="boton" href="#/notas/">Ver todas</a> <a class="boton" href="#/buscar/">Buscar en el temario</a></p>
          </section>`
        : `<ul class="lista-notas" id="notas-lista">${filas}</ul>`}
      <p class="nota-pie">El cuerpo de una nota se muestra siempre como texto: lo que escribes no se ejecuta nunca. Y si una ficha cambia de revisión, la nota conserva su concepto y su sección.</p>`;
  };

  vistas.mapa = (arg) => {
    const crudo = String(arg || "");
    const [vista2 = "", filtro = "", elegido = ""] = crudo.split("~");
    const modo = vista2 === "mapa" ? "mapa" : "lista";
    const filtroOk = ESTADOS_MAPA.some((e) => e.clave === filtro) ? filtro : "";
    const enFiltro = (id) => !filtroOk || estadoDeMapa(id) === filtroOk;

    const ids = orden.map((c) => c.id).filter((id) => P.conceptos[id] && enFiltro(id));
    const total = orden.length;
    const cuenta = (clave) => orden.filter((c) => estadoDeMapa(c.id) === clave).length;

    const filtros = ESTADOS_MAPA.map((e) => {
      const n = e.clave ? cuenta(e.clave) : total;
      return `<a class="boton${filtroOk === e.clave ? " activo" : ""}" href="${enlaceMapa(modo, e.clave, "")}">${esc(e.etiqueta)} (${n})</a>`;
    }).join(" ");

    const conmutador = `<p class="acciones-fila" role="group" aria-label="Cómo ver el mapa">
        <a class="boton${modo === "lista" ? " activo" : ""}" href="${enlaceMapa("lista", filtroOk, elegido)}">Lista (accesible)</a>
        <a class="boton${modo === "mapa" ? " activo" : ""}" href="${enlaceMapa("mapa", filtroOk, elegido)}">Mapa</a>
      </p>`;

    // El detalle es el mismo en las dos vistas: prerrequisitos explicados y para qué sirve.
    const detalle = (id) => {
      const c = P.conceptos[id] || {};
      const pre = (c.p || []).map((x) => P.conceptos[x] ? `<a href="#/c/${esc(x)}">${esc(P.conceptos[x].t)}</a>` : esc(x));
      return `<section class="detalle-mapa" id="detalle-mapa" aria-live="polite">
        <h2>${esc(c.t || id)}</h2>
        <p><strong>Estado:</strong> ${esc(ROTULO_ESTADO_MAPA[estadoDeMapa(id)])} · <strong>Nivel:</strong> ${esc(c.n || "")}</p>
        <p><strong>Para qué sirve:</strong> ${esc(c.s || "sin resumen")}</p>
        <p><strong>Necesitas antes:</strong> ${pre.length ? pre.join(", ") : "nada, se puede empezar por aquí"}.</p>
        <p class="acciones-fila"><a class="boton activo" href="#/c/${esc(id)}">Abrir la ficha</a></p>
      </section>`;
    };

    const cuerpoLista = `<ol class="lista-mapa" id="mapa-lista">${ids.map((id) => {
      const c = P.conceptos[id] || {};
      const est = estadoDeMapa(id);
      return `<li class="mapa-fila estado-${est}${id === elegido ? " elegido" : ""}">
        <a href="${enlaceMapa("lista", filtroOk, id)}" aria-current="${id === elegido ? "true" : "false"}"><strong>${esc(c.t || id)}</strong></a>
        <span class="nota-pie">${esc(c.n || "")} · ${esc(ROTULO_ESTADO_MAPA[est])} · fase ${esc(String(c.f))}</span>
      </li>`;
    }).join("")}</ol>`;

    const cuerpoMapa = `<div class="reticula-mapa" id="mapa-reticula" role="group" aria-label="Mapa de conceptos">
      ${ids.map((id) => {
        const c = P.conceptos[id] || {};
        const est = estadoDeMapa(id);
        return `<button type="button" class="nodo-mapa estado-${est}${id === elegido ? " elegido" : ""}"
          data-mapa-nodo="${esc(id)}" aria-pressed="${id === elegido}"
          title="${esc(c.t || id)} — ${esc(ROTULO_ESTADO_MAPA[est])}"><span class="nodo-fase">${esc(String(c.f))}</span>${esc((c.t || id).slice(0, 28))}</button>`;
      }).join("")}
    </div>`;

    return `<div class="migas"><a href="#/">Inicio</a> › Mapa</div>
      <h1>Mapa de conocimiento</h1>
      <p class="nota-pie">Las dos vistas enseñan lo mismo: la lista es la accesible y el mapa es una retícula de botones que se recorre con Tab. Elegir no arrastra nada.</p>
      ${conmutador}
      <p class="acciones-fila" role="group" aria-label="Filtrar por estado">${filtros}</p>
      ${modo === "mapa" ? cuerpoMapa : cuerpoLista}
      ${elegido && P.conceptos[elegido] ? detalle(elegido) : `<p class="nota-pie" id="detalle-mapa">Elige un concepto para ver sus prerrequisitos y para qué sirve.</p>`}`;
  };

  vistas.favoritos = () => {
    const claves = Object.keys(favoritos || {});
    // Un recurso retirado no puede romper la lista: se separa lo que existe de lo que ya no.
    const vivos = claves.filter((id) => P.conceptos[id]);
    const retirados = claves.filter((id) => !P.conceptos[id]);
    const cuando = (ts) => (typeof ts === "number" ? new Date(ts).toLocaleDateString("es-ES") : "");

    const filaViva = (id) => {
      const c = P.conceptos[id] || {};
      return `<li><a href="#/c/${esc(id)}">${esc(c.t || id)}</a>
        <span class="nota-pie">${esc(c.n || "")} · desde ${esc(cuando(favoritos[id] && favoritos[id].ts))}</span>
        <button type="button" class="boton" data-favorito="${esc(id)}" aria-pressed="true">Quitar</button></li>`;
    };
    const filaRetirada = (id) => `<li><span class="nota-pie">${esc(id)}</span>
        <span class="nota-pie">· este recurso ya no está publicado</span>
        <button type="button" class="boton" data-favorito="${esc(id)}" aria-pressed="true">Quitar de la lista</button></li>`;

    if (!claves.length) {
      return `<div class="migas"><a href="#/">Inicio</a> › Favoritos</div>
        <h1>Favoritos</h1>
        <div class="estado-vacio"><p class="estado-titulo">Todavía no has guardado ninguna ficha</p>
        <p>En cualquier ficha hay un botón «Marcar favorita» que la añade a esta lista, y se queda en este equipo.</p>
        <p class="acciones-fila"><a class="boton activo" href="#/buscar/">Buscar algo que guardar</a> <a class="boton" href="#/glosario">Ver el glosario</a></p></div>`;
    }

    const total = vivos.length + retirados.length;
    return `<div class="migas"><a href="#/">Inicio</a> › Favoritos</div>
      <h1>Favoritos</h1>
      <p class="acciones-fila">
        <span class="pastilla" id="favoritos-cuenta">${total} guardado${total === 1 ? "" : "s"}${retirados.length ? `, ${retirados.length} retirado${retirados.length === 1 ? "" : "s"}` : ""}</span>
        <a class="boton" href="#/buscar/">Añadir más</a>
      </p>
      ${vivos.length ? `<h2>En la colección</h2><ul class="lista-favoritos" id="favoritos-vivos">${vivos.map(filaViva).join("")}</ul>` : ""}
      ${retirados.length ? `<h2>Recursos retirados</h2>
        <p class="nota-pie">Estaban guardados y ya no se publican. No se borran solos: los quitas tú, para que no desaparezca nada sin que lo sepas.</p>
        <ul class="lista-favoritos" id="favoritos-retirados">${retirados.map(filaRetirada).join("")}</ul>` : ""}
      <p class="nota-pie">Guardar un favorito no marca nada como aprendido: la colección es una lista de consulta, no evidencia.</p>`;
  };

  vistas.buscar = (arg, disponibilidadLocal) => {
    const f = partesDeBusqueda(arg);
    const cabecera = `<div class="migas"><a href="#/">Inicio</a> › Biblioteca</div>
      <h1>Biblioteca</h1>
      <form class="buscador" id="buscador" role="search" action="#/buscar" method="get">
        <label class="nota-pie" for="q-biblioteca">Buscar por concepto, etiqueta o fórmula</label>
        <input type="search" id="q-biblioteca" name="q" value="${esc(f.consulta)}" autocomplete="off" />
        <button type="submit" class="boton activo">Buscar</button>
      </form>
      <p class="nota-pie">Se puede escribir sin tildes y con alguna errata: la búsqueda perdona las dos.</p>`;

    // SIN_RETORNO_TEMPRANO: con la consulta vacía se sigue al catálogo (T21).

    // El índice se carga la primera vez; mientras tanto se dice, no se finge.
    if (f.consulta.trim() && !window.BUSQUEDA && !errorBusqueda) {
      cargarBusqueda().then(() => render()).catch(() => render());
      return cabecera + `<p id="cargando-biblioteca" class="nota-pie">Cargando el índice de búsqueda (la primera vez tarda un poco)…</p>
        <div id="resultados-biblioteca" data-consulta="${esc(f.consulta)}"></div>`;
    }

    // La forma del resultado se tolera: el motor puede devolver ids o filas.
    const sinConsulta = !String(f.consulta || "").trim();
    const CATALOGO_BIBLIOTECA = Object.keys(CATALOGO);
    const crudos = sinConsulta ? CATALOGO_BIBLIOTECA : (buscar(f.consulta, Infinity) || []);
    let ids = crudos.map((r) => (typeof r === "string" ? r : (r && (r.id || r[0])))).filter((x) => typeof x === "string");

    // Facetas, combinadas entre sí.
    const cumple = (id) => {
      const c = CATALOGO[id] || {};
      if (f.tipo && (c.resourceType || "concept") !== f.tipo) return false;
      if (f.ruta && !(c.r || []).includes(f.ruta)) return false;
      if (f.nivel && c.n !== f.nivel) return false;
      return true;
    };
    const antesDeFiltrar = ids.length;
    ids = ids.filter(cumple);
    // El proveedor verifica bytes y dependencias de los tres tipos antes de pintar.
    // Un recibo de localStorage o un descriptor parcial nunca acredita una descarga.
    if (f.solo === "descargado") {
      ids = ids.filter((id) => disponibilidadLocal?.completos.has(id));
    }

    const facetas = (rotulo, actual, opciones, campo) => `<p class="nota-pie biblioteca-facetas">${esc(rotulo)}: ` +
      `<a class="boton${actual === "" ? " activo" : ""}" href="${enlaceBusqueda(f.consulta, campo === "ruta" ? "" : f.ruta, campo === "nivel" ? "" : f.nivel, f.tipo, 1, f.orden, f.solo)}">todas</a> ` +
      opciones.map(([v, etiqueta]) => `<a class="boton${actual === v ? " activo" : ""}" href="${enlaceBusqueda(f.consulta, campo === "ruta" ? v : f.ruta, campo === "nivel" ? v : f.nivel, f.tipo, 1, f.orden, f.solo)}">${esc(etiqueta)}</a>`).join(" ") +
      "</p>";

    const TIPOS = [
      { clave: "", etiqueta: "todos" },
      { clave: "concept", etiqueta: "conceptos" },
      { clave: "lab", etiqueta: "laboratorios" },
      { clave: "project", etiqueta: "proyectos" },
    ];
    const rutas = Object.entries(P.rutas || {}).map(([k, v]) => [k, v.nombre || k]);
    const niveles = Array.isArray(P.niveles)
      ? P.niveles.map((nivel) => [nivel, nivel])
      : Object.entries(P.niveles || {}).map(([k, v]) => [k, typeof v === "string" ? v : k]);

    const MUESTRA_LIMITE = 60 * f.pagina;
      // F04 · POR QUÉ aparece cada resultado. Una lista filtrada que no dice qué coincidió obliga a
      // abrir el recurso para saberlo, y no distingue un acierto de título de uno de descripción o de
      // etiqueta. Devuelve el campo y el trozo que coincide, o null si no hay consulta.
      const motivoDe = (id) => {
        const q = String(f.consulta || "").trim().toLowerCase();
        if (!q) return null;
        const c = CATALOGO[id] || {};
        const trozo = (texto) => {
          const t = String(texto || "");
          const i = t.toLowerCase().indexOf(q);
          if (i < 0) return null;
          return t.slice(Math.max(0, i - 18), i + q.length + 18);
        };
        const enTitulo = trozo(c.t);
        if (enTitulo) return { campo: "título", texto: enTitulo };
        const enDescripcion = trozo(c.s);
        if (enDescripcion) return { campo: "descripción", texto: enDescripcion };
        const etiquetas = Array.isArray(c.etiquetas) ? c.etiquetas : Array.isArray(c.tags) ? c.tags : [];
        const enEtiqueta = etiquetas.find((e) => String(e).toLowerCase().includes(q));
        if (enEtiqueta) return { campo: "etiqueta", texto: String(enEtiqueta) };
        // F04 · Si no está en título, descripción ni etiquetas, se busca en el TEXTO del índice, que es
        // lo que el motor usa para encontrar la coincidencia. Antes se decía «contenido» sin más: era
        // honesto pero no explicaba nada.
        const indice = Array.isArray(window.BUSQUEDA) ? window.BUSQUEDA.find((e) => e && e.id === id) : null;
        if (indice && typeof indice.x === "string") {
          const piezas = indice.x.split("\u0001");
          const secciones = [["etiqueta", piezas[1] || ""], ["resumen", piezas[2] || ""], ["contenido de la ficha", piezas.slice(3).join(" ")]];
          for (const [campo, texto] of secciones) {
            const i = texto.toLowerCase().indexOf(q);
            if (i >= 0) return { campo, texto: texto.slice(Math.max(0, i - 30), i + q.length + 30) };
          }
        }
        return { campo: "coincidencia parcial", texto: q };
      };
      // F04 · El orden se aplica AQUÍ, justo antes de pintar: es el punto que alimenta las filas.
      const listaOrdenada = f.orden === "alfabetico"
        ? [...ids].sort((a, b) => String((CATALOGO[a] || {}).t || a).localeCompare(String((CATALOGO[b] || {}).t || b), "es"))
        : ids;
      const filas = listaOrdenada.slice(0, MUESTRA_LIMITE).map((id) => {
      const c = CATALOGO[id] || {};
      const proyectoId = c.resourceType === "project" ? String(id).replace(/^proj:/, "") : "";
      const paquete = proyectoId && window.PAQUETES ? window.PAQUETES[proyectoId] : null;
      const descarga = paquete
        ? `<a class="boton enlace-descarga" href="paquetes/${esc(paquete.archivo)}" download aria-label="Descargar el ZIP de ${esc(c.t || proyectoId)}">Descargar ZIP${Number.isFinite(Number(paquete.bytes)) ? ` · ${Math.round(Number(paquete.bytes) / 1024)} KB` : ""}</a>`
        : "";
      return `<li data-recurso="${esc(id)}"><a href="${esc(enlaceRecurso(id))}">${esc(c.t || id)}</a>
        <span class="nota-pie">${esc(({ concept: "Concepto", lab: "Laboratorio", project: "Proyecto" })[c.resourceType || "concept"])} · ${esc(c.n || "")} · ${esc((c.r || []).join(", "))}</span>
        ${c.s ? `<p class="nota-pie">${esc(c.s)}</p>` : ""}${descarga ? `<span class="fila-acciones">${descarga}</span>` : ""}${(() => { const m = motivoDe(id); return m ? `<p class="nota-pie motivo-coincidencia" data-motivo="${esc(m.campo)}">coincide en ${esc(m.campo)}: «…${esc(m.texto)}…»</p>` : ""; })()}<span class="nota-pie" data-offline-id="${esc(id)}">Sin conexión: comprobando…</span></li>`;
    }).join("");

    const facetasTipo = `<p class="nota-pie biblioteca-facetas">Tipo: ` +
      TIPOS.map((t) => `<a class="boton${f.tipo === t.clave ? " activo" : ""}" href="${enlaceBusqueda(f.consulta, f.ruta, f.nivel, t.clave, 1, f.orden, f.solo)}">${esc(t.etiqueta)}</a>`).join(" ") +
      "</p>";

    // Sin gestor de paquetes no se puede afirmar nada sobre lo descargado. Se dice lo que hay.
    // T21 · La disponibilidad se COMPRUEBA con lo que hay guardado y su huella; no se afirma de memoria.
    // Si no se puede leer el almacén, se dice «desconocido», que no es lo mismo que «completo».
    const disponibilidadAun = '<p class="nota-pie" id="disponibilidad" role="status">Comprobando disponibilidad sin conexión…</p>';

    // F04 · El orden se elige aquí y viaja en la URL: los dos enlaces conservan consulta, facetas y
    // página, así que cambiar de orden no pierde nada de lo que la persona había puesto.
    const ORDENES = [{ clave: "", etiqueta: "relevancia" }, { clave: "alfabetico", etiqueta: "alfabético" }];
    const facetasOrden = `<p class="nota-pie biblioteca-orden" id="biblioteca-orden" data-orden="${esc(f.orden)}">Orden: ` +
      ORDENES.map((o) => `<a class="boton${f.orden === o.clave ? " activo" : ""}" data-orden-clave="${esc(o.clave)}" href="${enlaceBusqueda(f.consulta, f.ruta, f.nivel, f.tipo, 1, o.clave, f.solo)}">${esc(o.etiqueta)}</a>`).join(" ") +
      "</p>";

    // F04 · Sobre qué conjunto se busca. Sin esto, «84 resultados» no dice si son del catálogo entero o
    // de lo que hay descargado, que es la diferencia entre poder abrirlos sin red o no.
    const CONJUNTOS = [{ clave: "", etiqueta: "todo el catálogo" }, { clave: "descargado", etiqueta: "solo lo descargado" }];
    const facetasConjunto = `<p class="nota-pie biblioteca-conjunto" id="biblioteca-conjunto" data-conjunto="${esc(f.solo)}">Buscar en: ` +
      CONJUNTOS.map((c) => `<a class="boton${f.solo === c.clave ? " activo" : ""}" data-conjunto-clave="${esc(c.clave)}" href="${enlaceBusqueda(f.consulta, f.ruta, f.nivel, f.tipo, 1, f.orden, c.clave)}">${esc(c.etiqueta)}</a>`).join(" ") +
      "</p>";

    const cuerpo = ids.length
      ? `<p><strong>${ids.length}</strong> ${sinConsulta ? "recurso(s) en el catálogo" : `resultado(s) para «${esc(f.consulta)}»`}${antesDeFiltrar !== ids.length ? ` (de ${antesDeFiltrar} sin filtrar)` : ""}.</p>
         <ul class="resultados-biblioteca" id="resultados-biblioteca" data-consulta="${esc(f.consulta)}">${filas}</ul>
         ${ids.length > MUESTRA_LIMITE ? `<p class="nota-pie" id="biblioteca-recorte">Se muestran ${MUESTRA_LIMITE} de ${ids.length}. <a class="boton" href="${enlaceBusqueda(f.consulta, f.ruta, f.nivel, f.tipo, f.pagina + 1, f.orden, f.solo)}">Mostrar 60 más</a></p>` : ""}
           ${disponibilidadAun}`
      : `<section class="sin-resultados estado-vacio" id="resultados-biblioteca" data-consulta="${esc(f.consulta)}">
          <h2 class="estado-titulo">Nada coincide</h2>
          <p>No hay ningún recurso para «${esc(f.consulta)}»${f.ruta || f.nivel ? " con esas facetas" : ""}. Puedes:</p>
          <p class="acciones-fila">
            <a class="boton" href="${enlaceBusqueda(f.consulta, "", "", "", 1, f.orden, f.solo)}">Quitar las facetas</a>
            <a class="boton" href="#/glosario">Ver el glosario entero</a>
            <a class="boton" href="#/buscar/">Probar otra palabra</a>
          </p>
        </section>`;

    const avisoIndice = errorBusqueda ? `<p role="status" id="biblioteca-error-indice">No se ha podido cargar el índice completo. La búsqueda sigue disponible en títulos y resúmenes.
      <button type="button" class="boton" data-busqueda-reintentar="1">Reintentar índice completo</button></p>` : "";
    const avisoDisponibilidad = f.solo === "descargado" && !disponibilidadLocal?.legible
      ? '<p role="status" id="biblioteca-error-almacen">No se ha podido comprobar lo descargado en este equipo. Reintenta la comprobación o vuelve al catálogo completo.</p>'
      : "";
    const facetasContenido =
      facetasTipo +
      facetas("Ruta", f.ruta, rutas, "ruta") +
      facetas("Nivel", f.nivel, niveles, "nivel") +
      facetasOrden +
      facetasConjunto;
    // En móvil, ruta/nivel/orden (y el resto) viven bajo «Filtros», cerrado por defecto, para que
    // los resultados queden por encima del pliegue. En escritorio se oculta el resumen y se ve todo.
    const filtrosActivos = [f.ruta, f.nivel, f.orden, f.tipo, f.solo].filter(Boolean).length;
    const facetasHtml = `<details class="filtros-busqueda" id="filtros-busqueda" open>
      <summary>Filtros${filtrosActivos ? ` · ${filtrosActivos}` : ""}</summary>
      <div class="filtros-cuerpo">${facetasContenido}</div>
    </details>`;
    // Sin resultados, el mensaje va ANTES que las facetas: es lo primero que se lee al buscar.
    return cabecera + avisoIndice + avisoDisponibilidad +
      (ids.length ? facetasHtml + cuerpo : cuerpo + facetasHtml);
  };

  vistas.sesion = () => {
    if (typeof Sesion === "undefined") return estadoNoDisponible();
    const estado = estadoDeLaSesion();
    const r = Sesion.resumen(estado, modoSesion());
    if (!r.planificadas) {
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>
        ${recuperacionSesionHtml()}
        <p>No hay preguntas que ofrecer con la ruta actual. <a href="#/orientacion">Cambia de ruta</a> o <a href="#/buscar">busca un concepto</a>.</p>`;
    }
    const it = estado.items[estado.posicion];
    const c = it ? P.conceptos[it.concepto] || {} : null;
    const cuerpo = r.terminada || !it
      ? `<section class="sesion-final" id="sesion-final">
          <h2>Sesión terminada</h2>
          <p><strong>${r.completadas}</strong> de ${r.planificadas} preguntas completadas. Las planificadas eran ${r.planificadas}: lo que cuenta es lo que has hecho, no lo que estaba previsto.</p>
          <p class="acciones-fila"><a class="boton activo" href="#/sesion?nueva=1">Empezar otra</a> <a class="boton" href="#/">Volver</a></p>
        </section>`
      : `<section class="sesion-paso" id="sesion-paso">
          <p class="nota-pie">Pregunta ${estado.posicion + 1} de ${r.planificadas} del plan · ${it.concepto}</p>
          <h2>${esc(c.t || it.concepto)}</h2>
          <p>Esta es la pregunta ${it.indice + 1} de ${(P.conceptos[it.concepto] || {}).q || 1} de la ficha. Se responde allí, donde está el enunciado y su explicación.</p>
          <p class="acciones-fila">
            <a class="boton activo" href="#/c/${esc(it.concepto)}">Ir a la pregunta</a>
            <button type="button" class="boton" data-sesion-omitir="1">Omitir esta</button>
            <a class="boton" href="#/">Salir (se guarda)</a>
          </p>
        </section>`;
    return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
      <h1>Sesión de estudio</h1>
      ${planDeHoyHtml()}
      <p class="acciones-fila">
        <span class="pastilla" id="sesion-cuenta">hechas ${r.completadas} · plan ${r.planificadas}</span>
        <a class="boton" href="#/plan">Cambiar el tiempo</a>
      </p>
      ${cuerpo}`;
  };

  vistas.diagnostico = () => {
    const ids = conceptosDelDiagnostico();
    const borrador = leerSesion() || {};
    const respuestas = borrador && typeof borrador.diagnostico === "object" && borrador.diagnostico ? borrador.diagnostico : {};
    const contestadas = ids.filter((id) => Object.prototype.hasOwnProperty.call(respuestas, id));
    const huecos = ids.filter((id) => respuestas[id] === 0 || respuestas[id] === 1);
    const filas = ids.map((id, i) => {
      const c = P.conceptos[id] || {};
      const hecho = Object.prototype.hasOwnProperty.call(respuestas, id);
      const botones = DIAGNOSTICO_OPCIONES.map((o) => `<button type="button" class="boton${respuestas[id] === o.v ? " activo" : ""}" data-diag="${esc(id)}" data-valor="${o.v}" aria-pressed="${respuestas[id] === o.v}">${esc(o.texto)}</button>`).join("");
      return `<li class="diag-fila${hecho ? " hecho" : ""}">
        <p class="diag-titulo"><span class="nota-pie">${i + 1}.</span> ${esc(c.t || id)}</p>
        <div class="grupo-opciones" role="group" aria-label="¿Sabrías explicarlo?">${botones}</div>
      </li>`;
    }).join("");
    const resultado = contestadas.length === ids.length
      ? `<section class="diag-resultado" id="diag-resultado">
          <h2>Qué sale</h2>
          ${huecos.length === 0
            ? "<p>No has marcado ningún hueco: dices que sabrías explicar los seis.</p>"
            : `<p>Has marcado <strong>${huecos.length}</strong> de ${ids.length} como huecos. Son estos, y son por donde empezaría:</p>
               <ul>${huecos.map((id) => `<li><a href="#/c/${esc(id)}">${esc((P.conceptos[id] || {}).t || id)}</a> — ${respuestas[id] === 0 ? "no sabrías explicarlo" : "lo sacas con ayuda"}</li>`).join("")}</ul>`}
          <p class="nota-pie"><strong>Límites, dichos claramente:</strong> esto es lo que tú crees, no lo que sabes. Nadie te ha preguntado nada ni se ha comprobado ninguna respuesta, así que no cuenta como nada: no suma progreso, no marca fichas como leídas y no adelanta ningún repaso. Si quieres saberlo de verdad, la única medida que vale es responder las preguntas de cada ficha sin mirar.</p>
        </section>`
      : "";
    return `<div class="migas"><a href="#/">Inicio</a> › Diagnóstico</div>
      <h1>Diagnóstico rápido</h1>
      <p>Seis conceptos de ${pref.rutaActiva ? "tu ruta" : "el principio del portal"}, y una pregunta por cada uno: <strong>¿sabrías explicarlo sin mirar?</strong> Es opcional y se puede dejar a medias: lo que lleves queda guardado en este equipo.</p>
      <p class="nota-pie">Esto mide lo que tú crees de ti, no lo que sabes. No da puntos ni marca nada como hecho.</p>
      <p class="acciones-fila">
        <span class="pastilla">${contestadas.length} de ${ids.length}</span>
        <a class="boton" href="#/">Omitir</a>
        <a class="boton" href="#/orientacion">Cambiar de ruta</a>
      </p>
      <ol class="diagnostico" id="diagnostico">${filas}</ol>
      ${resultado}`;
  };

  vistas.ruta = (clave) => {
    const info = P.rutas[clave];
    if (!info) return `<h1>Ruta desconocida</h1>`;
    const ids = orden.filter((c) => c.r.includes(clave)).map((c) => c.id);
    const siguiendo = rutaActiva() === clave;
    return `<div class="migas"><a href="#/">Inicio</a> › Ruta</div>
      <h1>${info.sigla} ${esc(info.nombre)}</h1>
      <p>${esc(info.desc)}</p>
      <p class="nota-pie">${ids.length} conceptos. En una ruta, el orden recomendado es el de las fases.</p>
      <p class="acciones-fila">
        ${siguiendo
          ? `<span class="pastilla ruta">Es la ruta de tus recomendaciones</span>
             <button type="button" class="boton" data-ruta-activa="">Recomiéndame por cualquier ruta</button>`
          : `<button type="button" class="boton" data-ruta-activa="${esc(clave)}">Recomiéndame por esta ruta</button>`}
      </p>
      <p class="nota-pie">Seguir una ruta no cierra ninguna puerta: solo decide por dónde empieza la
      recomendación de la portada. Las ${ids.length} fichas de esta ruta están abiertas igual, y las demás también.</p>
      ${listaConceptos(ids)}`;
  };

  vistas.ejecutar = () => {
    const d = typeof DEPENDENCIAS !== "undefined" ? DEPENDENCIAS : null;
    if (!d) return `<div class="migas"><a href="#/">Inicio</a> › Ejecutar los ejemplos</div><h1>Ejecutar los ejemplos</h1>
      <p class="nota-pie">Falta el inventario de dependencias.</p>`;
    const filas = d.librerias.map((l) =>
      `<tr><td><code>${esc(l.paquete)}</code></td><td>${esc(l.version)}</td><td>${l.veces}</td><td>${esc(l.descripcion)}</td></tr>`).join("");
    return `<div class="migas"><a href="#/">Inicio</a> › Ejecutar los ejemplos</div>
      <h1>Ejecutar los ejemplos en tu ordenador</h1>
      <p>Este portal es una web estática: <strong>no ejecuta Python dentro del navegador</strong>. Lo que sí hace es
      ejecutar cada ejemplo al construirse y enseñarte su <em>salida real</em> (el desplegable «Salida real al ejecutarlo»
      que hay bajo cada bloque con la marca <span class="marca-verificable">verificado</span>). Eso es lo que imprime de
      verdad, no lo que debería imprimir.</p>
      <p>Para tocarlo tú, son tres pasos:</p>
      <ol>
        <li><strong>Instala Python</strong> desde <code>python.org</code>. Aquí se ha usado <code>${esc(d.versionPython || "Python 3.12")}</code>.</li>
        <li><strong>Copia el bloque</strong> con el botón «copiar», pégalo en un fichero <code>ejemplo.py</code> y ejecútalo:
          <div class="codigo"><div class="codigo-cabecera"><span>bash</span></div><pre><code>python ejemplo.py</code></pre></div></li>
        <li><strong>Compara</strong>: si tu salida coincide con la del portal, vas bien. Si no, mira la tabla de abajo: casi
        siempre es una versión distinta de una librería.</li>
      </ol>

      <h2>Qué hace falta para cada librería</h2>
      <p class="nota-pie">Versiones con las que se probaron los ${d.conceptos} conceptos que llevan código.</p>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Paquete</th><th>Versión probada</th><th>En cuántos conceptos</th><th>Para qué sirve</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>

      <h2>Cuando algo falla</h2>
      <p>El error se lee <strong>de abajo arriba</strong>: la última línea dice <em>qué</em> pasó y la primera dice
      <em>dónde</em>. Los tres que verás casi siempre:</p>
      <ul>
        <li><code>ModuleNotFoundError: No module named 'X'</code> — falta la librería: <code>pip install X</code>.</li>
        <li><code>SyntaxError</code> — el código se ha copiado a medias, o con comillas «tipográficas» en vez de rectas.</li>
        <li>Una salida distinta sin error — casi siempre es la versión de la librería.</li>
      </ul>
      <p class="nota-pie">Hay ${d.sinInstalar.length} librerías que aparecen en ejemplos marcados
      <em>ilustrativo</em> y que <strong>no</strong> están instaladas aquí, porque necesitan GPU, un servicio o datos que no
      vienen con el portal: <code>${d.sinInstalar.slice(0, 12).map(esc).join("</code>, <code>")}</code>${d.sinInstalar.length > 12 ? "…" : ""}.
      Esos ejemplos se leen, no se ejecutan.</p>`;
  };

  vistas.glosario = () => {
    const letras = {};
    for (const g of GLOSARIO) {
      const l = g.t[0].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      (letras[l] ||= []).push(g);
    }
    // El día se lee UNA vez para las 438 pastillas de estado, no una por pastilla: el resultado
    // es el mismo y se ahorran 438 `new Date()` por pintado. Lo que no se hace es calcularlo una
    // vez para todo el portal: el estado del aplazo depende del día, y guardarlo en una constante
    // de módulo dejaría la vista con el día de ayer si la pestaña se queda abierta de un día para
    // otro. Una vez por vista es lo correcto.
    const hoy = hoyISO();
    const orden = Object.keys(letras).sort();
    // Índice A-Z pegajoso y filtro: 438 entradas en una sola columna son una eternidad de
    // rueda del ratón. Con las letras a mano y el filtro se llega en un salto.
    const indice = orden.map((l) => `<a href="#letra-${l}">${l}</a>`).join("");
    return `<div class="migas"><a href="#/">Inicio</a> › Glosario</div>
      <h1>Glosario</h1>
      <p class="nota-pie">${GLOSARIO.length} conceptos ordenados alfabéticamente, con su resumen de una línea.</p>
      <div class="glosario-mando">
        <label class="glosario-filtro">
          <span class="visualmente-oculto">Filtrar el glosario</span>
          <input type="search" id="filtro-glosario" placeholder="Filtra por nombre o resumen…" autocomplete="off">
        </label>
        <nav class="glosario-letras" aria-label="Ir a la letra">${indice}</nav>
      </div>
      <p class="glosario-cuenta nota-pie" id="glosario-cuenta"></p>
      <div id="glosario-cuerpo">${orden.map((l) => `<section class="glosario-letra">
        <h2 id="letra-${l}">${l}</h2>
        <ul class="lista-conceptos glosario-lista">${
          letras[l].map((g) => `<li data-texto="${esc((g.t + " " + (g.s || "")).toLowerCase())}"><span class="indice">F${g.f}</span><div class="concepto-cuerpo"><a class="titulo" href="#/c/${g.id}">${esc(g.t)}</a><span class="resumen">${esc(g.s)}</span></div>${pastillaEstado(g.id, "", hoy)}</li>`).join("")
        }</ul></section>`).join("")}</div>`;
  };

  // Filtro del glosario: esconde lo que no encaja y las letras que se quedan vacías.
  function conectarGlosario() {
    const campo = $("#filtro-glosario");
    if (!campo) return;
    const cuerpo = $("#glosario-cuerpo");
    const cuenta = $("#glosario-cuenta");
    const aplicar = () => {
      const q = campo.value.trim().toLowerCase();
      let visibles = 0;
      for (const seccion of cuerpo.querySelectorAll(".glosario-letra")) {
        let enLetra = 0;
        for (const li of seccion.querySelectorAll("li")) {
          const encaja = !q || li.dataset.texto.includes(q);
          li.hidden = !encaja;
          if (encaja) enLetra++;
        }
        seccion.hidden = enLetra === 0;
        visibles += enLetra;
      }
      cuenta.textContent = q ? visibles + " de " + GLOSARIO.length + " conceptos" : "";
    };
    campo.addEventListener("input", aplicar);
    aplicar();
  }

  vistas.progreso = () => {
    const hoy = hoyISO();
    const r = resumenProgreso();
    // ── La evaluación (fase 10) ──────────────────────────────────────────
    // La nota, las insignias y las competencias se calculan aquí y no se guardan en ningún sitio:
    // esa es la decisión que hace que no se puedan subir editando el navegador. El día entra como
    // parámetro para que la cuenta sea la misma a cualquier hora.
    const politica = politicaEvaluacion();
    const nota = notaDeEvaluacion(progreso, srs, dias, P.conceptos, politica, { hoy });
    const insignias = insigniasCalculadas(nota.metricas, politica);
    const competencias = competenciasCalculadas(progreso, srs, { hoy });
    const claves = Object.keys(srs).filter((k) => srs[k] && typeof srs[k] === "object");
    const objetivo = Number.isInteger(pref.objetivoDia) && pref.objetivoDia > 0 ? pref.objetivoDia : 20;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const dominados = claves.filter((k) => num(srs[k].reps) >= 3).length;
    const fallos = claves.reduce((s, k) => s + num(srs[k].fallos), 0);
    const aciertos = claves.reduce((s, k) => s + num(srs[k].aciertos), 0);

    // ── El mapa de huecos ────────────────────────────────────────────────
    // Solo se despliega UNA fase, y las demas no se pintan: meter las 438 celdas en el DOM a la
    // vez —aunque fuera con `hidden`— es lo que convirtio `todo.html` en 9,5 MB. La fase abierta
    // es la que estabas mirando, y si no hay ninguna, la que te toca.
    const mapa = huecos(progreso, srs, P, pref, hoy);
    const abierta = faseAbiertaMapa(mapa);
    const filtros = FILTROS_HUECOS.map((k) => `<button type="button" class="boton hueco-filtro${k === mapa.filtro ? " activo" : ""}" data-mapa-filtro="${esc(k)}" aria-pressed="${k === mapa.filtro ? "true" : "false"}">${esc(ROTULO_FILTRO_HUECOS[k])}</button>`).join("");
    // Cada celda lleva el estado DOS veces —simbolo y palabra— y ademas en el nombre accesible del
    // enlace: el color solo no es informacion para quien no lo distingue, y 438 cuadraditos de
    // color sin texto serian un mapa que solo entiende quien lo ha hecho.
    const celda = (c) => `<li class="hueco-celda"><a class="hueco-enlace estado-${esc(c.clase || "pendiente")}" href="#/c/${esc(c.id)}" aria-label="${esc(c.titulo)}: ${esc(c.rotulo.toLowerCase())}" title="${esc(c.titulo)}: ${esc(c.rotulo.toLowerCase())}"><span class="hueco-titulo">${esc(c.titulo)}</span><span class="hueco-estado">${c.simbolo ? `<span aria-hidden="true">${esc(c.simbolo)}</span> ` : ""}${esc(c.rotulo)}</span></a></li>`;
    const faseHtml = (f) => {
      const desplegada = f.id === abierta;
      const medias = f.cuenta["a-medias"] || 0;
      const cuenta = `${f.dentro} de ${f.total}${mapa.filtro ? " con este filtro" : ""}${medias && !mapa.filtro ? ` · ${medias} a medias` : ""}`;
      const celdas = f.celdas.filter((c) => c.pasa);
      return `<li class="hueco-fase">
        <button type="button" class="hueco-cabecera" data-mapa-fase="${esc(f.id)}" aria-expanded="${desplegada ? "true" : "false"}"${desplegada ? ` aria-controls="mapa-${esc(f.id)}"` : ""}>
          <span class="hueco-fase-num">${esc(String(f.id).toUpperCase())}</span>
          <span class="hueco-fase-titulo">${esc(f.corto)}</span>
          <span class="hueco-fase-cuenta">${esc(cuenta)}</span>
        </button>
        ${desplegada ? (celdas.length
          ? `<ul class="huecos-celdas" id="mapa-${esc(f.id)}">${celdas.map(celda).join("")}</ul>`
          : `<p class="nota-pie huecos-sin-celdas">En esta fase no queda ninguna ficha con este filtro.</p>`) : ""}
      </li>`;
    };
    const resumenEstados = Object.keys(mapa.porEstado).map((k) => `<li class="mapa-cuenta"><span class="mapa-cuenta-rotulo">${esc(ESTADOS[k].rotulo)}</span> <span class="mapa-cuenta-num">${mapa.porEstado[k]}</span></li>`).join("");

    // ── Abandonado ───────────────────────────────────────────────────────
    const ab = abandonadas(progreso, srs, P, pref, hoy, { intentos });
    const topes = [...new Set([7, DIAS_ABANDONO, 30, 60, ab.diasAbandono])].sort((a, b) => a - b);
    const opcionesDias = topes.map((n) => `<option value="${n}" ${ab.diasAbandono === n ? "selected" : ""}>${n} días</option>`).join("");
    const filasAb = ab.lista.map((a) => `<li class="abandonada" data-abandonada="${esc(a.fid)}">
        <a class="abandonada-fase" href="#/fase/${esc(a.fid)}">${esc(String(a.fid).toUpperCase())} · ${esc(a.corto)}</a>
        <span class="abandonada-cuenta">${a.medias} ${a.medias === 1 ? "ficha a medias" : "fichas a medias"} de ${a.total}${a.aplazadas ? ` · ${a.aplazadas} aplazada${a.aplazadas === 1 ? "" : "s"}` : ""}</span>
        <span class="abandonada-parada">${a.diasParada === null ? "sin ninguna fecha de avance" : `${a.diasParada} ${a.diasParada === 1 ? "día" : "días"} sin avanzar`}</span>
        <span class="abandonada-ultimo">último avance: ${a.ultimo ? esc(a.ultimo) : "no hay ninguno fechado"}</span>
        ${a.volver ? `<span class="abandonada-volver">Por dónde volver: <a href="#/c/${esc(a.volver.id)}">${esc(a.volver.titulo)}</a> (${a.volver.cumplidos} de ${a.volver.total} requisitos)</span>` : ""}
      </li>`).join("");
    const bloqueAbandonado = ab.vacio
      ? `<p class="abandonadas-vacio">Ahora mismo no hay ninguna fase abandonada: todas las que tienes empezadas se han tocado en los últimos ${ab.diasAbandono} días, o no les queda ninguna ficha a medias. Aquí aparecerán las que se queden paradas, con la ficha por la que volver.</p>`
      : `<ul class="abandonadas-filas">${filasAb}</ul>`;

    // ── Actividad ────────────────────────────────────────────────────────
    const act = bucketsActividad(dias, hoy, { agrupar: pref.agruparActividad });
    const filasAct = act.cubos.map((c) => `<li class="actividad-fila" data-grano="${esc(c.grano)}"><span class="actividad-cuando">${esc(c.etiqueta)}</span><span class="actividad-barra"><span style="width:${Math.min(100, Math.round((c.n / objetivo) * 100))}%"></span></span><span class="actividad-n">${c.n}</span></li>`).join("");
    const bloqueActividad = act.modo === "vacio"
      ? `<p class="actividad-vacia">Todavía no hay nada que enseñar aquí. En cuanto respondas tu primera pregunta, esta gráfica
        empieza a contar: primero por días, luego por semanas y, con el tiempo, por meses.</p>`
      : `<ol class="actividad" id="grafica-actividad">${filasAct}</ol>
        <p class="nota-pie">Barras por <strong>${act.modo === "dia" ? "día" : act.modo === "dia+semana" ? "día y semana" : "día, semana y mes"}</strong>:
        ${act.porTramo.dia} por día, ${act.porTramo.semana} por semana y ${act.porTramo.mes} por mes. Agrupación «${esc(act.agrupar)}»: ${esc(act.regla)}</p>`;

    // ── «Cómo vas» ───────────────────────────────────────────────────────
    const rv = riesgo(progreso, srs, P, pref, hoy, { dias, intentos });
    const filasReglas = rv.reglas.map((x) => `<tr class="${x.dispara ? "regla-encendida" : "regla-apagada"}"><td>${esc(x.rotulo)}</td><td class="num">${x.umbral}</td><td>${esc(x.unidad)}</td><td class="num">${x.numero === null || x.numero === undefined ? "—" : x.numero}</td><td>${x.dispara ? "encendida" : "apagada"}</td></tr>`).join("");
    const senales = rv.senales.map((x) => `<li class="senal" data-senal="${esc(x.id)}"><p class="senal-dice">${esc(x.dice)}</p><p class="senal-desactivar">Qué la apagaría: ${esc(x.desactivar)}</p></li>`).join("");
    const bloqueRiesgo = rv.primerDia
      ? `<p class="riesgo-vacio">Todavía no hay nada que valorar: ninguna de las cuatro reglas se puede encender sin
        actividad previa, y ese es el primer día. Empieza por <a href="#/pendientes">lo que te falta hoy</a> y este bloque
        tendrá algo que decir; hasta entonces no dice nada, que es lo honesto.</p>`
      : `${senales ? `<ul class="riesgo-senales">${senales}</ul>` : `<p class="riesgo-sin-senales">Ninguna señal: sigue así.</p>`}`;

    // ── Exportar el informe ──────────────────────────────────────────────
    const datos = filasInforme(progreso, srs, P, pref, hoy, { intentos });
    const bloqueExportar = `<p>Un fichero con una fila por ficha y su estado, para mirarlo en una hoja de cálculo o
      guardarlo. Son <strong>${datos.resumen.total}</strong> filas: ${datos.resumen.noIntentadas} sin empezar,
      ${datos.resumen.noPuedeTodavia} que no se pueden hacer todavía, ${datos.resumen.enCurso} a medias y
      ${datos.resumen.terminadas} terminadas.</p>
      <p class="nota-pie">La última columna, <code>situacion</code>, es la que importa: distingue «no lo he intentado» de
      «no puedo todavía». La segunda quiere decir que esa ficha usa vocabulario de otra que aún no tienes cumplida, y eso
      no se arregla estudiando más esta ficha. Las columnas de fecha se llaman <code>ultimo_intento</code> (tu última
      respuesta), <code>ultima_visita</code> (el día en que llegaste al final del artículo) y <code>ultimo_avance</code>
      (el último día con algo hecho en esa ficha, que es lo que usa el bloque «Abandonado»).</p>`;

    // El orden de los bloques es el de la especificación: dónde estoy, los huecos, lo abandonado,
    // la actividad, cómo voy y llévatelo. Los bloques que ya existían (aplazadas, intentos, Anki y
    // guardar) se quedan donde estaban.
    return `<div class="migas"><a href="#/">Inicio</a> › Progreso</div>
      <h1>Mi progreso</h1>
      ${almacenFalla ? `<p class="nota-pie aviso-almacen" id="informe-almacen">Este navegador no deja guardar en este equipo: lo que hagas ahora se perderá al cerrar la pestaña.</p>` : ""}
      <div class="estadisticas">
        <div class="estadistica"><div class="valor">${claves.length}</div><div class="rotulo">preguntas en repaso</div></div>
      </div>

      <section class="huecos" id="bloque-huecos">
        <h2>Los huecos: dónde está cada ficha</h2>
        <p class="nota-pie">Las ${mapa.total} fichas, agrupadas por fase. Se despliega una fase cada vez y el filtro
        sirve para hacerse una pregunta concreta: «enséñame solo lo que tengo a medias».</p>
        <ul class="mapa-cuentas">${resumenEstados}</ul>
        <div class="huecos-filtros" role="group" aria-label="Filtro del mapa de estados">${filtros}</div>
        <p class="huecos-cuenta" id="huecos-cuenta">${mapa.mostradas === mapa.total
          ? `Se ven las ${mapa.total} fichas.`
          : `Se ven ${mapa.mostradas} de ${mapa.total} fichas${mapa.filtro ? ` con «${esc(mapa.filtroRotulo)}»` : ""}; las otras ${mapa.ocultas} siguen contando en las cifras de arriba.`}</p>
        ${mapa.vacio ? `<p class="huecos-vacio">${esc(mapa.mensajeVacio)}</p>`
          : `<ul class="huecos-fases">${mapa.fases.map(faseHtml).join("")}</ul>`}
      </section>

      ${bloqueNota(nota, politica)}

      ${bloqueCompetencias(competencias)}

      ${bloqueInsignias(insignias)}

      <section class="abandonado" id="bloque-abandonado">
        <h2>Abandonado</h2>
        <p class="nota-pie">Una fase entra aquí cuando tiene alguna ficha a medias y no se toca desde hace
        <strong>${ab.diasAbandono} días</strong>. Abajo está la ficha por la que volver.</p>
        <div class="acciones-fila">
          <label class="pastilla" for="dias-abandono">Considerar abandonada a partir de:</label>
          <select id="dias-abandono" class="boton">${opcionesDias}</select>
        </div>
        ${bloqueAbandonado}
      </section>

      <section class="actividad-informe" id="bloque-actividad">
        <h2>Tu actividad</h2>
        ${bloqueActividad}
        ${act.recortados ? `<p class="nota-pie">Hay ${act.recortados} meses más antiguos que no caben en la gráfica.</p>` : ""}
        <p class="hoy-cuenta">Objetivo diario: ${objetivo} preguntas.</p>
      </section>

      <section class="riesgo" id="bloque-como-vas">
        <h2>Cómo vas</h2>
        ${bloqueRiesgo}
        <div class="tabla-envoltorio"><table class="tabla-reglas">
          <caption class="nota-pie">Las cuatro reglas, con su umbral y tu número de hoy.</caption>
          <thead><tr><th>Regla</th><th>Umbral</th><th>Unidad</th><th>Tu número</th><th>Estado</th></tr></thead>
          <tbody>${filasReglas}</tbody>
        </table></div>
      </section>

      <h2>Fichas aplazadas</h2>
      ${bloqueAplazadas()}

      <h2>Tus intentos: cuál cuenta para la nota</h2>
      ${bloqueResumenIntentos()}

      <h2>Llevar el repaso a Anki</h2>
      <p>Exporta todas las preguntas (o solo las falladas) como fichero de texto que Anki importa
      directamente: <em>Archivo → Importar</em>, con separador de tabulador y HTML activado.</p>
      <div class="acciones-fila">
        <button class="boton" id="anki-todo">Exportar todas las preguntas</button>
        <button class="boton" id="anki-falladas">Exportar solo las falladas</button>
        <button class="boton" id="anki-fase">Exportar la fase que elija…</button>
      </div>

      <section class="informe-exportar" id="bloque-exportar">
        <h2>Llevarte el informe</h2>
        ${bloqueExportar}
        <div class="acciones-fila">
          <button class="boton" id="exportar-informe-csv">Descargar el informe (CSV)</button>
          <button class="boton" id="exportar-informe-json">Descargar el informe (JSON)</button>
        </div>
      </section>

      <h2>Guardar y recuperar</h2>
      <p>El progreso vive en este navegador. Si cambias de equipo o limpias los datos, se pierde:
      descarga una copia de vez en cuando.</p>
      <div class="acciones-fila">
        <button class="boton" id="exportar-estado">Descargar mi progreso (JSON)</button>
        <button class="boton" id="importar-estado">Cargar un progreso guardado</button>
        <button class="boton" id="borrar-estado">Borrar todo mi progreso</button>
        <input type="file" id="fichero-estado" accept=".json" hidden>
      </div>
      ${avisoSinConexion()}`;
  };

  // ── La fase desplegada del mapa, dentro de la misma sesión ─────────────
  //
  // Se guarda en `aprender.abiertas` (sessionStorage, YA declarada: es la misma lista que usan las
  // fases desplegadas del árbol lateral) con el prefijo `mapa:`. El árbol mira sus propias claves
  // —los identificadores de fase a secas—, así que no se confunde, y así no hace falta ninguna
  // clave nueva: una clave nueva obligaría a tocar los textos legales para decir algo que no ha
  // cambiado.
  function fasesAbiertas() {
    try { return new Set(JSON.parse(sessionStorage.getItem("aprender.abiertas") || "[]")); }
    catch { return new Set(); }
  }

  function faseAbiertaMapa(mapa) {
    const guardadas = fasesAbiertas();
    const suya = [...guardadas].find((x) => typeof x === "string" && x.startsWith("mapa:"));
    const elegida = suya ? suya.slice(5) : "";
    if (elegida && mapa.fases.some((f) => f.id === elegida)) return elegida;
    const enCurso = mapa.fases.find((f) => f.n === mapa.faseEnCurso);
    return (enCurso || mapa.fases[0] || { id: "" }).id;
  }

  /** Despliega una fase del mapa y pliega la que estuviera abierta: solo se enseña una. */
  function abrirFaseMapa(fid) {
    const otras = [...fasesAbiertas()].filter((x) => !(typeof x === "string" && x.startsWith("mapa:")));
    otras.push("mapa:" + fid);
    try { sessionStorage.setItem("aprender.abiertas", JSON.stringify(otras)); } catch { /* sin almacen, el mapa abre por la fase en curso */ }
  }

  /** Descarga el informe por ficha. El CSV es el que se abre en una hoja de cálculo. */
  function exportarInforme(formato) {
    const hoy = hoyISO();
    const datos = filasInforme(progreso, srs, P, pref, hoy, { intentos });
    if (formato === "json") {
      descargar(`${MARCA_ARCHIVO}-informe-${hoy}.json`, JSON.stringify({ generado: hoy, columnas: datos.columnas, resumen: datos.resumen, filas: datos.filas }, null, 2), "application/json;charset=utf-8");
      return;
    }
    descargar(`${MARCA_ARCHIVO}-informe-${hoy}.csv`, csvDeFilas(datos.columnas, datos.filas), "text/csv;charset=utf-8");
  }

  vistas.repaso = () => {
    // La cola la compone `render` antes de pintar, porque necesita el contenido de las fichas
    // cargado. Aqui solo se lee: si esta vista decidiera su propia cola, la sesion y el recuento
    // de arriba podrian estar hablando de cosas distintas.
    const { vencidas, nuevas, aplazadas } = repasoPendiente();
    const cola = colaRepaso;
    // La politica se lee en los DOS estados, tambien cuando no hay nada que repasar: es donde
    // se decide con que criterio se mirara la sesion de mañana, y esconderla hasta que haya
    // cola obligaria a empezar a responder para poder leerla, que es justo lo que no se quiere.
    const criterio = criterioCuenta(pref);
    const politica = `<h2>Cómo se cuenta lo que respondas</h2>
      ${lineaPolitica(criterio, ROTULO_CUAL_CUENTA)}
      <p class="nota-pie">Se cambia en <a href="#/progreso">Mi progreso</a>, y no toca nada de lo ya
      respondido: solo la cifra que se enseña. Lo que se guarda de cada intento —el día, lo que elegiste,
      si acertaste y cuánto tardaste— es lo mismo con los cuatro criterios.</p>`;
    // El modo se elige AQUI, en la sesion y con los tres botones delante: una pagina de ajustes
    // escondida obliga a saber que existe para poder usarla, y esto es una decision que se toma
    // justo antes de responder, no una vez y para siempre.
    const modo = modoDe(pref);
    const selectorModo = `<h2>Cómo quieres responder hoy</h2>
      <div class="selector-modo" id="selector-modo" role="group" aria-label="Modo de respuesta">
        ${MODOS_RESPUESTA.map((m) => `<button type="button" class="boton modo-boton${m === modo ? " activo" : ""}"
          data-modo-respuesta="${esc(m)}" aria-pressed="${m === modo ? "true" : "false"}">
          <span class="modo-rotulo">${esc(ROTULO_MODO[m].rotulo)}</span>
          <span class="modo-frase">${esc(ROTULO_MODO[m].frase)}</span></button>`).join("")}
      </div>
      <p class="nota-pie" id="modo-ayuda">${esc(ROTULO_MODO[modo].ayuda)}</p>
      <p class="nota-pie">El modo se recuerda para la próxima vez y se puede cambiar siempre, incluso con la
      sesión empezada: no cierra nada. La seguridad declarada —decir cuánto te fiabas de tu respuesta— se
      enciende en <a href="#/progreso">Mi progreso</a>, y por defecto está apagada.</p>
      <div class="selector-modo" id="selector-seguridad" role="group" aria-label="Seguridad declarada">
        <button type="button" class="boton modo-boton${seguridadPedida(pref) ? " activo" : ""}" data-seguridad-declarada="si" aria-pressed="${seguridadPedida(pref) ? "true" : "false"}">
          <span class="modo-rotulo">Preguntarme la seguridad</span>
          <span class="modo-frase">${seguridadPedida(pref) ? "encendida" : "apagada"}</span></button>
      </div>
      <p class="nota-pie">Con la seguridad encendida, después de cada respuesta el portal pregunta si ibas
      seguro, bastante seguro o muy seguro. Eso no cambia la nota: cambia la <strong>calidad</strong> con la que
      la pregunta entra en el repaso. Un acierto del que no
      estabas seguro vuelve pronto; uno del que estabas seguro, tarde.</p>`;
    if (!cola.length) {
      const proxima = Object.values(srs).map((t) => t.venc).sort()[0];
      return `<div class="migas"><a href="#/">Inicio</a> › Repaso</div>
        <h1>Repaso</h1>
        <p>No hay preguntas pendientes ahora mismo.</p>
        ${aplazadas.length ? `<p class="nota-pie">${aplazadas.length === 1 ? "Tienes 1 ficha aplazada" : `Tienes ${aplazadas.length} fichas aplazadas`}:
          la primera vuelve el ${esc(aplazadas[0].hasta)}. Hasta entonces sus preguntas no entran en esta cola
          a propósito, y su historial sigue guardado.</p>` : ""}
        ${proxima ? `<p class="nota-pie">La siguiente vence el ${proxima}.</p>` : `<p class="nota-pie">Marca conceptos como <strong>vistos</strong> y sus preguntas entrarán en la cola.</p>`}
        <p><a class="boton" href="#/progreso">Ver mi progreso</a></p>
        ${selectorModo}
        ${politica}`;
    }
    return `<div class="migas"><a href="#/">Inicio</a> › Repaso</div>
      <h1>Repaso de hoy</h1>
      <p class="nota-pie">${cola.length} preguntas en esta sesión (${vencidas.length} vencidas, ${nuevas.length} nuevas). Límite diario: ${pref.repasoDia}.</p>
      ${selectorModo}
      ${politica}
      <div class="barra-repaso"><span id="barra-repaso" style="width:0%"></span></div>
      <div id="zona-repaso"></div>`;
  };

  // ── Plan de estudio ───────────────────────────────────────────────────
  // Minutos por concepto según el nivel: leer, escribir el código a mano y responder
  // las preguntas. Son medias honestas, no promesas: los de nivel experto llevan más.
  const MINUTOS_NIVEL = { "básico": 18, "intermedio": 25, "avanzado": 35, "experto": 50 };

  const minutosDe = (ids) => ids.reduce((s, id) => s + (MINUTOS_NIVEL[P.conceptos[id]?.n] || 25), 0);

  // ── T18 · Desglose por actividad ──────────────────────────────────────────
  // Hasta ahora el plan sumaba una MEDIA POR NIVEL, y una media no tiene partes: por eso no se
  // podía decir cuánto es leer y cuánto es responder. El índice publicado trae palabras, q y
  // pr por concepto, así que las tres partes se derivan de datos, no se reparten a ojo.
  //
  // Estos dos costes son la única decisión de esta función. Están juntos y con su motivo para que
  // se puedan discutir sin buscarlos por el fichero.
  const MIN_POR_PREGUNTA = 1.5;  // leer el enunciado, pensar, elegir y leer la explicación
  const MIN_POR_PRACTICA = 12;   // intentar el problema, atascarse y comparar con la solución
  const PPM_LECTURA = 150;       // palabras por minuto al leer con atención

  /** Las tres partes de un concepto, y su total. */
  const desgloseDeConcepto = (id) => {
    const c = P.conceptos[id];
    if (!c) return { lectura: 0, preguntas: 0, practica: 0, total: 0 };
    const palabras = Number.isFinite(c.palabras) && c.palabras > 0 ? c.palabras : null;
    // Si un concepto no trae palabras contadas, se usa su media por nivel SOLO para la lectura, y
    // se dice en el concepto, no se esconde: es un respaldo, no una medida.
    const lectura = Math.max(1, Math.round(palabras ? palabras / PPM_LECTURA : (MINUTOS_NIVEL[c.n] || 25) * 0.6));
    const preguntas = Math.round((Number.isFinite(c.q) ? c.q : 0) * MIN_POR_PREGUNTA);
    const practica = Math.round((Number.isFinite(c.pr) ? c.pr : 0) * MIN_POR_PRACTICA);
    return { lectura, preguntas, practica, total: lectura + preguntas + practica };
  };

  /** Suma las tres partes de una lista de conceptos. */
  const desgloseDe = (ids) => ids.reduce((acc, id) => {
    const d = desgloseDeConcepto(id);
    return { lectura: acc.lectura + d.lectura, preguntas: acc.preguntas + d.preguntas, practica: acc.practica + d.practica, total: acc.total + d.total };
  }, { lectura: 0, preguntas: 0, practica: 0, total: 0 });

  // El bloque se añade al final de la vista de plan, envolviéndola: no se toca su plantilla.
  function bloqueDesglose() {
    const todas = orden.map((c) => c.id);
    const d = desgloseDe(todas);
    if (!d.total) return "";
    const pct = (n) => Math.round((n / d.total) * 100);
    const fila = (rotulo, min, que) => `<tr><td>${esc(rotulo)}</td><td>${horas(min)} h</td><td>${pct(min)} %</td><td class="nota-pie">${esc(que)}</td></tr>`;
    return `<section class="desglose" id="desglose-plan" aria-labelledby="desglose-titulo">
      <h2 id="desglose-titulo">En qué se va el tiempo</h2>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Actividad</th><th>Tiempo</th><th>Parte</th><th>Qué es</th></tr></thead>
        <tbody>
          ${fila("Leer", d.lectura, "la ficha entera, a " + PPM_LECTURA + " palabras por minuto")}
          ${fila("Preguntas", d.preguntas, "responder y leer por qué")}
          ${fila("Práctica", d.practica, "resolver el problema y comparar con la solución")}
        </tbody>
      </table></div>
      <p class="nota-pie">No hay fecha: estas horas no dicen cuándo vas a terminar, sino cuánto cuesta. Cambiar las horas al día cambia el reparto en semanas, nunca lo que queda por hacer.</p>
    </section>`;
  }
  // La envoltura: se añade al final de la vista de plan sin tocar su plantilla.
  if (typeof vistas.plan === "function" && !vistas.plan.__conDesglose) {
    const planBase = vistas.plan;
    vistas.plan = () => planBase() + bloqueDesglose();
    vistas.plan.__conDesglose = true;
  }
  const horas = (min) => Math.round(min / 60);
  const semanas = (min, horasDia) => Math.max(1, Math.ceil(min / 60 / horasDia / 7));

  vistas.plan = () => {
    const { vencidas, nuevas, aplazadas } = repasoPendiente();
    const pendientesHoy = vencidas.length + nuevas.length;
    const hoy = dias[hoyISO()] || 0;
    const objetivo = pref.objetivoDia || 20;

    const horasDia = pref.horasDia || 1;
    const todas = orden.map((c) => c.id);
    const totalMin = minutosDe(todas);
    const hechos = todas.filter((id) => progreso[id]?.dominado);
    const restanteMin = minutosDe(todas.filter((id) => !progreso[id]?.dominado));
    const niveles = Object.keys(MINUTOS_NIVEL);

    return `<div class="migas"><a href="#/">Inicio</a> › Plan</div>
      <h1>Plan de estudio</h1>
      <p>Cuánto queda y cuánto se tarda.</p>

      <div class="acciones-fila">
        <label class="pastilla" for="horas-dia">Horas al día que puedo dedicar:</label>
        <select id="horas-dia" class="boton">
          ${[0.5, 1, 1.5, 2, 3, 4].map((h) => `<option value="${h}" ${h === horasDia ? "selected" : ""}>${h} ${h === 1 ? "hora" : "horas"}</option>`).join("")}
        </select>
      </div>

      <div class="estadisticas">
        <div class="estadistica"><div class="valor">${horas(totalMin)} h</div><div class="rotulo">el temario completo</div></div>
        <div class="estadistica"><div class="valor">${semanas(totalMin, horasDia)}</div><div class="rotulo">semanas a ${horasDia} h/día</div></div>
        <div class="estadistica"><div class="valor">${horas(restanteMin)} h</div><div class="rotulo">lo que te queda</div></div>
        <div class="estadistica"><div class="valor">${semanas(restanteMin, horasDia)}</div><div class="rotulo">semanas para lo que queda</div></div>
        <div class="estadistica"><div class="valor">${hechos.length}</div><div class="rotulo">conceptos dominados</div></div>
      </div>

      <h2>Por ruta</h2>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Ruta</th><th>Conceptos</th><th>Horas</th><th>Semanas a ${horasDia} h/día</th></tr></thead>
        <tbody>${Object.entries(P.rutas).map(([clave, info]) => {
          const ids = todas.filter((id) => P.conceptos[id].r.includes(clave));
          const min = minutosDe(ids);
          return `<tr><td><a href="#/ruta/${clave}">${info.sigla} ${esc(info.nombre)}</a></td><td>${ids.length}</td><td>${horas(min)}</td><td>${semanas(min, horasDia)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>

      <h2>Por nivel</h2>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Nivel</th><th>Conceptos</th><th>Minutos cada uno</th><th>Horas en total</th></tr></thead>
        <tbody>${niveles.map((n) => {
          const ids = todas.filter((id) => P.conceptos[id].n === n);
          return `<tr><td><span class="pastilla nivel-${n}">${esc(n)}</span></td><td>${ids.length}</td><td>${MINUTOS_NIVEL[n]}</td><td>${horas(minutosDe(ids))}</td></tr>`;
        }).join("")}</tbody>
      </table></div>

      <h2>Por fase</h2>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Fase</th><th>Conceptos</th><th>Horas</th><th>Semanas</th></tr></thead>
        <tbody>${P.porFase.filter((f) => f.conceptos).map((f) => {
          const ids = todas.filter((id) => P.conceptos[id].fid === f.id);
          const min = minutosDe(ids);
          return `<tr><td><a href="#/fase/${f.id}">Fase ${f.n} · ${esc(f.corto)}</a></td><td>${ids.length}</td><td>${horas(min)}</td><td>${semanas(min, horasDia)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>

      <h2>Dónde seguir hoy</h2>
      ${bloqueRecomendacion()}

      <h2>La semana que funciona</h2>
      <p>Repartir el tiempo así es lo que sostiene el ritmo durante meses:</p>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Cuándo</th><th>Qué</th></tr></thead>
        <tbody>
          <tr><td>Lunes a viernes, 20-40 min</td><td><strong>Repaso</strong> de preguntas en <a href="#/repaso">Repaso</a>: es lo que impide olvidar lo ya visto.</td></tr>
          <tr><td>2 días, 1-2 h</td><td><strong>Concepto nuevo</strong>: leer la página, escribir el código a mano y resolver el problema práctico.</td></tr>
          <tr><td>1 día</td><td><strong>Proyecto</strong>: avanzar en algo real, aunque sea un detalle pequeño.</td></tr>
          <tr><td>1 día</td><td><strong>Leer</strong> un capítulo del libro de la fase.</td></tr>
          <tr><td>Domingo</td><td><strong>Escribir</strong> qué has aprendido, qué no entiendes y qué preguntas tienes. Esas dudas son el plan de la semana siguiente.</td></tr>
        </tbody>
      </table></div>

      <h2>Por dónde empezar</h2>
      <p class="nota-pie">Elegir una ruta solo cambia por dónde te recomienda empezar el portal. No
      oculta contenido, no pierde progreso y no pide confirmación: se cambia cuando quieras y con
      el mismo clic.</p>
      <div class="acciones-fila">
        <label class="pastilla" for="ruta-preferida">Recomiéndame por:</label>
        <select id="ruta-preferida" class="boton">
          <option value="" ${rutaActiva() ? "" : "selected"}>Cualquier ruta (el temario entero)</option>
          ${Object.entries(P.rutas).map(([clave, info]) => `<option value="${esc(clave)}" ${rutaActiva() === clave ? "selected" : ""}>Ruta ${esc(info.nombre)}</option>`).join("")}
        </select>
      </div>
      <div class="rejilla">
        ${Object.entries(P.rutas).map(([clave, info]) => {
          const n = orden.filter((c) => c.r.includes(clave)).length;
          return `<a class="tarjeta" href="#/ruta/${clave}"><h3>${info.sigla} ${esc(info.nombre)}</h3><p>${esc(info.desc)}</p><p class="cuenta">${n} conceptos</p></a>`;
        }).join("")}
      </div>

      <h2>Las fases</h2>
      <div class="rejilla">
        ${P.porFase.filter((f) => f.conceptos).map((f) => `
          <a class="tarjeta" href="#/fase/${f.id}"><h3>${f.num} Fase ${f.n} · ${esc(f.corto)}</h3>
          <p class="cuenta">${f.conceptos} conceptos</p></a>`).join("")}
      </div>

      <section class="portada-hoy" aria-label="Tu sesión de hoy">
        ${bloqueHoy()}
        <div class="estadisticas">
          <div class="estadistica"><div class="valor">${pendientesHoy}</div><div class="rotulo">preguntas para repasar hoy</div></div>
          <div class="estadistica"><div class="valor">${hoy}<span style="font-size:1rem;color:var(--texto-suave)">/${objetivo}</span></div><div class="rotulo">respondidas hoy</div><div class="barra"><span style="width:${Math.min(100, Math.round((hoy / objetivo) * 100))}%"></span></div></div>
        </div>
        ${pendientesHoy ? `<p><a class="boton primario" href="#/repaso">Empezar el repaso de hoy (${pendientesHoy} preguntas)</a></p>`
          : `<p class="nota-pie">No tienes preguntas pendientes. Marca conceptos como vistos y sus preguntas entrarán en la cola de repaso.</p>`}
        ${aplazadas.length ? `<p class="nota-pie">${aplazadas.length === 1 ? "1 ficha aplazada" : aplazadas.length + " fichas aplazadas"} no se pide${aplazadas.length === 1 ? "" : "n"} hasta su día: sus preguntas no están en la cola a propósito, y vuelven solas el ${esc(aplazadas[0].hasta)}. No se ha borrado nada: siguen contando en <a href="#/progreso">Mi progreso</a>.</p>` : ""}
      </section>

      <h2>Atajos</h2>
      <div class="atajos">
        <section class="atajos-grupo" aria-labelledby="atajos-practicar">
          <p class="rotulo" id="atajos-practicar">Practicar</p>
          <ul>
            <li><a href="#/laboratorios">Laboratorios<span class="atajos-pista">datos reales</span></a></li>
            <li><a href="#/experimentos">Experimentos<span class="atajos-pista">mesa</span></a></li>
            <li><a href="#/proyectos">Proyectos<span class="atajos-pista">con rúbrica</span></a></li>
          </ul>
        </section>
        <section class="atajos-grupo" aria-labelledby="atajos-espacio">
          <p class="rotulo" id="atajos-espacio">Mi espacio</p>
          <ul>
            <li><a href="#/dudas">Dudas<span class="atajos-pista">apúntalas</span></a></li>
            <li><a href="#/notas">Notas<span class="atajos-pista">por ficha</span></a></li>
            <li><a href="#/mapa">Mapa<span class="atajos-pista">qué dominas</span></a></li>
            <li><a href="#/favoritos">Favoritos<span class="atajos-pista">guardados</span></a></li>
            <li><a href="#/proyecto">Mi entrega<span class="atajos-pista">borrador</span></a></li>
            <li><a href="#/informe">Informe<span class="atajos-pista">cifras</span></a></li>
            <li><a href="#/incidencia">Avisar de un problema<span class="atajos-pista">incidencias</span></a></li>
          </ul>
        </section>
        <section class="atajos-grupo" aria-labelledby="atajos-referencia">
          <p class="rotulo" id="atajos-referencia">Referencia</p>
          <ul>
            <li><a href="#/glosario">Glosario<span class="atajos-pista">${GLOSARIO.length} términos</span></a></li>
            <li><a href="#/plan">Plan de estudio<span class="atajos-pista">a tu ritmo</span></a></li>
            <li><a href="#/ayuda">Cómo estudiar<span class="atajos-pista">método</span></a></li>
            <li><a href="#/ejecutar">Ejecutar los ejemplos<span class="atajos-pista">en tu equipo</span></a></li>
            <li><a href="#/progreso">Mi progreso<span class="atajos-pista">guardar</span></a></li>
            <li><a href="todo.html">Todo el temario en una página<span class="atajos-pista">imprimir</span></a></li>
          </ul>
        </section>
      </div>
      <p class="nota-pie">Teclado: <code>/</code> buscar · <code>j</code>/<code>k</code> anterior y siguiente —en «Hoy» y en la lista, moverse por las filas— · <code>v</code> marcar visto · <code>d</code> marcar dominado · <code>p</code> posponer.</p>`;
  };

  vistas.ayuda = () => {
    return `<div class="migas"><a href="#/">Inicio</a> › Ayuda</div>
      <h1>Cómo estudiar con esto</h1>

      <h2>El método, en seis pasos</h2>
      <ol>
        <li><strong>Elige una ruta y empieza por la fase 0.</strong> El orden de las fases no es decorativo: cada página usa el vocabulario de las anteriores, y los «Antes de este» de cada concepto lo dicen.</li>
        <li><strong>Lee la página entera</strong>, incluidos los <em>errores típicos</em>. Es la parte que más tiempo ahorra: casi todo el mundo tropieza en los mismos sitios.</li>
        <li><strong>Escribe el código a mano y ejecútalo.</strong> Los bloques con la marca <span class="marca-verificable">verificado</span> se han ejecutado de verdad al construir el portal; los marcados <em>ilustrativo</em> necesitan datos, GPU o servicios que aquí no están. Antes de pasar de página, resuelve el <strong>problema práctico</strong>: cada concepto trae uno con su pista y su solución plegable, y el intento propio es lo que fija el concepto.</li>
        <li><strong>Responde las preguntas.</strong> Al responderlas entran en la cola de repaso: mañana, luego a los seis días, y después alejándose según lo que te cueste. Un fallo la devuelve al día siguiente.</li>
        <li><strong>Cada día, repaso antes que nada nuevo.</strong> Veinte minutos de repaso valen más que dos horas de lectura.</li>
        <li><strong>Marca como dominado</strong> solo cuando puedas explicárselo a alguien sin mirar la página.</li>
      </ol>

      <h2>Si un día no puedes con una ficha</h2>
      <p>Aplazarla no es abandonarla, y no borra nada: escribes <strong>hasta cuándo</strong> y
      <strong>por qué</strong>, la ficha deja de pedirse —no aparece en lo pendiente ni en la cola de repaso— y ese
      día vuelve sola, con lo que ya tuvieras hecho. Mientras tanto sigue contando en
      <a href="#/progreso">Mi progreso</a> con el estado que le toca por tus hechos: una excepción pospone el
      trabajo, no lo borra, y por eso el informe no la esconde. El botón está en cada ficha, y también con la
      tecla <code>p</code>. Si te arrepientes, se quita con un clic y no se pierde nada.</p>

      <h2>Por dónde seguir, y qué pasa si te saltas el orden</h2>
      <p>Cada ficha dice con qué otras se apoya: la lista «Antes de este» lleva el estado de cada
      prerrequisito —cumplido, a medias, sin empezar o aplazado— y, si falta alguno, aparece un aviso
      con el enlace y el motivo. La portada usa ese mismo grafo para proponerte
      <strong>cuál es el siguiente concepto</strong>: el primero sin empezar que tenga los prerrequisitos
      hechos, siguiendo el orden de las fases.</p>
      <p><strong>Nada de eso bloquea.</strong> La ficha se abre entera, se lee entera y se puede trabajar
      entera aunque no hayas hecho ninguno de sus prerrequisitos. El aviso solo informa: está ahí porque
      casi siempre ayuda empezar por el principio, no porque haya una puerta. Y si te molesta, se apaga
      con un botón en la propia ficha —el aviso, no la información: la lista sigue diciendo en qué estado
      está cada prerrequisito—. El motivo está escrito en
      <a href="#/ayuda">esta misma página</a>: quien estudia solo es la misma persona que decide el orden,
      y un bloqueo en un portal sin servidor es una puerta cerrada con la llave dentro.</p>
      <p>El orden de las fases se respeta hasta una fase por delante de la que estés: nunca te va a
      proponer una ficha de la fase 9 el primer día. Si eliges una <strong>ruta</strong>, la recomendación
      se limita a esa ruta, y cambiar de ruta no oculta contenido ni pierde progreso: solo cambia por
      dónde te propone empezar.</p>

      <h2>Qué hacer hoy, sin pensarlo</h2>
      <p>La portada abre con un bloque <strong>«Hoy»</strong> que contesta a la única pregunta que
      importa al sentarse: ¿qué hago ahora? Es una lista corta —cinco filas por defecto— y cada fila
      dice cuatro cosas: qué es, por qué está ahí, cuánto cuesta y un enlace que la abre.</p>
      <p>El orden es fijo y está escrito en la propia pantalla, porque un orden que no se puede leer
      no se puede discutir: <strong>primero el repaso vencido</strong> —las preguntas cuyo día ya
      llegó—, <strong>después las fichas a medias</strong>, <strong>luego las aplazadas que vencen
      hoy</strong> y, por último, <strong>el siguiente concepto nuevo</strong> por prerrequisitos.
      En <a href="#/pendientes">Lo que me falta
      hoy</a> está la lista entera, con filtro por motivo y el tope de filas que elijas.</p>
      <p>Una ficha sale una sola vez, en el primer grupo en el que encaja. Y si la lista se queda
      vacía no dice «no hay nada»: dice qué hacer para que tenga algo, que es marcar una ficha como
      vista —sus preguntas entran en la cola de repaso— o dejar una a medias.</p>

      <h2>Atajos de teclado</h2>
      <div class="tabla-envoltorio"><table>
        <thead><tr><th>Tecla</th><th>Qué hace</th></tr></thead>
        <tbody>
          <tr><td><code>/</code></td><td>Ir al buscador (admite erratas: «estacionareidad» encuentra «estacionariedad»)</td></tr>
          <tr><td><code>j</code> / <code>k</code></td><td>Concepto siguiente / anterior; en «Hoy» y en la lista, la fila siguiente o anterior</td></tr>
          <tr><td><code>v</code></td><td>Marcar el concepto como visto (dentro de una ficha; en la lista no hace nada, a propósito)</td></tr>
          <tr><td><code>d</code></td><td>Marcarlo como dominado, solo si ya cumple los requisitos (dentro de una ficha)</td></tr>
          <tr><td><code>p</code></td><td>Posponer la ficha: abre el formulario con la fecha y el motivo</td></tr>
          <tr><td><code>Enter</code> en el buscador</td><td>Abrir el primer resultado</td></tr>
          <tr><td><code>Esc</code> en el buscador</td><td>Cerrar los resultados</td></tr>
        </tbody>
      </table></div>

      <h2>Llevarlo al móvil o a Anki</h2>
      <p>Un ordenador no siempre está a mano, y repasar en el móvil es lo que sostiene una racha. En
      <a href="#/progreso">Mi progreso</a> puedes <strong>exportar todas las preguntas</strong> a un fichero
      que Anki importa directamente (Archivo → Importar, separador tabulador, HTML activado) y
      <strong>descargar el avance</strong> en JSON para seguir en otro equipo.</p>`;
  };


  /** Bloque de estado, etiquetas, requisitos y prerrequisitos, plegado por defecto. */
  function bloqueMetaFicha(id, cont, est, listaPrereqs, avisoPrereqs, avisoAlmacen) {
    const requisitos = (() => {
      const panel = panelRequisitos(id, est);
      if (!panel) return "";
      return `<details class="requisitos-plegables" id="requisitos-plegables"><summary>Requisitos: ${est.cumplidos} de ${est.total}</summary>${panel}</details>`;
    })();
    return `<details class="ficha-meta" id="ficha-meta">
      <summary><span>Detalles ▾</span><span class="nota-pie">${est.cumplidos}/${est.total}</span></summary>
      <div class="ficha-meta-cuerpo">
        <div class="etiquetas">
          ${pastillaNivel(cont.nivel)}
          ${pastillasRutas(cont.rutas)}
          ${cont.practicas?.length ? `<span class="pastilla">${cont.practicas.length} problema${cont.practicas.length > 1 ? "s" : ""} práctico${cont.practicas.length > 1 ? "s" : ""}</span>` : ""}
          ${cont.tags.map((t) => `<span class="pastilla">${esc(t)}</span>`).join("")}
        </div>
        <p class="estado-ficha" id="estado-ficha">
          ${pastillaEstadoDesde(id, est, "", "pastilla-estado")}
          <span class="nota-pie">${est.cumplidos} de ${est.total} requisitos</span>
          <span class="sello-leido ${est.requisitos[0].cumplido ? "cumplido" : ""}" id="sello-leido">${est.requisitos[0].cumplido ? "✓ Leída" : "Se marcará al llegar al final del artículo"}</span>
        </p>
        ${est.avisos.length ? `<aside class="aviso aviso-aviso" id="aviso-estado"><p class="aviso-titulo">Revisa esto</p><div>${est.avisos.map((a) => `<p>${esc(a)}</p>`).join("")}</div></aside>` : ""}
        ${requisitos}
        ${listaPrereqs}
        ${avisoPrereqs}
        ${avisoAlmacen}
      </div>
    </details>`;
  }

  /** Inserta el bloque justo después del primer párrafo de «En una frase». */
  function insertarMetaFicha(html, bloque) {
    const seccion = html.match(/<h2[^>]*>\s*En una frase\s*<\/h2>\s*<p>[\s\S]*?<\/p>/i);
    if (seccion) return html.replace(seccion[0], seccion[0] + bloque);
    const primero = html.match(/<\/p>/);
    return primero ? html.replace(primero[0], primero[0] + bloque) : bloque + html;
  }

  vistas.concepto = (id) => {
    const c = P.conceptos[id];
    const cont = contenidoDe(id);
    if (!c) return `<h1>Concepto desconocido</h1><p><a href="#/">Volver al inicio</a></p>`;
    if (!cont) return `<h1>${esc(c.t)}</h1><p>Cargando el contenido…</p>`;
    const p = progreso[id] || {};
    const est = estadoDe(id);
    const i = orden.findIndex((x) => x.id === id);
    const ant = orden[i - 1], sig = orden[i + 1];
    // El grafo deja de ser una lista de enlaces: cada prerrequisito lleva su estado, y el aviso
    // de lo que falta va ARRIBA, junto al titulo, que es donde se mira antes de empezar a leer.
    const listaPrereqs = listaPrerequisitos(id);
    const avisoPrereqs = c.p.length ? cajaAvisoPrerequisitos(id) : "";
    const relacionados = orden.filter((x) => x.id !== id && x.g.some((t) => c.g.includes(t))).slice(0, 6);
    // «Dominado» es el unico estado que pide un juicio humano, y por eso no se regala: si los
    // requisitos no se cumplen, el boton se deshabilita y el motivo se lee al lado. La tecla
    // `d` hace lo mismo, o el atajo seria una puerta de atras.
    // `estadoSinAplazo` y no `estado`: una ficha aplazada que ya tiene los requisitos cumplidos
    // sigue pudiendo marcarse como dominada. Mirar el estado que se enseña la dejaria encerrada
    // en el aplazo, que es lo contrario de lo que este boton significa.
    const puedeDominar = est.estadoSinAplazo === "dominado" || est.estadoSinAplazo === "hecho";
    // Cuando esta aplazada, `est.motivo` viene vacio a proposito (no falta nada: esta pospuesta), y
    // un motivo vacio dejaria el aviso a medias. Se dice lo que pasa con todas las letras.
    const motivoDominar = puedeDominar ? "" :
      `Todavía no: ${est.cumplidos} de ${est.total} requisitos. ${est.motivo || "Está aplazada, y los requisitos que le faltan siguen ahí: quita el aplazo cuando quieras seguir con ella."}`;
    const avisoAlmacen = almacenFalla
      ? `<p class="nota-pie aviso-almacen">Este navegador no deja guardar en este equipo, así que el progreso se perderá al cerrar la pestaña. Para conservarlo, exporta el progreso desde <a href="#/progreso">Mi progreso</a>.</p>`
      : "";
    // Las acciones de la ficha (marcar, nota, aplazo) van DESPUÉS del artículo: se lee primero
    // y se actúa al terminar. Antes ocupaban ~280 px en móvil y empujaban el texto dos pantallas.
    const metaFicha = bloqueMetaFicha(id, cont, est, listaPrereqs, avisoPrereqs, avisoAlmacen);
    const contenidoConMeta = cont.html;
    const accionesFicha = `
        <div class="acciones-concepto">
          <button class="boton ${p.visto ? "activo" : ""}" data-marcar="visto" data-id="${id}">${p.visto ? "✓ Visto" : "Marcar como visto"}</button>
          ${botonDominado(id, puedeDominar, motivoDominar)}
          <a class="boton" href="#/repaso">Repasar preguntas</a>
        </div>
        <div class="ficha-notas" id="ficha-notas">
          <button type="button" class="boton ${favoritos[id] ? "activo" : ""}" data-favorito="${esc(id)}" aria-pressed="${favoritos[id] ? "true" : "false"}">${favoritos[id] ? "★ Favorita" : "☆ Marcar favorita"}</button>
          <label class="nota-pie" for="nota-ficha">Tu nota sobre esta ficha (se guarda en este equipo)</label>
          <textarea id="nota-ficha" data-nota="${esc(id)}" rows="3" placeholder="Lo que quieras recordar de esta ficha">${esc((notas[id] && typeof notas[id] === "object" ? notas[id].texto : notas[id]) || "")}</textarea>
        </div>
        ${bloqueAplazo(id, est)}`;
    return `<div class="migas"><a href="#/">Inicio</a> › <a href="#/fase/${c.fid}">Fase ${c.f}</a> › ${esc(c.t)}</div>
      <header class="cabecera-concepto">
        <h1>${esc(cont.titulo)}</h1>
        <p class="resumen-ficha">${esc(cont.resumen)}</p>
        <p class="nivel-ficha">Nivel: <strong>${esc(cont.nivel || "sin nivel")}</strong></p>
        ${metaFicha}
      </header>
      <div class="ficha-cuerpo">
        <nav class="indice-ficha" id="indice-ficha" aria-label="En esta página" hidden>
          <details>
            <summary class="indice-ficha-titulo">En esta página</summary>
            <ol></ol>
          </details>
        </nav>
        <article id="contenido-concepto">${contenidoConMeta}</article>
      </div>
      ${accionesFicha}
      ${cont.fuentes?.length ? `<h2>Fuentes</h2><ul>${cont.fuentes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      ${relacionados.length ? `<h2>Relacionados</h2><p>${relacionados.map((x) => `<a class="enlace-interno" href="#/c/${x.id}">${esc(x.t)}</a>`).join(" · ")}</p>` : ""}
      <div class="cierre-ficha">
        <p class="cierre-ficha-rotulo">Lo siguiente</p>
        ${sig
          ? `<h2>${esc(sig.t)}</h2>
             <p class="acciones-fila"><a class="boton primario" href="#/c/${sig.id}">Seguir con esta ficha</a> <a class="boton" href="#/repaso">Repasar las preguntas</a></p>`
          : `<h2>Has llegado al final del temario</h2>
             <p class="acciones-fila"><a class="boton primario" href="#/progreso">Ver mi progreso</a> <a class="boton" href="#/repaso">Repasar las preguntas</a></p>`}
      </div>
      <nav class="anterior-siguiente" aria-label="Fichas anterior y siguiente">
        ${ant ? `<a href="#/c/${ant.id}"><span class="rotulo">Anterior</span>← ${esc(ant.t)}</a>` : "<span></span>"}
        ${sig ? `<a href="#/c/${sig.id}" style="text-align:right"><span class="rotulo">Siguiente</span>${esc(sig.t)} →</a>` : "<span></span>"}
      </nav>`;
  };

  // ── Buscador ──────────────────────────────────────────────────────────
  const normalizar = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  /** Distancia de edicion (Levenshtein) entre dos palabras cortas. */
  function distancia(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const actual = [i];
      for (let j = 1; j <= b.length; j++) {
        actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previa = actual;
    }
    return previa[b.length];
  }

  // Indice de palabras del titulo, para poder perdonar una errata al escribir.
  const PALABRAS_TITULO = new Map();
  for (const c of Object.values(CATALOGO)) {
    for (const palabra of new Set(normalizar(c.t).match(/[a-z0-9]{4,}/g) || [])) {
      if (!PALABRAS_TITULO.has(palabra)) PALABRAS_TITULO.set(palabra, []);
      PALABRAS_TITULO.get(palabra).push(c.id);
    }
  }

  // Sinónimos de la jerga real del entrenador y del alumno. «Abandono de clientes» tiene que
  // encontrar churn aunque la ficha no use esa expresión. Se amplía a mano: es una lista corta y
  // auditable, no un modelo de lenguaje.
  const SINONIMOS = {
    abandono: ["churn", "baja", "cancelacion"],
    abandonos: ["churn", "bajas"],
    baja: ["churn", "cancelacion"],
    bajas: ["churn", "cancelaciones"],
    cancelacion: ["churn", "baja"],
    cancelaciones: ["churn", "bajas"],
    churn: ["abandono", "baja", "cancelacion"],
    clientes: ["usuarios", "churn"],
    retencion: ["churn", "fidelizacion"],
    fidelizacion: ["retencion", "churn"],
    fuga: ["churn", "abandono"],
    fugas: ["churn", "abandonos"],
    kpi: ["kpis", "indicador", "indicadores", "metrica", "metricas", "cuadro de mando", "dashboard"],
    kpis: ["kpi", "indicadores", "metricas"],
    forecasting: ["forecast", "prediccion", "pronostico", "proyeccion", "series temporales"],
    forecast: ["forecasting", "prediccion", "pronostico", "proyeccion"],
  };
  // Frases completas: si la consulta es la frase, se sustituye por su término técnico y se evita
  // exigir palabras que la ficha no tiene que repetir.
  const SINONIMOS_FRASE = [
    ["abandono de clientes", ["churn"]],
    ["abandono de cliente", ["churn"]],
    ["abandonos de clientes", ["churn"]],
    ["baja de clientes", ["churn"]],
    ["bajas de clientes", ["churn"]],
    ["clientes que se van", ["churn"]],
    ["cancelacion de clientes", ["churn"]],
    ["fuga de clientes", ["churn"]],
    ["retencion de clientes", ["churn", "retencion"]],
  ];
  const alternativasDe = (termino) => {
    const salida = new Set([termino]);
    for (const [clave, alts] of Object.entries(SINONIMOS)) {
      if (termino === clave || termino.startsWith(clave)) for (const a of alts) salida.add(a);
    }
    return [...salida];
  };
  const terminosDeBusqueda = (consulta) => {
    const normal = normalizar(consulta);
    for (const [frase, reemplazo] of SINONIMOS_FRASE) {
      if (normal.includes(frase)) {
        const resto = normal.split(/\s+/).filter((x) => x.length > 1 && !frase.split(/\s+/).includes(x));
        return [...new Set([...reemplazo, ...resto])];
      }
    }
    return [...new Set(normal.split(/\s+/).filter((x) => x.length > 1))];
  };

  function buscar(consulta, limite = 25) {
    const inicio = performance.now();
    const terminos = terminosDeBusqueda(consulta);
    if (!terminos.length) return [];
    // Si la consulta ES el nombre de una ruta («Ingeniería de datos»), los proyectos y
    // laboratorios de esa ruta suben: buscar por categoría tiene que enseñar la categoría.
    const normalConsulta = normalizar(consulta).trim();
    const rutaBuscada = Object.values((typeof P !== "undefined" && P.rutas) || {})
      .map((r) => normalizar(r && r.nombre ? r.nombre : ""))
      .find((nombre) => nombre && nombre === normalConsulta) || "";
    const puntos = new Map();
    const sumar = (id, n) => puntos.set(id, (puntos.get(id) || 0) + n);

    // 1. Coincidencia ponderada por secciones: título (16) > etiquetas/ruta/nivel (10) >
    // resumen (5) > contenido (hasta 4). Acertar en el título o en una etiqueta manda.
    // Primero se prueba con los términos EXACTOS; los sinónimos solo entran si no hay nada
    // (si no, «churn» arrastraría 206 fichas que dicen «baja» o «cancelación» en el cuerpo).
    const puntuar = (conSinonimos) => {
      puntos.clear();
      for (const doc of indice()) {
      const piezas = doc.x.split("\u0001");
      const titulo = piezas[0] || "";
      const etiquetas = piezas[1] || "";
      const resumen = piezas[2] || "";
      const cuerpo = piezas.slice(3).join(" ");
      let total = 0, todos = true;
      for (const t of terminos) {
        let mejor = 0;
        for (const alt of (conSinonimos ? alternativasDe(t) : [t])) {
          if (titulo.includes(alt)) { mejor = Math.max(mejor, 16); continue; }
          if (etiquetas.includes(alt)) { mejor = Math.max(mejor, 10); continue; }
          if (resumen.includes(alt)) { mejor = Math.max(mejor, 5); continue; }
          const veces = cuerpo.split(alt).length - 1;
          if (veces > 0) mejor = Math.max(mejor, Math.min(veces, 4));
        }
        if (!mejor) { todos = false; break; }
        total += mejor;
      }
      if (todos) {
        const esRecurso = doc.id.startsWith("proj:") || doc.id.startsWith("lab:");
        const totalRuta = rutaBuscada && esRecurso && etiquetas.includes(rutaBuscada) ? 30 : 0;
        sumar(doc.id, total + totalRuta);
      }
      }
    };
    puntuar(false);
    if (!puntos.size) puntuar(true);

    // 2. Si algo no aparece, se perdona una errata contra las palabras del titulo.
    for (const t of terminos) {
      if (t.length < 5) continue;
      const umbral = t.length >= 8 ? 2 : 1;
      for (const [palabra, ids] of PALABRAS_TITULO) {
        if (Math.abs(palabra.length - t.length) > umbral) continue;
        if (palabra.includes(t) || t.includes(palabra)) { for (const id of ids) sumar(id, 5); continue; }
        if (distancia(palabra, t) <= umbral) for (const id of ids) sumar(id, 4);
      }
    }

    const resultados = [...puntos.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite).map(([id]) => id);
    medirCoste("muestra.busqueda", inicio);
    return resultados;
  }

  // «¿Buscabas X?»: se parece por letras, no por significado, pero acierta lo suficiente
  // para sacar a alguien de un callejón. Si no hay nada parecido, no se inventa nada.
  function buscarParecido(consulta) {
    const q = consulta.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (q.length < 3) return null;
    let mejor = null, mejorPuntos = 0;
    for (const [id, c] of Object.entries(CATALOGO)) {
      const titulo = c.t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let puntos = 0;
      for (const palabra of q.split(/\s+/).filter((p) => p.length >= 4)) {
        if (titulo.includes(palabra)) puntos += 3;
        else if (palabra.length >= 5) {
          for (let i = 0; i + 4 <= palabra.length; i++) if (titulo.includes(palabra.slice(i, i + 4))) { puntos += 1; break; }
        }
      }
      if (puntos > mejorPuntos) { mejorPuntos = puntos; mejor = { id, t: c.t }; }
    }
    return mejorPuntos >= 3 ? mejor : null;
  }
  function pintarResultados(ids, consulta) {
    const caja = $("#resultados-busqueda");
    if (!consulta.trim()) { caja.hidden = true; caja.innerHTML = ""; return; }
    // Un estado vacío no puede limitarse a decir que no hay nada: eso deja a quien busca igual
    // que estaba. Se dan tres salidas concretas y, si el término se parece a algo, se nombra
    // ese algo. «Nada para…» a secas obliga a adivinar qué hacer después.
    if (!ids.length) {
      caja.hidden = false;
      const parecido = buscarParecido(consulta);
      caja.innerHTML = `<div class="sin-resultados">
        <p>Nada para «${esc(consulta)}».</p>
        ${parecido ? `<p>¿Buscabas <a href="${esc(enlaceRecurso(parecido.id))}">${esc(parecido.t)}</a>?</p>` : ""}
        <p class="nota-pie">Puedes <a href="#/glosario">mirar el glosario</a> entero, o
        <a href="#/plan">ver el plan</a> por fases.</p>
      </div>`;
      return;
    }
    caja.hidden = false;
    caja.innerHTML = ids.map((id) => {
      const c = CATALOGO[id];
      return `<a href="${esc(enlaceRecurso(id))}"><span class="res-fase">${c.resourceType === "lab" ? "Laboratorio" : c.resourceType === "project" ? "Proyecto" : "F" + c.f} · ${esc(c.n)}</span><br>${esc(c.t)}</a>`;
    }).join("");
  }

  // ── Interacción con las preguntas ─────────────────────────────────────

  /** «12 s», «1 min 20 s». Un tiempo en segundos redondos dice menos que uno en las dos unidades. */
  function segundosLegibles(seg) {
    const s = Number.isFinite(Number(seg)) ? Math.max(0, Math.round(Number(seg))) : 0;
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)} min ${s % 60} s`;
  }

  /** «4 de 5 respuestas acertadas (80 %)». El recuento y su porcentaje, en una linea. */
  function recuentoAciertos(lista) {
    const bien = lista.filter((x) => x.correcta).length;
    const pct = lista.length ? Math.round((bien / lista.length) * 100) : 0;
    return `${bien} de ${lista.length} respuestas acertadas (${pct} %)`;
  }

  /**
   * La linea que se lee DESPUES de responder: la nota que se enseña, con que criterio, y de
   * donde sale el plazo del repaso. Las tres cosas juntas porque separarlas es lo que hace que
   * alguien crea que insistir hasta acertar alarga el repaso.
   *
   * `null` de nota NO se pinta como cero: se dice que no hay ningun intento, que es la verdad.
   */
  function lineaNota(lista, criterio, rotulos) {
    const tabla = rotulos && typeof rotulos === "object" ? rotulos : ROTULO_CUAL_CUENTA;
    const criterio_ = CUAL_CUENTA.includes(criterio) ? criterio : CUAL_CUENTA_DEFECTO;
    const nota = notaDe(lista, criterio_);
    if (nota === null) return { texto: "Todavía no hay ninguna respuesta que contar en esta pregunta.", nota: null, criterio: criterio_ };
    const bien = lista.filter((x) => x.correcta).length;
    return {
      texto: `Esta pregunta, contando ${tabla[criterio_].frase.replace(/^cuenta /, "")}: ${bien === lista.length ? "acertada siempre" : bien === 0 ? "fallada siempre" : `${bien} de ${lista.length} veces`}. Se enseña ${nota.toFixed(2)} de 1.`,
      nota,
      criterio: criterio_,
    };
  }

  /**
   * «Tus intentos»: lo que se respondio, cuando, y cuanto se tardo. Es el bloque que convierte
   * el historial en algo util y no en un contador: sin el, «3 intentos» no dice nada de lo que
   * paso, y con el se ve de un vistazo si el acierto fue a la primera o a la quinta.
   *
   * Se enseña la opcion ELEGIDA en cada intento y no solo si acerto: de una respuesta mal se
   * aprende mirando cual se eligio, y ese dato ya esta guardado, asi que esconderlo seria
   * guardar para nada.
   */
  function bloqueIntentos(lista, criterio) {
    const intentos_ = Array.isArray(lista) ? lista.map(leerIntento).filter(Boolean) : [];
    if (!intentos_.length) return "";
    const criterio_ = CUAL_CUENTA.includes(criterio) ? criterio : CUAL_CUENTA_DEFECTO;
    const nota = notaDe(intentos_, criterio_);
    // Que intento es el que manda para la nota: se subraya la fila, y con el texto tambien,
    // porque un subrayado solo no dice nada a quien no lo ve.
    const elegido = indiceQueCuenta(intentos_, criterio_);
    const filas = intentos_.map((x, i) => {
      const cuando = x.fecha || "sin fecha";
      const esLaQueCuenta = i === elegido;
      return `<tr class="${esLaQueCuenta ? "intento-cuenta" : ""}"${esLaQueCuenta ? ' data-cuenta="si"' : ""}>
        <td class="intento-n">${i + 1}</td>
        <td class="intento-fecha">${esc(cuando)}</td>
        <td class="intento-elegida">${x.elegida === null ? "sin respuesta" : esc(x.elegida)}</td>
        <td class="intento-resultado">${x.correcta ? "bien" : "mal"}${esLaQueCuenta ? `<span class="intento-marca"> ← es la que cuenta</span>` : ""}</td>
        <td class="intento-segundos">${esc(segundosLegibles(x.segundos))}</td>
      </tr>`;
    }).join("");
    const resumen = nota === null ? "sin respuestas todavía" : `nota mostrada ${nota.toFixed(2)} de 1 (${ROTULO_CUAL_CUENTA[criterio_].rotulo.toLowerCase()})`;
    return `<details class="intentos" id="intentos-pregunta">
      <summary class="intentos-cabecera">Tus intentos: ${intentos_.length} ${intentos_.length === 1 ? "respuesta" : "respuestas"} · ${esc(resumen)}</summary>
      <div class="tabla-envoltorio"><table class="tabla-intentos">
        <caption class="visualmente-oculto">Respuestas guardadas de esta pregunta, de la más antigua a la más reciente.</caption>
        <thead><tr><th>N.º</th><th>Día</th><th>Elegiste</th><th>Resultado</th><th>Tiempo</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
      <p class="nota-pie">${esc(politicaIntentos(criterio_, ROTULO_CUAL_CUENTA))}</p>
      <p class="nota-pie">Se guardan las ${TOPE_INTENTOS} últimas respuestas de cada pregunta, en este equipo. La más reciente es la que decide cuándo vuelve a preguntártela.</p>
    </details>`;
  }

  /**
   * La linea que dice, ANTES de responder, cual de los intentos cuenta.
   *
   * Va en la propia pregunta y no en una pagina de ajustes escondida a proposito: la regla de
   * cual cuenta tiene que poder leerse antes de empezar, porque despues ya no cambia nada de lo
   * que se ha respondido y enterarse tarde es enterarse de nada.
   */
  function lineaPolitica(criterio, rotulos) {
    const tabla = rotulos && typeof rotulos === "object" ? rotulos : ROTULO_CUAL_CUENTA;
    const criterio_ = CUAL_CUENTA.includes(criterio) ? criterio : CUAL_CUENTA_DEFECTO;
    return `<p class="intentos-politica" id="politica-intentos"><span class="intentos-politica-rotulo">Cuál cuenta: ${esc(tabla[criterio_].rotulo)}</span> ${esc(politicaIntentos(criterio_, tabla))}</p>`;
  }

  // ── El resumen de los intentos, en Mi progreso ───────────────────────
  //
  // Lo que este bloque tiene que dejar claro, y por eso esta escrito asi: la nota y el repaso no
  // son la misma cuenta. Arriba, la nota con el criterio elegido y el selector para cambiarlo;
  // debajo, el recordatorio de que lo que programa el repaso es la ultima respuesta. Sin esa
  // segunda mitad, cambiar el criterio pareceria cambiar el repaso, y no lo hace.

  /**
   * Los intentos guardados, resumidos. Funcion pura: el dia y los rotulos entran por parametro.
   *
   * Se recorren las DOS fuentes a proposito, `intentos` y `srs`, porque son dos generaciones del
   * mismo dato: quien respondio antes de que existiera el historial tiene tarjeta en `srs` y
   * ninguna respuesta guardada. Enseñar solo la primera dejaria fuera a esas preguntas sin decir
   * por que, y contarlas como «no lo he intentado» seria mentir sobre lo que ya hay hecho.
   */
  function resumenIntentos(intentos, srs_, P_, pref_, dias_, rotulos) {
    const guardados = intentos && typeof intentos === "object" && !Array.isArray(intentos) ? intentos : {};
    const tarjetas = srs_ && typeof srs_ === "object" && !Array.isArray(srs_) ? srs_ : {};
    const conceptos = P_ && typeof P_ === "object" && P_.conceptos && typeof P_.conceptos === "object" && !Array.isArray(P_.conceptos) ? P_.conceptos : {};
    const prefs = pref_ && typeof pref_ === "object" && !Array.isArray(pref_) ? pref_ : {};
    const criterio = criterioCuenta(prefs);
    const clavesReales = new Set();
    for (const [id, c] of Object.entries(conceptos)) {
      const total = Number.isInteger(c && c.q) && c.q > 0 ? c.q : 0;
      for (let k = 0; k < total; k++) clavesReales.add(`${id}#${k}`);
    }
    const filas = [];
    let fueraDelTemario = 0, ignorados = 0;
    for (const [clave, valor] of Object.entries(guardados)) {
      // Los registros que no tienen la forma esperada se cuentan SIEMPRE, incluso cuando su clave
      // apunta a una pregunta que ya no existe: contarlos solo dentro del temario dejaba invisibles
      // los que mas importan, que son los que vienen de una version anterior del portal.
      const lista = intentosDe(guardados, clave);
      ignorados += (Array.isArray(valor) ? valor.length : 0) - lista.length;
      // Una clave que apunta a una pregunta que ya no esta en el temario no se borra —el temario
      // puede volver a tenerla— pero tampoco se cuenta, y se dice cuantas son.
      if (!clavesReales.has(clave)) { fueraDelTemario++; continue; }
      if (!lista.length) continue;
      const [id] = clave.split("#");
      const c = conceptos[id] || {};
      const t = tarjetas[clave];
      filas.push({
        clave, id, titulo: typeof c.t === "string" ? c.t : id,
        intentos: lista.length,
        aciertos: lista.filter((x) => x.correcta).length,
        nota: notaDe(lista, criterio),
        venc: t && typeof t === "object" && esFechaISO(t.venc) ? t.venc : "",
        ultima: ultimoIntento(lista),
      });
    }
    for (const [clave, t] of Object.entries(tarjetas)) {
      if (!clavesReales.has(clave)) continue;
      if (filas.some((f) => f.clave === clave)) continue;
      const t_ = t && typeof t === "object" && !Array.isArray(t) ? t : {};
      const respondidas = Number(t_.aciertos) + Number(t_.fallos);
      if (!Number.isFinite(respondidas) || respondidas <= 0) continue;
      if (!esFechaISO(t_.venc)) continue;
      const [id] = clave.split("#");
      const c = conceptos[id] || {};
      filas.push({
        clave, id, titulo: typeof c.t === "string" ? c.t : id,
        intentos: 0,
        aciertos: Number.isFinite(Number(t_.aciertos)) ? Number(t_.aciertos) : 0,
        nota: null, venc: t_.venc, ultima: null,
      });
    }
    // Lo mas reciente primero y, a igualdad, la clave. Un orden que cambia entre dos pintados
    // es un orden en el que no se puede confiar, y este se pinta cada vez que se abre la pagina.
    filas.sort((a, b) => {
      const fa = a.ultima?.fecha || "", fb = b.ultima?.fecha || "";
      return fa === fb ? a.clave.localeCompare(b.clave) : (fa < fb ? 1 : -1);
    });
    const conNota = filas.filter((f) => f.nota !== null);
    const tabla = rotulos && typeof rotulos === "object" ? rotulos : ROTULO_CUAL_CUENTA;
    const criterio_ = CUAL_CUENTA.includes(criterio) ? criterio : CUAL_CUENTA_DEFECTO;
    return {
      filas,
      totalPreguntas: filas.length,
      conIntentos: conNota.length,
      sinIntentos: filas.length - conNota.length,
      media: conNota.length ? conNota.reduce((s, f) => s + f.nota, 0) / conNota.length : null,
      ignorados,
      fueraDelTemario,
      criterio: criterio_,
      ayuda: tabla[criterio_].ayuda,
    };
  }

  // El selector se pinta AQUI y no en una pagina de ajustes porque es donde se mira la nota: la
  // regla que decide una cifra tiene que poder cambiarse en el sitio donde esa cifra se lee.
  const opcionesCualCuenta = (criterio) => CUAL_CUENTA.map((k) =>
    `<option value="${k}"${k === criterio ? " selected" : ""}>${esc(ROTULO_CUAL_CUENTA[k].rotulo)} — ${esc(ROTULO_CUAL_CUENTA[k].frase)}</option>`).join("");

  /** El resumen completo del historial: el selector, las cifras y la tabla. */
  function bloqueResumenIntentos() {
    const r = resumenIntentos(intentos, srs, P, pref, dias, ROTULO_CUAL_CUENTA);
    const ayuda = esc(r.ayuda);
    const selector = `<p class="campo-intentos">
      <label for="cual-cuenta">Cuál de tus respuestas cuenta para la nota que se enseña</label>
      <select id="cual-cuenta">${opcionesCualCuenta(r.criterio)}</select>
      <span class="campo-ayuda" id="ayuda-cual-cuenta">${ayuda}</span>
    </p>
    <p class="nota-pie">El repaso espaciado no depende de esta elección: se programa siempre con tu
    última respuesta a cada pregunta, porque repetir hasta acertar no es acordarse de ella. Cambiar el
    criterio cambia la cifra que se enseña aquí, y nada más.</p>`;
    if (!r.totalPreguntas) {
      return `<div id="resumen-intentos">${selector}
        <p class="nota-pie">Todavía no hay ninguna pregunta respondida, así que no hay intentos que contar.
        En cuanto respondas la primera —en una ficha o en <a href="#/repaso">Repaso</a>— aparecerán aquí,
        con el día, lo que elegiste y cuánto tardaste.</p></div>`;
    }
    const filas = r.filas.slice(0, 40).map((f) => `<tr>
      <td><a href="#/c/${esc(f.id)}">${esc(f.titulo)}</a><br><span class="nota-pie">${esc(f.clave)}</span></td>
      <td>${f.intentos ? `${f.intentos} · ${f.aciertos} bien` : "—"}</td>
      <td>${f.nota === null ? `<span class="nota-pie">sin respuestas guardadas</span>` : f.nota.toFixed(2)}</td>
      <td>${f.ultima ? `${f.ultima.correcta ? "bien" : "mal"}<br><span class="nota-pie">${esc(f.ultima.fecha || "sin fecha")}</span>` : `<span class="nota-pie">—</span>`}</td>
      <td>${f.venc ? esc(f.venc) : `<span class="nota-pie">—</span>`}</td>
    </tr>`).join("");
    // El pie dice lo que no cuadra en vez de esconderlo: un historial que trae basura tiene que
    // poder verse, porque si no, la unica forma de notarlo es que la cuenta no salga.
    const reparos = [];
    if (r.totalPreguntas > 40) reparos.push(`se enseñan las 40 más recientes de ${r.totalPreguntas}`);
    if (r.ignorados) reparos.push(`${r.ignorados} ${r.ignorados === 1 ? "respuesta guardada no tiene" : "respuestas guardadas no tienen"} la forma esperada y no se cuentan (no se borran)`);
    if (r.fueraDelTemario) reparos.push(`${r.fueraDelTemario} ${r.fueraDelTemario === 1 ? "clave apunta" : "claves apuntan"} a una pregunta que ya no está en el temario (se conservan por si vuelve)`);
    return `<div id="resumen-intentos">
    ${selector}
    <div class="estadisticas">
      <div class="estadistica"><div class="valor">${r.conIntentos}</div><div class="rotulo">preguntas con historial</div></div>
      <div class="estadistica"><div class="valor">${r.media === null ? "—" : r.media.toFixed(2)}</div><div class="rotulo">nota media que se enseña (de 1)</div></div>
      <div class="estadistica"><div class="valor">${r.sinIntentos}</div><div class="rotulo">respondidas antes del historial</div></div>
    </div>
    <div class="tabla-envoltorio"><table>
      <caption class="visualmente-oculto">Intentos guardados por pregunta, con la nota que se enseña y el día en que vuelve.</caption>
      <thead><tr><th>Pregunta</th><th>Intentos</th><th>Nota que se enseña</th><th>Última</th><th>Vuelve el</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    ${reparos.length ? `<p class="nota-pie">Reparos: ${esc(reparos.join("; "))}.</p>` : ""}
    </div>`;
  }

  function conectarQuizzes(raiz, idConcepto) {
    // El cronometro se abre al pintar la ficha, no al pulsar la primera opcion: lo que
    // interesa es lo que se tarda en decidirse, no lo que se tarda en hacer clic.
    const abierto = ahora();
    // El modo elegido para el repaso manda tambien AQUI, en la ficha. No es una copia por
    // comodidad: quien esta estudiando en diferido porque quiere examinarse no puede encontrarse
    // la respuesta revelada al primer clic en la ficha, o el modo no serviria para nada. Lo unico
    // que la ficha NO hace es guardar respuestas a ciegas: alli no hay cola que entregar.
    const modo = modoDe(pref);
    const pedirSeguridad = seguridadPedida(pref);
    $$(".quiz", raiz).forEach((bloque) => {
      const n = Number(bloque.dataset.quiz);
      const cont = contenidoDe(idConcepto);
      const q = cont?.quizzes?.[n];
      if (!q) return;
      const clave = `${idConcepto}#${n}`;
      const historial = srs[clave];
      bloque.dataset.modo = modo;
      // El estado de los reintentos y las pistas pedidas viven mientras la ficha este abierta. Es
      // a proposito que no se guarden: en la ficha no hay cola que entregar, asi que una respuesta
      // a medias no vale nada y no tiene sentido conservarla.
      let rt = estadoReintentos({}, "", null);
      let pistasPedidas = 0;
      // La nota de esta pregunta, con el criterio elegido, y el bloque que enseña los intentos.
      // Los dos se pintan ANTES de responder cuando ya hay historial, y se vuelven a pintar
      // despues de cada respuesta: la nota que se enseña cambia con el intento nuevo, y una
      // cifra que se queda en la de antes es peor que no ponerla.
      const zonaIntentos = document.createElement("div");
      zonaIntentos.className = "quiz-intentos";
      const pintarIntentos = () => {
        const lista = intentosDe(intentos, clave);
        const criterio = criterioCuenta(pref);
        const resumen = lineaNota(lista, criterio, ROTULO_CUAL_CUENTA);
        zonaIntentos.innerHTML =
          `<p class="quiz-nota${resumen.nota === null ? " quiz-nota-vacia" : ""}">${esc(resumen.texto)}</p>` +
          bloqueIntentos(lista, criterio);
      };
      // La politica va la primera, antes de la zona de intentos: asi lo que se lee al llegar a
      // la pregunta es la regla, y solo despues lo que ha pasado hasta ahora.
      bloque.insertAdjacentHTML("afterbegin", `<span class="quiz-modo">Modo: ${esc(ROTULO_MODO[modo].rotulo)} — ${esc(ROTULO_MODO[modo].frase)}</span>`);
      bloque.insertAdjacentHTML("afterbegin", lineaPolitica(criterioCuenta(pref), ROTULO_CUAL_CUENTA));
      bloque.appendChild(zonaIntentos);
      pintarIntentos();
      // Si ya estaba en el repaso, mostrar el estado sin revelar la respuesta. Se deja dicho
      // que la opcion correcta no se enseña aqui: quien ya fallo esta pregunta merece volver a
      // intentarla, y revelarla convertiria el historial en un chivato.
      if (historial) {
        const p = document.createElement("p");
        p.className = "quiz-pie";
        p.textContent = `Ya la has respondido ${historial.aciertos + historial.fallos} ${historial.aciertos + historial.fallos === 1 ? "vez" : "veces"} · ${historial.aciertos} bien, ${historial.fallos} mal`;
        bloque.appendChild(p);
      }

      // Los tres botones del modo interactivo y la caja de la pista. Se crean una vez y se
      // enseñan o se esconden: crear botones dentro del manejador de cada opcion dejaria botones
      // duplicados en cuanto alguien reintentara dos veces.
      const cajaAcciones = document.createElement("div");
      cajaAcciones.className = "quiz-acciones";
      if (modo === "interactiva") {
        cajaAcciones.innerHTML = `<p class="nota-pie" id="intentos-restantes"></p>
          <div class="acciones-fila">
            <button type="button" class="boton" id="probar-otra-vez">Probar otra vez</button>
            <button type="button" class="boton" id="pedir-pista">Pedir una pista</button>
          </div>`;
        bloque.appendChild(cajaAcciones);
      }
      const cajaPista = document.createElement("p");
      cajaPista.className = "quiz-pista";
      cajaPista.id = "pista-pregunta";
      cajaPista.hidden = true;
      if (modo === "interactiva") bloque.appendChild(cajaPista);
      const cajaSeguridad = document.createElement("div");
      cajaSeguridad.className = "seguridad";
      cajaSeguridad.id = "seguridad-pregunta";
      cajaSeguridad.hidden = true;
      if (pedirSeguridad) bloque.appendChild(cajaSeguridad);

      /** El texto de «llevas N de M intentos», con la cuenta hecha por la funcion pura. */
      const pintarIntentosRestantes = () => {
        const p = $("#intentos-restantes", bloque);
        if (!p) return;
        p.textContent = rt.max === null ? "Intentos sin límite"
          : `Llevas ${rt.intentos} de ${rt.max} ${rt.max === 1 ? "intento" : "intentos"}${rt.agotados ? " · se han agotado" : ""}${rt.acertada ? " · acertada" : ""}`;
      };
      // Los botones de reintento solo tienen sentido mientras queden intentos: en cuanto la
      // pregunta se acaba —acertada o agotada— desaparecen, porque una pregunta terminada no se
      // vuelve a tocar. Es la regla que hace que el modo interactivo no se pueda aprobar probando.
      const pintarAcciones = () => {
        if (modo !== "interactiva") return;
        const fila = $(".acciones-fila", cajaAcciones);
        if (fila) fila.hidden = rt.acertada || rt.agotados;
        pintarIntentosRestantes();
      };
      pintarAcciones();

      $("#probar-otra-vez", bloque)?.addEventListener("click", () => {
        $$(".opcion", bloque).forEach((b) => { if (!b.disabled) b.classList.remove("incorrecta"); });
        $(".quiz-p", bloque)?.scrollIntoView({ block: "nearest" });
      });
      $("#pedir-pista", bloque)?.addEventListener("click", () => {
        const pista = pistaDe(q, cont, pistasPedidas);
        if (!pista) return;
        pistasPedidas++;
        // La cascada decide de donde sale la pista, y se dice de donde viene: una pista generica
        // de «Errores tipicos» no es lo mismo que una escrita para esta pregunta, y confundirlas
        // haria creer que el temario tiene 1173 pistas cuando no las tiene.
        cajaPista.hidden = false;
        cajaPista.innerHTML = `<span class="quiz-pista-origen">${esc(pista.deQuien)}</span> ${esc(pista.texto)}`;
        rt = { ...estadoReintentos(rt, "pista", pref.intentosMax), ultima: rt.ultima };
        pintarAcciones();
        const b = $("#pedir-pista", bloque);
        if (b) b.disabled = pistasPedidas >= pista.escalones;
        actualizarLateral();
      });

      $$(".opcion", bloque).forEach((boton) => {
        boton.addEventListener("click", () => {
          if (modo === "interactiva" && (rt.acertada || rt.agotados)) return;
          const elegida = Number(boton.dataset.opcion);
          const acerto = elegida === q.a;
          const segundos = segundosEntre(abierto, ahora());
          // Se enseña lo que hay que enseñar segun el modo, y NADA mas:
          //   · inmediata: la correcta y la explicacion, al primer clic (lo de siempre);
          //   · interactiva: al fallar, solo que esa no era. La correcta espera a que se acierte
          //     o a que se agoten los intentos, porque revelarla al primer fallo convertiria el
          //     reintento en un adorno.
          const terminada = modo === "inmediata" || acerto || estadoReintentos(rt, "fallo", pref.intentosMax).agotados;
          $$(".opcion", bloque).forEach((b) => {
            const suyo = Number(b.dataset.opcion);
            if (terminada) b.disabled = true;
            if (terminada && suyo === q.a) b.classList.add("correcta");
            if (suyo === elegida && !acerto) b.classList.add("incorrecta");
            if (suyo === elegida && acerto) b.classList.add("elegida");
          });
          if (modo === "interactiva") {
            rt = { ...estadoReintentos(rt, acerto ? "acierto" : "fallo", pref.intentosMax), ultima: elegida };
            pintarAcciones();
          }
          const exp = $(".quiz-explicacion", bloque);
          // La explicacion se enseña cuando la pregunta ha terminado: en inmediata siempre, en
          // interactiva cuando ya no queda nada que intentar.
          if (exp && terminada) exp.hidden = false;
          apuntarIntento(clave, { elegida, correcta: acerto, segundos });
          // El repaso se programa UNA vez por pregunta, con el ultimo intento: con reintentos,
          // programar en cada uno contaria tres repasos por insistir tres veces en la misma.
          const r = acerto || terminada ? programar(clave, acerto, null) : null;
          pintarIntentos();
          const pie = document.createElement("p");
          pie.className = "quiz-pie";
          if (pieSeguridad(pie, clave, q, acerto, elegida)) {
            bloque.appendChild(pie);
            pintarIntentos();
            actualizarLateral();
            return;
          }
          pie.innerHTML = r === null
            ? "Esa no era. Todavía no se te dice cuál es: prueba otra vez, o pide una pista."
            : acerto
              ? `Bien. Vuelve a preguntártelo en ${r.dias} ${r.dias === 1 ? "día" : "días"}.`
              : `Fallada. La verás otra vez mañana.`;
          // Un solo pie por pregunta: sin esto, reintentar tres veces dejaria tres frases seguidas
          // diciendo cosas distintas y la ultima no seria la verdad.
          $(".quiz-pie-final", bloque)?.remove();
          pie.classList.add("quiz-pie-final");
          bloque.appendChild(pie);
          actualizarLateral();
        });
      });

      /**
       * La seguridad declarada, en la ficha. Devuelve `true` si ha ocupado el turno y por tanto
       * no hay que poner el pie de siempre: la calidad todavia no se ha decidido, y decir el plazo
       * antes de saber la seguridad seria decir una cifra que va a cambiar.
       */
      function pieSeguridad(pie, clave, q, acerto, elegida) {
        if (!pedirSeguridad) return false;
        cajaSeguridad.hidden = false;
        pie.innerHTML = "";
        cajaSeguridad.innerHTML = `<p class="quiz-pie">¿Cuánto te fiabas de tu respuesta? No cambia la nota: cambia cada cuánto vuelve esta pregunta.</p>
          <div class="seguridad-opciones">${SEGURIDADES.map((s) => `<button type="button" class="boton" data-seguridad="${esc(s.id)}">${esc(s.rotulo)} <span class="nota-pie">(${esc(s.detalle)})</span></button>`).join("")}</div>
          <p class="quiz-pie" id="seguridad-efecto" hidden></p>`;
        $$("[data-seguridad]", cajaSeguridad).forEach((b) => b.addEventListener("click", () => {
          const seguro = b.dataset.seguridad;
          // La seguridad se apunta en el ULTIMO intento, que es el que programa el repaso.
          const historial2 = intentos[clave];
          if (Array.isArray(historial2) && historial2.length) historial2[historial2.length - 1] = { ...historial2[historial2.length - 1], seguro };
          escribir(CLAVES.intentos, intentos);
          const calidad = calidadDe(acerto, seguro);
          const r = programar(clave, acerto, seguro);
          $$("[data-seguridad]", cajaSeguridad).forEach((x) => { x.disabled = true; if (x === b) x.classList.add("activo"); });
          const efecto = $("#seguridad-efecto", cajaSeguridad);
          if (efecto) {
            efecto.hidden = false;
            efecto.textContent = `Anotado: ${rotuloSeguridad(seguro).toLowerCase()}. Con eso, esta pregunta entra en el repaso con calidad ${calidad} de 5 y vuelve en ${r.dias} ${r.dias === 1 ? "día" : "días"}.`;
          }
          pie.innerHTML = acerto
            ? `Bien. Vuelve a preguntártelo en ${r.dias} ${r.dias === 1 ? "día" : "días"}.`
            : `Fallada. La verás otra vez mañana.`;
          pintarIntentos();
          actualizarLateral();
        }));
        return true;
      }
    });
  }

  // ── La nota, los cierres de bloque y las insignias (fase 10) ──────────
  //
  // La regla entera está en `contenido/evaluacion.json`, con su motivo escrito allí; aquí solo
  // está el cálculo. Cuatro decisiones que conviene no deshacer sin querer, porque son las que
  // hacen que la cifra signifique algo:
  //
  //   1. LA NOTA SE CALCULA, NO SE GUARDA. No hay ninguna clave de `localStorage` con una nota
  //      dentro: se recalcula al pintar desde `progreso`, `srs`, `intentos` y `dias`. Si se
  //      guardara, editando el navegador se subiría, y entonces la nota sería una opinión.
  //      Se comprueba en `_comprobar-evaluacion.mjs`.
  //   2. LA NOTA ES SOBRE LO INTENTADO. Si alguien lleva 30 fichas, su nota es sobre esas 30 y la
  //      interfaz dice «30 de 438» al lado. Una nota sobre el total con el 7 % hecho es un cero
  //      disfrazado, y desanima en vez de orientar.
  //   3. EL REPASO VA APARTE. Su 20 % mide constancia; se enseña separado del conocimiento para
  //      que nadie confunda «repaso mucho» con «sé mucho». La nota de conocimiento son las
  //      preguntas y los problemas, con sus pesos renormalizados.
  //   4. UNA PREGUNTA NO CUENTA DOS VECES. Se mide por pregunta acertada, no por acierto: da
  //      igual haberla acertado una vez o cuatro.
  //
  // Ninguna de estas funciones toca la pantalla ni el almacén, y todas reciben el día de hoy como
  // parámetro: una cifra que depende del calendario de la máquina no se puede probar.

  /** Una tarjeta de repaso con la forma esperada, o null. Mismo criterio que el resto del portal. */
  function tarjetaDe(srs, clave) {
    const t = srs && typeof srs === "object" && !Array.isArray(srs) ? srs[clave] : null;
    if (!t || typeof t !== "object" || Array.isArray(t)) return null;
    const a = Number(t.aciertos), f = Number(t.fallos), reps = Number(t.reps);
    return {
      aciertos: Number.isFinite(a) && a > 0 ? Math.floor(a) : 0,
      fallos: Number.isFinite(f) && f > 0 ? Math.floor(f) : 0,
      reps: Number.isFinite(reps) && reps > 0 ? Math.floor(reps) : 0,
      venc: typeof t.venc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.venc) ? t.venc : null,
    };
  }

  /** Cuántas fichas resueltas declara una ficha en `progreso[id].practica`. */
  function practicasResueltasDe(progreso, id) {
    const reg = progreso && typeof progreso === "object" && !Array.isArray(progreso) ? progreso[id] : null;
    const marca = reg && typeof reg === "object" && !Array.isArray(reg) ? reg.practica : null;
    if (!marca || typeof marca !== "object" || Array.isArray(marca)) return 0;
    let n = 0;
    for (const v of Object.values(marca)) if (v && typeof v === "object" && !Array.isArray(v) && v.resuelto === true) n++;
    return n;
  }

  /**
   * Los días con actividad DE VERDAD, en orden: "AAAA-MM-DD" → número positivo.
   *
   * Se valida la fecha entera y no solo su forma porque un «2026-13-45» o un «no-es-fecha» que
   * alguien haya metido a mano no es un día trabajado, y contarlo como tal regalaría una racha y
   * una insignia por un dato roto. La vista de progreso ya declara esos días raros al medir la
   * actividad (`bucketsActividad`); aquí, además, se dejan fuera de la cuenta.
   */
  function diasActivosDe(dias) {
    if (!dias || typeof dias !== "object" || Array.isArray(dias)) return [];
    const salida = [];
    for (const [fecha, n] of Object.entries(dias)) {
      if (!esFechaISO(fecha)) continue;
      const v = Number(n);
      if (!Number.isFinite(v) || v <= 0) continue;
      salida.push(fecha);
    }
    return salida.sort();
  }

  /**
   * Los números que necesitan la nota, el cierre y las insignias, contados en UNA pasada.
   *
   * Todo se cuenta con las mismas reglas que el resto del portal —el estado sale de
   * `estadoConcepto`, la práctica de `progreso[id].practica`, el repaso de `srs`— para que no
   * haya dos cifras distintas de lo mismo según la pantalla. Recorrer las 438 fichas tres veces
   * daría lo mismo y tres oportunidades de que las tres cuentas se separen.
   *
   * @returns {object} contadores y, además, `porFase`, que necesita el cierre de bloque
   */
  function metricasDe(progreso, srs, dias, conceptos, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const meta = conceptos && typeof conceptos === "object" && !Array.isArray(conceptos) ? conceptos : {};
    const hoy = esFechaISO(op.hoy) ? op.hoy : hoyISO();
    const repsConsolidada = Number.isInteger(op.repsConsolidada) && op.repsConsolidada > 0 ? op.repsConsolidada : 3;

    const m = {
      fichasTotales: 0, fichasTerminadas: 0, fichasDominadas: 0,
      preguntasTotales: 0, preguntasIntentadas: 0, preguntasAcertadas: 0, preguntasConsolidadas: 0,
      practicasTotales: 0, practicasResueltas: 0,
      repasoVencidoHoy: 0, repasoAlDiaHoy: 0, repasoVencidoAtrasado: 0,
      diasActivos: 0, racha: 0,
      ejemplos: 0, fasesCompletas: 0,
      porEstado: {}, porFase: {},
    };

    for (const [id, c] of Object.entries(meta)) {
      if (!c || typeof c !== "object") continue;
      m.fichasTotales++;
      const q = Number.isInteger(c.q) && c.q > 0 ? c.q : 0;
      const pr = Number.isInteger(c.pr) && c.pr > 0 ? c.pr : 0;
      m.preguntasTotales += q;
      m.practicasTotales += pr;

      const est = estadoConcepto(progreso, srs, id, c, hoy);
      m.porEstado[est.estado] = (m.porEstado[est.estado] || 0) + 1;
      const terminada = est.estado === "hecho" || est.estado === "dominado";
      if (terminada) m.fichasTerminadas++;
      if (est.estado === "dominado") m.fichasDominadas++;
      // Los ejemplos se cuentan de las fichas que has TOCADO, no de las 438 del temario. Contarlos
      // todos convertía la insignia de «cien ejemplos» en una que se concede por abrir el portal
      // sin haber hecho nada: el catálogo entero pasa de mil bloques de código, así que el umbral
      // se cumplía solo. Lo que se mide es lo que has leído o ejecutado.
      if (est.estado !== "pendiente") m.ejemplos += Number.isInteger(c.ix) && c.ix > 0 ? c.ix : 0;

      const fid = typeof c.fid === "string" ? c.fid : "f" + String(Number.isInteger(c.f) ? c.f : 0).padStart(2, "0");
      const f = m.porFase[fid] || (m.porFase[fid] = { total: 0, terminadas: 0, dominadas: 0, medias: 0, aplazadas: 0, practicas: 0, practicasResueltas: 0, preguntas: 0, preguntasIntentadas: 0, preguntasAcertadas: 0, consolidadas: 0, resueltasBloque: 0, vencidasBloque: 0, alDiaBloque: 0 });
      f.total++;
      if (terminada) f.terminadas++;
      if (est.estado === "dominado") f.dominadas++;
      if (est.estado === "a-medias") f.medias++;
      if (est.estado === "aplazado") f.aplazadas++;
      f.practicas += pr;
      f.preguntas += q;

      for (let n = 0; n < q; n++) {
        const t = tarjetaDe(srs, `${id}#${n}`);
        if (!t || t.aciertos + t.fallos === 0) continue;
        m.preguntasIntentadas++;
        f.preguntasIntentadas++;
        if (t.aciertos > 0) { m.preguntasAcertadas++; f.preguntasAcertadas++; }
        // Contrato F01: consolidada es recordar EN DÍAS DISTINTOS, no repetir. Antes esto miraba
      // `reps`, que sube en cada acierto aunque sea el mismo día: tres aciertos seguidos
      // declaraban la pregunta consolidada sin que hubiera pasado un día. Ahora se cuentan los
      // días con acierto, y sin fechas guardadas (datos anteriores al contrato) se cae a `reps`
      // para no borrar de golpe lo que ya estaba consolidado.
      const diasConAcierto = Array.isArray(t.dias) ? t.dias.length : 0;
      const consolidada = diasConAcierto > 0 ? diasConAcierto >= repsConsolidada : t.reps >= repsConsolidada;
      if (consolidada) { m.preguntasConsolidadas++; f.consolidadas++; }
        // El repaso se cuenta por pregunta VENCIDA, no por pregunta con tarjeta: una pregunta que
        // hoy no toca no puede contar como «al día» ni como atrasada. `venc` vacío significa «nunca
        // programada», y esa tampoco toca hoy.
        if (t.venc && t.venc <= hoy) {
          m.repasoVencidoHoy++;
          f.vencidasBloque++;
          if (t.aciertos > 0) { m.repasoAlDiaHoy++; f.alDiaBloque++; }
          else m.repasoVencidoAtrasado++;
        }
      }

      const resueltas = Math.min(practicasResueltasDe(progreso, id), pr);
      m.practicasResueltas += resueltas;
      f.practicasResueltas += resueltas;
      // El cierre de bloque cuenta los criterios sobre los acumulados de la fase, y la nota de la
      // fase se calcula al final, cuando ya están todos: calcularla aquí dentro daría la nota de
      // las fichas recorridas hasta ese momento, que es una cifra que no significa nada.
    }

    const activos = diasActivosDe(dias);
    m.diasActivos = activos.length;
    // La racha se cuenta desde hoy, con la misma regla que la cabecera del portal: hoy sin
    // actividad todavía no la rompe, porque el día no ha terminado.
    {
      const conjunto = new Set(activos);
      const d = new Date((esFechaISO(op.hoy) ? op.hoy : hoyISO()) + "T00:00:00Z");
      if (!conjunto.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
      while (conjunto.has(d.toISOString().slice(0, 10))) { m.racha++; d.setUTCDate(d.getUTCDate() - 1); }
    }

    // Una fase está completa cuando TODAS sus fichas están terminadas. Se exige que la fase tenga
    // fichas: una fase vacía no cuenta como completa, porque no se ha hecho nada.
    m.fasesCompletas = Object.values(m.porFase).filter((f) => f.total > 0 && f.terminadas >= f.total).length;

    // Y ahora la nota de cada fase, con los acumulados enteros. Son dos mitades: lo que sabes de
    // sus fichas (terminadas sobre el total, que es lo que mide el criterio de cierre) y su
    // repaso vencido. Se pondera cada mitad al 50 % a propósito y no con los pesos globales,
    // porque dentro de un bloque las dos preguntas pesan lo mismo: «¿lo llevas hecho?» y
    // «¿lo tienes al día?». El repaso se descarta con la misma regla que en la nota global
    // —el 10 % peor— para que no haya dos maneras de contar el mismo fallo.
    for (const f of Object.values(m.porFase)) {
      const vencidas = f.vencidasBloque || 0;
      const alDia = f.alDiaBloque || 0;
      const r = notaDeComponente([
        { id: "fichas", total: f.total, bien: f.terminadas },
        // El repaso solo entra si hoy tocaba algo: una fase con cero preguntas vencidas no tiene
        // una constancia que medir, y contarla como un cero hundiría su nota sin motivo.
        { id: "repaso", total: vencidas, bien: alDia },
      ], 0.1);
      f.repasoVencido = vencidas;
      f.repasoAlDia = alDia;
      f.nota = r.nota;
      f.notaFichas = r.fichas;
      f.notaRepaso = r.repaso;
    }

    return m;
  }

  /**
   * La nota de un bloque: sus fichas y, si las hay, sus preguntas de repaso vencidas.
   *
   * El repaso cuenta para la nota DEL BLOQUE aunque en la nota global vaya aparte y no la suba.
   * Son dos preguntas distintas: «¿cómo llevas esta fase?» incluye su constancia, y «¿cuánto
   * sabes del temario?» no. Mezclarlas sería justo la confusión que la fase 0 quiso evitar.
   *
   * Las dos mitades pesan lo mismo, y las dos llevan el mismo descarte del 10 % que la nota
   * global, para que no haya dos maneras de contar el mismo fallo. La mitad de fichas no pierde
   * nada al descartar —una ficha terminada no se deshace—, y por eso su descarte no cambia el
   * número; se aplica igual para que la regla sea una sola.
   *
   * @returns {{nota:number|null, fichas:number, repaso:number|null, descartadas:number}}
   */
  function notaDeComponente(partes, fraccionDescarte) {
    const validas = (Array.isArray(partes) ? partes : []).filter((p) => p && Number.isFinite(p.total) && p.total > 0 && Number.isFinite(p.bien));
    const fichas = validas.find((p) => p.id === "fichas");
    const repaso = validas.find((p) => p.id === "repaso");
    const mFichas = fichas ? descartarPeores({ total: fichas.total, bien: fichas.bien }, fraccionDescarte) : null;
    const mRepaso = repaso ? descartarPeores({ total: repaso.total, bien: repaso.bien }, fraccionDescarte) : null;
    if (!mFichas && !mRepaso) return { nota: null, fichas: null, repaso: null, descartadas: 0 };
    const conDatos = [mFichas, mRepaso].filter(Boolean);
    const nota = conDatos.reduce((s, x) => s + x.nota, 0) / conDatos.length;
    return {
      nota: Math.round(nota * 10000) / 10000,
      fichas: mFichas ? mFichas.nota : null,
      repaso: mRepaso ? mRepaso.nota : null,
      descartadas: conDatos.reduce((s, x) => s + x.descartadas, 0),
    };
  }

  /**
   * Descarta la peor fracción de un grupo de 0 y 1 y devuelve el resultado.
   *
   * Acepta dos formas porque la usan dos sitios con datos de forma distinta: la nota global tiene
   * la serie explícita (una respuesta por elemento) y la de un bloque tiene solo el total y los
   * aciertos. Se admite `{total, bien}` además de una lista para no obligar a construir 1.173
   * ceros y unos solo para tirar el 10 % de ellos.
   *
   * Se descarta LO PEOR —un cero antes que un uno— porque el descarte existe para el mal día y
   * la pregunta mal escrita, y esos se ven como fallos. El redondeo es hacia abajo: con 7
   * intentos, el 10 % es 0,7 y no se descarta ninguno, porque descartar uno de siete sería
   * descartar el 14 % y la regla diría una cosa mientras el portal hace otra.
   *
   * @param {Array|{total:number,bien:number}} grados
   * @returns {{nota:number|null, total:number, aciertos:number, eliminadas:number, descartadas:number}}
   */
  function descartarPeores(grados, fraccion) {
    const lista = Array.isArray(grados) ? grados.filter((g) => g === 0 || g === 1)
      : grados && Number.isFinite(grados.total) && grados.total > 0
        ? [...Array.from({ length: Math.max(0, Math.min(grados.total, grados.bien)) }, () => 1), ...Array.from({ length: Math.max(0, grados.total - grados.bien) }, () => 0)]
        : [];
    const f = Number.isFinite(fraccion) && fraccion > 0 ? Math.min(0.5, fraccion) : 0;
    const cuantas = Math.floor(lista.length * f);
    // El orden de descarte es por valor y, a igualdad, por la posición MÁS ALTA: si hay que
    // quitar tres ceros idénticos, da lo mismo cuáles, y quitar siempre los últimos hace que la
    // cuenta sea reproducible sin necesidad de ordenar por nada más.
    const indices = lista.map((g, i) => ({ g, i })).sort((a, b) => (a.g - b.g) || (b.i - a.i)).slice(0, cuantas).map((x) => x.i);
    const fuera = new Set(indices);
    const quedan = lista.filter((_, i) => !fuera.has(i));
    const aciertos = quedan.reduce((s, g) => s + g, 0);
    return {
      nota: quedan.length ? Math.round((aciertos / quedan.length) * 10000) / 10000 : null,
      total: quedan.length, aciertos, eliminadas: indices, descartadas: cuantas,
    };
  }

  /**
   * La nota del portal. Función pura: no lee `localStorage` ni pinta nada.
   *
   * Devuelve las tres cosas que la interfaz necesita por separado —la nota, sus componentes y la
   * nota de conocimiento sin el repaso—, porque enseñar solo la cifra final es lo que convierte
   * «repaso mucho» en «sé mucho». El repaso se queda fuera de `conocimiento` a propósito.
   *
   * @returns {object} ver el comentario del bloque para el detalle de cada campo
   */
  function notaDeEvaluacion(progreso, srs, dias, conceptos, politica, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const pol = politica && typeof politica === "object" && Array.isArray(politica.pesos) ? politica : { pesos: PESOS_RESPALDO, descarte: { fraccion: 0.1 }, estado: { repeticiones_para_consolidada: 3 } };
    const fraccion = pol.descarte && Number.isFinite(pol.descarte.fraccion) ? pol.descarte.fraccion : 0.1;
    const reps = pol.estado && Number.isInteger(pol.estado.repeticiones_para_consolidada) ? pol.estado.repeticiones_para_consolidada : 3;
    const m = metricasDe(progreso, srs, dias, conceptos, { hoy: op.hoy, repsConsolidada: reps });

    // La serie de cada componente: un 1 por lo que salió bien y un 0 por lo que no, con los
    // aciertos DELANTE y los fallos detrás. El orden importa y no es estético: `descartarPeores`
    // quita del final a igualdad de valor, así que con esta disposición lo que se descarta son
    // fallos y nunca un acierto.
    const serie = (n, bien) => [...Array.from({ length: Math.max(0, Math.min(n, bien)) }, () => 1), ...Array.from({ length: Math.max(0, n - bien) }, () => 0)];
    const datos = {
      preguntas: serie(m.preguntasIntentadas, m.preguntasAcertadas),
      practica: serie(m.practicasResueltas, m.practicasResueltas),
      repaso: serie(m.repasoVencidoHoy, m.repasoAlDiaHoy),
    };
    const nombres = { preguntas: "preguntas", practica: "problemas prácticos", repaso: "repaso" };
    const porQue = {
      preguntas: "no has respondido ninguna pregunta todavía",
      practica: "no has resuelto ningún problema práctico todavía",
      repaso: m.preguntasIntentadas ? "hoy no te tocaba repasar ninguna pregunta vencida" : "el repaso empieza cuando respondas tu primera pregunta",
    };

    const componentes = [], pendientes = [];
    let descartadasTotales = 0;
    for (const p of pol.pesos) {
      const grados = datos[p.id];
      const nombre = p.nombre || p.id;
      if (!Array.isArray(grados) || !grados.length) { pendientes.push({ id: p.id, nombre, porQue: porQue[p.id] || "todavía no hay nada que medir aquí" }); continue; }
      const d = descartarPeores(grados, fraccion);
      if (!d.total) { pendientes.push({ id: p.id, nombre, porQue: porQue[p.id] || "todavía no hay nada que medir aquí" }); continue; }
      descartadasTotales += d.eliminadas.length;
      componentes.push({
        id: p.id, nombre, peso: p.peso, nota: d.nota,
        intentadas: grados.length, cuentan: d.total, bien: d.aciertos, descartadas: d.eliminadas.length,
      });
    }

    // La nota. Solo con lo que tiene datos y renormalizando los pesos: si alguien lleva 30 fichas,
    // su nota es sobre esas 30. Un componente que todavía no ha empezado no puede contar como un
    // cero, porque eso es exactamente el «cero disfrazado» que la fase 0 descartó.
    const pesaTotal = componentes.reduce((s, c) => s + c.peso, 0);
    const valor = pesaTotal > 0 ? Math.round((componentes.reduce((s, c) => s + c.nota * c.peso, 0) / pesaTotal) * 10000) / 10000 : null;
    const conocimientos = componentes.filter((c) => c.id !== "repaso");
    const pesaConocimiento = conocimientos.reduce((s, c) => s + c.peso, 0);
    const conocimiento = pesaConocimiento > 0 ? Math.round((conocimientos.reduce((s, c) => s + c.nota * c.peso, 0) / pesaConocimiento) * 10000) / 10000 : null;
    const deRepaso = componentes.find((c) => c.id === "repaso") || null;

    // Cuánto del temario se ha intentado: es el «N de 438» que va al lado de la nota. Se cuenta
    // por ficha TOCADA (con algo hecho), no por ficha terminada: intentar ya es intentar.
    let intentadas = 0;
    for (const [id, c] of Object.entries(conceptos && typeof conceptos === "object" ? conceptos : {})) {
      if (!c || typeof c !== "object") continue;
      const est = estadoConcepto(progreso, srs, id, c, esFechaISO(op.hoy) ? op.hoy : hoyISO());
      if (est.estado !== "pendiente") intentadas++;
    }

    return {
      valor, conocimiento, deRepaso, componentes, pendientes,
      intentadas, total: m.fichasTotales,
      descartadas: descartadasTotales,
      fraccionDescarte: fraccion,
      // Cuando no hay ningún componente con datos, se dice por qué y con las palabras del portal:
      // un «0,00» aquí sería el peor mensaje posible para el primer día.
      mensaje: componentes.length ? "" : "Todavía no hay nota, y no es un cero: " + (pendientes.map((p) => p.porQue).join("; ") || "no hay nada intentado") + ".",
      metricas: m,
    };
  }

  /**
   * Cuánto nivel tiene una competencia, por repetición: «N veces por encima del umbral», que es
   * una de las dos fórmulas que ofrece Canvas.
   *
   * Se elige esta y no *Decaying Average* por una razón que no es de gusto: el peso decae con una
   * constante (normalmente 0,65 por intento) que habría que inventarse, y aquí no se inventa
   * ningún número. Con esta fórmula, un concepto está adquirido cuando lo has demostrado en N
   * repasos separados en el tiempo, y eso ya lo sabemos sin inventarnos nada: `srs` lleva los
   * aciertos, los fallos y las repeticiones de cada pregunta.
   *
   * @returns {{id, nombre, total, empezadas, adquiridas, sinEmpezar, nivel}} nivel 0..1
   */
  function nivelCompetencia(competencia, progreso, srs, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const umbral = Number.isFinite(op.umbral) && op.umbral > 0 ? op.umbral : 0.7;
    const reps = Number.isInteger(op.repeticiones) && op.repeticiones > 0 ? op.repeticiones : 2;
    const hoy = esFechaISO(op.hoy) ? op.hoy : hoyISO();
    const fichas = competencia && Array.isArray(competencia.fichas) ? competencia.fichas : [];

    let total = 0, empezadas = 0, adquiridas = 0, sinEmpezar = 0;
    const detalle = [];
    for (const id of fichas) {
      const c = P.conceptos[id];
      if (!c) continue;   // una ficha que ya no está en el temario no se cuenta, y el validador lo caza
      total++;
      const est = estadoConcepto(progreso, srs, id, c, hoy);
      if (est.estado === "pendiente") { sinEmpezar++; continue; }
      empezadas++;
      // El criterio de «adquirida» es por ficha, con sus propias preguntas: la proporción de
      // aciertos tiene que llegar al umbral y las repeticiones a N. Se mira por ficha y no por
      // pregunta a propósito: una competencia se demuestra en un concepto entero, y con una sola
      // pregunta acertada de las cinco de la ficha no se ha demostrado nada.
      let aciertos = 0, fallos = 0, repsMax = 0, preguntas = 0;
      const q = Number.isInteger(c.q) && c.q > 0 ? c.q : 0;
      for (let n = 0; n < q; n++) {
        const t = tarjetaDe(srs, `${id}#${n}`);
        if (!t) continue;
        preguntas++;
        aciertos += t.aciertos;
        fallos += t.fallos;
        if (t.reps > repsMax) repsMax = t.reps;
      }
      const proporcion = aciertos + fallos > 0 ? aciertos / (aciertos + fallos) : 0;
      const adquirida = q > 0 && preguntas > 0 && proporcion >= umbral && repsMax >= reps;
      if (adquirida) adquiridas++;
      detalle.push({ id, titulo: c.t, estado: est.estado, proporcion, reps: repsMax, adquirida });
    }

    return {
      id: competencia && typeof competencia.id === "string" ? competencia.id : "",
      nombre: competencia && typeof competencia.nombre === "string" ? competencia.nombre : "",
      descripcion: competencia && typeof competencia.descripcion === "string" ? competencia.descripcion : "",
      total, empezadas, adquiridas, sinEmpezar,
      nivel: total ? adquiridas / total : 0,
      umbral, repeticiones: reps,
      detalle,
    };
  }

  /** Todas las competencias, ya calculadas. La fórmula y el umbral salen del fichero. */
  function competenciasCalculadas(progreso, srs, opciones) {
    const co = competenciasDeclaradas();
    const base = { umbral: co.umbral, repeticiones: co.repeticiones, hoy: opciones && opciones.hoy };
    return { formula: co.formula, umbral: co.umbral, repeticiones: co.repeticiones, lista: co.lista.map((c) => nivelCompetencia(c, progreso, srs, base)) };
  }

  /**
   * El valor de la métrica que mira una insignia. Función pura y total: lo que no entiende da 0,
   * porque una insignia nunca puede concederse por un dato raro.
   *
   * Los nombres los entiende el portal, no el fichero: `generar.mjs` falla si aparece uno que no
   * esté en esta lista, así que una insignia nueva que el portal no sepa medir no llega a
   * publicarse en vez de quedarse para siempre en «pendiente».
   */
  function metricaDeInsignia(criterio, metricas) {
    const c = criterio && typeof criterio === "object" ? criterio : {};
    const m = metricas && typeof metricas === "object" ? metricas : {};
    switch (c.metrica) {
      case "fichas_terminadas":
        // Con `fase`, la insignia mira un bloque concreto («F01 completa», según la funcionalidad
        // 10 de FUNCIONALIDADES.md). Sin `fase`, el temario entero.
        return c.fase && m.porFase && m.porFase[c.fase] ? m.porFase[c.fase].terminadas : (m.fichasTerminadas || 0);
      case "fichas_dominadas": return m.fichasDominadas || 0;
      case "preguntas_acertadas": return m.preguntasAcertadas || 0;
      case "practicas_resueltas": return m.practicasResueltas || 0;
      case "dias_de_racha": return m.racha || 0;
      case "dias_activos": return m.diasActivos || 0;
      case "repaso_retenido": return m.preguntasConsolidadas || 0;
      case "fases_completas": return m.fasesCompletas || 0;
      case "ejemplos_explorados": return m.ejemplos || 0;
      default: return 0;
    }
  }

  /**
   * Las insignias, recalculadas al abrir. Función pura: hay una sola cifra que las decide —la
   * métrica— y el resultado se guarda en el objeto que las pinta, no en el almacén.
   *
   * EL MODELO ES EL DE MOODLE (concesión por evento) ADAPTADO A UN SITIO QUE NO ESTÁ SIEMPRE
   * ENCENDIDO: se recalculan al abrir la página y no hay ninguna fecha de concesión guardada.
   * Eso es lo que impide regalárselas uno mismo editando el navegador, que es exactamente el
   * problema que tendría guardarlas.
   *
   * @returns {{lista:Array, concedidas:number, total:number}}
   */
  function insigniasCalculadas(metricas, politica) {
    const pol = politica && typeof politica === "object" && politica.insignias && Array.isArray(politica.insignias.lista) ? politica : { insignias: { lista: [] } };
    const lista = pol.insignias.lista.map((b) => {
      const c = b && typeof b.criterio === "object" && b.criterio ? b.criterio : {};
      const minimo = Number.isFinite(c.minimo) && c.minimo > 0 ? c.minimo : 1;
      const valor = metricaDeInsignia(c, metricas);
      return {
        id: b && b.id, nombre: b && b.nombre, texto: b && b.texto,
        metrica: c.metrica, fase: c.fase || "", minimo, valor,
        concedida: valor >= minimo,
        progreso: Math.max(0, Math.min(1, valor / minimo)),
      };
    });
    return { lista, concedidas: lista.filter((b) => b.concedida).length, total: lista.length };
  }

  /**
   * El cierre de un bloque. Función pura: la regla entera sale del fichero y aquí solo se aplica.
   *
   * LO QUE ESTO NO HACE, y es lo más importante que hay escrito en esta fase: no cierra nada. No
   * esconde fichas, no deshabilita botones y no cambia ningún estado. Es un informe, con la
   * misma advertencia literal que da la documentación de Moodle sobre la finalización de curso.
   * El motivo está en FUNCIONALIDADES.md, funcionalidad 16: una puerta que no se puede abrir
   * desde dentro de la propia máquina es una puerta con la llave dentro.
   */
  function cierreDeBloque(fid, metricas, politica, opciones) {
    const op = opciones && typeof opciones === "object" ? opciones : {};
    const pol = politica && typeof politica === "object" && politica.cierre && typeof politica.cierre === "object" ? politica : { cierre: {}, nota_minima_global: { minimo: 0.7 } };
    const f = metricas && metricas.porFase && metricas.porFase[fid] ? metricas.porFase[fid] : { total: 0, terminadas: 0, dominadas: 0, practicasResueltas: 0, consolidadas: 0, nota: null };
    const minimoGlobal = pol.nota_minima_global && Number.isFinite(pol.nota_minima_global.minimo) ? pol.nota_minima_global.minimo : 0.7;
    const reglas = Array.isArray(pol.cierre[fid]) ? pol.cierre[fid] : [];

    const valorDe = (regla) => {
      switch (regla.tipo) {
        case "conceptos_terminados": return f.terminadas;
        case "conceptos_dominados": return f.dominadas;
        case "nota_minima": return f.nota === null || f.nota === undefined ? null : f.nota;
        case "repaso_retenido_minimo": return f.consolidadas;
        case "practicas_resueltas": return f.practicasResueltas;
        default: return null;
      }
    };
    const lista = reglas.map((regla) => {
      const valor = valorDe(regla);
      const medible = valor !== null && valor !== undefined && Number.isFinite(valor);
      return {
        tipo: regla.tipo, minimo: regla.minimo,
        etiqueta: typeof regla.etiqueta === "string" && regla.etiqueta.trim() ? regla.etiqueta : `${regla.tipo} ≥ ${regla.minimo}`,
        valor, medible,
        cumplido: medible && valor >= regla.minimo,
        // Cuando la regla no se puede medir todavía se dice por qué, en vez de dejarla en rojo.
        // Un criterio que no se puede evaluar no es un criterio incumplido.
        porQue: medible ? "" : regla.tipo === "nota_minima" ? "todavía no hay nada intentado en esta fase, así que no hay nota que comparar" : "todavía no hay nada que contar en esta fase",
      };
    });
    const cumplidas = lista.filter((r) => r.cumplido).length;
    const pendientes = lista.filter((r) => r.medible ? !r.cumplido : r.cumplido === false && r.medible);
    return {
      fid, reglas: lista, cumplidas, total: lista.length,
      cerrado: lista.length > 0 && cumplidas === lista.length,
      nota: f.nota === undefined ? null : f.nota,
      notaMinima: minimoGlobal,
      // La propuesta es el primer criterio que falta: decir «te falta algo» sin decir QUÉ obliga a
      // repasar la lista entera, que es justo lo que este bloque viene a evitar.
      siguiente: lista.find((r) => r.medible && !r.cumplido) || lista.find((r) => !r.medible) || null,
      pendientesQueSeMiden: pendientes.length,
    };
  }

  // ── La interfaz de la fase 10: la nota, los cierres y las insignias ────
  //
  // Tres trozos de pantalla que se montan con las funciones puras de arriba. Ninguno de ellos
  // escribe nada: si mañana se borra `contenido/evaluacion.json`, el portal sigue abriendo y la
  // vista dice qué falta, en vez de quedarse en blanco.

  /**
   * El bloque «¿Estoy listo para cerrar este bloque?» de `#/fase/<id>`.
   *
   * La advertencia de que NO bloquea nada no es un adorno legal: es la copia de la que da Moodle
   * sobre la finalización de curso, y está aquí porque un criterio de cierre que además cerrara
   * puertas dejaría a quien estudia solo sin manera de abrir la siguiente ficha. La tabla dice
   * cuáles se cumplen y, cuando falta uno, el resumen nombra el siguiente paso concreto.
   */
  function bloqueCierre(fid, metricas, politica) {
    const c = cierreDeBloque(fid, metricas, politica);
    const filas = c.reglas.map((r) => {
      const valor = r.valor === null || r.valor === undefined ? "—" : (r.tipo === "nota_minima" ? Number(r.valor).toFixed(2) : String(r.valor));
      const minimo = r.tipo === "nota_minima" ? Number(r.minimo).toFixed(2) : String(r.minimo);
      const estado = !r.medible ? "sin datos" : r.cumplido ? "cumplido" : "pendiente";
      return `<tr class="cierre-${r.medible ? (r.cumplido ? "cumplido" : "pendiente") : "sindatos"}">
        <td><span class="cierre-simbolo" aria-hidden="true">${r.medible ? (r.cumplido ? "✓" : "·") : "?"}</span> ${esc(r.etiqueta)}</td>
        <td class="num">${esc(minimo)}</td>
        <td class="num">${esc(valor)}</td>
        <td>${esc(estado)}${r.porQue ? `<br><span class="nota-pie">${esc(r.porQue)}</span>` : ""}</td>
      </tr>`;
    }).join("");

    const resumen = c.cerrado
      ? `<p class="cierre-veredicto cierre-cerrado">Este bloque está cerrado: ${c.cumplidas} de ${c.total} criterios, contados sobre lo que llevas intentado. Es un informe de dónde estás, no un permiso.</p>`
      : `<p class="cierre-veredicto">${c.cumplidas} de ${c.total} criterios.${c.siguiente ? ` El siguiente paso es: ${esc(c.siguiente.etiqueta.toLowerCase())}.` : ""}</p>`;

    return `<section class="cierre-bloque" id="cierre-bloque">
      <h2>¿Estoy listo para cerrar este bloque?</h2>
      <p class="nota-pie">Se cuentan sobre lo que llevas <strong>intentado</strong> en la fase, no sobre las
      ${metricas.fichasTotales} fichas del temario.</p>
      <div class="tabla-envoltorio"><table class="tabla-cierre">
        <caption class="nota-pie">Un renglón por criterio, con su umbral y tu número de hoy.</caption>
        <thead><tr><th>Criterio</th><th>Umbral</th><th>Tu número</th><th>Estado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
      ${resumen}
      <p class="nota-pie">Esto <strong>no bloquea nada</strong>: ninguna ficha se cierra, ningún enlace se apaga y no cambia
      ningún estado: sirve para saber dónde estás, y la decisión de seguir es tuya.</p>
    </section>`;
  }

  /**
   * El bloque de la nota, en `#/progreso`.
   *
   * Lo que enseña, y por qué en este orden: la nota, al lado el «N de 438» que dice sobre qué se
   * calcula, la tabla de qué pesa cuánto con lo que has intentado, y el repaso separado. El
   * párrafo de encima de cada cifra existe porque una nota sin su regla a la vista es un número
   * que no se puede discutir.
   */
  function bloqueNota(nota, politica) {
    const pesos = politica.pesos.map((p) => {
      const c = nota.componentes.find((x) => x.id === p.id);
      const pendiente = nota.pendientes.find((x) => x.id === p.id);
      const valor = c ? c.nota.toFixed(2) : "—";
      const detalle = c
        ? `${c.bien} de ${c.cuentan}${c.descartadas ? ` (${c.descartadas} descartada${c.descartadas === 1 ? "" : "s"})` : ""}`
        : pendiente ? esc(pendiente.porQue) : "";
      return `<tr class="${c ? "" : "fila-sin-datos"}">
        <td>${esc(p.nombre || p.id)}<br><span class="nota-pie">${esc(p.descripcion || "")}</span></td>
        <td class="num">${(p.peso * 100).toFixed(0)} %</td>
        <td class="num">${valor}</td>
        <td>${detalle}</td>
      </tr>`;
    }).join("");

    const cifra = nota.valor === null ? "—" : nota.valor.toFixed(2);
    const conocimiento = nota.conocimiento === null ? "—" : nota.conocimiento.toFixed(2);
    const repaso = nota.deRepaso ? nota.deRepaso.nota.toFixed(2) : "—";

    const pie = [];
    if (nota.pendientes.length) pie.push(`Sin datos todavía: ${nota.pendientes.map((p) => `${esc(p.nombre.toLowerCase())} (${esc(p.porQue)})`).join("; ")}.`);

    return `<section class="nota-bloque" id="bloque-nota">
      <h2>Tu nota, sobre lo que llevas intentado</h2>
      <div class="estadisticas">
        <div class="estadistica"><div class="valor">${cifra}</div><div class="rotulo">nota, sobre 1</div></div>
        <div class="estadistica"><div class="valor">${nota.intentadas} de ${nota.total}</div><div class="rotulo">fichas intentadas</div></div>
        <div class="estadistica"><div class="valor">${conocimiento}</div><div class="rotulo">conocimiento, sin el repaso</div></div>
        <div class="estadistica"><div class="valor">${repaso}</div><div class="rotulo">repaso al día, aparte</div></div>
      </div>
      ${nota.mensaje ? `<p class="nota-sin-datos" id="nota-sin-datos">${esc(nota.mensaje)}</p>` : ""}
      <div class="tabla-envoltorio"><table class="tabla-nota">
        <caption class="nota-pie">Cada componente, con su peso, tu proporción de hoy y lo que se ha contado.</caption>
        <thead><tr><th>Componente</th><th>Peso</th><th>Tu proporción</th><th>Lo que se ha contado</th></tr></thead>
        <tbody>${pesos}</tbody>
      </table></div>
      <p class="nota-pie">${pie.join(" ")}</p>
      <p class="nota-pie">El <strong>repaso</strong> se enseña aparte a propósito: su peso mide constancia, no
      conocimiento. Sumado a la nota de conocimiento, quien repasa mucho creería saber más de lo que sabe, y quien no
      repasa todavía creería no saber nada.</p>
    </section>`;
  }

  /** El catálogo de insignias, con su criterio a la vista. Las no concedidas enseñan cuánto falta. */
  function bloqueInsignias(insignias) {
    const filas = insignias.lista.map((b) => {
      const cuantas = String(b.minimo);
      return `<li class="insignia${b.concedida ? " insignia-concedida" : ""}" data-insignia="${esc(b.id)}" data-concedida="${b.concedida ? "si" : "no"}">
        <span class="insignia-marca" aria-hidden="true">${b.concedida ? "■" : "□"}</span>
        <span class="insignia-nombre">${esc(b.nombre)}</span>
        <span class="insignia-criterio">${esc(b.texto)}</span>
        <span class="insignia-cuenta">${b.concedida ? "conseguida" : `${b.valor} de ${cuantas}`}${b.fase ? ` · ${esc(String(b.fase).toUpperCase())}` : ""}</span>
      </li>`;
    }).join("");
    return `<section class="insignias" id="bloque-insignias">
      <h2>Insignias</h2>
      <ul class="lista-insignias">${filas}</ul>
    </section>`;
  }

  /** Las competencias con su nivel. Cómo se mide el nivel está en `nivelCompetencia`. */
  function bloqueCompetencias(competencias) {
    if (!competencias.lista.length) {
      return `<section class="competencias" id="bloque-competencias">
        <h2>Competencias</h2>
        <p class="nota-pie">Esta copia no trae el contenido de competencias, así que el portal no sabe qué competencias hay.</p>
      </section>`;
    }
    const filas = competencias.lista.map((c) => {
      const pct = Math.round(c.nivel * 100);
      return `<li class="competencia" data-competencia="${esc(c.id)}">
        <span class="competencia-cabecera">
          <span class="competencia-nombre">${esc(c.nombre)}</span>
          <span class="competencia-nivel">${c.adquiridas} de ${c.total} · ${pct} %</span>
        </span>
        <span class="competencia-barra" role="img" aria-label="${esc(c.nombre)}: ${pct} por ciento, ${c.adquiridas} de ${c.total} fichas adquiridas"><span style="width:${pct}%"></span></span>
        <span class="competencia-detalle">${esc(c.descripcion)} Empieza por <a href="#/glosario">el glosario</a> o por la
        <a href="#/pendientes">lista de lo que te falta</a>: cualquiera de sus ${c.total} fichas cuenta.</span>
      </li>`;
    }).join("");
    return `<section class="competencias" id="bloque-competencias">
      <h2>Competencias</h2>
      <p class="nota-pie">Una ficha cuenta como <strong>adquirida</strong> cuando has acertado el
      ${(competencias.umbral * 100).toFixed(0)} % de sus preguntas y has llegado a ${competencias.repeticiones}
      ${competencias.repeticiones === 1 ? "repetición" : "repeticiones"} de repaso.</p>
      <ul class="lista-competencias">${filas}</ul>
    </section>`;
  }

  // ── La cola de repaso compuesta ───────────────────────────────────────
  //
  // La cola que de verdad se responde hoy, en un solo sitio. Vive ANTES de las vistas y del motor
  // de la sesion por dos motivos que se pagaron caros:
  //
  //   · La vista se pintaba antes de que estuviera cargado el contenido de las fichas de la cola,
  //     asi que `contenidoDe` devolvia null y la vista daba la cola por vacia: el portal decia «no
  //     hay preguntas pendientes» teniendo preguntas vencidas.
  //   · Y `vistas.repaso` la lee al PINTAR, no al llamar, asi que declararla mas abajo dejaba a la
  //     vista entera con una variable que todavia no existe.
  //
  // Ahora la decide `render` una vez y la leen la vista y la sesion: no pueden discrepar.
  let colaRepaso = [];
  const topeCola = () => (Number.isInteger(pref.repasoDia) && pref.repasoDia > 0 ? pref.repasoDia : 20);

  /** Compone la cola de hoy. En modo diferido, si hay un examen a medias, la cola es LA SUYA: se
   *  continua lo que se empezo, no se empieza otro. */
  function componerColaRepaso() {
    const { vencidas, nuevas } = repasoPendiente();
    if (modoDe(pref) === "diferida") {
      const g = revisarSesionGuardada([...vencidas, ...nuevas].slice(0, topeCola()));
      ultimaRevision = g;
      if (g.estado === "encontrada" && typeof g.sesion.entregado === "boolean") {
        colaRepaso = Array.isArray(g.sesion.cola) ? g.sesion.cola : [];
        return;
      }
    }
    ultimaRevision = { estado: "ninguna" };
    colaRepaso = [...vencidas, ...nuevas].slice(0, topeCola());
  }
  // Lo que dijo la ultima revision de la sesion guardada, para no volver a mirarla al montar.
  let ultimaRevision = { estado: "ninguna" };

  // ── Sesión de repaso ──────────────────────────────────────────────────

  /**
   * Que se puede hacer con una sesion guardada, sin tocar nada.
   *
   * Tres desenlaces, y el tercero es el que importa: una sesion que ya no encaja se DESCARTA y se
   * dice. Recuperar respuestas apuntadas a otras preguntas seria peor que perderlas, y borrar el
   * progreso de repaso —que esta en `localStorage`— no se hace nunca desde aqui.
   */
  function revisarSesionGuardada(cola) {
    const guardada = leerSesion();
    if (guardada && typeof guardada === "object" && !Array.isArray(guardada) && typeof guardada.modo === "string") {
      if (guardada.huella !== huellaCola(cola)) {
        borrarSesion();
        return { estado: "descartada", motivo: "La sesión guardada era de otra lista de preguntas (el temario o tu repaso han cambiado), así que se ha descartado. No se ha borrado nada de tu progreso: lo que hayas respondido sigue en tu historial." };
      }
      const respuestas = guardada.respuestas && typeof guardada.respuestas === "object" && !Array.isArray(guardada.respuestas) ? guardada.respuestas : {};
      const n = respuestasDe(respuestas);
      if (MODOS_RESPUESTA.includes(guardada.modo) && n > 0) return { estado: "encontrada", sesion: guardada, respondidas: n };
    }
    // Un JSON que no se puede leer no se distingue de una sesion que nunca existio, salvo en una
    // cosa: hay que decirlo. Si no, una sesion corrupta parece «aquí no había nada».
    let bruto = null;
    try { bruto = sessionStorage.getItem("aprender.v1.sesion" + sufijoPerfil); } catch { /* sin sessionStorage no hay nada que leer */ }
    if (bruto) {
      borrarSesion();
      return { estado: "descartada", motivo: "Lo que había guardado de esta sesión no se ha podido leer (estaba a medias o editado), así que se ha descartado. Tu progreso de repaso no se ha tocado." };
    }
    return { estado: "ninguna" };
  }

  /**
   * Monta la sesion de repaso, en el modo que la persona tenga elegido.
   *
   * Los tres modos comparten la cola, la barra y el resumen; lo que cambia es cuando se corrige.
   * Por eso hay UN solo motor con tres caminos y no tres pantallas parecidas: tres pantallas
   * acabarian contando los intentos de tres maneras distintas, que es el defecto que la fase 6
   * tuvo que medir y arreglar.
   */
  function montarSesionRepaso() {
    // La cola ya viene compuesta por `render`: montar la sesion por su cuenta seria volver a
    // preguntar lo mismo y, sobre todo, volver a decidir otra cosa.
    const colaSesion = colaRepaso.slice();
    const guardada = ultimaRevision;
    const zona = $("#zona-repaso");
    if (!zona) return;
    const modo = modoDe(pref);
    const revision = revisionEfectiva(pref);
    const pedirSeguridad = seguridadPedida(pref);

    let i = 0, aciertosSesion = 0;
    const notasSesion = [];
    const reintentos = new Map();   // clave -> estado de reintentos; vive mientras dure la sesion
    const pistasVistas = new Map(); // clave -> cuantas pistas se han pedido
    // La marca de tiempo de cada pregunta. Es lo unico que hace falta para medir los segundos de un
    // intento, y viaja con la sesion porque recargar la pagina no puede convertir tres minutos de
    // duda en cero segundos.
    const marcasDe = () => Object.fromEntries(colaSesion.map((k) => [k, ahora()]));
    let marcas = marcasDe();
    let respuestas = {};
    let entregado = false;

    // Lo que se puede continuar de una sesion anterior, sin volver a mirarlo: la composicion de la
    // cola ya lo ha decidido, para que la vista y la sesion no puedan contar cosas distintas.
    if (guardada.estado === "encontrada") {
      respuestas = guardada.sesion.respuestas && typeof guardada.sesion.respuestas === "object" && !Array.isArray(guardada.sesion.respuestas) ? guardada.sesion.respuestas : {};
      marcas = guardada.sesion.marcas && typeof guardada.sesion.marcas === "object" && !Array.isArray(guardada.sesion.marcas) ? guardada.sesion.marcas : marcas;
      i = Math.min(Math.max(0, Number(guardada.sesion.i) || 0), colaSesion.length);
      entregado = guardada.sesion.entregado === true;
    }

    const guardar = () => {
      if (modo !== "diferida") return true;
      return escribirSesion({ modo, huella: huellaCola(colaSesion), cola: colaSesion, respuestas, marcas, i, entregado, empezada: Date.now() });
    };

    function pintar() {
      const barra = $("#barra-repaso");
      if (barra) barra.style.width = `${Math.round(((entregado ? colaSesion.length : i) / Math.max(1, colaSesion.length)) * 100)}%`;
      // Llegar al final de la cola en inmediata o interactiva es entregar: no hay un boton aparte
      // porque no hay nada que revisar. En diferida, en cambio, el final de la cola lleva al boton
      // de entregar, y por eso el cierre lo dispara el boton y no esta comprobacion.
      if (!entregado && modo !== "diferida" && i >= colaSesion.length) cerrarSesion();
      if (entregado) return pintarEntregado();
      pintarPregunta();
    }

    // ── Cierre de la sesion ──
    //
    // Aqui esta la mitad que hoy no existe: en modo diferido el repaso se programa UNA vez por
    // pregunta, al entregar, y no en cada clic. Si se programara por clic, un examen de veinte
    // preguntas programaria veinte veces... y dos veces la misma si alguien cambia una respuesta
    // antes de entregar, que es justo lo que el modo permite hacer. El caso 3 de
    // `_comprobar-quiz.mjs` cuenta exactamente esto.
    function cerrarSesion() {
      if (entregado) return;
      entregado = true;
      for (const clave of colaSesion) {
        const r = respuestas[clave];
        if (!r || typeof r !== "object") continue;
        // Hasta aqui `correcta` era `null` —una respuesta a ciegas no esta corregida—, y aqui se
        // corrige: es el unico momento en que se compara con la solucion. Sin esta linea, todas
        // las respuestas seguian «sin corregir» al entregar, el resumen decia «0 de 20 respondidas»
        // con veinte respuestas delante y el repaso no se programaba. Un modo examen que borra lo
        // que se ha respondido es peor que no tenerlo.
        const q = contenidoDe(clave.split("#")[0])?.quizzes?.[Number(clave.split("#")[1])];
        if (!q) continue;
        r.correcta = r.elegida === q.a;
        // El intento se apunta AQUI, no al pulsar: hasta que no se entrega no hay intento, solo
        // una respuesta a medias que todavia se puede cambiar.
        apuntarIntento(clave, { elegida: r.elegida, correcta: r.correcta, seguro: r.seguro, segundos: r.segundos });
        if (r.correcta) aciertosSesion++;
        const p = puntuar(intentosDe(intentos, clave), criterioCuenta(pref));
        if (p.mostrada !== null) notasSesion.push(p.mostrada);
        programar(clave, r.correcta, r.seguro);
      }
      if (modo === "diferida") borrarSesion();
      guardar();
    }

    function pintarEntregado() {
      const respondidas = respuestasDe(respuestas);
      // La correccion de lo que quedo a medias se asegura AQUI otra vez: `cerrarSesion` la hace al
      // entregar, pero una sesion restaurada puede llegar a este punto por otro camino (el
      // `entregado` guardado), y un resultado «sin corregir» en el examen ya entregado se lee como
      // que el portal no ha corregido nada.
      for (const clave of colaSesion) {
        const r = respuestas[clave];
        if (!r || typeof r !== "object" || typeof r.correcta === "boolean") continue;
        const q = contenidoDe(clave.split("#")[0])?.quizzes?.[Number(clave.split("#")[1])];
        if (q) r.correcta = r.elegida === q.a;
      }
      const filas = colaSesion.map((clave) => {
        const [id, n] = clave.split("#");
        const q = contenidoDe(id)?.quizzes?.[Number(n)];
        const r = respuestas[clave];
        const c = P.conceptos[id] || {};
        const lista = intentosDe(intentos, clave);
        const p = puntuar(lista, criterioCuenta(pref));
        const verAcierto = revisionVisible(revision, "acierto", "entregar");
        const verCorrecta = revisionVisible(revision, "correcta", "entregar");
        const verExplicacion = revisionVisible(revision, "explicacion", "entregar");
        const estado = !respondida(r) ? `<span class="nota-pie">En blanco</span>`
          : verAcierto ? `<strong class="${r.correcta ? "bien" : "mal"}">${r.correcta ? "Bien" : "Mal"}</strong>` : `<span class="nota-pie">Respondida</span>`;
        // Las que quedaron en blanco no llevan explicacion: no hay nada que explicar de una
        // pregunta que nadie contesto, y enseñar veinte parrafos de «por que» debajo de veinte
        // «en blanco» convierte el resultado del examen en un muro.
        const contestada = respondida(r) && q;
        return `<li class="repaso-resultado" data-clave="${esc(clave)}">
          <p class="origen">Pregunta ${Number(n) + 1} · <a href="#/c/${esc(id)}">${esc(c.t || id)}</a></p>
          <p class="quiz-p"><strong>${esc(q ? q.p : "")}</strong></p>
          <p class="${r && respondida(r) ? (r.correcta ? "bien" : "mal") : "nota-pie"}">${r && q ? `Tu respuesta: ${esc(q.o[r.elegida - 1])}` : "Sin responder"} · ${estado}${r && r.seguro ? ` · <span class="nota-pie">${esc(rotuloSeguridad(r.seguro))}</span>` : ""}</p>
          ${verCorrecta && contestada ? `<p>La correcta era: <strong>${esc(q.o[q.a - 1])}</strong></p>` : ""}
          ${verExplicacion && contestada ? `<p class="quiz-explicacion-abierta"><strong>Por qué:</strong> ${esc(q.e)}</p>` : ""}
          ${contestada && p.mostrada !== null ? `<p class="nota-pie">Nota de esta pregunta: ${p.mostrada.toFixed(2)} de 1 (${esc(ROTULO_CUAL_CUENTA[p.criterio].frase)}).</p>` : ""}
        </li>`;
      }).join("");
      const verNota = revisionVisible(revision, "nota", "entregar");
      const verPuntuacion = revisionVisible(revision, "puntuacion", "entregar");
      const media = notasSesion.length ? notasSesion.reduce((s, x) => s + x, 0) / notasSesion.length : null;
      const criterio = criterioCuenta(pref);
      const programadas = colaSesion.filter((k) => respondida(respuestas[k])).length;
      zona.innerHTML = `<div class="tarjeta-repaso" id="repaso-entregado" data-modo="${esc(modo)}">
        <h2 style="margin-top:0">${modo === "diferida" ? "Examen entregado" : "Sesión terminada"}</h2>
        <p id="repaso-resumen">${respondidas} de ${colaSesion.length} respondidas · ${aciertosSesion} ${aciertosSesion === 1 ? "correcta" : "correctas"}.</p>
        ${verPuntuacion ? `<p class="nota-pie">La puntuación máxima de esta sesión es ${colaSesion.length} ${colaSesion.length === 1 ? "pregunta" : "preguntas"}${verNota && media !== null ? `, y tu nota es ${media.toFixed(2)} de 1` : ""}.</p>` : ""}
        ${verNota && media !== null ? `<p class="quiz-nota">Nota de la sesión: ${media.toFixed(2)} de 1, con ${esc(ROTULO_CUAL_CUENTA[criterio].frase)}. Es la nota de las ${notasSesion.length} preguntas de hoy, no la de todo tu temario.</p>` : ""}
        ${programadas ? `<p class="nota-pie" id="repaso-programado">El repaso se ha programado de una vez al entregar: ${programadas} ${programadas === 1 ? "pregunta" : "preguntas"}, cada una con la calidad de su último intento.</p>` : ""}
        ${revision.avisos.length ? `<p class="nota-pie" id="repaso-revision-corregida">${esc(revision.avisos.map((a) => a.texto).join(" "))}</p>` : ""}
        <ol class="repaso-resultados">${filas}</ol>
        <p class="nota-pie">${esc(politicaIntentos(criterio, ROTULO_CUAL_CUENTA))}</p>
        <p><a class="boton primario" href="#/">Volver al inicio</a> <a class="boton" href="#/progreso">Ver progreso</a></p></div>`;
      actualizarLateral();
    }

    // ── Una pregunta, en el modo que toque ──
    function pintarPregunta() {
      const clave = colaSesion[i];
      const [id, n] = clave.split("#");
      const c = P.conceptos[id];
      const cont = contenidoDe(id);
      const q = cont?.quizzes?.[Number(n)];
      if (!q) { i++; return pintar(); }
      const criterio = criterioCuenta(pref);
      const listaPrevia = intentosDe(intentos, clave);
      // T20 · Un borrador de otra revisión, o con una opción que ya no existe, NO se aplica al pintar:
      // se ignora (no se borra del almacén, por si el contenido vuelve). Sin esto, un cambio de
      // contenido dejaba marcada una opción que ya no está.
      const r = (function () {
        const crudo = respuestas[clave];
        if (!crudo || typeof PlanHoy === "undefined" || typeof PlanHoy.validarBorrador !== "function") return crudo;
        const opciones = Array.isArray(q && q.opciones) ? q.opciones.length : null;
        const veredicto = PlanHoy.validarBorrador(crudo, { clave, opciones: opciones || undefined });
        return veredicto.ok ? crudo : null;
      })();
      const rt = reintentos.get(clave) || estadoReintentos({}, "", null);
      const abierta = ahora();
      const preguntasBlanco = colaSesion.filter((k) => !respondida(respuestas[k])).length;
      // El preambulo del modo diferido, con los tres datos que la especificacion exige ANTES de
      // empezar: cuantas preguntas, cuantos intentos y cual de los intentos cuenta.
      const preambulo = modo === "diferida"
        ? `<p class="modo-preambulo" id="modo-preambulo">${colaSesion.length} ${colaSesion.length === 1 ? "pregunta" : "preguntas"} ·
           ${intentosDisponibles(0, pref.intentosMax) === 1 ? "un solo intento" : `${intentosDisponibles(0, pref.intentosMax)} intentos`} ·
           ${esc(ROTULO_CUAL_CUENTA[criterio].frase.replace(/^cuenta /, ""))} · quedan ${preguntasBlanco} sin responder.</p>`
        : "";
      const cuerpo = modo === "diferida" ? htmlPreguntaDiferida(clave, q, r, listaPrevia) : htmlPreguntaInteractiva(clave, q, cont, rt, r, listaPrevia);
      zona.innerHTML = `<div class="tarjeta-repaso" data-modo="${esc(modo)}">
        <p class="origen">Pregunta ${i + 1} de ${colaSesion.length} · <a href="#/c/${esc(id)}">${esc(c.t)}</a> (fase ${c.f})</p>
        ${lineaPolitica(criterio, ROTULO_CUAL_CUENTA)}
        ${preambulo}
        ${cuerpo}
      </div>`;
      engancharPregunta(clave, id, n, q, cont, listaPrevia, abierta);
      actualizarLateral();
    }

    /** El cuerpo de una pregunta a ciegas: opciones y nada mas. Ni acierto, ni correcta, ni
     *  explicacion en el HTML —no solo ocultas—, porque lo que no esta no se puede filtrar. */
    function htmlPreguntaDiferida(clave, q, r, listaPrevia) {
      const elegida = r && typeof r.elegida === "number" ? r.elegida : null;
      const sinResponder = colaSesion.filter((k) => !respondida(respuestas[k])).length;
      const ultima = i === colaSesion.length - 1;
      return `<p class="quiz-p"><strong>${esc(q.p)}</strong></p>
        <ol class="quiz-opciones">${q.o.map((o, k) => `<li><button type="button" class="opcion${elegida === k + 1 ? " elegida" : ""}" data-opcion="${k + 1}"${elegida === k + 1 ? ' aria-pressed="true"' : ""}>${esc(o)}</button></li>`).join("")}</ol>
        <p class="nota-pie">Puedes cambiar tu respuesta hasta que entregues. Nada se corrige antes, y el repaso no se programa hasta el final: así lo que respondas en la pregunta 12 no te chiva la 13.</p>
        <div class="acciones-fila">
          ${i > 0 ? `<button type="button" class="boton" id="repaso-anterior">← Anterior</button>` : ""}
          ${ultima ? "" : `<button type="button" class="boton primario" id="repaso-siguiente">Siguiente pregunta →</button>`}
          <button type="button" class="boton${ultima ? " primario" : ""}" id="repaso-entregar">Entregar el examen</button>
          ${sinResponder ? `<span class="nota-pie" id="repaso-pendientes">${sinResponder} ${sinResponder === 1 ? "pregunta" : "preguntas"} sin responder</span>` : `<span class="nota-pie" id="repaso-pendientes">Todo respondido</span>`}
        </div>
        ${listaPrevia.length ? bloqueIntentos(listaPrevia, criterioCuenta(pref)) : ""}`;
    }

    /** El cuerpo de una pregunta que se corrige al pulsar (inmediata) o con reintentos
     *  (interactiva). La diferencia esta en si se enseña la opcion correcta al fallar. */
    function htmlPreguntaInteractiva(clave, q, cont, rt, r, listaPrevia) {
      const revelado = rt.acertada || rt.agotados;
      const pedidas = pistasVistas.get(clave) || 0;
      const pista = pedidas > 0 ? pistaDe(q, cont, pedidas - 1) : null;
      const opciones = q.o.map((o, k) => {
        const n = k + 1;
        const esElegida = rt.ultima === n;
        // `revelado` mezcla las dos cosas que hay que enseñar al terminar: cual era la buena y
        // cual se fallo. Antes de terminar, en interactiva, lo unico que se marca es la elegida
        // como incorrecta: revelar la correcta al primer fallo convertiria el reintento en un
        // adorno, porque ya se sabria la respuesta.
        const clase = (revelado && n === q.a ? " correcta" : "") + (esElegida && !rt.acertada ? " incorrecta" : "");
        return `<li><button type="button" class="opcion${clase}" data-opcion="${n}"${esElegida ? ' aria-pressed="true"' : ""}${revelado ? " disabled" : ""}>${esc(o)}</button></li>`;
      }).join("");
      return `<p class="quiz-p"><strong>${esc(q.p)}</strong></p>
        <ol class="quiz-opciones">${opciones}</ol>
        <div class="quiz-explicacion" hidden></div>
        ${pista ? `<p class="quiz-pista" id="pista-pregunta"><span class="quiz-pista-origen">${esc(pista.deQuien)}</span> ${esc(pista.texto)}</p>` : ""}
        <div class="quiz-acciones" id="quiz-acciones">
          ${modo === "interactiva" ? `<p class="nota-pie" id="intentos-restantes">${rt.max === null ? "Intentos sin límite" : `Llevas ${rt.intentos} de ${rt.max} ${rt.max === 1 ? "intento" : "intentos"}`}${rt.agotados ? " · se han agotado" : ""}${rt.acertada ? " · acertada" : ""}</p>` : ""}
          ${modo === "interactiva" && !revelado ? `<div class="acciones-fila">
            <button type="button" class="boton" id="probar-otra-vez">Probar otra vez</button>
            <button type="button" class="boton" id="pedir-pista"${pista && pedidas >= pista.escalones ? " disabled" : ""}>Pedir una pista</button>
          </div>` : ""}
        </div>
        <div class="valoraciones"></div>
        ${listaPrevia.length ? bloqueIntentos(listaPrevia, criterioCuenta(pref)) : ""}`;
    }

    // ── Los botones de una pregunta ──
    function engancharPregunta(clave, id, n, q, cont, listaPrevia, abierta) {
      const contenedor = $(".tarjeta-repaso", zona);
      if (!contenedor) return;
      const modo2 = modoDe(pref);
      const criterio = criterioCuenta(pref);

      $$(".opcion", contenedor).forEach((boton) => boton.addEventListener("click", () => {
        const elegida = Number(boton.dataset.opcion);
        const segundos = Math.round((ahora() - abierta) / 1000);
        if (modo2 === "diferida") {
          // A ciegas: se apunta la eleccion y NADA mas. Ni se corrige, ni se programa, ni se
          // enseña. Cambiar de opinion es un derecho hasta el momento de entregar.
          respuestas[clave] = { elegida, correcta: null, seguro: null, segundos };
          guardar();
          const sinResponder = colaSesion.filter((k) => !respondida(respuestas[k])).length;
          $$(".opcion", contenedor).forEach((b) => {
            const suyo = Number(b.dataset.opcion) === elegida;
            b.classList.toggle("elegida", suyo);
            b.setAttribute("aria-pressed", suyo ? "true" : "false");
          });
          const aviso = $("#repaso-pendientes", contenedor);
          if (aviso) aviso.textContent = sinResponder ? `${sinResponder} ${sinResponder === 1 ? "pregunta" : "preguntas"} sin responder` : "Todo respondido";
          return;
        }
        const acerto = elegida === q.a;
        const rt = reintentos.get(clave) || estadoReintentos({}, "", null);
        if (modo2 === "interactiva" && (rt.acertada || rt.agotados)) return;
        const siguiente = modo2 === "interactiva" ? estadoReintentos(rt, acerto ? "acierto" : "fallo", pref.intentosMax) : null;
        const nuevo = modo2 === "interactiva" ? { ...siguiente, ultima: elegida } : { intentos: 1, pistasPedidas: 0, acertada: acerto, max: null, disponibles: 0, agotados: false, bloqueada: acerto, ultima: elegida };
        if (modo2 === "interactiva") reintentos.set(clave, nuevo);
        // El intento se guarda en los DOS casos, y la respuesta tambien: el historial es lo que
        // permite reconstruir despues que se respondio. Lo que cambia entre modos es cuando se
        // AÑADE a la lista, que en interactiva es cuando la pregunta termina.
        apuntarIntento(clave, { elegida, correcta: acerto, seguro: null, segundos });
        respuestas[clave] = { elegida, correcta: acerto, seguro: null, segundos };
        if (acerto) aciertosSesion++;
        // El repaso se programa con el ULTIMO intento y una sola vez por pregunta: con reintentos,
        // programar en cada uno contaria tres repasos de la misma pregunta por insistir tres veces.
        //
        // Con la seguridad declarada encendida, la programacion ESPERA: la calidad no se sabe hasta
        // que la persona dice cuanto se fiaba, y programar antes obligaria a programar dos veces
        // —una con la calidad de por defecto y otra con la de verdad—, que es justo lo que no se
        // puede hacer con un intervalo. Lo que si se enseña ya es el juicio: quien acaba de
        // responder tiene derecho a saber si era esa.
        if (pedirSeguridad && (modo2 === "inmediata" || acerto)) {
          respuestas[clave] = { elegida, correcta: acerto, seguro: null, segundos };
          revelar(contenedor, q, clave, acerto, null, true);
          return;
        }
        const r = programar(clave, acerto, null);
        if (modo2 === "inmediata") {
          revelar(contenedor, q, clave, acerto, r, false);
          return;
        }
        if (acerto) { revelar(contenedor, q, clave, true, r, false); return; }
        // Fallo con reintentos disponibles: se marca la elegida como incorrecta y NADA mas. La
        // correcta no aparece —ni en la lista, ni en la explicacion— hasta que se acierte o se
        // agoten los intentos.
        pintar();
      }));

      $("#repaso-anterior", contenedor)?.addEventListener("click", () => { guardar(); i = Math.max(0, i - 1); pintar(); });
      $("#repaso-siguiente", contenedor)?.addEventListener("click", () => { guardar(); i = Math.min(colaSesion.length - 1, i + 1); pintar(); });
      $("#repaso-entregar", contenedor)?.addEventListener("click", () => {
        const sinResponder = colaSesion.filter((k) => !respondida(respuestas[k])).length;
        // Avisar de lo que queda en blanco no es un estorbo: entregar sin querer veinte preguntas
        // en blanco es la forma mas rapida de que el examen diga que no sabes nada cuando si sabes.
        if (sinResponder && !confirm(`Quedan ${sinResponder} ${sinResponder === 1 ? "pregunta" : "preguntas"} sin responder. ¿Entregar de todas formas? Las que están en blanco no contarán como intento.`)) return;
        cerrarSesion();
        pintarEntregado();
      });
      $("#probar-otra-vez", contenedor)?.addEventListener("click", () => {
        $$(".opcion", contenedor).forEach((b) => { if (!b.disabled) b.classList.remove("incorrecta", "elegida"); });
        $(".quiz-p", contenedor)?.scrollIntoView({ block: "nearest" });
      });
      $("#pedir-pista", contenedor)?.addEventListener("click", () => {
        const rt = reintentos.get(clave) || estadoReintentos({}, "", null);
        // Pedir una pista cuesta un intento: esa es la regla de Moodle —pistas mas uno— y por eso
        // pedirla no puede ser gratis. Si lo fuera, el minimo de tres intentos no significaria nada.
        reintentos.set(clave, { ...estadoReintentos(rt, "pista", pref.intentosMax), ultima: rt.ultima ?? null });
        pistasVistas.set(clave, (pistasVistas.get(clave) || 0) + 1);
        pintar();
      });
    }

    /**
     * Enseña el resultado de una pregunta ya juzgada: la correcta, la explicacion y, si se ha
     * pedido, la pregunta de seguridad.
     *
     * En el modo diferido nada de esto EXISTE en el HTML antes de entregar —no esta oculto: no
     * esta—, y aqui tampoco se pinta hasta que hay un juicio. Esa es la asercion anti-filtracion
     * que comprueba `_auditar-ui.mjs`, y el motivo de que el HTML a ciegas no lleve ni la
     * explicacion ni la marca de la opcion buena.
     *
     * `r` es lo que devolvio `programar`, o `null` cuando la programacion todavia no ha ocurrido
     * porque falta declarar la seguridad. En ese caso la persona ya ve si acerto y ya puede pulsar
     * «poco / bastante / seguro del todo», y el plazo se dice DESPUES de saberlo.
     */
    function revelar(contenedor, q, clave, acerto, r, deSeguridad) {
      const r_ = respuestas[clave] || {};
      const criterio = criterioCuenta(pref);
      const verAcierto = revisionVisible(revision, "acierto", "entregar");
      const verCorrecta = revisionVisible(revision, "correcta", "entregar");
      const verExplicacion = revisionVisible(revision, "explicacion", "entregar");
      $$(".opcion", contenedor).forEach((b) => {
        b.disabled = true;
        const suyo = Number(b.dataset.opcion);
        if (verCorrecta && suyo === q.a) b.classList.add("correcta");
        if (suyo === r_.elegida && !acerto) b.classList.add("incorrecta");
      });
      const exp = $(".quiz-explicacion", contenedor);
      if (exp && verExplicacion) {
        exp.hidden = false;
        exp.innerHTML = `<p>${esc(q.e)}</p>`;
      }
      const v = $(".valoraciones", contenedor);
      if (!v) return;
      const pinta = (programado) => {
        const lista = intentosDe(intentos, clave);
        const dias = programado ? programado.dias : (r ? r.dias : null);
        v.innerHTML = `
          ${verAcierto ? `<p class="quiz-pie" id="repaso-juicio">${acerto ? "Bien." : "Mal."}</p>` : ""}
          ${seguridadPedida(pref) ? `<div class="seguridad" id="seguridad-pregunta">
            <p class="quiz-pie">¿Cuánto te fiabas de tu respuesta? No cambia la nota: cambia cada cuánto vuelve esta pregunta.</p>
            <div class="seguridad-opciones">${SEGURIDADES.map((s) => `<button type="button" class="boton" data-seguridad="${esc(s.id)}">${esc(s.rotulo)} <span class="nota-pie">(${esc(s.detalle)})</span></button>`).join("")}</div>
            <p class="quiz-pie" id="seguridad-efecto" hidden></p>
          </div>` : ""}
          ${dias === null ? "" : `<p class="quiz-pie" id="repaso-plazo">El repaso de esta pregunta se ha programado con esta respuesta: vuelve en ${dias} ${dias === 1 ? "día" : "días"}.</p>`}
          <p class="quiz-nota">${esc(lineaNota(lista, criterio, ROTULO_CUAL_CUENTA).texto)}</p>
          <p class="nota-pie">Deja reposar esto unas horas antes de reintentarlo: repetir la misma pregunta en caliente mide la memoria de hace un minuto, no lo que sabes.</p>
          <button class="boton primario" id="siguiente-repaso">${i >= colaSesion.length - 1 ? "Terminar la sesión" : "Siguiente pregunta →"}</button>`;
        $$("[data-seguridad]", v).forEach((b) => b.addEventListener("click", () => {
          const seguro = b.dataset.seguridad;
          // La seguridad declarada se guarda en el ULTIMO intento, que es el que programa el repaso:
          // es la unica forma de que decir «me lo he jugado» cambie el plazo en vez de ser un adorno.
          const intento = respuestas[clave];
          if (intento) intento.seguro = seguro;
          const historial = intentos[clave];
          if (!Array.isArray(historial) || !historial.length) apuntarIntento(clave, { elegida: r_ ? r_.elegida : null, correcta: acerto, seguro, segundos: r_ ? r_.segundos : 0 });
          else historial[historial.length - 1] = { ...historial[historial.length - 1], seguro };
          escribir(CLAVES.intentos, intentos);
          const calidad = calidadDe(acerto, seguro);
          const res = programar(clave, acerto, seguro);
          $$("[data-seguridad]", v).forEach((x) => { x.disabled = true; if (x === b) x.classList.add("activo"); });
          const efecto = $("#seguridad-efecto", v);
          if (efecto) {
            efecto.hidden = false;
            efecto.textContent = `Anotado: ${rotuloSeguridad(seguro).toLowerCase()}. Con eso, esta pregunta entra en el repaso con calidad ${calidad} de 5 y vuelve en ${res.dias} ${res.dias === 1 ? "día" : "días"}.`;
          }
          const plazo = $("#repaso-plazo", v);
          if (plazo) plazo.textContent = `El repaso de esta pregunta se ha programado con esta respuesta: vuelve en ${res.dias} ${res.dias === 1 ? "día" : "días"}.`;
          else {
            const juicio = $("#repaso-juicio", v);
            if (juicio) juicio.insertAdjacentHTML("afterend", `<p class="quiz-pie" id="repaso-plazo">El repaso de esta pregunta se ha programado con esta respuesta: vuelve en ${res.dias} ${res.dias === 1 ? "día" : "días"}.</p>`);
          }
          pintarIntentosDeLaPregunta(contenedor, clave, criterio);
        }));
        $("#siguiente-repaso", v)?.addEventListener("click", () => { guardar(); i++; pintar(); });
        pintarIntentosDeLaPregunta(contenedor, clave, criterio);
      };
      pinta(r);
      if (deSeguridad) v.scrollIntoView({ block: "nearest" });
    }

    /** Vuelve a pintar el bloque de intentos y la nota de ESTA pregunta. Se hace despues de cada
     *  respuesta y despues de declarar la seguridad porque las dos cosas cambian la cifra. */
    function pintarIntentosDeLaPregunta(contenedor, clave, criterio) {
      const zonaIntentos = $(".quiz-intentos", contenedor);
      if (!zonaIntentos) return;
      const lista = intentosDe(intentos, clave);
      zonaIntentos.innerHTML = `<p class="quiz-nota${notaDe(lista, criterio) === null ? " quiz-nota-vacia" : ""}">${esc(lineaNota(lista, criterio, ROTULO_CUAL_CUENTA).texto)}</p>` + bloqueIntentos(lista, criterio);
    }

    /** La politica, otra vez, en el sitio donde de verdad se necesita: pegada a la pregunta que se
     *  esta respondiendo, para que la regla de cual cuenta se lea justo antes de contestar. La de
     *  arriba de la vista lleva su propio identificador y no se repite aqui: dos elementos con el
     *  mismo `id` dejan la comprobacion de interfaz mirando el que no es. */
    function lineaPolitica(criterio, rotulos) {
      return `<p class="intentos-politica" id="politica-repaso"><span class="intentos-politica-rotulo">Cuál cuenta:</span> ${esc(politicaIntentos(criterio, rotulos))}</p>`;
    }

    // Una sesion de la que no se puede guardar nada lo dice ANTES de la primera pregunta: si se
    // descubre al final, ya se han perdido veinte respuestas y no hay forma de recuperarlas.
    if (modo === "diferida" && !puedeGuardarSesion()) {
      zona.innerHTML = `<div class="aviso aviso-aviso" id="aviso-sin-sesion">
        <p class="aviso-titulo">Este navegador no deja guardar las respuestas a medias</p>
        <p>El modo diferido guarda tus respuestas a ciegas mientras las escribes, para que recargar la página no te borre el examen. Aquí eso no se puede hacer (suele pasar en ventanas privadas o con los datos del sitio bloqueados), así que <strong>si recargas, se pierden</strong>.</p>
        <p class="acciones-fila">
          <button type="button" class="boton" data-modo-respuesta="inmediata">Pasar a inmediata</button>
          <button type="button" class="boton" data-modo-respuesta="interactiva">Pasar a interactiva</button>
          <button type="button" class="boton primario" id="seguir-sin-guardar">Seguir así, sin guardar</button>
        </p>
        <p class="nota-pie">Tu progreso de repaso —lo ya respondido antes de hoy— no corre ningún riesgo: vive en otro sitio y no se toca.</p>
      </div>`;
      $("#seguir-sin-guardar")?.addEventListener("click", () => { zona.innerHTML = ""; pintar(); });
      return;
    }

    if (guardada.estado === "descartada") {
      // Se dice antes de la primera pregunta y no se para nada: descartar una sesion no borra
      // progreso, y quien la tenia a medias puede empezar otra en el mismo sitio.
      if (guardada.motivo) zona.insertAdjacentHTML("afterbegin", `<p class="nota-pie" id="sesion-descartada">${esc(guardada.motivo)}</p>`);
    }
    if (guardada.estado === "encontrada") {
      const n = guardada.respondidas;
      zona.insertAdjacentHTML("afterbegin", `<aside class="aviso" id="sesion-continuada">
        <p class="aviso-titulo">Tienes un examen a medias</p>
        <p>Hay ${n} ${n === 1 ? "respuesta guardada" : "respuestas guardadas"} de las ${colaSesion.length} preguntas, sin entregar. Nada de eso se ha corregido todavía.</p>
        <p class="acciones-fila"><button type="button" class="boton primario" id="continuar-sesion">Continuar donde lo dejé</button>
        <button type="button" class="boton" id="descartar-sesion">Empezar de cero</button></p>
      </aside>`);
      $("#continuar-sesion")?.addEventListener("click", () => { $("#sesion-continuada")?.remove(); pintar(); });
      $("#descartar-sesion")?.addEventListener("click", () => { borrarSesion(); respuestas = {}; marcas = marcasDe(); i = 0; entregado = false; $("#sesion-continuada")?.remove(); pintar(); });
    }
    pintar();
  }

  // ── Exportar / importar ───────────────────────────────────────────────
  function descargar(nombre, texto, tipo = "text/plain;charset=utf-8") {
    const blob = new Blob([texto], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarAnki(ids, soloFalladas = false) {
    const lineas = [
      "#separator:tab",
      "#html:true",
      "#notetype:Basic",
      "#tags column:4",
      "# Una linea por pregunta. En Anki: Archivo > Importar > este fichero,",
      "# tipo de nota Basico, campo 1 = Anverso, campo 2 = Reverso.",
    ];
    let n = 0;
    for (const id of ids) {
      const cont = contenidoDe(id);
      if (!cont) continue;
      const c = P.conceptos[id];
      cont.quizzes.forEach((q, k) => {
        const clave = `${id}#${k}`;
        if (soloFalladas && !(srs[clave]?.fallos > 0)) return;
        const anverso = `<b>${esc(c.t)}</b><br>${esc(q.p)}<br><br>` +
          q.o.map((o, j) => `${j + 1}. ${esc(o)}`).join("<br>");
        const reverso = `<b>Respuesta: ${q.a}. ${esc(q.o[q.a - 1])}</b><br><br>${esc(q.e)}`;
        const etiquetas = ["aprender", `f${String(c.f).padStart(2, "0")}`, ...c.r].join(" ");
        lineas.push(`${anverso}\t${reverso}\t${esc(c.t)}\t${etiquetas}`);
        n++;
      });
    }
    descargar(`aprender-anki-${hoyISO()}.txt`, lineas.join("\n"));
    alert(`Exportadas ${n} preguntas. En Anki: Archivo → Importar, separador tabulador, HTML activado.`);
  }

  // ── Lateral ───────────────────────────────────────────────────────────
  function construirArbol() {
    const abiertas = new Set(JSON.parse(sessionStorage.getItem("aprender.abiertas") || "[]"));
    const arbol = $("#arbol");
    arbol.innerHTML = P.fases.map((f) => {
      const ids = orden.filter((c) => c.fid === f.id).map((c) => c.id);
      const abierta = abiertas.has(f.id) || rutaActual().vista === "fase" && rutaActual().arg === f.id;
      return `<div class="fase" data-fase="${f.id}">
        <button class="fase-cabecera" data-plegar="${f.id}" aria-expanded="${abierta}">
          <span class="fase-num">${f.num}</span><span>${esc(f.corto)}</span>
          <span class="fase-cuenta">${ids.length || ""}</span>
        </button>
        <ul ${abierta ? "" : "hidden"}>${ids.map((id) => {
          const c = P.conceptos[id];
          // El arbol enseña la misma pastilla que la ficha y el glosario, y no un punto de
          // color: un punto solo se distingue por el color, y el color no es informacion para
          // quien no lo ve. Lo que se cambia al marcar es el texto y la clase, nada mas.
          return `<li><a class="concepto-enlace" href="#/c/${id}" data-id="${id}" title="${esc(c.t)}"><span>${esc(c.t)}</span>${pastillaEstadoDesde(id, estadoDe(id))}</a></li>`;
        }).join("")}</ul></div>`;
    }).join("");
    $$("[data-plegar]", arbol).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.plegar;
      const ul = b.nextElementSibling;
      ul.hidden = !ul.hidden;
      b.setAttribute("aria-expanded", String(!ul.hidden));
      const conj = new Set(JSON.parse(sessionStorage.getItem("aprender.abiertas") || "[]"));
      if (ul.hidden) conj.delete(id); else conj.add(id);
      sessionStorage.setItem("aprender.abiertas", JSON.stringify([...conj]));
    }));
  }

  function actualizarLateral() {
    // El lateral ya no enseña un porcentaje global del temario (DOCTRINA-CALIDAD §8): enseña
    // lo único que se decide ahí, cuánto queda para hoy, con su enlace. Si la copia del
    // armazón es antigua y aún trae la barra de progreso, simplemente no se toca.
    const pendientes = pendientesAhora(hoyISO());
    const hoyNav = $("#lateral-hoy");
    if (hoyNav) {
      hoyNav.textContent = pendientes.vacia
        ? "Hoy no tienes nada pendiente"
        : `Hoy: ${pendientes.mostradas} cosa${pendientes.mostradas === 1 ? "" : "s"} (${duracion(pendientes.minutos)})`;
    }
    const { vista, arg } = rutaActual();
    $$("#arbol .concepto-enlace").forEach((a) => a.classList.toggle("activo", vista === "concepto" && a.dataset.id === arg));
    // Repintar la pastilla cuesta menos que rehacer el arbol entero —que son 438 enlaces y
    // perderia el foco del teclado—: se cambia el texto, la clase y el titulo de la que ya
    // esta. Se calcula el estado una vez por ficha y no dos, porque lo pide el mismo pintado.
    $$("#arbol .concepto-enlace").forEach((a) => {
      const pastilla = a.querySelector(".pastilla-estado");
      if (!pastilla) return;
      const est = estadoDe(a.dataset.id);
      const { simbolo, rotulo, clase } = est.insignia;
      const titulo = `Estado de esta ficha: ${rotulo.toLowerCase()}`;
      pastilla.className = `pastilla pastilla-estado estado-${clase}`;
      pastilla.title = titulo;
      pastilla.setAttribute("aria-label", titulo);
      if (simbolo) pastilla.dataset.simbolo = simbolo; else delete pastilla.dataset.simbolo;
      pastilla.innerHTML = (simbolo ? `<span class="estado-simbolo" aria-hidden="true">${esc(simbolo)}</span> ` : "") + `<span class="estado-texto">${esc(rotulo)}</span>`;
    });
  }

  // ── Enrutado ──────────────────────────────────────────────────────────
  /** Estado de error de una sección cuyo módulo no está: se dice qué pasa y se ofrece reintentar. */
  function estadoNoDisponible() {
    return `<div class="estado-error" role="alert"><p class="estado-titulo">Esta sección no se ha podido cargar</p><p>Puede que falte un fichero en esta copia del portal.</p><p><button type="button" class="boton" data-reintentar-vista="1">Reintentar</button></p></div>`;
  }

  /**
   * Índice de la ficha (patrón MDN, docs/SISTEMA-DE-DISENO.md §1): se construye con los
   * h2 del artículo ya pintado y solo se enseña si hay TRES secciones o más. Un índice de
   * una entrada no ayuda: es ruido.
   */

  /** En móvil los filtros de la biblioteca arrancan plegados; en escritorio, abiertos. */
  let filtrosBusquedaAbierta = false;
  function ajustarFiltrosBusqueda() {
    const d = document.getElementById("filtros-busqueda");
    if (!d) return;
    // En móvil, un filtro activo (ruta, nivel, orden, tipo o conjunto) mantiene «Filtros» abierto;
    // sin filtros, queda plegado para que los resultados se vean cuanto antes.
    const f = partesDeBusqueda(String(location.hash || "").replace(/^#\/buscar\/?/, ""));
    const activos = [f.ruta, f.nivel, f.orden, f.tipo, f.solo].filter(Boolean).length;
    d.open = window.matchMedia("(min-width: 701px)").matches || activos > 0 || filtrosBusquedaAbierta;
    d.addEventListener("toggle", () => { filtrosBusquedaAbierta = d.open; });
  }

  function construirIndiceFicha() {
    const caja = $("#indice-ficha");
    const articulo = $("#contenido-concepto");
    const lista = caja && caja.querySelector("ol");
    const detalles = caja && caja.querySelector("details");
    if (!caja || !articulo || !lista) return;
    const secciones = [...articulo.querySelectorAll("h2")].filter((h) => (h.textContent || "").trim());
    if (secciones.length < 3) { caja.hidden = true; return; }
    lista.innerHTML = secciones.map((h, i) => {
      if (!h.id) h.id = "seccion-" + (i + 1);
      return `<li><button type="button" class="indice-enlace" data-indice="${esc(h.id)}"><span class="indice-n">§${i + 1}</span>${esc((h.textContent || "").trim())}</button></li>`;
    }).join("");
    // En escritorio el índice es una columna lateral siempre visible; en móvil arranca plegado
    // para no empujar el artículo (el <details> se abre con un toque).
    if (detalles) {
      const resumen = detalles.querySelector("summary");
      if (resumen) resumen.textContent = `En esta página · ${secciones.length} secciones`;
      detalles.open = window.matchMedia("(min-width: 1100px)").matches;
    }
    caja.hidden = false;
  }

  function rutaActual() {
    const h = (location.hash || "#/").replace(/^#\/?/, "");
    const [parte, arg] = h.split("/");
    if (parte === "c") return { vista: "concepto", arg };
    if (parte === "fase") return { vista: "fase", arg };
    if (parte === "ruta") return { vista: "ruta", arg };
    if (parte === "orientacion") return { vista: "orientacion", arg: null };
    if (parte === "diagnostico") return { vista: "diagnostico", arg: null };
    if (parte === "sesion") return { vista: "sesion", arg: null };
    if (parte === "buscar") return { vista: "buscar", arg };
    if (parte === "favoritos") return { vista: "favoritos", arg: null };
    if (parte === "mapa") return { vista: "mapa", arg };
    if (parte === "notas") return { vista: "notas", arg };
    if (parte === "dudas") return { vista: "dudas", arg };
    if (parte === "experimentos") return { vista: "experimentos", arg };
    if (parte === "laboratorios") return { vista: "laboratorios", arg };
    if (parte === "proyecto") return { vista: "proyecto", arg };
    if (parte === "proyectos") return { vista: "proyectos", arg };
    if (parte === "aprender") return { vista: "aprender", arg: null };
    if (parte === "ejemplo") return { vista: "ejemplo", arg: null };
    if (parte === "rutas") return { vista: arg === "bi" ? "rutaBI" : "rutas", arg: null };
    if (parte === "quien-esta-detras") return { vista: "quien", arg: null };
    if (parte === "portfolio") return { vista: "portfolio", arg: null };
    if (parte === "cv") return { vista: "cv", arg: null };
    if (parte === "proyectos-estrella") return { vista: "estrellas", arg: null };
    if (parte === "ficha-ejemplo") return { vista: "fichaCompleta", arg: null };
    if (parte === "informe") return { vista: "informe", arg };
    if (parte === "conflictos") return { vista: "conflictos", arg };
    if (parte === "transferencia") return { vista: "transferencia", arg };
    if (parte === "paquetes") return { vista: "paquetes", arg };
    if (parte === "incidencia") return { vista: "incidencia", arg };
    if (parte === "avisos") return { vista: "avisos", arg };
    if (parte === "recordatorios") return { vista: "recordatorios", arg };
    if (["glosario", "repaso", "progreso", "pendientes", "buscar", "ayuda", "plan", "ejecutar", "entrar", "registro", "recuperar", "cuenta", "precios", "analitica"].includes(parte)) return { vista: parte, arg };
    // Las páginas legales y el inventario de datos solo existen si la capa de plataforma
    // está puesta: sin ella, datos/legal.js no se genera y estas rutas caen en el inicio.
    if (parte === "legal" && window.LEGAL) return { vista: "legal", arg };
    if (parte === "datos" && window.LEGAL && window.LEGAL.datos) return { vista: "legal", arg: "datos" };
    // Un hash desconocido NO es la portada: antes caia aqui sin decir nada, asi que escribir una
    // direccion rota o seguir un enlace mal formado te dejaba en el inicio, que es peor que un
    // error porque parece que el enlace funcionaba. Solo el hash vacio es el inicio.
    if (h === "" || h === "/") return { vista: "inicio", arg: null };
    return { vista: "no-encontrada", arg: parte || h };
  }

  // ── Dirección que no existe ──────────────────────────────────────────────
  // Se llega aquí desde rutaActual() cuando el hash no es ninguna ruta conocida. El despachador
  // hace `(vistas[vista] || vistas.inicio)`, así que si esta vista faltara se volvería al inicio
  // en silencio: exactamente el comportamiento que se está corrigiendo.
  vistas["no-encontrada"] = (que) => `<div class="migas"><a href="#/">Inicio</a> › No encontrada</div>
    <h1>Esa dirección no lleva a ninguna parte</h1>
    <p>Has pedido <code>#/${esc(String(que || ""))}</code> y aquí no hay ninguna página con esa dirección.</p>
    <p>Puede ser un enlace mal escrito, o una página que existía antes y ya no. No es un fallo de tu equipo ni de tu conexión: la dirección no apunta a nada, y prefiero decírtelo a dejarte en la portada como si hubiera funcionado.</p>
    <h2>Por dónde seguir</h2>
    <ul>
      <li><a href="#/">Inicio</a>, para ver por dónde ibas.</li>
      <li><a href="#/plan">El plan</a>, con el temario completo.</li>
      <li><a href="#/glosario">El glosario</a>, si buscabas un término.</li>
      <li><a href="#/buscar">Buscar</a>, si querías encontrar algo concreto.</li>
      <li><a href="#/progreso">Tu progreso</a>, con lo que llevas hecho.</li>
    </ul>`;
  // ── Páginas legales e inventario de datos ──────────────────────────────
  // El HTML lo deja hecho el generador en datos/legal.js a partir de los Markdown de
  // plataforma/legal/. Aquí solo se elige el documento y se pone el índice lateral.
  vistas.legal = (id) => {
    const docs = window.LEGAL || {};
    const d = docs[id] || docs.avisoLegal || Object.values(docs)[0];
    if (!d) return `<div class="migas"><a href="#/">Inicio</a> › Legal</div><h1>Sin textos legales</h1>
      <p class="nota-pie">Este portal no tiene puesta la capa de plataforma, así que no hay páginas legales que mostrar.</p>`;
    const migas = `<div class="migas"><a href="#/">Inicio</a> › ${id === "datos" ? "Tus datos" : "Legal"}</div>`;
    // Los demás documentos, para poder saltar de uno a otro sin volver al índice.
    const otros = Object.values(docs).filter((x) => x.id !== d.id && x.id !== "QUE-RELLENAR");
    const lista = otros.map((x) => {
      const nombre = x.id === "datos" ? "Qué datos se recogen" : x.titulo;
      return `<li><a href="#/${x.id === "datos" ? "datos" : "legal/" + x.id}">${esc(nombre)}</a></li>`;
    }).join("");
    // David ha pedido que los datos legales puedan esperar. Hasta que se completen, no se
    // publica ningún texto a medias: se muestra una nota corta y el documento queda en preparación.
    const nota = `<aside class="aviso aviso-nota" id="aviso-legal-provisional">
        <p class="aviso-titulo">Aviso legal en preparación</p>
        <div><p>Los textos legales completos se publicarán antes de abrir cuentas o cobros. Mientras
        tanto, este portal no tiene cuentas, no cobra y guarda tu progreso solo en este navegador.</p></div>
      </aside>
      <p class="nota-pie">No se publica ningún texto legal incompleto.</p>`;
    return `${migas}
      <h1>${esc(d.titulo)}</h1>
      <nav class="indice-legal" aria-label="Otros documentos legales"><ul>${lista}</ul></nav>
      <div class="legal-texto">${nota}</div>`;
  };

  // ── Cuenta y sesión ────────────────────────────────────────────────────
  // La plataforma es OPCIONAL: si window.ACADEMIA.api está vacío, el portal funciona
  // entero con el progreso en este navegador y estas vistas lo EXPLICAN, en vez de ofrecer
  // botones que no llevan a ninguna parte.
  const API = () => (window.ACADEMIA && window.ACADEMIA.api) || "";
  // La API responde {persona: {...}} en el acceso, el registro y la sesion. Aqui se
  // desenvuelve en un solo sitio, para que el resto del portal lea sesion.correo y punto.
  const desenvuelve = (d) => (d && (d.persona || d)) || null;
  const API_COBRO = () => (window.ACADEMIA && window.ACADEMIA.cobro) || "";
  const hayCobro = () => API_COBRO() !== "";
  const hayPlataforma = () => API() !== "";
  let sesion = null;
  let sesionConsultada = false;

  async function api(ruta, opciones = {}) {
    const base = API();
    if (!base) throw new Error("sin-plataforma");
    const r = await fetch(base.replace(/\/$/, "") + ruta, {
      method: opciones.metodo || "GET",
      credentials: "include",
      headers: opciones.cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    });
    let datos = null;
    try { datos = await r.json(); } catch { /* respuesta sin cuerpo */ }
    if (!r.ok) throw new Error((datos && (datos.error || datos.mensaje)) || "Error " + r.status);
    return datos;
  }

  async function comprobarSesion() {
    if (!hayPlataforma()) { sesion = null; sesionConsultada = true; pintarEnlaceCuenta(); return null; }
    try { sesion = desenvuelve(await api("/api/sesion")); } catch { sesion = null; }
    sesionConsultada = true;
    pintarEnlaceCuenta();
    return sesion;
  }

  // El enlace de la barra dice en qué estado estás. Sin plataforma no aparece: no se
  // ofrecen puertas que no llevan a ninguna parte.
  function pintarEnlaceCuenta() {
    const a = $("#enlace-cuenta");
    if (!a) return;
    if (!hayPlataforma()) { a.hidden = true; return; }
    a.hidden = false;
    if (sesion) { a.textContent = sesion.nombre || sesion.correo; a.href = "#/cuenta"; }
    else { a.textContent = "Entrar"; a.href = "#/entrar"; }
  }

  const campoForm = (id, etiqueta, tipo, auto, ayuda) => `
    <p class="campo">
      <label for="${id}">${etiqueta}${ayuda ? ` <span class="campo-ayuda">${ayuda}</span>` : ""}</label>
      <input type="${tipo}" id="${id}" name="${id}" autocomplete="${auto}" required>
    </p>`;

  const avisoSinPlataforma = `
    <aside class="aviso aviso-nota">
      <p class="aviso-titulo">Este portal va sin cuentas</p>
      <div><p>Ahora mismo no hay ningún servicio de cuentas conectado, así que no hay dónde
      registrarse ni entrar. Y eso es una buena noticia: significa que <strong>tu progreso no
      sale de este navegador</strong>.</p>
      <p>Se guarda en tu equipo y lo puedes exportar desde <a href="#/progreso">Mi progreso</a>.</p></div>
    </aside>`;

  vistas.entrar = () => {
    const migas = `<div class="migas"><a href="#/">Inicio</a> › Entrar</div>`;
    if (!hayPlataforma()) return migas + `<h1>Entrar</h1>${avisoSinPlataforma}`;
    return migas + `<h1>Entrar</h1>
      <form class="formulario" id="form-entrar" novalidate>
        ${campoForm("correo", "Correo", "email", "email")}
        ${campoForm("contrasena", "Contraseña", "password", "current-password")}
        <p class="formulario-error" id="error-entrar" role="alert" hidden></p>
        <p class="formulario-acciones">
          <button type="submit" class="boton-principal">Entrar</button>
          <a href="#/recuperar">No me acuerdo de la contraseña</a>
        </p>
      </form>
      <p class="nota-pie">¿No tienes cuenta? <a href="#/registro">Créala</a>. Solo se guardan tu
      correo y tu progreso: ni publicidad ni cesión a terceros.
      <a href="#/datos">Qué datos se recogen</a>.</p>`;
  };

  vistas.registro = () => {
    const migas = `<div class="migas"><a href="#/">Inicio</a> › Crear cuenta</div>`;
    if (!hayPlataforma()) return migas + `<h1>Crear cuenta</h1>${avisoSinPlataforma}`;
    return migas + `<h1>Crear cuenta</h1>
      <form class="formulario" id="form-registro" novalidate>
        ${campoForm("nombre", "Nombre", "text", "nickname", "(opcional, para saludarte)")}
        ${campoForm("correo", "Correo", "email", "email")}
        ${campoForm("contrasena", "Contraseña", "password", "new-password", "(10 caracteres o más)")}
        <p class="formulario-error" id="error-registro" role="alert" hidden></p>
        <p class="formulario-acciones"><button type="submit" class="boton-principal">Crear la cuenta</button></p>
      </form>
      <p class="nota-pie">Al crearla aceptas los <a href="#/legal/terminos">términos</a> y la
      <a href="#/legal/privacidad">política de privacidad</a>. Puedes borrar la cuenta y todos tus
      datos desde <a href="#/cuenta">tu cuenta</a>, cuando quieras y sin pedir permiso.</p>`;
  };

  vistas.recuperar = () => {
    const migas = `<div class="migas"><a href="#/">Inicio</a> › Recuperar</div>`;
    if (!hayPlataforma()) return migas + `<h1>Recuperar la contraseña</h1>${avisoSinPlataforma}`;
    return migas + `<h1>Recuperar la contraseña</h1>
      <form class="formulario" id="form-recuperar" novalidate>
        ${campoForm("correo", "Tu correo", "email", "email")}
        <p class="formulario-error" id="error-recuperar" role="alert" hidden></p>
        <p class="formulario-acciones"><button type="submit" class="boton-principal">Mandarme un enlace</button></p>
      </form>
      <p class="nota-pie">Si el correo está registrado, te llegará un enlace de un solo uso. Por
      seguridad la respuesta es la misma exista o no la cuenta.</p>`;
  };

  vistas.cuenta = () => {
    const migas = `<div class="migas"><a href="#/">Inicio</a> › Mi cuenta</div>`;
    if (!hayPlataforma()) return migas + `<h1>Mi cuenta</h1>${avisoSinPlataforma}`;
    if (!sesion) return migas + `<h1>Mi cuenta</h1>
      <div class="estado-sin-permiso"><p class="estado-titulo">Esta página es de tu cuenta</p><p>No has entrado. <a href="#/entrar">Entra</a> o <a href="#/registro">crea una cuenta</a>.</p></div>`;
    const r = resumenProgreso();
    return migas + `<h1>Mi cuenta</h1>
      <dl class="datos-cuenta">
        <dt>Correo</dt><dd>${esc(sesion.correo)}</dd>
        ${sesion.nombre ? `<dt>Nombre</dt><dd>${esc(sesion.nombre)}</dd>` : ""}
        <dt>Progreso en este navegador</dt><dd>${r.pct} % · ${r.vistos} de ${r.total} conceptos</dd>
      </dl>
      <p class="formulario-acciones">
        <button type="button" class="boton" id="sincronizar">Subir mi progreso a la cuenta</button>
        <button type="button" class="boton" id="traer">Bajar el de la cuenta aquí</button>
      </p>
      <p class="formulario-mensaje" id="mensaje-cuenta" role="status" hidden></p>
      ${hayCobro() ? `
      <h2>Tu pago</h2>
      <p>Cambiar de plan, ver las facturas o cancelar se hace en el portal de Stripe. Los datos de
      la tarjeta no pasan por aquí: los trata Stripe y este portal no los ve.</p>
      <p class="formulario-acciones"><button type="button" class="boton" id="portal-pago">Gestionar mi pago</button></p>` : ""}
      <h2>Tus datos</h2>
      <p>Puedes descargar todo lo que tenemos de ti en un fichero, o borrarlo. Sin correos, sin
      formularios y sin esperas.</p>
      <p class="formulario-acciones">
        <button type="button" class="boton" id="descargar-datos">Descargar mis datos</button>
        <button type="button" class="boton boton-peligro" id="borrar-cuenta">Borrar la cuenta y todo</button>
      </p>
      <p class="nota-pie">Borrar la cuenta no borra lo de este navegador: el progreso local se
      queda y puedes seguir estudiando sin cuenta.</p>
      <p class="formulario-acciones"><button type="button" class="boton" id="salir">Cerrar la sesión</button></p>`;
  };

  function conectarCuenta() {
    const di = (sel, texto, malo) => {
      const p = $(sel);
      if (!p) return;
      p.textContent = texto;
      p.hidden = false;
      p.classList.toggle("mal", !!malo);
    };
    const fallo = (err) => err.message === "sin-plataforma" ? "No hay servicio de cuentas conectado." : err.message;

    const fEntrar = $("#form-entrar");
    if (fEntrar) fEntrar.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        sesion = desenvuelve(await api("/api/acceso", { metodo: "POST", cuerpo: { correo: $("#correo").value.trim(), contrasena: $("#contrasena").value } }));
        pintarEnlaceCuenta(); location.hash = "#/cuenta";
      } catch (err) { di("#error-entrar", fallo(err), true); }
    });

    const fRegistro = $("#form-registro");
    if (fRegistro) fRegistro.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        sesion = desenvuelve(await api("/api/registro", { metodo: "POST", cuerpo: {
          correo: $("#correo").value.trim(), contrasena: $("#contrasena").value, nombre: $("#nombre").value.trim() || undefined } }));
        pintarEnlaceCuenta(); location.hash = "#/cuenta";
      } catch (err) { di("#error-registro", fallo(err), true); }
    });

    const fRecuperar = $("#form-recuperar");
    if (fRecuperar) fRecuperar.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/api/recuperar", { metodo: "POST", cuerpo: { correo: $("#correo").value.trim() } });
        di("#error-recuperar", "Si ese correo está registrado, te hemos mandado un enlace.");
      } catch (err) { di("#error-recuperar", fallo(err), true); }
    });

    // ── Sobre versionado del estado ──────────────────────────────────────
    // La transferencia anterior subía cinco campos de seis (se dejaba `intentos`) y bajaba
    // tres: dos equipos podían acabar con historial y nota distintos, que es justo lo que
    // «sincronizar» promete evitar. Ahora los seis viajan juntos, dentro de un sobre con
    // versión y revisión, y nada se aplica sin validar antes.
    const sobreDeEstado = () => ({
      version: 2,
      revision: Date.now(),
      estado: estadoGuardado(),
    });

    // Un sobre válido tiene los seis campos con el tipo que toca. Un `null`, un `{}` o un
    // texto pegado a mano no valen, y NUNCA deben sustituir lo que hay en el navegador.
    function estadoValido(e) {
      if (!e || typeof e !== "object" || Array.isArray(e)) return "no es un objeto";
      for (const [campo, tipo] of [["progreso", "object"], ["srs", "object"], ["pref", "object"], ["dias", "object"], ["intentos", "object"]]) {
        if (e[campo] !== undefined && (typeof e[campo] !== tipo || e[campo] === null)) return `«${campo}» no es un objeto`;
      }
      if (e.ultimo !== undefined && e.ultimo !== null && typeof e.ultimo !== "string") return "«ultimo» no es texto";
      return "";
    }

    const bSinc = $("#sincronizar");
    if (bSinc) bSinc.addEventListener("click", async () => {
      try {
        await api("/api/progreso", { metodo: "PUT", cuerpo: { datos: sobreDeEstado() } });
        di("#mensaje-cuenta", "Subido. Los seis bloques del progreso están en la cuenta, no cinco.");
      } catch (err) { di("#mensaje-cuenta", "No se ha podido subir: " + fallo(err), true); }
    });

    const bTraer = $("#traer");
    if (bTraer) bTraer.addEventListener("click", async () => {
      try {
        const d = await api("/api/progreso");
        const crudo = (d && (d.datos || d)) || {};
        // Admite el sobre nuevo y los datos antiguos sueltos: quien tenga algo subido con la
        // versión anterior no se queda fuera, pero pasa por la misma validación.
        const g = crudo.estado || crudo;
        const malo = estadoValido(g);
        if (malo) throw new Error("los datos de la cuenta no tienen la forma esperada (" + malo + ")");

        // Copia antes de sustituir: si alguien baja por error el progreso de otro equipo,
        // tiene que poder volver. Se guarda en una clave aparte, no encima de la buena.
        try {
          escribir("aprender.v1.copia-antes-de-bajar", { cuando: new Date().toISOString(), estado: estadoGuardado() });
        } catch { /* sin almacén: se sigue, pero no hay copia */ }

        // Memoria y almacenamiento a la vez, los seis campos. Si se cambiara solo la memoria,
        // la pantalla diría una cosa y el siguiente arranque otra.
        progreso = g.progreso || {};
        srs = g.srs || {};
        pref = { ...pref, ...(g.pref || {}) };
        dias = g.dias || {};
        ultimo = g.ultimo ?? null;
        intentos = g.intentos || {};
        escribir(CLAVES.progreso, progreso);
        escribir(CLAVES.srs, srs);
        escribir(CLAVES.pref, pref);
        escribir(CLAVES.dias, dias);
        escribir(CLAVES.ultimo, ultimo);
        escribir(CLAVES.intentos, intentos);

        actualizarLateral();
        di("#mensaje-cuenta", "Bajado y aplicado: progreso, repaso, preferencias, días, último e intentos.");
      } catch (err) { di("#mensaje-cuenta", "No se ha podido bajar: " + fallo(err), true); }
    });

    const bDatos = $("#descargar-datos");
    if (bDatos) bDatos.addEventListener("click", async () => {
      try {
        const d = await api("/api/datos");
        const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url; a.download = "mis-datos.json";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        di("#mensaje-cuenta", "Descargado.");
      } catch (err) { di("#mensaje-cuenta", "No se ha podido descargar: " + fallo(err), true); }
    });

    const bBorrar = $("#borrar-cuenta");
    if (bBorrar) bBorrar.addEventListener("click", async () => {
      if (!confirm("¿Seguro que quieres borrar la cuenta y todos tus datos? No se puede deshacer.")) return;
      try {
        await api("/api/cuenta", { metodo: "DELETE" });
        sesion = null; pintarEnlaceCuenta(); location.hash = "#/";
      } catch (err) { di("#mensaje-cuenta", "No se ha podido borrar: " + fallo(err), true); }
    });

    // Portal de facturación de Stripe. El servicio saca el correo de la sesión: aquí no se
    // manda ningún correo, solo la petición con la cookie.
    const bPortal = $("#portal-pago");
    if (bPortal) bPortal.addEventListener("click", async () => {
      const cobro = API_COBRO();
      if (!cobro) { di("#mensaje-cuenta", "El cobro no está conectado en este portal.", true); return; }
      bPortal.disabled = true;
      try {
        const r = await fetch(cobro.replace(/\/$/, "") + "/api/cobro/portal", { method: "POST", credentials: "include" });
        const d = await r.json().catch(() => null);
        if (d && d.url) { location.href = d.url; return; }
        di("#mensaje-cuenta", (d && (d.mensaje || d.error)) || "No se ha podido abrir el portal de pago.", !d || !d.modo);
      } catch (err) { di("#mensaje-cuenta", "No se ha podido abrir el portal de pago: " + err.message, true); }
      finally { bPortal.disabled = false; }
    });

    const bSalir = $("#salir");
    if (bSalir) bSalir.addEventListener("click", async () => {
      try { await api("/api/salida", { metodo: "POST" }); } catch { /* da igual */ }
      sesion = null; pintarEnlaceCuenta(); location.hash = "#/";
    });
  }

  // ── Consentimiento y analítica ─────────────────────────────────────────
  // Regla que no se salta: NO se mide nada antes de que la persona lo acepte. El cliente
  // de analítica ni se descarga hasta entonces, así que sin aceptar no hay ni una petición.
  // Y se puede retirar cuando quiera.
  // CLAVE DE COMPATIBILIDAD, no tocar: se llama «muestra» porque se guardó con el nombre anterior.
  // Cambiarla dejaría huérfano el consentimiento que la gente ya dio, y el portal volvería a pedirlo
  // o lo daría por no dado. La marca cambia; las claves guardadas, no.
  const CLAVE_CONSENT = "muestra.v1.consentimiento";

  const leerConsentimiento = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE_CONSENT) || "null"); } catch { return null; }
  };

  function guardarConsentimiento(analitica) {
    const c = { version: (window.CONSENTIMIENTO && window.CONSENTIMIENTO.version) || 1, analitica: !!analitica, ts: Date.now() };
    try { localStorage.setItem(CLAVE_CONSENT, JSON.stringify(c)); } catch { /* sin almacén */ }
    return c;
  }

  const hayAnalitica = () => !!((window.ACADEMIA && window.ACADEMIA.analitica) || "");

  // Avisa al cliente de analítica. Va sobre LA INSTANCIA, no sobre el módulo: `window.Analitica`
  // solo publica crear/obtener/reiniciar, y los métodos de verdad (conceptoAbierto,
  // seccionVista…) viven en lo que devuelve obtener(). Llamando al módulo no se enviaba nada
  // y no daba ningún error: se quedaba en silencio.
  function medir(que, ...args) {
    try {
      const a = window.__analitica;
      if (a && typeof a[que] === "function") a[que](...args);
    } catch { /* medir nunca rompe el portal */ }
  }

  function cargarAnalitica() {
    if (!hayAnalitica() || window.__analiticaLista) return;
    window.__analiticaLista = true;
    const s = document.createElement("script");
    s.src = "assets/analitica.js";
    s.onload = () => {
      try {
        // El cliente publica en la dirección que se le da TAL CUAL, sin añadirle nada: si
        // se le pasa la base, manda los sucesos a la raíz del servicio, falla y se apaga
        // solo. Por eso aquí se le da la dirección completa del endpoint (en config.js sigue
        // estando la base, que es lo que tiene sentido configurar).
        const base = (window.ACADEMIA.analitica || "").replace(/\/+$/, "");
        // `aceptado: true` NO es un adorno: el cliente no manda nada hasta que se le dice
        // explícitamente. Sin esto se carga, no falla, y no envía ni una petición.
        window.__analitica = window.Analitica.obtener({
          endpoint: base + "/api/analitica/suceso",
          aceptado: true,
          respetarNoSeguimiento: true,
        });
      } catch { /* el cliente no mide y lo dice por consola */ }
    };
    document.head.appendChild(s);
  }

  // El aviso solo aparece si hay algo que consentir: si el portal va sin analítica, no se
  // molesta a nadie con una ventana que no decide nada.
  function pintarAvisoCookies() {
    if (!hayAnalitica()) return;
    const version = (window.CONSENTIMIENTO && window.CONSENTIMIENTO.version) || 1;
    const c = leerConsentimiento();
    if (c && c.version === version) { if (c.analitica) cargarAnalitica(); return; }

    const cat = ((window.CONSENTIMIENTO && window.CONSENTIMIENTO.categorias) || []).find((x) => x.id === "analitica") || {};
    const aviso = document.createElement("div");
    aviso.className = "aviso-cookies";
    aviso.setAttribute("role", "dialog");
    aviso.setAttribute("aria-label", "Aviso sobre la medición");
    aviso.innerHTML = `
      <div class="aviso-cookies-texto">
        <p><strong>${esc(cat.titulo || "Medición agregada")}</strong></p>
        <p>${esc(cat.que_hace || "")}</p>
        <p class="nota-pie">${esc(cat.que_no_hace || "")} ${esc(cat.se_puede_revocar || "")}
        <a href="#/legal/cookies">Política de cookies</a> · <a href="#/datos">Qué datos se recogen</a></p>
      </div>
      <div class="aviso-cookies-botones">
        <button type="button" class="boton-principal" id="consentir-si">Aceptar la medición</button>
        <button type="button" class="boton" id="consentir-no">Solo lo necesario</button>
      </div>`;
    document.body.appendChild(aviso);
    $("#consentir-si").addEventListener("click", () => { guardarConsentimiento(true); aviso.remove(); cargarAnalitica(); });
    $("#consentir-no").addEventListener("click", () => { guardarConsentimiento(false); aviso.remove(); });
  }

  function conectarConsentimiento() {
    // Volver a preguntar: se borra la decisión guardada y el aviso sale otra vez. Son dos
    // sitios distintos (el enlace del pie y el botón del panel de lo que se mide) y los dos
    // tienen que funcionar: un botón que no hace nada es peor que no ponerlo.
    const volverAPreguntar = (e) => {
      if (e) e.preventDefault();
      try { localStorage.removeItem(CLAVE_CONSENT); } catch { /* da igual */ }
      location.reload();
    };
    // Decidir desde el panel: se guarda al momento y la página se repinta, sin recargar.
    const decidir = (valor) => {
      guardarConsentimiento(valor);
      if (valor) cargarAnalitica();
      const caja = $("#panel-analitica");
      if (caja) { caja.innerHTML = ""; pintarPanelAnalitica(); }
      const boton = $("#cambiar-consent");
      if (boton) {
        const aceptado = leerConsentimiento()?.analitica === true;
        boton.textContent = aceptado ? "Dejar de contar mi visita" : "Contar mi visita de forma agregada";
        const texto = boton.closest("p")?.previousElementSibling;
        if (texto) texto.textContent = aceptado
          ? "Has aceptado que se cuente tu visita de forma agregada. Puedes dejarlo sin efecto cuando quieras:"
          : "No has aceptado, así que tu visita no se cuenta. Si cambias de idea:";
      }
    };
    const a = $("#cambiar-consentimiento");
    if (a && hayAnalitica()) a.addEventListener("click", volverAPreguntar);
    else if (a) a.hidden = true;
    const b = $("#cambiar-consent");
    if (b) b.addEventListener("click", () => decidir((leerConsentimiento()?.analitica !== true)));
  }

  // ── Lo que se mide ─────────────────────────────────────────────────────
  // El panel ENSEÑA la medición en vez de esconderla: las mismas cifras que ve quien
  // mantiene el sitio, con lo que NO se guarda dicho al lado. Y no mide a nadie: pintar
  // esta página no envía ningún suceso, ni siquiera a quien ha aceptado.
  vistas.analitica = () => {
    const migas = `<div class="migas"><a href="#/">Inicio</a> › Lo que se mide</div>`;
    const servicio = (window.ACADEMIA && window.ACADEMIA.analitica) || "";
    const aceptado = leerConsentimiento()?.analitica === true;
    const cabeza = migas + `<h1>Lo que se mide</h1>
      <p class="entradilla">Esta página enseña lo mismo que ve quien mantiene el
      sitio. No hay una medición por detrás que no esté aquí.</p>`;
    if (!servicio) {
      return cabeza + `<aside class="aviso aviso-nota"><p class="aviso-titulo">No se mide nada</p>
        <div><p>Este portal no tiene ningún servicio de medición conectado. No hay cifras que
        enseñar porque no se recoge ninguna.</p></div></aside>`;
    }
    return cabeza + `<div id="panel-analitica"><p class="nota-pie">Cargando las cifras…</p></div>
      <h2>Lo que NO se guarda</h2>
      <p>Esto es una lista cerrada, y está comprobada en el código del servicio:</p>
      <ul class="lista-seca">
        <li>Direcciones IP. La única huella de red es el prefijo de red (/24 o /48), agregado por día, y se puede apagar del todo.</li>
        <li>El agente de usuario (el navegador y el sistema).</li>
        <li>Cookies, ni propias ni de terceros.</li>
        <li>Identificadores persistentes: nada que permita seguirte entre días.</li>
        <li>La URL completa desde la que vienes.</li>
        <li>La huella del dispositivo.</li>
      </ul>
      <h2>Tú decides</h2>
      <p>${aceptado
        ? "Has aceptado que se cuente tu visita de forma agregada. Puedes dejarlo sin efecto cuando quieras:"
        : "No has aceptado, así que tu visita no se cuenta. Si cambias de idea:"}</p>
      <p class="formulario-acciones">
        <button type="button" class="boton" id="cambiar-consent">${aceptado ? "Dejar de contar mi visita" : "Contar mi visita de forma agregada"}</button>
      </p>
      <p class="nota-pie">Las cifras se conservan <span id="dias-retencion">los días que diga el servicio</span> y luego se borran solas.</p>`;
  };

  // Pinta las cifras. Se llama SOLO al abrir esta página, y esa llamada no se mide: el
  // cliente de analítica no manda nada desde aquí.
  async function pintarPanelAnalitica() {
    const cont = $("#panel-analitica");
    if (!cont) return;
    const servicio = (window.ACADEMIA && window.ACADEMIA.analitica) || "";
    try {
      const r = await fetch(servicio.replace(/\/$/, "") + "/api/analitica/resumen?dias=30&top=10");
      if (!r.ok) throw new Error("el servicio de medición respondió " + r.status);
      const d = await r.json();
      const v = d.visitas || {}, c = d.conceptos || {}, e = d.ejercicios || {}, b = d.busquedas || {};
      const pct = (x) => (x === null || x === undefined ? "—" : Math.round(x * 100) + " %");
      const filas = (lista, clave, valor) => (lista || []).length
        ? `<table class="tabla"><thead><tr><th>${esc(clave)}</th><th>${esc(valor)}</th></tr></thead><tbody>${lista.map((x) => `<tr><td>${esc(x.nombre || x.id || x.ruta || "—")}</td><td class="num">${esc(String(x.n ?? x.total ?? x.aperturas ?? ""))}</td></tr>`).join("")}</tbody></table>`
        : `<p class="vacio">Sin datos en este periodo.</p>`;
      cont.innerHTML = `
        <p class="nota-pie">Del ${esc(d.periodo?.desde || "?")} al ${esc(d.periodo?.hasta || "?")} · ${esc(d.periodo?.zona || "UTC")} · generado el ${esc(String(d.generado || "").slice(0, 10))}</p>
        <div class="rejilla-cifras">
          <p><span class="cifra-grande">${esc(String(v.total ?? 0))}</span><span class="cifra-pie">visitas contadas</span></p>
          <p><span class="cifra-grande">${esc(String(c.totalAperturas ?? 0))}</span><span class="cifra-pie">fichas abiertas</span></p>
          <p><span class="cifra-grande">${esc(String(Math.round((c.tiempoTotalSegundos || 0) / 60)))}</span><span class="cifra-pie">minutos de lectura</span></p>
          <p><span class="cifra-grande">${esc(pct(e.tasaAcierto))}</span><span class="cifra-pie">aciertos en los ejercicios</span></p>
          <p><span class="cifra-grande">${esc(String(v.redesDistintas ?? 0))}</span><span class="cifra-pie">redes distintas (prefijo, por día)</span></p>
          <p><span class="cifra-grande">${esc(pct(b.tasaSinResultado))}</span><span class="cifra-pie">búsquedas sin resultado</span></p>
        </div>
        <p class="nota-pie">${esc(d.aviso || "")} Se conservan <strong>${esc(String(d.retencionDias ?? "?"))} días</strong> y luego se borran solas.</p>
        <h2>Las fichas más abiertas</h2>
        ${filas(c.top, "Ficha", "Aperturas")}
        <h2>Búsquedas que no encontraron nada</h2>
        <p class="nota-pie">Sirve para saber qué falta en el temario. Se guarda el texto buscado, sin quién lo buscó.</p>
        ${filas(b.topSinResultado, "Búsqueda", "Veces")}
        <h2>Ejercicios que más se fallan</h2>
        ${filas(e.porConcepto, "Ficha", "Fallos")}`;
    } catch (err) {
      cont.innerHTML = `<aside class="aviso aviso-nota"><p class="aviso-titulo">No se han podido cargar las cifras</p>
        <div><p>${esc(err.message)}. El servicio de medición no está disponible ahora mismo; el portal
        funciona igual y no se está midiendo nada.</p></div></aside>`;
    }
  }
  // ── Precios ────────────────────────────────────────────────────────────
  // La tabla sale de plataforma/cobro/planes.json, el mismo fichero que usa el servicio de
  // cobro. Y la regla se dice en la propia página, no en la letra pequeña: EL CONTENIDO ES
  // EL MISMO EN LOS TRES PLANES. Se paga por apoyar y por tener cuenta con el progreso
  // sincronizado, no por desbloquear lecciones.
  vistas.precios = () => {
    const migas = `<div class="migas"><a href="#/">Inicio</a> › Precios</div>`;
    const p = window.PLANES;
    if (!p || !p.planes) return migas + `<h1>Precios</h1>${avisoSinPlataforma}`;
    const total = Object.keys(P.conceptos).length;
    const tarjetas = p.planes.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((pl) => `
      <article class="plan${pl.id === "apoyo" ? " plan-destacado" : ""}">
        <h2>${esc(pl.nombre)}</h2>
        <p class="plan-precio">${esc(pl.precio_texto)}${pl.precio_por ? ` <span class="plan-periodo">${esc(pl.precio_por)}</span>` : ""}</p>
        <p class="plan-etiqueta">${esc(pl.etiqueta || "")}</p>
        <ul class="plan-incluye">${(Array.isArray(pl.incluye) ? pl.incluye : String(pl.incluye || "").split(/\s{2,}|\n/)).filter((x) => String(x).trim()).map((x) => `<li>${esc(String(x).trim())}</li>`).join("")}</ul>
        <p class="nota-pie">${esc(pl.para_quien || "")}</p>
        ${pl.es_pago
          ? `<button type="button" class="boton-principal" data-plan="${esc(pl.id)}">Apoyar con ${esc(pl.precio_texto)}</button>`
          : `<a class="boton" href="#/">Empezar ahora</a>`}
      </article>`).join("");

    return migas + `<h1>Precios</h1>
      <p class="entradilla">El portal entero está abierto. Se paga, si quieres, por apoyarlo y por
      tener cuenta con el progreso sincronizado entre dispositivos.</p>
      <aside class="aviso aviso-nota">
        <p class="aviso-titulo">Lo mismo en los tres planes</p>
        <div><p>Las ${total} fichas, las figuras, los ejercicios y el repaso espaciado están
        disponibles <strong>sin pagar y sin cuenta</strong>. No hay lecciones bloqueadas, ni versión
        reducida, ni prueba de siete días, ni nada que se desbloquee al pagar: lo que añade el plan
        de pago es la cuenta y la sincronización, nada más.</p></div>
      </aside>
      <div class="planes">${tarjetas}</div>
      <p class="formulario-mensaje" id="mensaje-plan" role="status" hidden></p>
      <h2>Preguntas que conviene responder antes</h2>
      <dl class="preguntas-frecuentes">
        <dt>¿Qué pasa si dejo de pagar?</dt>
        <dd>Que la cuenta vuelve al plan gratis y el progreso se queda donde estaba: no se pierde
        nada de lo estudiado y el portal sigue entero.</dd>
        <dt>¿Puedo llevarme mis datos?</dt>
        <dd>Sí, cuando quieras y sin pedir permiso. Desde <a href="#/cuenta">tu cuenta</a> los
        descargas en un fichero, y desde ahí mismo borras la cuenta y todo lo que hay en ella.</dd>
        <dt>¿Se guardan mis datos de tarjeta?</dt>
        <dd>No. Los trata Stripe; este servicio no ve ni guarda el número de la tarjeta. Solo recibe
        un identificador de cliente y si el pago está al día, y está contado con detalle en
        <a href="#/datos">qué datos se recogen</a>.</dd>
        <dt>¿Hay factura?</dt>
        <dd>Stripe la emite y te la manda por correo. Para factura a nombre de una empresa se cambian
        los datos fiscales en su portal de facturación.</dd>
      </dl>`;
  };

  // El botón de apoyo abre la pasarela de pago. La sesión la crea el servicio de cobro, que es
  // el único que habla con Stripe: aquí no hay ninguna clave ni se ve ningún dato de tarjeta.
  function conectarPrecios() {
    const m = $("#mensaje-plan");
    const di = (texto, malo) => { if (m) { m.textContent = texto; m.hidden = false; m.classList.toggle("mal", !!malo); } };
    for (const b of $$("[data-plan]")) {
      b.addEventListener("click", async () => {
        const cobro = (window.ACADEMIA && window.ACADEMIA.cobro) || "";
        if (!cobro) { di("El cobro todavía no está conectado en este portal.", true); return; }
        try {
          const r = await fetch(cobro.replace(/\/$/, "") + "/api/cobro/sesion", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: b.dataset.plan }),
          });
          const d = await r.json().catch(() => null);
          if (!r.ok || !d || !d.url) throw new Error((d && (d.error || d.mensaje)) || "no se ha podido abrir el pago");
          location.href = d.url;
        } catch (err) { di("No se ha podido abrir el pago: " + err.message, true); }
      });
    }
  }

  // T20 · Los oyentes globales del cuerpo de render() se acumulaban: +4 submit y +12 click por repintado.
// Retirarlos en bloque NO vale: no todos se registran en todas las pasadas (keydown solo al arrancar, el
// submit de dudas solo al pintar dudas), asi que se perdian oyentes y los botones quedaban muertos.
// La clave de cada sitio es el TEXTO de su propio manejador: identico entre pasadas, distinto por sitio.
// Asi se sustituye exactamente el anterior de ESE sitio y no se toca el de ninguno mas.
const OYENTES_POR_CLAVE = new Map();
const alDocumento = (tipo, fn, opciones) => {
  const clave = tipo + "|" + fn.toString();
  const previo = OYENTES_POR_CLAVE.get(clave);
  if (previo) { try { document.removeEventListener(previo[0], previo[1], previo[2]); } catch (e) { /* nada */ } }
  document.addEventListener(tipo, fn, opciones);
  OYENTES_POR_CLAVE.set(clave, [tipo, fn, opciones]);
};
// ── Usabilidad 2026-11-09 · navegación activa, progreso de lectura y buscador de portada ──
/** Marca la sección actual en la cabecera y en la barra inferior (aria-current). */
function marcarNavegacion(vista) {
  const mapa = {
    pendientes: ["#/pendientes"], plan: ["#/plan"], fase: ["#/plan"], ruta: ["#/plan"],
    proyectos: ["#/proyectos"], aprender: ["#/aprender"], ayuda: ["#/ayuda"], glosario: ["#/glosario"],
    progreso: ["#/progreso"], repaso: ["#/repaso"], buscar: ["#/buscar"],
  };
  const activos = mapa[vista] || [];
  $$("#barra-superior .barra-nav a, #barra-inferior a").forEach((a) => {
    a.removeAttribute("aria-current");
    const href = (a.getAttribute("href") || "").split("?")[0];
    if (activos.includes(href)) a.setAttribute("aria-current", "page");
  });
}

/** Barra de progreso de lectura y botón «Volver arriba» en fichas, fases y rutas. */
let quitarProgresoLector = null;
function montarProgresoLectura(vista) {
  const barraAnterior = document.getElementById("progreso-lectura");
  if (barraAnterior) barraAnterior.remove();
  const botonAnterior = document.getElementById("volver-arriba");
  if (botonAnterior) botonAnterior.remove();
  if (quitarProgresoLector) { quitarProgresoLector(); quitarProgresoLector = null; }
  if (!["concepto", "fase", "ruta"].includes(vista)) return;
  const barra = document.createElement("div");
  barra.id = "progreso-lectura";
  barra.setAttribute("aria-hidden", "true");
  document.body.appendChild(barra);
  // Volver arriba: aparece al pasar pantalla y media, y no tapa la barra inferior en móvil.
  const volver = document.createElement("button");
  volver.type = "button";
  volver.id = "volver-arriba";
  volver.className = "boton";
  volver.setAttribute("aria-label", "Volver arriba");
  volver.textContent = "↑ Arriba";
  volver.hidden = true;
  volver.addEventListener("click", () => {
    // El CSS del portal usa scroll-behavior: smooth; para «volver arriba» se desactiva un
    // instante para que sea inmediato y no tarde en recorrer 20.000 px de artículo.
    // Asignar scrollTop es instantáneo aunque el CSS tenga scroll-behavior: smooth.
    const raiz = document.scrollingElement || document.documentElement;
    raiz.scrollTop = 0;
    if (window.scrollY !== 0) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  });
  document.body.appendChild(volver);
  const actualizar = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    barra.style.width = max > 0 ? Math.min(100, (window.scrollY / max) * 100) + "%" : "0%";
    volver.hidden = window.scrollY <= window.innerHeight * 1.5;
  };
  window.addEventListener("scroll", actualizar, { passive: true });
  window.addEventListener("resize", actualizar);
  quitarProgresoLector = () => {
    window.removeEventListener("scroll", actualizar);
    window.removeEventListener("resize", actualizar);
    volver.remove();
  };
  actualizar();
}

/** El buscador de la portada lleva a la biblioteca con la consulta puesta. */
function conectarPortada() {
  const form = document.getElementById("portada-buscar-form");
  if (!form) return;
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const campo = document.getElementById("portada-buscar-campo");
    const consulta = (campo && typeof campo.value === "string" ? campo.value : "").trim();
    location.hash = enlaceBusqueda(consulta);
  });
}

async function render() {
    const inicioRender = performance.now();
    // Las páginas legales se cargan ANTES de decidir la ruta: si se decide primero, la
    // ruta no encuentra window.LEGAL, cae en el inicio y pinta la portada (medido: pasaba
    // en la primera visita a #/legal/privacidad).
    if (/^#\/(legal|datos)\b/.test(location.hash)) await cargarLegal();
    // La política de evaluación se carga antes del primer render por el mismo motivo que los
    // textos legales, y por uno propio: `#/fase/<id>` pinta sus criterios de cierre y
    // `#/progreso` la nota. Cargarla dentro de una de las dos vistas dejaría a la otra pintando
    // con los pesos de respaldo, y entonces las dos dirían cifras distintas de lo mismo.
    await cargarEvaluacion();
    const { vista, arg } = rutaActual();
    const principal = $("#principal");
    let disponibilidadBiblioteca = null;
    try {
      if (vista === "buscar" && partesDeBusqueda(arg).solo === "descargado") {
        const destino = location.hash;
        principal.setAttribute("aria-busy", "true");
        $$("#buscador input, #buscador button", principal).forEach(campo => { campo.disabled = true; });
        const mapa = window.Offline ? await Offline.inventario(true) : null;
        const ids = Object.keys(CATALOGO);
        const estados = mapa === null ? [] : await Promise.all(ids.map(id => Offline.estado(id, mapa)));
        if (location.hash !== destino) return;
        disponibilidadBiblioteca = { legible: mapa !== null, completos: new Set(ids.filter((id, i) => estados[i]?.estado === "completo")) };
      }
      if (vista === "concepto") {
        const c = P.conceptos[arg];
        if (c) await cargarFase(c.fid);
      }
      // La sesion de repaso necesita el contenido de las fichas de su cola ANTES de montarse. Se
      // pide por adelantado y no dentro del motor porque alli ya se esta pintando: cargar a media
      // pintura dejaria la sesion vacia, que es exactamente el fallo que esto arregla. La cola se
      // compone aqui, una sola vez, y la leen la vista y la sesion.
      if (vista === "repaso") {
        componerColaRepaso();
        // El contenido se carga DESPUES de saber la cola, y con la cola delante: es lo que hace
        // falta para pintar los enunciados, no para decidir que preguntas tocan.
        await cargarFasesDe(colaRepaso.map((k) => k.split("#")[0]));
      }
      
  // ── Itinerarios de la ruta (T14) ──────────────────────────────────────────
  // Se pintan al final de la vista de ruta. Cada itinerario enseña qué promete, por dónde va
  // (con enlace a cada ficha, y solo si la ficha existe) y qué se entrega al terminarlo.
  function bloqueItinerarios(clave) {
    const todos = Array.isArray(window.ITINERARIOS) ? window.ITINERARIOS : [];
    const mios = todos.filter((it) => it && it.ruta === clave);
    if (!mios.length) return "";
    // T15 · El orden de los itinerarios depende de la experiencia: quien empieza ve primero el
    // de entrada; quien ya trabaja con esto, el de profundización. Es una recomendación, no una
    // barrera: los dos siguen ahí.
    const quiereProfundizar = experiencia() === "trabajo";
    const ordenados = [...mios].sort((a, b) => {
      const pa = /profunda/.test(String(a.id)) ? 1 : 0;
      const pb = /profunda/.test(String(b.id)) ? 1 : 0;
      return quiereProfundizar ? pb - pa : pa - pb;
    });
    const items = ordenados.map((it) => {
      // Referencias REALES: un concepto que no esté publicado no se enlaza, no se pinta roto.
      const pasos = (it.conceptos || []).filter((c) => P.conceptos[c]).map((c) => `<li><a href="#/c/${esc(c)}">${esc(P.conceptos[c].t || c)}</a></li>`).join("");
      const p = it.proyecto || {};
      return `<li class="itinerario" id="it-${esc(it.id)}">
        <h3>${esc(it.titulo || it.id)}</h3>
        <p><strong>Al terminarlo sabrás:</strong> ${esc(it.resultado || "")}</p>
        <details><summary>${(it.conceptos || []).length} pasos, en orden</summary><ol>${pasos}</ol></details>
        <p><strong>Proyecto:</strong> ${esc(p.titulo || "")}. <span class="nota-pie">${esc(p.entregable || "")}</span></p>
      </li>`;
    }).join("");
    return `<section class="itinerarios" id="itinerarios-ruta" aria-labelledby="itinerarios-titulo">
      <h2 id="itinerarios-titulo">Itinerarios de esta ruta</h2>
      <ul class="lista-itinerarios">${items}</ul>
    </section>`;
  }
  // La envoltura: se añade al final de la vista de ruta sin tocar su plantilla.
  if (typeof vistas.ruta === "function" && !vistas.ruta.__conItinerarios) {
    const rutaBase = vistas.ruta;
    // T16 · Los itinerarios van ANTES de la lista de conceptos, no detrás. En la ruta «de» la
    // lista tiene 155 fichas: puestos al final, el itinerario —que es lo que dice por dónde
    // empezar y qué se entrega— quedaba fuera de la primera pantalla y de la segunda. Si por lo
    // que sea no se encontrara la lista, se añaden al final antes que perderlos.
    vistas.ruta = (clave) => {
      const base = rutaBase(clave);
      const bloque = bloqueItinerarios(clave);
      if (!bloque) return base;
      const anclaLista = '<ul class="lista-conceptos">';
      return base.includes(anclaLista) ? base.replace(anclaLista, bloque + anclaLista) : base + bloque;
    };
    vistas.ruta.__conItinerarios = true;
  }

    // T18 · El desglose se engancha AQUÍ y no donde está definido: en aquel punto `vistas.plan` aún
  // no existe, y la guarda `typeof vistas.plan === "function"` lo saltaba EN SILENCIO. Aquí ya
  // están todas las vistas cargadas.
  if (typeof vistas.plan === "function" && !vistas.plan.__conDesglose) {
    const planBase = vistas.plan;
    vistas.plan = () => planBase() + bloqueDesglose();
    vistas.plan.__conDesglose = true;
  }    // ── Sesión con preguntas reales (T20) ─────────────────────────────────────
  // Redefine la vista de sesión para que pinte el enunciado de verdad. El estado sigue viviendo en
  // el borrador (por perfil y con copia), así que cerrar y abrir recupera posición y respuestas.
  vistas.sesion = () => {
    if (typeof Sesion === "undefined") return estadoNoDisponible();
    const estado = estadoDeLaSesion();
    const r = Sesion.resumen(estado, modoSesion());
    if (!r.planificadas) {
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>
        ${recuperacionSesionHtml()}
        <p>No hay preguntas que ofrecer con la ruta actual. <a href="#/orientacion">Cambia de ruta</a> o <a href="#/buscar">busca un concepto</a>.</p>`;
    }

    const cuenta = `<p class="acciones-fila">
        <span class="pastilla" id="sesion-cuenta">hechas ${r.completadas} · omitidas ${r.omitidas} · plan ${r.planificadas}${r.entregadas ? ` · ${r.entregadas} ${r.entregadas === 1 ? "entregada" : "entregadas"}` : ""}${r.sinEntregar ? ` · ${r.sinEntregar} sin entregar` : ""}${r.correctas ? ` · ${r.correctas} ${r.correctas === 1 ? "correcta" : "correctas"}` : ""}${r.incorrectas ? ` · ${r.incorrectas} ${r.incorrectas === 1 ? "fallada" : "falladas"}` : ""}</span>
        <a class="boton" href="#/plan">Cambiar el tiempo</a>
      </p>`;

    if (r.terminada) {
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${cuenta}
        <section class="sesion-final" id="sesion-final">
          <h2>Sesión terminada</h2>
          ${(() => {
            if (typeof Pistas === "undefined" || !Pistas.cobertura) return "";
            const totalPreguntas = orden.reduce((s, c) => s + (Number((P.conceptos[c.id] || {}).q) || 0), 0);
            const cob = Pistas.cobertura(intentos, totalPreguntas);
            const muestra = Pistas.muestraParaRevision(intentos, 5);
            return `<p class="nota-pie" id="sesion-cobertura">Cobertura del temario: <strong>${cob.usadas}</strong> de ${cob.total} preguntas usadas (${Math.round(cob.proporcion * 100)} %).</p>
              ${muestra.length ? `<details class="repaso-muestra" id="sesion-muestra"><summary>Qué conviene repasar (${muestra.length})</summary>
                <ul>${muestra.map((x) => `<li>${esc(x.clave)} — ${x.fallos} fallo${x.fallos === 1 ? "" : "s"} de ${x.intentos} intento${x.intentos === 1 ? "" : "s"}</li>`).join("")}</ul>
              </details>` : ""}`;
          })()}
          <p><strong>${r.completadas}</strong> respondidas de ${r.planificadas} previstas${r.omitidas ? `, ${r.omitidas} omitidas` : ""}. Lo que cuenta es lo que has hecho, no lo que estaba previsto.</p>
          <p class="acciones-fila"><a class="boton activo" href="#/sesion?nueva=1">Empezar otra</a> <a class="boton" href="#/">Volver</a></p>
        </section>`;
    }

    const it = estado.items[estado.posicion];
    const meta = it ? P.conceptos[it.concepto] || {} : null;
    const ya = Sesion.respuestaActual(estado);

    // La fase tiene que estar cargada para poder enseñar el enunciado.
    const contenido = it ? contenidoDe(it.concepto) : null;
    if (!contenido) {
      cargarFase(meta && meta.fid ? meta.fid : "f00").then(() => render()).catch(() => {
        const caja = $("#sesion-pregunta");
        if (caja) caja.innerHTML = '<p role="alert">No se ha podido cargar el enunciado. Puedes <a href="#/sesion">reintentar</a> o <a href="#/">salir</a> sin que cuente nada.</p>';
      });
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${cuenta}
        <p id="sesion-pregunta" class="nota-pie">Cargando el enunciado…</p>`;
    }

    const q = (contenido.quizzes || [])[it.indice];
    if (!q) {
      // Si la pregunta no existe en el contenido, se ofrece saltar SIN contar respuesta.
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${cuenta}
        <p role="alert">Esta pregunta no está en el contenido publicado. Puedes saltarla sin que cuente.</p>
        <p class="acciones-fila"><button type="button" class="boton" data-sesion-omitir="1">Saltar</button></p>`;
    }

    const total = Array.isArray(q.o) ? q.o.length : 0;
    const opciones = (q.o || []).map((texto, k) => {
      const n = k + 1;
      const reintento = (estado.reintentos || {})[it.clave] || {};
          const marcada = ya ? ya.elegida === n : reintento.ultima === n;
      const esCorrecta = n === q.a;
      let clase = "opcion";
      // Corrección en el acto: si ya está respondida, se ve cuál era la buena y cuál se eligió.
      if (ya) { if (esCorrecta) clase += " correcta"; else if (marcada) clase += " incorrecta"; }
      return `<li><button type="button" class="${clase}" data-sesion-opcion="${n}" data-opciones="${total}" data-correcta="${q.a}"${ya ? " disabled" : ""}${marcada ? ' aria-pressed="true"' : ""}>${esc(texto)}</button></li>`;
    }).join("");

    const diferida = modoSesion() === "diferida" && !estado.entregada;
    const entregables = Sesion.pendientesDeEntregar(estado);
    const correccion = diferida
      ? `<div class="sesion-diferida" id="sesion-diferida">
          <p class="nota-pie">${ya ? "Respuesta guardada." : "Elige una opción."} En modo diferido no se corrige hasta entregar.</p>
          <p class="acciones-fila">
            ${ya ? '<button type="button" class="boton" data-sesion-siguiente="1">Siguiente</button>' : ""}
            <button type="button" class="boton activo" data-sesion-entregar="1">Entregar${entregables.length ? " (" + entregables.length + ")" : ""}</button>
            <a class="boton" href="#/">Salir (se guarda)</a>
          </p>
        </div>`
      : ya
      ? `<div class="sesion-correccion" id="sesion-correccion" role="status">
          <p><strong>${ya.elegida === q.a ? "Correcto." : "No era esa."}</strong> ${esc(q.e || "")}</p>
          <p class="acciones-fila">
            <button type="button" class="boton activo" data-sesion-siguiente="1">Siguiente</button>
            <a class="boton" href="#/c/${esc(it.concepto)}">Ver la ficha entera</a>
          </p>
        </div>`
      : `<p class="acciones-fila">
          <button type="button" class="boton" data-sesion-omitir="1">Omitir esta</button>
          <a class="boton" href="#/c/${esc(it.concepto)}">Leer la ficha</a>
          <a class="boton" href="#/">Salir (se guarda)</a>
        </p>`;

    return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
      <h1>Sesión de estudio</h1>
      ${cuenta}
      <section class="sesion-paso" id="sesion-paso">
        <p class="nota-pie">Pregunta ${estado.posicion + 1} de ${r.planificadas} · ${esc(meta && meta.t ? meta.t : it.concepto)}</p>
        <h2>${esc(q.p || "")}</h2>
        <ol class="quiz-opciones" id="sesion-opciones">${opciones}</ol>
        ${correccion}
      </section>`;
  };

    // T24 · Borrar y exportar notas, por delegación.
  alDocumento("click", (ev) => {
    const borrar = ev.target && ev.target.closest ? ev.target.closest("[data-borrar-nota]") : null;
    if (borrar) {
      const idNota = borrar.dataset.borrarNota;
      if (idNota && notas[idNota] !== undefined) {
        delete notas[idNota];
        escribir("aprender.v1.notas", notas);
        render();
      }
      return;
    }
    const md = ev.target && ev.target.closest ? ev.target.closest("#exportar-notas-md") : null;
    if (md) { descargar(MARCA_ARCHIVO + "-notas.md", exportarNotasMarkdown(), "text/markdown;charset=utf-8"); return; }
    const js = ev.target && ev.target.closest ? ev.target.closest("#exportar-notas-json") : null;
    if (js) {
      descargar(MARCA_ARCHIVO + "-notas.json", JSON.stringify({ generado: new Date().toISOString(), notas: notasVivas() }, null, 1), "application/json");
      return;
    }
  });

    // T25 · Ciclo de vida de las dudas, por delegación.
  // T20 · Este oyente vive dentro de render() y se registraba en CADA repintado: diez
  // repintados hacian que un solo envio creara doce dudas. Se instala una sola vez.
  if (!globalThis.__oyentesGlobales) {
    globalThis.__oyentesGlobales = Object.create(null);
  }
  if (!globalThis.__oyentesGlobales.dudas) {
    globalThis.__oyentesGlobales.dudas = true;
  alDocumento("submit", (ev) => {
    const form = ev.target;
    if (!form) return;
    // El formulario de nueva duda tiene id; el de resolver se identifica por su atributo. Exigir id
    // descartaba el de resolver, que no lo tiene, y por eso no resolvía nada.
    if (form.id === "nueva-duda") {
      ev.preventDefault();
      const texto = (form.querySelector("[data-duda-nueva]") || {}).value || "";
      const buscado = (form.querySelector("[data-duda-concepto]") || {}).value || "";
      let concepto = null;
      if (buscado.trim() && window.BUSQUEDA) {
        const hallados = buscar(buscado);
        concepto = (hallados && hallados[0] && (hallados[0].id || hallados[0][0])) || null;
      } else if (buscado.trim()) {
        const c = orden.find((x) => (P.conceptos[x.id].t || "").toLowerCase().includes(buscado.toLowerCase()));
        concepto = c ? c.id : null;
      }
      // T56 · Una duda vacia debe AVISAR. Antes se llamaba a crearDuda, devolvia falso y no pasaba NADA:
    // ni mensaje, ni campo marcado, ni una pista de por que no se guardo.
    const avisoD = form.querySelector("#duda-aviso");
    const campoD = form.querySelector("[data-duda-nueva]");
    if (!String(texto).trim()) {
      if (avisoD) { avisoD.textContent = "Escribe la duda antes de guardarla."; avisoD.setAttribute("role", "alert"); avisoD.setAttribute("data-duda-aviso-error", "1"); }
      if (campoD) { campoD.setAttribute("aria-invalid", "true"); if (avisoD && avisoD.id) campoD.setAttribute("aria-describedby", avisoD.id); try { campoD.focus(); } catch (e) { /* sin foco */ } }
      return;
    }
    if (avisoD) { avisoD.textContent = ""; avisoD.setAttribute("role", "status"); avisoD.removeAttribute("data-duda-aviso-error"); }
    if (campoD) { campoD.removeAttribute("aria-invalid"); campoD.removeAttribute("aria-describedby"); }
    const id = "d" + ahoraMs().toString(36) + Math.random().toString(36).slice(2, 6);
      if (crearDuda(id, texto, concepto, "")) render();
      return;
    }
    const resolver = form.getAttribute("data-duda-resolver-form");
    if (resolver) {
      ev.preventDefault();
      const exp = (form.querySelector("[data-duda-explicacion]") || {}).value || "";
      if (resolverDuda(resolver, exp)) render();
    }
  });
  }

  alDocumento("click", (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target : null;
    if (!t2) return;
    const borrar = t2.closest("[data-duda-borrar]");
    if (borrar) { if (borrarDuda(borrar.dataset.dudaBorrar)) render(); return; }
    const restaurar = t2.closest("[data-duda-restaurar]");
    if (restaurar) { if (restaurarDuda(restaurar.dataset.dudaRestaurar)) render(); return; }
    const reabrir = t2.closest("[data-duda-reabrir]");
    if (reabrir) { if (reabrirDuda(reabrir.dataset.dudaReabrir)) render(); return; }
  });

  // ── Sesión con tipos escritos (T26) ─────────────────────────────────────────
  // Esta definición TAPA la anterior: se declara después y se asigna a la misma propiedad.
  vistas.sesion = () => {
    if (typeof Sesion === "undefined") return estadoNoDisponible();
    const estado = estadoDeLaSesion();
    const r = Sesion.resumen(estado, modoSesion());
    // T20 · La AGENDA manda: si lo siguiente es práctica, se ofrece práctica y se declara cómo salió.
    // Antes se saltaba directo a las preguntas y la práctica del plan no se ejecutaba nunca.
    if (typeof Agenda !== "undefined" && estado.agenda) {
      const act = Agenda.siguiente(estado.agenda);
      if (act && act.tipo === "read") {
        // Posponer conserva el pendiente y lo deja visible: no se marca leída desde aquí.
        return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
          <h1>Sesión de estudio</h1>
          ${recuperacionSesionHtml()}
          ${planDeHoyHtml()}
          ${lecturaSesionHtml(act)}
          ${tiempoAgotadoHtml()}
          <p class="acciones-fila"><button type="button" class="boton" data-agenda-posponer="read" data-actividad="${esc(act.id)}">Posponer la lectura</button></p>`;
      }
      if (act && act.tipo === "practice") {
        return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
          <h1>Sesión de estudio</h1>
          ${recuperacionSesionHtml()}${planDeHoyHtml()}
          ${lecturaSesionHtml(act)}
          ${tiempoAgotadoHtml()}
          ${practicaSesionHtml(act)}`;
      }
    }
    if (!r.planificadas) {
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${recuperacionSesionHtml()}${planDeHoyHtml()}${lecturaSesionHtml()}
        <p id="sesion-sin-preguntas">Este plan no incluye preguntas. Puedes abrir sus actividades desde la lista o elegir otro tiempo.</p>
        <p><a class="boton" href="#/">Pausar y volver a Hoy</a></p>`;
    }

    const diferidaPendiente = modoSesion() === "diferida" && !estado.entregada;
    const hayRespuestas = Object.keys(estado.respuestas || {}).length > 0;
    const cuenta = recuperacionSesionHtml() + planDeHoyHtml() + lecturaSesionHtml() + tiempoAgotadoHtml() + `<p class="sesion-config"><label for="sesion-modo">Corrección</label>
        <select id="sesion-modo"${hayRespuestas ? " disabled" : ""}>
          <option value="inmediata"${modoSesion() === "inmediata" ? " selected" : ""}>Después de cada respuesta</option>
          <option value="diferida"${modoSesion() === "diferida" ? " selected" : ""}>Al entregar la sesión</option>
          <option value="interactiva"${modoSesion() === "interactiva" ? " selected" : ""}>Con pistas y reintentos</option>
        </select>${hayRespuestas ? '<span class="nota-pie">El modo se conserva hasta terminar esta sesión.</span>' : ""}</p>
      <p class="acciones-fila">
        <span class="pastilla" id="sesion-cuenta">hechas ${r.completadas} · omitidas ${r.omitidas} · plan ${r.planificadas}${r.entregadas ? ` · ${r.entregadas} ${r.entregadas === 1 ? "entregada" : "entregadas"}` : ""}${r.sinEntregar ? ` · ${r.sinEntregar} sin entregar` : ""}${r.correctas ? ` · ${r.correctas} ${r.correctas === 1 ? "correcta" : "correctas"}` : ""}${r.incorrectas ? ` · ${r.incorrectas} ${r.incorrectas === 1 ? "fallada" : "falladas"}` : ""}</span>
        <a class="boton" href="#/plan">Cambiar el tiempo</a>
      </p>`;

    // La vista decide con el ESTADO, no solo con `resumen`: si la posición llegó al final o el estado
    // dice terminada, se enseña el resumen. Sin esto, la pantalla podía quedarse en «Pregunta 1 de N»
    // con el estado ya terminado.
    const totalItems = Array.isArray(estado.items) ? estado.items.length : 0;
    const terminadaDeVerdad = r.terminada === true || estado.terminada === true ||
      (Number.isInteger(estado.posicion) && totalItems > 0 && estado.posicion >= totalItems);
    const pendientesAgenda = estado.agenda && typeof Agenda !== "undefined" ? Agenda.resumen(estado.agenda).pendientes : 0;
    if (terminadaDeVerdad) {

      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${cuenta}
        <section class="sesion-final" id="sesion-final">
          ${resumenPorTipoHtml(estado)}${categoriasHtml(estado, r)}
          <h2>${diferidaPendiente && hayRespuestas ? "Respuestas pendientes de entregar" : pendientesAgenda ? "Sesión cerrada con actividades pendientes" : "Sesión terminada"}</h2>
          ${(() => {
            if (typeof Pistas === "undefined" || !Pistas.cobertura) return "";
            const totalPreguntas = orden.reduce((s, c) => s + (Number((P.conceptos[c.id] || {}).q) || 0), 0);
            const cob = Pistas.cobertura(intentos, totalPreguntas);
            const muestra = Pistas.muestraParaRevision(intentos, 5);
            return `<p class="nota-pie" id="sesion-cobertura">Cobertura del temario: <strong>${cob.usadas}</strong> de ${cob.total} preguntas usadas (${Math.round(cob.proporcion * 100)} %).</p>
              ${muestra.length ? `<details class="repaso-muestra" id="sesion-muestra"><summary>Qué conviene repasar (${muestra.length})</summary>
                <ul>${muestra.map((x) => `<li>${esc(x.clave)} — ${x.fallos} fallo${x.fallos === 1 ? "" : "s"} de ${x.intentos} intento${x.intentos === 1 ? "" : "s"}</li>`).join("")}</ul>
              </details>` : ""}`;
          })()}          <p><strong>${r.completadas}</strong> respondidas de ${r.planificadas} previstas${r.omitidas ? `, ${r.omitidas} omitidas` : ""}. Lo que cuenta es lo que has hecho, no lo que estaba previsto.</p>
          ${pendientesAgenda ? '<p class="nota-pie" role="status">Quedan actividades por hacer. Puedes abrirlas desde el plan. Empezar otra guardará esta agenda para retomarla después.</p>' : ""}
          <p class="acciones-fila">${diferidaPendiente && hayRespuestas
            ? '<button type="button" class="boton activo" data-sesion-entregar="1">Entregar respuestas</button>'
            : '<button type="button" class="boton activo" data-sesion-nueva="1">Empezar otra</button>'}
            <a class="boton" href="#/">Volver</a></p>
        </section>`;
    }

    const it = estado.items[estado.posicion];
    const meta = it ? P.conceptos[it.concepto] || {} : null;
    const ya = Sesion.respuestaActual(estado);

    const contenido = it ? contenidoDe(it.concepto) : null;
    if (!contenido) {
      cargarFase(meta && meta.fid ? meta.fid : "f00").then(() => render()).catch(() => {
        const caja = $("#sesion-pregunta");
        if (caja) caja.innerHTML = '<p role="alert">No se ha podido cargar el enunciado. Puedes <a href="#/sesion">reintentar</a> o <a href="#/">salir</a> sin que cuente nada.</p>';
      });
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${cuenta}
        <p id="sesion-pregunta" class="nota-pie">Cargando el enunciado…</p>`;
    }

    const q = (contenido.quizzes || [])[it.indice];
    if (!q) {
      return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
        <h1>Sesión de estudio</h1>${cuenta}
        <p role="alert">Esta pregunta no está en el contenido publicado. Puedes saltarla sin que cuente.</p>
        <p class="acciones-fila"><button type="button" class="boton" data-sesion-omitir="1">Saltar</button></p>`;
    }

    // T26 · El tipo lo declara la pregunta.
    const tipo = typeof q.tipo === "string" ? q.tipo : "opcion";
    const opciones = Array.isArray(q.o) ? q.o : [];
    const esDeOpciones = tipo === "opcion" && opciones.length > 0;

    // T27 · La pista, con su naturaleza declarada. No basta con enseñar un texto: si es un respaldo
    // contextual hay que decirlo, y si la pista original delataba la respuesta, también.
    const pista = (typeof Pistas !== "undefined" && Pistas.pistaDe) ? Pistas.pistaDe(q, { titulo: meta && meta.t }) : null;
    const bloquePista = pista
      ? `<details class="pista" id="sesion-pista"><summary>Pista${pista.tipo === "contextual" ? " (repaso contextual)" : ""}</summary>
          <p>${esc(pista.texto)}</p>
          ${pista.tipo === "contextual" ? `<p class="nota-pie">No hay una pista propia para esta pregunta: es un repaso del concepto.</p>` : ""}
        </details>`
      : "";

    const cuerpoRespuesta = esDeOpciones
      ? `<ol class="quiz-opciones" id="sesion-opciones">${opciones.map((texto, k) => {
          const n = k + 1;
          const reintento = (estado.reintentos || {})[it.clave] || {};
          const marcada = ya ? ya.elegida === n : reintento.ultima === n;
          const esCorrecta = n === q.a;
          let clase = "opcion";
          if (ya && !diferidaPendiente) { if (esCorrecta) clase += " correcta"; else if (marcada) clase += " incorrecta"; }
          return `<li><button type="button" class="${clase}" data-sesion-opcion="${n}" data-opciones="${opciones.length}" data-correcta="${q.a}"${ya ? " disabled" : ""}${marcada ? ' aria-pressed="true"' : ""}>${esc(texto)}</button></li>`;
        }).join("")}</ol>`
      : `<form class="respuesta-texto" data-sesion-respuesta-form="1">
          <label class="nota-pie" for="sesion-respuesta-texto">${tipo === "numerica" ? "Escribe el número" + (q.unidad ? " en " + esc(q.unidad) : "") : "Escribe la respuesta"}</label>
          <input type="text" id="sesion-respuesta-texto" data-sesion-respuesta-texto="1" value="${esc(ya ? String(ya.elegida) : "")}" autocomplete="off"${ya ? " disabled" : ""} />
          ${ya ? "" : '<button type="submit" class="boton activo">Comprobar</button>'}
        </form>`;

    const diferida = modoSesion() === "diferida" && !estado.entregada;
    const entregables = Sesion.pendientesDeEntregar(estado);
    const correccion = diferida
      ? `<div class="sesion-diferida" id="sesion-diferida">
          <p class="nota-pie">${ya ? "Respuesta guardada." : "Contesta."} En modo diferido no se corrige hasta entregar.</p>
          <p class="acciones-fila">
            ${ya ? '<button type="button" class="boton" data-sesion-siguiente="1">Siguiente</button>' : '<button type="button" class="boton" data-sesion-omitir="1">Omitir esta</button>'}
            <button type="button" class="boton activo" data-sesion-entregar="1">Entregar${entregables.length ? " (" + entregables.length + ")" : ""}</button>
            <a class="boton" href="#/">Salir (se guarda)</a>
          </p>
        </div>`
      : ya
        ? `<div class="sesion-correccion" id="sesion-correccion" role="status">
            <p><strong>${esDeOpciones ? (ya.elegida === q.a ? "Correcto." : "No era esa.") : (Correccion && Correccion.corregir ? (() => { const c = Correccion.corregir(q, (estado.textos && estado.textos[it.clave] !== undefined) ? estado.textos[it.clave] : ya.elegida); return c.estado === "correcta" ? "Correcto." : (c.estado === "incompleta" ? "Falta algo: " + c.motivo : "No es esa."); })() : "")}</strong> ${esc(q.e || "")}</p>
            <p class="acciones-fila">
              <button type="button" class="boton activo" data-sesion-siguiente="1">Siguiente</button>
              <a class="boton" href="#/c/${esc(it.concepto)}">Ver la ficha entera</a>
            </p>
          </div>`
        : `<p class="acciones-fila">
            <button type="button" class="boton" data-sesion-omitir="1">Omitir esta</button>
            <a class="boton" href="#/c/${esc(it.concepto)}">Leer la ficha</a>
            <a class="boton" href="#/">Salir (se guarda)</a>
          </p>`;

    return `<div class="migas"><a href="#/">Inicio</a> › Sesión</div>
      <h1>Sesión de estudio</h1>
      ${cuenta}
      <section class="sesion-paso" id="sesion-paso">
        <p class="nota-pie">Pregunta ${estado.posicion + 1} de ${r.planificadas} · ${esc(meta && meta.t ? meta.t : it.concepto)}${esDeOpciones ? "" : " · " + esc(tipo)}</p>
        <h2>${esc(q.p || "")}</h2>
        ${cuerpoRespuesta}
        ${bloquePista}
        ${correccion}
      </section>`;
  };

    // T26 · Responder por escrito: se corrige con las REGLAS DECLARADAS de la pregunta y se guarda el
  // intento con su estado. En diferido no se corrige ni se revela.
  alDocumento("submit", (ev) => {
    const form = ev.target;
    if (!form || !form.hasAttribute("data-sesion-respuesta-form")) return;
    ev.preventDefault();
    const campo = form.querySelector("[data-sesion-respuesta-texto]");
    if (!campo) return;
    const borrador = leerSesion() || {};
    const estado = borrador.sesion;
    if (!estado) return;
    const it = estado.items[estado.posicion];
    if (!it) return;
    const cont = contenidoDe(it.concepto);
    const q = cont && (cont.quizzes || [])[it.indice];
    if (!q) return;
    const texto = String(campo.value || "").trim();
    const res = Correccion.corregir(q, texto);
    if (res.estado === "invalida") {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
      return;
    }
    const claveP = Sesion.claveDePregunta(it.concepto, it.indice);
    const diferido = modoSesion() === "diferida";
    const acerto = res.estado === "correcta";
    const siguienteBase = diferido ? Sesion.contestarConCorreccion(estado, 1, 1, acerto) : Sesion.contestar(estado, 1, 1);
    // El TEXTO va aparte del número interno: la vista vuelve a corregir al pintar y necesita el texto,
    // no el 1 que el motor usa para marcar «respondida».
    const siguiente = { ...siguienteBase, textos: { ...((estado && estado.textos) || {}), [claveP]: texto } };
    if (!diferido) {
      apuntarIntento(claveP, { elegida: texto, correcta: acerto, estado: res.estado, revision: "", ayuda: 0, confianza: null, justificacion: "", segundos: 0 });
      programar(claveP, acerto, null);
    }
    escribirSesion({ ...borrador, sesion: siguiente });
    render();
  });

    // ── Mesa de experimentos (T29) ──────────────────────────────────────────────
  // El dataset se lee con fetch del propio sitio: nada de servicios externos.
  // T29 · UN solo estado para toda la pagina. En window a proposito: asi no puede haber dos
  // copias de estas variables mirando cosas distintas, que es lo que dejaba la vista en «Cargando».
  window.__MESA = window.__MESA || { manifiesto: null, datos: {}, pidiendo: null };
  const MESA = window.__MESA;
  const DATOS_MESA = MESA.datos;
  async function cargarDataset(id) {
    if (MESA.datos[id]) return MESA.datos[id];
    try {
      const r = await fetch("datos/datasets/" + id + ".csv");
      if (!r.ok) throw new Error("no se pudo descargar " + id);
      const texto = await r.text();
      DATOS_MESA[id] = Experimentos.leerCsv(texto);
      if (MESA.errores) delete MESA.errores[id];
      traza("dataset-listo:" + id + ":" + DATOS_MESA[id].filas.length);
      return DATOS_MESA[id];
    } catch (error) {
      MESA.errores = MESA.errores || {};
      MESA.errores[id] = true;
      throw error;
    }
  }
  function avisoDatosMesa(id) {
    return `<p id="mesa-error-datos" role="alert">Faltan los datos de ${esc(id)} en este equipo o no se pueden leer.
      Descarga el material con conexión y vuelve a intentarlo.</p>
      <button type="button" class="boton" data-reintentar-datos="${esc(id)}">Volver a cargar los datos</button>`;
  }

  let MANIFIESTO_MESA = null;
  // Traza de la carga: sin esto, un fallo silencioso no deja nada que leer.
  const traza = (paso) => {
    try { (window.__traza = window.__traza || []).push(paso); } catch (e) { /* sin ventana */ }
  };
  async function cargarManifiesto() {
    if (MESA.manifiesto) return MESA.manifiesto;
    // T48 · Sin red, el catálogo tiene que seguir existiendo: se guarda la última copia buena y se usa
    // si la petición falla. Un portal que no sabe qué paquetes hay no puede decir qué está disponible.
    const delEquipo = (() => { try { const v = JSON.parse(localStorage.getItem("aprender.v1.manifiesto") || "null"); return v && Array.isArray(v.conjuntos) ? v : null; } catch (e) { return null; } })();
    let r;
    try { r = await fetch("datos/datasets.json"); }
    catch (error) {
      if (delEquipo) { MESA.manifiesto = delEquipo; MANIFIESTO_MESA = delEquipo; return delEquipo; }
      throw error;
    }
    if (!r.ok) { if (delEquipo) { MESA.manifiesto = delEquipo; MANIFIESTO_MESA = delEquipo; return delEquipo; } throw new Error("no hay manifiesto de datasets"); }
    MESA.manifiesto = await r.json();
    try { localStorage.setItem("aprender.v1.manifiesto", JSON.stringify(MESA.manifiesto)); } catch (e) { /* sin sitio */ }
    MANIFIESTO_MESA = MESA.manifiesto;
    traza("manifiesto-listo:" + (MANIFIESTO_MESA.conjuntos || []).length);
    return MANIFIESTO_MESA;
  }

  // T29 · Los datos se cargan AL ARRANCAR, no al entrar en la vista: la vista quedaba en «Cargando…»
  // porque su carga asíncrona no llegaba a repintar. Con el manifiesto y el conjunto por defecto ya
  // en memoria, la mesa se pinta a la primera.
  if (typeof fetch === "function" && !MESA.pidiendo) {
    MESA.pidiendo = cargarManifiesto()
      .then((m) => {
        const id0 = m && m.conjuntos && m.conjuntos[0] ? m.conjuntos[0].id : "";
        // El repintado NO puede depender de que se descargue el dataset: sin red esa petición falla, y
        // entonces la cadena rechaza, el render no ocurre y la vista se queda en «Cargando» para
        // siempre aunque el manifiesto ya esté. El fallo del dataset se absorbe aquí.
        return id0 ? cargarDataset(id0).catch(() => null) : null;
      })
      .then(() => { if (location.hash.indexOf("#/experimentos") === 0 || location.hash.indexOf("#/laboratorios") === 0 || location.hash.indexOf("#/paquetes") === 0) render(); })
      .catch(() => { /* si no hay datos, la vista lo dirá */ });
  }
  vistas.experimentos = (arg) => {
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    const [idDato = "", columna = "", cubosTexto = ""] = crudo.split("~");
    const cubos = Math.max(1, Math.min(50, Math.floor(Number(cubosTexto) || 6)));

    if (typeof Experimentos === "undefined") return estadoNoDisponible();
    traza("vista:" + JSON.stringify({ manifiesto: !!MANIFIESTO_MESA, datos: Object.keys(DATOS_MESA) }));

    // La vista SOLO LEE. Arrancar una descarga aquí era lo que creaba el bucle: pintar → cargar →
    // pintar. La carga la hace el arranque del módulo, una sola vez.
    if (!MESA.manifiesto) {
      return `<div class="migas"><a href="#/">Inicio</a> › Experimentos</div>
        <h1>Mesa de experimentos</h1>
        <p id="mesa-carga" class="estado-cargando" role="status" aria-busy="true">Cargando los datos…</p>`;
    }

    const manifiesto = MESA.manifiesto;
    // Si el conjunto pedido no está descargado, se pide UNA vez por conjunto y se vuelve a pintar.
    // La guarda vive en MESA, así que dos pintados seguidos no lanzan dos descargas y no hay bucle.
    {
      const pedido = idDato || (manifiesto.conjuntos[0] || {}).id || "";
      if (pedido && !MESA.datos[pedido]) {
        MESA.pidiendoDato = MESA.pidiendoDato || {};
        if (!MESA.pidiendoDato[pedido]) {
          MESA.pidiendoDato[pedido] = true;
          cargarDataset(pedido).then(() => render()).catch(() => render());
        }
        return `<div class="migas"><a href="#/">Inicio</a> › Experimentos</div>
          <h1>Mesa de experimentos</h1>
          <p id="mesa-carga" class="estado-cargando" role="status" aria-busy="true">Cargando los datos…</p>`;
      }
    }
    const conjuntos = (manifiesto.conjuntos || []);
    const actual = conjuntos.find((c) => c.id === idDato) || conjuntos[0];
    if (!actual) return "<p>El manifiesto no declara ningún conjunto.</p>";

    // Las fechas se pueden elegir, pero NO son el defecto: una fecha no es un número, y ponerla la
    // primera dejaba el histograma vacío en la mesa recién abierta.
    const columnasTodas = actual.columnas || [];
    const numericas = columnasTodas.filter((c) => c.tipo === "entero" || c.tipo === "decimal")
      .concat(columnasTodas.filter((c) => c.tipo === "fecha"));
    const col = numericas.some((c) => c.nombre === columna) ? columna : ((numericas[0] || {}).nombre || "");
    const textos = (actual.columnas || []).filter((c) => c.tipo === "texto").map((c) => c.nombre);
    const filas = (DATOS_MESA[actual.id] || {}).filas || [];

    const enlace = (d, c2, k2) => "#/experimentos/" + encodeURIComponent(d) + "~" + encodeURIComponent(c2) + "~" + encodeURIComponent(String(k2));

    const selectorDatos = conjuntos.map((c) =>
      `<a class="boton${c.id === actual.id ? " activo" : ""}" href="${enlace(c.id, "", cubos)}">${esc(c.titulo)}</a>`).join(" ");
    const selectorColumna = numericas.map((c) =>
      `<a class="boton${c.nombre === col ? " activo" : ""}" href="${enlace(actual.id, c.nombre, cubos)}">${esc(c.nombre)}</a>`).join(" ");

    const est = Experimentos.estadisticas(filas, col);
    const hist = Experimentos.histograma(filas, col, cubos);
    const porTexto = textos.length ? Experimentos.agrupar(filas, textos[0], col, "media") : [];

    const tablaResumen = `<table class="tabla-datos" id="mesa-resumen">
      <caption>Resumen de ${esc(col)} en ${esc(actual.titulo)}</caption>
      <thead><tr><th scope="col">medida</th><th scope="col">valor</th></tr></thead>
      <tbody>
        <tr><th scope="row">filas usadas</th><td>${est.n}</td></tr>
        <tr><th scope="row">media</th><td>${est.media === null ? "—" : est.media}</td></tr>
        <tr><th scope="row">mediana</th><td>${est.mediana === null ? "—" : est.mediana}</td></tr>
        <tr><th scope="row">desviación (n-1)</th><td>${est.desviacion === null ? "—" : est.desviacion}</td></tr>
        <tr><th scope="row">mínimo … máximo</th><td>${est.minimo === null ? "—" : est.minimo + " … " + est.maximo}</td></tr>
        ${est.noNumericos ? `<tr><th scope="row">celdas no numéricas (fuera)</th><td>${est.noNumericos}</td></tr>` : ""}
      </tbody>
    </table>`;

    const tablaHist = `<table class="tabla-datos" id="mesa-histograma">
      <caption>Histograma con ${cubos} cubo${cubos === 1 ? "" : "s"}</caption>
      <thead><tr><th scope="col">desde</th><th scope="col">hasta</th><th scope="col">filas</th><th scope="col">proporción</th></tr></thead>
      <tbody>${hist.cubos.map((c) => `<tr><td>${c.desde}</td><td>${c.hasta}</td><td>${c.n}</td><td>${Math.round(c.proporcion * 100)} %</td></tr>`).join("")}</tbody>
    </table>`;

    const tablaGrupos = porTexto.length ? `<table class="tabla-datos" id="mesa-grupos">
      <caption>Media de ${esc(col)} por ${esc(textos[0])}</caption>
      <thead><tr><th scope="col">${esc(textos[0])}</th><th scope="col">filas</th><th scope="col">media</th></tr></thead>
      <tbody>${porTexto.map((g) => `<tr><td>${esc(g.grupo)}</td><td>${g.n}</td><td>${g.valor === null ? "—" : g.valor}</td></tr>`).join("")}</tbody>
    </table>` : "";

    return `<div class="migas"><a href="#/">Inicio</a> › Experimentos</div>
      <h1>Mesa de experimentos</h1>
      <p class="nota-pie">Los datos son sintéticos y están declarados en el <a href="datos/datasets.json">manifiesto</a> con su licencia y su checksum. <a href="${esc(actual.fichero)}" download>Descargar «${esc(actual.titulo)}»</a>.</p>

      <p class="acciones-fila" role="group" aria-label="Conjunto de datos">${selectorDatos}</p>
      <p class="acciones-fila" role="group" aria-label="Columna">${selectorColumna}</p>
      <p class="acciones-fila" role="group" aria-label="Cubos del histograma">
        ${[3, 6, 12, 24].map((k) => `<a class="boton${k === cubos ? " activo" : ""}" href="${enlace(actual.id, col, k)}">${k} cubos</a>`).join(" ")}
        <a class="boton" href="#/experimentos">Reiniciar</a>
      </p>

      ${tablaResumen}
      ${tablaHist}
      ${tablaGrupos}

      <form class="form-duda" id="mesa-conclusion">
        <label class="nota-pie" for="mesa-texto">Tu conclusión sobre esta tabla (se guarda en tus notas)</label>
        <input type="text" id="mesa-texto" data-mesa-conclusion="1" placeholder="qué te dice el experimento" />
        <button type="submit" class="boton activo">Guardar la conclusión en el cuaderno</button>
        <span class="nota-pie" id="mesa-aviso" role="status"></span>
      </form>
      <p class="nota-pie">El enlace de esta mesa lleva solo el conjunto, la columna y el número de cubos: nada tuyo. Compartirlo no comparte nada personal.</p>`;
  };

  // T29 · La conclusión se guarda como nota, con su origen (el experimento y sus parámetros).
  alDocumento("submit", (ev) => {
    const form = ev.target;
    if (!form || !form.id || form.id !== "mesa-conclusion") return;
    ev.preventDefault();
    const campo = form.querySelector("[data-mesa-conclusion]");
    const texto = String((campo || {}).value || "").trim();
    const aviso = form.querySelector("#mesa-aviso");
    if (!texto) { if (aviso) aviso.textContent = "Escribe algo para guardar."; return; }
    const partes = (location.hash.replace(/^#\/experimentos\/?/, "") || "").split("~");
    const clave = "experimento:" + (partes[0] || "mesa") + "/" + (partes[1] || "");
    notas[clave] = { texto, seccion: "Mesa de experimentos · " + (partes[0] || "") + " · " + (partes[1] || "") + " · " + (partes[2] || "") + " cubos", ts: Date.now() };
    escribir("aprender.v1.notas", notas);
    if (aviso) aviso.innerHTML = 'Guardada en <a href="#/notas/">tus notas</a>.';
    if (campo) campo.value = "";
  });

    // ── Laboratorios L01 y L02 (T30) ────────────────────────────────────────────
  const PUNTOS_LIMITE = { minimo: 10, maximo: 500, defecto: 120 };
  const acotarPuntos = (v) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return PUNTOS_LIMITE.defecto;
    // Un valor extremo se ACOTA: la interfaz no se rompe, y se dice cuál se usó.
    return Math.max(PUNTOS_LIMITE.minimo, Math.min(PUNTOS_LIMITE.maximo, n));
  };

  /** Gráfica de dispersión con la recta, en SVG, sin bibliotecas. Accesible: lleva descripción. */
  function graficaRegresion(xs, ys, ajuste, puntos) {
    const n = Math.min(xs.length, ys.length);
    if (!n) return "";
    const maxX = Math.max(...xs), minX = Math.min(...xs);
    const maxY = Math.max(...ys), minY = Math.min(...ys);
    const ancho = 320, alto = 180, margen = 24;
    const px = (x) => margen + ((x - minX) / (maxX - minX || 1)) * (ancho - 2 * margen);
    const py = (y) => alto - margen - ((y - minY) / (maxY - minY || 1)) * (alto - 2 * margen);
    const paso = Math.max(1, Math.ceil(n / puntos));
    const circulos = [];
    for (let i = 0; i < n; i += paso) circulos.push(`<circle cx="${px(xs[i]).toFixed(1)}" cy="${py(ys[i]).toFixed(1)}" r="1.6" fill="currentColor" opacity=".55" />`);
    let recta = "";
    if (ajuste.pendiente !== null) {
      const y1 = ajuste.intercepto + ajuste.pendiente * minX;
      const y2 = ajuste.intercepto + ajuste.pendiente * maxX;
      recta = `<line x1="${px(minX).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(maxX).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="currentColor" stroke-width="2" />`;
    }
    return `<svg class="grafica-lab" id="lab-grafica" viewBox="0 0 ${ancho} ${alto}" role="img"
        aria-label="Dispersión de ${esc(ajuste.x || "x")} frente a ${esc(ajuste.y || "y")} con su recta ajustada. Cada punto es una fila del conjunto; la línea es la recta de mínimos cuadrados.">
        ${circulos.join("")}${recta}
      </svg>`;
  }

  vistas.laboratorios = (arg) => {
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    const [cual = "L01", puntosTexto = ""] = crudo.split("~");
    const cualOk = cual === "L02" ? "L02" : "L01";
    const puntos = acotarPuntos(puntosTexto || PUNTOS_LIMITE.defecto);
    const puntosPedidos = Math.floor(Number(puntosTexto));
    const acotado = Number.isFinite(puntosPedidos) && puntosPedidos !== puntos;

    if (typeof Laboratorios === "undefined") return estadoNoDisponible();
    if (!MESA.manifiesto) {
      return `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
        <h1>Laboratorios</h1><p id="lab-carga" class="estado-cargando" role="status" aria-busy="true">Cargando los datos…</p>`;
    }

    const idDato = cualOk === "L01" ? "ventas-mensuales" : "encuestas-satisfaccion";
    if (!MESA.datos[idDato]) {
      MESA.pidiendoDato = MESA.pidiendoDato || {};
      if (!MESA.pidiendoDato[idDato]) {
        MESA.pidiendoDato[idDato] = true;
        cargarDataset(idDato).then(() => render()).catch(() => render());
      }
      return `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
        <h1>Laboratorios</h1>${MESA.errores?.[idDato] ? avisoDatosMesa(idDato) : '<p id="lab-carga" class="estado-cargando" role="status" aria-busy="true">Cargando los datos…</p>'}`;
    }

    const filas = (MESA.datos[idDato] || {}).filas || [];
    const resultado = cualOk === "L01" ? Laboratorios.lab01(filas) : Laboratorios.lab02(filas);
    const enlace = (c, p) => "#/laboratorios/" + c + "~" + p;

    if (cualOk === "L01") {
      const xs = [], ys = [];
      for (const f of filas) {
        const x = Number(f.unidades), y = Number(f.ingresos);
        if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
      }
      const ajuste = { ...resultado, x: resultado.x, y: resultado.y };
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Recta ajustada: ingresos frente a unidades</caption>
        <thead><tr><th scope="col">medida</th><th scope="col">valor</th></tr></thead>
        <tbody>
          <tr><th scope="row">pendiente</th><td>${resultado.pendiente}</td></tr>
          <tr><th scope="row">intervalo del 95 %</th><td>${resultado.ic95 ? resultado.ic95.inferior + " … " + resultado.ic95.superior : "—"}</td></tr>
          <tr><th scope="row">intercepto</th><td>${resultado.intercepto}</td></tr>
          <tr><th scope="row">R²</th><td>${resultado.r2}</td></tr>
          <tr><th scope="row">filas usadas</th><td>${resultado.n}</td></tr>
        </tbody>
      </table>`;
      return `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
        <h1>Laboratorios</h1>
        <p class="acciones-fila" role="group" aria-label="Laboratorio">
          <a class="boton activo" href="${enlace("L01", puntos)}">L01 · Unidades e ingresos</a>
          <a class="boton" href="${enlace("L02", puntos)}">L02 · Veteranos y nuevos</a>
        </p>
        <h2>${esc(resultado.titulo)}</h2>
        <p>${esc(resultado.pregunta)}</p>
        <p class="acciones-fila" role="group" aria-label="Puntos dibujados">
          ${[60, 120, 300].map((k) => `<a class="boton${k === puntos ? " activo" : ""}" href="${enlace("L01", k)}">${k} puntos</a>`).join(" ")}
          <a class="boton" href="${enlace("L01", 2000)}">2000 puntos</a>
        </p>
        ${acotado ? `<p class="nota-pie" id="lab-acotado">Se han dibujado <strong>${puntos}</strong> puntos: el máximo es ${PUNTOS_LIMITE.maximo} y el mínimo ${PUNTOS_LIMITE.minimo}.</p>` : ""}
        ${graficaRegresion(xs, ys, ajuste, puntos)}
        ${tabla}
        <p class="nota-pie">Por cada unidad más, los ingresos suben unos <strong>${resultado.efecto}</strong> €. El intervalo dice con qué margen: si no contuviera el cero, el efecto sería distinto de nada.</p>`;
    }

    const tabla = `<table class="tabla-datos" id="lab-tabla">
      <caption>Diferencia de puntuación: veteranos menos nuevos</caption>
      <thead><tr><th scope="col">medida</th><th scope="col">valor</th></tr></thead>
      <tbody>
        <tr><th scope="row">media veteranos</th><td>${resultado.mediaA}</td></tr>
        <tr><th scope="row">media nuevos</th><td>${resultado.mediaB}</td></tr>
        <tr><th scope="row">diferencia</th><td>${resultado.diferencia}</td></tr>
        <tr><th scope="row">intervalo del 95 %</th><td>${resultado.ic95 ? resultado.ic95.inferior + " … " + resultado.ic95.superior : "—"}</td></tr>
        <tr><th scope="row">¿distinta de cero?</th><td>${resultado.significativo === null ? "—" : (resultado.significativo ? "sí" : "no, cabe el azar")}</td></tr>
        <tr><th scope="row">grupos</th><td>${resultado.na} y ${resultado.nb}</td></tr>
      </tbody>
    </table>`;
    return `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
      <h1>Laboratorios</h1>
      <p class="acciones-fila" role="group" aria-label="Laboratorio">
        <a class="boton" href="${enlace("L01", puntos)}">L01 · Unidades e ingresos</a>
        <a class="boton activo" href="${enlace("L02", puntos)}">L02 · Veteranos y nuevos</a>
      </p>
      <h2>${esc(resultado.titulo)}</h2>
      <p>${esc(resultado.pregunta)}</p>
      ${tabla}
      <p class="nota-pie">La diferencia es ${resultado.diferencia} puntos. ${resultado.significativo ? "El intervalo no contiene el cero: el efecto no se explica solo por el azar." : "El intervalo contiene el cero: con estos datos, la diferencia puede ser azar."}</p>`;
  };

  // ── Laboratorios L01-L04 (T31) ──────────────────────────────────────────────
  const PUNTOS_LIMITE4 = { minimo: 10, maximo: 500, defecto: 120 };
  const acotarPuntos4 = (v) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return PUNTOS_LIMITE4.defecto;
    return Math.max(PUNTOS_LIMITE4.minimo, Math.min(PUNTOS_LIMITE4.maximo, n));
  };
  const LABS4 = Laboratorios.META;

  function graficaRegresion4(xs, ys, ajuste, puntos) {
    const n = Math.min(xs.length, ys.length);
    if (!n) return "";
    const maxX = Math.max(...xs), minX = Math.min(...xs);
    const maxY = Math.max(...ys), minY = Math.min(...ys);
    const ancho = 320, alto = 180, margen = 24;
    const px = (x) => margen + ((x - minX) / (maxX - minX || 1)) * (ancho - 2 * margen);
    const py = (y) => alto - margen - ((y - minY) / (maxY - minY || 1)) * (alto - 2 * margen);
    const paso = Math.max(1, Math.ceil(n / puntos));
    const circulos = [];
    for (let i = 0; i < n; i += paso) circulos.push(`<circle cx="${px(xs[i]).toFixed(1)}" cy="${py(ys[i]).toFixed(1)}" r="1.6" fill="currentColor" opacity=".55" />`);
    let recta = "";
    if (ajuste.pendiente !== null) {
      const y1 = ajuste.intercepto + ajuste.pendiente * minX;
      const y2 = ajuste.intercepto + ajuste.pendiente * maxX;
      recta = `<line x1="${px(minX).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(maxX).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="currentColor" stroke-width="2" />`;
    }
    return `<svg class="grafica-lab" id="lab-grafica" viewBox="0 0 ${ancho} ${alto}" role="img"
        aria-label="Dispersión de ${esc(ajuste.x || "x")} frente a ${esc(ajuste.y || "y")} con su recta ajustada.">
        ${circulos.join("")}${recta}
      </svg>`;
  }

  const formatoMetrica4 = (m) => (m && m.valor !== null && m.valor !== undefined) ? String(m.valor) : "—";
  const notaMetrica4 = (m) => (m && m.valor === null && m.motivo) ? ` <span class="nota-pie">(${esc(m.motivo)})</span>` : "";

  vistas.laboratorios = (arg) => {
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    const [cual = "L01", a1 = "", b1 = ""] = crudo.split("~");
    const lab = LABS4.some((x) => x.id === cual) ? cual : "L01";
    const puntos = acotarPuntos4(a1 || PUNTOS_LIMITE4.defecto);
    const puntosPedidos = Math.floor(Number(a1));
    const acotado = Number.isFinite(puntosPedidos) && puntosPedidos !== puntos;

    if (typeof Laboratorios === "undefined") return estadoNoDisponible();
    if (!MESA.manifiesto) {
      return `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
        <h1>Laboratorios</h1><p id="lab-carga" class="estado-cargando" role="status" aria-busy="true">Cargando los datos…</p>`;
    }
    const idDato = (LABS4.find((x) => x.id === lab) || LABS4[0]).datos;
    if (!MESA.datos[idDato]) {
      MESA.pidiendoDato = MESA.pidiendoDato || {};
      if (!MESA.pidiendoDato[idDato]) {
        MESA.pidiendoDato[idDato] = true;
        cargarDataset(idDato).then(() => render()).catch(() => render());
      }
      return `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
        <h1>Laboratorios</h1>${MESA.errores?.[idDato] ? avisoDatosMesa(idDato) : '<p id="lab-carga" class="estado-cargando" role="status" aria-busy="true">Cargando los datos…</p>'}`;
    }

    const filas = (MESA.datos[idDato] || {}).filas || [];
    const enlace = (c, x, y) => "#/laboratorios/" + c + "~" + (x === undefined ? "" : x) + "~" + (y === undefined ? "" : y);
    const cambio = LABS4.map((x) => `<a class="boton${x.id === lab ? " activo" : ""}" href="${enlace(x.id, puntos)}">${x.id} · ${esc(x.titulo)}</a>`).join(" ");
    const cabecera = `<div class="migas"><a href="#/">Inicio</a> › Laboratorios</div>
      <h1>Laboratorios</h1>
      <p class="acciones-fila" role="group" aria-label="Laboratorio">${cambio}</p>`;

    if (lab === "L01") {
      const xs = [], ys = [];
      for (const f of filas) {
        const x = Number(f.unidades), y = Number(f.ingresos);
        if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
      }
      const r = Laboratorios.lab01(filas);
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Recta ajustada: ingresos frente a unidades</caption>
        <thead><tr><th scope="col">medida</th><th scope="col">valor</th></tr></thead>
        <tbody>
          <tr><th scope="row">pendiente</th><td>${r.pendiente}</td></tr>
          <tr><th scope="row">intervalo del 95 %</th><td>${r.ic95 ? r.ic95.inferior + " … " + r.ic95.superior : "—"}</td></tr>
          <tr><th scope="row">intercepto</th><td>${r.intercepto}</td></tr>
          <tr><th scope="row">R²</th><td>${r.r2}</td></tr>
          <tr><th scope="row">filas usadas</th><td>${r.n}</td></tr>
        </tbody></table>`;
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <p class="acciones-fila" role="group" aria-label="Puntos dibujados">
          ${[60, 120, 300].map((k) => `<a class="boton${k === puntos ? " activo" : ""}" href="${enlace("L01", k)}">${k} puntos</a>`).join(" ")}
          <a class="boton" href="${enlace("L01", 2000)}">2000 puntos</a>
        </p>
        ${acotado ? `<p class="nota-pie" id="lab-acotado">Se han dibujado <strong>${puntos}</strong> puntos: el máximo es ${PUNTOS_LIMITE.maximo}.</p>` : ""}
        ${graficaRegresion4(xs, ys, { ...r, x: r.x, y: r.y }, puntos)}
        ${tabla}
        <p class="nota-pie">Por cada unidad más, los ingresos suben unos <strong>${r.efecto}</strong> €.</p>`;
    }

    if (lab === "L02") {
      const r = Laboratorios.lab02(filas);
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <table class="tabla-datos" id="lab-tabla">
          <caption>Diferencia de puntuación: veteranos menos nuevos</caption>
          <thead><tr><th scope="col">medida</th><th scope="col">valor</th></tr></thead>
          <tbody>
            <tr><th scope="row">media veteranos</th><td>${r.mediaA}</td></tr>
            <tr><th scope="row">media nuevos</th><td>${r.mediaB}</td></tr>
            <tr><th scope="row">diferencia</th><td>${r.diferencia}</td></tr>
            <tr><th scope="row">intervalo del 95 %</th><td>${r.ic95 ? r.ic95.inferior + " … " + r.ic95.superior : "—"}</td></tr>
            <tr><th scope="row">¿distinta de cero?</th><td>${r.significativo === null ? "—" : (r.significativo ? "sí" : "no, cabe el azar")}</td></tr>
          </tbody></table>
        <p class="nota-pie">${r.significativo ? "El intervalo no contiene el cero: el efecto no se explica solo por el azar." : "El intervalo contiene el cero: con estos datos, la diferencia puede ser azar."}</p>`;
    }

    if (lab === "L03") {
      const umbral = Math.max(1, Math.min(60, Math.floor(Number(a1)) || 20));
      const r = Laboratorios.lab03(filas, umbral);
      const m = r.matriz;
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Matriz de confusión con umbral de uso ${r.umbral}</caption>
        <thead><tr><th scope="col">casilla</th><th scope="col">cuenta</th><th scope="col">qué es</th></tr></thead>
        <tbody>
          <tr><th scope="row">VP</th><td>${m.vp}</td><td>dijo que se va y se fue</td></tr>
          <tr><th scope="row">FP</th><td>${m.fp}</td><td>dijo que se va y se quedó</td></tr>
          <tr><th scope="row">VN</th><td>${m.vn}</td><td>dijo que se queda y se quedó</td></tr>
          <tr><th scope="row">FN</th><td>${m.fn}</td><td>dijo que se queda y se fue</td></tr>
          <tr><th scope="row">suma</th><td><strong>${r.suma}</strong></td><td>tiene que dar el total: ${r.total}</td></tr>
        </tbody></table>`;
      const metricas = `<table class="tabla-datos" id="lab-metricas">
        <caption>Métricas y su denominador</caption>
        <thead><tr><th scope="col">métrica</th><th scope="col">valor</th><th scope="col">denominador</th></tr></thead>
        <tbody>
          <tr><th scope="row">exactitud</th><td>${formatoMetrica4(r.exactitud)}${notaMetrica4(r.exactitud)}</td><td>${r.exactitud.denominador}</td></tr>
          <tr><th scope="row">sensibilidad</th><td>${formatoMetrica4(r.sensibilidad)}${notaMetrica4(r.sensibilidad)}</td><td>${r.sensibilidad.denominador}</td></tr>
          <tr><th scope="row">especificidad</th><td>${formatoMetrica4(r.especificidad)}${notaMetrica4(r.especificidad)}</td><td>${r.especificidad.denominador}</td></tr>
          <tr><th scope="row">precisión</th><td>${formatoMetrica4(r.precision)}${notaMetrica4(r.precision)}</td><td>${r.precision.denominador}</td></tr>
          <tr><th scope="row">F1</th><td>${formatoMetrica4(r.f1)}${notaMetrica4(r.f1)}</td><td>—</td></tr>
        </tbody></table>`;
      const controles = [10, 20, 30, 40].map((u) => `<a class="boton${u === r.umbral ? " activo" : ""}" href="${enlace("L03", u)}">uso < ${u}</a>`).join(" ");
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <p class="acciones-fila" role="group" aria-label="Umbral de uso">${controles}</p>
        ${tabla}
        ${metricas}
        <p class="nota-pie">La regla es: «si su uso mensual es menor que <strong>${r.umbral}</strong>, se dará de baja». Con un umbral bajo se detectan más bajas y también se equivoca más. Cuando una métrica no tiene denominador, se dice por qué en vez de enseñar un 0.</p>`;
    }

    if (lab === "L05") {
      const paso = Math.max(0.01, Math.min(2, Number(a1) || 0.1));
      const r = Laboratorios.descensoDeGradiente({ objetivo: 10, desde: 0, paso, maximo: 100 });
      const controles = [0.05, 0.1, 0.4, 1.5].map((x) => `<a class="boton${Math.abs(x - paso) < 1e-9 ? " activo" : ""}" href="${enlace("L05", x)}">paso ${x}</a>`).join(" ");
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Descenso con paso ${r.paso}</caption>
        <thead><tr><th scope="col">paso</th><th scope="col">x</th><th scope="col">coste</th></tr></thead>
        <tbody>${r.historial.slice(0, 12).map((h) => `<tr><td>${h.paso}</td><td>${h.x}</td><td>${h.coste}</td></tr>`).join("")}</tbody></table>`;
      const aviso = r.divergio
        ? `<p class="nota-pie" id="lab-divergencia" role="alert"><strong>Divergió en el paso ${r.pasos}:</strong> ${esc(r.motivo)}. Se ha parado para no seguir dando vueltas.</p>`
        : `<p class="nota-pie" id="lab-convergencia">Llegó cerca del mínimo en <strong>${r.pasos}</strong> pasos: x = ${r.x}, coste = ${r.coste}.</p>`;
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <p class="acciones-fila" role="group" aria-label="Paso del descenso">${controles}</p>
        <p class="nota-pie">Coste inicial: <strong>${r.costeInicial}</strong>. El mínimo está en x = ${r.objetivo}.</p>
        ${tabla}
        ${aviso}`;
    }

    if (lab === "L06") {
      // Dos tablas pequeñas con duplicados y nulos, para que se vea el efecto sin ruido.
      const izq = [
        { id: "a", nombre: "Ana" }, { id: "a", nombre: "Ana (2)" },
        { id: "b", nombre: "Bea" }, { id: null, nombre: "sin clave" },
      ];
      const der = [
        { id: "a", importe: 10 }, { id: "a", importe: 11 },
        { id: "c", importe: 12 }, { id: null, importe: 13 },
      ];
      const r = Laboratorios.joins(izq, der, "id");
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Filas que salen de cada join</caption>
        <thead><tr><th scope="col">join</th><th scope="col">filas</th></tr></thead>
        <tbody>
          <tr><th scope="row">interno</th><td>${r.interno}</td></tr>
          <tr><th scope="row">izquierdo</th><td>${r.izquierdo}</td></tr>
          <tr><th scope="row">derecho</th><td>${r.derecho}</td></tr>
          <tr><th scope="row">completo</th><td><strong>${r.completo}</strong></td></tr>
        </tbody></table>`;
      const procedencia = `<table class="tabla-datos" id="lab-procedencia">
        <caption>Procedencia de las filas del join completo</caption>
        <thead><tr><th scope="col">de dónde</th><th scope="col">filas</th></tr></thead>
        <tbody>${r.procedencia.map((p) => `<tr><td>${esc(p.de)}</td><td>${p.filas}</td></tr>`).join("")}
          <tr><th scope="row">suma</th><td><strong>${r.procedencia.reduce((s, p) => s + p.filas, 0)}</strong></td></tr>
        </tbody></table>`;
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <p class="nota-pie">Izquierda: ${r.izquierda} filas (${r.nulosIzquierda} sin clave). Derecha: ${r.derecha} filas (${r.nulosDerecha} sin clave). Claves en ambas: ${r.clavesEnAmbas}.</p>
        ${tabla}
        ${procedencia}
        <p class="nota-pie">El duplicado de «a» en las dos tablas multiplica: 2 × 2 = 4 filas. Y una clave nula NO casa con otra nula: en SQL, NULL no es igual a NULL. Por eso el join completo no da la suma de los dos lados.</p>`;
    }

    if (lab === "L07") {
      const semilla = Math.max(1, Math.min(99999, Math.floor(Number(b1)) || 7));
      const r = Laboratorios.particionTemporal(filas, { semilla });
      const controles = [7, 21, 99].map((x) => `<a class="boton${x === semilla ? " activo" : ""}" href="${enlace("L07", "", x)}">semilla ${x}</a>`).join(" ");
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Partición temporal: el pasado entrena, el futuro mide</caption>
        <thead><tr><th scope="col">conjunto</th><th scope="col">filas</th><th scope="col">desde</th><th scope="col">hasta</th></tr></thead>
        <tbody>
          <tr><th scope="row">pasado</th><td>${r.pasado.filas}</td><td>${r.pasado.desde}</td><td>${r.pasado.hasta}</td></tr>
          <tr><th scope="row">futuro</th><td>${r.futuro.filas}</td><td>${r.futuro.desde}</td><td>${r.futuro.hasta}</td></tr>
        </tbody></table>`;
      const comparacion = `<table class="tabla-datos" id="lab-fuga">
        <caption>Lo que se mide, con y sin fuga</caption>
        <thead><tr><th scope="col">forma de partir</th><th scope="col">R²</th></tr></thead>
        <tbody>
          <tr><th scope="row">pasado → futuro (limpio)</th><td>${r.r2Futuro}</td></tr>
          <tr><th scope="row">barajando todo (con fuga)</th><td>${r.r2ConFuga}</td></tr>
          <tr><th scope="row">diferencia</th><td><strong>${r.diferencia}</strong></td></tr>
        </tbody></table>`;
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <p class="acciones-fila" role="group" aria-label="Semilla de la parte con fuga">${controles}</p>
        ${tabla}
        ${comparacion}
        <p class="nota-pie" id="lab07-fuga">La partición limpia NO deja ver el futuro: la última fecha del pasado (<strong>${r.pasado.hasta}</strong>) es anterior a la primera del futuro (<strong>${r.futuro.desde}</strong>). La versión con fuga baraja todo y entrena con parte del futuro: su R² sale <strong>${r.diferencia}</strong> más alto sin haber aprendido nada más. Esa diferencia es la trampa.</p>`;
    }

    if (lab === "L08") {
      const fijo = Math.max(0, Number(a1) || 0);
      const variable = Math.max(0, Math.min(1, Number(b1) || 0));
      const r = Laboratorios.costes(filas, { fijo, variable });
      const controles = [0, 0.1, 0.3].map((v) => `<a class="boton${Math.abs(v - variable) < 1e-9 ? " activo" : ""}" href="${enlace("L08", 0, v)}">variable ${Math.round(v * 100)} %</a>`).join(" ");
      const tabla = `<table class="tabla-datos" id="lab-tabla">
        <caption>Del bruto al neto, con los importes del dataset</caption>
        <thead><tr><th scope="col">concepto</th><th scope="col">importe</th></tr></thead>
        <tbody>
          <tr><th scope="row">bruto</th><td>${r.bruto}</td></tr>
          <tr><th scope="row">coste fijo</th><td>${r.costeFijo}</td></tr>
          <tr><th scope="row">coste variable</th><td>${r.costeVariable}</td></tr>
          <tr><th scope="row">coste total</th><td>${r.costeTotal}</td></tr>
          <tr><th scope="row">neto</th><td><strong>${r.neto}</strong></td></tr>
          <tr><th scope="row">margen</th><td>${r.margen === null ? "—" : Math.round(r.margen * 100) + " %"}</td></tr>
        </tbody></table>`;
      return `${cabecera}
        <h2>${esc(r.titulo)}</h2>
        <p>${esc(r.pregunta)}</p>
        <p class="acciones-fila" role="group" aria-label="Coste variable">${controles}</p>
        ${tabla}
        <p class="nota-pie" id="lab08-coste">${r.identico ? "Con coste cero, el neto es el bruto <strong>exactamente</strong>, no «casi»: es la comprobación de que la cuenta no ha tocado nada." : "Cada euro de coste baja el neto y el margen."} Los importes salen del dataset publicado: <strong>sin precios vivos</strong> ni servicios externos.</p>`;
    }

    // L04
    const semilla = Math.max(1, Math.min(99999, Math.floor(Number(a1)) || 7));
    const proporcion = b1 ? Math.max(0.1, Math.min(0.9, Number(b1) || 0.7)) : 0.7;
    const r = Laboratorios.lab04(filas, semilla, proporcion);
    const controles = `<p class="acciones-fila" role="group" aria-label="Semilla">
        ${[7, 21, 99].map((s) => `<a class="boton${s === r.semilla ? " activo" : ""}" href="${enlace("L04", s, proporcion)}">semilla ${s}</a>`).join(" ")}
      </p>
      <p class="acciones-fila" role="group" aria-label="Proporción de entrenamiento">
        ${[0.5, 0.7, 0.8].map((p) => `<a class="boton${Math.abs(p - r.proporcion) < 0.001 ? " activo" : ""}" href="${enlace("L04", r.semilla, p)}">${Math.round(p * 100)} % para entrenar</a>`).join(" ")}
      </p>`;
    const tabla = `<table class="tabla-datos" id="lab-tabla">
      <caption>Partición con semilla ${r.semilla}</caption>
      <thead><tr><th scope="col">conjunto</th><th scope="col">filas</th><th scope="col">bajas</th></tr></thead>
      <tbody>
        <tr><th scope="row">entrenamiento</th><td>${r.entrenamiento.filas}</td><td>${r.entrenamiento.bajas}</td></tr>
        <tr><th scope="row">prueba</th><td>${r.prueba.filas}</td><td>${r.prueba.bajas}</td></tr>
        <tr><th scope="row">suma</th><td><strong>${r.entrenamiento.filas + r.prueba.filas}</strong></td><td>de ${r.n}</td></tr>
      </tbody></table>`;
    const tablaPrueba = `<table class="tabla-datos" id="lab-metricas">
      <caption>Medido en PRUEBA, con el umbral ${r.umbral} elegido en entrenamiento</caption>
      <thead><tr><th scope="col">medida</th><th scope="col">valor</th></tr></thead>
      <tbody>
        <tr><th scope="row">exactitud</th><td>${formatoMetrica4(r.exactitudPrueba)}${notaMetrica4(r.exactitudPrueba)}</td></tr>
        <tr><th scope="row">sensibilidad</th><td>${formatoMetrica4(r.sensibilidadPrueba)}${notaMetrica4(r.sensibilidadPrueba)}</td></tr>
        <tr><th scope="row">umbral elegido</th><td>${r.umbral}</td></tr>
      </tbody></table>`;
    return `${cabecera}
      <h2>${esc(r.titulo)}</h2>
      <p>${esc(r.pregunta)}</p>
      ${controles}
      ${tabla}
      ${tablaPrueba}
      <p class="nota-pie">El umbral se elige SOLO con el entrenamiento y luego se mide con la prueba, que no se ha usado para elegirlo. Con la misma semilla sale la misma partición; con otra, cambia lo que se mide: eso es lo que hay que entender antes de creerse un resultado.</p>`;
  };

  // ── Espacio de proyecto y entregas (T34) ────────────────────────────────────
  let BORRADOR_PROYECTO = leer("aprender.v1.entrega-borrador", null);
  let ENTREGAS_HECHAS = leer("aprender.v1.entregas", []);

  function guardarBorradorProyecto(nombre, contenido) {
    BORRADOR_PROYECTO = { nombre: String(nombre || ""), contenido: String(contenido || ""), ts: Date.now() };
    escribir("aprender.v1.entrega-borrador", BORRADOR_PROYECTO);
  }

  vistas.proyecto = (arg) => {
    // El motivo del rechazo viaja en el hash y llega percent-encoded: sin decodificarlo, la persona
    // lee «nombre%3A» en vez de «nombre:».
    let aviso = String(arg || "");
    try { aviso = decodeURIComponent(aviso); } catch { /* tal cual */ }
    const b = BORRADOR_PROYECTO || { nombre: "", contenido: "" };
    const historial = Array.isArray(ENTREGAS_HECHAS) ? ENTREGAS_HECHAS : [];
    const ultima = historial.length ? historial[historial.length - 1] : null;

    const filasHistorial = historial.map((h) => `<tr>
      <td>${h.version}</td>
      <td>${esc(h.nombre)}</td>
      <td>${h.lineas}</td>
      <td>${Math.round(h.tamano / 1024 * 10) / 10} KB</td>
      <td>${h.creada || "—"}</td>
      <td>${h.publicada ? "publicada" : "solo en tu equipo"}</td>
    </tr>`).join("");

    const comparacion = historial.length >= 2 ? (() => {
      const c = Entregas.comparar(historial, historial.length - 1, historial.length);
      return c.ok ? `<p class="nota-pie" id="proyecto-comparacion">De la versión ${c.cambios.de} a la ${c.cambios.a}: ${c.cambios.lineasAntes} → ${c.cambios.lineasDespues} lineas, ${c.cambios.distintas} distintas.</p>` : "";
    })() : "";

    return `<div class="migas"><a href="#/">Inicio</a> › Proyecto</div>
      <h1>Espacio de proyecto</h1>
      <p class="nota-pie">Lo que escribes se queda en este equipo. Entregar crea una versión nueva; publicarla es un acto aparte que aquí no ocurre.</p>
      ${aviso === "guardado" ? '<p class="nota-pie" id="proyecto-aviso" role="status">Borrador guardado.</p>' : ""}
      ${aviso === "entregado" ? '<p class="nota-pie" id="proyecto-aviso" role="status">Entrega registrada como versión nueva.</p>' : ""}
      ${aviso.startsWith("error:") ? `<p class="nota-pie" id="proyecto-aviso" role="alert">No se ha podido entregar: ${esc(aviso.slice(6))}</p>` : ""}

      <form class="form-proyecto" id="form-proyecto">
        <label class="nota-pie" for="entrega-nombre">Nombre del fichero</label>
        <input type="text" id="entrega-nombre" data-entrega-nombre="1" value="${esc(b.nombre)}" placeholder="analisis.md" autocomplete="off" />
        <label class="nota-pie" for="entrega-contenido">Tu entrega</label>
        <textarea id="entrega-contenido" data-entrega-contenido="1" rows="10" placeholder="## Resultado&#10;Escribe aquí tu análisis.">${esc(b.contenido)}</textarea>
        <p class="acciones-fila">
          <button type="submit" class="boton activo">Entregar una versión</button>
          <button type="button" class="boton" data-guardar-borrador="1">Guardar borrador</button>
          <button type="button" class="boton" data-starter="1">Descargar starter</button>
        </p>
        <span class="nota-pie" id="proyecto-estado" role="status"></span>
      </form>

      ${historial.length ? `<h2>Versiones entregadas</h2>
        <table class="tabla-datos" id="proyecto-historial">
          <caption>Historial de entregas de este equipo</caption>
          <thead><tr><th scope="col">versión</th><th scope="col">fichero</th><th scope="col">líneas</th><th scope="col">tamaño</th><th scope="col">fecha</th><th scope="col">estado</th></tr></thead>
          <tbody>${filasHistorial}</tbody>
        </table>
        ${comparacion}`
        : `<p class="nota-pie" id="proyecto-sin-entregas">Todavía no hay entregas. La primera será la versión 1, y las siguientes no la borrarán.</p>`}

      <p class="nota-pie">Se aceptan ficheros de texto con extensión conocida y un máximo de 64 KB y 2.000 líneas. Una entrega es un dato: no se ejecuta nunca.</p>`;
  };

  // T34 · Proyecto: borrador, starter y entrega validada.
  alDocumento("click", (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target : null;
    if (!t2) return;
    if (t2.closest("[data-guardar-borrador]")) {
      const n = (document.querySelector("[data-entrega-nombre]") || {}).value || "";
      const c = (document.querySelector("[data-entrega-contenido]") || {}).value || "";
      guardarBorradorProyecto(n, c);
      location.hash = "#/proyecto/guardado";
      return;
    }
    if (t2.closest("[data-starter]")) {
      const nombre = (document.querySelector("[data-entrega-nombre]") || {}).value || "entrega.md";
      const plantilla = "# " + (nombre.replace(/\.[A-Za-z0-9]+$/, "") || "entrega") + "\n\n## Pregunta\n\n## Datos usados\n\n## Resultado\n\n## Qué limitaría este resultado\n";
      descargar(nombre.replace(/\.[A-Za-z0-9]+$/, "") + "-starter.md", plantilla, "text/markdown;charset=utf-8");
      return;
    }
  });

  alDocumento("submit", (ev) => {
    const form = ev.target;
    if (!form || form.id !== "form-proyecto") return;
    ev.preventDefault();
    const nombre = String((form.querySelector("[data-entrega-nombre]") || {}).value || "");
    const contenido = String((form.querySelector("[data-entrega-contenido]") || {}).value || "");
    const r = Entregas.versionar(ENTREGAS_HECHAS, { nombre, contenido }, new Date().toISOString().slice(0, 10));
    if (!r.ok) { location.hash = "#/proyecto/error:" + encodeURIComponent(r.motivo); return; }
    ENTREGAS_HECHAS = r.historial;
    escribir("aprender.v1.entregas", ENTREGAS_HECHAS);
    guardarBorradorProyecto(nombre, contenido);
    location.hash = "#/proyecto/entregado";
  });

    // ── Proyectos (T35) ─────────────────────────────────────────────────────────
  // Índice de aprendizaje: todos los paquetes descargables ordenados de principiante a avanzado,
  // con tiempo estimado y los prerrequisitos del proyecto. Es una vista de lectura y de descarga:
  // no duplica datos, los ordena a partir del catálogo (nivel, horas y rutaAprendizaje).
  // ── Ficha de proyecto completa (plantilla) ──────────────────────────────────
  // Aplicada al proyecto P69. Es el formato que debería tener una ficha de portfolio:
  // problema, datos, método, resultados, código comentado y descarga. El contenido es estático
  // para que se pueda copiar como plantilla sin depender de datos que cambien.
  vistas.fichaCompleta = () => {
    const filas = [
      ["1", "equipo-01", "equipo-04", "2", "1", "17", "4", "62", "4"],
      ["1", "equipo-02", "equipo-11", "1", "1", "12", "4", "59", "6"],
      ["1", "equipo-03", "equipo-18", "2", "1", "19", "2", "74", "5"],
      ["2", "equipo-05", "equipo-07", "0", "0", "9", "11", "48", "3"],
      ["2", "equipo-06", "equipo-09", "3", "1", "21", "6", "65", "2"],
    ];
    const tablaDatos = filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    const codigo = `def variables(filas):
    # Paso 2 · Construir las variables del modelo: volumen de tiros y desequilibrio de posesión.
    # Por qué: «domina» no es lo mismo que «tira mucho»; se separan para no confundirlos.
    salida = []
    for fila in filas:
        tiros = int(fila["tiros_local"]) + int(fila["tiros_visitante"])
        desequilibrio = abs(float(fila["posesion_local"]) - 50)
        salida.append({**fila, "tiros_totales": tiros, "desequilibrio": desequilibrio})
    return salida

def ols(filas):
    # Paso 3 · OLS: amarillas = b0 + b1·tiros_totales + b2·desequilibrio.
    # Por qué: permite leer cada efecto manteniendo el otro; una correlación simple los mezcla.
    x = [[1.0, f["tiros_totales"], f["desequilibrio"]] for f in filas]
    y = [f["amarillas"] for f in filas]
    # … sistema normal, coeficientes y R² (ver amarillas.py)`;
    return `<div class="migas"><a href="#/">Inicio</a> › <a href="#/proyectos">Proyectos</a> › Ficha completa (plantilla)</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Ficha de proyecto completa · plantilla</p>
        <h1>Amarillas: el partido que se calienta</h1>
        <p class="resumen-ficha">Problema, datos, método, resultados, código comentado y descarga en una sola página. Aplicada al proyecto P69 y a su paquete, para que el resto de fichas se puedan escribir con el mismo orden.</p>
        <p class="nota-pie">Proyecto P69 · intermedio · ciencia · 6 h · paquete con 14 comprobaciones</p>
      </header>
      <article class="ficha-proyecto-completa">
        <h2>1 · Problema</h2>
        <p>Cuando un partido se calienta, ¿es porque hay más juego o porque un equipo se impone? La decisión es qué explicar en un informe de rendimiento: <strong>¿se pueden predecir las amarillas con tiros y posesión?</strong> Si la respuesta es no, el informe debe decirlo.</p>
        <p class="ejemplo-regla"><strong>Formato:</strong> una pregunta de negocio, una decisión y un límite al final. El método no se presenta antes del problema.</p>

        <h2>2 · Datos</h2>
        <p><code>futbol-partidos.csv</code> · <strong>380 filas × 12 columnas</strong> · 38 jornadas · 20 equipos. Incluye goles, tiros, xG, posesión, amarillas y resultado. Es sintético, determinista y CC0-1.0; no describe ninguna liga real. Fuente: catálogo Data School · <code>sha256 5cbc8977…e66a12e</code>.</p>
        <div class="tabla-envoltorio"><table class="tabla-datos"><caption>Primeras 5 filas del CSV (copia literal del catálogo)</caption><thead><tr><th>Jornada</th><th>Local</th><th>Visitante</th><th>Goles L</th><th>Goles V</th><th>Tiros L</th><th>Tiros V</th><th>Posesión L</th><th>Amarillas</th></tr></thead><tbody>${tablaDatos}</tbody></table></div>

        <h2>3 · Método</h2>
        <p>Se construyen dos variables: <strong>tiros_totales</strong> (volumen de juego) y <strong>desequilibrio</strong> (<code>|posesión_local − 50|</code>). Se ajusta un OLS de las amarillas contra ambas, con 380 partidos:</p>
        <pre class="bloque-codigo"><code>amarillas = b0 + b1 · tiros_totales + b2 · desequilibrio</code></pre>
        <p>Se reportan coeficientes, R² y RMSE, y se revisan los partidos con más tarjetas para mirar el contexto que el modelo no captura.</p>

        <h2>4 · Resultados</h2>
        <div class="ejemplo-kpis">
          <div class="ejemplo-kpi"><b>R² 0,013</b><span>tiros y desequilibrio explican muy poco</span></div>
          <div class="ejemplo-kpi"><b>+0,039</b><span>coeficiente del desequilibrio por punto</span></div>
          <div class="ejemplo-kpi"><b>1,823</b><span>RMSE en tarjetas por partido</span></div>
        </div>
        <p>El intercepto es <strong>+3,197</strong> y el coeficiente de tiros totales <strong>−0,019</strong>. El modelo no permite predecir un partido caliente: el R² de <strong>1,3 %</strong> es el resultado, no un fallo que se esconde. Los partidos con 6 tarjetas aparecen con 9, 16 o 21 tiros, sin un patrón claro.</p>
        <p class="nota-pie">Cada cifra se reproduce con <code>python amarillas.py</code> y se comprueba con <code>python verificar.py</code> (14 comprobaciones).</p>

        <h2>5 · Código comentado</h2>
        <p>Se muestran los dos pasos que deciden: construir las variables y plantear el modelo. El resto (sistema normal, R², extremos) está en el paquete, con el mismo comentario de porqué.</p>
        <pre class="bloque-codigo"><code>${esc(codigo)}</code></pre>

        <h2>6 · Descarga</h2>
        <p>Paquete completo con CSV, código, README, salida de ejemplo y verificador:</p>
        <p class="acciones-fila"><a class="boton primario" href="paquetes/P69-codigo.zip" download>Descargar el paquete P69</a> <a class="boton" href="#/proyectos/P69">Ver la ficha del proyecto</a></p>
        <pre class="bloque-codigo"><code>cd P69-codigo
python amarillas.py
python verificar.py   # 14 comprobaciones, VERDE</code></pre>

        <h2>7 · Cómo reutilizar esta ficha</h2>
        <ol class="ejemplo-pasos">
          <li><strong>Problema:</strong> una pregunta y la decisión que cambia.</li>
          <li><strong>Datos:</strong> archivo, tamaño, fuente, licencia, hash y muestra real.</li>
          <li><strong>Método:</strong> variables, modelo o regla, y por qué esas y no otras.</li>
          <li><strong>Resultados:</strong> cifras que salen de ejecutar, incluido un R² bajo.</li>
          <li><strong>Código comentado:</strong> los pasos que deciden, no el archivo entero.</li>
          <li><strong>Descarga:</strong> ZIP, comando y número de comprobaciones.</li>
        </ol>
        <p class="nota-pie">Plantilla interna: <code>docs/PLANTILLA-FICHA-PROYECTO.md</code>. Referencia: P69. Cambia datos y cifras, no el orden.</p>
      </article>`;
  };

  // ── Quién está detrás, portfolio, CV y proyectos estrella ───────────────────
  vistas.quien = () => {
    return `<div class="migas"><a href="#/">Inicio</a> › Quién está detrás</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Sobre el proyecto</p>
        <h1>Quién está detrás</h1>
        <p class="resumen-ficha">Soy David. Data School es un proyecto personal para aprender datos e IA construyendo algo que se pueda abrir y comprobar: 459 fichas, 63 paquetes descargables y cada cifra con su verificador.</p>
      </header>
      <article class="articulo-ejemplo">
        <h2>Qué busco</h2>
        <p>Prácticas de <strong>Business Analyst</strong>: pasar de una pregunta de negocio a un dato, un KPI y una decisión que se pueda defender. Este portal es mi forma de enseñar el trabajo, no solo de contarlo.</p>
        <h2>Qué puedes mirar</h2>
        <div class="quien-enlaces">
          <a class="boton primario" href="#/portfolio">Ver el portfolio</a>
          <a class="boton primario" href="#/cv">Ver el CV</a>
          <a class="boton" href="#/proyectos-estrella">Tres proyectos con resultado visible</a>
          <a class="boton" href="#/rutas/bi">Ruta BI y analítica (2 h)</a>
        </div>
        <h2>Cómo está hecho</h2>
        <p>Portal estático en JavaScript clásico, generado desde contenido Markdown/YAML, con pruebas de navegador (Playwright), paquetes en Python sin dependencias y publicación en GitHub Pages. Sin cuentas, sin pagos y sin enviar tu progreso a ningún servidor.</p>
        <p class="nota-pie">El portfolio y el CV viven en este sitio para que no dependan de un PDF externo. Si necesitas una versión imprimible, el CV se puede guardar como PDF desde el navegador.</p>
        <p class="acciones-fila"><a class="boton" href="#/proyectos-estrella">Empezar por los resultados</a> <a class="boton" href="#/rutas/bi">Ir a la ruta BI</a></p>
      </article>`;
  };

  vistas.portfolio = () => {
    return `<div class="migas"><a href="#/">Inicio</a> › Portfolio</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Portfolio de proyectos</p>
        <h1>Portfolio</h1>
        <p class="resumen-ficha">Problemas reales resueltos con datos sintéticos, código ejecutable y un resultado que se puede mirar. El estado es honesto: funcional y demostrable; los textos legales y el tema oscuro siguen en obras.</p>
      </header>
      <article class="articulo-ejemplo">
        <h2>Qué demuestra</h2>
        <ul>
          <li><strong>Modelo y BI:</strong> P20 convierte 380 partidos en un hecho por partido con dimensiones y un KPI que cuadra.</li>
          <li><strong>KPIs y decisión:</strong> P12 responde una sola pregunta con un panel; P39 mide el embudo por usuarios únicos.</li>
          <li><strong>Calidad y coste:</strong> P72 separa ingresos, ticket y dependencia; P73 costea el falso positivo de una regla de fraude.</li>
          <li><strong>Ingeniería:</strong> P17 ingiere de forma idempotente; P65 bloquea regresiones de modelos; P71 define una alerta de sensor y su límite.</li>
        </ul>
        <h2>Tres proyectos con resultado visible</h2>
        <p>No solo el ZIP: el modelo en estrella de P20, los KPIs de P12 y el embudo de P39 se pueden mirar en la página.</p>
        <p class="acciones-fila"><a class="boton primario" href="#/proyectos-estrella">Ver los tres resultados</a> <a class="boton" href="#/rutas/bi">Ruta BI</a></p>
        <h2>Enlace público</h2>
        <p><a href="https://erdeivih.github.io/data-school-site/">https://erdeivih.github.io/data-school-site/</a> · <a href="https://erdeivih.github.io/data-school-site/#/aprender">índice de 63 paquetes</a> · <a href="https://erdeivih.github.io/data-school-site/#/rutas/bi">ruta BI</a></p>
        <h2>Estado honesto</h2>
        <p>El portal, el índice, el buscador, las rutas y los 63 paquetes son <strong>funcionales y demostrables</strong>. Los datos legales del titular están <strong>en preparación</strong> (nota provisional, sin texto incompleto). El 3D y el tema oscuro del portal nuevo están <strong>en obras</strong>.</p>
        <p class="nota-pie">Este portfolio es la versión navegable de <code>PORTFOLIO.md</code>; el CV está en <a href="#/cv">#/cv</a>.</p>
      </article>`;
  };

  vistas.cv = () => {
    return `<div class="migas"><a href="#/">Inicio</a> › CV</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">CV de proyectos</p>
        <h1>David · Analista de datos en formación</h1>
        <p class="resumen-ficha">Business Analyst en prácticas: pregunta de negocio, dato, KPI, límite y comprobación. Este CV enseña el trabajo con enlaces a proyectos ejecutables; para PDF, usa imprimir del navegador.</p>
      </header>
      <article class="articulo-ejemplo cv">
        <h2>Perfil</h2>
        <p>Construyo análisis que se pueden abrir y repetir: datos con fuente y licencia, código comentado, resultados medidos y un verificador que falla si algo no cuadra. Busco prácticas de Business Analyst donde el criterio y la evidencia pesen más que la diapositiva.</p>
        <h2>Competencias</h2>
        <ul>
          <li><strong>Datos y SQL:</strong> modelado, agregaciones, uniones, calidad y contratos de datos.</li>
          <li><strong>BI y KPIs:</strong> panel de una pregunta, embudo por usuarios únicos, ticket y dependencia, coste de una regla.</li>
          <li><strong>Python:</strong> análisis y modelos sin dependencias, verificación automática y resultados reproducibles.</li>
          <li><strong>Comunicación:</strong> README, artículos, límites explícitos y estado honesto de cada pieza.</li>
        </ul>
        <h2>Proyectos</h2>
        <ul>
          <li><strong>P20 · Fútbol: modelo en estrella</strong> — hecho por partido, dimensiones, KPI de puntos y cuadre a cero diferencias. <a href="#/proyectos/P20">Ficha P20</a> · <a href="#/proyectos-estrella">Resultado visible</a>.</li>
          <li><strong>P12 · Panel de carrera</strong> — una pregunta, tres KPIs y un panel de una pantalla. <a href="#/proyectos/P12">Ficha P12</a> · <a href="#/proyectos-estrella">Resultado visible</a>.</li>
          <li><strong>P39 · Embudo y cohortes</strong> — 500 → 462 → 291 → 74 usuarios y conversión por canal. <a href="#/proyectos/P39">Ficha P39</a> · <a href="#/proyectos-estrella">Resultado visible</a>.</li>
          <li><strong>P73 · Coste del falso positivo</strong> — una regla de fraude que no compensa con el margen supuesto. <a href="#/proyectos/P73">Ficha</a>.</li>
        </ul>
        <h2>Formación</h2>
        <p><strong>Temario Data School</strong> (459 fichas, 63 paquetes): estadística, SQL, ingeniería de datos, machine learning, finanzas cuantitativas y BI. Formación autodidacta documentada y verificada; no es un título oficial.</p>
        <h2>Contacto</h2>
        <p>A través del <a href="#/portfolio">portfolio</a> y del repositorio del sitio. Disponible para prácticas de Business Analyst.</p>
        <p class="nota-pie">Este CV es una versión de proyectos, sin datos personales de contacto publicados. Para una copia, imprime esta página y guárdala como PDF.</p>
      </article>`;
  };

  vistas.estrellas = () => {
    const p20 = [["equipo-03", 94], ["equipo-06", 84], ["equipo-02", 81], ["equipo-05", 71], ["equipo-09", 70]];
    const embudo = [["visita", 500], ["registro", 462], ["activacion", 291], ["compra", 74]];
    return `<div class="migas"><a href="#/">Inicio</a> › Proyectos estrella</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Tres proyectos con resultado visible</p>
        <h1>No solo el ZIP: el resultado está aquí</h1>
        <p class="resumen-ficha">Tres proyectos de BI con su cifra a la vista: el modelo en estrella de P20, los KPIs de P12 y el embudo de P39. Cada tarjeta enlaza la ficha y el paquete para comprobar el resultado.</p>
      </header>

      <section class="estrella-caso" id="estrella-p20">
        <p class="rotulo-ejemplo">P20 · Modelo en estrella</p>
        <h2>De 380 partidos a una tabla que responde</h2>
        <p><strong>Pregunta:</strong> ¿cuántos puntos lleva cada equipo sin perder ni inventar partidos? <strong>Modelo:</strong> dim_equipo 20 · dim_jornada 38 · hecho_partido 380 (grano jornada, local). <strong>KPI:</strong> puntos = 3·victorias + empates.</p>
        <div class="estrella-barras">
          ${p20.map(([e, p]) => `<div class="estrella-barra"><span>${e}</span><i style="width:${(p / 94) * 100}%"></i><b>${p}</b></div>`).join("")}
        </div>
        <p class="nota-pie"><strong>Resultado:</strong> 1026 puntos · equipo-03 líder con 94 · 0 claves huérfanas · 0 diferencias origen → hecho.</p>
        <p class="acciones-fila"><a class="boton primario" href="paquetes/P20-codigo.zip" download>Descargar paquete P20</a> <a href="#/proyectos/P20">Ver cómo se verifica</a></p>
      </section>

      <section class="estrella-caso" id="estrella-p12">
        <p class="rotulo-ejemplo">P12 · Panel de una pregunta</p>
        <h2>Qué stint rinde mejor y cuánto cuesta la parada</h2>
        <div class="ejemplo-kpis">
          <div class="ejemplo-kpi"><b>83,529 s</b><span>mejor stint: monza · A · después</span></div>
          <div class="ejemplo-kpi"><b>−0,939 s</b><span>después − antes</span></div>
          <div class="ejemplo-kpi"><b>22,369 s</b><span>coste medio de la parada</span></div>
        </div>
        <div class="tabla-envoltorio"><table class="tabla-datos"><caption>KPIs por stint (resumen de la tabla completa)</caption><thead><tr><th>Stint</th><th>Vueltas</th><th>Media</th><th>P90</th></tr></thead><tbody>
          <tr><td>monza · A · después</td><td>12</td><td>83,529</td><td>83,905</td></tr>
          <tr><td>monza · B · después</td><td>8</td><td>83,543</td><td>83,770</td></tr>
          <tr><td>monza · A · antes</td><td>17</td><td>84,435</td><td>84,733</td></tr>
        </tbody></table></div>
        <p class="nota-pie"><strong>Resultado:</strong> 12 stints y 6 paradas; la vuelta de boxes se aparta del ritmo. <a href="#/proyectos/P12">Ficha P12</a> · <a href="paquetes/P12-codigo.zip" download>Descargar ZIP</a></p>
      </section>

      <section class="estrella-caso" id="estrella-p39">
        <p class="rotulo-ejemplo">P39 · Embudo y cohortes</p>
        <h2>Dónde se cae el usuario, por canal</h2>
        <div class="estrella-embudo">
          ${embudo.map(([etapa, n], i) => `<div class="estrella-paso"><span>${etapa}</span><i style="width:${(n / 500) * 100}%"></i><b>${n}</b><em>${i === 0 ? "100 %" : ((n / embudo[i - 1][1]) * 100).toFixed(1) + " %"}</em></div>`).join("")}
        </div>
        <p class="nota-pie"><strong>Resultado:</strong> 500 → 462 → 291 → 74 · conversión final 14,8 % · orgánico 22,3 % · pago 4,6 % · referido 18,5 %. <a href="#/proyectos/P39">Ficha P39</a> · <a href="paquetes/P39-codigo.zip" download>Descargar ZIP</a></p>
      </section>

      <p class="ejemplo-regla"><strong>Por qué estos tres:</strong> P20 enseña el modelo y el cuadre; P12 enseña el KPI y el límite; P39 enseña el embudo y la conversión. Son la conversación de BI: del dato al KPI y del KPI a la decisión.</p>
      <p class="acciones-fila"><a class="boton primario" href="#/rutas/bi">Ruta BI de 2 h</a> <a class="boton" href="#/portfolio">Portfolio</a> <a class="boton" href="#/quien-esta-detras">Quién está detrás</a></p>`;
  };


  // ── Ruta BI y analítica de negocio (para reclutadores) ─────────────────────
  // Tres bloques: el caso estrella P20 en 90 segundos, el recorrido de 2 horas y los enlaces
  // a los paquetes. Está escrita para que se entienda sin ejecutar nada y se pueda comprobar.
  vistas.rutaBI = () => {
    if (typeof Proyectos === "undefined") return estadoNoDisponible();
    const paquetes = {};
    for (const p of Proyectos.PROYECTOS || []) {
      const q = p.paquete || (window.PAQUETES && window.PAQUETES[p.id]);
      if (q && q.archivo) paquetes[p.id] = q;
    }
    const porId = new Map((Proyectos.PROYECTOS || []).map((p) => [p.id, p]));
    const kb = (q) => Math.round((Number(q.bytes) || 0) / 1024);
    const fila = (id, minutos, mira) => {
      const p = porId.get(id);
      if (!p || !paquetes[id]) return "";
      return `<li class="bi-paso">
        <div class="bi-paso-cabecera"><a href="#/proyectos/${esc(id)}">${esc(p.titulo)}</a>
          <span class="bi-minutos">${minutos} min</span></div>
        <p class="nota-pie">${esc(mira)} · <a href="paquetes/${esc(paquetes[id].archivo)}" download>Descargar ZIP (${kb(paquetes[id])} KB)</a></p>
      </li>`;
    };
    const barras = [
      ["equipo-03", 94], ["equipo-06", 84], ["equipo-02", 81], ["equipo-05", 71], ["equipo-09", 70],
    ];
    const maximo = barras[0][1];
    return `<div class="migas"><a href="#/">Inicio</a> › <a href="#/rutas">Rutas</a> › BI y analítica de negocio</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Ruta para reclutadores de BI · 2 horas</p>
        <h1>BI y analítica de negocio</h1>
        <p class="resumen-ficha">El modelo en estrella de P20, la calidad de datos y los KPIs que salen del hecho. Primero el caso estrella en 90 segundos; después, qué mirar en dos horas y dónde está cada paquete.</p>
      </header>

      <section class="bi-caso" aria-labelledby="bi-caso-titulo">
        <h2 id="bi-caso-titulo">Caso estrella · P20 en 90 segundos</h2>
        <p class="bi-pregunta"><strong>Pregunta:</strong> una tabla plana de <strong>380 partidos</strong>, ¿cómo se convierte en un modelo que responda «cuántos puntos lleva cada equipo» sin perder ni inventar nada?</p>
        <ol class="bi-pasos-secuencia">
          <li><strong>Pregunta</strong><span>Una consulta de negocio, no una tabla.</span></li>
          <li><strong>Grano</strong><span>Un partido = <code>(jornada, local)</code>. La trampa: <code>(local, visitante)</code> son 20 pares repetidos 19 veces.</span></li>
          <li><strong>Modelo</strong><span>Dos dimensiones y un hecho: <code>dim_equipo</code> 20, <code>dim_jornada</code> 38, <code>hecho_partido</code> 380.</span></li>
          <li><strong>KPI</strong><span>Puntos = 3 · victorias + empates; <strong>1026</strong> en total.</span></li>
          <li><strong>Resultado</strong><span>equipo-03 94 puntos; colista equipo-18 16.</span></li>
          <li><strong>Comprobación</strong><span>0 claves huérfanas y 0 diferencias origen → hecho (goles 717, tiros 6172, xG 687,23).</span></li>
        </ol>

        <div class="bi-diagrama" role="img" aria-label="Modelo en estrella: dimensión equipo y dimensión jornada alrededor del hecho por partido, del que sale el KPI de puntos">
          <div class="bi-nodo bi-dim"><b>dim_equipo</b><span>20 filas</span></div>
          <div class="bi-nodo bi-hecho"><b>hecho_partido</b><span>380 filas · grano (jornada, local)</span><span>goles · tiros · xG · amarillas</span></div>
          <div class="bi-nodo bi-dim"><b>dim_jornada</b><span>38 filas</span></div>
          <div class="bi-nodo bi-kpi"><b>KPI</b><span>puntos = 3·victorias + empates</span><strong>1026</strong></div>
        </div>

        <div class="bi-resultado">
          <h3>Resultado visual · puntos desde el hecho</h3>
          <div class="bi-barras">
            ${barras.map(([equipo, puntos]) => `<div class="bi-barra"><span>${esc(equipo)}</span><i style="width:${(puntos / maximo) * 100}%"></i><b>${puntos}</b></div>`).join("")}
          </div>
          <p class="nota-pie">La clasificación sale de sumar el hecho, no de copiar una tabla; el cuadre con el origen es la prueba de que el modelo no perdió partidos.</p>
        </div>
        <p class="acciones-fila"><a class="boton primario" href="paquetes/P20-codigo.zip" download>Descargar paquete P20</a> <a href="#/proyectos/P20">Ver cómo se verifica</a></p>
      </section>

      <section class="bi-recorrido" aria-labelledby="bi-recorrido-titulo">
        <h2 id="bi-recorrido-titulo">Recorrido de 2 horas</h2>
        <p class="nota-pie">Tiempo de lectura y revisión del paquete, no de hacer el proyecto entero. Los seis pasos suman 120 minutos.</p>
        <div class="bi-columnas">
          <div>
            <h3>Modelo y calidad de datos</h3>
            <ol class="bi-lista">
              ${fila("P20", 20, "el modelo en estrella, el grano y el cuadre")}
              ${fila("P31", 20, "contrato de datos, frescura y linaje")}
              ${fila("P41", 20, "limpieza a escala con contrato de calidad")}
            </ol>
          </div>
          <div>
            <h3>KPIs y decisión</h3>
            <ol class="bi-lista">
              ${fila("P12", 20, "un panel de una pregunta con fuente y límite")}
              ${fila("P39", 20, "embudo, cohortes y conversión")}
              ${fila("P66", 20, "de precio a factura y ahorro medido")}
            </ol>
          </div>
        </div>
      </section>

      <p class="ejemplo-regla"><strong>Qué demuestra esta ruta:</strong> que el dato se puede modelar sin perderlo (P20), que la calidad se contrata y se comprueba (P31, P41) y que el KPI se puede defender con una fuente y un límite (P12, P39, P66). Es la conversación de una entrevista de BI, con paquetes descargables detrás.</p>
      <p class="acciones-fila"><a class="boton primario" href="#/proyectos-estrella">Tres proyectos con resultado visible</a> <a class="boton" href="#/rutas">Ver las otras rutas</a> <a class="boton" href="#/aprender">Índice de los 61 paquetes</a> <a class="boton" href="#/ficha-ejemplo">Ficha de proyecto completa</a></p>`;
  };


  // ── Rutas de aprendizaje (itinerarios por rol) ──────────────────────────────
  // Tres itinerarios que enlazan paquetes en orden, con el tiempo estimado de cada paso y el
  // acumulado. No son puertas: son recomendaciones para no empezar por el proyecto más difícil.
  vistas.rutas = () => {
    if (typeof Proyectos === "undefined") return estadoNoDisponible();
    const ETIQUETA_AREA = { datos: "Datos", ciencia: "Ciencia", quant: "Quant" };
    const paquetes = {};
    for (const p of Proyectos.PROYECTOS || []) {
      const q = p.paquete || (window.PAQUETES && window.PAQUETES[p.id]);
      if (q && q.archivo) paquetes[p.id] = q;
    }
    const porId = new Map((Proyectos.PROYECTOS || []).map((p) => [p.id, p]));
    const horas = (p) => (Number.isFinite(Number(p.tiempoHoras)) && Number(p.tiempoHoras) > 0 ? Number(p.tiempoHoras) : 0);
    const kb = (q) => Math.round((Number(q.bytes) || 0) / 1024);
    const rutas = [
      {
        id: "analista",
        nombre: "Analista de datos",
        perfil: "Para quien empieza por el negocio: métricas, embudos, facturación y un panel que se pueda presentar.",
        ids: ["P22", "P35", "P36", "P31", "P39", "P69", "P67", "P66", "P12", "P16"],
        nota: "Empieza por lo básico de datos; los tres últimos pasos ya son portfolio: embudo, factura y panel.",
      },
      {
        id: "cientifico",
        nombre: "Científico de datos",
        perfil: "Para quien quiere medir, modelar y decir cuánto puede ser ruido; el orden va de contraste a modelo.",
        ids: ["P22", "P13", "P19", "P21", "P23", "P70", "P68", "P65", "P45"],
        nota: "Cada paso añade una decisión estadística; P65 cierra con la puerta de publicación de modelos.",
      },
      {
        id: "ingeniero",
        nombre: "Ingeniero de datos",
        perfil: "Para quien construye el camino del dato: contrato, ingesta, idempotencia, streaming y orquestación.",
        ids: ["P31", "P35", "P17", "P42", "P29", "P71", "P27", "P20", "P47"],
        nota: "El orden va del contrato de datos a la orquestación; P20 une ingesta y modelo en estrella.",
      },
    ];
    const fila = (p, i, acumulado) => {
      const q = paquetes[p.id];
      return `<li class="paso-ruta">
        <div class="paso-ruta-cabecera"><span class="paso-numero" aria-hidden="true">${i + 1}</span>
          <a href="#/proyectos/${esc(p.id)}">${esc(p.titulo)}</a></div>
        <p class="nota-pie">${esc(p.nivel)} · ${esc(ETIQUETA_AREA[p.ruta] || p.ruta)} · ${horas(p)} h · acumulado ${acumulado} h ·
          <a href="paquetes/${esc(q.archivo)}" download>Descargar ZIP (${kb(q)} KB)</a></p>
      </li>`;
    };
    const seccion = (r) => {
      const pasos = r.ids.map((id) => porId.get(id)).filter((p) => p && paquetes[p.id]);
      let acumulado = 0;
      const filas = pasos.map((p, i) => { acumulado += horas(p); return fila(p, i, acumulado); }).join("");
      return `<section class="ruta-aprendizaje" id="ruta-${esc(r.id)}">
        <h2>${esc(r.nombre)}</h2>
        <p>${esc(r.perfil)}</p>
        <p class="nota-pie"><strong>${pasos.length} paquetes</strong> · <strong>${acumulado} h estimadas</strong> · el orden es una recomendación, no un requisito.</p>
        <ol class="lista-ruta">${filas}</ol>
        <p class="nota-pie">${esc(r.nota)}</p>
      </section>`;
    };
    const total = rutas.reduce((suma, r) => suma + r.ids.filter((id) => porId.has(id) && paquetes[id]).reduce((s, id) => s + horas(porId.get(id)), 0), 0);
    return `<div class="migas"><a href="#/">Inicio</a> › Rutas de aprendizaje</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Itinerarios por rol</p>
        <h1>Rutas de aprendizaje</h1>
        <p class="resumen-ficha">Tres caminos para no empezar por el proyecto más difícil: analista, científico e ingeniero. Cada paso enlaza un paquete descargable, con su tiempo estimado y el acumulado; el orden es una recomendación, no una puerta.</p>
      </header>
      <p class="bi-aviso"><a class="boton primario" href="#/rutas/bi">Ruta BI y analítica de negocio · 2 h para un reclutador</a></p>
      <nav class="rutas-indice" aria-label="Itinerarios">
        ${rutas.map((r) => `<a class="boton" href="#ruta-${esc(r.id)}">${esc(r.nombre)}</a>`).join("")}
      </nav>
      <p class="nota-pie">${rutas.reduce((s, r) => s + r.ids.length, 0)} pasos en total · ${rutas.length} itinerarios · ~${total} h si se hicieran todos.</p>
      ${rutas.map(seccion).join("")}
      <p class="acciones-fila"><a class="boton" href="#/aprender">Ver el índice de aprendizaje completo</a> <a class="boton" href="#/ejemplo">Ver un artículo de ejemplo</a></p>`;
  };

  // ── Artículo de ejemplo (plantilla para el resto) ───────────────────────────
  // Es una pieza editorial, no una ficha del temario: enseña el formato bueno con un proyecto
  // real del catálogo (P12) y sus resultados reales. El contenido es estático a propósito: una
  // plantilla tiene que poder copiarse sin depender de datos que cambien.
  vistas.ejemplo = () => {
    const filas = [
      ["bahrein", "A", "antes", 17, "92,733", "92,680", "93,131", "+0,021"],
      ["bahrein", "A", "después", 12, "91,811", "91,832", "91,998", "+0,033"],
      ["bahrein", "B", "antes", 21, "92,759", "92,785", "93,047", "+0,013"],
      ["bahrein", "B", "después", 8, "91,772", "91,828", "91,980", "+0,040"],
      ["monza", "A", "antes", 17, "84,435", "84,407", "84,733", "+0,014"],
      ["monza", "A", "después", 12, "83,529", "83,493", "83,905", "+0,018"],
      ["monza", "B", "antes", 21, "84,463", "84,482", "84,797", "+0,025"],
      ["monza", "B", "después", 8, "83,543", "83,620", "83,770", "+0,044"],
      ["suzuka", "A", "antes", 17, "91,294", "91,300", "91,654", "+0,036"],
      ["suzuka", "A", "después", 12, "90,462", "90,428", "90,764", "+0,032"],
      ["suzuka", "B", "antes", 21, "91,408", "91,374", "91,729", "+0,032"],
      ["suzuka", "B", "después", 8, "90,343", "90,358", "90,546", "+0,005"],
    ];
    const tabla = filas.map((f) => `<tr><td>${f[0]}</td><td>${f[1]}</td><td>${f[2]}</td><td>${f[3]}</td><td>${f[4]}</td><td>${f[5]}</td><td>${f[6]}</td><td>${f[7]}</td></tr>`).join("");
    const datos = [
      ["bahrein", "A", "1", "medio", "1", "30,637", "31,540", "30,471", "92,647", "0"],
      ["bahrein", "A", "2", "medio", "2", "30,522", "31,394", "30,578", "92,494", "0"],
      ["bahrein", "A", "3", "medio", "3", "30,481", "31,292", "30,509", "92,282", "0"],
      ["bahrein", "A", "4", "medio", "4", "30,599", "31,441", "30,612", "92,652", "0"],
      ["bahrein", "A", "5", "medio", "5", "30,554", "31,377", "30,588", "92,519", "0"],
    ];
    const tablaDatos = datos.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    const codigo = `def stints(filas):
    # Paso 2 · Derivar el stint de cada vuelta y apartar la vuelta de boxes.
    # Por qué: el CSV no trae «stint»; se deriva de la parada. La vuelta de la parada dura ~22 s
    # más y no es ritmo: se guarda aparte para calcular cuánto cuesta la parada.
    ritmo, paradas = [], []
    for (carrera, piloto), grupo in grupos_ordenados(filas).items():
        marcas = [f for f in grupo if f["parada"] == "1"]
        if len(marcas) != 1:
            raise ValueError(f"{carrera}/{piloto}: se esperaba una parada, hay {len(marcas)}")
        vuelta_parada = int(marcas[0]["vuelta"])
        for fila in grupo:
            if fila["parada"] == "1":
                paradas.append({**fila, "carrera": carrera, "piloto": piloto})
                continue
            copia = dict(fila)
            copia["stint"] = "antes" if int(fila["vuelta"]) < vuelta_parada else "despues"
            ritmo.append(copia)
    if len(ritmo) != 174 or len(paradas) != 6:
        raise ValueError(f"se esperaban 174 vueltas de ritmo y 6 paradas; hay {len(ritmo)} y {len(paradas)}")
    return ritmo, paradas`;
    return `<div class="migas"><a href="#/">Inicio</a> › <a href="#/proyectos">Proyectos</a> › Artículo de ejemplo</div>
      <header class="cabecera-ejemplo">
        <p class="rotulo-ejemplo">Plantilla de artículo · un proyecto con datos reales</p>
        <h1>Un panel de carrera con una sola pregunta</h1>
        <p class="resumen-ficha">Cómo se cuenta un proyecto de datos en siete secciones: la pregunta, los datos, el código comentado, los resultados, el límite, la descarga y la verificación. Este artículo usa el proyecto P12 y sus resultados reales; cópialo como plantilla para el resto.</p>
      </header>
      <article class="articulo-ejemplo">
        <h2>1 · La pregunta y la decisión</h2>
        <p>Un panel no empieza por los gráficos: empieza por una pregunta que cambie una decisión. La de P12 es <strong>¿qué stint rinde mejor y cuánto cuesta de verdad la parada?</strong> Si el panel no puede responder eso, sobra.</p>
        <p class="ejemplo-regla"><strong>Regla de la plantilla:</strong> una pregunta, una decisión y un límite. Si necesitas tres preguntas, son tres artículos.</p>

        <h2>2 · Los datos, con fuente y licencia</h2>
        <p>El CSV del paquete es <code>telemetria-f1.csv</code>: <strong>180 vueltas × 10 columnas</strong>, 3 carreras × 2 pilotos × 30 vueltas. Es sintético, determinista y CC0-1.0; no describe ninguna carrera real. La fuente y el hash van en el artículo, no en un pie escondido.</p>
        <div class="tabla-envoltorio"><table class="tabla-datos"><caption>Primeras 5 filas del CSV (copia literal del catálogo)</caption><thead><tr><th>Carrera</th><th>Piloto</th><th>Vuelta</th><th>Compuesto</th><th>Edad</th><th>Sector 1</th><th>Sector 2</th><th>Sector 3</th><th>Vuelta</th><th>Parada</th></tr></thead><tbody>${tablaDatos}</tbody></table></div>
        <p class="nota-pie">Fuente: <code>telemetria-f1</code> (catálogo Data School) · licencia CC0-1.0 · <code>sha256 c232e767…50c2c3b</code>.</p>

        <h2>3 · El código, comentado paso a paso</h2>
        <p>El código no se pega entero: se enseña el paso que toma la decisión. Aquí, derivar los stints y apartar la vuelta de boxes. Los comentarios dicen <strong>por qué</strong>, no qué hace la línea.</p>
        <pre class="bloque-codigo"><code>${esc(codigo)}</code></pre>
        <p>El paquete completo incluye los seis pasos y un <code>verificar.py</code> con <strong>25 comprobaciones</strong>; el artículo enlaza al código, no lo duplica.</p>

        <h2>4 · Los resultados, con cifras que se pueden comprobar</h2>
        <div class="ejemplo-kpis">
          <div class="ejemplo-kpi"><b>83,529 s</b><span>mejor stint: monza · A · después</span></div>
          <div class="ejemplo-kpi"><b>−0,939 s</b><span>después − antes (media de stints)</span></div>
          <div class="ejemplo-kpi"><b>22,369 s</b><span>coste medio de la parada en pista</span></div>
        </div>
        <details class="ejemplo-tabla"><summary>Ver los 12 stints con sus KPIs</summary>
          <div class="tabla-envoltorio"><table class="tabla-datos"><caption>KPIs por stint (vuelta de boxes excluida del ritmo)</caption><thead><tr><th>Carrera</th><th>Piloto</th><th>Stint</th><th>Vueltas</th><th>Media</th><th>Mediana</th><th>P90</th><th>Degradación</th></tr></thead><tbody>${tabla}</tbody></table></div>
        </details>
        <p>Cada cifra sale de una regla escrita y de un verificador que la comprueba; ninguna está puesta a mano.</p>

        <h2>5 · El límite, en el mismo artículo</h2>
        <p>Tres carreras sintéticas, una sola parada por piloto y ningún dato de posición: el panel describe <strong>este CSV</strong>, no una temporada. La parada y el neumático nuevo van juntos, así que no se puede separar «lo que costó la parada» de «lo que ganó el neumático». El límite no es una nota al pie: es una sección.</p>

        <h2>6 · La descarga y la verificación</h2>
        <p>Un artículo sin descarga es una captura. El paquete incluye CSV, código, README, salida de ejemplo y verificador:</p>
        <p class="acciones-fila"><a class="boton primario" href="paquetes/P12-codigo.zip" download>Descargar el paquete P12</a> <a class="boton" href="#/proyectos/P12">Ver la ficha del proyecto</a></p>
        <pre class="bloque-codigo"><code>cd P12-codigo
python panel.py --html resultados/panel.html
python verificar.py   # 25 comprobaciones, VERDE</code></pre>

        <h2>7 · Cómo reutilizar esta plantilla</h2>
        <ol class="ejemplo-pasos">
          <li><strong>Pregunta y decisión:</strong> una sola, con la decisión que cambia.</li>
          <li><strong>Datos:</strong> archivo, tamaño, fuente, licencia, hash y una muestra real.</li>
          <li><strong>Código:</strong> los pasos que deciden, comentados con el porqué, no el archivo entero.</li>
          <li><strong>Resultados:</strong> cifras que salen de ejecutar, con su tabla o su panel.</li>
          <li><strong>Límite:</strong> qué no se puede concluir y por qué.</li>
          <li><strong>Descarga y verificación:</strong> ZIP, comando y número de comprobaciones.</li>
        </ol>
        <p class="nota-pie">Plantilla interna: <code>docs/PLANTILLA-ARTICULO.md</code>. Artículo de referencia: P12. Para el resto, cambia los datos y las cifras, no el orden.</p>
      </article>`;
  };

  vistas.aprender = () => {
    if (typeof Proyectos === "undefined") return estadoNoDisponible();
    const ETIQUETA_AREA = { datos: "Datos", ciencia: "Ciencia", quant: "Quant" };
    const ORDEN_NIVEL = ["básico", "intermedio", "avanzado", "experto"];
    const paquetes = {};
    for (const p of Proyectos.PROYECTOS || []) {
      const q = p.paquete || (window.PAQUETES && window.PAQUETES[p.id]);
      if (q && q.archivo) paquetes[p.id] = q;
    }
    const conPaquete = (Proyectos.PROYECTOS || []).filter((p) => paquetes[p.id]);
    const horas = (p) => (Number.isFinite(Number(p.tiempoHoras)) && Number(p.tiempoHoras) > 0 ? Number(p.tiempoHoras) : 0);
    const ordenados = conPaquete.slice().sort((a, b) => {
      const na = ORDEN_NIVEL.indexOf(comoTexto(a.nivel));
      const nb = ORDEN_NIVEL.indexOf(comoTexto(b.nivel));
      return (na < 0 ? 9 : na) - (nb < 0 ? 9 : nb) ||
        horas(a) - horas(b) ||
        String(a.titulo || "").localeCompare(String(b.titulo || ""), "es");
    });
    const totalHoras = ordenados.reduce((suma, p) => suma + horas(p), 0);
    const fila = (p) => {
      const q = paquetes[p.id];
      const prereqs = comoLista(p.rutaAprendizaje).filter(Boolean).slice(0, 3);
      const antes = prereqs.length
        ? `Antes: ${prereqs.map((id) => {
          const c = P.conceptos[id];
          return `<a href="#/c/${esc(id)}">${esc(c && c.t ? c.t : id)}</a>`;
        }).join(", ")}`
        : "Antes: ninguno en particular; puedes empezar por aquí.";
      return `<li class="itinerario-fila">
        <div class="itinerario-cabeza">
          <a href="#/proyectos/${esc(p.id)}"><strong>${esc(p.titulo)}</strong></a>
          ${comoTexto(p.nivel) ? `<span class="pastilla nivel-${esc(comoTexto(p.nivel))}">${esc(comoTexto(p.nivel))}</span>` : ""}
        </div>
        <p class="itinerario-meta nota-pie">${esc(ETIQUETA_AREA[comoTexto(p.ruta)] || comoTexto(p.ruta) || "General")} · ${horas(p) ? `${horas(p)} h estimadas` : "tiempo sin estimar"} · ${q.bytes ? `${Math.round(Number(q.bytes) / 1024)} KB` : "ZIP"}</p>
        <p class="nota-pie">${antes}</p>
        <a class="boton" href="paquetes/${esc(q.archivo)}" download aria-label="Descargar el paquete de ${esc(p.titulo)}">Descargar ZIP</a>
      </li>`;
    };
    const secciones = ORDEN_NIVEL.map((nivel) => {
      const items = ordenados.filter((p) => comoTexto(p.nivel) === nivel);
      if (!items.length) return "";
      const horasNivel = items.reduce((suma, p) => suma + horas(p), 0);
      return `<section class="itinerario-nivel" aria-labelledby="nivel-${esc(nivel)}">
        <h2 id="nivel-${esc(nivel)}">${esc(nivel.charAt(0).toUpperCase() + nivel.slice(1))}</h2>
        <p class="nota-pie">${items.length} ${items.length === 1 ? "paquete" : "paquetes"}${horasNivel ? ` · ${horasNivel} h estimadas en total` : ""}.</p>
        <ol class="lista-itinerario">${items.map(fila).join("")}</ol>
      </section>`;
    }).join("");
    return `<div class="migas"><a href="#/">Inicio</a> › Índice de aprendizaje</div>
      <h1>Índice de aprendizaje</h1>
      <p class="entradilla">Los ${ordenados.length} paquetes descargables en orden, de principiante a avanzado: cuánto se tarda, qué conviene saber antes y dónde se descarga el código.</p>
      <p class="proyectos-cuenta nota-pie">${ordenados.length} paquetes · ${totalHoras} h estimadas en total · los tiempos son orientativos.</p>
      ${secciones || `<div class="estado-vacio" id="aprender-vacio"><p class="estado-titulo">Todavía no hay paquetes en esta copia</p><p>Puedes seguir con los <a href="#/proyectos">proyectos</a> o <a href="#/buscar">buscar un concepto</a>.</p></div>`}`;
  };

  vistas.proyectos = (arg) => {
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    if (typeof Proyectos === "undefined") return estadoNoDisponible();
    const lista = Proyectos.PROYECTOS || [];
    const elegido = lista.find((x) => x.id === crudo) || null;

    if (elegido) {
      // Campos de portfolio, todos opcionales: una copia antigua del catálogo no los trae y
      // entonces su bloque simplemente no existe (no se pinta un hueco ni se inventa un valor).
      const roles = comoLista(elegido.roles);
      const nivel = comoTexto(elegido.nivel);
      const horas = Number(elegido.tiempoHoras);
      const entregable = comoTexto(elegido.entregable);
      const criterio = comoTexto(elegido.criterioTerminado);
      const ruta = comoLista(elegido.rutaAprendizaje).filter((id) => typeof id === "string" && id);
      const herramientas = comoLista(elegido.herramientas);
      const conjuntoDatos = comoTexto(elegido.datos);
      const datosPropios = comoTexto(elegido.datosPropios);
      const hitosLista = comoLista(elegido.hitos);
      const rubricaLista = comoLista(elegido.rubrica);
      // La comparación con las entregas de referencia es opcional: si la copia del catálogo no
      // las trae, la rúbrica se enseña igual y no se rompe la ficha.
      let comparacion = null;
      try { comparacion = typeof Proyectos.comparar === "function" ? Proyectos.comparar(elegido) : null; }
      catch (e) { comparacion = null; }
      const detalleDe = (cual, i) => {
        const d = comparacion && comparacion[cual] && Array.isArray(comparacion[cual].detalle) ? comparacion[cual].detalle[i] : null;
        return d && typeof d === "object" ? d : {};
      };

      // Cabecera: para qué rol sirve, qué cuesta y qué se enseña. Solo se pinta lo que hay.
      const meta = [
        nivel ? `<span class="pastilla nivel-${esc(nivel)}">${esc(nivel)}</span>` : "",
        roles.map((r) => `<span class="pastilla rol-proyecto">${esc(rolLegible(r))}</span>`).join(""),
        Number.isFinite(horas) && horas > 0 ? `<span class="proyecto-tiempo">${esc(String(horas))} h</span>` : "",
      ].filter(Boolean).join("");
      const cabeceraPortfolio = meta || entregable
        ? `${meta ? `<p class="proyecto-meta">${meta}</p>` : ""}
           ${entregable ? `<p class="proyecto-entregable"><strong>Qué se entrega:</strong> ${esc(entregable)}</p>` : ""}`
        : "";      const bloqueCriterio = criterio
        ? `<section class="proyecto-criterio" id="proyecto-criterio" aria-labelledby="proyecto-criterio-titulo">
             <p class="rotulo" id="proyecto-criterio-titulo">Criterio de terminado</p>
             <p class="criterio-texto">${esc(criterio)}</p>
           </section>`
        : "";
      const bloqueRuta = ruta.length
        ? `<section class="proyecto-ruta" id="proyecto-ruta" aria-labelledby="proyecto-ruta-titulo">
             <h2 id="proyecto-ruta-titulo">Ruta de aprendizaje</h2>
             <p class="nota-pie">Estos conceptos se estudian antes de empezar el proyecto, en este orden.</p>
             <ol class="ruta-aprendizaje">${ruta.map((id) => {
               const concepto = P.conceptos[id];
               const titulo = concepto && concepto.t ? concepto.t : id;
               return `<li><a href="#/c/${esc(id)}">${esc(titulo)}</a></li>`;
             }).join("")}</ol>
           </section>`
        : "";
      const bloqueHerramientas = herramientas.length
        ? `<section class="proyecto-herramientas" id="proyecto-herramientas">
             <h2>Herramientas</h2>
             <p class="herramientas-pastillas">${herramientas.map((h) => `<span class="pastilla">${esc(h)}</span>`).join("")}</p>
           </section>`
        : "";
      // Fuente de datos: el CSV del portal con la licencia del manifiesto si la copia local lo
      // tiene, y las APIs reales con su licencia del catálogo verificado. Nada se inventa: si no
      // se conoce la licencia, no se escribe licencia.
      let manifiesto = null;
      try {
        const m = (window.__MESA && window.__MESA.manifiesto) || leer("aprender.v1.manifiesto", null);
        manifiesto = m && Array.isArray(m.conjuntos) ? m.conjuntos.find((x) => x && x.id === conjuntoDatos) || null : null;
      } catch (e) { manifiesto = null; }
      let apis = [];
      try {
        apis = typeof Proyectos.apiDe === "function" ? comoLista(Proyectos.apiDe(elegido)) : comoLista(elegido.api).map((id) => ({ id }));
      } catch (e) { apis = comoLista(elegido.api).map((id) => ({ id })); }
      const bloqueFuente = conjuntoDatos || datosPropios || apis.length
        ? `<section class="proyecto-fuente" id="proyecto-fuente">
             <h2>Fuente de datos</h2>
             ${conjuntoDatos ? `<p>Datos del portal: <a href="datos/datasets/${esc(conjuntoDatos)}.csv" download>${esc(manifiesto && manifiesto.titulo ? manifiesto.titulo : conjuntoDatos)}</a>${manifiesto && Number.isFinite(Number(manifiesto.filas)) ? ` · ${Number(manifiesto.filas)} filas` : ""}${manifiesto && manifiesto.licencia ? ` · licencia ${esc(manifiesto.licencia)}` : ""}.</p>` : ""}
             ${datosPropios ? `<p>Datos propios: ${esc(datosPropios)}${/[.!?]$/.test(datosPropios) ? "" : "."}</p>` : ""}
             ${apis.length ? `<ul class="lista-apis">${apis.map((a) => {
               const nombre = comoTexto(a.nombre) || comoTexto(a.id) || "API";
               const url = comoTexto(a.url);
               const licencia = comoTexto(a.licencia);
               return `<li>${url ? `<a href="${esc(url)}" rel="noopener">${esc(nombre)}</a>` : `<strong>${esc(nombre)}</strong>`}${licencia ? ` <details class="api-licencia"><summary>Licencia</summary><p>${esc(licencia)}</p></details>` : ""}</li>`;
             }).join("")}</ul>` : ""}
           </section>`
        : "";
      // Paquete descargable: si el proyecto declara `paquete` (P65, con mapa fase→lección) o si
      // generar.mjs ha publicado un Pxx-codigo.zip, la ficha muestra la descarga. El manifiesto
      // window.PAQUETES lo escribe el generador con tamaño y hash: nada de cifras escritas a mano.
      const paqueteDatos = elegido.paquete || (window.PAQUETES && window.PAQUETES[elegido.id]) || null;
      const paquete = paqueteDatos && comoTexto(paqueteDatos.archivo)
        ? `<section class="proyecto-paquete" id="proyecto-paquete">
             <h2>Código descargable</h2>
             <p>Paquete con el código comentado y los datos de ejemplo:
               <a class="boton primario" href="paquetes/${esc(paqueteDatos.archivo)}" download>Descargar ${esc(paqueteDatos.archivo)}</a>
               ${Number.isFinite(Number(paqueteDatos.bytes)) ? `<span class="nota-pie"> · ${Math.round(Number(paqueteDatos.bytes) / 1024)} KB</span>` : ""}</p>
             ${Array.isArray(paqueteDatos.lecciones) && paqueteDatos.lecciones.length
               ? `<table class="tabla-datos"><caption>Qué lección explica cada fase del plan</caption>
                    <thead><tr><th scope="col">fase</th><th scope="col">lección</th></tr></thead>
                    <tbody>${paqueteDatos.lecciones.map((x) => `<tr><td>${esc(x.fase)}</td><td>${comoLista(x.lecciones).length ? comoLista(x.lecciones).map((id) => `<a href="#/c/${esc(id)}">${esc(id)}</a>`).join(" · ") : "la rúbrica de este proyecto"}</td></tr>`).join("")}</tbody>
                  </table>`
               : (comoLista(elegido.rutaAprendizaje).length
                 ? `<p class="nota-pie">Lecciones asociadas: ${comoLista(elegido.rutaAprendizaje).map((id) => `<a href="#/c/${esc(id)}">${esc(id)}</a>`).join(" · ")}</p>`
                 : "")}
             <p class="nota-pie">Ejecuta su <code>verificar.py</code> para comprobar que todo cuadra; los requisitos y los pasos están en el README del paquete.</p>
           </section>`
        : "";
      // Salida esperada de cada paquete: tabla real, no captura ni cifra escrita a mano.
      const salidaPaquete = (window.SALIDAS_PAQUETES && window.SALIDAS_PAQUETES[elegido.id]) || null;
      const filasSalida = salidaPaquete ? salidaPaquete.lineas.slice(0, 6).map((linea) => {
        const corte = linea.indexOf(":");
        if (corte > 0 && corte < 60) return [linea.slice(0, corte).trim(), linea.slice(corte + 1).trim()];
        return ["Resultado", linea];
      }) : [];
      const bloqueSalida = salidaPaquete && elegido.id !== "P20" && paqueteDatos && comoTexto(paqueteDatos.archivo)
        ? `<section class="proyecto-salida" id="proyecto-salida">
             <h2>Salida esperada</h2>
             <p class="nota-pie">Tabla extraída de la salida real del paquete (<code>resultados/ejemplo-salida.txt</code>); no hay cifras escritas a mano.</p>
             <div class="tabla-envoltorio"><table class="tabla-datos"><caption>Primeras líneas de la salida del paquete</caption>
               <thead><tr><th scope="col">Salida</th><th scope="col">Resultado</th></tr></thead>
               <tbody>${filasSalida.map(([etiqueta, valor]) => `<tr><td>${esc(etiqueta)}</td><td><code>${esc(valor)}</code></td></tr>`).join("")}</tbody>
             </table></div>
             <p class="acciones-fila"><a class="boton" href="paquetes/${esc(paqueteDatos.archivo)}" download>Descargar y reproducir</a></p>
           </section>`
        : "";
      // P20: el caso se cuenta aquí mismo, con datos de ejemplo rotulados y lo que comprueba el verificador.
      const bloqueCasoP20 = elegido.id === "P20" && paqueteDatos && comoTexto(paqueteDatos.archivo)
        ? `<section class="p20-caso" id="proyecto-p20-caso">
             <p class="rotulo-ejemplo">P20 · Caso de BI</p>
             <h2>Pregunta de negocio</h2>
             <p>¿Cómo convierto <strong>380 partidos</strong> en una tabla que responda «cuántos puntos lleva cada equipo» sin perder ni inventar nada, y cómo lo demuestro?</p>
             <p class="datos-ejemplo-rotulo"><strong>Datos de ejemplo</strong> · <code>futbol-partidos.csv</code> · 380 × 12 · 20 equipos · 38 jornadas · sintético CC0-1.0</p>
             <div class="bi-diagrama" role="img" aria-label="Modelo en estrella: dimensión equipo y dimensión jornada alrededor del hecho por partido, del que sale el KPI de puntos">
               <div class="bi-nodo bi-dim"><b>dim_equipo</b><span>20 filas</span></div>
               <div class="bi-nodo bi-hecho"><b>hecho_partido</b><span>380 filas · grano (jornada, local)</span><span>goles · tiros · xG · amarillas</span></div>
               <div class="bi-nodo bi-dim"><b>dim_jornada</b><span>38 filas</span></div>
               <div class="bi-nodo bi-kpi"><b>KPI</b><span>puntos = 3·victorias + empates</span><strong>1026</strong></div>
             </div>
             <h3>Resultado</h3>
             <div class="tabla-envoltorio"><table class="tabla-datos"><caption>Puntos calculados desde el hecho (top 5 y colista)</caption>
               <thead><tr><th>Equipo</th><th>Puntos</th></tr></thead>
               <tbody><tr><td>equipo-03</td><td>94</td></tr><tr><td>equipo-06</td><td>84</td></tr><tr><td>equipo-02</td><td>81</td></tr><tr><td>equipo-05</td><td>71</td></tr><tr><td>equipo-09</td><td>70</td></tr><tr><td>equipo-18</td><td>16</td></tr></tbody></table></div>
             <p class="nota-pie">Cuadre origen → hecho: <strong>0 diferencias</strong> en partidos (380), goles (717), tiros (6172), xG (687,23), amarillas (1219) y posesión (20551). <strong>0 claves huérfanas.</strong></p>
             <h3>Qué comprueba el verificador</h3>
             <ul>
               <li>Grano <code>(jornada, local)</code> único y detección de la trampa <code>(local, visitante)</code>.</li>
               <li>Integridad referencial: 0 claves huérfanas entre hecho y dimensiones.</li>
               <li>Cuadre de totales contra el origen: 0 diferencias.</li>
               <li>Coherencia del resultado 1/X/2 con los goles en las 380 filas.</li>
               <li>Clasificación: 20 equipos × 38 partidos, 1026 puntos y GF = GC = 717.</li>
               <li><strong>49 comprobaciones</strong> en total, en verde.</li>
             </ul>
             <p class="acciones-fila"><a class="boton primario" href="paquetes/${esc(paqueteDatos.archivo)}" download>Descargar paquete P20</a> <a class="boton" href="#/rutas/bi">Ver caso completo en la ruta BI</a> <a class="boton" href="#/proyectos-estrella">Resultado visual</a></p>
           </section>`
        : "";
      // Usabilidad U9 · el anuncio de la descarga va arriba, con tamaño y qué incluye.
      const bloqueDescarga = paqueteDatos && comoTexto(paqueteDatos.archivo)
        ? `<div class="ficha-descarga" id="ficha-descarga">
             <p><strong>Código descargable.</strong> README, requisitos, datos de ejemplo, código comentado y <code>verificar.py</code>${Number.isFinite(Number(paqueteDatos.bytes)) ? ` · ${Math.round(Number(paqueteDatos.bytes) / 1024)} KB` : ""}.</p>
             <a class="boton-principal" href="paquetes/${esc(paqueteDatos.archivo)}" download>Descargar el paquete</a>
           </div>`
        : "";
      const c = comparacion;
      const hitos = hitosLista.map((h) => `<li><strong>${esc(h.id)} · ${esc(h.titulo)}</strong> — ${esc(h.criterio)}</li>`).join("");
      const aprende = comoLista(elegido.aprende).length
        ? `<h2>Lo que hay que aprender</h2><ul id="proyecto-aprende">${comoLista(elegido.aprende).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : "";
      const rubrica = rubricaLista.length
        ? `<table class="tabla-datos" id="proyecto-rubrica">
        <caption>Rúbrica: ${rubricaLista.length} criterios</caption>
        <thead><tr><th scope="col">criterio</th><th scope="col">peso</th><th scope="col">referencia</th><th scope="col">errónea</th></tr></thead>
        <tbody>${rubricaLista.map((r, i) => {
          const bueno = detalleDe("referencia", i);
          const malo = detalleDe("erronea", i);
          return `<tr><td>${esc(r.criterio)}</td><td>${r.peso}</td><td>${esc(bueno.etiqueta || "—")}</td><td>${esc(malo.etiqueta || "—")} <span class="nota-pie">${esc(malo.motivo || "")}</span></td></tr>`;
        }).join("")}</tbody></table>`
        : "";
      // El plan de 3 fases del proyecto: se lee como una lista y no como una tabla,
      // porque cada fase es un paso (objetivo → entregable), no una fila de datos.
      const roadmap = Array.isArray(elegido.roadmap) && elegido.roadmap.length
        ? `<h2>Plan de ${elegido.roadmap.length} fases</h2>
           <ol class="lista-roadmap" id="proyecto-roadmap">${elegido.roadmap.map((r) => `<li>
             <strong>${esc(r.fase)}</strong>
             <span class="roadmap-objetivo">${esc(r.objetivo)}</span>
             <span class="roadmap-entregable">Entregable: ${esc(r.entregable)}</span>
           </li>`).join("")}</ol>`
        : "";
      return `<div class="migas"><a href="#/">Inicio</a> › <a href="#/proyectos">Proyectos</a> › ${esc(elegido.titulo)}</div>
        <h1>${esc(elegido.titulo)}</h1>
        <p class="resumen-ficha">${esc(elegido.resumen)}</p>
        ${cabeceraPortfolio}
        ${bloqueDescarga}
        ${bloqueCriterio}
        ${bloqueRuta}
        ${bloqueHerramientas}
        ${bloqueFuente}
        ${paquete}
        ${bloqueSalida}
        ${bloqueCasoP20}
        ${aprende}
        ${roadmap}
        ${hitosLista.length ? `<h2>Hitos</h2><ol>${hitos}</ol>` : ""}
        ${rubricaLista.length ? `<h2>Rúbrica y comparación</h2>${rubrica}` : ""}
        <p class="acciones-fila">
          ${comoTexto(elegido.starter) ? `<button type="button" class="boton primario" data-starter-proyecto="${esc(elegido.id)}">Descargar starter</button>` : ""}
          <a class="boton" href="#/proyecto">Ir a mi espacio de entrega</a>
        </p>
        ${(() => {
          // Qué MEJORÓ de la errónea a la referencia. Sin las dos entregas, no hay comparación
          // que enseñar: se calla en vez de inventarla.
          if (typeof Rubricas === "undefined" || !c || !c.referencia || !c.erronea) return "";
          try {
            const antes = { ...Proyectos.evaluar(elegido, elegido.erronea), rubricaVersion: Rubricas.huella(rubricaLista).version };
            const despues = { ...Proyectos.evaluar(elegido, elegido.referencia), rubricaVersion: Rubricas.huella(rubricaLista).version };
            const comp = Rubricas.compararReentrega(antes, despues);
            return `<section id="proyecto-reentrega">
              <h2>Qué mejora al corregirla</h2>
              <p>${comp.ok ? "De la errónea a la referencia: <strong>" + comp.notaAntes + "</strong> → <strong>" + comp.notaDespues + "</strong> (" + (comp.delta > 0 ? "+" : "") + comp.delta + "). " + esc(comp.explicacion) : esc(comp.motivo)}</p>
            </section>`;
          } catch (e) { return ""; }
        })()}
        ${comoTexto(elegido.explicacionError) ? `<details><summary>Por qué la entrega errónea está mal</summary><p>${esc(elegido.explicacionError)}</p></details>` : ""}`;
    }

    // ── Lista: filtro por rol y por nivel (estado de pantalla, no ruta) ────────
    const rolesDisponibles = [...new Set(lista.flatMap((p) => comoLista(p.roles)))].sort((a, b) => rolLegible(a).localeCompare(rolLegible(b), "es"));
    const nivelesDisponibles = [...new Set(lista.map((p) => comoTexto(p.nivel)).filter(Boolean))];
    const areasDisponibles = [...new Set(lista.map((p) => comoTexto(p.ruta)).filter(Boolean))];
    const ETIQUETA_AREA = { datos: "Datos", ciencia: "Ciencia", quant: "Quant" };
    const rolSel = rolesDisponibles.includes(filtroProyectos.rol) ? filtroProyectos.rol : "";
    const nivelSel = nivelesDisponibles.includes(filtroProyectos.nivel) ? filtroProyectos.nivel : "";
    const areaSel = areasDisponibles.includes(filtroProyectos.area) ? filtroProyectos.area : "";
    const ORDENES = [["relevancia", "relevancia"], ["horas", "horas"], ["nivel", "nivel"], ["alfabetico", "A–Z"]];
    const ordenSel = (ORDENES.some(([v]) => v === filtroProyectos.orden) ? filtroProyectos.orden : "relevancia");
    const visibles = lista.filter((p) => {
      const okRol = !rolSel || comoLista(p.roles).includes(rolSel);
      const okNivel = !nivelSel || comoTexto(p.nivel) === nivelSel;
      const okArea = !areaSel || comoTexto(p.ruta) === areaSel;
      return okRol && okNivel && okArea;
    });
    // Orden explícito: el catálogo conserva su orden por relevancia salvo que se pida otro.
    const nivelOrden = { "básico": 0, "intermedio": 1, "avanzado": 2, "experto": 3 };
    if (ordenSel === "horas") visibles.sort((a, b) => (Number(a.tiempoHoras) || 999) - (Number(b.tiempoHoras) || 999));
    else if (ordenSel === "nivel") visibles.sort((a, b) => (nivelOrden[comoTexto(a.nivel)] ?? 9) - (nivelOrden[comoTexto(b.nivel)] ?? 9));
    else if (ordenSel === "alfabetico") visibles.sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || ""), "es"));
    const botonFiltro = (campo, valor, etiqueta, activo, cuenta) =>
      `<button type="button" class="boton${activo ? " activo" : ""}" data-proyecto-filtro="${campo}" data-valor="${esc(valor)}" aria-pressed="${activo ? "true" : "false"}">${esc(etiqueta)}${Number.isFinite(cuenta) ? ` (${cuenta})` : ""}</button>`;
    const filtrosRol = rolesDisponibles.length
      ? `<p class="proyectos-filtro" role="group" aria-label="Filtrar por rol">
          <span class="proyectos-filtro-rotulo">Rol:</span>
          ${botonFiltro("rol", "", "Todos", !rolSel, lista.length)}
          ${rolesDisponibles.map((r) => botonFiltro("rol", r, rolLegible(r), rolSel === r, lista.filter((p) => comoLista(p.roles).includes(r)).length)).join("")}
        </p>`
      : "";
    const filtrosNivel = nivelesDisponibles.length
      ? `<p class="proyectos-filtro" role="group" aria-label="Filtrar por nivel">
          <span class="proyectos-filtro-rotulo">Nivel:</span>
          ${botonFiltro("nivel", "", "Todos", !nivelSel, lista.length)}
          ${nivelesDisponibles.map((n) => botonFiltro("nivel", n, n, nivelSel === n, lista.filter((p) => comoTexto(p.nivel) === n).length)).join("")}
        </p>`
      : "";
    const filtrosArea = areasDisponibles.length
      ? `<p class="proyectos-filtro" role="group" aria-label="Filtrar por área">
          <span class="proyectos-filtro-rotulo">Área:</span>
          ${botonFiltro("area", "", "Todas", !areaSel, lista.length)}
          ${areasDisponibles.map((a) => botonFiltro("area", a, ETIQUETA_AREA[a] || a, areaSel === a, lista.filter((p) => comoTexto(p.ruta) === a).length)).join("")}
        </p>`
      : "";
    const filtrosOrden = `<p class="proyectos-filtro proyectos-orden" role="group" aria-label="Ordenar el catálogo">
        <span class="proyectos-filtro-rotulo">Orden:</span>
        ${ORDENES.map(([valor, etiqueta]) => `<button type="button" class="boton${ordenSel === valor ? " activo" : ""}" data-proyecto-orden="${valor}" aria-pressed="${ordenSel === valor}">${etiqueta}</button>`).join("")}
      </p>`;
    const cuentaProyectos = `<p class="proyectos-cuenta nota-pie" role="status">${visibles.length} de ${lista.length} proyectos${areaSel || rolSel || nivelSel ? " con los filtros puestos" : ""}.</p>`;
    const metadatosDe = (p) => {
      const partes = [];
      if (comoTexto(p.nivel)) partes.push(esc(comoTexto(p.nivel)));
      const roles = comoLista(p.roles).map(rolLegible);
      if (roles.length) partes.push(esc(roles.join(", ")));
      const t = Number(p.tiempoHoras);
      if (Number.isFinite(t) && t > 0) partes.push(`${t} h`);
      const nHitos = comoLista(p.hitos).length;
      if (nHitos) partes.push(`${nHitos} hitos`);
      return partes.join(" · ");
    };
    const conPaquete = (id) => (window.PAQUETES && window.PAQUETES[id]) || null;
    const filas = visibles.map((p) => {
      const paq = p.paquete || conPaquete(p.id);
      return `<li>
      <a href="#/proyectos/${esc(p.id)}"><strong>${esc(p.titulo)}</strong></a>
      ${metadatosDe(p) ? `<span class="proyecto-fila-meta">${metadatosDe(p)}</span>` : ""}
      ${paq ? `<a class="enlace-descarga" href="paquetes/${esc(paq.archivo)}" download aria-label="Descargar el paquete de ${esc(p.titulo)}">Descargar código${Number.isFinite(Number(paq.bytes)) ? ` · ${Math.round(Number(paq.bytes) / 1024)} KB` : ""}</a>` : ""}
      <br /><span class="nota-pie">${esc(p.resumen || "")}</span></li>`;
    }).join("");
    const nDescargables = lista.filter((p) => p.paquete || (window.PAQUETES && window.PAQUETES[p.id])).length;
    // Índice de descargas: los paquetes en un solo sitio, con su tamaño. El detalle sigue en cada ficha.
    const descargables = lista.filter((p) => p.paquete || (window.PAQUETES && window.PAQUETES[p.id]));
    const tablaDescargas = descargables.length
      ? `<details class="proyectos-descargas" id="proyectos-descargas">
           <summary>${descargables.length} proyectos con código descargable</summary>
           <table class="tabla-datos">
             <caption>Código comentado, datos de ejemplo y verificador</caption>
             <thead><tr><th scope="col">proyecto</th><th scope="col">paquete</th><th scope="col">tamaño</th></tr></thead>
             <tbody>${descargables.map((p) => {
               const q = p.paquete || window.PAQUETES[p.id];
               const kb = Number.isFinite(Number(q.bytes)) ? `${Math.round(Number(q.bytes) / 1024)} KB` : "—";
               return `<tr><td><a href="#/proyectos/${esc(p.id)}">${esc(p.id)} · ${esc(p.titulo)}</a></td><td><a href="paquetes/${esc(q.archivo)}" download>${esc(q.archivo)}</a></td><td>${kb}</td></tr>`;
             }).join("")}</tbody>
           </table>
         </details>`
      : "";
    return `<div class="migas"><a href="#/">Inicio</a> › Proyectos</div>
      <h1>Proyectos</h1>
      <p class="nota-pie">Cada proyecto trae sus datos, sus hitos, su rúbrica y una entrega de referencia para comparar. Lo que entregas se queda en tu equipo.${nDescargables ? ` <strong>${nDescargables} proyectos incluyen su código descargable.</strong>` : ""}</p>
      ${tablaDescargas}
      ${lista.length ? `<section class="proyectos-filtros" aria-label="Filtrar el catálogo">${filtrosRol}${filtrosArea}${filtrosNivel}${filtrosOrden}</section>${cuentaProyectos}` : ""}
      ${!lista.length
        ? `<div class="estado-vacio" id="proyectos-vacio"><p class="estado-titulo">Todavía no hay proyectos en esta copia</p><p>Puedes seguir con las <a href="#/laboratorios">prácticas de laboratorio</a> o <a href="#/buscar">buscar un concepto</a>.</p></div>`
        : (visibles.length
          ? `<ol class="lista-proyectos" id="lista-proyectos">${filas}</ol>`
          : `<div class="estado-vacio" id="proyectos-sin-filtro"><p class="estado-titulo">Ningún proyecto con esos filtros</p><p>Prueba a quitar alguno: hay ${lista.length} proyectos en total.</p><p class="acciones-fila"><button type="button" class="boton" data-proyecto-filtro="reset" data-valor="">Quitar filtros</button></p></div>`)}`;
  };

  // T35 · Descargar el starter de un proyecto.
  alDocumento("click", (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target.closest("[data-starter-proyecto]") : null;
    if (!t2) return;
    const id = t2.dataset.starterProyecto;
    const p = (typeof Proyectos !== "undefined" ? Proyectos.PROYECTOS : []).find((x) => x.id === id);
    if (!p) return;
    descargar(p.id.toLowerCase() + "-starter.md", p.starter, "text/markdown;charset=utf-8");
  });

  // T14 · Filtro del catálogo de proyectos por rol y por nivel. Es estado de PANTALLA (vive en
  // memoria), no una ruta: filtrar no cambia el hash ni invalida un enlace guardado a un proyecto.
  alDocumento("click", (ev) => {
    const orden = ev.target && ev.target.closest ? ev.target.closest("[data-proyecto-orden]") : null;
    if (orden) { filtroProyectos.orden = orden.dataset.proyectoOrden || "relevancia"; render(); return; }
    const b = ev.target && ev.target.closest ? ev.target.closest("[data-proyecto-filtro]") : null;
    if (!b) return;
    const campo = b.dataset.proyectoFiltro;
    if (campo === "reset") { filtroProyectos.rol = ""; filtroProyectos.nivel = ""; filtroProyectos.area = ""; }
    else if (campo === "rol" || campo === "nivel" || campo === "area") filtroProyectos[campo] = b.dataset.valor || "";
    else return;
    render();
  });

    // ── Informe y portafolio (T40) ──────────────────────────────────────────────
  vistas.informe = () => {
    if (typeof Informe === "undefined") return estadoNoDisponible();
    const totalPreguntas = orden.reduce((s, c) => s + (Number((P.conceptos[c.id] || {}).q) || 0), 0);
    const inf = Informe.informe(intentos, totalPreguntas, P.conceptos);
    const c = inf.cobertura, r = inf.retencion, p = inf.practica;

    const fila = (etiqueta, valor, denominador, porcentaje, fechas, motivo) => `<tr>
      <th scope="row">${esc(etiqueta)}</th>
      <td>${valor} de ${denominador}</td>
      <td>${porcentaje === null ? "—" : porcentaje + " %"}</td>
      <td>${fechas || "—"}</td>
      <td class="nota-pie">${esc(motivo || "")}</td>
    </tr>`;

    return `<div class="migas"><a href="#/">Inicio</a> › Informe</div>
      <h1>Informe de aprendizaje</h1>
      <p class="nota-pie">Cobertura, retención y práctica miden cosas distintas: se enseñan separadas y no se combinan en una sola nota.</p>

      <table class="tabla-datos" id="informe-tabla">
        <caption>Tus cifras, con su denominador y sus fechas</caption>
        <thead><tr><th scope="col">medida</th><th scope="col">valor</th><th scope="col">porcentaje</th><th scope="col">fechas</th><th scope="col">nota</th></tr></thead>
        <tbody>
          ${fila("Cobertura", c.valor, c.denominador, c.porcentaje, c.desde ? c.desde + " … " + c.hasta : "—", c.motivo)}
          ${fila("Retención", r.valor, r.denominador, r.porcentaje, "", r.motivo)}
          ${fila("Práctica", p.intentos, p.dias + " días", p.tasaDeAcierto, p.desde ? p.desde + " … " + p.hasta : "—", "")}
        </tbody>
      </table>

      <h2>Siguiente paso</h2>
      <p id="informe-siguiente">${esc(inf.siguiente.texto)}</p>

      <h2>Exportar</h2>
      <form class="form-proyecto" id="form-informe">
        <p class="nota-pie">Se exporta SOLO lo que marques.</p>
        <label><input type="checkbox" data-informe-seccion="cobertura" checked /> Cobertura</label>
        <label><input type="checkbox" data-informe-seccion="retencion" checked /> Retención</label>
        <label><input type="checkbox" data-informe-seccion="practica" checked /> Práctica</label>
        <label><input type="checkbox" data-informe-seccion="siguiente" checked /> Siguiente paso</label>
        <p class="acciones-fila">
          <button type="button" class="boton activo" data-exportar-informe="json">Descargar JSON</button>
          <button type="button" class="boton" data-exportar-informe="html">Descargar HTML imprimible</button>
        </p>
        <span class="nota-pie" id="informe-aviso" role="status"></span>
      </form>
      <p class="nota-pie">Lo comprobado son números de tu historial; lo autoevaluado lo decides tú. Nada de esto sale de este equipo.</p>`;
  };

  // T40 · Exportar el informe con SOLO las secciones marcadas.
  alDocumento("click", (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target.closest("[data-exportar-informe]") : null;
    if (!t2) return;
    if (typeof Informe === "undefined") return;
    const seleccion = {};
    let marcadas = 0;
    $$("[data-informe-seccion]").forEach((caja) => { if (caja.checked) { seleccion[caja.dataset.informeSeccion] = true; marcadas++; } });
    const aviso = $("#informe-aviso");
    if (!marcadas) { if (aviso) aviso.textContent = "Marca al menos una sección para exportar."; return; }
    const totalPreguntas = orden.reduce((s, c) => s + (Number((P.conceptos[c.id] || {}).q) || 0), 0);
    const inf = Informe.informe(intentos, totalPreguntas, P.conceptos);
    const e = Informe.exportar(inf, seleccion);
    if (t2.dataset.exportarInforme === "json") {
      descargar(MARCA_ARCHIVO + "-informe.json", JSON.stringify({ ...e.json, generado: new Date().toISOString() }, null, 1), "application/json");
    } else {
      descargar(MARCA_ARCHIVO + "-informe.html", "<!doctype html><meta charset=\"utf-8\"><title>Informe</title>" + e.html, "text/html;charset=utf-8");
    }
    if (aviso) aviso.textContent = "Descargadas " + e.secciones.length + " sección" + (e.secciones.length === 1 ? "" : "es") + ".";
  });

    // ── Migración de entidades (T41) ──────────────────────────────────────────
  // El almacén se envuelve para que la migración no sepa si es localStorage u otra cosa.
  const almacenReal = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* sin sitio: no se rompe */ } },
    remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* igual */ } },
  };
  let RESULTADO_MIGRACION = null;
  if (typeof Migracion !== "undefined") {
    try { RESULTADO_MIGRACION = Migracion.migrar(almacenReal); }
    catch (error) { RESULTADO_MIGRACION = { ok: false, tipo: "error", motivo: "la migración falló: " + error.message }; }
    try { window.__migracion = RESULTADO_MIGRACION; } catch (e) { /* sin ventana */ }
  }

      // ── Cola de sincronización (T43) ───────────────────────────────────────────
  // La cola vive en localStorage: si se cierra el navegador sin conexión, lo pendiente sigue ahí.
  const CLAVE_COLA = "aprender.v1.cola";
  function leerCola() {
    try {
      const crudo = localStorage.getItem(CLAVE_COLA);
      if (!crudo) return Sincronizacion.estadoInicial();
      const v = JSON.parse(crudo);
      return v && Array.isArray(v.operaciones) ? v : Sincronizacion.estadoInicial();
    } catch (e) { return Sincronizacion.estadoInicial(); }
  }
  function guardarCola(estado) {
    try { localStorage.setItem(CLAVE_COLA, JSON.stringify(estado)); } catch (e) { /* sin sitio */ }
  }

  /** Envía una operación al servidor y CLASIFICA la respuesta; nunca lanza. */
  async function enviarOperacion(op) {
    try {
      const r = await fetch("/api/operaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ operationId: op.operationId, tipo: op.tipo, payload: op.payload }),
      });
      if (r.status === 200 || r.status === 201) return { resultado: "ok" };
      if (r.status === 409) return { resultado: "conflicto", motivo: "el servidor ya tiene ese id con otros datos" };
      if (r.status === 401) return { resultado: "sin-sesion" };
      return { resultado: "red", error: "el servidor respondió " + r.status };
    } catch (error) {
      return { resultado: "red", error: error && error.message ? error.message : "sin conexión" };
    }
  }

  /** Drena la cola y la guarda. Deja el resultado en window.__sync para poder comprobarlo. */
  let DRENANDO = null;
  async function sincronizar() {
    if (DRENANDO) return DRENANDO;
    const antes = leerCola();
    DRENANDO = (async () => {
      const r = await Sincronizacion.drenar(antes, enviarOperacion);
      guardarCola(r.estado);
      try { window.__sync = { hechas: r.hechas, rechazadas: r.rechazadas, pendiente: r.pendiente, parada: r.parada, aviso: r.aviso, sesionCaducada: r.estado.sesionCaducada }; } catch (e) { /* sin ventana */ }
      return r;
    })();
    try { return await DRENANDO; } finally { DRENANDO = null; }
  }

  // Al arrancar: converger lo guardado con lo que hubiera en memoria de esta pestaña, y drenar.
  sincronizar().catch(() => { /* el aviso ya queda en la cola */ });
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("online", () => { sincronizar().catch(() => { /* se reintenta luego */ }); });
  }

    // ── Conflictos pendientes de decidir (T44) ──────────────────────────────────
  const CLAVE_CONFLICTOS = "aprender.v1.conflictos";
  function leerConflictos() {
    try { const v = JSON.parse(localStorage.getItem(CLAVE_CONFLICTOS) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function guardarConflictos(lista) {
    try { localStorage.setItem(CLAVE_CONFLICTOS, JSON.stringify(lista || [])); } catch (e) { /* sin sitio */ }
  }
  /** Añade (o reemplaza por id) una entidad pendiente de resolución. */
  function anotarConflicto(entidad) {
    if (typeof Conflictos === "undefined") return;
    const lista = leerConflictos();
    const i = lista.findIndex((x) => x.id === entidad.id);
    if (i >= 0) lista[i] = entidad; else lista.push(entidad);
    guardarConflictos(lista);
  }

  vistas.conflictos = (arg) => {
    if (typeof Conflictos === "undefined") return estadoNoDisponible();
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    const lista = leerConflictos();
    const pendientes = Conflictos.pendientes(lista);
    const resueltas = lista.filter((x) => Conflictos.pendientes([x]).length === 0);

    if (!lista.length) {
      return `<div class="migas"><a href="#/">Inicio</a> › Conflictos</div>
        <h1>Conflictos</h1>
        <p class="nota-pie" id="conflictos-vacio">No hay nada pendiente de decidir. Cuando dos ediciones choquen, aparecerán aquí las dos versiones para que elijas: ninguna se descarta sola.</p>`;
    }

    const tarjetas = pendientes.map((e) => {
      const variantes = (e.variantes || []).map((v, i) => `<li class="variante">
        <p><strong>${esc(v.de || "variante " + (i + 1))}</strong> <span class="nota-pie">versión ${v.version} · ${esc(v.actualizado || "sin fecha")}</span></p>
        <pre class="contenido-variante">${esc(JSON.stringify(v.contenido, null, 1))}</pre>
        <button type="button" class="boton activo" data-elegir-conflicto="${esc(e.id)}" data-indice="${i}">Quedarme con esta</button>
      </li>`).join("");
      return `<li class="conflicto" data-conflicto-id="${esc(e.id)}">
        <p><strong>${esc(e.id)}</strong> <span class="pastilla">requiere decisión</span></p>
        <p class="nota-pie">${esc(e.motivo || "")}</p>
        <ul class="lista-variantes">${variantes}</ul>
      </li>`;
    }).join("");

    return `<div class="migas"><a href="#/">Inicio</a> › Conflictos</div>
      <h1>Conflictos</h1>
      ${crudo === "resuelto" ? '<p class="nota-pie" id="conflictos-aviso" role="status">Resuelto: se ha quedado con la variante elegida y la versión ha subido.</p>' : ""}
      <p class="nota-pie">${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"} de decisión. Se conservan TODAS las variantes: nada se pierde por decidir después.</p>
      ${pendientes.length ? `<ul class="lista-conflictos" id="lista-conflictos">${tarjetas}</ul>` : '<p class="nota-pie" id="conflictos-vacio">Nada pendiente.</p>'}
      ${resueltas.length ? `<p class="nota-pie">${resueltas.length} ya resuelta${resueltas.length === 1 ? "" : "s"}.</p>` : ""}`;
  };

  // T44 · Elegir una variante resuelve el conflicto y sube la versión.
  alDocumento("click", (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest("[data-elegir-conflicto]") : null;
    if (!b) return;
    if (typeof Conflictos === "undefined") return;
    const lista = leerConflictos();
    const i = lista.findIndex((x) => x.id === b.dataset.elegirConflicto);
    if (i < 0) return;
    const r = Conflictos.resolver(lista[i], Number(b.dataset.indice));
    if (!r.ok) return;
    lista[i] = r.entidad;
    guardarConflictos(lista);
    location.hash = "#/conflictos/resuelto";
  });

    // ── Cuenta, datos y transferencia (T45) ─────────────────────────────────────
  vistas.transferencia = (arg) => {
    if (typeof Transferencia === "undefined") return estadoNoDisponible();
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    const local = Transferencia.instantanea(almacenReal);
    // Sin sesión en la cuenta, el lado de la cuenta está vacío y se dice: no se inventa.
    const hayCuenta = false;
    const cuenta = Transferencia.instantanea({ get: () => null, set: () => {}, remove: () => {} });
    const c = Transferencia.comparar(local, cuenta);

    const filas = c.filas.filter((f) => f.local > 0 || f.cuenta > 0).map((f) => `<tr>
      <th scope="row">${esc(f.nombre)}</th>
      <td>${f.local}</td>
      <td>${f.cuenta}</td>
      <td>${esc(f.estado)}</td>
    </tr>`).join("");

    return `<div class="migas"><a href="#/">Inicio</a> › Datos</div>
      <h1>Cuenta, datos y transferencia</h1>
      ${crudo === "exportado" ? '<p class="nota-pie" id="transferencia-aviso" role="status">Descargado el paquete con todas tus entidades.</p>' : ""}
      ${crudo === "limpiado" ? '<p class="nota-pie" id="transferencia-aviso" role="status">Equipo limpio: se ha descargado el paquete y se han borrado los datos de esta cuenta.</p>' : ""}
      ${crudo.startsWith("error:") ? `<p class="nota-pie" id="transferencia-aviso" role="alert">${esc(crudo.slice(6))}</p>` : ""}

      <p class="nota-pie">${hayCuenta ? "Comparación entre este equipo y tu cuenta." : "No hay cuenta conectada: a la derecha se ve lo que habría en la cuenta, que ahora está vacío. La comparación sirve para no decidir a ciegas cuando la haya."}</p>

      <table class="tabla-datos" id="transferencia-tabla">
        <caption>Qué hay en cada lado</caption>
        <thead><tr><th scope="col">entidad</th><th scope="col">en este equipo</th><th scope="col">en la cuenta</th><th scope="col">estado</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="4">No hay datos guardados todavía.</td></tr>'}</tbody>
      </table>

      <p class="nota-pie" id="transferencia-recomendacion">${esc(c.recomendacion)}</p>

      <h2>Llevarte tus datos</h2>
      <p class="acciones-fila">
        <button type="button" class="boton activo" data-exportar-datos="1">Descargar todo</button>
        <button type="button" class="boton" data-cambiar-cuenta="1">Cambiar de cuenta (borra este equipo)</button>
      </p>
      <p class="nota-pie">Se descarga ANTES de borrar nada.</p>

      <h2>Traer tus datos</h2>
      <p class="acciones-fila"><input type="file" id="importar-datos" accept=".json,application/json" data-importar-datos="1" aria-label="Elegir paquete de datos" /></p>
      <span class="nota-pie" id="importar-aviso" role="status"></span>
      <p class="nota-pie">Importar escribe lo que venga y NO borra lo que no venga. Antes de escribir, guarda una copia de lo que hay.</p>`;
  };

  // T45 · Exportar todo, cambiar de cuenta e importar.
  alDocumento("click", (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target : null;
    if (!t2) return;
    if (typeof Transferencia === "undefined") return;
    if (t2.closest("[data-exportar-datos]")) {
      const p = Transferencia.exportar(almacenReal, new Date().toISOString());
      descargar(MARCA_ARCHIVO + "-datos.json", JSON.stringify(p, null, 1), "application/json");
      location.hash = "#/transferencia/exportado";
      return;
    }
    if (t2.closest("[data-cambiar-cuenta]")) {
      // Primero el paquete, después el borrado: nunca al revés.
      const r = Transferencia.cambiarDeCuenta(almacenReal, new Date().toISOString());
      descargar(MARCA_ARCHIVO + "-datos-antes-de-cambiar-cuenta.json", JSON.stringify(r.paquete, null, 1), "application/json");
      location.hash = "#/transferencia/limpiado";
      return;
    }
  });

  alDocumento("change", async (ev) => {
    const input = ev.target && ev.target.matches && ev.target.matches("[data-importar-datos]") ? ev.target : null;
    if (!input || !input.files || !input.files[0]) return;
    const aviso = $("#importar-aviso");
    try {
      const texto = await input.files[0].text();
      const paquete = JSON.parse(texto);
      const r = Transferencia.importar(almacenReal, paquete, { copia: true });
      if (!r.ok) { if (aviso) aviso.textContent = "No se ha importado: " + r.motivo; return; }
      if (r.copia) descargar(MARCA_ARCHIVO + "-copia-antes-de-importar.json", JSON.stringify(r.copia, null, 1), "application/json");
      if (aviso) aviso.textContent = r.motivo + ". Se ha descargado una copia de lo que había.";
      render();
    } catch (error) {
      if (aviso) aviso.textContent = "El fichero no es un paquete válido.";
    }
  });

    // ── Paquetes descargables y espacio (T46) ───────────────────────────────────
  vistas.paquetes = () => {
    return `<div class="migas"><a href="#/">Inicio</a> › Paquetes</div>
      <h1>Material sin conexión</h1>
      <p>Descarga una ficha con sus figuras, un laboratorio o un proyecto con sus datos.
      Se comprueban los archivos guardados de esta versión. Eliminar material conserva tus notas, respuestas y entregas.</p>
      <p><a href="#/buscar/">Elegir en la biblioteca</a></p>
      <label for="offline-elegir">Recurso que quieres gestionar</label>
      <select id="offline-elegir"><option value="">Elegir un recurso</option>${Object.entries(window.MANIFIESTO_OFFLINE?.recursos || {}).map(([id, r]) => `<option value="${esc(id)}">${esc(r.titulo)}</option>`).join("")}</select>
      <div id="offline-gestion"></div>
      <h2>Descargas solicitadas</h2><ul id="offline-guardados"><li>Comprobando…</li></ul>
      <button type="button" class="boton" id="offline-liberar-antiguas">Liberar material de versiones anteriores</button>
      <p id="offline-liberar-aviso" role="status"></p>
      <p class="nota-pie">Las descargas de versiones anteriores se conservan, pero deben verificarse de nuevo antes de usarlas con una versión nueva.</p>`;
  };

    // ── Service worker (T47) ───────────────────────────────────────────────────
  // Solo con http(s): en file:// no hay ámbito y registrar fallaría sin aportar nada.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    // F04 · Validación entre versiones. Un worker NUEVO se queda esperando (no hay `skipWaiting`, a
    // propósito). Esa espera es la señal de que hay una versión nueva: se AVISA y se ofrece recargar.
    // No se recarga sola: hacerlo mientras alguien responde le borraría el paso por el que iba.
    const avisarDeVersionNueva = () => {
      if (document.getElementById("aviso-version")) return;
      const aviso = document.createElement("p");
      aviso.id = "aviso-version";
      aviso.setAttribute("role", "status");
      aviso.className = "nota-pie aviso-version";
      aviso.innerHTML = 'Hay una versión nueva de ' + MARCA + '. <a class="boton" href="#recargar" id="recargar-version">Recargar</a> ' +
        '<span>Tu trabajo está guardado; puedes seguir y recargar cuando termines.</span>';
      document.body.insertBefore(aviso, document.body.firstChild);
      const enlace = aviso.querySelector("#recargar-version");
      if (enlace) enlace.addEventListener("click", (ev) => { ev.preventDefault(); location.reload(); });
    };
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("arbol-servicio.js", { scope: "./" }).then((reg) => {
        try { window.__sw = { activo: true, alcance: reg.scope, esperando: !!reg.waiting }; } catch (e) { /* sin ventana */ }
        // Ya había uno esperando al cargar: hay versión nueva.
        if (reg.waiting) avisarDeVersionNueva();
        // Y si aparece mientras la pestaña está abierta, también.
        reg.addEventListener("updatefound", () => {
          const nuevo = reg.installing;
          if (!nuevo) return;
          nuevo.addEventListener("statechange", () => {
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) avisarDeVersionNueva();
          });
        });
      }).catch((error) => {
        try { window.__sw = { activo: false, error: String(error && error.message) }; } catch (e) { /* igual */ }
      });
    });
  }

    // ── Avisar de un problema (T49) ─────────────────────────────────────────────
  vistas.incidencia = (arg) => {
    if (typeof Incidencias === "undefined") return estadoNoDisponible();
    let crudo = String(arg || "");
    try { crudo = decodeURIComponent(crudo); } catch { /* tal cual */ }
    const revisada = crudo === "enviada" ? (() => {
      try { return JSON.parse(sessionStorage.getItem("aprender.ultima-incidencia") || "null"); } catch (e) { return null; }
    })() : null;

    // El recurso se propone desde donde está la persona: casi siempre es el sitio donde falló.
    const donde = String(location.hash || "#/").slice(0, 200);
    const revision = (() => {
      try { const m = MESA.manifiesto; return m && Array.isArray(m.conjuntos) ? "paquetes-" + m.conjuntos.length : "sin-manifiesto"; } catch (e) { return "sin-manifiesto"; }
    })();

    const resultado = revisada
      ? `<section id="incidencia-resultado">
          <h2>Esto es lo que se envía</h2>
          <pre class="contenido-variante">${esc(JSON.stringify(revisada, null, 1))}</pre>
          ${(revisada.descartadas || []).length
            ? `<p class="nota-pie" id="incidencia-descartadas" role="status">${esc(revisada.aviso)}</p>`
            : '<p class="nota-pie" id="incidencia-sin-privados" role="status">No había nada privado que descartar.</p>'}
          <p class="acciones-fila">
            <button type="button" class="boton activo" data-descargar-incidencia="1">Descargar el aviso</button>
            <a class="boton" href="#/incidencia">Avisar de otro</a>
          </p>
        </section>`
      : "";

    return `<div class="migas"><a href="#/">Inicio</a> › Avisar de un problema</div>
      <h1>Avisar de un problema</h1>
      <p class="nota-pie">Se envía el recurso, la revisión del contenido, lo que cuentes y cuatro datos técnicos. <strong>No se envían tus notas, dudas, entregas ni tu correo</strong>: se descartan y se te dice cuáles.</p>
      <form class="form-duda" id="form-incidencia">
        <label class="nota-pie" for="inc-recurso">Dónde ocurrió</label>
        <input type="text" id="inc-recurso" data-inc-recurso="1" value="${esc(donde)}" />
        <label class="nota-pie" for="inc-revision">Revisión del contenido</label>
        <input type="text" id="inc-revision" data-inc-revision="1" value="${esc(revision)}" />
        <label class="nota-pie" for="inc-mensaje">Qué pasó</label>
        <textarea id="inc-mensaje" data-inc-mensaje="1" rows="4" placeholder="Cuenta qué esperabas y qué ocurrió."></textarea>
        <p class="acciones-fila"><button type="submit" class="boton activo">Preparar el aviso</button></p>
        <span class="nota-pie" id="incidencia-aviso" role="status"></span>
      </form>
      ${resultado}`;
  };

  // T49 · Preparar el aviso: contexto técnico mínimo, y el módulo descarta lo privado.
  alDocumento("submit", (ev) => {
    const form = ev.target;
    if (!form || form.id !== "form-incidencia") return;
    ev.preventDefault();
    if (typeof Incidencias === "undefined") return;
    const recurso = String((form.querySelector("[data-inc-recurso]") || {}).value || "");
    const revision = String((form.querySelector("[data-inc-revision]") || {}).value || "");
    const mensaje = String((form.querySelector("[data-inc-mensaje]") || {}).value || "");
    // Contexto técnico: navegador, pantalla, idioma y si hay conexión. Nada de lo que la persona escribió.
    const contexto = {
      navegador: String((navigator.userAgent || "").slice(0, 120)),
      pantalla: (typeof screen !== "undefined" ? screen.width + "x" + screen.height : "?"),
      idioma: String(navigator.language || ""),
      conexion: (typeof navigator.onLine === "boolean" ? (navigator.onLine ? "con" : "sin") : "?"),
    };
    const r = Incidencias.crearIncidencia({ recurso, revision, mensaje, contexto });
    const aviso = $("#incidencia-aviso");
    if (!r.ok) { if (aviso) { aviso.textContent = "No se puede preparar: " + r.motivo; aviso.setAttribute("role", "alert"); } return; }
    try { sessionStorage.setItem("aprender.ultima-incidencia", JSON.stringify(r.incidencia)); } catch (e) { /* sin sitio */ }
    location.hash = "#/incidencia/enviada";
  });

  alDocumento("click", (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest("[data-descargar-incidencia]") : null;
    if (!b) return;
    try {
      const t = sessionStorage.getItem("aprender.ultima-incidencia");
      if (t) descargar(MARCA_ARCHIVO + "-aviso.json", t, "application/json");
    } catch (e) { /* nada */ }
  });

    // ── Avisos y preferencias (T51) ─────────────────────────────────────────────
  const CLAVE_AVISOS = "aprender.v1.avisos";
  let ESTADO_AVISOS = (() => {
    try { return Avisos.deserializar(localStorage.getItem(CLAVE_AVISOS)); } catch (e) { return Avisos.estadoInicial(); }
  })();
  function guardarAvisos() {
    // Las preferencias van en su propia clave: así se pueden cambiar sin tocar los avisos.
    try {
      localStorage.setItem(CLAVE_AVISOS, Avisos.serializar(ESTADO_AVISOS));
      localStorage.setItem("aprender.v1.avisos-pref", JSON.stringify(ESTADO_AVISOS.prefs || {}));
      window.__avisos = { visibles: Avisos.visibles(ESTADO_AVISOS).avisos.length, prefs: ESTADO_AVISOS.prefs };
    } catch (e) { /* sin sitio */ }
  }

  vistas.avisos = (arg) => {
    if (typeof Avisos === "undefined") return estadoNoDisponible();
    const v = Avisos.visibles(ESTADO_AVISOS);
    const lista = v.avisos.map((x) => `<li class="aviso${x.leido ? " leido" : ""}" data-aviso-id="${esc(x.id)}">
      <p><strong>${esc(x.tipo)}</strong>${x.leido ? ' <span class="pastilla">leído</span>' : ""}</p>
      <p>${esc(x.mensaje)}${x.cambio ? ' <span class="nota-pie">· ' + esc(x.cambio) + "</span>" : ""}</p>
      ${x.enlace ? `<p><a href="${esc(x.enlace)}">Ver el concepto</a></p>` : ""}
      <p class="acciones-fila">
        ${x.leido ? "" : `<button type="button" class="boton" data-aviso-leido="${esc(x.id)}">Marcar leído</button>`}
        <button type="button" class="boton" data-aviso-archivar="${esc(x.id)}">Archivar</button>
      </p>
    </li>`).join("");

    const tipos = Avisos.TIPOS.map((t) => `<label><input type="checkbox" data-aviso-pref="${esc(t)}" ${(ESTADO_AVISOS.prefs || {})[t] === false ? "" : "checked"} /> ${esc(t)}</label>`).join(" ");

    return `<div class="migas"><a href="#/">Inicio</a> › Avisos</div>
      <h1>Avisos</h1>
      <p class="nota-pie" id="avisos-resumen">${v.avisos.length} visibles · ${v.sinLeer} sin leer · ${v.archivados} archivados${v.ocultosPorPreferencia ? " · " + v.ocultosPorPreferencia + " ocultos por tus preferencias" : ""}.</p>
      ${lista ? `<ul class="lista-avisos" id="lista-avisos">${lista}</ul>` : '<p class="nota-pie" id="avisos-vacio">No hay avisos que enseñar.</p>'}
      <h2>Qué avisos quieres ver</h2>
      <p class="nota-pie">Apagar uno deja de enseñarlo, pero NO lo borra: se vuelve a ver si lo enciendes.</p>
      <p class="acciones-fila" role="group" aria-label="Tipos de aviso">${tipos}</p>
      <p class="nota-pie">Los avisos se quedan en la app. No se piden permisos de notificaciones ni se envía ningún correo.</p>`;
  };

  // T51 · Leído, archivar y preferencias: se guardan y se repinta.
  alDocumento("click", (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target : null;
    if (!t2 || typeof Avisos === "undefined") return;
    const leido = t2.closest("[data-aviso-leido]");
    if (leido) { ESTADO_AVISOS = Avisos.marcar(ESTADO_AVISOS, leido.dataset.avisoLeido, "leido"); guardarAvisos(); render(); return; }
    const arch = t2.closest("[data-aviso-archivar]");
    if (arch) { ESTADO_AVISOS = Avisos.marcar(ESTADO_AVISOS, arch.dataset.avisoArchivar, "archivado"); guardarAvisos(); render(); return; }
  });

  alDocumento("change", (ev) => {
    const caja = ev.target && ev.target.matches && ev.target.matches("[data-aviso-pref]") ? ev.target : null;
    if (!caja || typeof Avisos === "undefined") return;
    ESTADO_AVISOS = Avisos.preferencia(ESTADO_AVISOS, caja.dataset.avisoPref, caja.checked);
    guardarAvisos();
    render();
  });

    // ── Recordatorios opt-in (T55) ──────────────────────────────────────────────
  const CLAVE_RECORDATORIOS = "aprender.v1.recordatorios";
  let ESTADO_RECORDATORIOS = (() => {
    try { const v = JSON.parse(localStorage.getItem(CLAVE_RECORDATORIOS) || "null"); return v && v.permiso ? v : Recordatorios.estadoInicial(); }
    catch (e) { return Recordatorios.estadoInicial(); }
  })();
  function guardarRecordatorios() {
    try {
      localStorage.setItem(CLAVE_RECORDATORIOS, JSON.stringify(ESTADO_RECORDATORIOS));
      window.__recordatorios = { permiso: ESTADO_RECORDATORIOS.permiso, programados: (ESTADO_RECORDATORIOS.programados || []).length, activo: ESTADO_RECORDATORIOS.activo, estudioDisponible: ESTADO_RECORDATORIOS.estudioDisponible };
    } catch (e) { /* sin sitio */ }
  }

  vistas.recordatorios = () => {
    if (typeof Recordatorios === "undefined") return estadoNoDisponible();
    const r = ESTADO_RECORDATORIOS;
    const programados = (r.programados || []).map((x) => `<li>${esc(x.titulo)} <span class="nota-pie">· ${esc(x.cuando)} · ${esc(x.enlace)}</span></li>`).join("");
    return `<div class="migas"><a href="#/">Inicio</a> › Recordatorios</div>
      <h1>Recordatorios</h1>
      <p class="nota-pie" id="recordatorios-estudio">Puedes estudiar siempre, con permiso o sin él. <a href="#/sesion">Empezar una sesión</a>.</p>
      <p class="acciones-fila" id="recordatorios-acciones">
        <button type="button" class="boton activo" data-recordatorio-activar="1">Activar recordatorios</button>
        <button type="button" class="boton" data-recordatorio-desactivar="1">Desactivar</button>
      </p>
      ${programados ? `<ul class="lista-recordatorios" id="lista-recordatorios">${programados}</ul>` : '<p class="nota-pie" id="recordatorios-vacio">No hay ningún recordatorio programado.</p>'}
      <span class="nota-pie" id="recordatorios-aviso" role="status"></span>
      <p class="nota-pie">Los recordatorios se piden UNA vez. Si dices que no, no se vuelve a preguntar y el portal funciona igual. Desactivar cancela los que hubiera.</p>`;
  };

  // T55 · Activar y desactivar recordatorios, por delegación.
  alDocumento("click", async (ev) => {
    const t2 = ev.target && ev.target.closest ? ev.target : null;
    if (!t2 || typeof Recordatorios === "undefined") return;
    if (t2.closest("[data-recordatorio-activar]")) {
      const pedir = (typeof Notification !== "undefined" && Notification.requestPermission)
        ? async () => ({ concedido: (await Notification.requestPermission()) === "granted" })
        : null;
      ESTADO_RECORDATORIOS = await Recordatorios.pedirPermiso(ESTADO_RECORDATORIOS, pedir);
      if (ESTADO_RECORDATORIOS.permiso === "concedido") {
        ESTADO_RECORDATORIOS = Recordatorios.programar(ESTADO_RECORDATORIOS, [
          { id: "sesion-manana", cuando: "mañana 09:00", enlace: "#/sesion", titulo: "Sesión de repaso" },
        ]);
      }
      guardarRecordatorios();
      render();
      return;
    }
    if (t2.closest("[data-recordatorio-desactivar]")) {
      ESTADO_RECORDATORIOS = Recordatorios.desactivar(ESTADO_RECORDATORIOS, (cuantos) => cuantos);
      guardarRecordatorios();
      render();
    }
  });

    const inicioVista = performance.now();
  const htmlVista = (vistas[vista] || vistas.inicio)(arg, disponibilidadBiblioteca);
  medirCoste("muestra.vista", inicioVista);
  const inicioDom = performance.now();
  principal.removeAttribute("aria-busy");
  principal.innerHTML = htmlVista;
  ajustarFiltrosBusqueda();
  if (window.Offline) Offline.conectar(principal, vista, arg, () => {
    if (vista === "laboratorios" || vista === "experimentos") {
      MESA.pidiendoDato = {}; MESA.errores = {}; render();
    }
  });
  medirCoste("muestra.dom", inicioDom);
  // Si los datos son más nuevos que este código, se dice en pantalla y no se simula normalidad.
  if (RESULTADO_MIGRACION && RESULTADO_MIGRACION.tipo === "futura") {
    const aviso = document.createElement("p");
    aviso.id = "aviso-migracion";
    aviso.setAttribute("role", "alert");
    aviso.className = "nota-pie";
    aviso.textContent = "Tus datos son de una versión más nueva de la que entiende esta copia del portal. No se ha tocado nada: actualiza el portal para seguir.";
    if (!document.getElementById("aviso-migracion") && principal.parentElement) principal.parentElement.insertBefore(aviso, principal);
  }
      // La entrada de la vista la anima movimiento.css. Se quita y se vuelve a poner para
      // que la animación se reinicie en cada cambio de ruta, y se fuerza un reflow en medio
      // (sin él, el navegador agrupa los dos cambios y no anima nada).
      principal.classList.remove("entrando");
      void principal.offsetWidth;
      principal.classList.add("entrando");
      if (vista === "concepto") {
        conectarQuizzes(principal, arg);
        conectarPracticas(arg);
        conectarAplazo(arg);
        vigilarLectura(arg);
        construirIndiceFicha();
        ultimo = arg;
        escribir(CLAVES.ultimo, ultimo);
        const p = progreso[arg];
        if (p?.visto) $("#principal").scrollTop = 0;
      }
      if (vista === "repaso") montarSesionRepaso();
      if (vista === "progreso") conectarProgreso();
      if (vista === "plan") conectarPlan();
      if (vista === "inicio" || vista === "pendientes") conectarPendientes();
      if (vista === "inicio") conectarInicio();
      if (vista === "glosario") conectarGlosario();
      if (["entrar", "registro", "recuperar", "cuenta"].includes(vista)) conectarCuenta();
      if (vista === "precios") conectarPrecios();
      if (vista === "analitica") { await pintarPanelAnalitica(); conectarConsentimiento(); }
      conectarBotones(principal);
      marcarNavegacion(vista);
      montarProgresoLectura(vista);
      conectarPortada();
      const inicioLateral = performance.now();
      actualizarLateral();
      medirCoste("muestra.lateral", inicioLateral);
      if (vista !== "concepto") window.scrollTo({ top: 0 });
      document.title = (vista === "concepto" ? `${P.conceptos[arg]?.t} — ` : "") + MARCA;
      // Se avisa a la analítica de lo que se acaba de abrir. Las dos llamadas son
      // excluyentes: una ficha se cuenta como concepto abierto y lo demás como sección
      // vista. El panel de lo que se mide queda FUERA: mirar la medición no puede contar
      // como una visita, o la cifra se alimentaría a sí misma y el panel sería mentira.
      if (vista === "concepto") medir("conceptoAbierto", arg);
      else if (vista !== "analitica") medir("seccionVista", [vista, arg].filter(Boolean).join("/") || "inicio");
    } catch (e) {
      principal.removeAttribute("aria-busy");
      principal.innerHTML = `<h1>${esc(vista === "concepto" ? P.conceptos[arg]?.t || "No se ha podido cargar" : "No se ha podido cargar")}</h1>
        <div class="estado-error" role="alert"><p class="estado-titulo" id="contenido-error">${esc(e.message)}.</p>
        <p>Puede faltar material en este equipo.</p>
        <p><button type="button" class="boton primario" data-reintentar-vista="1">Reintentar</button> <a class="boton" href="#/buscar/">Volver a la biblioteca</a></p></div>`;
      if (window.Offline) Offline.conectar(principal, vista, arg, () => render());
      conectarBotones(principal);
    }
    medirCoste("muestra.render", inicioRender);
  }

  function conectarBotones(raiz) {
    // Índice de la ficha: el botón lleva al encabezado, sin cambiar de ruta (un `href="#…"`
    // dispararía el enrutador por hash y sacaría de la ficha).
    $$("[data-indice]", raiz).forEach((boton) => boton.addEventListener("click", () => {
      const destino = document.getElementById(boton.dataset.indice);
      if (destino && destino.scrollIntoView) destino.scrollIntoView({ block: "start" });
    }));
    $$("[data-agenda-restaurar]", raiz).forEach(boton => boton.addEventListener("click", () => {
      if (!boton.isConnected || boton.disabled) return;
      const b = leerSesion() || {};
      const lista = Array.isArray(b.agendasPendientes) ? [...b.agendasPendientes] : [];
      const indice = Number(boton.dataset.agendaRestaurar), elegida = lista[indice];
      if (!Number.isInteger(indice) || !Array.isArray(elegida?.sesion?.items) || !Array.isArray(elegida?.sesion?.agenda?.actividades)) return;
      boton.disabled = true;
      lista.splice(indice, 1);
      if (hayActividadSesion(b.sesion)) lista.push({ guardadaEn: Date.now(), sesion: b.sesion });
      escribirSesion({ ...b, sesion: elegida.sesion, agendasPendientes: lista });
      render();
    }));
    $$("[data-sesion-descargar-recuperacion]", raiz).forEach(boton => boton.addEventListener("click", () => {
      const copia = leerSesion();
      descargar(MARCA_ARCHIVO + "-respuestas-recuperables.json", JSON.stringify(copia?.recuperacionSesion || [], null, 2), "application/json");
    }));
    $$("[data-reintentar-vista]", raiz).forEach((b) => b.addEventListener("click", () => render()));
    $$("[data-reintentar-datos]", raiz).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.reintentarDatos;
      if (window.__MESA?.pidiendoDato) delete window.__MESA.pidiendoDato[id];
      if (window.__MESA?.errores) delete window.__MESA.errores[id];
      render();
    }));
    $$("[data-busqueda-reintentar]", raiz).forEach((boton) => boton.addEventListener("click", () => {
      errorBusqueda = null;
      render();
    }));
    $$("#sesion-modo", raiz).forEach((select) => select.addEventListener("change", () => {
      const borrador = leerSesion() || {};
      if (!borrador.sesion || Object.keys(borrador.sesion.respuestas || {}).length) return;
      const modo = MODOS_VALIDOS.includes(select.value) ? select.value : "inmediata";
      // T20 · La SESIÓN y la FICHA usan ajustes distintos (`modoSesion` y `modoRespuesta`). Si solo se
      // cambiaba el primero, elegir «con pistas y reintentos» no cambiaba nada al responder: el bloque
      // seguía en inmediata. Se sincronizan los dos.
      pref = { ...pref, modoSesion: modo, modoRespuesta: modo };
      escribir(CLAVES.pref, pref);
      escribirSesion({ ...borrador, sesion: { ...borrador.sesion, modo } });
      render();
    }));
    // T20 · El tiempo de Hoy se elige (10, 20, 40 o uno propio) y se guarda en las preferencias.
    // Cambiarlo recompone el plan, pero NO toca las respuestas ya dadas: si las hay, se fija.
    // T20 · La práctica la cierra la persona: al declarar cómo salió, la actividad se completa con su
    // evidencia, se guarda la agenda y la sesión pasa a lo siguiente.
    $$("[data-agenda-posponer]", raiz).forEach((boton) => boton.addEventListener("click", () => {
      if (!boton.isConnected) return;
      const borrador = leerSesion() || {};
      const s = borrador.sesion;
      if (!s || !s.agenda) return;
      const id = boton.getAttribute("data-actividad");
      const nueva = { ...s.agenda, actividades: s.agenda.actividades.map((a) => (a.id === id && !a.completada ? { ...a, pospuesta: true } : a)) };
      escribirSesion({ ...borrador, sesion: { ...s, agenda: nueva } });
      render();
    }));
    $$("[data-agenda-autoevaluar]", raiz).forEach((boton) => boton.addEventListener("click", () => {
      if (!boton.isConnected) return;
      const borrador = leerSesion() || {};
      const estadoS = borrador.sesion;
      if (!estadoS || !estadoS.agenda || typeof Agenda === "undefined") return;
      const act = Agenda.siguiente(estadoS.agenda);
      if (!act) return;
      const nueva = Agenda.completar(estadoS.agenda, act.id, { autoevaluacion: boton.getAttribute("data-agenda-autoevaluar") });
      if (nueva === estadoS.agenda) return;
      escribirSesion({ ...borrador, sesion: { ...estadoS, agenda: nueva } });
      render();
    }));
    $$("[data-plan-minutos]", raiz).forEach((campo) => campo.addEventListener("change", () => {
      if (!campo.isConnected || campo.disabled) return;
      const borrador = leerSesion() || {};
      if (hayActividadSesion(borrador.sesion)) return;
      const minutos = typeof PlanHoy !== "undefined" && PlanHoy.minutosElegidos
        ? PlanHoy.minutosElegidos(campo.value)
        : Number(campo.value) || 20;
      pref = { ...pref, objetivoDia: minutos };
      escribir(CLAVES.pref, pref);
      // Sin actividad hecha, cambiar el tiempo recompone: se descartan agenda e items para que se
      // reconstruyan con el presupuesto nuevo. Con algo hecho, el tiempo ya está fijado (arriba).
      escribirSesion({ ...borrador, sesion: { ...borrador.sesion, agenda: null, items: [] } });
      render();
    }));
    // T20 · Con el tiempo agotado: seguir (reinicia el contador) o terminar. Ninguna de las dos
    // entrega ni descarta nada; pausar es solo salir, y el borrador ya está guardado.
    $$("[data-sesion-agotada]", raiz).forEach((boton) => boton.addEventListener("click", () => {
      if (!boton.isConnected) return;
      const accion = boton.getAttribute("data-sesion-agotada");
      const borrador = leerSesion() || {};
      if (!borrador.sesion) return;
      if (accion === "continuar") {
        escribirSesion({ ...borrador, sesion: { ...borrador.sesion, presupuestoAgotado: false, iniciadaEn: new Date().toISOString() } });
        render();
      } else if (accion === "terminar") {
        escribirSesion({ ...borrador, sesion: { ...borrador.sesion, presupuestoAgotado: false, terminada: true } });
        render();
      }
    }));
    $$("[data-sesion-entregar]", raiz).forEach((boton) => boton.addEventListener("click", () => {
      if (!boton.isConnected) return;
      const borrador = leerSesion() || {};
      const estado = borrador.sesion;
      if (!estado || estado.entregada) return;
      let agenda = estado.agenda;
      for (const clave of Sesion.pendientesDeEntregar(estado)) {
        const respuesta = estado.respuestas[clave];
        if (!respuesta || typeof respuesta.elegida !== "number") continue;
        const elegida = estado.textos?.[clave] ?? respuesta.elegida;
        apuntarIntento(clave, { elegida, correcta: respuesta.correcta === true, seguro: null, segundos: 0 });
        programar(clave, respuesta.correcta === true, null);
        const item = estado.items.find(it => it.clave === clave);
        const q = item ? contenidoDe(item.concepto)?.quizzes?.[item.indice] : null;
        if (item) agenda = cerrarActividadDeAgenda(agenda, item.concepto, item.indice, respuesta.elegida,
          Array.isArray(q?.o) ? q.o.length : undefined);
      }
      escribirSesion({ ...borrador, sesion: { ...Sesion.marcarEntregadas(estado), agenda, entregada: true, terminada: true } });
      render();
    }));
    $$("[data-sesion-nueva]", raiz).forEach((boton) => boton.addEventListener("click", (ev) => {
      if (!boton.isConnected || ev.detail > 1) return;
      const borrador = leerSesion() || {};
      if (!borrador.sesion?.terminada) return;
      if (modoSesion() === "diferida" && !borrador.sesion.entregada && Object.keys(borrador.sesion.respuestas || {}).length) return;
      const { sesion, ...otrosBorradores } = borrador;
      const agendasPendientes = Array.isArray(otrosBorradores.agendasPendientes) ? [...otrosBorradores.agendasPendientes] : [];
      if (sesion.agenda && typeof Agenda !== "undefined" && Agenda.resumen(sesion.agenda).pendientes > 0)
        agendasPendientes.push({ guardadaEn: Date.now(), sesion });
      escribirSesion({ ...otrosBorradores, agendasPendientes });
      render();
    }));

    // T23 · Elegir un nodo NO arrastra: es un botón, se pulsa o se activa con Enter. La selección va
    // a la URL, así que volver de la ficha devuelve el mapa tal y como estaba.
    $$("[data-mapa-nodo]", raiz).forEach((b) => {
      if (b.dataset.conectado) return; b.dataset.conectado = "1";
      b.addEventListener("click", () => {
        const partes = (location.hash.replace(/^#\/mapa\/?/, "") || "").split("~");
        const filtro = partes[1] || "";
        location.hash = enlaceMapa("mapa", filtro, b.dataset.mapaNodo);
      });
    });
    // T20 · Responder en la sesión. Se valida contra el número de opciones de esta pregunta, así que
    // un valor fuera de rango no cuenta. La respuesta se guarda en el borrador y se corrige en el acto.
    $$("[data-sesion-opcion]", raiz).forEach((b) => { if (b.dataset.conectado) return; b.dataset.conectado = "1"; b.addEventListener("click", () => {
      const borrador = leerSesion() || {};
      let estado = borrador.sesion;
      if (!estado) return;
      const n = Number(b.dataset.sesionOpcion);
      const total = Number(b.dataset.opciones);
      if (estado.respuestas?.[estado.items[estado.posicion]?.clave]) return;
      // T20 · Interactiva: un fallo no cierra la pregunta ni revela la solución. Se apunta el reintento
      // y se vuelve a pintar; solo el acierto (o agotar los intentos) sigue el camino normal.
      if (modoSesion() === "interactiva") {
        const itI = estado.items[estado.posicion];
        const correctaI = Number(b.dataset.correcta);
        const acertoI = Number.isInteger(correctaI) && correctaI > 0 && n === correctaI;
        const previos = (estado.reintentos || {})[itI.clave] || {};
        const fallos = (previos.fallos || 0) + (acertoI ? 0 : 1);
        const tope = Number(pref.intentosMax) > 0 ? Number(pref.intentosMax) : 3;
        if (!acertoI) {
          const reintentos = { ...(estado.reintentos || {}), [itI.clave]: { ultima: n, fallos } };
          if (fallos < tope) {
            escribirSesion({ ...borrador, sesion: { ...estado, reintentos } });
            render();
            return;
          }
          estado = { ...estado, reintentos };
        }
      }
      const correctaPregunta = Number(b.dataset.correcta);
      const siguiente = Sesion.contestarConCorreccion(estado, n, total, n === correctaPregunta);
      if (siguiente === estado) return;   // respuesta inválida: sin efecto
      // T20 · Registro por el CAMINO COMPARTIDO: `programar` es la misma funcion que usan ficha y
      // repaso para apuntar el intento y programar el repaso. La clave `${concepto}#${indice}` es
      // la misma que generan ellos, asi que la pregunta no se cuenta dos veces.
      const it = estado.items[estado.posicion];
      if (it && modoSesion() === "diferida") {
        const correctaD = Number(b.dataset.correcta);
        const nuevoD = Sesion.contestarConCorreccion(estado, n, total, correctaD > 0 && n === correctaD);
        escribirSesion({ ...borrador, sesion: nuevoD });
        render();
        return;
      }
      if (it) {
        const claveP = Sesion.claveDePregunta(it.concepto, it.indice);
        const correcta = Number(b.dataset.correcta);
        if (Number.isInteger(correcta) && correcta > 0) {
          const acerto = n === correcta;
          // Las DOS piezas del camino compartido, las mismas que usan ficha y repaso:
          // el historial del intento y la programacion del repaso.
          apuntarIntento(claveP, { elegida: n, correcta: acerto, seguro: null, segundos: 0 });
          programar(claveP, acerto, null);
        }
      }
      // T20 · La actividad de la agenda que corresponde a esta pregunta se cierra con su evidencia.
      const agendaCerrada = it ? cerrarActividadDeAgenda(estado.agenda, it.concepto, it.indice, n, total) : estado.agenda;
      // T20 · Si después de responder la agenda NO sigue con otra pregunta (toca práctica o lectura),
      // no hay pantalla donde pulsar «Siguiente»: el motor avanza solo para que, al volver al paso de
      // preguntas, no se ofrezca como actual la que ya se respondió.
      const proxima = typeof Agenda !== "undefined" && agendaCerrada ? Agenda.siguiente(agendaCerrada) : null;
      const sigueConPreguntas = !!(proxima && (proxima.tipo === "quiz" || proxima.tipo === "review"));
      const conAvance = !proxima || sigueConPreguntas ? siguiente : Sesion.avanzar(siguiente);
      const veniaSaneada = !!(estado.respuestasNoAplicadas && estado.respuestasNoAplicadas[it && it.clave]);
      const entregadasNuevas = veniaSaneada ? { ...(siguiente.entregadas || {}) } : { ...(siguiente.entregadas || {}), [it && it.clave]: true };
      escribirSesion({ ...borrador, sesion: { ...conAvance, agenda: agendaCerrada, entregadas: entregadasNuevas } });
      render();
    }); });
    $$("[data-sesion-siguiente]", raiz).forEach((b) => { if (b.dataset.conectado) return; b.dataset.conectado = "1"; b.addEventListener("click", () => {
      const borrador = leerSesion() || {};
      if (!borrador.sesion) return;
      // Contestar no avanza: aquí es donde se pasa a la siguiente.
      escribirSesion({ ...borrador, sesion: Sesion.avanzar(borrador.sesion) });
      render();
    }); });
    $$("[data-sesion-omitir]", raiz).forEach((b) => { if (b.dataset.conectado) return; b.dataset.conectado = "1"; b.addEventListener("click", () => {
      const borrador = leerSesion() || {};
      const estado = borrador.sesion;
      if (!estado) return;
      escribirSesion({ ...borrador, sesion: Sesion.omitir(estado) });
      render();
    }); });
    // T20 · Avanzar la sesión escribe SOLO en el borrador: posición y respuestas quedan guardadas,
    // así que cerrar y volver recupera el punto exacto.
    $$("[data-sesion-omitir]", raiz).forEach((b) => { if (b.dataset.conectado) return; b.dataset.conectado = "1"; b.addEventListener("click", () => {
      const borrador = leerSesion() || {};
      const estado = borrador.sesion;
      if (!estado) return;
      escribirSesion({ ...borrador, sesion: Sesion.omitir(estado) });
      render();
    }); });
    // T19 · Responder el diagnóstico escribe SOLO en el borrador (CLAVES.sesion, con su copia).
    // Ninguna marca de evidencia: el diagnóstico no regala competencia.
    $$("[data-diag]", raiz).forEach((b) => b.addEventListener("click", () => {
      const idC = b.dataset.diag;
      const v = Number(b.dataset.valor);
      if (!idC || !Number.isFinite(v)) return;
      const actual = leerSesion() || {};
      const diag = actual.diagnostico && typeof actual.diagnostico === "object" ? actual.diagnostico : {};
      escribirSesion({ ...actual, diagnostico: { ...diag, [idC]: v } });
      render();
    }));
    // T15 · Cada paso guarda en cuanto se elige, no al final: así, al volver atrás, el valor ya
    // está donde se dejó. Y solo se escribe en preferencias.
    $$("[data-orienta]", raiz).forEach((b) => b.addEventListener("click", () => {
      const campo = b.dataset.orienta;
      const valor = b.dataset.valor;
      if (!campo || valor === undefined) return;
      if (campo === "objetivoDia") {
        const n = Number(valor);
        if (!Number.isFinite(n) || n <= 0) return;
        pref = { ...pref, objetivoDia: n };
      } else if (campo === "ruta") {
        pref = { ...pref, rutaActiva: valor };
      } else if (campo === "experiencia") {
        pref = { ...pref, experiencia: valor };
      }
      escribir(CLAVES.pref, pref);
      render();
    }));
    // T13 · Favorito: se guarda con su fecha, para poder ordenar los favoritos por cuándo se
    // marcaron. Se guarda al pulsar, no al salir: si se cierra la pestaña, la marca queda.
    $$("[data-favorito]", raiz).forEach((b) => b.addEventListener("click", () => {
      const idFav = b.dataset.favorito;
      if (!idFav) return;
      if (favoritos[idFav]) delete favoritos[idFav];
      else favoritos[idFav] = { ts: Date.now() };
      escribir("aprender.v1.favoritos", favoritos);
      render();
    }));
    // T13 · Nota: se guarda al escribir, y al vaciarla se borra la entrada en vez de dejar una
    // cadena vacía, que contaría como nota en cualquier recuento.
    $$("[data-nota]", raiz).forEach((area) => area.addEventListener("input", () => {
      const idNota = area.dataset.nota;
      if (!idNota) return;
      const texto = String(area.value || "");
      if (texto.trim() === "") delete notas[idNota];
      else {
        // Se conserva la sección elegida para no perderla al seguir escribiendo.
        const antes = notas[idNota];
        const seccion = antes && typeof antes === "object" && typeof antes.seccion === "string" ? antes.seccion : "";
        notas[idNota] = { texto, seccion, ts: Date.now() };
      }
      escribir("aprender.v1.notas", notas);
    }));

    // T24 · ANCLAJE SIN TOCAR LA PLANTILLA. El control se crea aquí y las secciones son los <h2>
    // reales de la ficha: así no hay una segunda lista de secciones que se pueda desincronizar, y
    // el HTML de la ficha no se edita —que fue lo que rompió el pintado en el primer intento.
    $$("[data-nota]", raiz).forEach((area) => {
      if (area.parentElement && area.parentElement.querySelector("[data-nota-seccion]")) return;
      const idN = area.dataset.nota;
      if (!idN || !area.parentElement) return;
      const secciones = [...document.querySelectorAll("#contenido-concepto h2")].map((h) => (h.textContent || "").trim()).filter(Boolean);
      if (!secciones.length) return;
      const sel = document.createElement("select");
      sel.setAttribute("data-nota-seccion", idN);
      sel.id = "nota-seccion";
      sel.setAttribute("aria-label", "Sobre qué parte de la ficha es la nota");
      const opciones = ['<option value="">toda la ficha</option>']
        .concat(secciones.map((s) => '<option value="' + esc(s) + '">' + esc(s) + "</option>"));
      sel.innerHTML = opciones.join("");
      const actual = notas[idN];
      if (actual && typeof actual === "object" && typeof actual.seccion === "string") sel.value = actual.seccion;
      area.parentElement.insertBefore(sel, area.nextSibling);
      sel.addEventListener("change", () => {
        const ahora = notas[idN];
        const texto = typeof ahora === "string" ? ahora : (ahora && ahora.texto) || "";
        if (String(texto).trim() === "") return;   // sin texto no hay nota que anclar
        notas[idN] = { texto, seccion: sel.value, ts: Date.now() };
        escribir("aprender.v1.notas", notas);
      });
    });
    // T12 · Elegir ruta. pendientesAhora ya filtra por pref.rutaActiva, así que basta con
    // guardarla y repintar: la propuesta cambia sin recalcular nada aparte.
    $$("#hoy-ruta", raiz).forEach((s) => s.addEventListener("change", () => {
      pref = { ...pref, rutaActiva: s.value || "" };
      escribir(CLAVES.pref, pref);
      render();
    }));
    // T12 · Elegir cuánto tiempo hay hoy. Escribe la preferencia y repinta: la lista y el objetivo
    // ya la usan, así que la propuesta cambia con ella y no hay que recalcular nada aparte.
    $$("[data-sesion]", raiz).forEach((b) => b.addEventListener("click", () => {
      const n = Number(b.dataset.sesion);
      if (!Number.isFinite(n) || n <= 0) return;
      pref = { ...pref, objetivoDia: n };
      escribir(CLAVES.pref, pref);
      render();
    }));
    $$("[data-marcar]", raiz).forEach((b) => b.addEventListener("click", () => {
      if (b.disabled) return;
      const id = b.dataset.id;
      marcar(id, b.dataset.marcar);
      render();
    }));
    // La marca de «lo he resuelto yo» es manual a proposito: solo la persona sabe si lo ha
    // resuelto o lo ha leido en la solucion. Poder abrir la pista y la solucion es lo que
    // hace que esa marca signifique algo, y por eso se apunta tambien cuando se abren.
    // T20 · La práctica manual declara CÓMO salió. Pulsar la opción que ya está puesta la quita.
    $$("[data-practica-autoevaluar]", raiz).forEach((b) => b.addEventListener("click", () => {
      if (!b.isConnected) return;
      const id = b.dataset.id;
      const k = b.dataset.clave;
      const valor = b.dataset.practicaAutoevaluar;
      const actual = leerPractica(progreso[id])?.[String(k)]?.autoevaluacion;
      marcarPractica(id, k, "autoevaluacion", actual === valor ? false : valor);
      render();
    }));
    $$("[data-practica-marcar]", raiz).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      const k = b.dataset.practicaMarcar;
      // Desmarcar es tan facil como marcar: si alguien se equivoca, no se queda atrapado
      // con una ficha que dice «hecha» para siempre.
      const yaEstaba = leerPractica(progreso[id])?.[String(k)]?.resuelto === true;
      marcarPractica(id, k, "resuelto", !yaEstaba);
      render();
    }));
    // Quitar el aplazo se puede desde la ficha y desde el bloque de `#/progreso`: los dos botones
    // llevan el mismo `data-` y hacen lo mismo, que es no tener que volver a la ficha para
    // adelantar algo que ya se puede hacer.
    $$("[data-aplazo-quitar]", raiz).forEach((b) => b.addEventListener("click", () => {
      quitarAplazo(b.dataset.aplazoQuitar);
      render();
    }));
    // Apagar el aviso de prerrequisitos y volver a encenderlo. Va en `pref`, asi que se recuerda
    // entre sesiones; y no toca ningun estado: lo unico que cambia es si se enseña el aviso.
    $$("[data-aviso-prereq]", raiz).forEach((b) => b.addEventListener("click", () => {
      fijarAvisoPrerequisitos(b.dataset.avisoPrereq === "si");
      render();
    }));
    // La ruta de las recomendaciones. Cambiarla no oculta ni pierde nada, y por eso no pide
    // confirmacion: es una preferencia, no una decision irreversible.
    $$("[data-ruta-activa]", raiz).forEach((b) => b.addEventListener("click", () => {
      fijarRutaActiva(b.dataset.rutaActiva);
      render();
    }));
    // El modo de respuesta (fase 7). Va delegado porque el mismo boton aparece en la sesion, en
    // el aviso de «sin sessionStorage» y en el estado vacio: tres sitios con el mismo `data-` y un
    // solo manejador, que es lo que impide que los tres se comporten distinto.
    alDocumento("click", (ev) => {
      const boton = ev.target instanceof Element ? ev.target.closest("[data-modo-respuesta]") : null;
      if (!boton) return;
      const nuevo = boton.dataset.modoRespuesta;
      if (!MODOS_RESPUESTA.includes(nuevo)) return;
      // Cambiar de modo tira la sesion a medias, y hay que decirlo con el numero delante: pasar de
      // diferida a inmediata con quince respuestas a ciegas guardadas no puede borrarlas en silencio.
      const guardada = leerSesion();
      const aMedias = guardada && typeof guardada === "object" ? respuestasDe(guardada.respuestas) : 0;
      if (nuevo !== modoDe(pref) && aMedias > 0
        && !confirm(`Tienes ${aMedias} ${aMedias === 1 ? "respuesta" : "respuestas"} sin entregar en el modo diferido. Al cambiar de modo se descartan. ¿Cambiar igualmente?`)) return;
      if (nuevo !== modoDe(pref)) borrarSesion();
      pref.modoRespuesta = nuevo;
      escribir(CLAVES.pref, pref);
      render();
    });
    // La seguridad declarada. Apagarla no borra ninguna seguridad ya declarada: solo deja de
    // preguntarla, y lo apuntado sigue siendo verdad.
    $$("[data-seguridad-declarada]", raiz).forEach((b) => b.addEventListener("click", () => {
      pref.seguridadDeclarada = !seguridadPedida(pref);
      escribir(CLAVES.pref, pref);
      render();
    }));
    $$("[data-copiar]", raiz).forEach((b) => b.addEventListener("click", async () => {
      const codigo = b.closest(".codigo").querySelector("code").innerText;
      const estado = b.closest(".codigo").querySelector("[data-copiar-estado]");
      try {
        await navigator.clipboard.writeText(codigo);
        b.textContent = "copiado";
        if (estado) estado.textContent = "Código copiado al portapapeles.";
      } catch {
        b.textContent = "selecciónalo a mano";
        if (estado) estado.textContent = "No se pudo copiar: selecciona el código a mano.";
      }
      setTimeout(() => { b.textContent = "Copiar"; if (estado) estado.textContent = ""; }, 1500);
    }));
  }

  // Pinta el boton de cada problema practico y engancha lo que se puede saber sin preguntar:
  // abrir la pista o la solucion. Se hace al entrar en la ficha y no dentro del HTML generado
  // porque el contenido es un fichero de datos compartido por todas las vistas.
  function conectarPracticas(id) {
    const reg = progreso[id];
    const marca = leerPractica(reg) || {};
    $$(".practica").forEach((bloque) => {
      const k = bloque.dataset.practica;
      if (k === undefined) return;
      const m = marca[String(k)] || {};
      const pie = document.createElement("p");
      pie.className = "practica-pie";
      pie.innerHTML = botonPractica(id, k, m.resuelto === true, m.autoevaluacion);
      bloque.appendChild(pie);
      $(".pista > summary", bloque)?.addEventListener("click", () => marcarPractica(id, k, "pista"));
      $(".solucion > summary", bloque)?.addEventListener("click", () => marcarPractica(id, k, "solucion"));
    });
  }

  // El formulario del aplazo se engancha a mano, por lo mismo que las practicas: el HTML se
  // regenera entero en cada `render()` y un manejador puesto en el HTML se perderia al pinto.
  function conectarAplazo(id) {
    const form = $("#form-aplazo");
    if (!form) return;
    const cajaError = $("#aplazo-error");
    const decir = (texto) => { cajaError.textContent = texto; cajaError.hidden = false; };
    form.addEventListener("submit", (e) => {
      // Sin `preventDefault` el navegador recarga la pagina con la fecha en la barra de
      // direcciones: se perderia la posicion de lectura y el aplazo no se guardaria.
      e.preventDefault();
      const revision = aplazoValido($("#aplazo-hasta").value, $("#aplazo-motivo").value, hoyISO());
      if (!revision.ok) { decir(revision.aviso); return; }
      aplazar(id, revision.hasta, revision.motivo);
      render();
    });
    // El aviso se retira en cuanto se corrige el campo: dejarlo puesto mientras se arregla hace
    // dudar de si el segundo intento ha contado.
    for (const campo of [$("#aplazo-hasta"), $("#aplazo-motivo")]) {
      campo?.addEventListener("input", () => { cajaError.hidden = true; });
    }
  }

  function conectarPlan() {
    const selector = $("#horas-dia");
    if (!selector) return;
    selector.addEventListener("change", () => {
      pref.horasDia = Number(selector.value) || 1;
      escribir(CLAVES.pref, pref);
      render();
    });
  }

  // El selector de ruta de la portada. Se engancha aparte del resto de botones porque solo
  // existe en la vista de inicio, y meterlo en `conectarBotones` obligaria a buscarlo en las
  // diecisiete vistas para no encontrarlo en dieciseis.
  function conectarInicio() {
    const selector = $("#ruta-preferida");
    if (!selector) return;
    selector.addEventListener("change", () => {
      fijarRutaActiva(selector.value);
      render();
    });
  }

  /** Guarda el criterio de «cual cuenta». Solo cambia la cifra que se enseña, no el repaso. */
  function fijarCualCuenta(clave) {
    pref.cualCuenta = CUAL_CUENTA.includes(clave) ? clave : CUAL_CUENTA_DEFECTO;
    escribir(CLAVES.pref, pref);
  }

  function conectarProgreso() {
    // El criterio de «cual cuenta» se cambia donde se lee la nota. Al cambiarlo se vuelve a
    // pintar la vista entera y no solo la tabla: el texto de ayuda del selector tambien cambia,
    // y dejar el de antes al lado de la cifra nueva seria explicar una regla que ya no es.
    $("#cual-cuenta")?.addEventListener("change", (e) => {
      fijarCualCuenta(e.target.value);
      render();
    });
    // El filtro del mapa y la fase desplegada vuelven a pintar la vista entera. No es pereza: las
    // cifras de «Abandonado» y de «Cómo vas» se calculan sobre lo mismo, y refrescar solo la lista
    // de celdas dejaría el mapa diciendo una cosa y los números de al lado, otra.
    $$("#principal [data-mapa-filtro]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.mapaFiltro;
      pref.filtroEstado = FILTROS_HUECOS.includes(v) ? v : "";
      escribir(CLAVES.pref, pref);
      // Si la fase que estaba desplegada no tiene ninguna ficha que encaje con el filtro nuevo, se
      // despliega la primera que sí. Dejar el mapa en blanco haría pensar que el filtro no
      // funciona, que es lo contrario de para lo que está. Solo se hace al CAMBIAR el filtro: si
      // luego alguien pulsa a mano una fase vacía, se queda abierta, porque eso es lo que ha pedido.
      const mapa = huecos(progreso, srs, P, pref, hoyISO());
      const suya = mapa.fases.find((f) => f.id === faseAbiertaMapa(mapa));
      if (mapa.filtro && suya && suya.dentro === 0) {
        const conAlgo = mapa.fases.find((f) => f.dentro > 0);
        if (conAlgo) abrirFaseMapa(conAlgo.id);
      }
      render();
    }));
    $$("#principal [data-mapa-fase]").forEach((b) => b.addEventListener("click", () => {
      // Volver a pulsar la fase que ya está abierta no la cierra: plegarla dejaría la sección sin
      // nada que leer. Siempre hay exactamente una fase desplegada, y esta es la que es.
      abrirFaseMapa(b.dataset.mapaFase);
      render();
    }));
    // A partir de cuántos días se llama abandonada una fase. Se elige mirando la lista, que es
    // donde se ve lo que cambia: una preferencia que solo se puede cambiar en una página de
    // ajustes es una preferencia que nadie cambia.
    $("#dias-abandono")?.addEventListener("change", (e) => {
      const n = Number(e.target.value);
      pref.diasAbandono = Number.isInteger(n) && n > 0 ? n : DIAS_ABANDONO;
      escribir(CLAVES.pref, pref);
      render();
    });
    $("#exportar-informe-csv")?.addEventListener("click", () => exportarInforme("csv"));
    $("#exportar-informe-json")?.addEventListener("click", () => exportarInforme("json"));
    $("#anki-todo")?.addEventListener("click", () => exportarAnki(orden.map((c) => c.id)));
    $("#anki-falladas")?.addEventListener("click", () => exportarAnki(orden.map((c) => c.id), true));
    $("#anki-fase")?.addEventListener("click", () => {
      const opciones = P.fases.map((f) => `${f.n} · ${f.corto}`).join("\n");
      const r = prompt(`¿Qué fase exportar? Escribe el número:\n\n${opciones}`);
      if (r === null) return;
      const f = P.fases.find((x) => String(x.n) === r.trim());
      if (!f) return alert("Fase no reconocida.");
      exportarAnki(orden.filter((c) => c.fid === f.id).map((c) => c.id));
    });
    $("#exportar-estado")?.addEventListener("click", () => {
      descargar(`aprender-progreso-${hoyISO()}.json`, JSON.stringify(estadoGuardado(), null, 2), "application/json");
    });
    $("#importar-estado")?.addEventListener("click", () => $("#fichero-estado").click());
    $("#fichero-estado")?.addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const lector = new FileReader();
      lector.onload = () => {
        try {
          const datos = JSON.parse(lector.result);
          // Un fichero guardado antes de que existiera el historial de intentos no lo trae, y
          // eso no es un error: se importa igual y el estado se recalcula sin el.
          cargarEstadoGuardado(datos);
          render(); construirArbol();
          alert("Progreso cargado.");
        } catch { alert("Ese fichero no parece un progreso guardado. Se espera el JSON que descarga el botón «Descargar mi progreso»."); }
      };
      lector.readAsText(f);
    });
    $("#borrar-estado")?.addEventListener("click", () => {
      if (!confirm("¿Borrar todo tu progreso y tu historial de repaso? No se puede deshacer.")) return;
      // La lista es la misma que la de exportar, para que no se pueda quedar una clave fuera:
      // una clave que se exporta y no se borra es un dato que la persona cree haber borrado.
      progreso = {}; srs = {}; dias = {}; intentos = {}; ultimo = null;
      escribir(CLAVES.progreso, progreso); escribir(CLAVES.srs, srs);
      escribir(CLAVES.dias, dias); escribir(CLAVES.ultimo, ultimo); escribir(CLAVES.intentos, intentos);
      // La sesion a medias tambien se va: esta en `sessionStorage` y no es progreso, pero dejar
      // veinte respuestas a ciegas de un examen que la persona acaba de mandar borrar seria
      // quedarse con lo unico que no le ha dicho que se borraba.
      borrarSesion();
      render(); construirArbol();
    });
  }

  // ── Arranque ──────────────────────────────────────────────────────────
  function aplicarTema() {
    if (pref.tema === "oscuro") document.documentElement.dataset.tema = "oscuro";
    else if (pref.tema === "claro") document.documentElement.dataset.tema = "claro";
    else delete document.documentElement.dataset.tema;
    // El tema es un botón en la barra superior, no una casilla: el estado se dice con
    // aria-pressed y con el icono, para que se entienda sin color.
    const b = $("#boton-tema");
    if (b) {
      const oscuro = pref.tema === "oscuro" ||
        (!pref.tema && window.matchMedia("(prefers-color-scheme: dark)").matches);
      b.setAttribute("aria-pressed", String(oscuro));
      b.title = oscuro ? "Pasar a tema claro" : "Pasar a tema oscuro";
    }
  }

  function iniciar() {
    aplicarTema();
    comprobarSesion();
    pintarAvisoCookies();
    conectarConsentimiento();
    construirArbol();
    render();
    actualizarLateral();

    window.addEventListener("hashchange", render);

    const campo = $("#campo-busqueda");
    let temporizador;
    async function buscarConIndice(texto) {
      try { await cargarBusqueda(); } catch { /* sin indice: se busca por titulo */ }
      return buscar(texto);
    }
    campo.addEventListener("input", () => {
      clearTimeout(temporizador);
      const texto = campo.value;
      temporizador = setTimeout(async () => pintarResultados(await buscarConIndice(texto), texto), 120);
    });
    campo.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") { campo.value = ""; pintarResultados([], ""); campo.blur(); }
      if (e.key === "Enter") {
        const ids = await buscarConIndice(campo.value);
        if (ids.length) { location.hash = `#/c/${ids[0]}`; campo.value = ""; pintarResultados([], ""); }
      }
    });
    alDocumento("click", (e) => {
      if (!e.target.closest(".buscador")) pintarResultados([], "");
    });

    $("#boton-tema").addEventListener("click", () => {
      const oscuroAhora = document.documentElement.dataset.tema === "oscuro" ||
        (!document.documentElement.dataset.tema && window.matchMedia("(prefers-color-scheme: dark)").matches);
      pref.tema = oscuroAhora ? "claro" : "oscuro";
      escribir(CLAVES.pref, pref);
      aplicarTema();
    });
    $("#boton-menu").addEventListener("click", () => {
      const abierto = $("#lateral").classList.toggle("abierto");
      $("#boton-menu").setAttribute("aria-expanded", String(abierto));
    });

    alDocumento("keydown", (e) => {
      if (e.target.matches("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      const { vista, arg } = rutaActual();
      if (e.key === "/") { e.preventDefault(); campo.focus(); return; }
      // En «Hoy» y en la lista entera, `j` y `k` mueven el foco por las filas y `Enter` abre la
      // que está enfocada: es la primera pantalla que se abre y tiene que poder usarse sin ratón.
      // `v` y `d` NO hacen nada aquí a propósito: marcar «visto» o «dominado» desde una lista,
      // sin abrir la ficha, es exactamente el clic que no es progreso. Preferimos decir que no
      // hacen nada —lo dice la propia lista— a que hagan algo que no se ve.
      if (vista === "inicio" || vista === "pendientes") {
        const filas = $$("#principal [data-pendiente-fila]");
        if ((e.key === "j" || e.key === "k") && filas.length) {
          e.preventDefault();
          const i = filas.indexOf(document.activeElement);
          const j = e.key === "j" ? (i + 1) % filas.length : (i <= 0 ? filas.length - 1 : i - 1);
          filas[j].focus();
        }
        return;
      }
      if (vista !== "concepto") return;
      const i = orden.findIndex((x) => x.id === arg);
      if (e.key === "j" && orden[i + 1]) location.hash = `#/c/${orden[i + 1].id}`;
      if (e.key === "k" && orden[i - 1]) location.hash = `#/c/${orden[i - 1].id}`;
      if (e.key === "v") { marcar(arg, "visto"); render(); }
      // El atajo de «dominado» respeta la misma regla que el boton: si los requisitos no se
      // cumplen, la tecla no hace nada. Un atajo que se salta la comprobacion es una puerta
      // de atras, y la unica razon de tenerla cerrada es que no se pueda colar nadie.
      if (e.key === "d" && ["hecho", "dominado"].includes(estadoDe(arg).estadoSinAplazo)) { marcar(arg, "dominado"); render(); }
      // `p` abre el formulario del aplazo y deja el cursor en la fecha, para que aplazar no
      // dependa del raton. Si la ficha ya esta aplazada no hace nada: ahi lo util es cambiar la
      // fecha, y para eso ya esta el bloque, abierto y con el boton de quitar al lado.
      if (e.key === "p" && estadoDe(arg).estado !== "aplazado") {
        const d = $("#aplazo-ficha");
        if (d) { d.open = true; $("#aplazo-hasta")?.focus(); }
      }
    });

    // Prepara el contenido de las fases más usadas tras cargar, sin bloquear.
    setTimeout(() => { cargarFase("f00").catch(() => {}); }, 400);
  }

  window.addEventListener("resize", ajustarFiltrosBusqueda, { passive: true });
  if (document.readyState === "loading") alDocumento("DOMContentLoaded", iniciar);
  else iniciar();
})();
