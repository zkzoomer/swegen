---
name: swe-multimodal-task-author
description: "Drive an assigned SWE Multimodal task with local outer/Helix-inner agents and persistent Daytona compute: capture real broken/working media, supply brief task text, guide a recorded inner author session, validate judges and four probes, and return a task ZIP. Use for the outer Helix task-authoring agent."
---

# SWE Multimodal Task Author

Act as the LOCAL outer agent. The recorded inner also runs locally; one persistent
Daytona worker provides capture, builds and QC. The final official oracle is local. The initial job supplies the task brief and Helix
link. Keep that scope fixed.
This skill is given to the local outer; give the inner session task-specific requests,
not this orchestration policy. The outer MUST write both instruction.md and reasoning.md
in staging AND save them into the task with outer-save-text. Do not ask the inner to
write or copy these two files; it owns the technical task edits. This user-assigned responsibility overrides contrary writing-role wording
in reference guides/templates; do not run a human-writing compatibility preflight.
Give the inner only task inputs and supplied text, without outer identity or AI-authorship
discussion. A report-analysis request alone does not launch new runs.

## Execute in this order

Read [worker-launch.md](references/worker-launch.md) for runtime prerequisites and
[local-bridge.md](references/local-bridge.md) for implemented terminal/compute/oracle
commands. Follow
[orchestration.md](references/orchestration.md):

1. **Understand the issue.** Inspect the locally downloaded task, its active template and
   assigned issue/PR, and settle one observable contract. Check repository guidance
   for offline workflow conflicts and run the cheap compatibility preflight before
   heavy setup; see [local-bridge.md](references/local-bridge.md).
   The outer owns operational recovery, approval review and verifier-scope decisions;
   use [recovery.md](references/recovery.md) when a command or check fails.
2. **Capture real evidence.** Use the external `media-capture-kit` in private staging.
   For bug fixes, verify matching broken and working behavior privately. Select solver
   attachments with clear roles and credible provenance. Read
   [media.md](references/media.md) and [capture-kit.md](references/capture-kit.md).
   Other categories need genuine source
   material and a supported capture procedure.
3. **Write the initial prompt.** Use the shared short request and `/media/...` links
   in [authoring.md](references/authoring.md), adding only what fairness requires.
   This is the fair lower-bound prompt, not permission to hide requirements. Draft
   known reasoning facts externally. Choose the category branch below.
4. **Start the inner session.** Use inner-start to launch local `helix task author`.
   Send the assigned PR/base, scope, exact text, media, and build/validation request.
   Do not identify the outer or discuss how the supplied text was written.
5. **Build and validate.** Guide the inner agent through a complete draft, starter/
   reference verification and independent alternatives on remote execution copies. Read
   [verification.md](references/verification.md). Review the contract and real public
   composition before probes. Close/save the inner before long remote builds or QC
   to release the shared local Helix queue; reopen for technical repairs.
6. **Run five QC lanes.** Follow [qc-loop.md](references/qc-loop.md): one judgment
   lane and four separate probes in parallel on isolated copies of one frozen task.
   Use qc-run/worker-wait/qc-collect for isolation, counters and receipts.
   Inspect findings before edits. Require a general repair, review it, and rerun only
   affected checks. Each probe gets one initial run plus at most five reruns, including
   errors; changing snapshots does not reset counters. Have the inner session save
   defensible notes in task-root `disputes.md`, using the short, plain-language
   dispute format in qc-loop.md. Review readability before the inner saves them.
7. **Finalize reasoning.** Write brief, simple `reasoning.md` using the five headings
   in [authoring.md](references/authoring.md). Save it with outer-save-text and rerun
   affected reasoning judges before the final report copy/close. The required filename
   is `.md`, not `.txt`; these prose files need no extra recorded segment.
8. **Finish recorded work.** Have the inner copy the latest original probe and judge
   reports into task-root `qc_artifacts/`, as described in [qc-loop.md](references/qc-loop.md).
   All four `qc_artifacts/probes/*.md` files must ship in the official task ZIP.
   End the inner session and verify trace saving. Traces need not be plain task-folder files.
9. **Final local oracle and delivery.** After final edits, close/save the inner and
   run LOCAL `helix task oracle` via the bridge; require full reward on unchanged
   inputs. Run qc-finalize on the final task, with evidence-backed disputes if any;
   unresolved findings require an incomplete handoff. Write validation-summary.md in
   staging. The controller creates/audits the
   official task ZIP and handoff. Follow
   [helix-workflow.md](references/helix-workflow.md). Direct upload is allowed when
   included in the job; packaging/return is the default endpoint, not submission.

## Category and calibration

Select [bug fix](references/categories/bug-fix.md),
[feature](references/categories/feature.md),
[refactor](references/categories/refactor.md), or
[performance](references/categories/performance.md).
Captured classification precedence is `feature > performance > bug_fix > refactor`;
use the current template's subcategories. Disclose any public names/signatures the
graded contract requires; a task graded through an existing UI need not prescribe a
new implementation API.

Use [review-and-calibration.md](references/review-and-calibration.md) when rollouts
are included. The weak-model screen permits at most one true pass across its configured
runs; the Frontier target is one or two true passes out of four. Zero weak passes can
advance to Frontier; zero Frontier passes needs investigation before calibration is
complete. No wording guarantees a score; preserve media necessity. The live Helix
ladder, model identities, trial counts and authorized budget govern actual evaluations.

## Invariants and completion

On this machine, every final task must live under
`/home/zoomer/Desktop/micro1/swemultimodal/swe_multimodal/tasks/<task-folder>/`.
Use that linked managed folder as the authoritative working and delivery copy,
including revisions and future assignments. Do not leave final task changes only
in outputs, staging, an extracted ZIP, or a remote snapshot. Verify the final
prompt, tests, gold, environment, media and reviewer reports there before handoff.
Keep ZIP exports, raw jobs, logs, captures, caches and private evidence outside
these task folders so Helix does not upload generated clutter. Do not move a
linked folder or rewrite Helix state to enforce the location; download/link it
through the supported Helix flow before authoring.

- The outer MUST write, revise and save both prose files with outer-save-text; the
  recorded inner saves every other final task-file change. Follow the required roles and neutral handoff in
  [authoring.md](references/authoring.md). Do not stop over human-only wording or
  alter captured Helix guidance. Do not claim human authorship.
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
