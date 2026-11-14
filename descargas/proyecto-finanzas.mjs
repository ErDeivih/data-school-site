// Proyecto de finanzas: la factura de la luz, paso a paso y reproducible.
//   node scripts/proyecto-finanzas.mjs [ruta-al-csv]
// Imprime exactamente las cifras que enseña la ficha de #/caso/finanzas.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Por defecto, el CSV real del proyecto; acepta otra ruta como argumento.
const RUTA = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "precios-luz-2024.csv");
const texto = readFileSync(RUTA, "utf8").replace(/^\uFEFF/, "").trim();
const [cab, ...lineas] = texto.split(/\r?\n/);
const cols = cab.split(",");
const filas = lineas.map((l) => {
  const c = l.split(",");
  const o = {};
  cols.forEach((k, i) => { o[k] = Number.isFinite(Number(c[i])) ? Number(c[i]) : c[i]; });
  return o;
});

// 1 · Validar: 60 días completos de 24 horas
const horas = filas.length / 24;
console.log(`filas ${filas.length} · días ${horas}`);
if (!Number.isInteger(horas)) { console.error("faltan horas: las medias por hora estarían sesgadas"); process.exit(1); }

// 2 · Agregar por mes y por hora del día
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const porMes = new Map(), porHora = new Map();
for (const f of filas) {
  const mes = String(f.fecha).slice(0, 7);
  if (!porMes.has(mes)) porMes.set(mes, []);
  porMes.get(mes).push(f.precio_eur_mwh);
  if (!porHora.has(f.hora)) porHora.set(f.hora, []);
  porHora.get(f.hora).push(f.precio_eur_mwh);
}

// 3 · Media y mediana: si se parecen, no hay unos pocos picos mandando
const precios = filas.map((f) => f.precio_eur_mwh);
const orden = [...precios].sort((a, b) => a - b);
const mediana = orden[Math.floor(orden.length / 2)];
const medio = media(precios);
console.log(`precio medio ${medio.toFixed(2)} · mediana ${mediana.toFixed(2)} EUR/MWh`);

const horasDia = [...porHora.entries()].map(([h, xs]) => ({ h, p: media(xs) })).sort((a, b) => a.h - b.h);
const barata = horasDia.reduce((m, x) => (x.p < m.p ? x : m));
const cara = horasDia.reduce((m, x) => (x.p > m.p ? x : m));
console.log(`hora más barata ${barata.h}:00 (${barata.p.toFixed(2)}) · más cara ${cara.h}:00 (${cara.p.toFixed(2)})`);

// 4 · Factura: 270 kWh al mes, a precio medio y a la hora más barata
const KWH = 270;
const costeMedio = (medio / 1000) * KWH;
const costeBarato = (barata.p / 1000) * KWH;
console.log(`270 kWh: ${costeMedio.toFixed(2)} EUR a precio medio · ${costeBarato.toFixed(2)} EUR a la hora barata · ahorro ${(((costeMedio - costeBarato) / costeMedio) * 100).toFixed(1)} %`);

// 5 · Causa: correlación del precio con el sol y con el viento
const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  const num = a.reduce((t, x, i) => t + (x - ma) * (b[i] - mb), 0);
  const den = Math.sqrt(a.reduce((t, x) => t + (x - ma) ** 2, 0) * b.reduce((t, x) => t + (x - mb) ** 2, 0));
  return den ? num / den : 0;
};
console.log(`correlación con el sol ${corr(precios, filas.map((f) => f.solar_mw)).toFixed(2)} · con el viento ${corr(precios, filas.map((f) => f.eolica_mw)).toFixed(2)}`);
console.log(`meses: ${[...porMes.entries()].map(([m, xs]) => `${m} ${media(xs).toFixed(2)}`).join(" · ")}`);
