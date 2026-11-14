// Proyecto de sensores: el detector que elige el hallazgo.
//   node scripts/proyecto-sensores.mjs [sensores.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "sensores-planta.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [hora, temperatura, presion, estado] = l.split(",");
  return { hora: Number(hora), temperatura: Number(temperatura), presion: Number(presion), estado };
});
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const estados = [...new Set(filas.map((f) => f.estado))];
const averias = filas.filter((f) => f.estado === "averia").length;

console.log(`${filas.length} horas · estados: ${estados.map((e) => e + " " + filas.filter((f) => f.estado === e).length).join(" · ")}`);
const temps = filas.map((f) => f.temperatura);
console.log(`temperatura: media ${media(temps).toFixed(2)} · desviación ${desv(temps).toFixed(2)} · máximo ${Math.max(...temps).toFixed(1)}`);
console.log(`averías: ${averias} horas`);

const evaluar = (nombre, pred) => {
  const marcados = filas.filter(pred);
  const aciertos = marcados.filter((f) => f.estado === "averia").length;
  console.log(`${nombre.padEnd(24)} marca ${String(marcados.length).padStart(3)} · acierta ${String(aciertos).padStart(2)} · precisión ${(marcados.length ? (aciertos / marcados.length) * 100 : 0).toFixed(0)} % · recall ${((aciertos / averias) * 100).toFixed(0)} %`);
};
const m = media(temps), d = desv(temps);
evaluar("|z| > 3 global", (f) => Math.abs((f.temperatura - m) / d) > 3);
evaluar("temperatura > 85 °C", (f) => f.temperatura > 85);
// z calculado dentro de cada estado: la avería es su propia población.
const zPorEstado = (f) => {
  const g = filas.filter((x) => x.estado === f.estado);
  const mg = media(g.map((x) => x.temperatura)), dg = desv(g.map((x) => x.temperatura));
  return dg ? Math.abs((f.temperatura - mg) / dg) > 3 : false;
};
evaluar("|z| > 3 por estado", zPorEstado);
console.log("\nlos tres detectores usan la misma temperatura y dan tres respuestas: el detector define el hallazgo");
