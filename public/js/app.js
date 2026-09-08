const API_BASE = '';

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

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('#login-email').value,
        password: $('#login-password').value
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      $('#auth-error').textContent = data.error ?? 'Giriş başarısız';
      return;
    }

    token = data.token;
    localStorage.setItem('wt_token', token);
    showApp();
  } catch (err) {
    $('#auth-error').textContent = `Bağlantı hatası: ${err.message}`;
  }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#auth-error').textContent = '';

  try {
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
    if (!res.ok) {
      $('#auth-error').textContent = data.error ?? 'Kayıt başarısız';
      return;
    }

    token = data.token;
    localStorage.setItem('wt_token', token);
    showApp();
  } catch (err) {
    $('#auth-error').textContent = `Bağlantı hatası: ${err.message}`;
  }
});

$('#logout-btn').addEventListener('click', () => {
  localStorage.removeItem('wt_token');
  token = null;
  showAuth();
});

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function loadDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard/summary`, {
    headers: authHeaders()
  });
  if (!res.ok) return;

  const data = await res.json();
  const counts = Object.fromEntries(
    (data.statusCounts || []).map(s => [s.status, s.count])
  );

  $('#summary-cards').innerHTML = `
    <div class="stat-card"><div class="num">${counts.active || 0}</div><div class="label">Aktif</div></div>
    <div class="stat-card"><div class="num">${counts.expiring_soon || 0}</div><div class="label">Yakında Bitecek</div></div>
    <div class="stat-card"><div class="num">${counts.expired || 0}</div><div class="label">Süresi Dolmuş</div></div>
    <div class="stat-card"><div class="num">${counts.unknown || 0}</div><div class="label">Bilinmiyor</div></div>
  `;
}

async function loadDevices() {
  const res = await fetch(`${API_BASE}/api/devices`, {
    headers: authHeaders()
  });
  if (!res.ok) return;

  const data = await res.json();
  const tbody = $('#devices-table tbody');
  tbody.innerHTML = '';

  for (const d of data.devices) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.manufacturer?.toUpperCase() ?? '-')}</td>
      <td>${escapeHtml(d.model ?? '-')}</td>
      <td>${escapeHtml(d.serial_number ?? '-')}</td>
      <td>${escapeHtml(d.purchase_date ?? '-')}</td>
      <td>${escapeHtml(d.warranty_end_date ?? '-')}</td>
      <td><span class="badge ${escapeHtml(d.status ?? 'unknown')}">${escapeHtml(d.status ?? 'unknown')}</span></td>
      <td><button data-id="${escapeHtml(d.id)}" class="refresh-btn">Yenile</button></td>
    `;
    tbody.appendChild(tr);
  }

  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(
        `${API_BASE}/api/devices/${btn.dataset.id}/refresh`,
        { method: 'POST', headers: authHeaders() }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Garanti yenileme başarısız');
        return;
      }

      loadDevices();
      loadDashboard();
    });
  });
}

$('#add-device-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#add-device-result').textContent = 'Sorgulanıyor...';

  try {
    const res = await fetch(`${API_BASE}/api/devices`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        manufacturer: $('#dev-manufacturer').value,
        serial_number: $('#dev-serial').value.trim(),
        invoice_number: $('#dev-invoice').value.trim() || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      $('#add-device-result').textContent =
        data.error ?? 'Cihaz eklenemedi';
      return;
    }

    $('#dev-serial').value = '';
    $('#dev-invoice').value = '';
    $('#add-device-result').textContent =
      data.device?.warranty_end_date
        ? `Eklendi. Garanti bitişi: ${data.device.warranty_end_date}`
        : 'Cihaz eklendi fakat garanti bilgisi bulunamadı.';

    loadDevices();
    loadDashboard();
  } catch (err) {
    $('#add-device-result').textContent =
      `Bağlantı hatası: ${err.message}`;
  }
});

