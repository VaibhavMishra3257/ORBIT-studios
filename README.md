# ORBIT Studios — frontend

This frontend uses the uploaded ORBIT visual design: animated orbital landing screen,
dark glass dashboard, requirement dependency view, Nova and Atlas agent panels,
human approval controls, stale proposal comparison, recovery context, human activity,
and audit timeline.

## Run
1. Open this folder in VS Code.
2. Open `frontend/index.html` with Live Server.
3. Start Person 2's FastAPI backend at `http://127.0.0.1:8000`.
4. Update `frontend/js/config.js` if the backend URL or project ID differs.

Read `docs/api-contract.md` and confirm every route and response shape with Person 2.
The frontend uses polling at a configurable interval; it is not yet a true multi-user
real-time sync client.
