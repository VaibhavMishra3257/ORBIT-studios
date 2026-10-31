const API = (window.BUILDIFY_CONFIG && window.BUILDIFY_CONFIG.API_BASE_URL) || "http://127.0.0.1:8000";
const PID = (window.BUILDIFY_CONFIG && window.BUILDIFY_CONFIG.PROJECT_ID) || 1;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* =================== SKY / WARP / SMOKE =================== */
const cv = $("#sky"), ctx = cv.getContext("2d");
let W, H, cx, cy, mx = 0, my = 0;
function resize(){ W = cv.width = innerWidth; H = cv.height = innerHeight; cx = W/2; cy = H/2; }
addEventListener("resize", resize); resize();
let mpx = -1e3, mpy = -1e3, trail = [];
addEventListener("mousemove", e => {
  mx = (e.clientX/W - .5); my = (e.clientY/H - .5); mpx = e.clientX; mpy = e.clientY;
  if(typeof phase !== "undefined" && phase==="idle") trail.push({x:mpx, y:mpy, l:0});
});

const N = 900, DEPTH = 1400;
const stars = Array.from({length:N}, () => newStar(true));
function newStar(init){
  const a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random())*1400 + 30;
  return {x:Math.cos(a)*r, y:Math.sin(a)*r, z: init ? Math.random()*DEPTH+1 : DEPTH, px:null, py:null, h:200+Math.random()*60};
}
/* constellation links between nearby bright stars */
const bright = stars.filter((_,i)=>i%9===0);
let rot = 0, speed = 0.6, phase = "idle", phaseT = 0, dashShown = false;

/* smoke sprite */
const sprite = document.createElement("canvas"); sprite.width = sprite.height = 128;
(function(){ const g = sprite.getContext("2d"), gr = g.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,"rgba(190,200,255,.55)"); gr.addColorStop(.5,"rgba(120,135,220,.22)"); gr.addColorStop(1,"rgba(60,70,140,0)");
  g.fillStyle = gr; g.fillRect(0,0,128,128); })();
let puffs = [];
function spawnPuffs(n){
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2, v = 1.5+Math.random()*5;
    puffs.push({x:cx+(Math.random()-.5)*40, y:cy+(Math.random()-.5)*40, vx:Math.cos(a)*v, vy:Math.sin(a)*v,
      r:40+Math.random()*60, g:2+Math.random()*4, life:0, max:110+Math.random()*80, rot:Math.random()*6, vr:(Math.random()-.5)*.02});
  }
}

