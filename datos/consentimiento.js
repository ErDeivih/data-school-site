// Generado por generar.mjs el 2026-11-09T22:47:52.246Z — no editar a mano.
window.CONSENTIMIENTO = {
  "version": 1,
  "generado_por": "plataforma/analitica/servidor.mjs",
  "nota": "Texto y datos de la categoría de analítica, para que el aviso de consentimiento y la vista #/datos digan exactamente lo mismo que hace el código. Si algún día cambia lo que se mide, se cambia aquí primero.",
  "endpoint": "/api/analitica/suceso",
  "resumen": "/api/analitica/resumen",
  "estado": "/api/analitica/estado",
  "retencion_dias": 400,
  "categorias": [
    {
      "id": "necesarias",
      "titulo": "Necesarias",
      "obligatoria": true,
      "por_defecto": true,
      "que_hace": "Guardan tu progreso, las preguntas acertadas y falladas, la racha, el plan y el tema claro u oscuro en el almacén local de este navegador.",
      "donde_vive": "localStorage de este navegador",
      "sale_del_equipo": false,
      "se_puede_revocar": "Sí, borrando los datos del sitio desde el navegador; sin ellas el portal no recuerda nada."
    },
    {
      "id": "analitica",
      "titulo": "Medición agregada, sin cookies",
      "obligatoria": false,
      "por_defecto": false,
      "que_hace": "Cuenta visitas, conceptos abiertos, ejercicios acertados o fallados, tiempo de lectura de cada concepto, búsquedas que no encuentran nada y el sitio desde el que llegas.",
      "que_no_hace": [
        "No usa cookies: no se escribe ni una, ni propias ni de terceros.",
        "No guarda tu dirección IP: se convierte en el prefijo de su red (/24) y se tira el resto. Se puede apagar del todo.",
        "No guarda el agente de usuario, la resolución ni ninguna huella del dispositivo.",
        "No te identifica entre visitas ni entre pestañas: el identificador de sesión vive en memoria y desaparece al cerrar la pestaña.",
        "No guarda la URL completa desde la que vienes: solo el dominio.",
        "No guarda búsquedas que parezcan un dato personal (un correo, un número largo): se descartan antes de salir del navegador."
      ],
      "donde_vive": "plataforma/datos/analitica.db, en el servidor y agregado por día (una fila por día, tipo y clave, no una por visita)",
      "ventana": "30 días en el panel; los agregados se borran a los 400 días",
      "sale_del_equipo": true,
      "se_puede_revocar": "Sí: el botón de renuncia de esta misma página detiene la medición al instante y se recuerda en este navegador."
    }
  ],
  "senales_del_navegador": {
    "dnt": "Si el navegador envía Do Not Track, la medición no se enciende aunque se acepte.",
    "gpc": "Si envía Global Privacy Control, tampoco.",
    "opt_out": "El botón de renuncia manda sobre todo lo demás y se recuerda en localStorage bajo la clave que publica el cliente como Analitica.claveOptOut."
  },
  "para_la_vista_datos": {
    "clave_opt_out": "aprender.v1.analitica.opt-out",
    "que_se_envia": ["tipo de suceso", "identificador del concepto o ejercicio", "resultado (acertado o fallado)", "segundos de lectura", "término buscado normalizado", "dominio desde el que vienes", "identificador de sesión en memoria"],
    "que_no_se_envia": ["cookies", "dirección IP", "agente de usuario", "huella del dispositivo", "URL completa de origen", "tu progreso guardado"]
  }
};
