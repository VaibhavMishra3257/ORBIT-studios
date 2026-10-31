/* ORBIT / Buildify API helper.
   The dashboard expects the endpoint paths documented in docs/api-contract.md.
*/
(function () {
  const config = window.BUILDIFY_CONFIG || {};
  const base = (config.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

  function setConn(ok) {
    const c = document.querySelector("#conn");
    if (!c) return;
    c.textContent = ok ? "backend live" : "backend offline";
    c.className = "chip " + (ok ? "on" : "off");
  }

  async function api(method, path, body) {
    try {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {})
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      setConn(true);   // any HTTP answer (even 409/422) means the backend is reachable
      return { code: response.status, data };
    } catch (error) {
      setConn(false);
      console.error("ORBIT API request failed:", method, path, error);
      return { code: 0, data: null, error: error.message };
    }
  }

  window.orbitApi = api;
  window.orbitApiBase = base;
})();
