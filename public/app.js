const $ = (id) => document.getElementById(id);
const api = async (path, body) => {
  const r = await fetch(path, body ? { method: "POST", body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { code: j.code });
  return j;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toDataUrl = (blob) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(blob); });
async function samplePhoto(done) { return toDataUrl(await (await fetch(`/api/sample.png?done=${done.join(",")}`)).blob()); }
async function uploadPhoto(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

const S = { task: null, cps: [], mode: "pause", draft: { done: new Set(), photo: null, notes: "", confirmed: false },
  ret: { cp: null, now: null, proposals: null, dropped: [], decisions: {}, result: null, chosen: null, busy: false, error: null } };

const stepById = (id) => S.task.steps.find((s) => s.id === id);
const latest = () => S.cps[S.cps.length - 1] || null;

function rail() {
  const el = $("rail");
  const picking = S.mode === "pause";
  let done, next = new Set(), blocked = new Set(), flags = {};
  if (picking) done = S.draft.done;
  else if (S.ret.result) { done = new Set(S.ret.result.done); next = new Set(S.ret.result.available); blocked = new Set(S.ret.result.blocked); }
  else done = new Set(S.ret.cp?.done || []);
  if (!picking && S.ret.proposals) for (const p of S.ret.proposals) flags[p.step] = p.kind;
  el.className = "rail" + (picking ? " pick" : "");
  $("railHint").textContent = picking ? "tick what is done" : S.ret.result ? "after your decisions" : "at checkpoint";
  el.innerHTML = S.task.steps.map((s, i) => {
    const isDone = done.has(s.id);
    const ready = s.requires.every((r) => done.has(r));
    const state = isDone ? "done" : (!picking && S.ret.result ? (next.has(s.id) ? "next" : "locked") : (ready ? "next" : "locked"));
    const rec = S.ret.result?.recommended === s.id;
    const tag = flags[s.id] ? `<span class="tag ${flags[s.id] === "added" ? "add" : "rem"}">${flags[s.id]}?</span>`
      : rec ? `<span class="tag rec">next</span>` : blocked.has(s.id) ? `<span class="tag">blocked</span>` : "";
    return `<li data-state="${state}" ${flags[s.id] ? "data-flag" : ""}><span class="dot">${isDone ? "✓" : i + 1}</span>
      <button class="t" data-step="${s.id}" ${picking ? `role="checkbox" aria-checked="${isDone}"` : "tabindex=\"-1\""}>${esc(s.title)}
      <span class="meta">${s.requires.length ? "needs " + s.requires.join(", ") : "start here"}</span></button>${tag}</li>`;
  }).join("");
  if (picking) el.querySelectorAll("button[data-step]").forEach((b) => b.onclick = () => toggle(b.dataset.step));
}

function toggle(id) {
  const d = S.draft.done, s = stepById(id);
  if (d.has(id)) { // un-ticking also un-ticks everything that depends on it
    const drop = (x) => { d.delete(x); S.task.steps.filter((t) => t.requires.includes(x)).forEach((t) => d.has(t.id) && drop(t.id)); };
    drop(id);
  } else if (s.requires.every((r) => d.has(r))) d.add(id);
  S.draft.photo = null; S.draft.confirmed = false; render();
}

function shots() {
  const fig = (cap, right, src, id) => `<figure><div class="frame">${src ? `<img id="${id}" src="${src}" alt="${esc(cap)}">` : `<div class="empty">No photo yet</div>`}</div><figcaption><span>${esc(cap)}</span><span>${esc(right || "")}</span></figcaption></figure>`;
  if (S.mode === "pause") $("shots").innerHTML = fig("Checkpoint photo", S.draft.photo ? "ready" : "", S.draft.photo, "imgDraft");
  else {
    const cp = S.ret.cp;
    $("shots").innerHTML = cp ? fig("At the checkpoint", new Date(cp.createdAt).toLocaleString(), `/api/checkpoints/${cp.id}/photo`, "imgBefore") + fig("Now", S.ret.now ? "ready" : "", S.ret.now, "imgNow")
      : `<div class="empty">No checkpoint saved yet. Use Pause here first.</div>`;
  }
}

const PRESETS = [["s1", "s2", "s3"], ["s1", "s2", "s3", "s4"], ["s1", "s2", "s3", "s4", "s5"], ["s1", "s2", "s3", "s4", "s5", "s6"], ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]];
function stagebar() {
  const bar = $("stagebar");
  if (S.mode === "pause") {
    bar.innerHTML = `<button class="btn" id="btnSample">Draw a test photo of this progress</button>
      <label class="btn">Upload a photo<input id="fileIn" type="file" accept="image/*" hidden></label>`;
    $("btnSample").onclick = async () => { S.draft.photo = await samplePhoto([...S.draft.done]); S.draft.confirmed = false; render(); };
    $("fileIn").onchange = async (e) => { if (e.target.files[0]) { S.draft.photo = await uploadPhoto(e.target.files[0]); S.draft.confirmed = false; render(); } };
  } else if (S.ret.cp) {
    bar.innerHTML = `<select class="btn" id="preset" aria-label="Test photo of the project now">
        <option value="">Test photo of the project now...</option>
        ${PRESETS.map((p, i) => `<option value="${i}">Built through step ${p.at(-1).slice(1)}${p.length === 7 ? " (all)" : ""}</option>`).join("")}</select>
      <label class="btn">Upload a photo<input id="fileIn" type="file" accept="image/*" hidden></label>`;
    $("preset").onchange = async (e) => { if (e.target.value !== "") { setNow(await samplePhoto(PRESETS[e.target.value])); } };
    $("fileIn").onchange = async (e) => { if (e.target.files[0]) setNow(await uploadPhoto(e.target.files[0])); };
  } else bar.innerHTML = "";
}
function setNow(photo) { Object.assign(S.ret, { now: photo, proposals: null, dropped: [], decisions: {}, result: null, chosen: null, error: null }); render(); }

