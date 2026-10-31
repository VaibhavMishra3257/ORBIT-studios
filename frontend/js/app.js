/* APPLICATION STATE */

const state = {
  version:1,
  requirement:"Build a simple onboarding landing page with a single primary call to action.",
  agentsStarted:false,
  stale:false,
  recovered:false,
  approved:false,
  rejected:false,
  proposalStatus:"pending",
  lastEditor:"Nova",
  atlas:"idle",
  nova:"idle",
  context:[
    "Project: CampusEats",
    "Goal: Startup onboarding",
    "Version: 1",
    "Status: In progress"
  ]
};

const $ = id => document.getElementById(id);

let timelineEvents = 0;

/* NOTIFICATIONS */

function notify(message){
  const toast=$('toast');
  toast.textContent=message;
  toast.classList.add('show');

  clearTimeout(window.toastTimer);

  window.toastTimer=setTimeout(()=>{
    toast.classList.remove('show');
  },2800);
}

/* TIMELINE */

function logEvent(name,description,type="normal"){

  const timeline=$('timeline');

  const event=document.createElement('div');
  event.className='event';

  const dot=document.createElement('div');
  dot.className='event-dot';

  if(type==="success")dot.style.background='#44805c';
  if(type==="warning")dot.style.background='#b77a38';
  if(type==="human")dot.style.background='#6f8daa';

  const content=document.createElement('div');

  const text=document.createElement('p');
  const strong=document.createElement('strong');
  strong.textContent=name;
  text.append(strong,document.createTextNode(' '+description));

  const time=document.createElement('small');
  time.textContent='Just now · Shared workspace';

  content.append(text,time);
  event.append(dot,content);

  timeline.prepend(event);
  timelineEvents++;

}

/* START PARALLEL AGENTS */

function startAgents(){

  if(state.agentsStarted){
    notify('Agents have already started. Continue with the current task.');
    return;
  }

  state.agentsStarted=true;

  state.atlas="working";
  state.nova="working";

  $('atlasWorkState').textContent='WORKING';
  $('novaWorkState').textContent='WORKING';

  $('atlasWorkText').textContent='Analyzing startup founder onboarding patterns and user friction.';
  $('novaWorkText').textContent='Building the first landing page and onboarding experience.';

  $('atlasStatus').innerHTML='<span class="dot"></span> Researching user needs';
  $('novaStatus').innerHTML='<span class="dot"></span> Building prototype';

  logEvent('Niharika','assigned parallel tasks to Atlas and Nova.','human');

  logEvent('Atlas','started independent user research.','normal');

  logEvent('Nova','started the initial prototype.','normal');

  animateProgress('atlasProgress',0,72,1500);
  animateProgress('novaProgress',0,100,2000);

  notify('Atlas and Nova are working in parallel.');

  setTimeout(()=>{

    if(state.stale)return;

    $('atlasWorkState').textContent='READY';
    $('atlasWorkText').textContent='Research complete: founders value clear next steps, short setup and visible progress.';

    state.atlas="ready";

    $('atlasStatus').innerHTML='<span class="dot"></span> Research complete';

    logEvent('Atlas','completed its research: clear guidance reduces onboarding uncertainty.','success');

  },1800);

  setTimeout(()=>{

    if(state.stale)return;

    $('novaWorkState').textContent='REVIEW';
    $('novaWorkText').textContent='Initial prototype is ready for human review.';

    state.nova="review";

    $('novaStatus').innerHTML='<span class="dot"></span> Proposal awaiting review';

    logEvent('Nova','submitted prototype proposal for human review.','success');

    notify('Nova has submitted a prototype proposal.');

  },2400);

}

/* PROGRESS */

function animateProgress(id,start,end,duration){

  const el=$(id);
  const begin=performance.now();

  function frame(now){

    const p=Math.min(1,(now-begin)/duration);
    const value=start+(end-start)*p;

    el.style.width=value+'%';

    if(p<1)requestAnimationFrame(frame);

  }

  requestAnimationFrame(frame);
}

/* REQUIREMENT CHANGE */

function openRequirement(){
  $('requirementModal').classList.add('open');
  $('requirementInput').value=
    "The onboarding experience must be designed specifically for first-time startup founders, with a guided three-step setup and a prominent free trial CTA.";
}

function closeRequirement(){
  $('requirementModal').classList.remove('open');
}

