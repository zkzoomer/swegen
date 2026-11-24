# Runtime bridge commands

Read the context JSON path supplied in JOB.md / SWEGEN_CONTEXT_PATH. Fields include
helper, taskDir, staging, logs, workerId, kitDir and remoteStaging. Use the absolute
helper path in that file. SWEGEN_CONTEXT_PATH is inherited by both local agents.
The examples below use shell variables filled from that actual context:

```bash
node "$helper" inner-start
node "$helper" inner-read
node "$helper" inner-wait --timeout 45
node "$helper" inner-send --file "$staging/inner-request.md"
node "$helper" inner-exit
```

These are implemented bridge actions, not Helix flags. inner-start opens the real
local `helix task author` in the linked task. Read the screen and handle genuine
prompts, then send one request at a time. Multiline files are pasted literally.
inner-read returns running, phase, ready, launchStarted, exitCode, traceSaved, screen
and the session log path. Wait for ready=true before inner-send. A queued or
connecting launch returns sent=false and sends no bytes; retry the same request only
after readiness. A process existing is not proof that its terminal has connected.
The screen is bounded and remains available to the agent. Logs save status and a
failed exit screen, without repeated terminal redraws. Helix retains its author trace.
inner-wait waits for the first connection, an approval prompt, process exit, or at most 55 seconds,
then returns the rendered state. Use it for ordinary waiting; inspect the screen
before acting. Local Helix write operations share a cross-job queue: a waiting launch is
not a failure. Close/save the session before long remote builds or QC so other jobs
can author, then reopen it for repairs. Download references before opening it; other
Helix write operations within the same active session fail promptly to avoid deadlock.
Verified `helix doctor` and `helix task status` forms, with optional `--output json`,
can run concurrently without taking the outer queue; native Helix locks remain intact.
Unknown options still queue.
For genuine menus, inner-key --key enter/up/down/escape/tab/y/n sends a bounded
terminal key; read the prompt and act within the job authorization.
If needed, inner-interrupt sends one Ctrl-C; it does not certify a saved trace.

Use inner-exit only when the inner is ready to close. Poll inner-read until running
is false and traceSaved is true. Verification reads Helix's journal for this task:
the current segment must append a completed capture, pending_snapshot must be null,
and uploaded_digest must equal the SHA-256 of events.jsonl. A console success phrase
is not required or sufficient. inner-read reports the journal path or traceError.
For a queued launch that has never started Helix, inner-exit cancels the wait instead
of typing into a disconnected terminal. It returns queuedCancelled=true; wait for
running=false. There is no authoring trace to save for that entry. It cannot certify
any edits, and final delivery still requires at least one real saved author segment.

If upload recovery is needed, use supported local `helix task author --upload-only`,
then poll inner-read to recheck the receipt. uploaded=0 means no additional sessions
were uploaded; it is not a failure. Never edit journals, receipts or save state.
An unresolved or incomplete capture remains a blocker.

## Compute

```bash
node "$helper" worker-sync --source "$task_dir"
node "$helper" worker-sync --source "$staging/capture-source-task"
node "$helper" worker-run --file "$staging/run-check.sh" --cwd "$remote_run_dir"
node "$helper" worker-status --job "$job_id"
node "$helper" worker-wait --job "$job_id" --timeout 45
node "$helper" worker-logs --job "$job_id"
node "$helper" worker-fetch --remote "$remote_output" --local "$staging/result.mp4"
```

worker-sync accepts only the linked task or a directory under local staging. It
returns a verified content ID/path. The first snapshot is full; later transfers
apply changed files and deletions without altering earlier snapshots. Root generated
jobs/QC/credentials and dependency caches are excluded and reported. Production
folders named jobs are preserved. Symlinks require explicit resolution.

Write shell scripts locally in staging. worker-run sends the script, starts a job in
the same persistent worker and returns its job ID. Use worker-status and worker-logs
while it runs. worker-logs returns recent stdout/stderr plus paths to complete local
copies; final remote evidence is collected before worker cleanup. worker-wait polls
in code and returns status plus logs when done. Completed jobs retain timing receipts.
Ordinary log output is limited to 4000 characters per stream; full logs stay local. Capture/probe paths
belong under /home/daytona/author-staging or /home/daytona/capture-staging. Copy frozen
snapshots into per-run directories before modifying source. Reuse Docker cache.

worker-fetch downloads one file, verifies SHA-256 and writes only a NEW local staging
path. Fetch recordings, frame images, reports or permitted result archives there.
The inner then copies chosen final files into the local task while recording. A raw
archive is not evidence that its media or assertions are correct; inspect contents.

For several artifacts, write a staging JSON array of {"remote":"...","local":"..."}
objects and use worker-fetch-many --file that-file.json. Each download is verified
and each failure is returned; inspect every result. For probe-login recovery use
worker-auth-refresh, then worker-wait on the returned job. Credentials stay private.

## QC commands

```bash
node "$helper" qc-run --checks preflight
node "$helper" worker-wait --job "$job_id" --timeout 45
node "$helper" qc-collect
# Once starter/reference and contract review pass, start the initial five lanes:
node "$helper" qc-run
# After a repair, use the actual affected IDs:
node "$helper" qc-run --checks swemultimodal/probe-gameability,swemultimodal/tests-exercise-observable-behavior
```

qc-run syncs the linked task, clones execution inputs and starts one asynchronous
batch. Wait for its returned job before qc-collect. Results and counters persist in
worker /home/daytona/author-staging/qc and local staging/qc-results; original model
JSON also appears at staging root for stage_qc_reports.py. These commands reduce
mechanical work; the outer still reviews patches, trajectories and verifier evidence.
Use the same ledger for the whole job, including errors. An already passed check on the
same input snapshot is reused without another model call. Do not run qc-run twice for
the same initial batch or bypass the counters with manual model calls.

After the inner saves reports/disputes, final prose is saved and all inputs freeze:

```bash
node "$helper" qc-finalize
# Or supply {"disputes":[{"check_id":"...","reason":"...","evidence":["relative/staging-file"]}]}:
node "$helper" qc-finalize --file "$staging/qc-review.json"
```

Each disputed completed finding needs an existing task-root disputes.md note and
actual evidence in staging. qc-completion.json records passed, review_required or
incomplete. Final task or evidence changes invalidate the gate. Finalize again only
after resolving the change; do not rerun successful models just to refresh a receipt.

## Final local oracle

```bash
node "$helper" oracle-start
node "$helper" oracle-status
node "$helper" oracle-wait --timeout 45
```

Only after all author sessions have closed with saved traces. This invokes LOCAL
`helix task oracle --output json` on the linked task. It is asynchronous; poll status
and inspect its full log. passed requires exit zero, explicit full reward and stable
input hashes. Reopen the inner for repairs if needed, then save/close and rerun. Any
final task change invalidates the prior oracle. Do not replace this with a remote
Harbor result or an agent's verbal pass claim. oracle-start reuses an already
passing oracle on the same input hash; a fresh inner segment alone is not a reason
to repeat it.

After QC, final prose saving and the final local oracle, write validation-summary.md
in local staging. The controller packages the official ZIP and validates the handoff.
