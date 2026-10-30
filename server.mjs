import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { TASKS, getTask, validateCheckpoint, verifyProposals, resolve } from "./lib/core.mjs";
import { compareWithNemotron, MODEL } from "./lib/nebius.mjs";
import { samplePhoto } from "./lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4419);
const DATA = process.env.PAUSEPOINT_DATA || join(here, "data");
const STATE = join(DATA, "state.json");
mkdirSync(DATA, { recursive: true });
const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { checkpoints: [] });
const save = (s) => writeFileSync(STATE, JSON.stringify(s));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((ok, no) => {
  let n = 0; const chunks = [];
  req.on("data", (c) => { n += c.length; if (n > 12e6) { no(new Error("body too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { no(new Error("invalid JSON")); } });
});
// Photos stay on the server; the list view only gets metadata.
const brief = (c) => ({ id: c.id, taskId: c.taskId, createdAt: c.createdAt, done: c.done, notes: c.notes, resolution: c.resolution ?? null });

export function makeServer({ fetchImpl = fetch, apiKey = () => process.env.NEBIUS_API_KEY } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/api/tasks") return send(res, 200, { tasks: Object.values(TASKS), model: MODEL, live: Boolean(apiKey()) });
      if (url.pathname === "/api/checkpoints" && req.method === "GET") return send(res, 200, { checkpoints: load().checkpoints.map(brief) });
      if (url.pathname === "/api/sample.png") {
        const done = (url.searchParams.get("done") || "").split(",").filter(Boolean);
        return send(res, 200, samplePhoto(done), "image/png");
      }
      const photo = url.pathname.match(/^\/api\/checkpoints\/([\w-]+)\/photo$/);
      if (photo) {
        const c = load().checkpoints.find((x) => x.id === photo[1]);
        if (!c) return send(res, 404, { error: "no such checkpoint" });
        const [, mime, b64] = c.photo.match(/^data:([^;]+);base64,(.*)$/s);
        return send(res, 200, Buffer.from(b64, "base64"), mime);
      }
      if (url.pathname === "/api/checkpoints" && req.method === "POST") {
        const b = await readBody(req);
        const task = getTask(b.taskId);
        const errors = validateCheckpoint(task, b);
        if (errors.length) return send(res, 400, { error: errors.join("; ") });
        const st = load();
        const c = { id: randomUUID().slice(0, 8), taskId: task.id, createdAt: new Date().toISOString(), done: b.done, notes: String(b.notes || "").slice(0, 2000), photo: b.photo };
        st.checkpoints.push(c); save(st);
        return send(res, 201, brief(c));
      }
      const act = url.pathname.match(/^\/api\/checkpoints\/([\w-]+)\/(compare|resolve)$/);
      if (act && req.method === "POST") {
        const st = load();
        const c = st.checkpoints.find((x) => x.id === act[1]);
        if (!c) return send(res, 404, { error: "no such checkpoint" });
        const task = getTask(c.taskId);
        const b = await readBody(req);
        if (act[2] === "compare") {
          if (typeof b.photo !== "string" || !b.photo.startsWith("data:image/")) return send(res, 400, { error: "a current photo is required" });
          try {
            const out = await compareWithNemotron({ task, beforeDone: c.done, notes: c.notes, beforePhoto: c.photo, afterPhoto: b.photo, apiKey: apiKey(), fetchImpl });
            const v = verifyProposals(task, c.done, out.raw);
            return send(res, 200, { ...v, model: out.model, usage: out.usage });
          } catch (e) {
            const code = e.code === "NO_KEY" ? 503 : 502;
            return send(res, code, { error: e.message, code: e.code || "ERROR" });
          }
        }
        const r = resolve(task, c.done, b.proposals || [], b.decisions || {});
        if (r.error) return send(res, 400, r);
        // Re-verify the proposals the client echoes back so a tampered list cannot add unknown steps.
        const re = verifyProposals(task, c.done, (b.proposals || []).map((p) => ({ ...p })));
        if (re.proposals.length !== (b.proposals || []).length) return send(res, 400, { error: "proposals failed verification" });
        c.resolution = { done: r.done, chosen: null };
        save(st);
        return send(res, 200, r);
      }
      // static
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (rel.includes("..")) return send(res, 400, "bad path", "text/plain");
      const f = join(here, "public", rel);
      if (!existsSync(f)) return send(res, 404, "not found", "text/plain");
      return send(res, 200, readFileSync(f), MIME[extname(f)] || "application/octet-stream");
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  makeServer().listen(PORT, () => console.log(`pausepoint on http://localhost:${PORT} (${process.env.NEBIUS_API_KEY ? "Nemotron live" : "no NEBIUS_API_KEY: compare disabled"})`));
}
