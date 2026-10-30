// Deterministic core: the task step graph, checkpoint validation, change
// verification and next-action selection. No model output is trusted until it
// passes through these functions.

export const TASKS = {
  bookshelf: {
    id: "bookshelf",
    title: "Assemble the 4-shelf bookshelf",
    steps: [
      { id: "s1", title: "Sort panels and hardware", requires: [], visible: "all parts laid out flat in neat rows on the floor instead of a jumbled pile" },
      { id: "s2", title: "Stand the two side panels", requires: ["s1"], visible: "two tall dark upright side panels standing apart in the middle of the room" },
      { id: "s3", title: "Fix the bottom panel between the sides", requires: ["s2"], visible: "a dark horizontal panel joining the two side panels at the bottom" },
      { id: "s4", title: "Insert the two middle shelves", requires: ["s3"], visible: "two horizontal shelves between the side panels, above the bottom panel" },
      { id: "s5", title: "Close the frame with the top panel", requires: ["s4"], visible: "a horizontal top panel across the very top of the two side panels" },
      { id: "s6", title: "Nail on the thin back panel", requires: ["s5"], visible: "a thin light tan back panel filling the space behind the shelves" },
      { id: "s7", title: "Mount the orange anti-tip bracket", requires: ["s5"], visible: "a small orange square bracket sitting on top of the top panel" },
    ],
  },
};

export function getTask(id) {
  const t = TASKS[id];
  if (!t) throw new Error(`unknown task: ${id}`);
  return t;
}

// Steps are listed in a valid topological order, so one pass is enough.
export function effectiveDone(task, claimed) {
  const claimedSet = new Set(claimed);
  const eff = new Set();
  const blocked = [];
  for (const s of task.steps) {
    if (!claimedSet.has(s.id)) continue;
    if (s.requires.every((r) => eff.has(r))) eff.add(s.id);
    else blocked.push(s.id);
  }
  return { done: task.steps.filter((s) => eff.has(s.id)).map((s) => s.id), blocked };
}

export function nextActions(task, done) {
  const d = new Set(done);
  const open = task.steps.filter((s) => !d.has(s.id) && s.requires.every((r) => d.has(r)));
  return { available: open.map((s) => s.id), recommended: open[0]?.id ?? null, finished: d.size === task.steps.length };
}

// A checkpoint may only claim steps whose prerequisites are also claimed.
export function validateCheckpoint(task, input) {
  const errors = [];
  if (!input || input.confirmed !== true) errors.push("checkpoint must be explicitly confirmed");
  const ids = new Set(task.steps.map((s) => s.id));
  const done = Array.isArray(input?.done) ? input.done : [];
  for (const d of done) if (!ids.has(d)) errors.push(`unknown step ${d}`);
  if (!errors.length) {
    const { blocked } = effectiveDone(task, done);
    for (const b of blocked) errors.push(`step ${b} is marked done but a prerequisite is not`);
  }
  if (typeof input?.photo !== "string" || !input.photo.startsWith("data:image/")) errors.push("a checkpoint photo is required");
  return errors;
}

// Keep only model proposals that make sense against the checkpoint.
export function verifyProposals(task, before, raw) {
  const ids = new Set(task.steps.map((s) => s.id));
  const beforeSet = new Set(before);
  const accepted = [], dropped = [];
  const seen = new Set();
  for (const p of Array.isArray(raw) ? raw : []) {
    const part = String(p?.step ?? p?.part ?? "");
    const kind = String(p?.kind ?? "").toLowerCase();
    const reason = !ids.has(part) ? "not a step in this task"
      : !["added", "removed"].includes(kind) ? "kind must be added or removed"
      : kind === "added" && beforeSet.has(part) ? "already done at the checkpoint"
      : kind === "removed" && !beforeSet.has(part) ? "was not done at the checkpoint"
      : seen.has(part) ? "duplicate" : null;
    if (reason) { dropped.push({ step: part, kind, reason }); continue; }
    seen.add(part);
    accepted.push({
      id: `c${accepted.length + 1}`, step: part, kind,
      title: task.steps.find((s) => s.id === part).title,
      evidence: String(p?.evidence ?? "").slice(0, 300),
      confidence: ["low", "medium", "high"].includes(String(p?.confidence).toLowerCase()) ? String(p.confidence).toLowerCase() : "medium",
    });
  }
  return { proposals: accepted, dropped };
}

// Apply the user's per-change decisions. Every proposal needs a decision.
export function resolve(task, before, proposals, decisions) {
  const missing = proposals.filter((p) => !["accept", "reject"].includes(decisions?.[p.id])).map((p) => p.id);
  if (missing.length) return { error: `decision needed for ${missing.join(", ")}` };
  const raw = new Set(before);
  for (const p of proposals) {
    if (decisions[p.id] !== "accept") continue;
    if (p.kind === "added") raw.add(p.step); else raw.delete(p.step);
  }
  const { done, blocked } = effectiveDone(task, [...raw]);
  return { done, blocked, ...nextActions(task, done) };
}
