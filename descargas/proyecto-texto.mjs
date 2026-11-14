// Proyecto de texto: seis temas que se distinguen por cómo hablan.
//   node scripts/proyecto-texto.mjs [documentos.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "documentos-corpus.csv");
const texto = readFileSync(RUTA, "utf8").trim();
const [cab, ...lineas] = texto.split(/\r?\n/);
const cols = cab.split(",");
const docs = lineas.map((l) => {
  const c = l.match(/"([^"]*)"|([^,]+)/g).map((x) => x.replace(/^"|"$/g, ""));
  const o = {};
  cols.forEach((k, i) => { o[k] = c[i]; });
  return o;
});
const STOP = new Set("de la que el en y a los se las por un una con para es al lo como más pero sin sobre entre cuando muy también esta este son fue ha no su sus le les del".split(" "));
const palabras = (d) => d.texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const temas = [...new Set(docs.map((d) => d.tema))];

console.log(`${docs.length} documentos · ${temas.length} temas · ${new Set(docs.map((d) => d.id)).size} identificadores`);

const vocab = {};
temas.forEach((t) => { vocab[t] = new Set(); docs.filter((d) => d.tema === t).forEach((d) => palabras(d).forEach((w) => vocab[t].add(w))); });
const total = new Set();
temas.forEach((t) => vocab[t].forEach((w) => total.add(w)));
console.log(`vocabulario total ${total.size} palabras`);
temas.forEach((t) => console.log(`  ${t.padEnd(9)} ${docs.filter((d) => d.tema === t).length} documentos · ${vocab[t].size} palabras`));

let maxJac = 0, par = "";
for (let i = 0; i < temas.length; i++) for (let j = i + 1; j < temas.length; j++) {
  const a = vocab[temas[i]], b = vocab[temas[j]];
  let inter = 0; a.forEach((w) => { if (b.has(w)) inter++; });
  const jac = inter / (a.size + b.size - inter);
  if (jac > maxJac) { maxJac = jac; par = temas[i] + "/" + temas[j]; }
}
console.log(`solapamiento máximo ${(maxJac * 100).toFixed(1)} % entre ${par}`);

const vec = (d) => { const v = {}; palabras(d).forEach((w) => { v[w] = (v[w] || 0) + 1; }); return v; };
const cos = (a, b) => { let s = 0, na = 0, nb = 0; for (const k in a) { na += a[k] * a[k]; if (b[k]) s += a[k] * b[k]; } for (const k in b) nb += b[k] * b[k]; return s / (Math.sqrt(na) * Math.sqrt(nb) || 1); };
let aciertos = 0;
docs.forEach((d, i) => {
  let mejor = null, ms = -1;
  for (const t of temas) {
    const suma = {};
    docs.filter((x, j) => x.tema === t && j !== i).forEach((o) => { const v = vec(o); for (const k in v) suma[k] = (suma[k] || 0) + v[k]; });
    const s = cos(vec(d), suma);
    if (s > ms) { ms = s; mejor = t; }
  }
  if (mejor === d.tema) aciertos++;
});
console.log(`\nacierto deja-uno-fuera ${((aciertos / docs.length) * 100).toFixed(1)} % (${aciertos}/${docs.length}) · base al azar ${(100 / temas.length).toFixed(1)} %`);
console.log("si el acierto es 100 %, mira el solapamiento: el problema puede ser demasiado fácil");