function changeRequirement(){

  const newRequirement=$('requirementInput').value.trim();

  if(!newRequirement){
    notify('Please enter a requirement.');
    return;
  }

  state.version++;
  state.requirement=newRequirement;
  state.stale=true;
  state.recovered=false;
  state.approved=false;
  state.rejected=false;
  state.proposalStatus="stale";

  $('requirementText').textContent=newRequirement;

  $('contextVersion').textContent='V'+state.version;
  $('version').textContent=state.version;

  $('contextDetails').innerHTML=
    '<strong>PROJECT:</strong> CampusEats<br>'+
    '<strong>GOAL:</strong> Startup onboarding<br>'+
    '<strong>VERSION:</strong> '+state.version+'<br>'+
    '<strong>STATUS:</strong> Requirement updated<br>'+
    '<strong>REQUIREMENT:</strong> '+escapeHTML(newRequirement);

  $('proposal').className='proposal stale';
  $('proposalTitle').textContent='Nova proposal is outdated';
  $('proposalTag').textContent='STALE CONTRIBUTION';

  $('proposalText').textContent=
    'Nova prepared its previous contribution against version '+(state.version-1)+
    '. The requirement has changed. This proposal cannot be approved until it is revalidated against the latest version.';

  $('approveBtn').disabled=true;

  $('prototypeState').textContent='⚠ Previous version · Needs revalidation';

  $('decisionText').textContent=
    'The project requirement has changed. Nova’s earlier proposal is now stale. Recover the latest context before submitting a new contribution.';

  $('decisionOwner').textContent='HUMAN CONTROL · Niharika';

  $('atlasWorkState').textContent='REVALIDATE';
  $('novaWorkState').textContent='STALE';

  $('atlasWorkText').textContent='Previous research must be checked against the new founder-specific onboarding requirement.';
  $('novaWorkText').textContent='Previous prototype contribution is outdated and cannot be approved.';

  $('novaProgress').style.width='35%';

  closeRequirement();

  logEvent('Niharika','changed the shared requirement. Project moved to version '+state.version+'.','human');

  logEvent('System','detected that Nova’s earlier proposal was based on an outdated version.','warning');

  logEvent('System','blocked approval of the stale contribution.','warning');

  notify('Requirement updated. Stale proposal detected.');

}

/* CONTEXT RECOVERY */

function recoverContext(){

  if(!state.stale){
    notify('The agents already have the latest project context.');
    return;
  }

  state.recovered=true;

  state.atlas="working";
  state.nova="working";

  $('atlasWorkState').textContent='REVALIDATING';
  $('novaWorkState').textContent='RESTORING';

  $('atlasWorkText').textContent=
    'Restored version '+state.version+'. Rechecking user research against the new requirement.';

  $('novaWorkText').textContent=
    'Recovered shared project history, latest requirements and previous rejected/stale contribution.';

  $('contextDetails').innerHTML=
    '<strong>PROJECT:</strong> CampusEats<br>'+
    '<strong>GOAL:</strong> Founder onboarding<br>'+
    '<strong>VERSION:</strong> '+state.version+'<br>'+
    '<strong>RESTORED:</strong> Current requirement<br>'+
    '<strong>HISTORY:</strong> Previous proposal marked stale<br>'+
    '<strong>STATUS:</strong> Context recovered';

  $('contextDetails').style.background='#e8f1e9';

  logEvent('Nova','restarted with recovered project context, latest requirements and version history.','success');

  logEvent('Atlas','received the updated context and began research revalidation.','success');

  notify('Context successfully recovered.');

  setTimeout(()=>{

    $('atlasWorkState').textContent='READY';
    $('atlasWorkText').textContent=
      'Revalidated: first-time founders need guided steps, progress visibility and a clear trial action.';

    state.atlas="ready";

    $('atlasStatus').innerHTML='<span class="dot"></span> Revalidation complete';

    logEvent('Atlas','completed research revalidation against version '+state.version+'.','success');

  },1300);

  setTimeout(()=>{

    $('novaWorkState').textContent='REVIEW';
    $('novaWorkText').textContent=
      'Rebuilt the prototype proposal using the updated founder onboarding requirement.';

    state.nova="review";

    $('novaStatus').innerHTML='<span class="dot"></span> New proposal ready';

    $('proposal').className='proposal';

    $('proposalTitle').textContent='Nova · Updated prototype proposal';

    $('proposalTag').textContent='AWAITING HUMAN REVIEW';

    $('proposalText').textContent=
      'Based on the new requirement, Nova proposes a guided three-step founder setup, visible onboarding progress and a prominent free-trial CTA. This contribution uses project version '+state.version+'.';

    $('approveBtn').disabled=false;

    $('decisionText').textContent=
      'Nova has submitted a fresh proposal using the latest context. Maya or Leo must review and decide whether to publish it to the shared prototype.';

    $('prototypeState').textContent='● Awaiting approved update';

    $('novaProgress').style.width='100%';

    logEvent('Nova','submitted a new proposal based on the recovered project context.','success');

    notify('New proposal ready for human decision.');

  },2600);

}

