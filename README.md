# pausepoint

Come back to a half-finished physical job and pick up exactly where you left off.

You pause a task (assembling furniture, cooking a recipe) by saving a checkpoint: the steps you finished, a photo, and a note to your future self. Saving requires an explicit confirmation. When you return, you add a new photo. NVIDIA Nemotron on Nebius Token Factory compares the two photos and proposes what changed. You confirm or reject each change. The next action then comes from the task's step graph, with your note still in view.

## Quick start

Requires Node 22 or newer. No npm install; there are no runtime dependencies.

```sh
export NEBIUS_API_KEY=your-token-factory-key
node server.mjs
# open http://localhost:4419
```

Without `NEBIUS_API_KEY` the app still runs, and the compare step shows a clear message instead of a result. Set `PORT` to change the port and `PAUSEPOINT_DATA` to change where checkpoints are stored (default `./data`).

Run the tests with `node --test`. They need no network or key.

### Try it in two minutes

1. On "Pause here", tick steps 1 and 2, press "Draw a test photo of this progress", type a note, tick the confirmation, and save.
2. On "Return", pick "Built through step 5" as the test photo and press "Compare with Nemotron".
3. Accept or reject each proposed change, then press "Find my next step" and choose what to do next.

The test photos are drawn by the server from rectangles (`lib/png.mjs`) so nothing needs downloading. You can also upload real photos.

## How it uses NVIDIA Nemotron on Nebius Token Factory

- Model: `nvidia/Nemotron-3.5-Super-VL` (override with `NEBIUS_MODEL`). Comparing two photos needs a vision-language model; this is the Nemotron VL model on Token Factory.
- Call: the server sends one `chat/completions` request to `https://api.tokenfactory.nebius.com/v1` with both photos and the task's step list, and asks for a JSON list of `{step, kind: added|removed, evidence, confidence}`. The key stays on the server; the browser never sees it. See `lib/nebius.mjs`.
- The model proposes, the app verifies. `lib/core.mjs` discards any proposal that names an unknown step, claims something already done at the checkpoint, or removes something that was not done. What survives is shown to you, and nothing counts until you accept it. Accepted changes are then re-checked against the step graph: a step whose prerequisite is not done is flagged and not counted, and removing a step also unwinds the steps that depend on it.
- The next step is never chosen by the model. It is the first open step in the graph whose prerequisites are all done, and every other open step is offered as an alternative.

## Honest limits

- One task template ships (a bookshelf, `lib/core.mjs`). The graph format is data, so adding a recipe is a few lines, but there is no editor yet.
- Photo comparison is only as good as the photos. The model can miss a small difference or report one that is not there, which is why each change needs your confirmation. In testing it sometimes marked an earlier step "removed" when its parts had simply been used; the prompt now discourages this and the confirmation step catches the rest.
- Checkpoints are stored in a local JSON file with photos inline. There are no accounts and no sync.
- The compare call takes roughly 5 to 15 seconds.

## Layout

```
server.mjs        HTTP server and API
lib/core.mjs      step graph, checkpoint validation, proposal verification, next action
lib/nebius.mjs    Token Factory request and reply parsing
lib/png.mjs       generates the test photos
public/           the UI (no external fonts or CDNs)
test/             node --test suite
demo/             demo script and submission answers
```

## License

MIT. See `LICENSE`.
