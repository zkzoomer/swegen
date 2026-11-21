# SWE Multimodal outer-worker instructions

These instructions govern the task-building worker when it receives `JOB.md`.
When editing this controller repository itself, follow the operator's requested
scope; do not launch task jobs, probes, or deployments just to edit controller code.

## Assignment and workflow

Read `/home/daytona/workspace/JOB.md`. Use the installed
`$swe-multimodal-task-author` skill and its stage-specific references. The job provides
an existing Helix task URL, assigned issue/scope, primary-source references, and budget.
Download that task. Preserve its identity, active template, and author metadata;
do not create a substitute task or invent IDs.

Act as the outer agent. Understand the assigned behavior, capture real comparable
broken/working media with the private runtime kit, and write the shortest fair initial
prompt with clear `/media/...` links. Then guide an inner `helix task author` session
through construction and local oracle success. Use a terminal session that can send
input, read responses, and exit cleanly. If that capability is unavailable, preserve
staging and report it; do not replace recorded authoring with direct final task edits.

Keep outer drafts, captures, QC copies, and retry state outside the managed Helix root.
Every final task-file change, including supplied instruction/reasoning/dispute text,
is saved through recorded authoring. Keep actual provenance; do not modify captured
Helix guidance or invent authorship. The task's active requirements still apply.

## Quality and bounded execution

- Grade one coherent, discoverable public behavior. Accept different correct repairs
  and reject realistic incomplete fixes; do not require the reference implementation.
- Preserve managed harnesses/runtime skills. Check starter F2P fail/P2P pass, gold
  all-pass, independent alternatives, negative controls, and actual oracle reward 1.0.
- Run one judgment lane and the four separate probes concurrently on isolated copies
  of one frozen task. No edits during a batch. Inspect evidence before requesting a
  general repair, then review its diff and replay controls before targeted reruns.
- Each probe gets one initial run plus at most five reruns, errors included, across
  the whole job. Do not reset counters on new snapshots or sessions. Follow the
  skill's matching per-check bound for judges and any smaller job/time/spend limit.
- Save evidence-backed invalid-finding notes through the inner session in task-root
  `disputes.md`. A dispute or missing evidence never becomes a fabricated pass.
- Finish/save recorded sessions. The outer writes concise final five-section
  `reasoning.md`; use a brief resumed recorded session to save it if needed, and rerun
  affected reasoning judges. No template placeholders remain in a completed task.
- Run hosted evaluations, upload, or submit only when included in `JOB.md`. Use the
  live Helix ladder and inspect true/false verdicts. The fair initial four-run screen
  targets at most two true passes; final calibration aims for one or two, if authorized.

## Resources and private tooling

Use the actual sandbox CPU, memory, disk, and job lifetime; do not assume old resource
values. Preserve `M1_BUILD_JOBS` and appropriate build limits. Five lanes can need more
resources than one verifier. Report resource blockers rather than counting OOMs as
model failures or changing production behavior to fit the worker.

The proprietary capture kit is runtime-only. Keep its source/docs, credentials, raw
journals, capture scaffolds, reproduction scripts, generated jobs, dependencies, and
compiler outputs out of task source/media/ZIPs. Only selected real visual output is
solver media. Use the supported capture executor with explicitly configured access;
do not copy credentials into prompts or assume the controller key was forwarded.

## Handoff and durability

Default delivery is one `/output/<task-name>-handoff.zip` containing exactly:

```text
<task-name>.zip          unchanged output of helix task zip
validation-summary.md   concise actual results, retries/disputes, trace state, blockers
```

The Helix task contains `reasoning.md`, media, source, solution, verifier, metadata,
and root `disputes.md` when needed. Do not invent a proposal document or extra archive
format inside that official task ZIP. Keep bulky raw evidence outside the task.

If task work exists but normal completion is blocked or a retry limit is exhausted,
return `/output/<task-name>-recovery-handoff.zip` containing exactly:

```text
<task-name>-work-in-progress.zip  permitted current task state needed to resume
failure-summary.md              precise blocker, completed work, evidence, next action
```

A recovery ZIP is explicitly incomplete. Never discard useful work to obtain a green
result, claim unresolved checks passed, or leave all work only in a disposable worker.
Use persistent author staging for assembly; `/output` is a one-file delivery slot.
Verify ZIP contents, size, and SHA-256 before finishing. The controller audits the
archive, downloads it, verifies its hash, then cleans up the worker. Archive auditing
checks packaging only; it does not rerun tests or prove hosted acceptance.
