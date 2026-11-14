// Proyecto de F1: la carrera, contada con datos. Reproduce las cifras de #/caso/f1.
//   node scripts/proyecto-f1.mjs [resultados.csv] [paradas.csv]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const resPath = process.argv[2] || join(process.cwd(), "web", "datos", "datasets", "f1-espana-2024-resultados.csv");
const pitPath = process.argv[3] || join(process.cwd(), "web", "datos", "datasets", "f1-espana-2024-paradas.csv");

const leer = (ruta) => readFileSync(ruta, "utf8").trim().split(/\r?\n/).slice(1);
const filasRes = leer(resPath).map((l) => {
  const m = l.match(/^([^,]+),"([^"]*)","([^"]*)",([^,]+),([^,]+),([^,]+),([^,]+),"([^"]*)"$/);
  return m ? { piloto: m[1], nombre: m[2], equipo: m[3], parrilla: Number(m[4]), posicion: Number(m[5]), puntos: Number(m[6]), vueltas: Number(m[7]), estado: m[8] } : null;
}).filter(Boolean);
const filasPit = leer(pitPath).map((l) => { const [piloto, vuelta, parada, dur] = l.split(","); return { piloto, vuelta: Number(vuelta), parada: Number(parada), duracion: Number(dur) }; });
const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`${filasRes.length} pilotos · ${filasPit.length} paradas`);
console.log(`gana ${filasRes[0].nombre} (${filasRes[0].equipo}) desde la ${filasRes[0].parrilla}.ª plaza de parrilla`);
const masRapida = filasPit.reduce((m, p) => (p.duracion < m.duracion ? p : m), filasPit[0]);
console.log(`parada más rápida: ${masRapida.piloto} en la vuelta ${masRapida.vuelta}, ${masRapida.duracion} s en el pit lane · media ${media(filasPit.map((p) => p.duracion)).toFixed(2)} s`);

const movimientos = filasRes.filter((f) => f.parrilla > 0).map((f) => ({ ...f, ganadas: f.parrilla - f.posicion }));
const gano = movimientos.reduce((m, f) => (f.ganadas > m.ganadas ? f : m), movimientos[0]);
const perdio = movimientos.reduce((m, f) => (f.ganadas < m.ganadas ? f : m), movimientos[0]);
console.log(`más ganó: ${gano.nombre} (+${gano.ganadas}) · más perdió: ${perdio.nombre} (${perdio.ganadas})`);

const porPiloto = new Map();
filasPit.forEach((p) => { if (!porPiloto.has(p.piloto)) porPiloto.set(p.piloto, []); porPiloto.get(p.piloto).push(p.duracion); });
for (const n of [1, 2, 3]) {
  const con = filasRes.filter((f) => (porPiloto.get(f.piloto) || []).length === n);
  if (con.length) console.log(`${con.length} pilotos con ${n} parada(s): posición media ${media(con.map((f) => f.posicion)).toFixed(1)}`);
}
// Serie de vueltas: vuelta rápida, cambios de líder y cambios de posición.
const vueltasPath = join(process.cwd(), "web", "datos", "datasets", "f1-espana-2024-vueltas.csv");
try {
  const vueltas = leer(vueltasPath).map((l) => { const [vuelta, piloto, posicion, tiempo] = l.split(","); return { vuelta: Number(vuelta), piloto, posicion: Number(posicion), tiempo: Number(tiempo) }; });
  const rapida = vueltas.reduce((m, x) => (x.tiempo < m.tiempo ? x : m), vueltas[0]);
  const lider = new Map();
  vueltas.forEach((x) => { if (x.posicion === 1) lider.set(x.vuelta, x.piloto); });
  const secuencia = [...lider.entries()].sort((a, b) => a[0] - b[0]);
  let cambios = 0;
  for (let i = 1; i < secuencia.length; i++) if (secuencia[i][1] !== secuencia[i - 1][1]) cambios += 1;
  console.log(`vueltas ${vueltas.length} · vuelta rápida ${rapida.piloto} ${rapida.tiempo} s (vuelta ${rapida.vuelta}) · ${cambios} cambios de líder`);
} catch { console.log("sin CSV de vueltas al lado: se omite la serie"); }
console.log("(la duración es el paso por el pit lane, no el tiempo parado)");