function parseSerialFile(text) {
  const lines = text
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const first = lines[0].toLowerCase();
  if (first.includes('serial_number') || first.includes('serial') ||
      first.includes('service_tag') || first.includes('seri_no')) {
    return lines.slice(1).map(x => x.split(',')[0].trim()).filter(Boolean);
  }

  return lines
    .flatMap(line => line.includes(',') ? line.split(',') : [line])
    .map(x => x.trim())
    .filter(Boolean);
}

$('#serial-file').addEventListener('change', async () => {
  const file = $('#serial-file').files[0];
  if (!file) return;

  const text = await file.text();
  const serials = parseSerialFile(text);
  $('#serial-text').value = serials.join('\n');
});

$('#bulk-serial-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const manufacturer = $('#bulk-manufacturer').value;
  const serials = [...new Set(
    $('#serial-text').value
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
  )];

  if (!serials.length) {
    $('#bulk-serial-result').textContent =
      'En az bir seri numarası girin veya dosya yükleyin.';
    return;
  }

  if (serials.length > 100) {
    $('#bulk-serial-result').textContent =
      'Tek seferde en fazla 100 seri numarası sorgulanabilir.';
    return;
  }

  const button = e.submitter;
  if (button) button.disabled = true;
  $('#bulk-serial-result').textContent =
    `${serials.length} seri numarası sorgulanıyor...`;

  try {
    const res = await fetch(`${API_BASE}/api/import/serials`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ manufacturer, serials }),
    });

    const data = await res.json();

    if (!res.ok) {
      $('#bulk-serial-result').textContent =
        data.error ?? 'Toplu sorgulama başarısız';
      return;
    }

    $('#bulk-serial-result').textContent =
      `Tamamlandı: ${data.success} başarılı, ${data.failed} hatalı, toplam ${data.total}.`;

    const results = data.results || [];
    $('#bulk-serial-results').innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Seri No</th>
            <th>Model</th>
            <th>Garanti Bitiş</th>
            <th>Durum</th>
            <th>Sonuç</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td>${escapeHtml(r.serial_number)}</td>
              <td>${escapeHtml(r.model ?? '-')}</td>
              <td>${escapeHtml(r.warranty_end_date ?? '-')}</td>
              <td>${escapeHtml(r.status ?? '-')}</td>
              <td>${escapeHtml(r.ok ? 'Başarılı' : (r.error ?? 'Hata'))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    loadDevices();
    loadDashboard();
  } catch (err) {
    $('#bulk-serial-result').textContent =
      `Bağlantı hatası: ${err.message}`;
  } finally {
    if (button) button.disabled = false;
  }
});

$('#csv-upload-btn').addEventListener('click', async () => {
  const file = $('#csv-file').files[0];
  if (!file) {
    $('#import-result').textContent = 'CSV dosyası seçin.';
    return;
  }

  const text = await file.text();

  try {
    const res = await fetch(`${API_BASE}/api/import/csv`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/csv'
      },
      body: text,
    });

    const data = await res.json();

    $('#import-result').textContent = res.ok
      ? `${data.success}/${data.total} cihaz içe aktarıldı (${data.failed} hata)`
      : (data.error ?? 'İçe aktarma başarısız');

    loadDevices();
    loadDashboard();
  } catch (err) {
    $('#import-result').textContent = `Bağlantı hatası: ${err.message}`;
  }
});

$('#lookup-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const val = $('#lookup-input').value.trim();
  if (!val) return;

  const res = await fetch(
    `${API_BASE}/api/devices/lookup?serial_number=${encodeURIComponent(val)}`,
    { headers: authHeaders() }
  );

  const data = await res.json();

  if (!res.ok) {
    const res2 = await fetch(
      `${API_BASE}/api/devices/lookup?invoice_number=${encodeURIComponent(val)}`,
      { headers: authHeaders() }
    );

    const data2 = await res2.json();
    $('#lookup-result').textContent = res2.ok
      ? JSON.stringify(data2.device)
      : 'Kayıt bulunamadı';
    return;
  }

  $('#lookup-result').textContent = JSON.stringify(data.device);
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if (token) showApp();
else showAuth();
