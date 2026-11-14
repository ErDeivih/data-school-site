// Proyecto de fútbol: goles del fútbol base de Castilla y León, con datos de FACYLF.
//   node scripts/proyecto-futbol.mjs --extraer   (lee los dosieres de FACYLF y escribe el CSV)
//   node scripts/proyecto-futbol.mjs             (analiza el CSV del portal)
// FACYLF se busca en FACYLF o, si no, en F:/Proyectos/facylf.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ_FACYLF = process.env.FACYLF || "F:/Proyectos/facylf";
const CSV = join(process.cwd(), "datos", "reales", "facylf-goles.csv");

if (process.argv.includes("--extraer")) {
  const dir = join(RAIZ_FACYLF, "informes");
  if (!existsSync(dir)) { console.error("no encuentro los dosieres de FACYLF en", dir); process.exit(1); }
  const vistos = new Set();
  const filas = [];
  let repetidos = 0;
  let excluidos = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".datos.json"))) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    // Solo los dosieres cuyo grupo declara provincia de Castilla y León. Los demás (otras
    // federaciones) se quedan fuera: sumarlos convertiría el proyecto en «fútbol de España».
    const contexto = (j.datos && j.datos.contexto) || [];
    const grupo = String((contexto[0] || {}).grupo_nombre || "");
    const esCYL = /(Ávila|Burgos|León|Palencia|Salamanca|Segovia|Soria|Valladolid|Zamora)/i.test(grupo);
    if (!esCYL) { excluidos += 1; continue; }
    for (const g of (j.datos && j.datos.goles_del_partido) || []) {
      const min = Number(g.minute_base);
      if (!Number.isFinite(min)) continue;
      const minuto = min + (Number(g.minute_added) || 0);
      // Un mismo gol aparece en el dosier de los dos equipos: se deduplica por partido+minuto+lado.
      const clave = [g.match_id, minuto, g.lado_beneficiado, g.equipo].join("|");
      if (vistos.has(clave)) { repetidos += 1; continue; }
      vistos.add(clave);
      filas.push([g.match_id, g.equipo, minuto, g.lado_beneficiado].join(","));
    }
  }
  mkdirSync(join(process.cwd(), "datos", "reales"), { recursive: true });
  writeFileSync(CSV, ["partido,equipo,minuto,lado", ...filas].join("\n") + "\n", "utf8");
  console.log(`goles únicos ${filas.length} · duplicados entre dosieres ${repetidos} · dosieres de fuera de Castilla y León ${excluidos}`);
  process.exit(0);
}

const filas = readFileSync(CSV, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const [partido, equipo, minuto, lado] = l.split(",");
  return { partido, equipo, minuto: Number(minuto), lado };
});
const partidos = new Set(filas.map((g) => g.partido)).size;
const local = filas.filter((g) => g.lado === "local").length;
const banda = (m) => (m < 15 ? "0-15" : m < 30 ? "15-30" : m < 45 ? "30-45" : m < 60 ? "45-60" : m < 75 ? "60-75" : m <= 90 ? "75-90" : "descuento");
const porBanda = new Map();
filas.forEach((g) => { const b = banda(g.minuto); porBanda.set(b, (porBanda.get(b) || 0) + 1); });
const equipos = new Map();
filas.forEach((g) => equipos.set(g.equipo, (equipos.get(g.equipo) || 0) + 1));
const top = [...equipos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

console.log(`goles ${filas.length} · partidos con gol ${partidos} · media ${(filas.length / partidos).toFixed(2)} por partido`);
console.log(`local ${local} (${((local / filas.length) * 100).toFixed(1)} %) · visitante ${filas.length - local}`);
console.log(`bandas: ${[...porBanda.entries()].map(([b, n]) => b + " " + n).join(" · ")}`);
console.log(`equipos con más goles: ${top.map(([e, n]) => e + " " + n).join(" · ")}`);
console.log("(solo partidos con al menos un gol: los 0-0 no existen en esta fuente)");