function panel() {
  const p = $("panel");
  if (S.mode === "pause") {
    const ready = S.draft.photo && S.draft.confirmed;
    p.innerHTML = `<h3>Mark where you stopped</h3>
      <p>Tick the finished steps, add a photo, and leave yourself a note for later.</p>
      <label for="notes" class="rail-title">note to future you</label>
      <textarea id="notes" placeholder="e.g. screws are in the tray, the long bolts go in the top panel">${esc(S.draft.notes)}</textarea>
      <label class="check"><input type="checkbox" id="confirm" ${S.draft.confirmed ? "checked" : ""} ${S.draft.photo ? "" : "disabled"}>
        <span>I confirm this photo and these ${S.draft.done.size} finished steps show exactly where I stopped.</span></label>
      <button class="btn primary" id="save" ${ready ? "" : "disabled"}>Save checkpoint</button>
      <div class="err" id="err" role="alert">${esc(S.draft.error || "")}</div>`;
    $("notes").oninput = (e) => (S.draft.notes = e.target.value);
    $("confirm").onchange = (e) => { S.draft.confirmed = e.target.checked; $("save").disabled = !(S.draft.photo && S.draft.confirmed); };
    $("save").onclick = save;
    return;
  }
  const R = S.ret, cp = R.cp;
  if (!cp) { p.innerHTML = `<p>Nothing to return to yet.</p>`; return; }
  let html = `<div class="note"><small>your note from the checkpoint</small>${cp.notes ? esc(cp.notes) : "<em>(no note)</em>"}</div>`;
  if (R.error) html += `<div class="err" role="alert">${esc(R.error)}</div>`;
  if (R.result) {
    const r = R.result;
    html += r.finished ? `<h3>Everything is done.</h3>` : `<h3>Choose what to do next</h3>
      <p>These steps have all their prerequisites finished. The first is recommended from the step graph.</p>`;
    html += r.available.map((id) => `<button class="btn choice ${id === r.recommended ? "primary" : ""}" data-pick="${id}" ${R.chosen === id ? "aria-pressed=\"true\"" : ""}>
      <span>${esc(stepById(id).title)}${id === r.recommended ? " (recommended)" : ""}</span><small>step ${id.slice(1)}${stepById(id).requires.length ? ", after " + stepById(id).requires.join(", ") : ""}</small></button>`).join("");
    if (r.blocked.length) html += `<div class="warn">${r.blocked.map((b) => stepById(b).title).join("; ")} looks done but an earlier step is not, so it is not counted.</div>`;
    if (R.chosen) html += `<div class="note"><small>working on</small>${esc(stepById(R.chosen).title)}</div><button class="btn" id="again">Pause again from here</button>`;
  } else if (R.proposals) {
    const n = R.proposals.length, decided = R.proposals.filter((c) => R.decisions[c.id]).length;
    html += n ? `<h3>Nemotron sees ${n} change${n > 1 ? "s" : ""}</h3><p>Nothing counts until you confirm it. Look at the photos, then accept or reject each one.</p>`
      : `<h3>No changes found</h3><p>Nemotron saw no difference from the checkpoint.</p>`;
    html += R.proposals.map((c) => `<div class="change" data-decision="${R.decisions[c.id] || ""}" data-change="${c.id}">
      <div><span class="tag ${c.kind === "added" ? "add" : "rem"}">${c.kind}</span> <strong>${esc(c.title)}</strong></div>
      <div class="ev">${esc(c.evidence)} <span class="tag">${c.confidence}</span></div>
      <div class="row"><button class="btn" data-d="accept" aria-pressed="${R.decisions[c.id] === "accept"}">Yes, this changed</button>
      <button class="btn" data-d="reject" aria-pressed="${R.decisions[c.id] === "reject"}">No</button></div></div>`).join("");
    if (R.dropped.length) html += `<div class="warn">${R.dropped.length} model suggestion${R.dropped.length > 1 ? "s were" : " was"} discarded because the step graph contradicts ${R.dropped.length > 1 ? "them" : "it"}.</div>`;
    html += `<button class="btn primary" id="resolve" ${decided === n ? "" : "disabled"}>${decided === n ? "Find my next step" : `Decide all changes (${decided}/${n})`}</button>`;
  } else {
    html += `<h3>Return to your project</h3><p>Add a photo of the project as it is now. Nemotron compares it with the checkpoint and lists what changed.</p>
      <button class="btn primary" id="compare" ${R.now && !R.busy ? "" : "disabled"}>${R.busy ? `<span class="spin"></span>Nemotron is comparing` : "Compare with Nemotron"}</button>`;
  }
  p.innerHTML = html;
  p.querySelectorAll("[data-change] button").forEach((b) => b.onclick = () => { R.decisions[b.closest("[data-change]").dataset.change] = b.dataset.d; render(); });
  p.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { R.chosen = b.dataset.pick; render(); });
  $("compare") && ($("compare").onclick = compare);
  $("resolve") && ($("resolve").onclick = resolveAll);
  $("again") && ($("again").onclick = () => { S.draft = { done: new Set(R.result.done), photo: R.now, notes: cp.notes, confirmed: false }; S.mode = "pause"; render(); });
}

