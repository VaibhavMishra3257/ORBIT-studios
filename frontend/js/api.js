/* Buildify API connection layer.
   The backend team can finalize endpoint paths without changing every UI component.
   Set window.BUILDIFY_API_URL before this file if the backend uses a different URL.
*/
(function () {
  const BASE_URL = window.BUILDIFY_API_URL || "http://127.0.0.1:8000";

  async function request(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

        if (!response.ok) {
      const detail = data && typeof data === "object" ? data.detail : null;
      const message = detail && typeof detail === "object"
        ? (detail.message || JSON.stringify(detail))
        : (detail || `Request failed (${response.status})`);
      const error = new Error(message);
      error.status = response.status;
      error.detail = detail;
      throw error;
    }
    return data;
  }

  function connectProjectSocket(projectId, onMessage, onStatus = () => {}) {
    const wsBase = BASE_URL.replace(/^http/, "ws");
    const socket = new WebSocket(`${wsBase}/ws/projects/${encodeURIComponent(projectId)}`);

    socket.addEventListener("open", () => onStatus("connected"));
    socket.addEventListener("close", () => onStatus("disconnected"));
    socket.addEventListener("error", () => onStatus("error"));
    socket.addEventListener("message", event => {
      try {
        onMessage(JSON.parse(event.data));
      } catch (error) {
        console.error("Buildify received an invalid WebSocket message:", error);
      }
    });
    return socket;
  }

  window.BuildifyAPI = {
    baseUrl: BASE_URL,
    get: path => request(path),
    post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
    patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
    delete: path => request(path, { method: "DELETE" }),
    connectProjectSocket
  };
})();
