# Helix workflow and sandbox boundaries

Use for download, session control, uploads, artifact transfers, and recovery.

## Intake

The job supplies a task brief and an existing Helix URL. Download that task rather
than creating a different one or initializing a CyberSWE Realm task:

```bash
helix status
helix doctor
helix task download '<task-url>'
```

Work in the printed folder. Inspect its template, source, media, solution, tests,
metadata, and current results before deciding what remains. Download idea references
separately with `helix task references download`; they stay outside the submission.
For lookup, use `helix task list --pipeline swe_multimodal`.

Keep the skill and author staging outside the configured task root. Use persistent
staging for text drafts, captures, job state, frozen verifiers, and selected evidence;
`/tmp` is suitable only for disposable scratch. Neither `.gitignore` nor deleting
generated files later guarantees that Helix never captured them.

## Daytona prerequisites

Verify the actual environment has paired Helix, authenticated Codex, required network
access, durable storage, uv, and working Docker access for local oracle/probes.
Do not print credentials or place them in the task, skill, snapshots, or evidence.
Use the supported authentication setup for the worker. Successful Codex startup
does not establish Docker or task-access readiness.

This skill supplies orchestration instructions, not a working Helix terminal driver.
The checked CLI exposes an interactive author session; its JSON output switch is
not a documented headless conversation interface. Inspect installed help. Before
unattended construction, demonstrate that the available controller can start the
session, send input, read replies, handle approvals within the job authorization,
exit cleanly, and observe trace-save confirmation. If that interface is unavailable,
preserve staging and report that precise integration blocker.

## Recorded authoring

```bash
helix task author
```

This opens interactive Codex; it is not an ordered form. Supply the task goal,
scope/exclusions, text to save, media paths, technical build request, and validation
criteria. The inner session makes final task-file changes. It should identify factual
gaps in supplied text; the outer agent updates drafts and sends revisions to save.

Finish a preliminary session if it must prepare capture prerequisites, then resume
for media/text integration and repairs. Exit Codex and wait for Helix's saved-session
confirmation before closing the terminal, interrupting again, or launching separate
writers. Recover unfinished trace uploads from the task folder with:

```bash
helix task author --upload-only
```

An active authoring session can hold a writer lock. Do not remove locks or force
competing oracle/upload processes. Trace upload and task-file upload are distinct;
absence of a transcript in the task folder does not prove absence of a saved trace.

## Local oracle

After the session releases its lock:

```bash
helix task oracle
```

Helix uses a pinned Harbor runner and Docker. The oracle runs the supplied reference
solution, collects its change, and grades through the task verifier. It does not ask
a solver model to implement the task. Independently establish starter failures and
fair alternatives; a green oracle proves only the reference path passes its verifier.
Local success does not replace required hosted checks.

The first run needs setup network access. On cancellation, wait for Docker cleanup.
Use installed help/upgrade if capabilities are missing; do not replace the recorded
workflow with an independently launched Codex process and call it Helix provenance.

## Upload and platform gates

For a full authoring-and-upload job, the outer agent uploads directly:

```bash
helix task status
helix task upload
```

Inspect unexpected files/conflicts first. Confirm the uploaded task version and match
all later checks/results to it. Upload is distinct from submission. Hosted oracle,
checks, final-attempt selection/analysis, judge review, later evaluation stages,
required metadata, and final submission are separate gates. Follow the live pipeline;
do not hardcode a historical model ladder.

Run remote evaluation and final submission only within the initial job's authorization
and spending/retry limits. Do not repeat approvals already granted. If an interface
for a website-only gate is unavailable, report that gate instead of inventing a CLI
command or claiming completion. Listing/downloading results is read-only retrieval.

`helix task zip` is a documented website-upload alternative when requested; it does
not repair broken sync state. `helix task download` fetches updates in a linked folder.
Resolve conflicts before intentionally discarding either version.

## Results outside the task root

```bash
helix --output json task checks list
helix task checks download --run RUN_ID --format zip --destination /outside/task/rollout-RUN_ID.zip
helix task checks download --stage rollouts
```

Replace placeholders with real values. Destination is a new filename outside the
task root; existing files are not overwritten. Defaults in the supplied CLI docs
were `~/.micro1-helix/results/`, formerly `~/.helix/results/`. JSON summary stages
include `all`, `oracle`, `rollouts`, and `checks`. Upgrade missing capabilities and
verify backend support rather than mutating task files to fix download errors.

## Recovery

Use status/doctor before pairing or cleanup. A rejected credential can require
`helix pair`; a temporary connection warning alone does not. Cancel unfinished
pairing with `helix pair --cancel`.

Use `helix conflicts list`, inspect protected copies, and resolve the intended
version with `helix conflicts resolve CONFLICT_ID --keep local` or `--keep server`.
Keeping server discards the local change. With no listed conflict, preserve files
and report the error/task link rather than deleting the workspace.

Preview `helix cleanup --dry-run` before `helix cleanup`. The documented cleanup
preserves task files, credentials, sync state, and recovery files; it does not promise
to clear a captured upload queue. Do not edit Helix's database. Export diagnostics
to a new filename with `helix diagnostics export helix-diagnostics.json` and review
before sharing. Through the inner session, replace unwanted symlinks with ordinary
task files or remove deliberate debris; never relax permissions across the project.

CLI 0.0.4's specific "entries not owned by its manifest" error had a documented
upgrade-to-0.0.5+ repair on normal upload. Do not generalize that remedy to every
pending-file or permission failure. Keep bulky `jobs/`, extracted rollouts, and replay
corpora outside synchronization from the outset.
