// Proyecto de la app de mensajería: embudo por canal. Reproduce las cifras de #/caso/app.
//   node scripts/proyecto-app.mjs [eventos.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "eventos-app.csv");
const texto = readFileSync(RUTA, "utf8").trim();
const [cab, ...lineas] = texto.split(/\r?\n/);
const cols = cab.split(",");
const filas = lineas.map((l) => {
  const c = l.split(",");
  const o = {};
  cols.forEach((k, i) => { o[k] = c[i]; });
  return o;
});

const PASOS = ["visita", "registro", "activacion", "compra"];
const usuarios = new Set(filas.map((f) => f.usuario_id)).size;
console.log(`${filas.length} eventos · ${usuarios} usuarios`);

// Embudo: usuarios únicos que llegan a cada paso, y conversión desde el paso anterior.
let previo = usuarios;
for (const paso of PASOS) {
  const llegan = new Set(filas.filter((f) => f.evento === paso).map((f) => f.usuario_id)).size;
  const pct = ((llegan / usuarios) * 100).toFixed(1);
  const pasoPct = ((llegan / previo) * 100).toFixed(1);
  console.log(`${paso.padEnd(11)} ${String(llegan).padStart(4)} usuarios · ${pct} % del total · ${pasoPct} % desde el paso anterior`);
  previo = llegan;
}

// Por canal: la pregunta es si el canal cambia la conversión final.
for (const canal of ["organico", "pago", "referido"]) {
  const del = filas.filter((f) => f.canal === canal);
  const total = new Set(del.map((f) => f.usuario_id)).size;
  const compra = new Set(del.filter((f) => f.evento === "compra").map((f) => f.usuario_id)).size;
  console.log(`${canal.padEnd(9)} ${String(total).padStart(4)} usuarios · ${compra} compran (${((compra / total) * 100).toFixed(1)} %)`);
}
const abandono = filas.filter((f) => f.evento === "abandono").length;
console.log(`${abandono} eventos de abandono`);
