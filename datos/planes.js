// Generado por generar.mjs el 2026-11-09T22:47:52.246Z — no editar a mano.
window.PLANES = {
  "_leeme": "Planes de la plataforma. Fichero de datos: lo lee plataforma/cobro/servidor.mjs y, si el portal esta configurado, tambien el portal. Las claves que empiezan por guion bajo son notas para quien lee; el codigo las ignora. Aqui NO va ninguna clave de Stripe: los identificadores de precio se leen del entorno (STRIPE_PRICE_APOYO y STRIPE_PRICE_UNICO).",
  "_regla": "El contenido del portal es el mismo en los tres planes: las 438 fichas, las figuras, el repaso espaciado y todos los ejercicios estan disponibles sin pagar. Se paga por apoyar el proyecto y por tener cuenta con sincronizacion entre dispositivos. No hay lecciones bloqueadas, ni version reducida, ni prueba de 7 dias, ni nada que se desbloquee al pagar.",
  "_invariante_comprobado": "El campo acceso_contenido vale \"completo\" en los tres planes y hay una comprobacion automatica que lo verifica (pruebas.mjs). Si alguien edita este fichero para bloquear lecciones, la comprobacion falla.",
  "moneda": "EUR",
  "_moneda": "Todos los importes estan en centimos de euro para no arrastrar errores de coma flotante. 300 son 3,00 EUR.",
  "planes": [
    {
      "id": "gratis",
      "orden": 1,
      "nombre": "Gratis",
      "etiqueta": "El portal entero, sin cuentas ni pagos",
      "precio_centimos": 0,
      "precio_texto": "0 EUR",
      "precio_por": "",
      "periodo": "ninguno",
      "tipo": "gratis",
      "precioIdEntorno": null,
      "acceso_contenido": "completo",
      "sincroniza": false,
      "es_pago": false,
      "resumen": "Todo el portal abierto: las 438 fichas, las figuras, los ejercicios y el repaso espaciado guardado en tu propio navegador. Sin registro, sin cookies de terceros y sin que nada salga de tu equipo.",
      "incluye": [
        "El temario completo y todas las figuras, sin recortes ni lecciones bloqueadas",
        "Progreso, preguntas acertadas y falladas, racha y plan guardados en el almacen local del navegador",
        "Repaso espaciado y exportacion a Anki",
        "Funciona abierto desde el disco (file://), sin red y sin instalar nada",
        "Ni siquiera hace falta crear una cuenta"
      ],
      "para_quien": "Para quien estudia solo en un dispositivo y no necesita cuentas: es el portal de siempre.",
      "nota": "Es el plan por defecto. Si no hay plataforma configurada o nadie ha pagado nunca, esto es lo que se tiene."
    },
    {
      "id": "apoyo",
      "orden": 2,
      "nombre": "Apoyo mensual",
      "etiqueta": "Cuenta y progreso sincronizado, mes a mes",
      "precio_centimos": 300,
      "precio_texto": "3 EUR al mes",
      "precio_por": "mes",
      "periodo": "mensual",
      "tipo": "suscripcion",
      "precioIdEntorno": "STRIPE_PRICE_APOYO",
      "acceso_contenido": "completo",
      "sincroniza": true,
      "es_pago": true,
      "resumen": "El mismo portal, con cuenta: el progreso viaja contigo y se puede recuperar si cambias de equipo o de navegador. Se paga por sostener el proyecto mes a mes y se puede dejar cuando quieras.",
      "incluye": [
        "El mismo contenido que el plan gratis, sin nada desbloqueado por pagar",
        "Cuenta propia y progreso sincronizado entre dispositivos",
        "Exportacion y borrado de tus datos desde la vista de datos del portal",
        "Las mejoras y el contenido nuevo, que se publican para todo el mundo a la vez",
        "Se cancela cuando quieras: el plan vuelve a gratis al final del periodo pagado. El enlace al portal de facturacion de Stripe (cambiar tarjeta o cancelar sin escribir a nadie) todavia no esta en el portal: mientras no lo este, se cancela por correo o desde el recibo que manda Stripe"
      ],
      "para_quien": "Para quien estudia en varios dispositivos, quiere el progreso a salvo y puede aportar tres euros al mes.",
      "nota": "La suscripcion se cobra cada mes hasta que se cancele. Si el cobro falla o se cancela, el plan vuelve a gratis y el progreso que ya esta sincronizado no se borra."
    },
    {
      "id": "unico",
      "orden": 3,
      "nombre": "Pago unico",
      "etiqueta": "Cuenta y sincronizacion para siempre, una sola vez",
      "precio_centimos": 2900,
      "precio_texto": "29 EUR una vez",
      "precio_por": "pago unico",
      "periodo": "unico",
      "tipo": "pago_unico",
      "precioIdEntorno": "STRIPE_PRICE_UNICO",
      "acceso_contenido": "completo",
      "sincroniza": true,
      "es_pago": true,
      "resumen": "Se paga una vez y la cuenta con sincronizacion queda para siempre. Para quien prefiere no tener una cuota mensual ni dejar una tarjeta guardada, y quiere apoyar el proyecto de golpe.",
      "incluye": [
        "El mismo contenido que el plan gratis, sin nada desbloqueado por pagar",
        "Cuenta propia y progreso sincronizado entre dispositivos, sin fecha de caducidad",
        "Exportacion y borrado de tus datos desde la vista de datos del portal",
        "Las mejoras y el contenido nuevo, que se publican para todo el mundo a la vez",
        "Sin cuotas ni renovaciones: no hay nada que cancelar"
      ],
      "para_quien": "Para quien quiere apoyar el proyecto una vez, detesta las suscripciones y valora no dejar datos de pago guardados.",
      "nota": "Es una compra, no una suscripcion: no se renueva ni vuelve a cobrarse. Como todo lo que se compra por internet en la Union Europea, tiene derecho de desistimiento de 14 dias si no se ha empezado a usar el servicio; conviene decirlo en las condiciones de contratacion."
    }
  ],
  "_pendiente_portal": "Falta la pagina de precios del portal y el boton que llama a POST /api/cobro/sesion. Falta tambien el enlace al portal de facturacion de Stripe (POST /v1/billing_portal/sessions), que no se puede escribir todavia porque necesita saber quien pide el enlace: el correo tiene que salir de la cuenta autenticada y no de la barra de direcciones. Por eso el plan de apoyo avisa de que ese enlace aun no esta. El portal no debe usar este fichero para decidir que se ve: solo para pintar la tabla de precios. Nunca debe bloquear una ficha segun el plan."
};
