/* plataforma/analitica/cliente.js — envía al servidor lo que sirve para mejorar el portal.
 *
 * POR QUE es un script clásico y no un módulo ES: el portal tiene que seguir abriéndose con
 * doble clic desde file://, y ahí el navegador rechaza los módulos ES (los bloquea por CORS).
 * Un <script src> normal sí carga desde file://, así que el fichero publica window.Analitica
 * y no usa import ni export. El portal lo carga SOLO si la persona ha aceptado la categoría
 * de analítica; si no lo carga, este código ni se ejecuta.
 *
 * SIN CONSENTIMIENTO NO SALE NADA. Ni al cargar el fichero (no hay ninguna petición en la
 * carga), ni antes de llamar a crear({ aceptado: true }). Y aunque se acepte, si el navegador
 * manda DNT o Global Privacy Control, o si la persona ha pulsado el botón de renuncia, no se
 * envía ni una petición.
 *
 * LO QUE NO SE USA, a propósito: cookies (nunca se toca document.cookie), identificadores
 * persistentes (la sesión vive en memoria y muere con la pestaña), agente de usuario, huella
 * del dispositivo, ni la ruta completa de donde se viene.
 */
(function () {
  "use strict";

  var VERSION = 1;
  var CATEGORIA = "analitica";
  // Clave del almacén local donde se recuerda SOLO la renuncia. Es una preferencia, no un
  // identificador: no viaja en ninguna petición.
  var CLAVE_OPT_OUT = "aprender.v1.analitica.opt-out";
  var TIPOS = ["visita", "concepto_abierto", "ejercicio", "lectura", "busqueda", "referente"];
  var MAX_LOTE = 20;          // a partir de aquí se envía sin esperar al temporizador
  var INTERVALO_MS = 15000;   // agrupa sucesos: menos peticiones y menos ruido en el servidor
  var MAX_FALLOS = 5;         // si el servidor no está, la medición se apaga sola
  var LARGO_TERMINO = 60;

  var instancia = null;

  // ── Entorno ───────────────────────────────────────────────────────────────
  // Todo lo que toca el navegador se lee aquí y se puede sustituir en las pruebas
  // (_comprobar-cliente.mjs). Sin esta costura, las promesas de privacidad del cliente solo se
  // podrían afirmar de palabra.

  function entornoReal() {
    var g = globalThis;
    var nav = typeof g.navigator !== "undefined" && g.navigator ? g.navigator : {};
    return {
      navegador: {
        // Algunos navegadores exponen DNT en navigator y otros en window; se miran los tres.
        doNotTrack: nav.doNotTrack !== undefined ? nav.doNotTrack : g.doNotTrack,
        msDoNotTrack: nav.msDoNotTrack !== undefined ? nav.msDoNotTrack : g.msDoNotTrack,
        globalPrivacyControl: nav.globalPrivacyControl !== undefined ? nav.globalPrivacyControl : g.globalPrivacyControl,
      },
      documento: typeof g.document !== "undefined" ? g.document : null,
      ubicacion: typeof g.location !== "undefined" ? g.location : null,
      almacen: almacenDisponible(g),
      peticion: typeof g.fetch === "function" ? g.fetch.bind(g) : null,
      nuevaSesion: nuevaSesion,
      ahora: function () { return Date.now(); },
      programar: function (fn, ms) { return g.setInterval(fn, ms); },
      cancelar: function (id) { g.clearInterval(id); },
      oyenteGlobal: typeof g.addEventListener === "function" ? g.addEventListener.bind(g) : null,
    };
  }

  function almacenDisponible(g) {
    try {
      var a = g.localStorage;
      if (!a) return null;
      a.getItem(CLAVE_OPT_OUT); // tocarlo es la única forma fiable de saber si se puede usar
      return a;
    } catch (e) {
      return null; // modo privado o almacén bloqueado: se funciona igual, sin recordar la renuncia
    }
  }

  // Identificador de sesión: aleatorio y SOLO en memoria. No se guarda en ningún sitio, así que
  // al cerrar la pestaña desaparece y no se puede reconocer a nadie en la visita siguiente.
  function nuevaSesion() {
    try {
      var c = globalThis.crypto;
      if (c && typeof c.randomUUID === "function") return c.randomUUID();
      if (c && typeof c.getRandomValues === "function") {
        var bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        var salida = "";
        for (var i = 0; i < bytes.length; i++) salida += bytes[i].toString(16).padStart(2, "0");
        return salida;
      }
    } catch (e) { /* se cae al último recurso */ }
    // Último recurso (navegadores sin crypto): sigue sin persistir y sin identificar a nadie.
    return "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ── Reglas de privacidad, expuestas para poder comprobarlas ───────────────

  function leerOptOut(almacen) {
    try { return almacen ? almacen.getItem(CLAVE_OPT_OUT) === "1" : false; } catch (e) { return false; }
  }

  function fijarOptOut(almacen, valor) {
    try {
      if (!almacen) return false;
      if (valor) almacen.setItem(CLAVE_OPT_OUT, "1");
      else almacen.removeItem(CLAVE_OPT_OUT);
      return true;
    } catch (e) { return false; }
  }

  function motivoInactividad(entorno) {
    var nav = entorno.navegador || {};
    if (nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.msDoNotTrack === "1") return "dnt";
    if (nav.globalPrivacyControl === true) return "gpc";
    if (leerOptOut(entorno.almacen)) return "opt-out";
    return null;
  }

  // El término de búsqueda es el dato más delicado que se manda: es texto que escribe una
  // persona. Se normaliza (minúsculas, sin tildes, para que "gráfico" y "grafico" cuenten
  // juntos) y se descarta entero si parece un dato personal.
  function normalizarTermino(termino) {
    if (typeof termino !== "string") return "";
    if (termino.indexOf("@") !== -1) return ""; // correo: no se guarda
    var limpio = termino.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s\-_+#.]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Un número larguísimo suele ser un DNI, un teléfono o una tarjeta: fuera.
    if (/\d{7,}/.test(limpio.replace(/[\s.\-]/g, ""))) return "";
    return limpio.split(" ").filter(Boolean).slice(0, 8).join(" ").slice(0, LARGO_TERMINO);
  }

  // De dónde se viene: solo el host. Sin ruta, sin parámetros y sin ancla, porque una URL
  // completa puede llevar un buscador, un correo o un identificador de campaña.
  function referenciaRecortada(referente, propio) {
    if (typeof referente !== "string" || !referente) return "";
    var host;
    try { host = new URL(referente).hostname.toLowerCase(); } catch (e) { return ""; }
    if (!host) return "";
    if (propio && (host === propio || host.slice(-(propio.length + 1)) === "." + propio)) return "interno";
    return host.replace(/^www\./, "").slice(0, 80);
  }

  // ── Fábrica ───────────────────────────────────────────────────────────────

  function crear(opciones) {
    var op = opciones || {};
    var entorno = Object.assign(entornoReal(), op.entorno || {});
    var endpoint = typeof op.endpoint === "string" && /^https?:\/\//.test(op.endpoint) ? op.endpoint : null;
    var sesion = entorno.nuevaSesion();
    var permitido = op.aceptado === true;

    var estado = {
      activa: false,
      motivo: "sin-consentimiento",
      fallos: 0,
      apagadaPorFallos: false,
      temporizador: null,
      cola: [],
      enviadaLaVisita: false,
      enviadoElReferente: false,
      lectura: null, // { clave, inicio, acumulado }
    };

    function evaluarMotivo() {
      // Si el servidor no está en pie, no se vuelve a intentar en cada suceso: se queda apagada
      // hasta que alguien la reactive a mano (activar()), que es lo que hace el portal al
      // volver a aceptar la categoría.
      if (estado.apagadaPorFallos) return "servidor-no-responde";
      if (!endpoint) return "sin-endpoint";
      var bloqueo = motivoInactividad(entorno);
      if (bloqueo) return bloqueo;
      if (!permitido) return "sin-consentimiento";
      if (typeof entorno.peticion !== "function") return "sin-fetch";
      return null;
    }

    function revisar() {
      var m = evaluarMotivo();
      estado.motivo = m || "activa";
      estado.activa = !m;
      if (!estado.activa) pararTemporizador();
      return estado.activa;
    }

    function pararTemporizador() {
      if (estado.temporizador !== null && estado.temporizador !== undefined) {
        try { entorno.cancelar(estado.temporizador); } catch (e) { /* da igual */ }
      }
      estado.temporizador = null;
    }

    function programarVolcado() {
      if (estado.temporizador !== null || typeof entorno.programar !== "function") return;
      estado.temporizador = entorno.programar(function () {
        estado.temporizador = null;
        volcar();
      }, INTERVALO_MS);
    }

    function encolar(suceso) {
      if (!revisar()) return false;
      estado.cola.push(suceso);
      if (estado.cola.length >= MAX_LOTE) volcar();
      else programarVolcado();
      return true;
    }

    function volcar() {
      if (!revisar()) {
        if (!estado.activa) estado.cola.length = 0; // sin permiso no se guarda nada en memoria
        return Promise.resolve({ enviados: 0, motivo: estado.motivo });
      }
      if (!estado.cola.length) return Promise.resolve({ enviados: 0 });
      var lote = estado.cola.splice(0, estado.cola.length);
      var cuerpo = JSON.stringify({ version: VERSION, sucesos: lote });
      return Promise.resolve(entorno.peticion(endpoint, {
        method: "POST",
        // text/plain es un tipo "seguro" para CORS: evita la petición OPTIONS previa, que en
        // file:// tendría origen "null" y es una ida y vuelta de más.
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: cuerpo,
        keepalive: true,      // la petición sobrevive al cierre de la pestaña
        credentials: "omit",  // ni cookies ni cabecera de autorización, aunque existan
        mode: "cors",
        cache: "no-store",
      })).then(function (respuesta) {
        if (!respuesta || !respuesta.ok) throw new Error("respuesta " + (respuesta ? respuesta.status : "sin respuesta"));
        estado.fallos = 0;
        return { enviados: lote.length };
      }).catch(function (error) {
        estado.fallos += 1;
        // Nunca se reintenta en bucle: la medición no puede costarle batería ni ancho de banda
        // a nadie. Si el servidor no está en pie, se apaga sola y el portal sigue igual.
        if (estado.fallos >= MAX_FALLOS) {
          estado.apagadaPorFallos = true;
          estado.cola.length = 0;
          pararTemporizador();
          revisar();
        }
        return { enviados: 0, error: String((error && error.message) || error) };
      });
    }

    // ── Tiempo de lectura ───────────────────────────────────────────────────
    // Solo cuenta el tiempo con la pestaña visible: leer con el portal de fondo no es leer.

    function visible() {
      var d = entorno.documento;
      return !d || !d.visibilityState || d.visibilityState === "visible";
    }

    function acumular() {
      var l = estado.lectura;
      if (l && l.inicio !== null) { l.acumulado += entorno.ahora() - l.inicio; l.inicio = null; }
    }

    function cerrarLectura() {
      var l = estado.lectura;
      if (!l) return false;
      if (visible() && l.inicio !== null) l.acumulado += entorno.ahora() - l.inicio;
      estado.lectura = null;
      var segundos = Math.round(l.acumulado / 1000);
      if (segundos < 1) return false; // menos de un segundo no dice nada de nadie
      return encolar({ tipo: "lectura", clave: l.clave, segundos: segundos, sesion: sesion });
    }

    // ── Sucesos ─────────────────────────────────────────────────────────────

    function registrarReferente(url) {
      if (!revisar() || estado.enviadoElReferente) return false;
      var d = entorno.documento;
      var propio = entorno.ubicacion && entorno.ubicacion.hostname ? entorno.ubicacion.hostname.toLowerCase() : "";
      var host = referenciaRecortada(url || (d ? d.referrer : ""), propio);
      if (!host) return false;
      estado.enviadoElReferente = true;
      return encolar({ tipo: "referente", clave: host, sesion: sesion });
    }

    function visita() {
      if (!revisar() || estado.enviadaLaVisita) return false;
      estado.enviadaLaVisita = true;
      registrarReferente();
      return encolar({ tipo: "visita", sesion: sesion });
    }

    function conceptoAbierto(id) {
      if (typeof id !== "string" || !id) return false;
      return encolar({ tipo: "concepto_abierto", clave: id, sesion: sesion });
    }

    function ejercicio(id, acertado) {
      if (typeof id !== "string" || !id) return false;
      return encolar({ tipo: "ejercicio", clave: id, resultado: acertado ? "acertado" : "fallado", sesion: sesion });
    }

    function busqueda(termino, huboResultados) {
      var t = normalizarTermino(termino);
      if (!t) return false; // sin término útil no hay nada que aprender; y nada que enviar
      return encolar({ tipo: "busqueda", clave: t, resultado: huboResultados ? "con_resultado" : "sin_resultado", sesion: sesion });
    }

    function seccionVista(id) {
      var clave = typeof id === "string" && id ? id : null;
      if (estado.lectura && estado.lectura.clave === clave) return false;
      cerrarLectura();
      if (!clave || !revisar()) return false;
      estado.lectura = { clave: clave, inicio: visible() ? entorno.ahora() : null, acumulado: 0 };
      return true;
    }

    function activar() {
      permitido = true;
      estado.fallos = 0;
      // Volver a aceptar la categoría es la única forma de reintentar tras apagarse sola.
      estado.apagadaPorFallos = false;
      var ok = revisar();
      if (ok) visita();
      return ok;
    }

    function desactivar() {
      // El botón de renuncia es definitivo: se recuerda en el almacén local y se vacía lo que
      // estuviera esperando. No se envía ni un suceso más.
      permitido = false;
      estado.cola.length = 0;
      estado.lectura = null;
      pararTemporizador();
      fijarOptOut(entorno.almacen, true);
      revisar();
      return true;
    }

    // ── Enlaces con el navegador ────────────────────────────────────────────

    var doc = entorno.documento;
    if (doc && typeof doc.addEventListener === "function") {
      doc.addEventListener("visibilitychange", function () {
        if (!estado.lectura) return;
        if (visible()) estado.lectura.inicio = entorno.ahora();
        else acumular();
      });
    }
    if (typeof entorno.oyenteGlobal === "function") {
      // Al salir de la página se cierra la lectura y se manda lo que quede: keepalive hace que
      // la petición llegue aunque la pestaña ya se esté cerrando.
      entorno.oyenteGlobal("pagehide", function () {
        cerrarLectura();
        volcar();
      });
    }

    revisar();
    if (estado.activa) visita();

    var api = {
      version: VERSION,
      categoria: CATEGORIA,
      activa: function () { return estado.activa; },
      motivo: function () { return estado.motivo; },
      pendientes: function () { return estado.cola.length; },
      sesion: function () { return sesion; }, // efímera: sirve para depurar, no para identificar
      activar: activar,
      desactivar: desactivar,
      volcar: volcar,
      visita: visita,
      conceptoAbierto: conceptoAbierto,
      ejercicio: ejercicio,
      busqueda: busqueda,
      seccionVista: seccionVista,
      cerrarTiempoLectura: cerrarLectura,
      registrarReferente: registrarReferente,
    };
    return api;
  }

  // El portal llama a obtener() una vez tras el consentimiento y luego puede volver a pedir la
  // misma instancia en cada cambio de vista sin duplicar el estado de la sesión. Si la primera
  // llamada fue antes de decidir (aceptado: false) y luego se acepta, la misma instancia se
  // enciende: así el portal no tiene que llevar la cuenta de si ya la creó.
  function obtener(opciones) {
    if (!instancia) instancia = crear(opciones);
    else if (opciones && opciones.aceptado === true && !instancia.activa() && instancia.motivo() === "sin-consentimiento") instancia.activar();
    return instancia;
  }

  function reiniciar() { instancia = null; }

  globalThis.Analitica = Object.freeze({
    version: VERSION,
    categoria: CATEGORIA,
    claveOptOut: CLAVE_OPT_OUT,
    tipos: TIPOS.slice(),
    crear: crear,
    obtener: obtener,
    reiniciar: reiniciar,
    leerOptOut: function (almacen) { return leerOptOut(almacen || almacenDisponible(globalThis)); },
    fijarOptOut: function (valor, almacen) { return fijarOptOut(almacen || almacenDisponible(globalThis), valor); },
    motivoInactividad: function () { return motivoInactividad(entornoReal()); },
    normalizarTermino: normalizarTermino,
    referenciaRecortada: referenciaRecortada,
  });
})();
