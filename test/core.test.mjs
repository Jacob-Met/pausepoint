import test from "node:test";
import assert from "node:assert/strict";
import { getTask, effectiveDone, nextActions, validateCheckpoint, verifyProposals, resolve } from "../lib/core.mjs";
import { extractJson, buildMessages, compareWithNemotron } from "../lib/nebius.mjs";
import { samplePhoto } from "../lib/png.mjs";

const T = getTask("bookshelf");
const PHOTO = "data:image/png;base64,AAAA";

test("step graph is topologically ordered with valid refs", () => {
  const seen = new Set();
  for (const s of T.steps) { for (const r of s.requires) assert.ok(seen.has(r), `${s.id} requires later ${r}`); seen.add(s.id); }
});
test("effectiveDone blocks steps with missing prerequisites", () => {
  const r = effectiveDone(T, ["s1", "s3"]);
  assert.deepEqual(r.done, ["s1"]); assert.deepEqual(r.blocked, ["s3"]);
});
test("nextActions offers parallel branches after s5", () => {
  const r = nextActions(T, ["s1", "s2", "s3", "s4", "s5"]);
  assert.deepEqual(r.available, ["s6", "s7"]); assert.equal(r.recommended, "s6"); assert.equal(r.finished, false);
  assert.equal(nextActions(T, T.steps.map((s) => s.id)).finished, true);
});
test("checkpoint must be confirmed, consistent, and have a photo", () => {
  assert.ok(validateCheckpoint(T, { done: ["s1"], photo: PHOTO }).length);
  assert.ok(validateCheckpoint(T, { confirmed: true, done: ["s2"], photo: PHOTO }).length);
  assert.ok(validateCheckpoint(T, { confirmed: true, done: ["s1"] }).length);
  assert.deepEqual(validateCheckpoint(T, { confirmed: true, done: ["s1", "s2"], photo: PHOTO }), []);
});
test("verifyProposals drops what the checkpoint contradicts", () => {
  const { proposals, dropped } = verifyProposals(T, ["s1", "s2"], [
    { step: "s3", kind: "added", evidence: "base joined", confidence: "high" },
    { step: "s2", kind: "added" }, { step: "s1", kind: "removed" }, { step: "s4", kind: "removed" },
    { step: "zz", kind: "added" }, { step: "s3", kind: "added" }, { step: "s5", kind: "moved" },
  ]);
  assert.deepEqual(proposals.map((p) => [p.id, p.step, p.kind]), [["c1", "s3", "added"], ["c2", "s1", "removed"]]);
  assert.equal(dropped.length, 5);
});
test("resolve requires a decision for every change", () => {
  const { proposals } = verifyProposals(T, ["s1"], [{ step: "s2", kind: "added" }]);
  assert.match(resolve(T, ["s1"], proposals, {}).error, /decision needed/);
});
test("resolve applies only accepted changes and picks the next step", () => {
  const { proposals } = verifyProposals(T, ["s1"], [{ step: "s2", kind: "added" }, { step: "s3", kind: "added" }]);
  const r = resolve(T, ["s1"], proposals, { c1: "accept", c2: "accept" });
  assert.deepEqual(r.done, ["s1", "s2", "s3"]); assert.equal(r.recommended, "s4");
  const r2 = resolve(T, ["s1"], proposals, { c1: "reject", c2: "accept" });
  assert.deepEqual(r2.done, ["s1"]); assert.deepEqual(r2.blocked, ["s3"]); assert.equal(r2.recommended, "s2");
});
test("removing a step also unwinds its dependents", () => {
  const { proposals } = verifyProposals(T, ["s1", "s2", "s3"], [{ step: "s2", kind: "removed" }]);
  const r = resolve(T, ["s1", "s2", "s3"], proposals, { c1: "accept" });
  assert.deepEqual(r.done, ["s1"]); assert.equal(r.recommended, "s2");
});
test("extractJson handles fences and surrounding prose", () => {
  assert.deepEqual(extractJson('Here:\n```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  assert.deepEqual(extractJson("ok [] done"), []);
  assert.equal(extractJson("no list"), null);
});
test("nebius adapter: no key gives a clear error, no network used", async () => {
  await assert.rejects(compareWithNemotron({ task: T, beforeDone: [], beforePhoto: PHOTO, afterPhoto: PHOTO, apiKey: "", fetchImpl: () => { throw new Error("network"); } }), /NEBIUS_API_KEY/);
});
test("nebius adapter: builds a two-image request and parses the reply", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ model: "m", choices: [{ message: { content: '[{"step":"s2","kind":"added"}]' } }] }) }; };
  const out = await compareWithNemotron({ task: T, beforeDone: ["s1"], notes: "n", beforePhoto: PHOTO, afterPhoto: PHOTO, apiKey: "k", fetchImpl });
  assert.match(seen.url, /\/chat\/completions$/);
  const body = JSON.parse(seen.init.body);
  assert.ok(body.max_tokens >= 1500); assert.equal(body.messages[1].content.filter((c) => c.type === "image_url").length, 2);
  assert.equal(seen.init.headers.authorization, "Bearer k");
  assert.deepEqual(out.raw, [{ step: "s2", kind: "added" }]);
});
test("buildMessages lists every step", () => {
  const text = buildMessages(T, [], "", PHOTO, PHOTO)[1].content[0].text;
  for (const s of T.steps) assert.ok(text.includes(s.id));
});
test("sample photo is a valid PNG and differs by stage", () => {
  const a = samplePhoto([]), b = samplePhoto(["s1", "s2"]);
  assert.equal(a.subarray(1, 4).toString(), "PNG"); assert.notDeepEqual(a, b);
});