/* ---------- planets ---------- */
const rgba = (h,a) => { const n = parseInt(h.slice(1),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; };
const PLANETS = [
 {id:"req",    name:"Requirement", tag:"Source of truth",   info:"One living requirement. Change it and every dependent node and agent is notified instantly.", r:20, orb:150, tilt:.45, sp:.0021, a:.4,  c1:"#ffd9a0", c2:"#b45309", bands:true, moons:1, ping:"#reqText", view:"ripple"},
 {id:"nova",   name:"Nova",        tag:"Design agent",      info:"Turns the requirement into live HTML demos, and rebuilds the moment the requirement changes.", r:30, orb:215, tilt:.40, sp:.0014, a:2.0, c1:"#ff9d5c", c2:"#9a2c0b", bands:true, moons:2, ping:"#agents", view:"nova"},
 {id:"atlas",  name:"Atlas",       tag:"Research agent",    info:"Works in parallel with Nova. Gathers evidence and proposes options for humans to judge.", r:26, orb:285, tilt:.38, sp:.0011, a:4.2, c1:"#9db8ff", c2:"#1e3a8a", ring:true, moons:1, ping:"#agents", view:"atlas"},
 {id:"prop",   name:"Proposals",   tag:"Humans decide",     info:"Agents only propose. Nothing ships until a human approves or redirects it.", r:22, orb:345, tilt:.36, sp:.0009, a:1.1, c1:"#7ff0b8", c2:"#065f46", bands:true, ping:"#props", view:"steer"},
 {id:"stale",  name:"Stale Guard", tag:"Outdated work blocked", info:"If the requirement moved on, old proposals are marked stale and approval is blocked with a plain-English reason.", r:17, orb:400, tilt:.34, sp:.0008, a:3.3, c1:"#ffe08a", c2:"#a16207", ping:"#nodes", view:"diff"},
 {id:"recover",name:"Recovery",    tag:"Kill & resume",     info:"Kill an agent mid-flight. It comes back with a context packet of everything that changed while it was down.", r:24, orb:455, tilt:.32, sp:.00065,a:5.4, c1:"#d0a3ff", c2:"#581c87", ring:true, ping:"#agents", view:"xray"},
 {id:"human",  name:"Humans",      tag:"Niharika & Vaibhav",info:"Two people steering. Every action is attributed, so the timeline shows who changed what.", r:19, orb:510, tilt:.30, sp:.0005, a:0,   c1:"#ff9ccf", c2:"#9d174d", moons:1, ping:"#actor", view:"humans"},
 {id:"time",   name:"Timeline",    tag:"Full audit trail",  info:"Every requirement change, stale proposal, recovery and approval, in order, in plain English.", r:28, orb:570, tilt:.28, sp:.0004, a:2.7, c1:"#7be3e3", c2:"#115e59", bands:true, moons:1, ping:"#events", view:"timeline"}
];
PLANETS.forEach(p => { p.hov = 0; p.d = 0; });
let hoverP = null, diveP = null, pingSel = null, shooters = [], tipFor = null;
const tip = $("#tip");

function drawPlanet(p, t){
  const r = p.sz*(1 + .38*p.hov), x = p.x, y = p.y;
  ctx.save(); ctx.globalAlpha = p.al;
  let g = ctx.createRadialGradient(x,y,r*.6,x,y,r*(2.2+p.hov*1.6));
  g.addColorStop(0, rgba(p.c1,.16+.5*p.hov)); g.addColorStop(1, rgba(p.c1,0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x,y,r*(2.2+p.hov*1.6),0,Math.PI*2); ctx.fill();

  const ring = front => {
    ctx.save(); ctx.translate(x,y); ctx.rotate(-.35);
    const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : Math.PI*2;
    ctx.strokeStyle = rgba(p.c1,.8); ctx.lineWidth = Math.max(1.5, r*.12);
    ctx.beginPath(); ctx.ellipse(0,0,r*1.9,r*.55,0,a0,a1); ctx.stroke();
    ctx.strokeStyle = rgba(p.c1,.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0,0,r*2.25,r*.65,0,a0,a1); ctx.stroke();
    ctx.restore();
  };
  if(p.ring) ring(false);

  const dx = cx-x, dy = cy-y, dl = Math.hypot(dx,dy) || 1, gx = x+dx/dl*r*.45, gy = y+dy/dl*r*.45;
  g = ctx.createRadialGradient(gx,gy,r*.1,x,y,r);
  g.addColorStop(0,"rgba(255,255,255,.9)"); g.addColorStop(.25,p.c1); g.addColorStop(.75,p.c2); g.addColorStop(1,"#05060f");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.clip();
  if(p.bands){
    ctx.save(); ctx.translate(x,y); ctx.rotate(-.25);
    for(let i=-3;i<=3;i++){ ctx.fillStyle = rgba(p.c2, .3 + .1*Math.sin(i*2+p.id.length)); ctx.fillRect(-r, i*r*.28 + Math.sin(t*(.6+p.hov*3)+i)*r*.04, r*2, r*.12); }
    ctx.restore();
  }
  const sh = ctx.createRadialGradient(gx,gy,r*.3,x,y,r*1.05);
  sh.addColorStop(0,"rgba(0,0,0,0)"); sh.addColorStop(1,"rgba(0,0,0,.6)");
  ctx.fillStyle = sh; ctx.fillRect(x-r,y-r,r*2,r*2);
  ctx.restore();

  if(p.ring) ring(true);

  for(let i=0;i<(p.moons||0);i++){
    const ma = t*(1+i*.7)*(1+p.hov*3) + i*2.1 + p.id.length, mr = r*(1.7+i*.55);
    const mxp = x + Math.cos(ma)*mr*(p.ring?1.3:1), myp = y + Math.sin(ma)*mr*.45, ms = Math.max(2, r*.16);
    ctx.fillStyle = "#e6ebff"; ctx.shadowColor = "#aab8ff"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(mxp,myp,ms,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
  }

  if(p.hov > .03){
    ctx.strokeStyle = rgba(p.c1, p.hov*.7); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x,y,r*1.28 + Math.sin(t*5)*3*p.hov, 0, Math.PI*2); ctx.stroke();
  }
  if(phase==="idle"){
    ctx.font = "12px 'Segoe UI',sans-serif"; ctx.textAlign = "center"; ctx.letterSpacing = "3px";
    ctx.fillStyle = `rgba(220,228,255,${.4+.6*p.hov})`;
    ctx.fillText(p.name.toUpperCase(), x, y + r + (p.ring ? r*.7 : 0) + 20);
  }
  ctx.restore();
}

function drawPlanets(ox, oy){
  const S = Math.min(W/1500, H/760), t = performance.now()/1000, warp = phase==="warp";
  for(const p of PLANETS){
    const slow = hoverP ? (p===hoverP ? .05 : .5) : 1;
    p.a += p.sp * (warp ? 1 : slow);
    const rx = p.orb*S*1.25, ry = rx*p.tilt;
    p.d = Math.sin(p.a);
    let x = cx + ox + Math.cos(p.a)*rx - mx*40*p.d, y = cy + oy + Math.sin(p.a)*ry - my*25*p.d;
    let size = p.r*S*(.8 + .3*p.d), alpha = 1;
    if(warp){
      if(p===diveP){ x += (cx-x)*phaseT; y += (cy-y)*phaseT; size *= 1 + phaseT*phaseT*28; alpha = phaseT<.75 ? 1 : Math.max(0, 1-(phaseT-.75)*4); }
      else { const k = 1 + phaseT*phaseT*10; x = cx+(x-cx)*k; y = cy+(y-cy)*k; alpha = Math.max(0, 1-phaseT*1.7); }
    }
    p.x = x; p.y = y; p.sz = size; p.al = alpha;
  }
  if(phase==="idle"){
    hoverP = null;
    for(const p of [...PLANETS].sort((a,b)=>b.d-a.d)){ if(Math.hypot(mpx-p.x, mpy-p.y) < p.sz*1.35+6){ hoverP = p; break; } }
    cv.style.cursor = hoverP ? "pointer" : "default";
  } else hoverP = null;
  for(const p of PLANETS) p.hov += ((p===hoverP ? 1 : 0) - p.hov) * .14;

  if(phase==="idle"){
    for(const p of PLANETS){
      ctx.strokeStyle = rgba(p.c1, .05 + .5*p.hov); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx+ox, cy+oy, p.orb*S*1.25, p.orb*S*1.25*p.tilt, 0, 0, Math.PI*2); ctx.stroke();
    }
  }
  for(const p of [...PLANETS].sort((a,b)=>a.d-b.d)) if(p.al > .01) drawPlanet(p, t);

  /* tooltip */
  if(hoverP){
    if(tipFor !== hoverP){
      tipFor = hoverP;
      tip.innerHTML = `<b>${hoverP.name}</b><small style="color:${hoverP.c1}">${hoverP.tag}</small><p>${hoverP.info}</p><em>click to dive in &rarr;</em>`;
      tip.style.borderColor = rgba(hoverP.c1,.6);
    }
    const r = hoverP.sz*1.4;
    let left = hoverP.x + r + 18; if(left + 280 > W) left = hoverP.x - r - 18 - 270;
    tip.style.left = Math.max(10,left)+"px"; tip.style.top = Math.min(H-190, Math.max(10, hoverP.y-60))+"px";
    tip.classList.add("show");
    if(Math.random() < .5){ const a = Math.random()*Math.PI*2; trail.push({x:hoverP.x+Math.cos(a)*r, y:hoverP.y+Math.sin(a)*r, l:0}); }
  } else { tip.classList.remove("show"); tipFor = null; }
}

function drawFX(){
  if(Math.random() < .008) shooters.push({x:Math.random()*W, y:Math.random()*H*.4, vx:8+Math.random()*8, vy:3+Math.random()*4, l:0});
  ctx.lineWidth = 1.5;
  for(const s of shooters){ s.x += s.vx; s.y += s.vy; s.l++;
    ctx.strokeStyle = `rgba(200,215,255,${Math.max(1-s.l/50,0)})`;
    ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(s.x-s.vx*6, s.y-s.vy*6); ctx.stroke(); }
  shooters = shooters.filter(s => s.l < 50);
  for(const p of trail){ p.l++; ctx.fillStyle = `rgba(160,185,255,${Math.max(0,.5-p.l/30)})`;
    ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(.4,3*(1-p.l/30)),0,Math.PI*2); ctx.fill(); }
  trail = trail.filter(p => p.l < 30);
}

function pingEl(sel){
  const el = sel && document.querySelector(sel)?.closest(".card,header"); if(!el) return;
  el.classList.add("ping"); setTimeout(()=>el.classList.remove("ping"), 3200);
}