/* APPROVAL */

function approveProposal(){

  if(state.stale&&!state.recovered){
    notify('Cannot approve: context has not been recovered.');
    return;
  }

  if(state.approved||state.rejected){
    notify('This proposal has already been resolved.');
    return;
  }

  state.approved=true;
  state.proposalStatus="approved";

  state.version++;

  $('version').textContent=state.version;
  $('contextVersion').textContent='V'+state.version;
  $('prototypeVersion').textContent='VERSION '+state.version+'.0';

  $('proposal').className='proposal approved';
  $('proposalTag').textContent='APPROVED BY HUMAN';

  $('proposalTitle').textContent='✓ Nova proposal approved';

  $('proposalText').textContent=
    'Maya approved the updated prototype. The new founder onboarding experience is now part of the shared artifact.';

  $('previewTitle').textContent=
    'Build your startup. One step at a time.';

  $('previewDescription').textContent=
    'A guided onboarding experience built for first-time founders. Set up your workspace, invite your team and start building with confidence.';

  $('previewCTA').textContent='Start your free trial ↗';

  $('previewSecondary').textContent='Three simple steps · No credit card required';

  $('preview').classList.add('updated');

  $('lastEditor').textContent='Niharika + Nova';

  $('prototypeState').textContent='● Approved and published';

  $('decisionText').textContent=
    'Maya approved Nova’s proposal. The shared prototype has been updated to version '+state.version+'. Leo can now inspect the resulting experience.';

  $('decisionOwner').textContent='APPROVED BY Niharika';

  $('projectStatus').textContent='● Updated prototype';

  $('contextDetails').innerHTML=
    '<strong>PROJECT:</strong> CampusEats<br>'+
    '<strong>GOAL:</strong> Founder onboarding<br>'+
    '<strong>VERSION:</strong> '+state.version+'<br>'+
    '<strong>APPROVED BY:</strong> Niharika<br>'+
    '<strong>STATUS:</strong> Published';

  $('contextDetails').style.background='#e8f1e9';

  $('approveBtn').disabled=true;

  addVersion('Version '+state.version+'.0','Approved by Niharika · Founder onboarding');

  logEvent('Niharika','approved Nova’s updated prototype proposal.','human');

  logEvent('System','published the approved changes to the shared prototype.','success');

  logEvent('Vaibhav','can now review the updated shared artifact.','human');

  notify('Approved! Shared prototype updated.');

}

/* REJECT */

function rejectProposal(){

  if(state.approved||state.rejected){
    notify('This proposal has already been resolved.');
    return;
  }

  state.rejected=true;
  state.proposalStatus="rejected";

  $('proposal').className='proposal rejected';
  $('proposalTag').textContent='REJECTED BY HUMAN';

  $('proposalText').textContent=
    'Maya rejected the proposal. The shared prototype remains unchanged. Nova must wait for new direction.';

  $('approveBtn').disabled=true;

  $('decisionText').textContent=
    'The human reviewer rejected this contribution. No changes have been published. A new direction is required.';

  $('decisionOwner').textContent='REJECTED BY Niharika';

  $('novaWorkState').textContent='PAUSED';

  logEvent('Niharika','rejected Nova’s contribution. The shared prototype remains unchanged.','human');

  notify('Proposal rejected. Prototype unchanged.');

}

/* REDIRECT */

