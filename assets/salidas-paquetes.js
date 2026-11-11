// Generado por _generar-salidas-paquetes.py — salida esperada real de cada paquete.
window.SALIDAS_PAQUETES = {
 "P11": {
  "lineas": [
   "filas: 180 · combinaciones carrera-piloto: 6 · incidencias: 0",
   "vueltas de ritmo: 174 · paradas: 6",
   "piloto compuesto vueltas ritmo_medio_s mejor_vuelta_s",
   "A      duro      36        88.601        83.147",
   "A      medio     51        89.487        84.090",
   "B      duro      24        88.552        83.160",
   "B      medio     63        89.543        84.036",
   "límite: CSV sintético de tres carreras; no sirve para comparar coches ni temporadas."
  ]
 },
 "P12": {
  "lineas": [
   "datos: 180 vueltas · 174 de ritmo + 6 de parada",
   "stints: 12 · stints más rápido: monza/A despues (83.529 s)",
   "antes 89.515 s · después 88.577 s · diferencia -0.939 s",
   "coste medio de la parada: 22.369 s",
   "panel: escrito en resultados\\panel.html",
   "fuente: telemetria-f1 (catálogo Data School) · 3 carreras × 2 pilotos × 30 vueltas · fecha 2026-11-10",
   "límite: 3 carreras sintéticas y una sola parada por piloto: el panel describe este CSV, no una temporada real; la parada y el neumático van juntos y no se separan."
  ]
 },
 "P13": {
  "lineas": [
   "datos: 180 vueltas × 10 columnas · 6 pares carrera/piloto",
   "vueltas comparables: 174 · paradas excluidas: 6",
   "media antes: 89.518 s · media después: 88.582 s",
   "diferencia bruta (después − antes): -0.937 s (114 vs 60 vueltas)",
   "diferencia controlada por carrera y piloto: -0.928 s (6 estratos)",
   "ajuste: después -0.831 s · edad +0.024 s/vuelta · vuelta +0.000 s/vuelta · sigma 0.197 s",
   "permutación (2000 barajados): p = 0.000",
   "lectura: la diferencia bruta no es ruido (p pequeño), pero tampoco es la parada: el ajuste deja un efecto de -0.831 s cuando se descuentan neumático, combustible y circuito."
  ]
 },
 "P14": {
  "lineas": [
   "activos: 6 · meses: 60 · tipo libre de riesgo: 2.00%",
   "activo      beta   volatilidad   caída máx.   VaR95    Sharpe",
   "indice      1.000         6.66%       -14.24%    -3.40%   -0.500",
   "accion-a    0.246         9.98%       -41.06%    -4.61%   -1.149",
   "accion-b   -0.141        11.34%       -48.18%    -6.45%   -1.071",
   "accion-c    0.127        17.74%       -47.33%    -8.82%   -0.184",
   "accion-d   -0.267        16.50%       -19.19%    -8.20%    0.122",
   "accion-e    0.116        21.28%       -23.18%    -8.70%    0.343"
  ]
 },
 "P15": {
  "lineas": [
   "datos: 360 filas · 60 meses × 5 acciones · índice con media -0.0009 por mes",
   "acción       beta    alpha/mes   alpha/año  IC95% anual          p-valor   R²",
   "accion-a      0.246   -0.00762   -0.0914   [-0.1786, -0.0042]   0.0398   0.027",
   "accion-b     -0.141   -0.00847   -0.1017   [-0.2018, -0.0016]   0.0464   0.007",
   "accion-c      0.127   +0.00035   +0.0042   [-0.1526, +0.1610]   0.9579   0.002",
   "accion-d     -0.267   +0.00415   +0.0498   [-0.0954, +0.1950]   0.5014   0.012",
   "accion-e      0.116   +0.00938   +0.1126   [-0.0757, +0.3009]   0.2411   0.001",
   "pruebas: 5 alpha · sin corregir 2 · Bonferroni 0 (umbral 0.010) · Holm 0"
  ]
 },
 "P16": {
  "lineas": [
   "cartera: 60 meses · media mensual -0.046 % · volatilidad anual 8.38 %",
   "retorno anualizado: aritmético -0.55 % · geométrico -0.89 % · Sharpe -0.07",
   "riesgo: VaR95 mensual -3.63 % · máxima caída -21.37 %",
   "escenarios a 12 meses: base -0.89 % · adverso -38.93 %",
   "sensibilidad (10.000 €): -4.9%→9.511 € a 1 a. · -2.9%→9.711 € a 1 a. · -0.9%→9.911 € a 1 a. · +1.1%→10.111 € a 1 a. · +3.1%→10.311 € a 1 a.",
   "memo: escrito en resultados\\memo.md",
   "fuente: cartera-acciones (catálogo Data School) · 60 meses sintéticos · 5 acciones · fecha 2026-11-10",
   "límite: datos sintéticos y 60 meses; no es asesoramiento financiero."
  ]
 },
 "P17": {
  "lineas": [
   "datos: 400 filas de la API simulada · 400 claves únicas",
   "primera carga: aceptadas 400 · rechazadas 0 · nuevas 400 · actualizadas 0 · iguales 0",
   "segunda carga: aceptadas 400 · nuevas 0 · actualizadas 0 · iguales 400",
   "bruto: 1 respuesta(s) guardada(s) · hash 4640eb4171bee2d0…",
   "esquema: posición 1..20, compuesto blando|medio, tiempos positivos, clave única",
   "lectura: la segunda carga deja 0 filas nuevas; el bruto conserva la respuesta y la cuarentena dice por qué se rechazó cada fila.",
   "límite: API simulada con un CSV congelado; no hay paginación, red, reintentos HTTP ni CDC real."
  ]
 },
 "P18": {
  "lineas": [
   "datos: 400 filas × 12 columnas · 20 carreras × 20 pilotos",
   "columnas posteriores a la carrera: posicion_final, puntos · fuga: 2 columnas",
   "posición final → puntos: 20 puestos · 11 valores de puntos",
   "línea base (parrilla): MAE 1.012 · Spearman 0.9763",
   "partición por carrera: train 320 (r01–r16) · test 80 (r17–r20)",
   "modelo honesto: MAE 1.4148 · Spearman 0.9689",
   "la parrilla en el test: MAE 1.0625 · Spearman 0.9756 → el modelo NO bate la línea base",
   "orden dentro de cada carrera: modelo MAE 1.1375 · Spearman 0.9770 · parrilla MAE 1.0625 · Spearman 0.9796"
  ]
 },
 "P19": {
  "lineas": [
   "datos: 180 vueltas · 6 stints · 24 pares a igual edad",
   "grupos: A (paró antes) 88.567 s · B (esperó) 88.552 s",
   "efecto B − A: -0.0145 s · IC95 % [-0.1278, +0.0988] · p_signos 1.000",
   "signos: 12 de 24 positivas",
   "informe: escrito en resultados\\informe.md",
   "lectura: el intervalo cruza 0; no hay evidencia de que esperar gane con estos datos.",
   "límite: Sin posiciones, sin tráfico y sin una sola parada por piloto: no se puede atribuir la diferencia a la estrategia; el undercut real depende de la pista y del rival."
  ]
 },
 "P20": {
  "lineas": [
   "origen: 380 filas × 12 columnas · 20 equipos · 38 jornadas",
   "grano: (jornada, local) único en 380 filas · trampa: (local, visitante) solo 20 pares, repetidos 19 veces cada uno",
   "nulos: 0 · resultado coherente con los goles: 380/380",
   "dim_equipo: 20 filas · dim_jornada: 38 filas · hecho: 380 filas",
   "integridad: 0 claves huérfanas · grano del hecho: 380 claves (jornada, local) y 380 (jornada, visitante)",
   "cuadre origen → hecho: 0 diferencias · goles 717 · tiros 6172 · xG 687.23 · amarillas 1219 · posesión 20551",
   "clasificación desde el hecho: 20 equipos × 38 partidos · puntos 1026 = 3·266 + 2·114 · GF 717 = GC 717",
   "líder: equipo-03 94 puntos · colista: equipo-18 16 puntos"
  ]
 },
 "P21": {
  "lineas": [
   "datos: 380 partidos · ajuste 270 (jornadas 1–27) · prueba 110",
   "línea base 1-X-2: 0.467 / 0.281 / 0.252",
   "modelo xG: log loss 0.9497 · Brier 0.5757 · acierto 0.536",
   "baseline : log loss 1.0714 · Brier 0.6488 · acierto 0.436",
   "P(local) 0.0–0.2: n=15 · predicha 0.146 · observada 0.067 · desvío -0.080",
   "P(local) 0.2–0.4: n=35 · predicha 0.288 · observada 0.286 · desvío -0.002",
   "P(local) 0.4–0.6: n=37 · predicha 0.486 · observada 0.568 · desvío +0.081",
   "P(local) 0.6–1.0: n=23 · predicha 0.683 · observada 0.696 · desvío +0.013"
  ]
 },
 "P22": {
  "lineas": [
   "activos: 6 · meses por activo: 60 · inflación supuesta: 2.5%",
   "activo  acumulado  anualizado  volatilidad  real",
   "indice      -6.48%      -1.33%        6.66%  -3.74%",
   "accion-a   -39.20%      -9.47%        9.98% -11.68%",
   "accion-b   -41.43%     -10.15%       11.34% -12.34%",
   "accion-c    -6.14%      -1.26%       17.74%  -3.67%",
   "accion-d    21.75%       4.01%       16.50%   1.48%",
   "accion-e    55.92%       9.29%       21.28%   6.62%"
  ]
 },
 "P23": {
  "lineas": [
   "datos: 380 partidos · ajuste 270 (jornadas 1–27) · prueba 110",
   "liga: 1.115 goles local · 0.811 visitante",
   "fuerzas (ataque · defensa):",
   "equipo-01: 1.545 · 1.002",
   "equipo-02: 1.545 · 0.578",
   "equipo-03: 1.584 · 0.616",
   "equipo-04: 1.043 · 1.634",
   "equipo-05: 1.453 · 0.780"
  ]
 },
 "P24": {
  "lineas": [
   "partidos: 380 · equipos: 20 · jornada de validación: 38",
   "top-5 Elo: equipo-02 1620.83 · equipo-03 1609.28 · equipo-06 1596.26 · equipo-09 1572.22 · equipo-05 1545.47",
   "Brier  · Elo: 0.23268 · base: 0.24000",
   "log-loss · Elo: 0.65665 · base: 0.67301",
   "pronósticos de la última jornada:",
   "equipo-11 vs equipo-14: local 0.658 · ganó",
   "equipo-12 vs equipo-01: local 0.476 · no ganó",
   "equipo-13 vs equipo-08: local 0.466 · no ganó"
  ]
 },
 "P25": {
  "lineas": [
   "datos: 300 filas · 60 meses × 5 acciones · factores medios +0.0102 / -0.0003 / -0.0009",
   "acción      alpha/mes  alpha/año  IC95% anual          bmercado  btamaño  bvalor   R²",
   "accion-a    -0.00063   -0.0076   [-0.0420, +0.0268]     0.970    -0.322    0.069   0.934",
   "accion-b    +0.00130   +0.0156   [-0.0146, +0.0458]     1.201     0.361   -0.172   0.967",
   "accion-c    -0.00080   -0.0095   [-0.0422, +0.0231]     0.807     0.203    0.581   0.922",
   "accion-d    +0.00249   +0.0299   [+0.0014, +0.0584]     1.069     0.768    0.214   0.964",
   "accion-e    +0.00059   +0.0070   [-0.0198, +0.0338]     0.898    -0.410   -0.287   0.955",
   "alphas: 5 pruebas · sin corregir 1 · Bonferroni 0 (umbral 0.010) · Holm 0"
  ]
 },
 "P26": {
  "lineas": [
   "filas: 250 · retornos: 249 · cierres: 85.66–102.89",
   "volatilidad anualizada: 18.483% (sqrt(252))",
   "retorno medio diario: -0.03101% · peor: -1.98% · mejor: 2.02%",
   "caída máxima: -16.75%",
   "saltos > 3.0σ: 0",
   "límite: precios sintéticos de 250 días; no es una serie real ni una predicción."
  ]
 },
 "P27": {
  "lineas": [
   "lecturas: 240 · sanas: 222 · mediana 69.64 · MAD 4.035",
   "umbral: 87.59 °C (mediana + 3.0 × 1,4826 × MAD)",
   "alertas: 18 · averías marcadas: 18/18 · falsos positivos: 0",
   "turno 12 (12 lecturas): media 78.19 · máx 89.52 · alertas 6",
   "turno 13 (12 lecturas): media 92.43 · máx 94.13 · alertas 12",
   "límite: 240 horas sintéticas de un solo sensor; no sustituye al mantenimiento real."
  ]
 },
 "P28": {
  "lineas": [
   "filas: 1440 · días: 60 · precio medio: 43.724 €/MWh",
   "mínimo: 7.40 · máximo: 85.70",
   "valle: hora 13 (18.763) · pico: hora 20 (77.497)",
   "laborable: 44.504 · fin de semana: 41.581",
   "cuota renovable media: 44.92%",
   "MAE: naive día anterior 4.095 · media 13.284",
   "límite: 60 días sintéticos de un solo mercado; no describe el precio real ni predice el futuro."
  ]
 },
 "P29": {
  "lineas": [
   "datos: 252 filas de flujo · 240 eventos únicos",
   "duplicados descartados: 12 · tardíos: 9",
   "ventanas cerradas: 40 · eventos aceptados: 240",
   "ventana  0– 6 h · n= 5 · temp media 71.66 °C · presión máx 4.14 bar",
   "ventana  6–12 h · n= 6 · temp media 73.86 °C · presión máx 4.39 bar",
   "ventana 12–18 h · n= 6 · temp media 75.04 °C · presión máx 4.41 bar",
   "ventana 18–24 h · n= 6 · temp media 75.92 °C · presión máx 4.41 bar",
   "ventana 24–30 h · n= 6 · temp media 74.86 °C · presión máx 4.16 bar"
  ]
 },
 "P30": {
  "lineas": [
   "clientes: 200 · bajas: 94 · train/test: 150/50",
   "pesos: -0.232 · -0.075 · -0.709 · 1.087",
   "mejor umbral por coste: 0.15 · coste 20 · VP 26 · FP 20 · FN 0 · VN 4",
   "calibración por tramos:",
   "n=10 · prob media 0.162 · tasa real 0.200",
   "n=10 · prob media 0.301 · tasa real 0.400",
   "n=10 · prob media 0.447 · tasa real 0.400",
   "n=10 · prob media 0.566 · tasa real 0.800"
  ]
 },
 "P31": {
  "lineas": [
   "filas: 180 · válidas: 180 · rechazadas: 0 · duplicadas: 0",
   "frescura: 24 h desde 2026-06-29 (corte 2026-06-30) · fresco",
   "linaje: 4 columnas · fecha, ingresos, tienda, unidades",
   "idempotencia: 180 claves · 0 nuevas al repetir",
   "límite: CSV sintético de seis meses; no sustituye a la contabilidad ni a un panel real."
  ]
 },
 "P32": {
  "lineas": [
   "partidos: 120 · equipos: 12 · filas: 240",
   "ventaja de casa: 70/120 (58.33%)",
   "equipo       PJ  V   puntos  posesiones  puntos/posesión  3P%",
   "equipo-03   20 20     2255        1897           1.189 39.56%",
   "equipo-02   20 16     2224        1941           1.146 38.46%",
   "equipo-04   20 15     2148        1898           1.132 36.47%",
   "equipo-09   20 15     2131        1937           1.100 34.39%",
   "equipo-01   20 14     2156        1902           1.134 37.14%"
  ]
 },
 "P33": {
  "lineas": [
   "etapas: 21 · corredores: 20 · equipos: 5",
   "distancia total: 3361 km · desnivel: 57227 m",
   "llano    n=140 · 2.765 s/km (sd 0.206)",
   "media    n=140 · 3.050 s/km (sd 0.216)",
   "montana  n=140 · 3.417 s/km (sd 0.298)",
   "tamaño del efecto montaña frente a llano: d = 2.55",
   "límite: 20 corredores por etapa y datos sintéticos; no describe una vuelta real."
  ]
 },
 "P34": {
  "lineas": [
   "puntos: 600 · saque gana 349 (58.17%)",
   "sacador A: 163/300 (54.33%)",
   "sacador B: 186/300 (62.00%)",
   "superficie dura: 146/240 (60.83%)",
   "superficie tierra: 100/180 (55.56%)",
   "superficie hierba: 103/180 (57.22%)",
   "tipos: ace 48 · doble falta 22 · error no forzado 157 · intercambio largo 184 · winner 189",
   "duración del intercambio: media 7.787 s · mediana 7.2 s"
  ]
 },
 "P35": {
  "lineas": [
   "== Puerta del proyecto P35 · NumPy de verdad ==",
   "datos: 180 filas × 4 columnas · 3 tiendas × 60 filas · 180 fechas únicas · sha256 afa71a0b…",
   "OK    CSV: 180 filas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "OK    fechas únicas: 180",
   "OK    cada tienda aparece 60 veces",
   "OK    el bucle no usa NumPy para sumar",
   "bucle: 14295 unidades · 192292.08 EUR · por tienda centro 4892, norte 4651, sur 4752"
  ]
 },
 "P36": {
  "lineas": [
   "== Puerta del proyecto P36 · pandas sin perder filas ==",
   "cargar: 180 filas × 4 columnas, todas como texto",
   "OK    origen: 180 filas × 4 columnas",
   "OK    origen: 0 nulos en las 4 columnas",
   "OK    origen: 180 fechas únicas",
   "limpiar: 180 entrada · 180 válidas · 0 rechazadas",
   "OK    limpieza: 180 -> 180 filas, 0 rechazos",
   "OK    tipo fecha: datetime64[us]"
  ]
 },
 "P37": {
  "lineas": [
   "OK   · el CSV tiene las 5 columnas esperadas en orden",
   "OK   · el CSV tiene 200 filas (tiene 200)",
   "OK   · los 200 ids de cliente son únicos",
   "OK   · el CSV tiene 94 bajas de 200 (47 %)",
   "OK   · el CSV no tiene celdas vacías",
   "OK   · antigüedad entre 1 y 48 meses",
   "OK   · uso mensual entre 4 y 42 sesiones",
   "OK   · reclamaciones entre 0 y 3"
  ]
 },
 "P38": {
  "lineas": [
   "== Puerta del proyecto P38 · XGBoost con clases desequilibradas ==",
   "datos: 3000 filas × 9 columnas · id único · 69 fraudes (2.30 %) · sha256 830cd8b8…",
   "OK    CSV: 3000 filas × 9 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "OK    fraudes: 69 (deben ser 69)",
   "OK    canal: {'web': 1027, 'app': 1010, 'tienda': 963}",
   "OK    pais MA 715 · movil 1682",
   "partición: 2100 train / 900 test · positivos 48 y 21"
  ]
 },
 "P39": {
  "lineas": [
   "== Puerta del proyecto P39 · embudo y cohortes ==",
   "eventos: 2000 filas · 6 columnas · 500 usuarios · 4 eventos por usuario",
   "validación: 0 claves duplicadas · visita 851 · registro 462 · compra 74",
   "OK    datos: 2000 filas · 6 columnas · 500 usuarios",
   "OK    4 eventos por usuario: {4: 500}",
   "OK    la clave (usuario_id, fecha) es única",
   "OK    eventos: {'visita': 851, 'registro': 462, 'abandono': 322, 'activacion': 291, 'compra': 74}",
   "OK    eventos por canal: {'organico': 952, 'pago': 788, 'referido': 260}"
  ]
 },
 "P40": {
  "lineas": [
   "== Puerta del proyecto P40 · A/B test completo ==",
   "usuarios: 500 · organico 238 · pago 197 · referido 65",
   "OK    500 usuarios únicos, una fila por usuario",
   "OK    reparto por canal: {'organico': 238, 'pago': 197, 'referido': 65}",
   "OK    compras por usuario: 74",
   "hipótesis congelada: organico > pago en compra por usuario (α 0.05, potencia 0.80)",
   "OK    hipótesis congelada: variantes, métrica, dirección, α y potencia",
   "OK    la regla de parada está escrita antes del test"
  ]
 },
 "P41": {
  "lineas": [
   "OK   · la muestra tiene las 9 columnas del contrato en orden",
   "OK   · la muestra tiene 300 filas (tiene 300)",
   "OK   · los 300 ids de la muestra son únicos",
   "OK   · todos los ids de la muestra siguen el formato T + 5 dígitos",
   "OK   · la muestra conserva 9 fraudes de las 300 filas",
   "OK   · la muestra no tiene celdas vacías",
   "OK   · el contrato documenta las 9 columnas con una regla cada una",
   "OK   · cada regla del contrato lleva su motivo escrito"
  ]
 },
 "P42": {
  "lineas": [
   "== Puerta del proyecto P42 · ingesta incremental idempotente ==",
   "OK    snapshot: 400 filas · 12 columnas",
   "OK    snapshot: 20 carreras y 20 pilotos",
   "OK    snapshot: clave (carrera, piloto) única en las 400 filas",
   "OK    snapshot: 20 lotes de carreras, uno por carrera",
   "OK    carga 1: páginas 4 · nuevas 400 · hechas 400 · cuarentena 0",
   "OK    bruto: 20 entradas en el manifiesto",
   "OK    bruto inmutable: r07-e14a0b692485.json coincide con su sha256"
  ]
 },
 "P43": {
  "lineas": [
   "== Puerta del proyecto P43 · NLP clasico: de bolsa de palabras a embeddings ==",
   "OK    parámetros: semilla 20261109 · test 0.30 · embeddings 64 dimensiones",
   "OK    corpus: 600 filas · 5 columnas · 600 ids unicos",
   "OK    etiquetas: negativa 188 · neutra 171 · positiva 241",
   "OK    canales: app 195 · tienda 199 · web 206",
   "OK    longitudes: 8-14 palabras y longitud_palabras cuadra con el texto",
   "OK    auditoría: 367 textos únicos (233 repetidos) · 177 primeras frases únicas · 110 palabras tal cual",
   "OK    partición: train 418 filas · test 182 filas · textos compartidos 0"
  ]
 },
 "P44": {
  "lineas": [
   "== Puerta del proyecto P44 · LLM por dentro: BPE, atencion y generacion ==",
   "OK    parámetros: semilla 20261109 · BPE 300 símbolos · contextos (1, 2)",
   "OK    corpus: 600 filas · 5 columnas · 367 textos únicos",
   "corpus: 600 filas · 5 columnas · textos unicos 367",
   "particion: train 418 filas · test 182 filas · textos compartidos 0",
   "bpe: 300 simbolos · 265 fusiones · test reconstruido 182/182 textos",
   "bpe: 1.23 tokens por palabra (media en train)",
   "atencion: 8 consultas · suma de pesos min 1.000000000000 max 1.000000000000"
  ]
 },
 "P45": {
  "lineas": [
   "== Puerta del proyecto P45 · RAG sobre el temario (corpus sintetico) ==",
   "OK    parámetros: top_k 3 · umbral 0.05 · fragmento <= 80 palabras",
   "OK    corpus: 120 filas · 5 columnas · 120 ids unicos",
   "OK    temas: datos 20 · energia 20 · f1 20 · finanzas 20 · futbol 20 · salud 20",
   "OK    niveles: avanzado 36 · básico 42 · intermedio 42",
   "OK    únicos y tamaño: 30 títulos, 115 textos, 23-74 palabras",
   "OK    troceado: 120 fragmentos · uno por documento · solapamiento 0 · máximo 80 palabras",
   "OK    troceado: ningún fragmento supera el máximo y ninguno está vacío (no se cortan frases a la mitad)"
  ]
 },
 "P46": {
  "lineas": [
   "== Puerta del proyecto P46 · agente con herramientas ==",
   "OK    parámetros: max_pasos 6 · top_k 3 · semilla 20261113",
   "OK    corpus: 120 filas · 5 columnas · 120 ids únicos",
   "OK    temas: 6 × 20 documentos · 115 textos únicos · 30 títulos únicos",
   "OK    procedencia: sha256 del CSV coincide con el del catálogo (8e353108fa59…)",
   "OK    contratos: 3 herramientas con entrada, salida y para qué (buscar, leer, contar)",
   "OK    validación: 5 entradas malas devuelven {'error': ...} sin lanzar excepción",
   "OK    herramientas: buscar devuelve 3 resultados y el primero es DOC075 (finanzas)"
  ]
 },
 "P47": {
  "lineas": [
   "== Puerta del proyecto P47 · DAG con reintentos y auditoría ==",
   "datos: 2000 filas × 6 columnas · sha256 f926f5f9…",
   "OK    CSV: 2000 filas × 6 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "validar: 2000 filas · 500 usuarios · 4 eventos por usuario · clave única",
   "OK    validar: 2000 filas y 500 usuarios",
   "OK    eventos: visita 851 · compra 74",
   "OK    validar rechaza un CSV recortado con error permanente"
  ]
 },
 "P48": {
  "lineas": [
   "== Puerta del proyecto P48 · dígitos 8×8 con PCA ==",
   "datos: 1200 filas × 66 columnas · 10 clases × 120 · rango 0-255 · sha256 5b952ad4…",
   "OK    CSV: 1200 filas × 66 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "OK    120 imágenes por dígito en las 10 clases",
   "OK    el id es único (1200 identificadores)",
   "matriz: 1200 × 64 píxeles + etiqueta · el índice del fichero no entra como variable",
   "OK    matriz: (1200, 64) y (1200,)"
  ]
 },
 "P49": {
  "lineas": [
   "== Puerta del proyecto P49 · empresa y sector con ratios ==",
   "precios: 4000 filas · 8 empresas · 500 sesiones por empresa",
   "validación: 0 claves duplicadas · 0 violaciones de precio",
   "OK    datos: 4000 filas · 8 empresas · 500 sesiones",
   "OK    claves (fecha, empresa) duplicadas: 0",
   "OK    coherencia de precio: {'apertura_vs_cierre_previo': 0, 'maximo_vs_apertura_cierre': 0, 'minimo_vs_apertura_cierre': 0}",
   "OK    calendario laborable: [0, 1, 2, 3, 4]",
   "retornos: EMP-A volatilidad anual 0.13 · retorno anualizado 0.16"
  ]
 },
 "P50": {
  "lineas": [
   "== Puerta del proyecto P50 · modelo financiero de 3 estados ==",
   "fundamentales: 50 filas · 10 empresas · 5 ejercicios",
   "OK    datos: 50 filas · 10 empresas · 5 ejercicios",
   "identidades: beneficio 0.0 M€ · impuestos 0.1 M€ · patrimonio 0.0 M€",
   "OK    clave (empresa, ejercicio) única",
   "OK    cinco ejercicios por empresa: [5]",
   "OK    beneficio = EBITDA − dep − intereses − impuestos: error 0.00 M€",
   "OK    impuestos al 25 % del resultado positivo: error 0.10 M€"
  ]
 },
 "P51": {
  "lineas": [
   "== Puerta del proyecto P51 · valoración con DCF y comparables ==",
   "fundamentales: 50 filas · 10 empresas · 5 ejercicios",
   "OK    datos: 50 filas · 10 empresas · 5 ejercicios",
   "supuestos EMP-A: crecimiento 5.6% · margen EBIT 15.0% · coste deuda 3.5%",
   "OK    crecimiento histórico de EMP-A: 0.0563",
   "OK    margen EBIT de EMP-A: 0.1500",
   "OK    los supuestos que no están en el CSV están declarados (tipos, prima, beta, g y caja)",
   "WACC EMP-A: Ke 8.0% · Kd 3.5% · peso equity 75.0% · WACC 6.66%"
  ]
 },
 "P52": {
  "lineas": [
   "== Puerta del proyecto P52 · riesgo de crédito y scoring ==",
   "credito: 300 filas · 8 columnas · 300 empresas · 27 impagos (9.0%)",
   "señal: cuartil de más deuda 22.7% de impago · cuartil de menos 2.7%",
   "OK    datos: 300 filas · 8 columnas · 300 empresas",
   "OK    empresa única y sin nulos",
   "OK    prevalencia: 27/300 = 9.0%",
   "OK    deuda/equity: (0.15, 3.73)",
   "OK    cobertura: (0.8, 11.78)"
  ]
 },
 "P53": {
  "lineas": [
   "== Puerta del proyecto P53 · dashboard de cartera ==",
   "panel: 360 filas · 60 meses · 6 activos",
   "matriz: 60 meses × 6 activos · 0 huecos",
   "OK    panel: 360 filas · 60 meses · 6 activos",
   "OK    claves (mes, activo) únicas y sin huecos",
   "OK    activos: ['accion-a', 'accion-b', 'accion-c', 'accion-d', 'accion-e', 'indice']",
   "OK    todos los retornos están en tanto por uno dentro de [−1, 1]",
   "riqueza: índice 0.935 · media de las 5 acciones 0.982"
  ]
 },
 "P54": {
  "lineas": [
   "== Puerta del proyecto P54 · simulador de dados ==",
   "OK    parámetros: 6 caras · 100000 tiradas · semilla 20261109",
   "OK    muestra: 1000 tiradas en datos-ejemplo/tiradas-muestra.csv y coinciden con la semilla",
   "dado: 6 caras · valor esperado 3.5 · 100000 tiradas · semilla 20261109",
   "media observada: 3.49621 · diferencia -0.00379 · error estandar teorico 0.005401",
   "dentro de 2 errores estandar: si (|diferencia| = 0.003790)",
   "tabla por n: n=10: 4.10000 · n=100: 3.40000 · n=1000: 3.56700 · n=10000: 3.50150 · n=100000: 3.49621",
   "histograma por cara: [16722, 16557, 16822, 16702, 16671, 16526] (suma 100000)"
  ]
 },
 "P55": {
  "lineas": [
   "== Puerta del proyecto P55 · Kelly: 5 %, 20 % y 60 % de la banca ==",
   "OK    parámetros: 100 replicas de 10000 apuestas · p(gana)=0.55 · semilla 20261110",
   "OK    fraccion de Kelly: 10.00 % de la banca",
   "OK    crecimiento teorico: g(5 %)=+0.003753 · g(20 %)=-0.000138 · g(60 %)=-0.153829",
   "OK    crecimiento teorico: el 5 % crece más que el 20 % y el 60 % pierde (no es más apuesta, más crecimiento)",
   "moneda: p(gana)=0.55 · pago 1:1 · banca inicial 1000 · 100 replicas de 10000 apuestas · semilla 20261110",
   "kelly: fraccion optima 10.00 % de la banca",
   "fraccion 5 %: crecimiento/apuesta +0.003788 · banca final mediana 2.815e+19 · ruina 0.0 % · peor caida 96.1 %"
  ]
 },
 "P56": {
  "lineas": [
   "== Puerta del proyecto P56 · backtest de media móvil ==",
   "precios: 4000 filas · 8 empresas · 500 sesiones",
   "validación: 0 claves duplicadas · 0 violaciones de precio",
   "OK    datos: 4000 filas · 8 empresas · 500 sesiones",
   "OK    clave única y precios coherentes: 0 violaciones",
   "señal: 20/60 sesiones · EMP-A 10 cambios de posición",
   "OK    las posiciones son binarias: [np.int64(0), np.int64(1)]",
   "OK    la posición del retorno de t es la señal de t−1 (sin ver el cierre de t)"
  ]
 },
 "P57": {
  "lineas": [
   "== Puerta del proyecto P57 · opciones: Black-Scholes y Monte Carlo ==",
   "OK    precios: 250 filas · 6 columnas · 250 fechas unicas",
   "OK    coherencia: la apertura coincide con el cierre anterior en 249/249 comparaciones",
   "OK    coherencia: máximo y mínimo acotan apertura y cierre en 250/250 filas",
   "OK    procedencia: sha256 del CSV coincide con el del catálogo (15c9d071f65b…)",
   "OK    volatilidad: diaria 1.16 % con 249 retornos",
   "OK    volatilidad: anual 22.24 % con sqrt(365)",
   "precios: 250 filas · 6 columnas · cierre 85.66-102.89 EUR · primer cierre 101.34 · ultimo 93.81"
  ]
 },
 "P58": {
  "lineas": [
   "== Puerta del proyecto P58 · ecuacion de onda: la membrana de un tambor ==",
   "OK    parámetros: semilla 20261111 · rejilla principal 64x64 · modo (1, 1)",
   "rejilla N=16: dx=0.066667 · c·dt/dx=0.6250 (<= 0.7071) · pasos=24",
   "rejilla N=32: dx=0.032258 · c·dt/dx=0.6327 (<= 0.7071) · pasos=49",
   "rejilla N=64: dx=0.015873 · c·dt/dx=0.6364 (<= 0.7071) · pasos=99",
   "rejilla N=128: dx=0.007874 · c·dt/dx=0.6350 (<= 0.7071) · pasos=200",
   "OK    rejilla: los cuatro tamaños declaran dx y respetan el margen CFL (limite 2D 0.7071)",
   "OK    muestra: 4096 nodos en datos-ejemplo/membrana-inicial.csv y coinciden con la semilla 20261111"
  ]
 },
 "P59": {
  "lineas": [
   "== Puerta del proyecto P59 · red neuronal desde cero ==",
   "digitos: 1200 filas · 66 columnas · 120 por clase · píxeles 0–255",
   "validación: 10 clases · ids únicos True · media 74.3",
   "OK    datos: 1200 filas · 66 columnas",
   "OK    120 imágenes por dígito: {0: 120, 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120, 7: 120, 8: 120, 9: 120}",
   "OK    ids únicos y píxeles 0–255 (media 74.35)",
   "partición: 900 train · 300 test · 30 por clase en test",
   "OK    partición: 900 train · 300 test"
  ]
 },
 "P60": {
  "lineas": [
   "== Puerta del proyecto P60 · regresión por kernel ==",
   "ventas: 180 filas · 4 columnas · 180 días",
   "validación: 180 días consecutivos 2026-01-01 a 2026-06-29 · unidades 49–121 · junio 29 días",
   "OK    datos: 180 filas · 4 columnas · 180 días",
   "OK    180 días consecutivos de 2026-01-01 a 2026-06-29, sin nulos",
   "OK    tiendas en rotación: {'centro': 60, 'norte': 60, 'sur': 60}",
   "OK    rangos y totales: (49, 121) unidades · 192292.08 €",
   "OK    junio está incompleto (29 días) y se declara"
  ]
 },
 "P61": {
  "lineas": [
   "== Puerta del proyecto P61 · datos desbalanceados y umbral por coste ==",
   "datos: 3000 filas × 9 columnas · id único · sha256 830cd8b8…",
   "OK    CSV: 3000 filas × 9 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "desbalanceo: 69 fraudes de 3000 (2.30 %) · línea base acierta 97.70 %",
   "OK    fraudes: 69 (deben ser 69)",
   "OK    prevalencia: 0.023000",
   "OK    línea base: 0.9770"
  ]
 },
 "P62": {
  "lineas": [
   "== Puerta del proyecto P62 · frenada de dos pilotos en la misma curva ==",
   "datos: 1200 filas × 8 columnas · 120 grupos de 10 muestras · rejilla 210…30 m · sha256 ddddfeec…",
   "OK    CSV: 1200 filas × 8 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "OK    la rejilla es 210…30 m en pasos de 20",
   "grano: una fila = una muestra · 120 grupos (carrera, curva, piloto) × 10 muestras",
   "OK    grano: 120 grupos × 10 muestras",
   "misma carrera: 60 pares A–B en la misma carrera y curva · pares cruzados 0"
  ]
 },
 "P63": {
  "lineas": [
   "== Puerta del proyecto P63 · ventana de undercut: boxes y degradación ==",
   "datos: 180 filas × 10 columnas · 6 grupos de 30 vueltas · sha256 c232e767…",
   "OK    CSV: 180 filas × 10 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "estructura: 1 parada por grupo · sectores suman con error máximo 0.0010 s · vueltas de parada [18, 18, 18, 22, 22, 22]",
   "OK    sectores: error máximo 0.0010 s",
   "OK    una parada por carrera y piloto",
   "OK    vueltas de parada: [18, 18, 18, 22, 22, 22]"
  ]
 },
 "P64": {
  "lineas": [
   "== Puerta del proyecto P64 · probabilidad de campeón y Monte Carlo ==",
   "datos: 380 filas × 12 columnas · 38 jornadas × 10 partidos · 20 equipos · sha256 5cbc8977…",
   "OK    CSV: 380 filas × 12 columnas",
   "OK    el sha256 del CSV de ejemplo es el de la copia del catálogo",
   "parrilla: 20 emparejamientos × 19 repeticiones · 16 equipos por jornada (4 juegan dos veces)",
   "resultado derivado de los goles en 380/380 filas",
   "OK    parrilla: 20 emparejamientos × 19",
   "OK    equipos por jornada: 16 (16 distintos, 4 repiten)"
  ]
 },
 "P65": {
  "lineas": [
   "caso: candidato · 59 clientes de prueba",
   "precisión balanceada: referencia 0.651 · candidato 0.642 · diferencia -0.009",
   "IC95 % de la diferencia: [-0.106, +0.082] · tolerancia 0.02",
   "decisión: revisar (código de salida 1)",
   "lectura: la puerta no mira una cifra suelta: exige el mismo test, la misma métrica y un intervalo; si el intervalo cruza el umbral, pide revisar en vez de decidir por ruido.",
   "límite: 200 clientes sintéticos y tres variables; no describe clientes reales ni sustituye a una validación."
  ]
 },
 "P66": {
  "lineas": [
   "datos: 1440 horas · 60 días · 24 horas del día",
   "precio medio: 43.72 €/MWh",
   "horas caras: 19, 20, 21, 22 · horas baratas: 12, 13, 14, 15",
   "coste diario base (10 kWh): 0.4372 € · trasladando el 20 %: 0.3328 €",
   "ahorro: 0.1044 €/día · 3.13 €/mes · 23.88 %",
   "lectura: el ahorro sale de mover consumo, no de consumir menos; si no se puede mover, no existe.",
   "límite: 60 días sintéticos y un consumo plano; no hay tarifas fijas, impuestos ni potencia contratada."
  ]
 },
 "P67": {
  "lineas": [
   "datos: 2000 eventos · 500 usuarios · 3 canales · 322 abandonos",
   "embudo (usuarios únicos y conversión desde la etapa anterior):",
   "visita: 500 · 100.0 %",
   "registro: 462 · 92.4 %",
   "activacion: 291 · 63.0 %",
   "compra: 74 · 25.4 %",
   "caída que más cuesta: activacion → compra · 217 usuarios (74.6 %)",
   "por canal (visita → compra):"
  ]
 },
 "P68": {
  "lineas": [
   "datos: 1440 horas · precio medio 43.72 €/MWh · R² 0.892",
   "coeficientes: demanda +0.00140 €/MWh/MW · viento -0.00109 · sol -0.00517",
   "escenario: viento −50 % y demanda +10 % → +7.24 €/MWh · IC95 % [+6.46, +8.03]",
   "sensibilidad (solo viento):",
   "−10 %: +0.81 €/MWh [+0.66, +0.96]",
   "−20 %: +1.62 €/MWh [+1.33, +1.92]",
   "−30 %: +2.44 €/MWh [+1.99, +2.88]",
   "−40 %: +3.25 €/MWh [+2.65, +3.84]"
  ]
 },
 "P69": {
  "lineas": [
   "datos: 380 partidos · amarillas medias 3.21",
   "modelo: b0 +3.197 · tiros totales -0.0192 · desequilibrio +0.0393 · R² 0.013 · RMSE 1.823",
   "partidos con más amarillas:",
   "J1 equipo-02–equipo-11: 6 tarjetas · 16 tiros · desequilibrio 9",
   "J3 equipo-02–equipo-11: 6 tarjetas · 21 tiros · desequilibrio 11",
   "J4 equipo-15–equipo-02: 6 tarjetas · 20 tiros · desequilibrio 13",
   "J5 equipo-03–equipo-18: 6 tarjetas · 16 tiros · desequilibrio 18",
   "J10 equipo-19–equipo-10: 6 tarjetas · 9 tiros · desequilibrio 2"
  ]
 },
 "P70": {
  "lineas": [
   "datos: 600 puntos · 10 partidos · 3 superficies",
   "ventaja global del sacador: 58.2 %",
   "por superficie:",
   "dura: 60.8 % · 240 puntos",
   "tierra: 55.6 % · 180 puntos",
   "hierba: 57.2 % · 180 puntos",
   "por duración del intercambio:",
   "corto: 62.7 % · 220 puntos"
  ]
 },
 "P71": {
  "lineas": [
   "datos: 240 horas · referencia 0–119 · vigilancia 120–239",
   "referencia: temperatura 71.07 ± 4.01 · presión 4.00 ± 0.28",
   "alertas |z| ≥ 3: 18 horas",
   "primera alerta: hora 150 · temperatura (z +4.30)",
   "averías declaradas: 18 · primera a la hora 150",
   "la alerta llega con la avería, no antes: este CSV no permite aviso temprano",
   "lectura: la alerta no adivina la avería; detecta que el sensor se sale de su rango normal.",
   "límite: 240 horas sintéticas de un solo sensor; no hay estacionalidad, mantenimiento ni falsos positivos de varios equipos."
  ]
 },
 "P72": {
  "lineas": [
   "datos: 180 días-tienda · 180 fechas · 3 tiendas",
   "por tienda:",
   "centro: 65279.56 € · 4892 uds · ticket 13.34 € · cuota 33.9 %",
   "sur: 64208.64 € · 4752 uds · ticket 13.51 € · cuota 33.4 %",
   "norte: 62803.88 € · 4651 uds · ticket 13.50 € · cuota 32.7 %",
   "dependencia: centro aporta el 33.9 % · ratio primera/segunda 1.02 · HHI 0.333",
   "día top: 2026-05-23 · norte · 1738.51 € · 119 unidades",
   "lectura: el ticket separa precio de volumen; la cuota dice si el total depende de una sola tienda."
  ]
 },
 "P73": {
  "lineas": [
   "datos: 3000 transacciones · 69 fraudes (2.30 %) · importe 920810.59 € · ticket medio 306.94 €",
   "fraude: 43974.56 € en juego",
   "regla: bloquear si intentos_24h ≥ umbral · margen perdido por falso positivo 30 %",
   "umbral 2: TP 57 · FP 1449 · FN 12 · evitado 35492.90 € · coste FP 128094.17 € · neto -92601.27 € · precisión   3.8 % · recall  82.6 %",
   "umbral 3: TP 54 · FP 1070 · FN 15 · evitado 33379.48 € · coste FP 93875.67 € · neto -60496.19 € · precisión   4.8 % · recall  78.3 %",
   "umbral 4: TP 50 · FP 792 · FN 19 · evitado 30665.69 € · coste FP 69955.76 € · neto -39290.07 € · precisión   5.9 % · recall  72.5 %",
   "umbral 5: TP 44 · FP 559 · FN 25 · evitado 27062.76 € · coste FP 47653.84 € · neto -20591.08 € · precisión   7.3 % · recall  63.8 %",
   "umbral 6: TP 36 · FP 394 · FN 33 · evitado 21954.18 € · coste FP 33917.44 € · neto -11963.26 € · precisión   8.4 % · recall  52.2 %"
  ]
 }
};