function frame(){
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = phase==="warp" ? "rgba(4,5,13,.28)" : "rgba(4,5,13,.55)";
  ctx.fillRect(0,0,W,H);

  const ox = phase==="idle" ? -mx*60 : 0, oy = phase==="idle" ? -my*40 : 0;
  rot += phase==="dash" ? .0002 : phase==="idle" ? .0005 : .0015;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const f = 420;

  /* dome rings + core portal (idle & warp start) */
  if(phase==="idle" || phase==="warp"){
    const k = phase==="warp" ? 1 + phaseT*phaseT*14 : 1;
    ctx.save(); ctx.translate(cx+ox, cy+oy);
    for(let i=1;i<=7;i++){
      const r = (i*i*14 + 30)*k, a = (.22 - i*.02) / (phase==="warp"?1+phaseT*3:1);
      ctx.strokeStyle = `rgba(130,155,255,${Math.max(a,0)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0,0,r,r*.42,rot*2*(i%2?1:-1),0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0,0,r*.42,r,rot*(i%2?-1:1),0,Math.PI*2); ctx.stroke();
    }
    const pr = (90 + Math.sin(performance.now()/500)*10)*k;
    const g = ctx.createRadialGradient(0,0,0,0,0,pr);
    g.addColorStop(0,"rgba(255,255,255,.95)"); g.addColorStop(.2,"rgba(160,185,255,.6)"); g.addColorStop(.6,"rgba(90,110,220,.18)"); g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,pr,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  /* stars */
  for(const s of stars){
    s.z -= speed;
    if(s.z < 1){ Object.assign(s, newStar(false)); s.px = null; }
    const rx = s.x*cs - s.y*sn, ry = s.x*sn + s.y*cs;
    const sx = cx + ox + rx/s.z*f, sy = cy + oy + ry/s.z*f;
    if(sx<-50||sx>W+50||sy<-50||sy>H+50){ if(speed>5){ Object.assign(s,newStar(false)); } s.px=null; continue; }
    const size = Math.max(.4, (1 - s.z/DEPTH)*2.4), al = Math.min(1,(1 - s.z/DEPTH)*1.4+.15);
    ctx.strokeStyle = `hsla(${s.h},80%,${75+ (1-s.z/DEPTH)*20}%,${al})`;
    ctx.lineWidth = size;
    if(s.px!==null && speed>3){ ctx.beginPath(); ctx.moveTo(s.px,s.py); ctx.lineTo(sx,sy); ctx.stroke(); }
    else { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(sx,sy,size*.7,0,Math.PI*2); ctx.fill(); }
    s.px = sx; s.py = sy;
  }

  /* constellation lines (idle only) */
  if(phase==="idle"){
    ctx.strokeStyle = "rgba(140,165,255,.12)"; ctx.lineWidth = 1; ctx.beginPath();
    for(let i=0;i<bright.length;i++){ const a = bright[i]; if(a.px==null) continue;
      for(let j=i+1;j<bright.length;j++){ const b = bright[j]; if(b.px==null) continue;
        if(Math.hypot(a.px-b.px,a.py-b.py) < 120){ ctx.moveTo(a.px,a.py); ctx.lineTo(b.px,b.py); } } }
    ctx.stroke();
  }

  if(phase==="idle" || phase==="warp") drawPlanets(ox, oy);
  if(phase==="idle") drawFX();

  /* phase machine */
  if(phase==="warp"){
    phaseT += 1/150; speed = 0.6 + Math.pow(phaseT,2.2)*60;
    if(phaseT > .55 && puffs.length < 160) spawnPuffs(7);
    if(phaseT >= 1){ phase = "smoke"; phaseT = 0; }
  } else if(phase==="smoke"){
    phaseT += 1/110; speed = Math.max(1.2, speed*.94);
    if(puffs.length < 220) spawnPuffs(4);
    if(phaseT > .35 && !dashShown){
      dashShown = true; $("#dash").classList.add("on");
      if(diveP){ const d = diveP; setTimeout(()=>{ pingEl(pingSel); toast(`${d.name}: ${d.tag}`); }, 1400); }
    }
    if(phaseT >= 1){ phase = "dash"; speed = .35; }
  } else if(phase==="dash"){
    speed = .35;
  }

  /* smoke */
  if(puffs.length){
    for(const p of puffs){
      p.life++; p.x += p.vx; p.y += p.vy; p.vx *= .985; p.vy *= .985; p.r += p.g; p.rot += p.vr;
      const t = p.life/p.max;
      let a = t<.25 ? t/.25 : 1-(t-.25)/.75;
      if(phase==="dash") a *= .5;
      ctx.globalAlpha = Math.max(0,a) * .75;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.drawImage(sprite,-p.r,-p.r,p.r*2,p.r*2); ctx.restore();
    }
    ctx.globalAlpha = 1;
    puffs = puffs.filter(p => p.life < p.max);
  }
  requestAnimationFrame(frame);
}
ctx.fillStyle = "#04050d"; ctx.fillRect(0,0,W,H);
frame();

function startWarp(p){
  if(phase!=="idle") return;
  diveP = p || null; pingSel = p ? p.ping : null;
  phase = "warp"; phaseT = 0;
  tip.classList.remove("show"); cv.style.cursor = "default";
  $("#intro").style.opacity = 0; $("#hint").style.opacity = 0;
  setTimeout(()=>$("#intro").style.display="none", 900);
  pendingScene = p ? p.view : "overview";
  setView(pendingScene);
}
$("#enter").onclick = () => startWarp(null);
cv.addEventListener("click", () => { if(phase==="idle" && hoverP) startWarp(hoverP); });

let pendingScene = null, sceneOn = false;
function hideScene(){}

/* ---------- back to the beginning ---------- */
function goHome(){
  if(phase!=="dash") return;
  hideScene(); pendingScene = null;
  $("#dash").classList.remove("on");
  puffs = []; diveP = null; pingSel = null; dashShown = false; speed = .6; phaseT = 0;
  const it = $("#intro"); it.style.display = "flex"; it.style.opacity = 0;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ it.style.opacity = 1; $("#hint").style.opacity = 1; }));
  phase = "idle"; setView("overview");
}
$("#home").onclick = goHome;
addEventListener("keydown", e => { if(e.key==="Escape" && !sceneOn) goHome(); });

/* ---------- view switcher ---------- */
function setView(name){
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("act", v.id === "view-"+name));
  document.querySelectorAll(".vbtn").forEach(b => b.classList.toggle("act", b.dataset.view === name));
  RENDER[name]?.();
}
$("#viewNav").addEventListener("click", e => {
  const b = e.target.closest(".vbtn"); if(!b) return;
  setView(b.dataset.view);
});

/* card tilt */
document.addEventListener("mousemove", e => {
  document.querySelectorAll(".card").forEach(c => {
    const r = c.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){ c.style.transform=""; return; }
    const x = (e.clientX-r.left)/r.width-.5, y = (e.clientY-r.top)/r.height-.5;
    c.style.transform = `perspective(900px) rotateY(${x*4}deg) rotateX(${-y*4}deg)`;
  });
});

/* =================== API / DASHBOARD =================== */
const api = (...args) => window.orbitApi(...args);


function render(){
  const pj = state.proj; if(!pj) return;
  const req = pj.requirement || {};
  const rtext = typeof req==="string" ? req : (req.text ?? "");
  const rver = req.version ?? "–";
  $("#reqText").textContent = rtext || "–";
  $("#reqVer").textContent = "requirement v"+rver;

  const nodes = Array.isArray(pj.nodes) ? pj.nodes : [];
  if(changed("nodes", nodes)){
    $("#nodes").innerHTML = nodes.length ? nodes.map(n =>
      `<div class="node ${n.affected||n.status==="affected"?"aff":""}"><code>${esc(n.id)}</code><span>${esc(n.label||n.text||n.title||n.name||"")}</span></div>`).join("")
      : '<div class="empty">no nodes in /projects response</div>';
    const ids = nodes.length ? nodes.map(n=>n.id) : ["r1","r2","r3","r4","r5"];
    const cur = $("#nodeSel").value;
    $("#nodeSel").innerHTML = ids.map(i=>`<option>${esc(i)}</option>`).join("");
    if(cur && ids.includes(cur)) $("#nodeSel").value = cur;
  }

  if(changed("agents", state.agents)){
    $("#agents").innerHTML = state.agents.map(g => {
      const st = g.status || "idle", c = COLORS[g.id] || "#9aa";
      return `<div class="agent"><div class="orb ${st}" style="--c:${c}"><u></u><i></i><s></s></div>
        <div class="meta"><b>${esc(g.name||g.id)}</b><span class="st ${st}">${esc(st)}</span>
        <small>${g.context_outdated?"⚠ context outdated":"context in sync"}</small></div>
        <div class="btns">
          <button class="b ok" data-a="start" data-id="${esc(g.id)}">Start</button>
          ${st==="killed"?`<button class="b hot" data-a="recover" data-id="${esc(g.id)}">Recover</button>`:`<button class="b bad" data-a="kill" data-id="${esc(g.id)}">Kill</button>`}
        </div></div>`; }).join("") || '<div class="empty">no agents</div>';
  }

  const props = [...state.props].reverse();
  if(changed("props", props.map(p=>[p.id,p.status,p.stale_reason,p.title]))){
    $("#props").innerHTML = props.map(p => `
      <div class="prop ${p.status} ${sel===p.id?"sel":""}" data-pid="${esc(p.id)}">
        <div class="top"><b>${esc(p.title)}</b><span class="tag ${p.status}">${esc(p.status)}</span></div>
        <p>${esc(p.agent_name||p.agent_id)} · built on v${esc(p.based_on_version)}${p.redirect_of?" · revision of "+esc(p.redirect_of):""}</p>
        <p>${esc(p.rationale||"")}</p>
        ${p.stale_reason?`<p class="why">⚠ ${esc(p.stale_reason)}</p>`:""}
        <div class="row">
          <button class="b ok" data-a="approve" data-pid="${esc(p.id)}" ${p.status==="approved"?"disabled":""}>Approve</button>
          <button class="b hot" data-a="redirect" data-pid="${esc(p.id)}" ${p.status==="approved"?"disabled":""}>Redirect</button>
        </div></div>`).join("") || '<div class="empty">No proposals yet. Start an agent.</div>';
  }

  const evs = (pj.events || []).slice(-30).reverse();
  if(changed("events", evs)){
    $("#events").innerHTML = evs.map(e => `<div class="ev"><span class="dot ${esc(e.type)}"></span>
      <div><b>${esc((e.type||"").replace(/_/g," "))}</b><small>${esc(e.message||e.text||e.detail||e.actor||"")}</small></div></div>`).join("")
      || '<div class="empty">no events</div>';
  }
  updateFrame();
  updateStory(pj, nodes);

  const active = document.querySelector(".view.act")?.id.replace("view-","");
  RENDER[active]?.();
}

/* =================== STORY MODE DIGEST =================== */
let lastStoryKey = null;
function updateStory(pj, nodes){
  const req = pj.requirement || {}, rtext = typeof req==="string" ? req : (req.text ?? ""), rver = req.version ?? "–";
  const aff = nodes.filter(n => n.affected || n.status==="affected");
  const stalePr = state.props.filter(p => p.status==="stale");
  const pending = state.props.filter(p => p.status==="pending");
  const approvedLast = [...state.props].reverse().find(p => p.status==="approved");
  const key = JSON.stringify([rver, aff.length, stalePr.length, pending.length, approvedLast?.id]);
  if(key === lastStoryKey) return; lastStoryKey = key;

  const bits = [];
  bits.push(`Requirement is at v${esc(rver)}${rtext?` — "${esc(rtext)}"`:""}.`);
  if(aff.length) bits.push(`${aff.length} node${aff.length>1?"s are":" is"} now outdated and waiting on updated work.`);
  if(stalePr.length) bits.push(`${stalePr.length} proposal${stalePr.length>1?"s are":" is"} stale and blocked from approval.`);
  if(pending.length) bits.push(`${pending.length} proposal${pending.length>1?"s are":" is"} waiting on a human decision.`);
  if(approvedLast) bits.push(`Last approved: "${esc(approvedLast.title)}" by ${esc(approvedLast.agent_name||approvedLast.agent_id)}.`);
  $("#storyText").textContent = bits.join(" ") || "All quiet — nothing outdated, nothing waiting.";
}

/* =================== RIPPLE GRAPH =================== */
let rEdges = [], rLabel = {};
const rDown = id => { const seen = new Set([id]), q = [id]; while(q.length){ const c = q.shift(); rEdges.forEach(e => { if(e[0]===c && !seen.has(e[1])){ seen.add(e[1]); q.push(e[1]); } }); } seen.delete(id); return seen; };
function rippleFocus(id){
  const svg = $("#rippleSvg"), box = $("#rippleReason");
  svg.classList.toggle("focus", !!id);
  svg.querySelectorAll(".rnode").forEach(n => n.classList.remove("hi","src"));
  svg.querySelectorAll(".redge").forEach(n => n.classList.remove("hi"));
  if(!id){ box.textContent = box.dataset.base || ""; return; }
  const down = rDown(id);
  svg.querySelectorAll(".rnode").forEach(n => { if(n.dataset.id===id) n.classList.add("src"); else if(down.has(n.dataset.id)) n.classList.add("hi"); });
  svg.querySelectorAll(".redge").forEach(n => { if(n.dataset.from===id || (down.has(n.dataset.from)&&down.has(n.dataset.to))) n.classList.add("hi"); });
  box.textContent = down.size ? `If "${rLabel[id]}" changes, ${[...down].map(d=>`"${rLabel[d]}"`).join(", ")} would need updating. Click to play the ripple.`
                              : `"${rLabel[id]}" is a leaf: nothing depends on it. Click to see.`;
}
function rippleSim(id){
  const svg = $("#rippleSvg"); clearTimeout(rippleSim.t);
  svg.querySelectorAll(".sim").forEach(n => n.classList.remove("sim"));
  let level = [id], seen = new Set(level), step = 0;
  const go = () => {
    level.forEach(c => { svg.querySelector(`.rnode[data-id="${c}"]`)?.classList.add("sim"); svg.querySelectorAll(`.redge[data-to="${c}"]`).forEach(e => e.classList.add("sim")); });
    const next = []; level.forEach(c => rEdges.forEach(e => { if(e[0]===c && !seen.has(e[1])){ seen.add(e[1]); next.push(e[1]); } }));
    if(next.length){ level = next; step++; rippleSim.t = setTimeout(go, 600); }
    else rippleSim.t = setTimeout(()=>svg.querySelectorAll(".sim").forEach(n=>n.classList.remove("sim")), 2600);
  };
  go();
}
function renderRipple(){
  const pj = state.proj; const svg = $("#rippleSvg"); if(!pj || !svg) return;
  const nodes = Array.isArray(pj.nodes) && pj.nodes.length ? pj.nodes : ["r1","r2","r3","r4","r5"].map(id => ({id, label:id}));
  const cx2 = 450, cy2 = 230, R = 170, n = nodes.length, pos = {};
  nodes.forEach((nd,i) => { const a = -Math.PI/2 + i*(2*Math.PI/n); pos[nd.id] = {x:cx2+Math.cos(a)*R*1.35, y:cy2+Math.sin(a)*R}; rLabel[nd.id] = nd.label||nd.text||nd.title||nd.name||nd.id; });
  const affIds = new Set(nodes.filter(nd => nd.affected || nd.status==="affected").map(nd=>nd.id));
  rEdges = [];
  nodes.forEach((a,i) => { const ds = Array.isArray(a.deps)&&a.deps.length ? a.deps : (i<n-1?[nodes[i+1].id]:[]); ds.forEach(d => { if(pos[d]) rEdges.push([a.id,d]); }); });
  let html = "";
  rEdges.forEach(([f,t]) => { const p1=pos[f], p2=pos[t], pulse = affIds.has(f)&&affIds.has(t);
    html += `<path class="redge${pulse?" pulse":""}" data-from="${esc(f)}" data-to="${esc(t)}" d="M${p1.x},${p1.y} L${p2.x},${p2.y}"/>`; });
  nodes.forEach(nd => { const p = pos[nd.id], aff = affIds.has(nd.id);
    html += `<g class="rnode${aff?" aff":""}" data-id="${esc(nd.id)}" transform="translate(${p.x},${p.y})"><circle r="38"/><text dy="-48" font-size="13">${esc(nd.id)}</text>
      <text dy="5" font-size="12" fill="${aff?'#ffd166':'#8d97c9'}">${esc(String(rLabel[nd.id]).slice(0,10))}</text></g>`; });
  if(changed("ripple", html)) svg.innerHTML = html;
  const rn = nodes.find(nd => (nd.affected||nd.status==="affected") && (nd.reason||nd.affected_reason));
  const base = rn ? `⚠ ${rn.id}: ${rn.reason||rn.affected_reason}` : (affIds.size ? "Amber nodes are downstream of the latest requirement change." : "Hover a node to see what depends on it. Click to play the ripple.");
  const box = $("#rippleReason"); box.dataset.base = base; if(!svg.classList.contains("focus")) box.textContent = base;
}
$("#rippleSvg").addEventListener("mouseover", e => { const g = e.target.closest(".rnode"); rippleFocus(g ? g.dataset.id : null); });
$("#rippleSvg").addEventListener("mouseleave", () => rippleFocus(null));
$("#rippleSvg").addEventListener("click", e => { const g = e.target.closest(".rnode"); if(g) rippleSim(g.dataset.id); });

/* =================== CONTEXT PACKET X-RAY =================== */
let xraySel = null;
function renderXray(){
  if(changed("xagents", state.agents)){
    $("#xagents").innerHTML = state.agents.map(g => {
      const st = g.status || "idle";
      return `<div class="xagent ${xraySel===g.id?"sel":""}" data-xid="${esc(g.id)}">
        <div class="row"><b style="flex:1">${esc(g.name||g.id)} <span class="st ${st}">${esc(st)}</span></b>
          ${st==="killed"?`<button class="b hot" data-a="recover" data-id="${esc(g.id)}">Recover</button>`:`<button class="b bad" data-a="kill" data-id="${esc(g.id)}">Kill</button>`}</div>
        <div style="color:var(--dim);font-size:12px;margin-top:4px">${g.context_outdated?"⚠ context outdated":"context in sync"}</div>
      </div>`;
    }).join("") || '<div class="empty">no agents</div>';
  }
  if(!xraySel && state.agents[0]) xraySel = state.agents[0].id;
  const sig = JSON.stringify(state.agents.map(a=>[a.id,a.status]));
  const prev = renderXray.sig ? JSON.parse(renderXray.sig) : [];
  const rec = state.agents.some(a => (prev.find(p=>p[0]===a.id)||[])[1]==="killed" && a.status!=="killed");
  renderXray.sig = sig;
  paintXray(rec);
}
$("#xRebuild").onclick = () => paintXray(true);
function paintXray(force){
  const g = state.agents.find(a => a.id === xraySel);
  const body = $("#xrayBody"); if(!body) return;
  if(!g){ body.innerHTML = '<div class="empty">Select an agent to inspect what it knows.</div>'; return; }
  const req = state.proj?.requirement || {}; const rver = req.version ?? "–";
  const known = g.known_version ?? g.context_version ?? (g.context_outdated ? "?" : rver);
  const pending = g.pending_tasks || g.tasks || [];
  const lines = [
    `Requirement version known: v${known}${g.context_outdated?` (current is v${rver})`:""}`,
    `Pending tasks: ${pending.length ? pending.map(t=>t.title||t.text||t).join(", ") : "none"}`,
    `Status: ${g.status||"idle"}`,
    `Changed since it last looked: ${g.context_outdated ? "requirement moved on — a rebuild is needed" : "nothing — fully in sync"}`
  ];
  if(!changed("xray:"+g.id, lines) && !force) return;
  body.innerHTML = lines.map((l,i) => `<div class="xline" style="animation-delay:${i*120}ms">${esc(l)}</div>`).join("");
}
document.addEventListener("click", e => {
  const xa = e.target.closest("[data-xid]"); if(!xa) return;
  xraySel = xa.dataset.xid; last.xagents = null; renderXray(); paintXray(true);
});

/* =================== BEFORE / AFTER DIFF =================== */
function wordDiff(a, b){
  const aw = a.split(/(\s+)/), bw = b.split(/(\s+)/);
  const dp = Array.from({length:aw.length+1}, () => new Array(bw.length+1).fill(0));
  for(let i=aw.length-1;i>=0;i--) for(let j=bw.length-1;j>=0;j--)
    dp[i][j] = aw[i]===bw[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  let i=0,j=0, outA="", outB="";
  while(i<aw.length && j<bw.length){
    if(aw[i]===bw[j]){ outA+=esc(aw[i]); outB+=esc(bw[j]); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ outA += `<del>${esc(aw[i])}</del>`; i++; }
    else { outB += `<ins>${esc(bw[j])}</ins>`; j++; }
  }
  while(i<aw.length){ outA += `<del>${esc(aw[i])}</del>`; i++; }
  while(j<bw.length){ outB += `<ins>${esc(bw[j])}</ins>`; j++; }
  return {before:outA, after:outB};
}
function plainText(html){ const d = document.createElement("div"); d.innerHTML = (html||"").replace(/<\/(h\d|p|div|li|section|br)>|<br\s*\/?>/gi, " $&"); return (d.textContent||"").replace(/\s+/g," ").trim(); }
function renderDiff(){
  const stale = state.props.filter(p => p.status==="stale");
  if(changed("diffSel", stale.map(p=>p.id))){
    $("#diffSel").innerHTML = stale.length ? stale.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("")
      : `<option value="">No stale proposals right now</option>`;
  }
  const pid = $("#diffSel").value || stale[0]?.id;
  const p = state.props.find(x => x.id === pid);
  const after = plainText(state.proj?.artifact?.html) || "No live artifact yet.";
  const before = p ? (plainText(p.content) || p.rationale || "") : "Pick a stale proposal to compare, or there are none right now.";
  const d = wordDiff(before, after);
  $("#diffBefore").innerHTML = d.before + (p?.stale_reason ? `<br><br><span style="color:var(--warn)">⚠ ${esc(p.stale_reason)}</span>` : "");
  $("#diffAfter").innerHTML = d.after;
}
$("#diffSel")?.addEventListener("change", renderDiff);

/* =================== STEERING + DECISION RECORD =================== */
let decisions = [];
function logDecision(kind, text){
  decisions.unshift({kind, text, actor: actor(), at: new Date().toLocaleTimeString()});
  decisions = decisions.slice(0,40);
  $("#decisions").innerHTML = decisions.map(d => `<div class="decision"><b>${esc(d.kind)}</b> &middot; ${esc(d.actor)} &middot; ${esc(d.at)}<br>${esc(d.text)}</div>`).join("")
    || '<div class="empty">No decisions logged yet.</div>';
}
let steerSel = null;
function renderSteer(){
  const cols = {pending:[], stale:[], approved:[]};
  [...state.props].reverse().forEach(p => (cols[p.status] || cols.pending).push(p));
  const cur = state.props.find(p=>p.id===steerSel) || [...state.props].reverse()[0];
  if(changed("kb", [state.props.map(p=>[p.id,p.status,p.stale_reason]), cur?.id])){
    for(const k in cols){
      $("#kbc-"+k).textContent = cols[k].length;
      $("#kb-"+k).innerHTML = cols[k].map(p => `
        <div class="prop ${p.status} ${cur&&cur.id===p.id?"sel":""}" data-spid="${esc(p.id)}">
          <div class="top"><b>${esc(p.title)}</b></div>
          <p>${esc(p.agent_name||p.agent_id)} · built on v${esc(p.based_on_version)}</p>
          ${p.stale_reason?`<p class="why">⚠ ${esc(p.stale_reason)}</p>`:""}
          <div class="row"><button class="b ok" data-sa="approve" data-spid="${esc(p.id)}" ${p.status==="approved"?"disabled":""}>Approve</button><button class="b bad" data-sa="reject" data-spid="${esc(p.id)}">Reject</button></div>
          <div class="steerbox"><input placeholder='Steer: "make it warmer"' data-steerin="${esc(p.id)}"><button class="b hot" data-sa="steer" data-spid="${esc(p.id)}">Go</button></div>
        </div>`).join("") || '<div class="empty">nothing here</div>';
    }
  }
  $("#steerTitle").textContent = cur ? "Preview · "+cur.title : "Preview";
  const html = cur?.content || "<body style='font-family:sans-serif;padding:24px;color:#555'>No proposals yet.</body>";
  if(changed("steerFrame", html)) $("#steerFrame").srcdoc = html;
}
document.addEventListener("click", e => {
  const c = e.target.closest(".prop[data-spid]"); if(!c || e.target.closest("button,input")) return;
  steerSel = c.dataset.spid; last.kb = null; renderSteer();
});
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-sa]"); if(!b) return;
  const sa = b.dataset.sa, pid = b.dataset.spid;
  if(sa==="approve"){
    const r = await api("POST", `/proposals/${pid}/approve`, {actor:actor()});
    if(r.code===409){ toast("Blocked: outdated.", true); logDecision("Rejected (stale)", `Approval of ${pid} blocked — requirement moved on.`); }
    else { toast(r.code===200?"Approved.":`approve failed (${r.code})`, r.code!==200); if(r.code===200) logDecision("Approved", pid); }
  }
  if(sa==="reject"){ logDecision("Rejected", pid); toast("Marked rejected in the decision record."); }
  if(sa==="steer"){
    const ins = document.querySelector(`[data-steerin="${pid}"]`)?.value?.trim(); if(!ins) return toast("Type a steering instruction first.", true);
    const r = await api("POST", `/proposals/${pid}/redirect`, {actor:actor(), instruction:ins});
    toast(r.code===200?"Agent redirected.":`redirect failed (${r.code})`, r.code!==200);
    logDecision("Redirected", `${pid}: "${ins}"`);
  }
  last.steerProps = null; poll();
});

function updateFrame(){
  let html = "";
  if(tab==="art") html = state.proj?.artifact?.html || "<body style='font-family:sans-serif;padding:24px;color:#555'>No artifact yet. Approve a proposal.</body>";
  else { const p = state.props.find(x=>x.id===sel); html = p?.content || "<body style='font-family:sans-serif;padding:24px;color:#555'>Click a proposal to preview it.</body>"; }
  if(changed("frame:"+tab+sel, html)) $("#frame").srcdoc = html;
}
$("#tabArt").onclick = () => { tab="art"; $("#tabArt").classList.add("act"); $("#tabProp").classList.remove("act"); updateFrame(); };
$("#tabProp").onclick = () => { tab="prop"; $("#tabProp").classList.add("act"); $("#tabArt").classList.remove("act"); updateFrame(); };

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"), card = e.target.closest(".prop");
  if(!b){ if(card){ sel = card.dataset.pid; last.props=null; tab="prop"; $("#tabProp").classList.add("act"); $("#tabArt").classList.remove("act"); render(); } return; }
  const a = b.dataset.a, id = b.dataset.id, pid = b.dataset.pid;
  if(["start","kill","recover"].includes(a)){
    const r = await api("POST", `/agents/${id}/${a}`, a==="start" ? {actor:actor()} : {});
    toast(r.code>=400||!r.code ? `${a} failed (${r.code})` : `${id} → ${a}`, r.code>=400||!r.code);
  }
  if(a==="approve"){
    const r = await api("POST", `/proposals/${pid}/approve`, {actor:actor()});
    if(r.code===409) toast("Blocked: proposal is outdated. Requirement changed since it was built.", true);
    else toast(r.code===200 ? "Approved. Artifact updated." : `approve failed (${r.code})`, r.code!==200);
  }
  if(a==="redirect"){
    const ins = prompt("Instruction for the agent (e.g. emphasize trust badges):"); if(!ins) return;
    const r = await api("POST", `/proposals/${pid}/redirect`, {actor:actor(), instruction:ins});
    toast(r.code===200 ? "Agent redirected." : `redirect failed (${r.code})`, r.code!==200);
  }
  poll();
});

$("#reqBtn").onclick = async () => {
  const text = $("#reqIn").value.trim(); if(!text) return toast("Type the new requirement first.", true);
  const r = await api("PUT", `/projects/${PID}/requirement`, {text, actor:actor(), node_id:$("#nodeSel").value});
  if(r.code===200){ $("#reqIn").value=""; toast(`Requirement v${r.data.requirement?.version}. ${(r.data.affected_node_ids||[]).length} nodes affected, agents notified.`); }
  else toast(`update failed (${r.code})`, true);
  poll();
};
$("#reset").onclick = async () => { if(!confirm("Reset demo state?")) return; await api("POST","/reset"); last={}; sel=null; toast("Demo reset."); poll(); };


/* =================== NOVA / ATLAS DASHBOARDS =================== */
const AG = {
  nova:{c:"#ff8a3d", role:"Design agent", blurb:"Turns the requirement into live HTML demos."},
  atlas:{c:"#7c9cff", role:"Research agent", blurb:"Gathers evidence and proposes options for humans to judge."}
};
let novaSel = null;
function agentHead(id){
  const g = state.agents.find(a=>a.id===id) || {id, name:id[0].toUpperCase()+id.slice(1), status:"idle"};
  const st = g.status || "idle", c = AG[id].c, v = state.proj?.requirement?.version ?? "–";
  return `<div class="card agenthead"><div class="orb big ${st}" style="--c:${c}"><u></u><i></i><s></s></div>
    <div style="flex:1"><div style="font-size:22px;font-weight:300;letter-spacing:.12em">${esc(g.name||id)} <span class="st ${st}">${esc(st)}</span></div>
    <div style="color:var(--dim);font-size:13px;margin-top:4px">${AG[id].role} &middot; ${AG[id].blurb}</div>
    <div style="color:${g.context_outdated?"var(--warn)":"var(--ok)"};font-size:12px;margin-top:6px">${g.context_outdated?"⚠ context outdated":"✓ context in sync with requirement v"+esc(v)}</div></div>
    <div class="row"><button class="b ok" data-a="start" data-id="${id}">Start</button>${st==="killed"?`<button class="b hot" data-a="recover" data-id="${id}">Recover</button>`:`<button class="b bad" data-a="kill" data-id="${id}">Kill</button>`}</div></div>`;
}
function renderAgent(id){
  const root = $("#v-"+id); if(!root) return;
  const mine = state.props.filter(p => p.agent_id===id || String(p.agent_name||"").toLowerCase()===id);
  const cur = Number(state.proj?.requirement?.version) || 1;
  const sel = id==="nova" ? (mine.find(p=>p.id===novaSel) || mine[mine.length-1]) : null;
  if(!changed("agentv:"+id, [state.agents.find(a=>a.id===id), mine.map(p=>[p.id,p.status,p.stale_reason,p.based_on_version,p.content]), cur, sel?.id])) return;
  let body = "";
  if(id==="nova"){
    body = `<div class="studio">
      <div class="card grow"><h3>Design studio &middot; live render</h3>
        <div class="chips">${mine.map(p=>`<button class="b chipb ${sel&&sel.id===p.id?"act":""}" data-npid="${esc(p.id)}">${esc(p.title)} <span class="tag ${p.status}">${esc(p.status)}</span></button>`).join("") || '<span class="empty">Start Nova to get its first design.</span>'}</div>
        <iframe sandbox srcdoc="${esc(sel?.content||"")}"></iframe></div>
      <div class="card scroll"><h3>Build details</h3>${sel?`
        <b style="font-size:16px">${esc(sel.title)}</b>
        <p style="color:var(--dim);font-size:13px;line-height:1.5">${esc(sel.rationale||"No rationale given.")}</p>
        <div class="fresh"><i style="width:${Math.min(100,(Number(sel.based_on_version)||0)/cur*100)}%"></i></div>
        <small style="color:var(--dim)">built on requirement v${esc(sel.based_on_version)} &middot; current is v${cur}</small>
        ${sel.stale_reason?`<p class="why" style="color:var(--warn)">⚠ ${esc(sel.stale_reason)}</p>`:""}
        <div class="row" style="margin-top:12px"><button class="b ok" data-a="approve" data-pid="${esc(sel.id)}" ${sel.status==="approved"?"disabled":""}>Approve</button><button class="b hot" data-a="redirect" data-pid="${esc(sel.id)}" ${sel.status==="approved"?"disabled":""}>Redirect</button></div>`:'<div class="empty">No design selected.</div>'}</div></div>`;
  } else {
    const fresh = mine.filter(p=>p.status!=="stale").length;
    body = `<div class="card grow scroll"><h3>Research findings</h3>
      <div class="stat"><span class="chip">${mine.length} findings</span><span class="chip on">${fresh} fresh</span><span class="chip ${mine.length-fresh?"v":""}">${mine.length-fresh} stale</span></div>
      <div class="findings">${mine.slice().reverse().map(p=>`<div class="prop ${p.status} finding" style="cursor:default">
        <div class="top"><b>${esc(p.title)}</b><span class="tag ${p.status}">${esc(p.status)}</span></div>
        <blockquote>${esc(p.rationale||"No rationale given.")}</blockquote>
        <div class="fresh"><i style="width:${Math.min(100,(Number(p.based_on_version)||0)/cur*100)}%"></i></div>
        <small style="color:var(--dim)">evidence from v${esc(p.based_on_version)} of v${cur}</small>
        ${p.stale_reason?`<p class="why">⚠ ${esc(p.stale_reason)}</p>`:""}
        <div class="row" style="margin-top:8px"><button class="b ok" data-a="approve" data-pid="${esc(p.id)}" ${p.status==="approved"?"disabled":""}>Approve</button><button class="b hot" data-a="redirect" data-pid="${esc(p.id)}" ${p.status==="approved"?"disabled":""}>Redirect</button></div></div>`).join("") || '<div class="empty">Start Atlas to gather evidence.</div>'}</div></div>`;
  }
  root.innerHTML = agentHead(id) + body;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-npid]"); if(!b) return;
  novaSel = b.dataset.npid; last["agentv:nova"] = null; renderAgent("nova");
});

/* =================== HUMANS =================== */
const PEOPLE = [{id:"niharika", name:"Niharika", c:"#ff9ccf"}, {id:"vaibhav", name:"Vaibhav", c:"#7be3e3"}];
function renderHumans(){
  const evs = state.proj?.events || [], cur = actor();
  PEOPLE.forEach(p => {
    const mine = evs.filter(e => String(e.actor||e.by||"").toLowerCase()===p.id);
    if(!changed("human:"+p.id, [mine, cur])) return;
    const by = {}; mine.forEach(e => by[e.type] = (by[e.type]||0)+1);
    $("#hp-"+p.id).innerHTML = `<div class="card person grow ${cur===p.id?"live":""}" style="--c:${p.c}">
      <div class="avatar">${p.name[0]}</div><h2>${p.name}</h2>
      <small>${cur===p.id?"● acting now":"observing"}</small>
      <div class="big">${mine.length}</div><small>actions logged</small>
      <div class="mix">${Object.entries(by).map(([t,n])=>`<span class="tag">${esc(t.replace(/_/g," "))} &middot; ${n}</span>`).join("") || '<span style="color:var(--dim);font-size:12px">nothing yet</span>'}</div>
      <button class="b" data-actas="${p.id}">Act as ${p.name}</button>
      <div class="feed scroll">${mine.slice(-8).reverse().map(e=>`<div class="ev"><span class="dot ${esc(e.type)}"></span><div><b>${esc((e.type||"").replace(/_/g," "))}</b><small>${esc(e.message||e.text||e.detail||"")}</small></div></div>`).join("")}</div></div>`;
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-actas]"); if(!b) return;
  $("#actor").value = b.dataset.actas; renderHumans();
});
$("#actor").addEventListener("change", renderHumans);

/* =================== TIMELINE =================== */
let tlType = null, tlIdx = null, tlTimer = 0;
function renderTimeline(){
  const all = state.proj?.events || [], max = all.length, idx = tlIdx===null ? max : Math.min(tlIdx, max);
  if(!changed("tl", [all, idx, tlType])) return;
  const slice = all.slice(0, idx), types = [...new Set(all.map(e=>e.type))];
  const rg = $("#tlRange"); rg.max = max; rg.value = idx; $("#tlPos").textContent = idx+" / "+max;
  $("#tlChips").innerHTML = `<button class="b chipb tl ${tlType===null?"act":""}" data-tltype="">all &middot; ${slice.length}</button>` +
    types.map(t=>`<button class="b chipb tl ${tlType===t?"act":""}" data-tltype="${esc(t)}">${esc(String(t).replace(/_/g," "))} &middot; ${slice.filter(e=>e.type===t).length}</button>`).join("");
  const rows = slice.map((e,i)=>[e,i+1]).filter(([e])=>tlType===null||e.type===tlType).reverse();
  $("#tlList").innerHTML = rows.map(([e,i]) => `<div class="tlrow"><span class="dot ${esc(e.type)}"></span><span class="n">#${i}</span>
    <div><b>${esc(String(e.type||"").replace(/_/g," "))}</b>${e.actor?` <span class="chip" style="font-size:11px">${esc(e.actor)}</span>`:""}<small>${esc(e.message||e.text||e.detail||"")}</small></div></div>`).join("") || '<div class="empty">no events</div>';
}
$("#tlRange").addEventListener("input", e => { clearInterval(tlTimer); const v = +e.target.value; tlIdx = v >= (state.proj?.events||[]).length ? null : v; last.tl = null; renderTimeline(); });
$("#tlChips").addEventListener("click", e => { const b = e.target.closest("[data-tltype]"); if(!b) return; tlType = b.dataset.tltype || null; last.tl = null; renderTimeline(); });
$("#tlPlay").onclick = () => {
  clearInterval(tlTimer); const max = (state.proj?.events||[]).length; if(!max) return; tlIdx = 0; last.tl = null; renderTimeline();
  tlTimer = setInterval(() => { tlIdx++; if(tlIdx >= (state.proj?.events||[]).length){ tlIdx = null; clearInterval(tlTimer); } last.tl = null; renderTimeline(); }, 450);
};

const RENDER = {ripple:()=>renderRipple(), nova:()=>renderAgent("nova"), atlas:()=>renderAgent("atlas"), steer:()=>renderSteer(), diff:()=>renderDiff(), xray:()=>renderXray(), humans:()=>renderHumans(), timeline:()=>renderTimeline()};

poll(); setInterval(poll, (window.BUILDIFY_CONFIG && window.BUILDIFY_CONFIG.POLL_INTERVAL_MS) || 1500);
