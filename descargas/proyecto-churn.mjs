// Proyecto de abandono: qué anticipa la baja. Reproduce las cifras de #/caso/churn.
//   node scripts/proyecto-churn.mjs [clientes.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "clientes-churn.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [id, antiguedad, uso, reclamaciones, baja] = l.split(",");
  return { id, antiguedad: Number(antiguedad), uso: Number(uso), reclamaciones: Number(reclamaciones), baja: Number(baja) };
});
const tasa = (xs) => (xs.length ? (xs.filter((x) => x.baja).length / xs.length) * 100 : 0);

console.log(`${filas.length} clientes · ${filas.filter((f) => f.baja).length} bajas · tasa ${tasa(filas).toFixed(1)} %`);

console.log("\npor reclamaciones:");
for (const r of [0, 1, 2, 3]) {
  const g = filas.filter((x) => x.reclamaciones === r);
  console.log(`${r} reclamaciones: ${g.length} clientes · ${g.filter((x) => x.baja).length} bajas · ${tasa(g).toFixed(1)} %`);
}

console.log("\npor uso mensual:");
for (const [a, b] of [[0, 15], [15, 25], [25, 35], [35, 999]]) {
  const g = filas.filter((x) => x.uso >= a && x.uso < b);
  console.log(`${a}-${b === 999 ? "+" : b}: ${g.length} clientes · ${tasa(g).toFixed(1)} %`);
}

console.log("\npor antigüedad (meses):");
for (const [a, b] of [[0, 12], [12, 25], [25, 37], [37, 999]]) {
  const g = filas.filter((x) => x.antiguedad >= a && x.antiguedad < b);
  console.log(`${a}-${b === 999 ? "+" : b}: ${g.length} clientes · ${tasa(g).toFixed(1)} %`);
}

// Regla simple: dos o más reclamaciones. Se mide con precisión y recall, no con «aciertos».
const marca = filas.filter((x) => x.reclamaciones >= 2);
const aciertos = marca.filter((x) => x.baja === 1).length;
const bajas = filas.filter((x) => x.baja === 1).length;
console.log(`\nregla «2 o más reclamaciones»: marca ${marca.length} · acierta ${aciertos} · precisión ${((aciertos / marca.length) * 100).toFixed(1)} % · recall ${((aciertos / bajas) * 100).toFixed(1)} %`);
console.log("(una regla simple no demuestra causa: mide cuánto ayuda a priorizar)");