function redirectProposal(){

  if(state.approved||state.rejected){
    notify('Start a new proposal to change direction.');
    return;
  }

  if(state.stale&&!state.recovered){
    notify('Recover the latest context before redirecting.');
    return;
  }

  const direction=prompt(
    'What should Nova change?\n\nExample: Make the onboarding more visual and reduce the amount of text.'
  );

  if(!direction||!direction.trim())return;

  state.version++;

  $('version').textContent=state.version;
  $('contextVersion').textContent='V'+state.version;

  state.approved=false;
  state.rejected=false;

  $('proposal').className='proposal';

  $('proposalTitle').textContent='Nova · Redirected proposal';

  $('proposalTag').textContent='NEW DIRECTION';

  $('proposalText').textContent=
    'Human direction: '+direction+
    '. Nova will prepare a revised proposal for approval.';

  $('approveBtn').disabled=false;

  $('decisionText').textContent=
    'Maya redirected Nova’s work. The agent must incorporate the new instruction and submit an updated proposal for human review.';

  $('decisionOwner').textContent='DIRECTED BY Niharika';

  $('novaWorkState').textContent='WORKING';

  $('novaWorkText').textContent='Applying human feedback: '+direction;

  logEvent('Niharika','redirected Nova: '+direction,'human');

  setTimeout(()=>{

    $('novaWorkState').textContent='REVIEW';

    $('proposalText').textContent=
      'Nova revised its proposal using the human direction: '+direction+
      '. This version is ready for review.';

    $('novaStatus').innerHTML='<span class="dot"></span> Revised proposal ready';

    logEvent('Nova','incorporated the human redirect and submitted a revised proposal.','success');

    notify('Nova has incorporated the new direction.');

  },1500);

}

/* VERSION HISTORY */

function addVersion(title,description){

  const container=$('versions');

  const item=document.createElement('div');
  item.className='event';

  const dot=document.createElement('div');
  dot.className='event-dot';
  dot.style.background='#44805c';

  const content=document.createElement('div');
  const p=document.createElement('p');
  const strong=document.createElement('strong');

  strong.textContent=title;
  p.append(strong,document.createTextNode(' — '+description));

  const small=document.createElement('small');
  small.textContent='Just now · Shared artifact';

  content.append(p,small);
  item.append(dot,content);

  container.prepend(item);

}

/* SAFE TEXT */

function escapeHTML(str){
  return str.replace(/[&<>"']/g,character=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[character]);
}

/* INITIAL DEMO EVENTS */

logEvent('Niharika','created the CampusEats project and invited Leo, Atlas and Nova.','human');

logEvent('Vaibhav','joined the shared workspace as product designer.','human');

logEvent('System','initialized shared project context and prototype version 1.','success');



/* SCROLL INTERACTIONS: reveal, progress, subtle depth and back-to-top */
(function initScrollExperience(){
  const progress = document.getElementById('scrollProgress');
  const topButton = document.getElementById('scrollTop');
  const topbar = document.querySelector('.topbar');
  const contentRoot = document.querySelector('.content');

  // Reveal meaningful content as it enters the viewport.
  const revealTargets = contentRoot ? contentRoot.querySelectorAll(
    '.project-heading, .requirement, .section-label, .person, .panel, .workspace > *, .activity-item, .timeline-item'
  ) : [];

  revealTargets.forEach((el, index) => {
    if (el.classList.contains('scroll-reveal')) return;
    el.classList.add('scroll-reveal');
    if (el.classList.contains('person') && index % 2 === 0) el.style.transitionDelay = '70ms';
    else if (el.classList.contains('person')) el.style.transitionDelay = '140ms';
    if (el.matches('.workspace > *:first-child')) el.classList.add('from-left');
    if (el.matches('.workspace > *:last-child')) el.classList.add('from-right');
  });

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -45px 0px' });

  revealTargets.forEach(el => revealObserver.observe(el));

  let ticking = false;
  function updateScrollUI(){
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const amount = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    if (progress) progress.style.width = amount + '%';
    if (topButton) topButton.classList.toggle('visible', window.scrollY > 420);
    if (topbar) topbar.classList.toggle('scrolled', window.scrollY > 24);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateScrollUI);
      ticking = true;
    }
  }, { passive: true });

  if (topButton) {
    topButton.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  updateScrollUI();

  // Give the main workspace a gentle depth response without affecting layout.
  const depthItems = document.querySelectorAll('.person, .requirement, .panel');
  window.addEventListener('scroll', () => {
    const viewport = window.innerHeight || 1;
    depthItems.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewport) return;
      const centerOffset = (rect.top + rect.height / 2 - viewport / 2) / viewport;
      const drift = Math.max(-3, Math.min(3, centerOffset * -2.2));
      el.style.setProperty('--scroll-drift', drift.toFixed(2) + 'px');
    });
  }, { passive: true });
})();