async function save() {
  try {
    const d = S.draft; d.error = "";
    const cp = await api("/api/checkpoints", { taskId: S.task.id, done: [...d.done], notes: d.notes, photo: d.photo, confirmed: d.confirmed });
    S.cps.push(cp); S.draft = { done: new Set(), photo: null, notes: "", confirmed: false };
    S.ret = { cp, now: null, proposals: null, dropped: [], decisions: {}, result: null, chosen: null, busy: false, error: null };
    S.mode = "return"; render();
  } catch (e) { S.draft.error = e.message; render(); }
}
async function compare() {
  const R = S.ret; R.busy = true; R.error = null; render();
  try {
    const out = await api(`/api/checkpoints/${R.cp.id}/compare`, { photo: R.now });
    R.proposals = out.proposals; R.dropped = out.dropped; R.decisions = {};
  } catch (e) { R.error = e.message; }
  R.busy = false; render();
}
async function resolveAll() {
  const R = S.ret;
  try { R.result = await api(`/api/checkpoints/${R.cp.id}/resolve`, { proposals: R.proposals, decisions: R.decisions }); R.error = null; }
  catch (e) { R.error = e.message; }
  render();
}

function render() {
  $("tabPause").setAttribute("aria-selected", S.mode === "pause"); $("tabReturn").setAttribute("aria-selected", S.mode === "return");
  rail(); shots(); stagebar(); panel();
}

async function init() {
  const [t, c] = await Promise.all([api("/api/tasks"), api("/api/checkpoints")]);
  S.task = t.tasks[0]; S.cps = c.checkpoints.filter((x) => x.taskId === S.task.id);
  $("taskTitle").textContent = S.task.title;
  $("liveStatus").className = "status" + (t.live ? "" : " off");
  $("liveStatus").innerHTML = t.live ? `<b>●</b> ${esc(t.model)}` : `<b>●</b> NEBIUS_API_KEY not set: compare is off`;
  S.ret.cp = latest();
  S.mode = S.ret.cp ? "return" : "pause";
  $("tabPause").onclick = () => { S.mode = "pause"; render(); };
  $("tabReturn").onclick = () => { S.ret.cp = latest(); S.mode = "return"; render(); };
  render();
}
init();
