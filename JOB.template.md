# Assigned SWE Multimodal task

Helix task: {{TASK_URL}}

Use `$swe-multimodal-task-author` as the LOCAL outer agent. Follow AGENTS.md and
read the supplied runtime context. The linked task is on this machine. Guide the
actual local `helix task author` inner session through the bridge. Daytona provides
persistent remote execution only; do not pair Helix or launch an author agent there.

The outer MUST draft and revise instruction.md and reasoning.md in staging. Save
them into the task with the outer-save-text helper. Give the inner supplied task text
without outer identity or AI-authorship discussion; do not ask it to write/copy these files.
Do not run a human-writing compatibility preflight or stop on contrary reference
wording. Follow references/authoring.md for this user-assigned writing workflow.

## Assignment and limits

{{TASK_BRIEF}}

Use the skill's recovery and QC helpers to handle authentication, authorized
approvals and verifier-scope review within this job. Close/save the inner during
long remote builds/QC to release the shared local Helix queue; reopen for edits. Narrow job-local runtime-helper repairs in staging are allowed;
record them and preserve task/provenance boundaries. No third supervisor is required.

## Delivery

Capture and run development verification/judges/probes on the compute worker. Keep
technical task edits recorded locally, close/save every inner session, and pass the FINAL
LOCAL `helix task oracle` on the unchanged task. Write validation-summary.md in local
author staging and run qc-finalize. Unresolved QC prevents a normal handoff;
supported disputes are labeled review-required. The controller creates the official task ZIP and audited handoff,
saves all available review evidence, and cleans up the compute worker.

No upload, hosted evaluation or final submission is included unless requested above.
If blocked, preserve useful local work and report incomplete status. Do not claim
unrun checks, unsaved traces, calibration, or remote oracle results as final success.
