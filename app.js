(() => {
  const MAX_PRODUCTS = 30;
  const MAX_LOCATIONS = 10;
  const DEFAULT_INTERVAL = '4';
  const STORE = 'bigbasket_stock_radar_v1';
  const DEVICE_STORE = 'bigbasket_stock_device_v1';
  function getDeviceId() { try { const saved = localStorage.getItem(DEVICE_STORE); if (saved) return saved; const id = window.crypto?.randomUUID?.() || `dev-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`; localStorage.setItem(DEVICE_STORE, id); return id; } catch { return `dev-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`; } }
  const deviceId = getDeviceId();
  const state = { locations: [], products: [], rows: [], lastAvailable: new Set(), running: false, timer: null, wake: null, alarmTimer: null, keepAwake: false, wakeLock: null, wakeTimer: null, prompt: null, audio: null, licensed: false, license: '', licenseTimer: null };
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ locations:state.locations, products:state.products, interval:$('interval').value, intervalPreference:true, muted:state.muted, soundPreference:true, rows:state.rows })); } catch {} };

  function productId(value) {
    const text = String(value || '').trim();
    const url = text.match(/\/pd\/(\d+)/i);
    const id = url?.[1] || text.match(/^\d+$/)?.[0];
    return id && /^\d+$/.test(id) ? id : '';
  }

  function renderCounts() {
    $('productCount').textContent = `${state.products.length} / ${MAX_PRODUCTS}`;
    $('locationCount').textContent = `${state.locations.length} / ${MAX_LOCATIONS} selected`;
    $('liveCount').textContent = state.locations.length;
    $('setupHint').textContent = state.locations.length && state.products.length ? `${state.products.length * state.locations.length} live checks per scan.` : 'Select at least one location and one product to start.';
  }

  function renderProducts() {
    $('productChips').innerHTML = state.products.map(id => `<span class="chip"><span>${escapeHtml(id)}</span><button class="remove-product" type="button" data-remove-product="${escapeHtml(id)}" aria-label="Remove ${escapeHtml(id)}">Remove</button></span>`).join('');
    renderCounts();
  }

  function renderLocations() {
    $('locations').innerHTML = state.locations.map((item, index) => `<div class="location-chip"><button type="button" data-remove-location="${index}" aria-label="Remove location">&times;</button><b>${escapeHtml(item.pincode)}</b><span>${escapeHtml(item.area || item.address || 'Selected delivery area')}</span></div>`).join('');
    const first = state.locations[0];
    $('locationTitle').textContent = first ? `${first.pincode}, ${first.city || first.area || 'selected area'}` : 'Select delivery location';
    $('locationSub').textContent = state.locations.length > 1 ? `${state.locations.length} delivery locations selected` : first ? 'BigBasket-style area selected' : 'Enter pincode like BigBasket';
    renderCounts();
  }

  function renderResults() {
    const rows = state.rows || [];
    $('results').innerHTML = rows.length ? rows.map(row => {
      const status = row.error ? 'na' : row.available ? 'in' : 'out';
      const label = row.error ? 'CHECK ERROR' : row.available ? 'IN STOCK' : (row.label || 'OUT OF STOCK');
      const price = row.price ? `Rs ${escapeHtml(row.price)}` : '-';
      const delivery = row.eta || row.delivery || '-';
      return `<tr><td><span class="product-title">${escapeHtml(row.name || `Product ${row.productId}`)}</span><span class="product-id">ID ${escapeHtml(row.productId)}</span></td><td>${escapeHtml(row.locationLabel || row.pincode)}</td><td><span class="pill ${status}">${label}</span>${row.error ? `<span class="meta">${escapeHtml(row.error)}</span>` : ''}</td><td>${price}</td><td>${escapeHtml(delivery)}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-row">No checks yet.</td></tr>';
    $('inStock').textContent = rows.filter(row => row.available).length;
    $('outStock').textContent = rows.filter(row => !row.available && !row.error).length;
    $('errors').textContent = rows.filter(row => row.error).length;
  }

  function renderStockAlert(rows, preferredRow = null) {
    const available = rows.filter(row => row.available);
    const row = preferredRow || available[0];
    $('stockAlert').classList.toggle('show', Boolean(available.length));
    if (row) $('stockAlertText').textContent = `${row.name || `Product ${row.productId}`} - ${row.locationLabel || row.pincode}`;
  }

  function setNetwork(kind, text) { $('network').className = `network ${kind === 'error' ? 'error' : ''}`; $('network').textContent = text; }
  function showSuggestions(items, message = '') {
    const box = $('suggestions');
    if (message) box.innerHTML = `<div class="${message === 'Searching...' ? 'loading' : 'empty-suggest'}">${escapeHtml(message)}</div>`;
    else box.innerHTML = items.map(item => `<button class="suggestion" type="button" data-place-id="${escapeHtml(item.placeId)}"><span class="s-pin">&#9673;</span><span><b>${escapeHtml(item.mainText || item.pincode || item.description)}</b><span>${escapeHtml(item.secondaryText || item.description || '')}</span></span><span class="tick">Select</span></button>`).join('');
    box.classList.add('open');
  }

  async function searchLocations() {
    const query = $('locationSearch').value.trim();
    if (query.length < 3) { $('suggestions').classList.remove('open'); return; }
    showSuggestions([], 'Searching...');
    try {
      const response = await fetch(`/api/locations?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Location search failed.');
      showSuggestions(data.predictions || [], data.predictions?.length ? '' : 'No matching areas found.');
      setNetwork('ok', 'Location search ready');
    } catch (error) { showSuggestions([], error.message); setNetwork('error', 'Location search error'); }
  }

  async function selectLocation(placeId) {
    showSuggestions([], 'Loading exact area...');
    try {
      const response = await fetch(`/api/locations?placeId=${encodeURIComponent(placeId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not select this location.');
      const location = data.location;
       if (!location?.pincode || !location?.lat || !location?.lng) throw new Error('BigBasket did not return a usable location.');
       const duplicate = state.locations.some(item => item.pincode === location.pincode && Math.abs(item.lat - location.lat) < .0001);
       if (!duplicate && state.locations.length >= MAX_LOCATIONS) throw new Error(`Maximum ${MAX_LOCATIONS} locations reached.`);
       if (!duplicate) state.locations.push(location);
      $('locationSearch').value = '';
      $('suggestions').classList.remove('open');
      renderLocations(); save(); setNetwork('ok', 'Location selected');
    } catch (error) { showSuggestions([], error.message); setNetwork('error', 'Location selection error'); }
  }

  function addProduct() {
    const id = productId($('productEntry').value);
    if (!id) { $('status').textContent = 'Enter a numeric BigBasket product ID or product URL.'; return; }
    if (state.products.length >= MAX_PRODUCTS) return;
    if (!state.products.includes(id)) state.products.push(id);
    $('productEntry').value = ''; renderProducts(); save();
  }

  async function unlockAudio() { try { state.audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (state.audio.state === 'suspended') await Promise.race([state.audio.resume(), new Promise(resolve => setTimeout(resolve, 500))]); } catch {} }
  function beep() { if (state.muted || !state.audio || state.audio.state !== 'running') return; try { const now = state.audio.currentTime; const osc = state.audio.createOscillator(); const gain = state.audio.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.setValueAtTime(660, now + .16); gain.gain.setValueAtTime(.001, now); gain.gain.exponentialRampToValueAtTime(.18, now + .02); gain.gain.exponentialRampToValueAtTime(.001, now + .42); osc.connect(gain).connect(state.audio.destination); osc.start(now); osc.stop(now + .45); } catch {} }
  function stopStockAlarm() { clearInterval(state.alarmTimer); state.alarmTimer = null; }
  function startStockAlarm() { if (state.muted || state.alarmTimer || !state.audio || state.audio.state !== 'running') return; beep(); state.alarmTimer = setInterval(() => { if (state.muted || !state.audio || state.audio.state !== 'running') return stopStockAlarm(); beep(); }, 900); }
  function updateSound() { $('sound').textContent = `Sound: ${state.muted ? 'off' : 'on'}`; $('sound').classList.toggle('on', !state.muted); }

  function stopLicenseWatch() { clearInterval(state.licenseTimer); state.licenseTimer = null; }
  function licenseMessage(text, error = false) { $('licenseStatus').textContent = text; $('licenseStatus').classList.toggle('error', error); }
  function lockApp(message) { state.licensed = false; stopLicenseWatch(); stop(); document.body.classList.remove('licensed'); licenseMessage(message, true); }
  async function verifyDevice() {
    licenseMessage('Checking device activation...');
    const response = await fetch('/api/license', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ license:deviceId }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.valid) throw new Error('This device is not activated yet. Add its Device ID to licenses.json.');
    state.licensed = true; state.license = deviceId; document.body.classList.add('licensed');
    licenseMessage('Device active. Next check in 30 seconds.');
    stopLicenseWatch();
    state.licenseTimer = setInterval(() => verifyDevice().catch(error => lockApp(error.message)), 30000);
  }

  async function scan(retryErrors = false) {
    if (!state.locations.length || !state.products.length) throw new Error('Select at least one location and one product first.');
    const failed = retryErrors ? state.rows.filter(row => row.error) : [];
    const products = retryErrors ? [...new Set(failed.map(row => String(row.productId)))] : state.products;
    const locations = retryErrors ? state.locations.filter(location => failed.some(row => String(row.pincode) === String(location.pincode))) : state.locations;
    if (!products.length || !locations.length) return;
    $('status').textContent = retryErrors ? `Retrying ${failed.length} failed checks...` : `Checking ${products.length * locations.length} location checks...`;
    $('lastChecked').textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    $('progress').style.width = '18%';
    const response = await fetch('/api/stock', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ products, locations }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Stock request failed (${response.status}).`);
    const received = Array.isArray(data.results) ? data.results : [];
    if (retryErrors) { const replacements = new Map(received.map(row => [`${row.productId}:${row.pincode}`, row])); state.rows = state.rows.map(row => replacements.get(`${row.productId}:${row.pincode}`) || row); } else state.rows = received;
    $('progress').style.width = '100%';
    const errorCount = state.rows.filter(row => row.error).length;
    $('status').textContent = errorCount ? `${errorCount} checks failed. Retrying in 8 seconds.` : state.rows.some(row => row.available) ? 'Stock found in one or more selected locations.' : 'No stock found in the selected locations.';
    renderResults(); save(); setNetwork('ok', 'Live data received');
    const currentAvailable = new Set(state.rows.filter(row => row.available).map(row => `${row.productId}:${row.pincode}`));
    const newlyAvailable = state.rows.find(row => row.available && !state.lastAvailable.has(`${row.productId}:${row.pincode}`));
    state.lastAvailable = currentAvailable;
    renderStockAlert(state.rows, newlyAvailable);
    if (currentAvailable.size) startStockAlarm(); else stopStockAlarm();
  }

  function wait(milliseconds) { return new Promise(resolve => { const done = () => { clearTimeout(state.timer); state.timer = null; state.wake = null; resolve(); }; state.wake = done; state.timer = setTimeout(done, milliseconds); }); }
  async function start() {
    if (state.running) return;
    if (!state.licensed) throw new Error('This device is not activated yet. Add its Device ID to licenses.json.');
    await unlockAudio();
    stopStockAlarm();
    state.lastAvailable = new Set();
    state.running = true; $('start').disabled = true; $('stop').disabled = false; $('start').textContent = 'Checking live stock...';
    let retryErrors = false;
    try { while (state.running) { let delay = Math.max(4, Number($('interval').value) || 4); try { await scan(retryErrors); retryErrors = state.rows.some(row => row.error); if (retryErrors) delay = 8; } catch (error) { retryErrors = false; delay = 8; $('status').textContent = `${error.message} Retrying in 8 seconds.`; setNetwork('error', 'Check failed'); } if (state.running) await wait(delay * 1000); } }
    finally { state.running = false; $('start').disabled = false; $('stop').disabled = true; $('start').textContent = 'Start live checking'; }
  }
  function stop() { state.running = false; stopStockAlarm(); clearTimeout(state.timer); state.timer = null; if (state.wake) state.wake(); $('status').textContent = 'Stopped. Last results are kept below.'; }
  async function setKeepAwake(enabled) { state.keepAwake = enabled; clearInterval(state.wakeTimer); state.wakeTimer = null; if (!enabled) { await state.wakeLock?.release?.(); state.wakeLock = null; $('awake').textContent = 'Keep screen awake'; $('awake').classList.remove('on'); return; } if (!('wakeLock' in navigator)) { state.keepAwake = false; $('awake').textContent = 'Wake lock unavailable'; return; } try { await state.wakeLock?.release?.(); state.wakeLock = await navigator.wakeLock.request('screen'); $('awake').textContent = 'Screen awake: on'; $('awake').classList.add('on'); state.wakeTimer = setInterval(() => { if (document.visibilityState === 'visible') setKeepAwake(true); }, 600000); } catch { state.keepAwake = false; $('awake').textContent = 'Wake lock unavailable'; } }

  $('locationButton').addEventListener('click', () => { $('locationSearch').scrollIntoView({ behavior:'smooth', block:'center' }); $('locationSearch').focus(); });
  $('locationSearch').addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(searchLocations, 260); });
  $('locationSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchLocations(); } });
  $('locationSearchButton').addEventListener('click', searchLocations);
  $('suggestions').addEventListener('click', event => { const button = event.target.closest('[data-place-id]'); if (button) selectLocation(button.dataset.placeId); });
  $('locations').addEventListener('click', event => { const button = event.target.closest('[data-remove-location]'); if (!button) return; state.locations.splice(Number(button.dataset.removeLocation), 1); renderLocations(); save(); });
  $('addProduct').addEventListener('click', addProduct); $('productEntry').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addProduct(); } });
  $('productChips').addEventListener('click', event => { const button = event.target.closest('[data-remove-product]'); if (!button) return; state.products = state.products.filter(id => id !== button.dataset.removeProduct); renderProducts(); save(); });
   $('sound').addEventListener('click', async () => { state.muted = !state.muted; if (!state.muted) { await unlockAudio(); if (state.rows.some(row => row.available)) startStockAlarm(); else beep(); } else stopStockAlarm(); updateSound(); save(); });
   $('interval').addEventListener('change', save); $('start').addEventListener('click', () => start().catch(error => { $('status').textContent = error.message; setNetwork('error', 'Check failed'); })); $('stop').addEventListener('click', stop); $('awake').addEventListener('click', () => setKeepAwake(!state.keepAwake)); document.addEventListener('visibilitychange', () => { if (state.keepAwake && document.visibilityState === 'visible') setKeepAwake(true); });
    $('deviceId').textContent = deviceId; $('copyDeviceId').addEventListener('click', async () => { try { await navigator.clipboard.writeText(deviceId); licenseMessage('Device ID copied. Send it to the admin.'); } catch { licenseMessage('Select and copy the Device ID manually.'); } });
  window.addEventListener('online', () => setNetwork('ok', 'Connected')); window.addEventListener('offline', () => setNetwork('error', 'Offline'));
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.prompt = event; $('install').style.display = 'block'; });
  $('install').addEventListener('click', async () => { if (!state.prompt) return; state.prompt.prompt(); await state.prompt.userChoice; state.prompt = null; $('install').style.display = 'none'; });
   try { const stored = JSON.parse(localStorage.getItem(STORE) || '{}'); state.locations = Array.isArray(stored.locations) ? stored.locations.slice(0, MAX_LOCATIONS) : []; state.products = Array.isArray(stored.products) ? stored.products : []; state.rows = Array.isArray(stored.rows) ? stored.rows : []; if (stored.intervalPreference && stored.interval) $('interval').value = stored.interval; else $('interval').value = DEFAULT_INTERVAL; if (typeof stored.muted === 'boolean' && stored.soundPreference) state.muted = stored.muted; } catch {}
   renderProducts(); renderLocations(); renderResults(); renderStockAlert(state.rows); updateSound(); setNetwork(navigator.onLine ? 'ok' : 'error', navigator.onLine ? 'Connected' : 'Offline');
    verifyDevice().catch(error => licenseMessage(error.message, true));
})();
