// Proyecto de riesgo de crédito: la exactitud que engaña. Reproduce #/caso/credito.
//   node scripts/proyecto-credito.mjs [credito.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "credito-empresas.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [empresa, anyo, deuda, cobertura, liquidez, margen, tamano, impago] = l.split(",");
  return { empresa, deuda: Number(deuda), cobertura: Number(cobertura), liquidez: Number(liquidez), margen: Number(margen), impago: Number(impago) };
});
const impagos = filas.filter((f) => f.impago).length;
console.log(`${filas.length} empresas · ${impagos} impagos · tasa base ${((impagos / filas.length) * 100).toFixed(1)} %`);

const matriz = (pred) => {
  const tp = filas.filter((f) => pred(f) && f.impago).length;
  const fp = filas.filter((f) => pred(f) && !f.impago).length;
  const fn = filas.filter((f) => !pred(f) && f.impago).length;
  const tn = filas.filter((f) => !pred(f) && !f.impago).length;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, tn, precision, recall, f1: (2 * precision * recall) / (precision + recall || 1), exactitud: (tp + tn) / filas.length };
};

// La regla trivial: decir que nadie impaga.
const todosSanos = matriz(() => false);
console.log(`\nregla trivial «nadie impaga»: exactitud ${(todosSanos.exactitud * 100).toFixed(1)} % · recall 0 %`);

// Umbral elegido por F1 sobre deuda/equity.
let mejor = { th: 1, m: matriz((f) => f.deuda > 1) };
for (let th = 0.3; th <= 3.001; th += 0.05) {
  const m = matriz((f) => f.deuda > th);
  if (m.f1 > mejor.m.f1) mejor = { th: +th.toFixed(2), m };
}
const m = mejor.m;
console.log(`\numbral deuda/equity > ${mejor.th}: TP ${m.tp} · FP ${m.fp} · FN ${m.fn} · TN ${m.tn}`);
console.log(`precisión ${(m.precision * 100).toFixed(1)} % · recall ${(m.recall * 100).toFixed(1)} % · F1 ${m.f1.toFixed(2)} · exactitud ${(m.exactitud * 100).toFixed(1)} %`);
console.log(`la exactitud (${(m.exactitud * 100).toFixed(1)} %) es PEOR que no hacer nada (${(todosSanos.exactitud * 100).toFixed(1)} %), y aun así la regla sirve: encuentra ${(m.recall * 100).toFixed(0)} % de los impagos`);

console.log("\ntasa de impago por deuda/equity:");
for (const [a, b] of [[0, 0.5], [0.5, 1], [1, 2], [2, 999]]) {
  const g = filas.filter((f) => f.deuda >= a && f.deuda < b);
  console.log(`${a}-${b === 999 ? "+" : b}: ${g.length} empresas · ${((g.filter((f) => f.impago).length / (g.length || 1)) * 100).toFixed(1)} % impago`);
}
