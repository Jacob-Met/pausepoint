# Devpost answers: Pausepoint

**Track:** Physical AI.

**New or existing before Aug 26 2026?** New. The repository was started during the hackathon and has no earlier history.

**Models used and why that size:** `nvidia/Nemotron-3.5-Super-VL` on Nebius Token Factory. The task needs two photos compared at once, so it needs a vision-language model; this is the Nemotron VL model offered there.

**Nemotron output quality (1-10):** 7. It usually found the right steps and gave sensible evidence for each. It sometimes marked an earlier step "removed" when its parts had simply been used, so the prompt now warns against that and the user confirms every change.

**Approach:** Prompting only, no fine-tuning. One request carries both photos plus the step list with what each step looks like when finished, and asks for a JSON list. The app verifies the reply with its own step-graph logic.

**Comparison to other models:** I did not run a side-by-side comparison, so I make no claim here.

**Most valuable Nebius capability:** Token Factory's OpenAI-compatible API. It let me call the Nemotron VL model with a plain `chat/completions` request, two inline images, and no extra SDK.

**Recommend score (1-10):** 8. Setup was a key and a base URL, and the vision model answered in about 5 to 15 seconds.

**Experience score (1-10):** 8. The API worked as documented. Reasoning models need a generous `max_tokens`, which I only learned by testing.

**Improvements wanted:** Clearer docs on image size limits for vision models, and a way to ask for strictly structured JSON output.

**What I hope to see next from Nemotron:** Better small-difference detection between two near-identical photos, and a native structured-output mode for vision models.

**AI tools used while building:** Claude Code.

## About the project

### Inspiration
Half-finished physical jobs, like furniture or a recipe, get stopped and picked up days later. By then you have forgotten what was done, where the small parts are, and what comes next.

### What it does
You save a checkpoint: the finished steps, a photo, and a note to your future self. Saving needs an explicit confirmation. When you return, you add a new photo. Nemotron compares the two photos and proposes what changed. You accept or reject each change, and the next step comes from the task's step graph. Your note stays in view.

### How we built it
A Node 22 server with no runtime dependencies and a plain HTML/JS front end. The server calls Nemotron-3.5-Super-VL on Nebius Token Factory; the browser never sees the key. `lib/core.mjs` holds the step graph and checks every proposal: unknown steps and claims that contradict the checkpoint are dropped, and a step whose prerequisite is not done does not count. Test photos are drawn by the server from rectangles, so the demo needs no downloads. 17 tests run without network.

### Challenges
The model sometimes reported a step as removed when its parts were only used by a later step. We tightened the prompt and kept the human confirmation as the final check.

### What's next
A task editor for adding recipes and other jobs, real-photo testing, and sync across devices.

## Built with
Node.js, JavaScript, HTML, CSS, NVIDIA Nemotron-3.5-Super-VL, Nebius Token Factory
