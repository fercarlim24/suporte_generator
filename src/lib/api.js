const API_KEY = import.meta.env.VITE_REPORTS_API_KEY || '';

let cloudAvailable = null;

export function hasCloudClientKey() {
  return Boolean(API_KEY);
}

export async function checkCloudAvailable() {
  if (!hasCloudClientKey()) {
    cloudAvailable = false;
    return false;
  }
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      cloudAvailable = false;
      return false;
    }
    const data = await res.json();
    cloudAvailable = data.cloud === true;
    return cloudAvailable;
  } catch {
    cloudAvailable = false;
    return false;
  }
}

export function isCloudAvailable() {
  return cloudAvailable === true;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
  };
}

export async function listCloudReports(type = 'ALL') {
  const q = type && type !== 'ALL' ? `?type=${encodeURIComponent(type)}` : '';
  const res = await fetch(`/api/reports${q}`, { headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.reports || [];
}

export async function saveCloudReport(entry) {
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  const data = await res.json();
  return data.report;
}

async function getBi(path) {
  const res = await fetch(path, { headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

export function fetchBiPulse({ from, to, product } = {}) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (product) q.set('product', product);
  const qs = q.toString();
  return getBi(`/api/bi/pulse${qs ? `?${qs}` : ''}`);
}

export function fetchBiFreshness() {
  return getBi('/api/bi/freshness');
}

export function fetchBiFeatures(weekStart) {
  const q = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : '';
  return getBi(`/api/bi/features${q}`);
}

export function fetchBiTenants(weekStart) {
  const q = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : '';
  return getBi(`/api/bi/tenants${q}`);
}

export async function deleteCloudReport(id) {
  const res = await fetch(`/api/reports/${id}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
}
