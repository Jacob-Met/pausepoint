import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PAUSEPOINT_DATA = mkdtempSync(join(tmpdir(), "pp-"));
const { makeServer } = await import("../server.mjs");

const PHOTO = "data:image/png;base64,iVBORw0KGgo=";
async function boot(opts) {
  const s = makeServer(opts); await new Promise((r) => s.listen(0, r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const j = async (p, body) => { const r = await fetch(base + p, body ? { method: "POST", body: JSON.stringify(body) } : {}); return { status: r.status, body: await r.json() }; };
  return { s, j };
}

test("full loop with a fake model: checkpoint, compare, decide, next step", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '[{"step":"s2","kind":"added","evidence":"sides up","confidence":"high"},{"step":"s9","kind":"added"}]' } }] }) });
  const { s, j } = await boot({ fetchImpl, apiKey: () => "k" });
  try {
    assert.equal((await j("/api/checkpoints", { taskId: "bookshelf", done: ["s1"], photo: PHOTO })).status, 400);
    const cp = await j("/api/checkpoints", { taskId: "bookshelf", done: ["s1"], notes: "left screws in tray", photo: PHOTO, confirmed: true });
    assert.equal(cp.status, 201);
    const cmp = await j(`/api/checkpoints/${cp.body.id}/compare`, { photo: PHOTO });
    assert.equal(cmp.body.proposals.length, 1); assert.equal(cmp.body.dropped.length, 1);
    assert.equal((await j(`/api/checkpoints/${cp.body.id}/resolve`, { proposals: cmp.body.proposals, decisions: {} })).status, 400);
    const r = await j(`/api/checkpoints/${cp.body.id}/resolve`, { proposals: cmp.body.proposals, decisions: { c1: "accept" } });
    assert.deepEqual(r.body.done, ["s1", "s2"]); assert.equal(r.body.recommended, "s3");
    assert.equal((await j("/api/checkpoints")).body.checkpoints[0].notes, "left screws in tray");
  } finally { s.close(); }
});
test("compare without a key returns 503 and a message", async () => {
  const { s, j } = await boot({ apiKey: () => "" });
  try {
    const cp = await j("/api/checkpoints", { taskId: "bookshelf", done: [], photo: PHOTO, confirmed: true });
    const r = await j(`/api/checkpoints/${cp.body.id}/compare`, { photo: PHOTO });
    assert.equal(r.status, 503); assert.match(r.body.error, /NEBIUS_API_KEY/);
  } finally { s.close(); }
});
test("tampered proposals are rejected on resolve", async () => {
  const { s, j } = await boot({ apiKey: () => "" });
  try {
    const cp = await j("/api/checkpoints", { taskId: "bookshelf", done: [], photo: PHOTO, confirmed: true });
    const r = await j(`/api/checkpoints/${cp.body.id}/resolve`, { proposals: [{ id: "c1", step: "zz", kind: "added" }], decisions: { c1: "accept" } });
    assert.equal(r.status, 400);
  } finally { s.close(); }
});
test("serves the sample photo and the app page", async () => {
  const { s } = await boot({});
  try {
    const base = `http://127.0.0.1:${s.address().port}`;
    assert.equal((await fetch(base + "/api/sample.png?done=s1")).headers.get("content-type"), "image/png");
    assert.match(await (await fetch(base + "/")).text(), /pausepoint/i);
  } finally { s.close(); }
});
