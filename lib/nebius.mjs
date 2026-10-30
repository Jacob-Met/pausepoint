// Nemotron on Nebius Token Factory (OpenAI-compatible chat completions).
export const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1";
export const MODEL = process.env.NEBIUS_MODEL || "nvidia/Nemotron-3.5-Super-VL";

export function buildMessages(task, beforeDone, notes, beforePhoto, afterPhoto) {
  const catalog = task.steps.map((s) => `- ${s.id}: ${s.title}. When finished it looks like: ${s.visible}.`).join("\n");
  const doneList = beforeDone.length ? beforeDone.join(", ") : "none";
  const system = "You compare two photos of the same physical project taken at different times and report what changed. "
    + "Answer with a JSON array only, no prose.";
  const text = `Task: ${task.title}.\nSteps and how each one looks when finished:\n${catalog}\n\n`
    + `Photo 1 is the saved checkpoint. At that time these steps were confirmed done: ${doneList}.\n`
    + (notes ? `Notes left at the checkpoint: ${notes}\n` : "")
    + `Photo 2 is the project now.\n\nCompare Photo 2 with Photo 1. For each step whose visible state differs, output an object `
    + `{"step": "<step id from the list>", "kind": "added" or "removed", "evidence": "<what you see in photo 2>", "confidence": "low"|"medium"|"high"}. `
    + `"added" means the step now looks finished but was not at the checkpoint; "removed" means a step that was done is no longer visible. `
    + `Report only differences you can see. Do not report a step as "removed" just because its parts were used by later steps; report it only if the finished result of that step is gone or undone. If nothing changed, output [].`;
  return [
    { role: "system", content: system },
    { role: "user", content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: beforePhoto } },
      { type: "image_url", image_url: { url: afterPhoto } },
    ] },
  ];
}

// The model may wrap JSON in prose or code fences; pull out the first array.
export function extractJson(content) {
  const s = String(content ?? "");
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], s];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("["), end = c.lastIndexOf("]");
    if (start < 0 || end < start) continue;
    try { const v = JSON.parse(c.slice(start, end + 1)); if (Array.isArray(v)) return v; } catch {}
  }
  return null;
}

export async function compareWithNemotron({ task, beforeDone, notes, beforePhoto, afterPhoto, apiKey, fetchImpl = fetch, model = MODEL }) {
  if (!apiKey) { const e = new Error("NEBIUS_API_KEY is not set on the server. Set it and restart to compare photos."); e.code = "NO_KEY"; throw e; }
  const res = await fetchImpl(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 3000, temperature: 0.2, messages: buildMessages(task, beforeDone, notes, beforePhoto, afterPhoto) }),
  });
  if (!res.ok) { const e = new Error(`Token Factory returned HTTP ${res.status}`); e.code = "UPSTREAM"; throw e; }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  if (!parsed) { const e = new Error("The model answer was not a JSON list; try again."); e.code = "BAD_OUTPUT"; throw e; }
  return { raw: parsed, model: body.model || model, usage: body.usage || null };
}
