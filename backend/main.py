import asyncio
import copy
import html as html_lib
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Person 2's LLM hook. If agents.py is missing or broken, templates are used.
try:
    from agents import generate_with_llm
except Exception as e:
    generate_with_llm = None
    print(f"agents.py not loaded, using templates: {e}")

PROJECT_ID = 1
AGENT_DELAY_SECONDS = 6  # simulated agent work time

app = FastAPI(title="ORBIT Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def now():
    return datetime.now(timezone.utc).isoformat()


def clean_text(text):
    """Treat empty text and Swagger's default 'string' as no instruction."""
    t = (text or "").strip()
    return None if t.lower() in ("", "string") else t


# ---------------------------------------------------------------- seed state
def make_seed():
    return {
        "project": {
            "id": 1,
            "name": "CampusEats",
            "goal": "Build a food delivery platform for college students.",
            "requirement": {"text": "Positioning: Cheap", "version": 1},
        },
        "users": [
            {"id": "niharika", "name": "Niharika", "role": "Founder"},
            {"id": "vaibhav", "name": "Vaibhav", "role": "Product Designer"},
        ],
        "nodes": [
            {"id": "r1", "label": "Target users", "text": "College students",
             "version": 1, "updated_at_version": 1, "depends_on": []},
            {"id": "r2", "label": "Positioning", "text": "Cheap",
             "version": 1, "updated_at_version": 1, "depends_on": []},
            {"id": "r3", "label": "Hero message", "text": "Cheapest meals on campus",
             "version": 1, "updated_at_version": 1, "depends_on": ["r2"]},
            {"id": "r4", "label": "Persona messaging", "text": "Budget-focused student",
             "version": 1, "updated_at_version": 1, "depends_on": ["r1", "r2"]},
            {"id": "r5", "label": "Demo page", "text": "Deals-first landing page",
             "version": 1, "updated_at_version": 1, "depends_on": ["r3", "r4"]},
        ],
        "agents": {
            "atlas": {"id": "atlas", "name": "Atlas", "role": "Research & Persona Agent",
                      "status": "idle", "context_version": 1,
                      "last_seen_event_id": 0, "current_task": None},
            "nova": {"id": "nova", "name": "Nova", "role": "Demo Builder Agent",
                     "status": "idle", "context_version": 1,
                     "last_seen_event_id": 0, "current_task": None},
        },
        "proposals": [],
        "decisions": [],
        "events": [],
        "artifact": {"version": 0, "updated_by_proposal_id": None,
                     "html": "<h1>CampusEats</h1><p>Waiting for the first approved proposal.</p>"},
    }


STATE = make_seed()
TASKS = {}
COUNTERS = {"event": 0, "proposal": 0, "decision": 0}
DEFAULT_TASK = {
    "atlas": "Research student needs and write persona messaging",
    "nova": "Build the campus food delivery demo page",
}


# ---------------------------------------------------------------- websocket
class Hub:
    def __init__(self):
        self.clients = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


hub = Hub()


async def emit(type_, summary, actor="system", payload=None):
    """Log an event in the timeline AND push it to every WebSocket client."""
    COUNTERS["event"] += 1
    event = {
        "id": COUNTERS["event"], "type": type_, "actor": actor,
        "summary": summary, "timestamp": now(), "payload": payload or {},
    }
    STATE["events"].append(event)
    await hub.broadcast({
        "type": type_, "project_id": PROJECT_ID, "event_id": event["id"],
        "actor": actor, "summary": summary,
        "timestamp": event["timestamp"], "payload": payload or {},
    })
    return event


# ------------------------------------------------------------------ helpers
def check_project(pid):
    if pid != PROJECT_ID:
        raise HTTPException(404, detail={"code": "project_not_found",
                                         "message": f"Project {pid} does not exist."})


def require_agent(agent_id):
    if agent_id not in STATE["agents"]:
        raise HTTPException(404, detail={"code": "agent_not_found",
                                         "message": f"Unknown agent '{agent_id}'. Use 'atlas' or 'nova'."})
    return STATE["agents"][agent_id]


def get_proposal(proposal_id):
    for p in STATE["proposals"]:
        if p["id"] == proposal_id:
            return p
    raise HTTPException(404, detail={"code": "proposal_not_found",
                                     "message": f"Proposal '{proposal_id}' does not exist."})


def get_node(node_id):
    return next((n for n in STATE["nodes"] if n["id"] == node_id), None)


def user_name(actor):
    for u in STATE["users"]:
        if u["id"] == actor:
            return u["name"]
    return actor


def current_version():
    return STATE["project"]["requirement"]["version"]


def dependents(node_id):
    """The node plus everything that depends on it, directly or indirectly."""
    affected, queue = {node_id}, [node_id]
    while queue:
        cur = queue.pop()
        for n in STATE["nodes"]:
            if cur in n["depends_on"] and n["id"] not in affected:
                affected.add(n["id"])
                queue.append(n["id"])
    return affected


def stale_node(p):
    """Return the changed node that makes this proposal outdated, or None."""
    for nid in p["depends_on_node_ids"]:
        n = get_node(nid)
        if n and n["updated_at_version"] > p["based_on_version"]:
            return n
    return None


def stale_reason_for(p, n):
    return (f"Built on requirement v{p['based_on_version']}, but '{n['label']}' "
            f"changed in v{n['updated_at_version']} and is now '{n['text']}'.")


def public_agent(a):
    d = copy.deepcopy(a)
    d["context_outdated"] = d["context_version"] < current_version()
    return d


def build_packet(agent_id):
    a = STATE["agents"][agent_id]
    return {
        "agent_id": agent_id,
        "project_goal": STATE["project"]["goal"],
        "requirement": copy.deepcopy(STATE["project"]["requirement"]),
        "nodes": copy.deepcopy(STATE["nodes"]),
        "decisions_so_far": copy.deepcopy(STATE["decisions"]),
        "previous_outputs": [
            {"id": p["id"], "title": p["title"], "status": p["status"],
             "based_on_version": p["based_on_version"]}
            for p in STATE["proposals"] if p["agent_id"] == agent_id
        ],
        "changed_since_last_seen": [
            {"event_id": e["id"], "type": e["type"], "summary": e["summary"]}
            for e in STATE["events"] if e["id"] > a["last_seen_event_id"]
        ],
        "stale_proposals_to_revise": [
            p["id"] for p in STATE["proposals"]
            if p["agent_id"] == agent_id and p["status"] == "stale"
        ],
        "pending_tasks": [a["current_task"] or DEFAULT_TASK[agent_id]],
        "recovered_at": now(),
    }


# -------------------------------------------------- agent content generation
# TEMPLATE LOGIC (fallback). Real LLM output comes from agents.py.
HTML_TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>CampusEats</title>
<style>
body{font-family:Arial,sans-serif;margin:0;background:#fffaf2;color:#222}
.hero{padding:48px 24px;text-align:center;background:#ffedd5}
.hero h1{font-size:32px;margin:0 0 12px}
.badge{display:inline-block;background:#f97316;color:#fff;padding:4px 12px;border-radius:999px;font-size:13px;margin-bottom:12px}
.note{background:#fef3c7;padding:10px;margin:16px auto;max-width:520px;border-radius:8px}
.cards{display:flex;gap:16px;padding:24px;justify-content:center;flex-wrap:wrap}
.card{background:#fff;border-radius:12px;padding:16px;width:200px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
</style></head><body>
<div class="hero"><div class="badge">Built on requirement v%%VERSION%%</div>
<h1>%%POSITIONING%% food, delivered on campus</h1>
<p>Made for: %%AUDIENCE%%</p>%%NOTE%%</div>
<div class="cards">
<div class="card"><b>Campus Biryani</b><br>Rs 90 | 12 min</div>
<div class="card"><b>Hostel Rolls</b><br>Rs 60 | 10 min</div>
<div class="card"><b>Cold Coffee</b><br>Rs 50 | 8 min</div>
</div></body></html>"""


def generate(agent_id, ctx, instruction):
    nodes = {n["id"]: n for n in ctx["nodes"]}
    esc = html_lib.escape
    pos, audience = nodes["r2"]["text"], nodes["r1"]["text"]
    ver = ctx["version"]
    if agent_id == "atlas":
        cheap = "cheap" in pos.lower()
        cares = ("lowest price, student discounts, combo deals" if cheap
                 else "speed, reliability, trusted vendors, live tracking")
        content = (f"Persona: {audience}\n"
                   f"Positioning: {pos}\n"
                   f"Key message: {nodes['r3']['text']}\n"
                   f"What they care about: {cares}")
        if instruction:
            content += f"\nDirection from team: {instruction}"
        return {"type": "persona",
                "title": f"Persona messaging for '{pos}' positioning",
                "content": content,
                "rationale": f"Written from requirement v{ver}: positioning is '{pos}'.",
                "depends_on_node_ids": ["r1", "r2", "r4"]}
    note = f'<div class="note">Design direction: {esc(instruction)}</div>' if instruction else ""
    page = (HTML_TEMPLATE.replace("%%VERSION%%", str(ver))
            .replace("%%POSITIONING%%", esc(pos))
            .replace("%%AUDIENCE%%", esc(audience))
            .replace("%%NOTE%%", note))
    return {"type": "demo_html",
            "title": f"Demo page for '{pos}' positioning",
            "content": page,
            "rationale": f"Hero and layout built from requirement v{ver}: '{pos}' for {audience}.",
            "depends_on_node_ids": ["r3", "r5"]}


async def submit_proposal(agent_id, ctx, result, instruction, redirect_of):
    COUNTERS["proposal"] += 1
    agent = STATE["agents"][agent_id]
    p = {
        "id": f"p{COUNTERS['proposal']}", "project_id": PROJECT_ID,
        "agent_id": agent_id, "agent_name": agent["name"],
        "type": result["type"], "title": result["title"],
        "based_on_version": ctx["version"],
        "depends_on_node_ids": result["depends_on_node_ids"],
        "status": "pending", "content": result["content"],
        "rationale": result["rationale"], "stale_reason": None,
        "instruction": instruction, "redirect_of": redirect_of,
        "created_at": now(),
    }
    STATE["proposals"].append(p)
    node = stale_node(p)  # arrival check: was this built on outdated context?
    if node:
        p["status"] = "stale"
        p["stale_reason"] = stale_reason_for(p, node)
    await emit("proposal_created", f"{agent['name']} submitted: {p['title']}",
               agent_id, {"proposal": copy.deepcopy(p)})
    if node:
        await emit("proposal_stale",
                   f"{agent['name']}'s proposal was blocked as outdated. {p['stale_reason']}",
                   "system",
                   {"proposal_id": p["id"], "stale_reason": p["stale_reason"],
                    "based_on_version": p["based_on_version"],
                    "current_version": current_version()})
    agent["status"] = "idle"
    agent["current_task"] = None
    await emit("agent_status_changed", f"{agent['name']} finished and is idle.",
               agent_id, {"agent": public_agent(agent)})


async def run_agent(agent_id, ctx, instruction, redirect_of):
    try:
        await asyncio.sleep(AGENT_DELAY_SECONDS)
    except asyncio.CancelledError:
        return
    result = None
    fallback_reason = "agents.py failed to import" if not generate_with_llm else None
    if generate_with_llm:
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(generate_with_llm, agent_id, ctx, instruction),
                timeout=40)
        except Exception as e:
            fallback_reason = f"{type(e).__name__}: {e}" or type(e).__name__
            print(f"LLM failed, using template fallback: {fallback_reason}")
            result = None
    if result is None:
        result = generate(agent_id, ctx, instruction)  # template fallback
        result["rationale"] = f"[TEMPLATE FALLBACK - {fallback_reason}] " + result["rationale"]
    await submit_proposal(agent_id, ctx, result, instruction, redirect_of)


async def launch_agent(agent_id, actor, instruction=None, redirect_of=None, reason="started"):
    agent = STATE["agents"][agent_id]
    old = TASKS.get(agent_id)
    if old and not old.done():
        old.cancel()
    ctx = {
        "requirement": copy.deepcopy(STATE["project"]["requirement"]),
        "nodes": copy.deepcopy(STATE["nodes"]),
        "version": current_version(),
    }
    agent["status"] = "working"
    agent["context_version"] = current_version()
    agent["last_seen_event_id"] = COUNTERS["event"]
    agent["current_task"] = instruction or DEFAULT_TASK[agent_id]
    TASKS[agent_id] = asyncio.create_task(run_agent(agent_id, ctx, instruction, redirect_of))
    await emit("agent_status_changed", f"{agent['name']} is now working ({reason}).",
               actor, {"agent": public_agent(agent)})
    return agent


# ------------------------------------------------------------------- models
class RequirementUpdate(BaseModel):
    text: str
    actor: str = "niharika"
    node_id: Optional[str] = None


class StartBody(BaseModel):
    project_id: int = 1
    task: Optional[str] = None
    actor: str = "system"


class DecisionBody(BaseModel):
    actor: str = "niharika"
    note: Optional[str] = None


class RedirectBody(BaseModel):
    actor: str = "vaibhav"
    instruction: str


# ---------------------------------------------------------------- endpoints
@app.get("/projects/{pid}")
async def get_project(pid: int):
    check_project(pid)
    proj = STATE["project"]
    return {
        "id": proj["id"], "name": proj["name"], "goal": proj["goal"],
        "requirement": proj["requirement"],
        "users": STATE["users"], "nodes": STATE["nodes"],
        "artifact": STATE["artifact"],
        "decisions": STATE["decisions"],
        "events": STATE["events"][-30:],
    }


@app.put("/projects/{pid}/requirement")
async def update_requirement(pid: int, body: RequirementUpdate):
    check_project(pid)
    req = STATE["project"]["requirement"]
    node = None
    if body.node_id:
        node = get_node(body.node_id)
        if not node:
            raise HTTPException(404, detail={"code": "node_not_found",
                                             "message": f"Unknown node '{body.node_id}'."})
    req["version"] += 1
    v = req["version"]
    if node:
        node["text"] = body.text
        node["version"] += 1
        req["text"] = f"{node['label']}: {body.text}"
        affected = dependents(node["id"])
    else:
        req["text"] = body.text
        affected = {n["id"] for n in STATE["nodes"]}
    for nid in affected:
        get_node(nid)["updated_at_version"] = v

    who = user_name(body.actor)
    await emit("requirement_updated", f"{who} changed the requirement to v{v}: {req['text']}",
               body.actor, {"requirement": copy.deepcopy(req),
                            "changed_node_id": body.node_id,
                            "affected_node_ids": sorted(affected)})

    stale_ids = []
    for p in STATE["proposals"]:
        if p["status"] != "pending":
            continue
        n = stale_node(p)
        if n:
            p["status"] = "stale"
            p["stale_reason"] = stale_reason_for(p, n)
            stale_ids.append(p["id"])
            await emit("proposal_stale",
                       f"{p['agent_name']}'s proposal is outdated. {p['stale_reason']}",
                       "system", {"proposal_id": p["id"], "stale_reason": p["stale_reason"],
                                  "based_on_version": p["based_on_version"],
                                  "current_version": v})

    notified = []
    for a in STATE["agents"].values():
        if a["status"] in ("working", "idle"):
            notified.append(a["id"])
    await emit("agents_notified",
               f"Agents notified of requirement v{v}: {', '.join(notified) or 'none'}.",
               "system", {"agent_ids": notified, "requirement_version": v,
                          "agents": [public_agent(a) for a in STATE["agents"].values()]})
    return {"requirement": req, "affected_node_ids": sorted(affected),
            "stale_proposal_ids": stale_ids, "notified_agents": notified}


@app.get("/agents/status")
async def agents_status(project_id: int = Query(1)):
    check_project(project_id)
    return {"project_id": project_id, "requirement_version": current_version(),
            "agents": [public_agent(a) for a in STATE["agents"].values()]}


@app.post("/agents/{agent_id}/start")
async def start_agent(agent_id: str, body: Optional[StartBody] = None):
    body = body or StartBody()
    check_project(body.project_id)
    require_agent(agent_id)
    agent = await launch_agent(agent_id, body.actor, clean_text(body.task))
    return {"agent": public_agent(agent)}


@app.post("/agents/{agent_id}/kill")
async def kill_agent(agent_id: str, body: Optional[StartBody] = None):
    body = body or StartBody()
    agent = require_agent(agent_id)
    task = TASKS.get(agent_id)
    if task and not task.done():
        task.cancel()
    agent["status"] = "killed"
    agent["current_task"] = None
    await emit("agent_status_changed", f"{agent['name']} was stopped.",
               body.actor, {"agent": public_agent(agent)})
    return {"agent": public_agent(agent)}


@app.post("/agents/{agent_id}/recover")
async def recover_agent(agent_id: str, body: Optional[StartBody] = None):
    body = body or StartBody()
    check_project(body.project_id)
    require_agent(agent_id)
    packet = build_packet(agent_id)  # built from the database BEFORE restarting
    agent = await launch_agent(agent_id, body.actor, None, reason="recovered from shared context")
    await emit("agent_recovered",
               f"{agent['name']} recovered context at requirement v{packet['requirement']['version']} "
               f"({len(packet['changed_since_last_seen'])} changes since last seen, "
               f"{len(packet['stale_proposals_to_revise'])} stale proposals to revise).",
               body.actor, {"agent_id": agent_id, "context_packet": packet})
    return {"agent": public_agent(agent), "context_packet": packet}


@app.get("/proposals")
async def list_proposals(project_id: int = Query(1), status: Optional[str] = None):
    check_project(project_id)
    items = [p for p in STATE["proposals"] if not status or p["status"] == status]
    return {"project_id": project_id, "proposals": list(reversed(items))}


def record_decision(p, actor, action, note):
    COUNTERS["decision"] += 1
    d = {"id": COUNTERS["decision"], "proposal_id": p["id"], "actor": actor,
         "action": action, "note": note, "timestamp": now()}
    STATE["decisions"].append(d)
    return d


def ensure_open(p):
    if p["status"] not in ("pending", "stale"):
        raise HTTPException(409, detail={"code": "already_decided",
                                         "message": f"Proposal {p['id']} is already {p['status']}."})


@app.post("/proposals/{proposal_id}/approve")
async def approve(proposal_id: str, body: DecisionBody = DecisionBody()):
    p = get_proposal(proposal_id)
    ensure_open(p)
    n = stale_node(p)
    if n or p["status"] == "stale":
        if n:
            p["status"] = "stale"
            p["stale_reason"] = stale_reason_for(p, n)
        raise HTTPException(409, detail={
            "code": "proposal_stale",
            "message": "This proposal is based on outdated requirements, so it can't be approved. "
                       "Reject it or redirect the agent to revise it.",
            "stale_reason": p["stale_reason"]})
    p["status"] = "approved"
    record_decision(p, body.actor, "approve", body.note)
    who = user_name(body.actor)
    await emit("proposal_approved", f"{who} approved: {p['title']}", body.actor,
               {"proposal_id": p["id"], "note": body.note})
    if p["type"] == "demo_html":
        art = STATE["artifact"]
        art["version"] += 1
        art["html"] = p["content"]
        art["updated_by_proposal_id"] = p["id"]
        await emit("artifact_updated",
                   f"Prototype updated to version {art['version']} from {p['agent_name']}'s proposal.",
                   body.actor, {"artifact": copy.deepcopy(art)})
    return {"proposal": p, "artifact": STATE["artifact"]}


@app.post("/proposals/{proposal_id}/reject")
async def reject(proposal_id: str, body: DecisionBody = DecisionBody()):
    p = get_proposal(proposal_id)
    ensure_open(p)
    p["status"] = "rejected"
    record_decision(p, body.actor, "reject", body.note)
    await emit("proposal_rejected", f"{user_name(body.actor)} rejected: {p['title']}",
               body.actor, {"proposal_id": p["id"], "note": body.note})
    return {"proposal": p}


@app.post("/proposals/{proposal_id}/redirect")
async def redirect(proposal_id: str, body: RedirectBody):
    p = get_proposal(proposal_id)
    ensure_open(p)
    if not body.instruction.strip():
        raise HTTPException(422, detail={"code": "instruction_required",
                                         "message": "Give the agent a short instruction."})
    p["status"] = "redirected"
    record_decision(p, body.actor, "redirect", body.instruction)
    await emit("proposal_redirected",
               f"{user_name(body.actor)} redirected {p['agent_name']}: \"{body.instruction}\"",
               body.actor, {"proposal_id": p["id"], "instruction": body.instruction})
    agent = await launch_agent(p["agent_id"], body.actor, body.instruction,
                               redirect_of=p["id"], reason="revising after redirect")
    return {"proposal": p, "agent": public_agent(agent)}


@app.post("/reset")
async def reset():
    global STATE
    for t in TASKS.values():
        if not t.done():
            t.cancel()
    TASKS.clear()
    STATE = make_seed()
    COUNTERS.update({"event": 0, "proposal": 0, "decision": 0})
    await hub.broadcast({"type": "state_reset", "project_id": PROJECT_ID,
                         "timestamp": now(), "payload": {}})
    return {"ok": True}


@app.websocket("/ws/projects/{pid}")
async def ws_project(websocket: WebSocket, pid: int):
    if pid != PROJECT_ID:
        await websocket.close(code=4004)
        return
    await hub.connect(websocket)
    await websocket.send_json({
        "type": "connected", "project_id": PROJECT_ID, "timestamp": now(),
        "payload": {"requirement_version": current_version()}})
    try:
        while True:
            await websocket.receive_text()  # keep the connection open
    except WebSocketDisconnect:
        hub.disconnect(websocket)