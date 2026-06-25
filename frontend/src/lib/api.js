const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function apiFetch(path, opts = {}) {
  const url = `${BASE}${path}`;
  
  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });

    if (!res.ok) {
      let errorMessage;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || res.statusText;
      } catch {
        errorMessage = res.statusText || `HTTP ${res.status}`;
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses
    const text = await res.text();
    if (!text) return null;
    
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    // Network errors
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Failed to connect to API server. Please ensure the backend is running.');
    }
    throw err;
  }
}

export const api = {
  getClusters: () => apiFetch("/clusters"),
  
  getCluster: (id) => {
    if (!id) throw new Error('Cluster ID is required');
    return apiFetch(`/clusters/${id}`);
  },
  
  getTimeline: (srcs) => {
    const query = srcs?.length ? `?source=${srcs.join(",")}` : "";
    return apiFetch(`/timeline${query}`);
  },
  
  getSources: () => apiFetch("/sources"),
  
  triggerIngest: () => apiFetch("/ingest/trigger", { method: "POST" }),
  
  getIngestStatus: (jobId) => {
    if (!jobId) throw new Error('Job ID is required');
    return apiFetch(`/ingest/status/${jobId}`);
  },
  
  getStats: () => apiFetch("/stats"),
  
  getHealth: () => apiFetch("/health"),
};