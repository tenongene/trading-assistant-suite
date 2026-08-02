const API_URL = import.meta.env.VITE_API_URL;

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const listPnlEntries = () => request("/pnl-entries");
export const getPnlEntry = (date) => request(`/pnl-entries/${encodeURIComponent(date)}`);
export const createPnlEntry = (entry) =>
  request("/pnl-entries", { method: "POST", body: JSON.stringify(entry) });
export const updatePnlEntry = (date, entry) =>
  request(`/pnl-entries/${encodeURIComponent(date)}`, { method: "PUT", body: JSON.stringify(entry) });
export const deletePnlEntry = (date) =>
  request(`/pnl-entries/${encodeURIComponent(date)}`, { method: "DELETE" });

// PUT requires the item to already exist server-side; POST requires it not to.
// This tries update-then-create so callers don't need to track persistence state themselves.
export async function upsertPnlEntry(entry) {
  try {
    return await updatePnlEntry(entry.date, entry);
  } catch (err) {
    if (err.status === 404) {
      return createPnlEntry(entry);
    }
    throw err;
  }
}
