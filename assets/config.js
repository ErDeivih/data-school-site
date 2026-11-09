// config.js — lo único que hay que tocar para conectar el portal con la plataforma.
//
// El portal funciona SOLO, sin nada de esto: el progreso vive en el navegador y no se
// envía a ningún sitio. Si rellenas estas direcciones, aparecen las pantallas de cuenta y
// el progreso se sincroniza. Si dejas los textos vacíos, todo lo de la plataforma
// desaparece del portal: no hay botones que no lleven a ninguna parte.
//
// Para levantarlo en tu máquina:
//   cd aprender
//   node plataforma/servidor.mjs                    -> identidad, en el 8789
//   node plataforma/analitica/servidor.mjs          -> analítica, en el 8790 (opcional)
// y deja aquí las direcciones. Los orígenes permitidos por defecto son
// http://127.0.0.1:8788 y http://localhost:8788 (ver plataforma/LEEME.md).

window.ACADEMIA = {
  // Servicio de identidad y progreso. Vacío = sin cuentas.
  api: "",

  // Servicio de cobro (Stripe). Vacío = la página de precios se ve, pero el botón avisa de
  // que el cobro no está conectado, en vez de fallar.
  cobro: "",

  // Servicio de analítica. Vacío = no se mide nada. Aunque esté puesto, no se envía nada
  // hasta que la persona lo acepte en el aviso de cookies.
  analitica: "",

  // Nombre del producto, por si algún día se despliega con otro.
  nombre: "Data School",
};
