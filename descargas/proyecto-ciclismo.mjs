// Proyecto de ciclismo: la montaña separa y el tiempo no son segundos.
//   node scripts/proyecto-ciclismo.mjs [etapas.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "etapas-ciclismo.csv");
const filas = readFileSync(RUTA, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [etapa, fecha, perfil, distancia, desnivel, corredor, equipo, tiempo, posicion] = l.split(",");
  return { etapa: Number(etapa), perfil, distancia: Number(distancia), desnivel: Number(desnivel), corredor, tiempo: Number(tiempo), posicion: Number(posicion) };
});
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const etapas = [...new Set(filas.map((f) => f.etapa))];

console.log(`${filas.length} filas · ${etapas.length} etapas · ${new Set(filas.map((f) => f.corredor)).size} corredores`);

// 1) Comprobar la unidad antes de derivar nada.
const v = filas.map((f) => f.distancia / (f.tiempo / 3600));
console.log(`\nsi tiempo_s fueran segundos, la velocidad saldría entre ${Math.min(...v).toFixed(0)} y ${Math.max(...v).toFixed(0)} km/h: imposible.`);
console.log("el campo no son segundos reales; no se calcula velocidad y se compara en la misma unidad.");

// 2) Diferencia con el último por perfil (misma unidad, comparable).
console.log("\nperfil    etapas  desnivel medio  diferencia media con el último  relativa");
for (const p of ["llano", "media", "montana"]) {
  const es = etapas.filter((e) => filas.find((f) => f.etapa === e).perfil === p);
  const gaps = es.map((e) => {
    const g = filas.filter((f) => f.etapa === e);
    const w = g.find((f) => f.posicion === 1);
    const ultimo = g.reduce((m, f) => (f.tiempo > m.tiempo ? f : m), g[0]);
    return { gap: ultimo.tiempo - w.tiempo, pct: ((ultimo.tiempo - w.tiempo) / w.tiempo) * 100, desnivel: g[0].desnivel };
  });
  console.log(`${p.padEnd(9)} ${String(es.length).padStart(6)} ${String(Math.round(media(gaps.map((x) => x.desnivel)))).padStart(14)} m ${String(Math.round(media(gaps.map((x) => x.gap)))).padStart(26)} s ${media(gaps.map((x) => x.pct)).toFixed(1).padStart(9)} %`);
}

// 3) General: suma de tiempos. Válida porque todos están en la misma unidad.
const general = {};
filas.forEach((f) => { general[f.corredor] = (general[f.corredor] || 0) + f.tiempo; });
console.log("\ngeneral por suma de tiempos:");
Object.entries(general).sort((a, b) => a[1] - b[1]).slice(0, 5).forEach(([c, t], i) => console.log(`  ${i + 1}. ${c} ${t} (unidad del fichero)`));
