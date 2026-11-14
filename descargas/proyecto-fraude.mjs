// Proyecto de fraude: qué regla merece la pena cuando equivocarse cuesta distinto.
//   node scripts/proyecto-fraude.mjs [transacciones.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "transacciones-fraude.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [id, importe, hora, canal, pais, dispositivo, intentos, antiguedad, fraude] = l.split(",");
  return { id, importe: Number(importe), intentos: Number(intentos), antiguedad: Number(antiguedad), fraude: Number(fraude) };
});
const COSTE_FN = 100, COSTE_FP = 5;
const evaluar = (pred) => {
  const tp = filas.filter((x) => pred(x) && x.fraude).length;
  const fp = filas.filter((x) => pred(x) && !x.fraude).length;
  const fn = filas.filter((x) => !pred(x) && x.fraude).length;
  const tn = filas.filter((x) => !pred(x) && !x.fraude).length;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return { tp, fp, fn, tn, precision, recall, coste: fn * COSTE_FN + fp * COSTE_FP };
};
console.log(`${filas.length} transacciones · ${filas.filter((f) => f.fraude).length} fraudes · tasa ${((filas.filter((f) => f.fraude).length / filas.length) * 100).toFixed(2)} %`);
console.log(`supuestos: cada fraude no visto cuesta ${COSTE_FN} EUR; cada aviso falso, ${COSTE_FP} EUR\n`);
console.log("regla                              TP   FP   FN  prec  rec   coste");
for (const [nombre, pred] of [
  ["no hacer nada", () => false],
  ["importe > 200", (x) => x.importe > 200],
  ["importe > 200 y 3+ intentos", (x) => x.importe > 200 && x.intentos >= 3],
  ["4+ intentos y cuenta < 180 días", (x) => x.intentos >= 4 && x.antiguedad < 180],
  ["avisar de todo", () => true],
]) {
  const m = evaluar(pred);
  console.log(`${nombre.padEnd(33)} ${String(m.tp).padStart(3)} ${String(m.fp).padStart(4)} ${String(m.fn).padStart(4)} ${(m.precision * 100).toFixed(0).padStart(4)}% ${(m.recall * 100).toFixed(0).padStart(4)}% ${String(m.coste).padStart(6)} EUR`);
}
console.log("\n(la regla del importe encuentra casi todo el fraude y cuesta MÁS que no hacer nada: los 1.541 avisos falsos)");
