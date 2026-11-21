---
name: swe-multimodal-task-author
description: "Drive an assigned SWE Multimodal task from a Helix link in Daytona: capture real broken/working media, supply brief task text, guide a recorded inner author session, validate judges and four probes, and return a task ZIP. Use for the outer Helix task-authoring agent."
---

# SWE Multimodal Task Author

Act as the outer agent launched from the operator's machine into a private Daytona
worker. The initial job supplies the task brief and Helix link. Keep that scope fixed.
This skill is sent to the outer worker; give the inner session task-specific requests,
not this orchestration policy. A report-analysis request alone does not launch new runs.

## Execute in this order

Read [worker-launch.md](references/worker-launch.md) for the initial prompt, runtime
prerequisites, and actual integration limits. Follow
[orchestration.md](references/orchestration.md):

1. **Understand the issue.** Download the supplied task, read the active template and
   assigned issue/PR, and settle one observable contract.
2. **Capture real evidence.** Use the external `media-capture-kit` in private staging.
   For bug fixes, inspect matching broken and working recordings and give the solver
   both with clear roles. Read [media.md](references/media.md) and
   [capture-kit.md](references/capture-kit.md). Other categories need genuine source
   material and a supported capture procedure.
3. **Write the initial prompt.** Use the shared short request and `/media/...` links
   in [authoring.md](references/authoring.md), adding only what fairness requires.
   This is the fair lower-bound prompt, not permission to hide requirements. Draft
   known reasoning facts externally. Choose the category branch below.
4. **Start the inner session.** Launch `helix task author` in the downloaded folder.
   Send the assigned PR/base, scope, exact text, media, and build/validation request.
   Its handoff need not identify the controller; preserve truthful provenance.
5. **Build and validate.** Guide the inner agent through a complete draft, starter/
   reference verification, independent alternatives, and local oracle 1.0. Read
   [verification.md](references/verification.md). Save/close and resume sessions when
   Helix's writer lock requires it; wait for trace-save confirmation.
6. **Run five QC lanes.** Follow [qc-loop.md](references/qc-loop.md): one judgment
   lane and four separate probes in parallel on isolated copies of one frozen task.
   Inspect findings before edits. Require a general repair, review it, and rerun only
   affected checks. Each probe gets one initial run plus at most five reruns, including
   errors; changing snapshots does not reset counters. Have the inner session save
   defensible invalid-finding notes in task-root `disputes.md`.
7. **Finish recorded work.** End the inner session and verify trace saving. Traces
   need not be plain task-folder files.
8. **Finalize reasoning.** Write brief, simple `reasoning.md` using the five headings
   in [authoring.md](references/authoring.md). If already closed, open a brief recorded
   session to save it, then close/save again. Rerun affected reasoning judges. The
   required filename is `.md`, not `.txt`.
9. **Return the task.** Use `helix task zip`, inspect it, and send the ZIP plus a brief
   evidence summary back to the operator. Follow
   [helix-workflow.md](references/helix-workflow.md). Direct upload is allowed when
   included in the job; packaging/return is the default endpoint, not submission.

## Category and calibration

Select [bug fix](references/categories/bug-fix.md),
[feature](references/categories/feature.md),
[refactor](references/categories/refactor.md), or
[performance](references/categories/performance.md).
Captured classification precedence is `feature > performance > bug_fix > refactor`;
use the current template's subcategories. Features/refactors need explicit public APIs.

Use [review-and-calibration.md](references/review-and-calibration.md) when rollouts
are included. This job's screening target is at most two true passes out of four,
then fair clarification toward one or two. Zero passes is promising difficulty evidence,
not completed calibration. No wording guarantees a score; preserve media necessity.
The live Helix ladder and authorized run budget govern actual evaluations.

## Invariants and completion

- The outer writes staged prompt/reasoning text; the recorded inner agent saves every
  final task-file change. Read the compatibility note in
  [authoring.md](references/authoring.md); do not alter captured Helix guidance.
- Grade one discoverable behavior. Accept independent correct implementations and
  reject realistic incomplete fixes. Preserve managed harnesses and runtime skills.
- Keep gold, hidden tests, notes, traces, capture scripts, and answer-bearing history
  out of the solver image. Ship only selected visual output as media.
- No edits during a QC batch. Bind evidence to file hashes and review stale dependencies
  after changes. Infrastructure failures never become passes.

Return the ZIP path/hash, task URL/version, validation results, dispute/retry status,
and blockers. Stop at retry/budget limits and preserve an explicit incomplete handoff
if needed. Never claim unobserved execution or approval. For provenance consult
[source-notes.md](references/source-notes.md).
