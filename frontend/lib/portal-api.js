const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export async function portalFetch(path, { params } = {}) {
  const token = localStorage.getItem('accessToken');
  const url = new URL(path, API_URL);
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status}: ${msg}`), { status: res.status });
  }
  return res.json();
}
