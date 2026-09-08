const API_BASE = ''; // same-origin; set to your Worker URL if hosting frontend separately

let token = localStorage.getItem('wt_token');

const $ = (sel) => document.querySelector(sel);

function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
  loadDashboard();
  loadDevices();
}

function showAuth() {
  $('#app-screen').classList.add('hidden');
  $('#auth-screen').classList.remove('hidden');
}

// ---- Auth ----
$('#tab-login').addEventListener('click', () => {
  $('#tab-login').classList.add('active');
  $('#tab-register').classList.remove('active');
  $('#login-form').classList.remove('hidden');
  $('#register-form').classList.add('hidden');
});
$('#tab-register').addEventListener('click', () => {
  $('#tab-register').classList.add('active');
  $('#tab-login').classList.remove('active');
  $('#register-form').classList.remove('hidden');
  $('#login-form').classList.add('hidden');
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#auth-error').textContent = '';
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }),
  });
  const data = await res.json();
  if (!res.ok) { $('#auth-error').textContent = data.error ?? 'Giriş başarısız'; return; }
  token = data.token;
  localStorage.setItem('wt_token', token);
  showApp();
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#auth-error').textContent = '';
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgName: $('#reg-org').value,
      email: $('#reg-email').value,
      password: $('#reg-password').value,
    }),
  });
  const data = await res.json();
  if (!res.ok) { $('#auth-error').textContent = data.error ?? 'Kayıt başarısız'; return; }
  token = data.token;
  localStorage.setItem('wt_token', token);
  showApp();
});

$('#logout-btn').addEventListener('click', () => {
  localStorage.removeItem('wt_token');
  token = null;
  showAuth();
});

function authHeaders() {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ---- Dashboard ----
async function loadDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard/summary`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const counts = Object.fromEntries((data.statusCounts || []).map(s => [s.status, s.count]));
  $('#summary-cards').innerHTML = `
    <div class="stat-card"><div class="num">${counts.active || 0}</div><div class="label">Aktif</div></div>
    <div class="stat-card"><div class="num">${counts.expiring_soon || 0}</div><div class="label">Yakında Bitecek</div></div>
    <div class="stat-card"><div class="num">${counts.expired || 0}</div><div class="label">Süresi Dolmuş</div></div>
    <div class="stat-card"><div class="num">${counts.unknown || 0}</div><div class="label">Bilinmiyor</div></div>
  `;
}

// ---- Devices ----
async function loadDevices() {
  const res = await fetch(`${API_BASE}/api/devices`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const tbody = $('#devices-table tbody');
  tbody.innerHTML = '';
  for (const d of data.devices) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.manufacturer.toUpperCase()}</td>
      <td>${d.model ?? '-'}</td>
      <td>${d.serial_number}</td>
      <td>${d.purchase_date ?? '-'}</td>
      <td>${d.warranty_end_date ?? '-'}</td>
      <td><span class="badge ${d.status}">${d.status}</span></td>
      <td><button data-id="${d.id}" class="refresh-btn">Yenile</button></td>
    `;
    tbody.appendChild(tr);
  }
  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`${API_BASE}/api/devices/${btn.dataset.id}/refresh`, { method: 'POST', headers: authHeaders() });
      loadDevices();
      loadDashboard();
    });
  });
}

$('#add-device-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch(`${API_BASE}/api/devices`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      manufacturer: $('#dev-manufacturer').value,
      serial_number: $('#dev-serial').value,
      invoice_number: $('#dev-invoice').value || undefined,
    }),
  });
  $('#dev-serial').value = '';
  $('#dev-invoice').value = '';
  loadDevices();
  loadDashboard();
});

// ---- CSV import ----
$('#csv-upload-btn').addEventListener('click', async () => {
  const file = $('#csv-file').files[0];
  if (!file) return;
  const text = await file.text();
  const res = await fetch(`${API_BASE}/api/import/csv`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' },
    body: text,
  });
  const data = await res.json();
  $('#import-result').textContent = res.ok
    ? `${data.success}/${data.total} cihaz içe aktarıldı (${data.failed} hata)`
    : (data.error ?? 'İçe aktarma başarısız');
  loadDevices();
  loadDashboard();
});

// ---- Serial/Invoice lookup ----
$('#lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const val = $('#lookup-input').value.trim();
  if (!val) return;
  const res = await fetch(`${API_BASE}/api/devices/lookup?serial_number=${encodeURIComponent(val)}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) {
    const res2 = await fetch(`${API_BASE}/api/devices/lookup?invoice_number=${encodeURIComponent(val)}`, { headers: authHeaders() });
    const data2 = await res2.json();
    $('#lookup-result').textContent = res2.ok ? JSON.stringify(data2.device) : 'Kayıt bulunamadı';
    return;
  }
  $('#lookup-result').textContent = JSON.stringify(data.device);
});

// ---- Init ----
if (token) showApp(); else showAuth();
