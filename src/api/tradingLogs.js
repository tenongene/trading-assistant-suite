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

export const listLogs = () => request("/logs");
export const getLog = (date) => request(`/logs/${encodeURIComponent(date)}`);
export const createLog = (log) =>
  request("/logs", { method: "POST", body: JSON.stringify(log) });
export const updateLog = (date, log) =>
  request(`/logs/${encodeURIComponent(date)}`, { method: "PUT", body: JSON.stringify(log) });
export const deleteLog = (date) =>
  request(`/logs/${encodeURIComponent(date)}`, { method: "DELETE" });

// PUT requires the item to already exist server-side; POST requires it not to.
// This tries update-then-create so callers don't need to track persistence state themselves.
export async function upsertLog(log) {
  try {
    return await updateLog(log.date, log);
  } catch (err) {
    if (err.status === 404) {
      return createLog(log);
    }
    throw err;
  }
}
