---
name: swe-multimodal-task-author
description: "Coordinate authoring and polishing an assigned SWE Multimodal task from a Helix link: stage prompt/reasoning and real media, direct an inner helix task author session, validate the verifier, review rollouts, and upload. Use for the outer agent's Helix workflow; CyberSWE security-advisory generation uses a separate workflow."
---

# SWE Multimodal Task Author

Act as the outer agent for one assigned task. Receive the task brief and Helix URL,
keep that scope fixed, and continue from the actual lifecycle stage. A question about
an existing report does not authorize a new build, model run, or upload.

## Roles and workspace

- The outer agent writes short, plain `instruction.md` and `reasoning.md` drafts,
  coordinates real capture, inspects evidence, and uploads the finished task.
- The inner agent runs through `helix task author`. It saves supplied text/media
  and builds or repairs final task files. Keep outer staging outside the managed
  task root; make final task-file changes through that recorded session.
- Give the inner session the task, supplied text, media paths, scope, and validation
  requirements. Its handoff need not identify the controller or discuss the agent
  architecture. Preserve actual provenance in author evidence; make no invented
  human-authorship claims and do not modify captured Helix guidance.
- Use the active SWE Multimodal template and pipeline. This skill does not replace
  applicable higher-priority instructions. Read the compatibility note in
  [authoring.md](references/authoring.md) before the first writing handoff.

## Route by stage

Read only the relevant reference, then load the next one when the work reaches it.

1. **Intake and recorded session:** read [helix-workflow.md](references/helix-workflow.md).
   Download the supplied task, inspect state, establish external staging, and verify
   the controller can actually communicate with the inner session. Never claim that
   nesting works merely because the process started.
2. **Category and contract:** select one branch:
   [bug fix](references/categories/bug-fix.md),
   [feature](references/categories/feature.md),
   [refactor](references/categories/refactor.md), or
   [performance](references/categories/performance.md).
   Classification precedence in the captured guidance is
   `feature > performance > bug_fix > refactor`; use current template subcategories.
3. **Text and media:** read [authoring.md](references/authoring.md) and
   [media.md](references/media.md). Draft early, capture real output using the
   preinstalled `media-capture-kit`, then reconcile the text with verified results.
   If capture needs an environment/reference patch, have a preliminary inner session
   prepare those first. Do not fabricate a missing design or unsupported reproduction.
4. **Task build and validation:** read [verification.md](references/verification.md).
   Direct the inner session to build the environment, production reference patch,
   hidden tests, and config. Finish its trace before separate oracle/upload commands.
   Require starter/reference evidence and fair positive/negative controls.
5. **Probe or rollout findings:** read [review-and-calibration.md](references/review-and-calibration.md).
   Inspect the actual patch and decisive result before changing anything. Preserve
   justified coverage; do not append a test for every judge report or lower fairness
   standards to hit a score.
6. **Upload and completion:** return to the upload section of
   [helix-workflow.md](references/helix-workflow.md). In a full authoring-and-upload
   job, upload directly after validation and trace-save confirmation. Honor any narrower
   user scope. Remote evaluation, spending, and final submission must be covered by
   the job; reuse existing authorization without asking repeatedly.

## Invariants

- Grade one coherent public behavior; every requirement must be discoverable from
  prompt/media, existing interfaces, or authoritative tools available to the solver.
- Keep gold patches, hidden tests, reasoning, upstream answers/history, capture
  scripts, and author traces outside the solver-accessible image.
- Preserve managed harness/parser/helpers and `environment/skills/`. Use the
  template's separate verifier and keep protected test paths disjoint from gold paths.
- Every F2P fails on starter and passes on gold; every P2P passes on both. Accept
  independent correct implementations and reject realistic incomplete fixes.
- Evaluate the real image and resource limits. Preserve Daytona build-concurrency
  controls. Infrastructure failure or missing evidence cannot become a pass.
- Treat the platform's current rollout plan as authoritative. Historical counts,
  model names, local paths, and combobox fixtures are examples, not defaults.

## Finish or return a precise blocker

Report the task URL/version, upload state, validation/probe results, rollout verdicts
if reviewed, evidence location, and remaining action. Preserve staged work before
returning a blocker. Reuse saved evidence first; stop at the job's spending/retry
limit or when another attempt requires missing input or cannot resolve the same
external condition. Never report hosted execution, upload, approval, or submission
that was not observed.

For provenance and the distinction from the existing CyberSWE factory, consult
[source-notes.md](references/source-notes.md) only when needed.
