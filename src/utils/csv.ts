// Minimal CSV parser (handles quoted fields, commas inside quotes, CRLF/LF).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const filtered = rows.filter(r => r.some(c => c.trim() !== ''));
  if (filtered.length === 0) return [];

  const headers = filtered[0].map(h => h.trim().toLowerCase());
  return filtered.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

// Expected/likely CSV columns (flexible aliases so IT teams can import their existing sheet):
// manufacturer, model, serial_number (or serial/service_tag), invoice_number, purchase_date
export function normalizeImportRow(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) if (row[k]) return row[k];
    return '';
  };
  return {
    manufacturer: get('manufacturer', 'brand', 'marka').toLowerCase(),
    model: get('model', 'model_name'),
    serial_number: get('serial_number', 'serial', 'service_tag', 'seri_no'),
    invoice_number: get('invoice_number', 'invoice', 'fatura_no'),
    purchase_date: get('purchase_date', 'purchased_on', 'satin_alma_tarihi'),
  };
}
