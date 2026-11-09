// Disponibilidad comprobada en CacheStorage. Los recibos de localStorage no son evidencia.
(function (root) {
  'use strict';
  const manifest = root.MANIFIESTO_OFFLINE;
  if (!manifest) return;
  const baseURL = new URL('./', document.baseURI);
  const names = { base: 'tramario-base-' + manifest.version, material: 'tramario-material-' + manifest.version, pins: 'tramario-paquetes-' + manifest.version };
  const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  const init = (async () => {
    const source = 'window.MANIFIESTO_OFFLINE = ' + JSON.stringify(manifest) + ';\n';
    const bytes = new TextEncoder().encode(source);
    return { ...manifest.archivos, 'datos/offline.js': { sha256: await hash(bytes), bytes: bytes.length } };
  })().catch(() => null);
  // Sin CacheStorage o sin contexto seguro no afirmar disponibilidad del artefacto file://.
  const supported = () => /^https?:$/.test(location.protocol) && !!root.caches && !!root.crypto?.subtle;
  const paths = id => manifest.recursos[id] ? [...new Set([...manifest.base, ...manifest.recursos[id].propios])] : [];
  const url = path => new URL(path, baseURL).href;
  const pinURL = id => url('__paquetes__/' + encodeURIComponent(id));
  const ownCache = path => caches.open(manifest.base.includes(path) ? names.base : names.material);
  const unknown = reason => ({ estado: 'desconocido', motivo: reason, faltan: [], danados: [], presentes: 0, total: 0 });
  let snapshot = null;
  async function inventario(force = false) {
    if (!supported()) return null;
    if (snapshot && !force) return snapshot;
    snapshot = (async () => {
      try {
        const files = await init, map = {};
        for (const name of [names.base, names.material]) {
          const cache = await caches.open(name);
          for (const req of await cache.keys()) {
            const path = new URL(req.url).pathname.slice(baseURL.pathname.length);
            if (!files[path]) continue;
            const response = await cache.match(req);
            if (response?.ok) map[path] = { sha256: await hash(await response.arrayBuffer()) };
          }
        }
        return map;
      } catch { return null; }
    })();
    return snapshot;
  }
  let worker = null, workerVersion = null;
  function versionControladora() {
    const current = navigator.serviceWorker?.controller;
    if (!current) return Promise.resolve(null);
    if (current === worker && workerVersion) return workerVersion;
    worker = current;
    workerVersion = new Promise(resolve => {
      const channel = new MessageChannel();
      const finish = version => { clearTimeout(timer); channel.port1.close(); resolve(version); };
      const timer = setTimeout(() => finish(null), 1500);
      channel.port1.onmessage = event => finish(event.data);
      current.postMessage({ tipo: 'version-offline' }, [channel.port2]);
    });
    return workerVersion;
  }
  async function estado(id, map) {
    const list = paths(id), files = await init;
    if (!files) return unknown("No se pueden comprobar las huellas en este contexto.");
    if (!list.length) return unknown('Este recurso no declara sus dependencias.');
    const saved = map === undefined ? await inventario(true) : map;
    const result = Recursos.estado(list.map(ruta => ({ ruta, sha256: files[ruta]?.sha256 })), saved);
    if (result.estado === 'completo' && await versionControladora() !== manifest.version) return {
      ...result, estado: 'desconocido', motivo: 'Los archivos están guardados, pero esta versión aún no controla la navegación. Cierra todas las pestañas del portal y vuelve a abrirlo con conexión para activarla',
    };
    return result;
  }
  function errorText(error) {
    if (error?.name === 'QuotaExceededError') return 'No hay espacio suficiente. Elimina material descargado y vuelve a intentarlo. Tus notas y entregas se conservan.';
    if (error?.name === 'AbortError') return 'Descarga interrumpida. Puedes completarla cuando quieras.';
    return String(error?.message || 'No se pudo descargar. Comprueba la conexión y vuelve a intentarlo.');
  }
  async function descargar(id, { signal, progreso } = {}) {
    if (!supported()) return { ...unknown('Las descargas necesitan abrir el portal por HTTP(S) con almacenamiento disponible.'), error: true };
    const files = await init, list = paths(id);
    if (!list.length) return { ...unknown('No se conocen las dependencias.'), error: true };
    let message = '';
    try {
      for (let i = 0; i < list.length; i++) {
        signal?.throwIfAborted();
        const path = list[i], cache = await ownCache(path), key = url(path);
        const saved = await cache.match(key);
        if (!saved || await hash(await saved.clone().arrayBuffer()) !== files[path].sha256) {
          const response = await fetch(key, { cache: 'no-store', signal });
          if (!response.ok) throw new Error('No se pudo descargar ' + path + '. Reintenta con conexión.');
          if (await hash(await response.clone().arrayBuffer()) !== files[path].sha256) throw new Error('Contenido dañado o de otra versión: ' + path + '. Actualiza el portal o reintenta la descarga.');
          await cache.put(key, response);
        }
        progreso?.(i + 1, list.length);
      }
      // Un pin solo gestiona referencias compartidas; estado() siempre vuelve a leer los bytes.
      const pins = await caches.open(names.pins);
      await pins.put(pinURL(id), new Response(JSON.stringify({ id, propios: manifest.recursos[id].propios })));
    } catch (error) { message = errorText(error); }
    snapshot = null;
    const result = await estado(id);
    return { ...result, error: !!message, mensaje: message || (result.estado === 'completo' ? 'Descarga completa y comprobada.' : result.motivo) };
  }
  async function eliminar(id) {
    if (!supported()) return { error: true, mensaje: 'No se puede acceder al material guardado.' };
    try {
      const pins = await caches.open(names.pins);
      await pins.delete(pinURL(id));
      const shared = new Set();
      for (const req of await pins.keys()) {
        const pin = await (await pins.match(req)).json();
        for (const path of pin.propios || []) shared.add(path);
      }
      const cache = await caches.open(names.material);
      for (const path of manifest.recursos[id]?.propios || []) if (!shared.has(path)) await cache.delete(url(path));
      snapshot = null;
      return { error: false, mensaje: 'Material eliminado. Se conserva el material compartido con otras descargas y todo tu trabajo.' };
    } catch (error) { return { error: true, mensaje: errorText(error) }; }
  }
  // Conexión por nodo: una navegación invalida el panel viejo sin añadir delegados globales.
  function conectar(principal, vista, arg, onChange) {
    if (vista === 'buscar') {
      const summary = principal.querySelector('#disponibilidad');
      const rows = [...principal.querySelectorAll('[data-offline-id]')];
      if (!summary && !rows.length) return;
      inventario(true).then(async map => {
        let complete = 0, partial = 0;
        for (const row of rows) {
          const result = await estado(row.dataset.offlineId, map);
          if (!row.isConnected) return;
          row.textContent = 'Sin conexión: ' + result.estado;
          row.title = result.motivo;
          if (result.estado === 'completo') complete++;
          if (result.estado === 'parcial') partial++;
        }
        if (summary?.isConnected) summary.textContent = map === null
          ? 'Disponibilidad sin conexión: desconocida; no se ha podido leer el almacenamiento.'
          : `Sin conexión en este lote: ${complete} completos, ${partial} parciales de ${rows.length}. Abre un recurso para descargarlo o reparar su material.`;
      }).catch(() => {});
      return;
    }
    if (vista === 'paquetes') {
      const select = principal.querySelector('#offline-elegir'), holder = principal.querySelector('#offline-gestion');
      if (select && holder) select.addEventListener('change', () => {
        holder.replaceChildren();
        if (select.value) conectar(holder, 'offline-recurso', select.value);
      });
      const cleanup = principal.querySelector('#offline-liberar-antiguas');
      cleanup?.addEventListener('click', async () => {
        cleanup.disabled = true;
        const notice = principal.querySelector('#offline-liberar-aviso');
        try {
          const current = new Set(Object.values(names));
          const old = (await caches.keys()).filter(name => (name === 'tramario-v1' || /^tramario-(base|material|paquetes)-/.test(name)) && !current.has(name));
          for (const name of old) await caches.delete(name);
          if (notice?.isConnected) notice.textContent = `Liberadas ${old.length} cachés anteriores. Se conserva esta versión y todo tu trabajo.`;
        } catch { if (notice?.isConnected) notice.textContent = 'No se pudo liberar espacio. No se ha borrado tu trabajo.'; }
        cleanup.disabled = false;
      });
      const list = principal.querySelector('#offline-guardados');
      const updateList = async () => {
        try {
          if (!supported()) throw new Error();
          const pins = await caches.open(names.pins), entries = [];
          for (const req of await pins.keys()) entries.push((await (await pins.match(req)).json()).id);
          if (!list?.isConnected) return;
          list.replaceChildren();
          for (const id of entries) {
            const item = document.createElement('li'), button = document.createElement('button');
            button.type = 'button'; button.className = 'boton'; button.textContent = manifest.recursos[id]?.titulo || id;
            button.addEventListener('click', () => { select.value = id; select.dispatchEvent(new Event('change')); });
            item.append(button); list.append(item);
          }
          if (!entries.length) {
            const vacio = document.createElement('li');
            vacio.className = 'estado-vacio';
            vacio.innerHTML = '<p class="estado-titulo">Todavía no has solicitado descargas</p>' +
              '<p>El material se comprueba al abrir cada recurso. Desde cualquier ficha puedes descargarla para usarla sin conexión.</p>' +
              '<p class="acciones-fila"><a class="boton" href="#/buscar/">Ir a la biblioteca</a></p>';
            list.append(vacio);
          }
        } catch { if (list?.isConnected) list.textContent = 'No se ha podido leer el almacenamiento de descargas.'; }
      };
      principal.addEventListener('offline-material-change', updateList);
      updateList();
      return;
    }
    const resourceId = vista === 'offline-recurso' ? arg : vista === 'concepto' ? arg : vista === 'laboratorios' ? 'lab:' + (String(arg || 'L01').split('~')[0] || 'L01')
      : vista === 'proyectos' && arg ? 'proj:' + arg : vista === 'mapa' ? 'mapa' : null;
    if (!manifest.recursos[resourceId]) return;
    const panel = document.createElement('section');
    panel.className = 'panel-offline'; panel.dataset.offlineResource = resourceId;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Comprobando material sin conexión…';
    const actions = document.createElement('p'); actions.className = 'acciones-fila';
    const button = (label, attr) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'boton'; b.textContent = label; b.dataset[attr] = ''; actions.append(b); return b; };
    const download = button('Descargar para usar sin conexión', 'offlineDownload');
    const remove = button('Eliminar material descargado', 'offlineRemove');
    const refresh = button('Comprobar de nuevo', 'offlineCheck');
    const cancel = button('Interrumpir descarga', 'offlineCancel'); cancel.hidden = true;
    const details = document.createElement('details'); details.dataset.offlineActions = '';
    const summary = document.createElement('summary'); summary.textContent = 'Gestionar material sin conexión';
    details.append(summary, actions); panel.append(status, details);
    const heading = principal.querySelector('h1');
    if (heading) heading.after(panel); else principal.prepend(panel);
    let controller = null;
    const paint = async (message = '') => {
      const result = await estado(resourceId);
      if (!panel.isConnected) return;
      panel.dataset.offlineState = result.estado;
      status.textContent = (message ? message + ' ' : '') + 'Sin conexión: ' + result.estado + '. ' + result.motivo + '.';
      if (resourceId === 'mapa') status.textContent += ' El mapa usa el catálogo; abrir una ficha requiere descargar también su contenido.';
      download.textContent = result.estado === 'completo' ? 'Verificar y reparar descarga' : 'Descargar para usar sin conexión';
    };
    download.addEventListener('click', async () => {
      if (controller) return;
      controller = new AbortController(); download.disabled = remove.disabled = refresh.disabled = true; cancel.hidden = false;
      const result = await descargar(resourceId, { signal: controller.signal, progreso: (n, total) => { if (panel.isConnected) status.textContent = `Descargando y comprobando ${n} de ${total}…`; } });
      controller = null; download.disabled = remove.disabled = refresh.disabled = false; cancel.hidden = true;
      await paint(result.mensaje || result.motivo);
      panel.dispatchEvent(new Event('offline-material-change', { bubbles: true }));
      if (!result.error && result.estado === "completo" && panel.isConnected) onChange?.();
    });
    cancel.addEventListener('click', () => controller?.abort());
    remove.addEventListener('click', async () => { remove.disabled = true; const result = await eliminar(resourceId); await paint(result.mensaje); remove.disabled = false; panel.dispatchEvent(new Event('offline-material-change', { bubbles: true })); });
    refresh.addEventListener('click', () => paint());
    paint().catch(() => { if (panel.isConnected) status.textContent = 'Disponibilidad desconocida: no se puede comprobar el almacenamiento.'; });
  }
  root.Offline = { manifest, names, estado, inventario, descargar, eliminar, conectar, paths };
})(globalThis);
