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

  return res.json();
}

export const getRecommendation = () => request("/recommendations");
export const generateRecommendation = () => request("/recommendations/generate", { method: "POST" });
