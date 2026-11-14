// Proyecto de ventas mensuales: cuando el total del mes engaña.
//   node scripts/proyecto-ventas.mjs [ventas.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "ventas-mensuales.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [fecha, tienda, unidades, ingresos] = l.split(",");
  return { fecha, tienda, unidades: Number(unidades), ingresos: Number(ingresos), dow: new Date(fecha + "T00:00:00").getDay() };
});
const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].sort();

console.log("mes      días  ingresos  media/día");
for (const mes of meses) {
  const del = filas.filter((f) => f.fecha.slice(0, 7) === mes);
  const dias = new Set(del.map((f) => f.fecha)).size;
  const ingresos = del.reduce((t, f) => t + f.ingresos, 0);
  console.log(`${mes}  ${String(dias).padStart(4)}  ${String(Math.round(ingresos)).padStart(8)}  ${String(Math.round(ingresos / dias)).padStart(9)}`);
}
const primera = filas.filter((f) => f.fecha.slice(0, 7) === meses[0]);
const ultima = filas.filter((f) => f.fecha.slice(0, 7) === meses[meses.length - 1]);
const totalVar = (ultima.reduce((t, f) => t + f.ingresos, 0) / primera.reduce((t, f) => t + f.ingresos, 0) - 1) * 100;
const diasVar = ((ultima.reduce((t, f) => t + f.ingresos, 0) / new Set(ultima.map((f) => f.fecha)).size) / (primera.reduce((t, f) => t + f.ingresos, 0) / new Set(primera.map((f) => f.fecha)).size) - 1) * 100;
console.log(`\nenero -> junio: total ${totalVar.toFixed(1)} % · media por día ${diasVar.toFixed(1)} %`);
console.log("(el total depende de cuántos días tiene el mes y de cuántos se muestrearon)");

for (const tienda of [...new Set(filas.map((f) => f.tienda))].sort()) {
  const del = filas.filter((f) => f.tienda === tienda);
  const porMes = new Map();
  del.forEach((f) => { const m = f.fecha.slice(0, 7); if (!porMes.has(m)) porMes.set(m, { n: 0, i: 0 }); const x = porMes.get(m); x.n++; x.i += f.ingresos; });
  const ms = [...porMes.keys()].sort();
  const a = porMes.get(ms[0]), b = porMes.get(ms[ms.length - 1]);
  console.log(`${tienda.padEnd(7)} total ${((b.i / a.i - 1) * 100).toFixed(1)} % · media/día ${(((b.i / b.n) / (a.i / a.n) - 1) * 100).toFixed(1)} %`);
}

const dows = [1, 2, 3, 4, 5, 6, 0];
const nombres = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
console.log("\npor día de la semana:");
dows.forEach((d, i) => console.log(`${nombres[i].padEnd(10)} ${Math.round(filas.filter((f) => f.dow === d).reduce((t, f) => t + f.ingresos, 0))}`));
