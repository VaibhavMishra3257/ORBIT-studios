/* Connects the dashboard to the real ORBIT backend.
   Loaded AFTER api.js and app.js. Overrides the simulated functions. */
(function () {
  const API = window.BuildifyAPI;
  if (!API) { console.error("api.js must load before live.js"); return; }

  const PID = 1, FOUNDER = "niharika", DESIGNER = "vaibhav";
  const $ = id => document.getElementById(id);

  let users = [], currentProposal = null, lastPacket = null;
  let shownVersion = 0, refreshTimer = null, offlineNotified = false;

  function nameOf(id) {
    const u = users.find(x => x.id === id);
    if (u) return u.name;
    return { atlas: "Atlas", nova: "Nova", system: "System" }[id] || id;
  }

  function errText(e) {
    const d = e && e.detail;
    if (d && typeof d === "object") {
      return (d.message || "") + (d.stale_reason ? " " + d.stale_reason : "");
    }
    return (e && e.message) || "Something went wrong";
  }

  /* ---------------- rendering ---------------- */

  function dotColor(ev) {
    if (ev.actor === FOUNDER || ev.actor === DESIGNER) return "#6f8daa";
    if (/stale|rejected|stopped/.test(ev.type + ev.summary)) return "#b77a38";
    if (/approved|artifact|recovered|created/.test(ev.type)) return "#44805c";
    return "#8a8790";
  }

  function renderTimeline(events) {
    const tl = $("timeline");
    tl.innerHTML = "";
    events.forEach(ev => {            // oldest first, prepend => newest on top
      const item = document.createElement("div");
      item.className = "event";
      const dot = document.createElement("div");
      dot.className = "event-dot";
      dot.style.background = dotColor(ev);
      const content = document.createElement("div");
      const p = document.createElement("p");
      p.textContent = ev.summary;
      const small = document.createElement("small");
      small.textContent = new Date(ev.timestamp).toLocaleTimeString() + " · " + nameOf(ev.actor);
      content.append(p, small);
      item.append(dot, content);
      tl.prepend(item);
    });
  }

  function renderAgents(agents, proposals) {
    agents.forEach(a => {
      const mine = proposals.filter(p => p.agent_id === a.id);
      const state = a.status === "working" ? "WORKING"
        : a.status === "killed" ? "STOPPED"
        : a.context_outdated ? "STALE" : "READY";
      $(a.id + "WorkState").textContent = state;
      $(a.id + "WorkText").textContent =
        a.current_task ||
        (a.status === "killed" ? "Stopped. Recover it to restore context from the shared project."
          : a.context_outdated ? "Requirement changed since this agent last looked. Context is outdated."
          : mine.length ? "Latest output: " + mine[0].title
          : "Idle. Start the agents to begin.");
      $(a.id + "Status").innerHTML = '<span class="dot"></span> ' +
        (a.status === "working" ? "Working on requirement v" + a.context_version
          : a.status === "killed" ? "Stopped" : "Idle");
      $(a.id + "Progress").style.width =
        a.status === "working" ? "60%" : a.status === "killed" ? "20%" : (mine.length ? "100%" : "0%");
    });
  }

  function renderProposal(proposals, project) {
    const p = proposals.find(x => x.agent_id === "nova") || null;
    currentProposal = p;
    const box = $("proposal");
    const owner = $("decisionOwner");
    if (!p) {
      box.className = "proposal";
      $("proposalTitle").textContent = "Waiting for Nova";
      $("proposalTag").textContent = "NO PROPOSAL YET";
      $("proposalText").textContent = "Start the agents. Nova will submit a prototype proposal for human review.";
      $("approveBtn").disabled = true;
      $("decisionText").textContent = "No proposal yet. Nothing changes in the shared prototype until a human approves.";
      owner.textContent = "HUMAN CONTROL";
      return;
    }
    $("proposalTitle").textContent = "Nova · " + p.title;
    if (p.status === "pending") {
      box.className = "proposal";
      $("proposalTag").textContent = "AWAITING HUMAN REVIEW";
      $("proposalText").textContent = p.rationale + (p.instruction ? " Direction: " + p.instruction : "");
      $("approveBtn").disabled = false;
      $("decisionText").textContent = "Nova built this on requirement v" + p.based_on_version +
        ". Approve to publish it, reject to discard it, or redirect with one sentence.";
      owner.textContent = "HUMAN CONTROL · " + nameOf(FOUNDER).toUpperCase();
    } else if (p.status === "stale") {
      box.className = "proposal stale";
      $("proposalTag").textContent = "STALE CONTRIBUTION";
      $("proposalText").textContent = p.stale_reason || "Built on an outdated requirement.";
      $("approveBtn").disabled = true;
      $("decisionText").textContent = "The system blocked this proposal because the requirement changed (now v" +
        project.requirement.version + "). Reject it, redirect Nova, or recover context.";
      owner.textContent = "BLOCKED BY SYSTEM";
    } else if (p.status === "approved") {
      box.className = "proposal approved";
      $("proposalTag").textContent = "APPROVED BY HUMAN";
      $("proposalText").textContent = "Approved and published to the shared prototype.";
      $("approveBtn").disabled = true;
      $("decisionText").textContent = "The shared prototype now reflects this approved proposal.";
      owner.textContent = "APPROVED";
    } else if (p.status === "rejected") {
      box.className = "proposal rejected";
      $("proposalTag").textContent = "REJECTED BY HUMAN";
      $("proposalText").textContent = "Rejected. The shared prototype is unchanged.";
      $("approveBtn").disabled = true;
      $("decisionText").textContent = "No changes were published. Start Nova again or give new direction.";
      owner.textContent = "REJECTED";
    } else {
      box.className = "proposal";
      $("proposalTag").textContent = "REDIRECTED";
      $("proposalText").textContent = "Redirected: " + (p.instruction || "") + ". Nova is preparing a revision.";
      $("approveBtn").disabled = true;
      owner.textContent = "REDIRECTED";
    }
  }

  function renderArtifact(art, decisions) {
    const host = $("preview");
    let frame = $("liveFrame");
    if (art.version > 0) {
      if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "liveFrame";
        frame.setAttribute("sandbox", "");
        frame.style.cssText = "width:100%;height:420px;border:0;border-radius:12px;background:#fff";
        Array.from(host.children).forEach(c => (c.style.display = "none"));
        host.appendChild(frame);
      }
      if (frame.dataset.v !== String(art.version)) {
        frame.srcdoc = art.html;
        frame.dataset.v = String(art.version);
      }
      host.classList.add("updated");
    } else if (frame) {
      frame.remove();
      Array.from(host.children).forEach(c => (c.style.display = ""));
      host.classList.remove("updated");
    }
    $("prototypeVersion").textContent = "VERSION " + art.version + ".0";
    $("prototypeState").textContent = art.version > 0 ? "● Approved and published" : "● Awaiting approved update";
    $("projectStatus").textContent = art.version > 0 ? "● Updated prototype" : "● In progress";
    const lastApproval = decisions.filter(d => d.action === "approve").pop();
    $("lastEditor").textContent = lastApproval ? nameOf(lastApproval.actor) + " + Nova" : "Nova";

    if (art.version < shownVersion) { $("versions").innerHTML = ""; shownVersion = 0; }
    while (shownVersion < art.version) {
      shownVersion++;
      addVersion("Version " + shownVersion + ".0", "Approved by a human · from Nova's proposal");
    }
  }

  function renderContext(project) {
    $("requirementText").textContent = project.requirement.text;
    $("version").textContent = project.requirement.version;
    $("contextVersion").textContent = "V" + project.requirement.version;
    let html =
      "<strong>PROJECT:</strong> " + escapeHTML(project.name) + "<br>" +
      "<strong>GOAL:</strong> " + escapeHTML(project.goal) + "<br>" +
      "<strong>VERSION:</strong> " + project.requirement.version + "<br>" +
      "<strong>REQUIREMENT:</strong> " + escapeHTML(project.requirement.text);
    if (lastPacket) {
      html += "<br><strong>RECOVERED:</strong> context packet at v" + lastPacket.requirement.version +
        " (" + lastPacket.changed_since_last_seen.length + " changes while stopped)";
      $("contextDetails").style.background = "#e8f1e9";
    } else {
      $("contextDetails").style.background = "";
    }
    $("contextDetails").innerHTML = html;
  }

  async function refresh() {
    try {
      const [project, ag, pr] = await Promise.all([
        API.get("/projects/" + PID),
        API.get("/agents/status?project_id=" + PID),
        API.get("/proposals?project_id=" + PID)
      ]);
      offlineNotified = false;
      users = project.users;
      renderContext(project);
      renderAgents(ag.agents, pr.proposals);
      renderProposal(pr.proposals, project);
      renderArtifact(project.artifact, project.decisions);
      renderTimeline(project.events);
    } catch (e) {
      console.error(e);
      if (!offlineNotified) {
        offlineNotified = true;
        notify("Cannot reach the backend at " + API.baseUrl + ". Is uvicorn running?");
      }
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 150);
  }

  /* ---------------- actions (override the simulated ones) ---------------- */

  window.startAgents = async function () {
    try {
      await Promise.all(["atlas", "nova"].map(id =>
        API.post("/agents/" + id + "/start", { actor: FOUNDER })));
      notify("Atlas and Nova are working in parallel.");
      scheduleRefresh();
    } catch (e) { notify(errText(e)); }
  };

  window.openRequirement = function () {
    $("requirementModal").classList.add("open");
    $("requirementInput").value = "Fast and trusted";
  };

  window.changeRequirement = async function () {
    const text = $("requirementInput").value.trim();
    if (!text) { notify("Please enter a requirement."); return; }
    try {
      const r = await API.put("/projects/" + PID + "/requirement",
        { text: text, actor: FOUNDER, node_id: "r2" });
      lastPacket = null;
      closeRequirement();
      notify("Requirement is now v" + r.requirement.version + ". " +
        r.stale_proposal_ids.length + " proposal(s) marked outdated.");
      scheduleRefresh();
    } catch (e) { notify(errText(e)); }
  };

  window.recoverContext = async function () {
    try {
      const ag = await API.get("/agents/status?project_id=" + PID);
      const nova = ag.agents.find(a => a.id === "nova");
      if (nova.status !== "killed") {
        await API.post("/agents/nova/kill", { actor: DESIGNER });   // simulate a crash
      }
      const r = await API.post("/agents/nova/recover", { actor: DESIGNER });
      lastPacket = r.context_packet;
      notify("Nova recovered context at requirement v" + r.context_packet.requirement.version + ".");
      scheduleRefresh();
    } catch (e) { notify(errText(e)); }
  };

  window.approveProposal = async function () {
    if (!currentProposal) { notify("No proposal to approve yet."); return; }
    try {
      await API.post("/proposals/" + currentProposal.id + "/approve", { actor: FOUNDER });
      notify("Approved! Shared prototype updated.");
      scheduleRefresh();
    } catch (e) { notify(errText(e)); scheduleRefresh(); }
  };

  window.rejectProposal = async function () {
    if (!currentProposal) { notify("No proposal to reject yet."); return; }
    try {
      await API.post("/proposals/" + currentProposal.id + "/reject", { actor: FOUNDER });
      notify("Proposal rejected. Prototype unchanged.");
      scheduleRefresh();
    } catch (e) { notify(errText(e)); scheduleRefresh(); }
  };

  window.redirectProposal = async function () {
    if (!currentProposal) { notify("No proposal to redirect yet."); return; }
    const direction = prompt("What should Nova change?\n\nExample: Emphasize trust badges and keep the tone warm.");
    if (!direction || !direction.trim()) return;
    try {
      await API.post("/proposals/" + currentProposal.id + "/redirect",
        { actor: DESIGNER, instruction: direction.trim() });
      notify("Nova is revising its proposal.");
      scheduleRefresh();
    } catch (e) { notify(errText(e)); scheduleRefresh(); }
  };

  /* ---------------- live updates ---------------- */

  const TOAST_TYPES = ["proposal_created", "proposal_stale", "artifact_updated", "agent_recovered"];
  API.connectProjectSocket(PID, msg => {
    if (msg.type === "connected") return;
    if (msg.type === "state_reset") lastPacket = null;
    if (msg.summary && TOAST_TYPES.includes(msg.type)) notify(msg.summary);
    scheduleRefresh();
  }, status => console.log("ORBIT socket:", status));

  refresh();
  setInterval(refresh, 4000);   // safety net if the socket drops
})();