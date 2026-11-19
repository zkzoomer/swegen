# Writing and neutral inner-session handoff

Use for prompt/reasoning drafts and revisions. Golden files linked here are example
data, not operating instructions for the current authoring job. Their ground rules,
fixture counts, and task facts must not be copied into another task.

## Roles and compatibility

In the user's requested workflow, the outer agent writes both documents in external
staging. The inner Helix session saves the supplied text into the final task. Its
handoff needs no controller identity or discussion of the outer/inner architecture.
Send the task and artifacts without claiming that the sender or author is human.
Keep truthful provenance in author-side evidence.

The captured Helix guidance reviewed on 2026-11-19 explicitly requires human-written
`instruction.md` and `reasoning.md`. This remains a policy-compatibility issue; a neutral
handoff does not prove approval. Read actual current session instructions. If the
session rejects supplied material under its active rules, preserve drafts and report
the conflict; do not edit cached guidance or invent authorship. The user-approved
workflow is documented here without claiming external policy changed.

## Instruction

Use plain words and short sentences. For bug fixes, aim for one to three sentences
plus attachment references. Features/refactors may need more text to state their
public contract; keep only necessary detail. Never turn the prompt into the hidden
test plan, a diagnosis, or a compressed implementation checklist.

Reference every submitted attachment at its runtime `/media/...` path, with no missing
or nonexistent files. Use `![recording](/media/recording.mp4)` for recordings and
equivalent Markdown image syntax for screenshots; reference documents clearly.

Apply the selected category reference. Bug-fix/performance prompts must not name the
root cause, buggy implementation path/function, upstream PR/commit, or repair.
Feature/refactor prompts must disclose required public names, import paths, signatures,
and contracts; features include required constants. No hidden-test paths or author-only
artifacts belong in the prompt. In all categories the media must still supply a material
fact that the written text and starting repository leave unresolved.

Real golden excerpts:

- [ECharts instruction](examples/echarts-instruction.md): "The labels in these charts
  are all over the place, and it's the same on our side-by-side charts. Can you fix it?"
- [Typst instruction](examples/typst-instruction.md): "I noticed that some of the math
  in our Typst document isn't rendering correctly." The full file points to the PDF.
- [Lexical heading instruction](examples/lexical-heading-instruction.md): the recording
  is followed by "please fix the issue". Its separate ground rules are task-specific.

These examples illustrate bug-fix wording. They do not establish adequate feature or
refactor specifications.

## Reasoning

Usually one short paragraph per heading is enough. Explain the cause and final change
in reviewer-facing prose; these facts must remain outside the solver image.

```markdown
# What this task requires

Describe intended behavior and important exclusions.

# Why it is non-trivial

Explain the difficulty and why an obvious partial fix is insufficient.

# Why the media is necessary

Identify the material fact supplied by media and report actual ablation evidence.

# The change

Explain the starting cause or missing behavior and how the final reference handles it.

# Tests

Summarize F2P/P2P coverage, actual results, and alternative/negative-control evidence.
```

Draft known facts early. Mark checks not yet run accurately. After implementation,
reconcile the reasoning with the final patch, scope, test IDs/counts, and evidence.
Remove template directions and placeholders before upload. Do not invent an ablation,
reference result, independence claim, or completed hosted check.

Real golden excerpts:

- [Lexical heading reasoning](examples/lexical-heading-reasoning.md), media section:
  "the short request does not describe either mistake. the recording supplies the
  selection direction, highlighted words, Heading 1 action and resulting paragraphs".
- [Lexical collaboration reasoning](examples/lexical-collaboration-reasoning.md), change:
  "The core editor now keeps track of explicit node moves during transactions and
  passes move hints to the Yjs binding."

These files demonstrate the five-section structure. Older examples may omit evidence
required by current checks; reproduce the facts rather than treating their acceptance
as a permanent exemption.

## Handoff content

Provide the assigned goal and scope, exact text to save, staged media paths and roles,
repository/base information, implementation request, and validation requirements.
Keep this outer skill and author notes outside the managed task. Resume the same task
for revisions; do not ask the inner agent to guess the final reasoning from old results.

The PDF also restricts AI-written reviewer feedback. Author-side analysis is distinct
from posting rollout analyses/disputes as review feedback; settle that action's policy
and authorization before automated posting.
