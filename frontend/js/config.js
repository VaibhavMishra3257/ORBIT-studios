/* Backend configuration.
   On your own laptop (localhost / 127.0.0.1) it talks to the local backend.
   On Netlify or any other host it talks to the Render backend. */
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

window.BUILDIFY_CONFIG = {
  API_BASE_URL: IS_LOCAL ? "http://127.0.0.1:8000" : "https://orbit-studios.onrender.com",
  PROJECT_ID: 1,
  POLL_INTERVAL_MS: 1500
};