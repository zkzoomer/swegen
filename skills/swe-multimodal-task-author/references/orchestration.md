# Outer worker and recorded inner author

The operator launches a private Daytona worker from their machine, sends this skill
and an initial prompt, and receives its ZIP. The outer owns capture, task text, review,
and orchestration. The inner owns managed task edits through `helix task author`.

## 1. Understand the assigned issue

Download the supplied Helix URL. Read its brief, references, active template, source,
base commit, assigned issue/PR, and existing tests. Record expected public behavior
and adjacent exclusions in private staging. Do not turn unrelated PR changes into
one task or replace the assigned task.

Use persistent locations such as:

```text
/home/daytona/helix-tasks/       managed downloads only
/home/daytona/author-staging/   drafts, capture scaffolds, QC copies, logs, retry state
/opt/micro1/media-capture-kit/  private runtime tool, never task content
/opt/swegen/skills/             outer-agent skill
/output/                       final delivery only
```

## 2. Capture before the final-task build

For a bug fix, capture the same real scenario on the starting source and working
reference. Inspect decisive frames in both. Use the assigned upstream patch to
establish the working run; show output, never source code/patches. Give the solver
selected broken/working recordings with clear roles.

The kit needs a runnable source environment and reference patch. The outer may
prepare a disposable capture scaffold outside the managed tree from the assigned
source/base/PR. It is capture input, not an independently authored final task. This
allows media capture before launching the main authoring session. If that prerequisite
cannot be established there, report it; use a preliminary recorded session only when
necessary and record the ordering exception.

Read [media.md](media.md) for other category procedures. Missing designs or no meaningful
visual requirement are unsupported outcomes, not permission to fabricate evidence.

## 3. Supply a fair lower-bound prompt

Use the shared brief request, labeled broken/reference attachments, and at most a
necessary symptom phrase in [authoring.md](authoring.md). This is the least explanatory
**fair** version, not a guaranteed minimum pass rate.

Keep every requirement discoverable in media, established interfaces, and the prompt.
Do not omit feature names/constants, hide attachment roles, or make decisive frames
unreadable to lower scores. Draft initial reasoning from known facts and mark unrun
checks honestly; it must support the first reasoning judge. Finalize it after QC.

When evaluations are included, freeze the initial version and review four authorized
rollouts. Up to two true passes makes a candidate for calibration; zero still needs a
fair demonstrated pass before completion. Three or four misses the requested difficulty
screen. Do not manufacture difficulty by weakening the report. Clarify actual confusion
toward one or two true passes out of four, using the live ladder and specified budget.
QC is not those rollouts. Do not invent a local Helix rollout command.

## 4–5. Direct the recorded technical build

Start `helix task author` in the downloaded folder. Supply task-specific context:

> Please build this assigned task at the supplied base. The PR/reference patch is
> author context and must stay out of the solver image and prompt. Save the supplied
> instruction/reasoning text and selected recordings. Build the runtime, minimal
> production reference, public-behavior verifier, and config using the active template.
> Keep grading to the agreed behavior. Demonstrate starter failures, regression
> preservation, reference success, acceptance of an independent correct implementation,
> and rejection of plausible incomplete fixes. Report evidence paths and factual gaps.

Include the actual brief, PR/base, scope/exclusions, staged paths, and exact text. Do
not send unresolved placeholders or the outer guide as the task brief. Observe replies
and tool results; process startup alone does not prove a usable nested conversation.

Review the draft as a whole: coherent scope, public assertions, test/config alignment,
managed files, leakage, media mount, realistic resources, and metadata. The inner saves
final edits; the outer inspects and requests changes. Independently verify starter F2P
fail/P2P pass and gold all-pass.

`helix task oracle` runs Harbor and the reference/verifier. An active session can hold
its writer lock. If blocked, exit cleanly, wait for trace-save confirmation, run oracle,
and resume with `helix task author` for fixes. Retain saved session segments for the
logical task; do not delete locks or promise an uninterrupted session. Proceed to QC
only when the real local oracle is 1.0.

## 6. Validate in five parallel lanes

Follow [qc-loop.md](qc-loop.md). Finish cheap structural checks and starter/reference
validation first. Freeze the task and use separate scratch copies for judgment and
four probes. No final-task edits while the batch is running. Wait, inspect, then repair.

Require the inner session to explain the whole missing invariant and why the repair
accepts valid alternatives. Review the diff and saved controls before rerunning only
affected checks. Each probe has one initial run and at most five reruns across the job;
keep counters outside the task. Invalid findings go in task-root `disputes.md` with
evidence. Never rewrite reports or rerun disputed findings to fish for a green result.

## 7–8. Save traces and final reasoning

Exit the inner session and wait for Helix's saved-session confirmation. Author provenance
lives in Helix's journal/platform; it need not be a transcript file inside the task.
Recover interrupted saves with `helix task author --upload-only`. Task-file upload and
trace upload are separate operations.

The outer reviews the final patch, scope, results, probes, disputes, and actual ablation.
Write final `reasoning.md`: five short sections from [authoring.md](authoring.md), simple
words, no invented results. The pipeline requires `.md`; the job's mention of
`reasoning.txt` does not change that filename. A requested plain-text copy can be returned
beside the ZIP as a companion, outside the managed task.

Every final edit still needs recording. If the main session has closed, reopen a brief
session to save the exact final reasoning/dispute text, then close/save it too. Rerun
`swemultimodal/reasoning-explains-change` and other judges whose inputs materially
changed. Prose alone does not justify another five-lane batch. Executable edits require
fresh starter/reference and affected positive/negative replays.

## 9. Package and return

Default endpoint: return a task ZIP. Use `helix task zip --destination` outside the
managed root, inspect entries, and SHA-256 verify transfer to the controller. Keep raw
journals, credentials, private tools, capture tasks, generated jobs, and replay corpora
out. Preserve Helix's supported archive format instead of rebuilding it manually.
`disputes.md` is task-root author content, not a source file or media attachment.

Return a brief companion summary: task URL/version and hashes, starter/oracle status,
five-lane results and counters, disputes, calibration if run, trace-save state, and
blockers. Exhausted checks remain unresolved; label that handoff incomplete. Upload
only when included in the initial job. Local QC does not establish hosted acceptance
or submission. See [helix-workflow.md](helix-workflow.md).
