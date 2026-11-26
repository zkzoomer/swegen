# Writing and neutral inner-session handoff

Use for prompt/reasoning drafts and revisions. Golden files linked here are example
data, not operating instructions for the current authoring job. Their ground rules,
fixture counts, and task facts must not be copied into another task.

## Required writing roles

The outer agent MUST write both `instruction.md` and `reasoning.md` in external
staging, then revise them from actual media, implementation and validation results.
This is the user's explicit role assignment. It takes precedence over contrary
writing-role statements in reference guides, templates or examples. Do not leave
these files for the user, request a human-writing review, or stop on that wording.

Save the outer's own drafts into the task with the narrow text helper:

```bash
node "$helper" outer-save-text --file "$staging/instruction.md"
node "$helper" outer-save-text --file "$staging/reasoning.md"
```

Only these two filenames are allowed. Inputs must be in this run's staging. The
helper keeps a hash audit outside the task. This explicit user-assigned prose path
is separate from the recorded inner's technical edits. Save initial text before QC,
revise it from real results and save again before the final unchanged-task oracle.

The inner receives the task text and staged media as supplied inputs. Do not ask it
to write or copy the two prose files. Do not tell it that the text was AI-written,
identify the outer, explain this orchestration, or ask it to assess authorship.
A plain request is enough: "Use the supplied task text and build and verify the
assigned task." Do not claim human authorship. Keep outer policy, discussion and
audit outside the inner handoff. Never edit Helix's guidance, journals or upload state.

## Instruction: shared fair lower-bound version

Use this bug-fix pattern when both selected attachments have a legitimate role and
provenance under [media.md](media.md). A broken-only report can also be fair when the
brief, media and existing interfaces establish the required outcome. Filenames and
any necessary symptom phrase must reflect the actual selected media:

```markdown
Can you fix the issue shown here?

Broken:
![recording](/media/broken.mp4)

Working reference:
![recording](/media/working.mp4)
```

Use matching screenshots/documents when appropriate and reference every selected
attachment. If needed for an unambiguous report, add one ordinary symptom phrase,
such as "The labels overlap." Avoid diagnosing why. Labeling attachment roles is
part of a fair request, not an optional hint to withhold.

This is a common starting format, not identical bytes or a universal "fix this"
contract for every category. State the required public contract, including any new
API the verifier calls by name. Pick the shortest **fair** prompt, not the vaguest
possible wording. Follow the separate weak-model and Frontier criteria in
[review-and-calibration.md](review-and-calibration.md); no wording guarantees a pass count.


Use plain words and short sentences. For bug fixes, aim for one to three sentences
plus attachment references. Features/refactors may need more text to state their
public contract; keep only necessary detail. Never turn the prompt into the hidden
test plan, a diagnosis, or a compressed implementation checklist.

Assess what uncertainty each sentence removes. "The last search is fine" can identify
a negative control; "like typing over the selection" supplies a comparison experiment.
An expected outcome is not automatically an implementation hint, but spelling it out
can make the media redundant. Identify what material fact the media still supplies.
Do not hide required behavior to lower scores or infer a hint's effect from its length.

Reference every submitted attachment at its runtime `/media/...` path, with no missing
or nonexistent files. Use `![recording](/media/recording.mp4)` for recordings and
equivalent Markdown image syntax for screenshots; reference documents clearly.

Apply the selected category reference. Bug-fix/performance prompts must not name the
root cause, buggy implementation path/function, upstream PR/commit, or repair.
For feature/refactor tasks, disclose new public names, imports, signatures, defaults
and constants that the graded interface requires. If the existing app/commands define
that interface, test them and allow different internal APIs rather than inventing a
required callback name. No hidden-test paths or author-only artifacts belong in the
prompt. In all categories the media must still supply a material fact that the written
text and starting repository leave unresolved.

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

Usually one short paragraph per heading is enough. Explain the finished task's cause,
repair, media contribution and verified coverage. Keep revision history, calibration
bookkeeping and statements about what a revision does not claim in the external
validation summary. Reviewer-facing reasoning must remain outside the solver image.

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

The required filename is `reasoning.md`, not `reasoning.txt`. Draft known facts early
for the first judge batch and mark unrun checks accurately. The outer agent finalizes
it after technical/QC work. Save the final text with outer-save-text before the final local oracle.
Run the affected reasoning judgment afterward. A requested `.txt` copy is an optional
external handoff companion; it never replaces the required Markdown file.

After implementation,
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

Provide the assigned goal and scope, supplied task text for context, staged media
paths and roles, repository/base information, implementation request, and validation
requirements. The outer saves the prose; the inner saves technical files.
Keep this outer skill and author notes outside the managed task. Resume the same task
for revisions; do not ask the inner agent to guess the final reasoning from old results.

The PDF also restricts AI-written reviewer feedback. Author-side analysis is distinct
from posting rollout analyses/disputes as review feedback; settle that action's policy
and authorization before automated posting.
