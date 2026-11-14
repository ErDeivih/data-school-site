// Proyecto de tenis: el saque pesa y la racha no aparece.
//   node scripts/proyecto-tenis.mjs [tenis.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "tenis-puntos.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [partido, superficie, set, juego, sacador, tipo, duracion, gano] = l.split(",");
  return { partido, superficie, juego: Number(juego), set: Number(set), tipo, duracion: Number(duracion), gano };
});
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`${filas.length} puntos · ${new Set(filas.map((f) => f.partido)).size} partidos`);

const base = filas.filter((f) => f.gano === "sacador").length / filas.length;
console.log(`\nP(sacador gana) = ${(base * 100).toFixed(1)} %`);
for (const sp of [...new Set(filas.map((f) => f.superficie))].sort()) {
  const g = filas.filter((f) => f.superficie === sp);
  console.log(`  ${sp.padEnd(7)} ${g.length} puntos · ${((g.filter((f) => f.gano === "sacador").length / g.length) * 100).toFixed(1)} %`);
}
console.log(`duración media: gana el sacador ${media(filas.filter((f) => f.gano === "sacador").map((f) => f.duracion)).toFixed(2)} s · gana el resto ${media(filas.filter((f) => f.gano === "resto").map((f) => f.duracion)).toFixed(2)} s`);

// Racha: se compara cada punto con el anterior del mismo juego.
const juegos = new Map();
filas.forEach((f) => { const k = f.partido + "|" + f.set + "|" + f.juego; if (!juegos.has(k)) juegos.set(k, []); juegos.get(k).push(f.gano); });
let pares = 0, mismo = 0, nSac = 0, sacTrasSac = 0, nRes = 0, sacTrasRes = 0;
for (const sec of juegos.values()) {
  for (let i = 1; i < sec.length; i++) {
    pares++;
    if (sec[i] === sec[i - 1]) mismo++;
    if (sec[i - 1] === "sacador") { nSac++; if (sec[i] === "sacador") sacTrasSac++; }
    else { nRes++; if (sec[i] === "sacador") sacTrasRes++; }
  }
}
console.log(`\nracha: P(mismo ganador que el punto anterior) = ${((mismo / pares) * 100).toFixed(1)} % (${pares} pares)`);
console.log(`P(sacador gana | ganó el sacador antes) = ${((sacTrasSac / nSac) * 100).toFixed(1)} % (n=${nSac})`);
console.log(`P(sacador gana | ganó el resto antes)  = ${((sacTrasRes / nRes) * 100).toFixed(1)} % (n=${nRes})`);
console.log("si hubiera racha, la primera sería mayor que la segunda y ambas mayores que la base");
