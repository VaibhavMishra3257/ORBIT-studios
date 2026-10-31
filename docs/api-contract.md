# ORBIT Studios frontend API contract

The supplied ORBIT interface is designed to use the following FastAPI endpoints.
These are the endpoint paths and payloads expected by the current frontend source;
Person 2 should compare them with the backend implementation and tell the frontend
developer about any differences before integration testing.

| Method | Path | Expected frontend payload / use |
|---|---|---|
| GET | `/projects/1` | Project, requirement, nodes, artifact and events |
| GET | `/agents/status?project_id=1` | `{ "agents": [...] }` |
| GET | `/proposals?project_id=1` | `{ "proposals": [...] }` |
| PUT | `/projects/1/requirement` | `{ "text": "...", "actor": "...", "node_id": "..." }` |
| POST | `/agents/{agent_id}/start` | `{ "actor": "..." }` |
| POST | `/agents/{agent_id}/kill` | `{}` |
| POST | `/agents/{agent_id}/recover` | `{}` |
| POST | `/proposals/{proposal_id}/approve` | `{ "actor": "..." }` |
| POST | `/proposals/{proposal_id}/redirect` | `{ "actor": "...", "instruction": "..." }` |
| POST | `/reset` | `{}` |

Expected response details used by the UI:
- Project: `requirement.text`, `requirement.version`, `nodes[]`, `artifact.html`, `events[]`.
- Agent status: `agents[]` with `id`, `name`, `status`, `context_outdated`, `known_version`.
- Proposals: `proposals[]` with `id`, `title`, `agent_id`, `status`, `based_on_version`, `content`, `rationale`, `stale_reason`.
- Requirement update response: `requirement.version` and `affected_node_ids[]`.
- HTTP 409 on approval means the proposal is stale and must not be approved.

## Local run
- Frontend: open `frontend/index.html` using VS Code Live Server.
- Backend default: `http://127.0.0.1:8000`.
- Change backend URL and project ID in `frontend/js/config.js`.
- Person 2 must configure FastAPI CORS for the Live Server origin (usually `http://127.0.0.1:5500` and `http://localhost:5500`).

Note: the current UI refreshes project, agents and proposals using HTTP polling every 1.5 seconds. It does not yet use a WebSocket connection.
