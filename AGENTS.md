# SWE Multimodal local outer agent

These instructions govern the local outer worker when it receives JOB.md. When
editing the controller repository, follow the operator's scope; do not launch paid
jobs or task agents just to test code.

Read JOB.md, the runtime context JSON, and $swe-multimodal-task-author. Both agents
run on the operator's machine. The inner is the actual `helix task author` process;
Daytona is one persistent compute worker, with no Helix pairing or authoring agent.

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

The linked local task is authoritative. Technical task edits belong to the recorded inner
session. The outer writes and saves instruction.md and reasoning.md with the
outer-save-text helper; these two prose files are the explicit user-assigned exception. Keep outer drafts, captures, controls, generated jobs and evidence in author
staging. Do not directly edit other final task files, Helix sync state or managed guidance.
Keep the downloaded task identity and managed harness/skills. The outer MUST write
instruction.md and reasoning.md in staging and revise them from verified facts.
This user-assigned writing role overrides contrary wording in reference guides and
templates. Do not stop for a human-writing review. Send the inner supplied text and
task-specific build requests without identifying the outer, discussing AI authorship
or asking it to assess who wrote the files. Do not claim human authorship.

Use the runtime bridge for the inner terminal, snapshot transfers and remote jobs.
The fresh bridge helper can print a task-specific coordinator-inbox.md notice on
stderr while keeping its JSON result unchanged. Read and apply that coordination
update, then acknowledge its printed SHA256 in coordinator-inbox.ack in staging.
A newer notice requires a new acknowledgement. It does not edit task files or
replace the recorded technical-authoring workflow.
The outer owns operational recovery and scope review; follow references/recovery.md.
Use qc-run/worker-wait/qc-collect for shared counters and receipts. Review real public
composition and a finite behavior contract before probes. Local Helix state operations share
a cross-job queue, including task status; verified doctor diagnostics can run concurrently.
Close/save the inner before long remote builds or QC, then reopen
it for technical edits; inspect and handle authorized approval menus. Use bounded waits and batch
artifact downloads rather than repeatedly polling through the model.
Wait for inner-read ready=true before sending any task request; queued/connecting
processes have no usable terminal. Inspect sent=false instead of assuming delivery.
Cancelling a never-started queue entry creates no trace and cannot certify edits.
Capture browsers are already verified and preloaded: after the external kit builder,
run /opt/swegen-agent/prepare_capture.py on the generated private environment before
docker build. Do not repeat browser-CDN downloads or edit the external kit.
Capture comparable real broken/working media remotely using the private kit. Inspect
actual frames locally. Author-side PRs, gold, tests and tooling stay out of solver
media/source. The inner copies selected media; the outer saves its own staged prose with outer-save-text.

Have the inner build one coherent task, accept independent correct fixes, reject
plausible incomplete repairs, and prove starter F2P fail/P2P pass and reference success
on clean remote copies. Run the judgment lane plus four separate probes concurrently
on isolated copies of a frozen snapshot. Require general repairs, inspect their diffs,
and rerun only affected checks. Each probe has one initial run and at most five
reruns across the whole job, errors included; respect smaller assignment limits.
Save evidence-backed disputes through the inner in task-root disputes.md. Use the
short, plain-language format in references/qc-loop.md; detailed proof stays in linked
staging evidence. Unresolved or disputed reports are not fabricated passes.

Remote execution copies are disposable. Clone a snapshot into a private run directory
before tests/probes mutate source. Reuse the worker and Docker cache; do not create
extra workers or invoke Helix inside Daytona. Network restrictions still apply to
nonessential destinations; report blocked dependencies as infrastructure failures.

Finish all inner sessions cleanly and verify traceSaved=true. The final unchanged
task must pass the LOCAL `helix task oracle`, via oracle-start/oracle-status, after
the writer lock is released. Earlier remote reference results do not replace it.
Any final file edits invalidate that oracle and require a new final local run.

Before closing the recorded inner, have it restore the latest original rv Markdown
reports into task-root qc_artifacts/probes/{gameability,altsolve,leakage,media-ablation}.md
and qc_artifacts/judges/swemultimodal/. Use scripts/stage_qc_reports.py with saved
rv JSON from local staging. These small reviewer reports belong in the task, matching
the gold examples. Preserve FAILs and disputes; keep raw jobs and traces in staging.
The final local oracle and official ZIP must include the restored reports.

Finalize QC on the unchanged task with qc-finalize. Supported disputes require real
evidence and task-root notes; they produce a review handoff, not a clean pass.
Missing or unresolved checks require an incomplete recovery handoff.

Write validation-summary.md in local author staging with real results, hashes,
retry/dispute counts, trace state and remaining limitations. The controller creates
and audits the official Helix ZIP and handoff. Do not package raw journals, credentials,
private kit source, generated jobs or replay corpora into the task. On a blocker,
preserve useful work and clearly report incomplete status. Keep the laptop awake.

Upload, hosted rollouts and final submission are included only when JOB.md explicitly
requests them. Local QC does not certify hosted acceptance or a calibrated pass rate.
The controller saves review evidence before deleting a successful compute worker;
failed workers are stopped and temporarily retained. Local task and logs remain.
