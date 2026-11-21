# Swegen — SWE Multimodal task authoring

Launch an outer Codex agent in a private Daytona worker for an existing Helix task.
It receives the assignment and the `swe-multimodal-task-author` skill, captures real
broken/working media, and guides an inner recorded `helix task author` session.
The controller downloads and hash-verifies its task handoff before deleting the worker.

## Setup

Install Node.js and dependencies with `npm install`. Build and upload the worker image
using [docker/README.md](docker/README.md), then configure the ignored `.env` using
[.env.example](.env.example). Required values for task jobs:

```ini
DAYTONA_API_KEY=...
DAYTONA_SNAPSHOT=swegen-multimodal-v1
HELIX_EXPECTED_ACCOUNT=your-helix-account-email
MEDIA_CAPTURE_KIT_DIR=/absolute/private/path/to/media-capture-kit
CODEX_MODEL=gpt-5.6-sol
CODEX_REASONING_EFFORT=high
```

The proprietary kit stays outside this repository and Docker context. The controller
uploads selected tool files and the whole multimodal skill at runtime, verifies SHA-256,
and registers the skill under the outer workspace's `.agents/skills/`. Remote paths:

```text
/opt/micro1/media-capture-kit
/opt/swegen/skills/swe-multimodal-task-author
```

The controller reads the existing rv OpenRouter key from `~/.rv/auth.json`, or the file
selected by `RV_AUTH_PATH`, and checks it at runtime. It does not bake keys into images.
Codex uses a one-time ChatGPT device login in the worker. Helix setup prints its pairing
request and requires approval by `HELIX_EXPECTED_ACCOUNT`, without an email-confirmation
prompt. Pairing the local machine does not pair a new worker.

Harbor is bundled with rv at `/opt/uv-tools/realm-verifier/bin/harbor`. Capture executor
authentication is separate: runtime kit transfer does not forward the controller's
Daytona key. Configure the kit's supported executor access and budget for live capture.
Never snapshot an authenticated worker or package credentials with task output.

## Run an assigned task

Create an external `assignment.md` with the assigned issue/scope, upstream repo/base/PR,
expected behavior, exclusions, and concrete capture/QC/time/spend limits. State whether
upload or hosted evaluation is included. Do not put credentials in the brief.

```bash
npm run start -- \
  --task-url 'https://helix.micro1.ai/pipelines/PIPELINE_ID/tasks?task_id=TASK_ID' \
  --brief-file /absolute/path/to/assignment.md
```

The downloaded Helix template supplies the task ID and author metadata. The launcher
does not invent or overwrite them. It uploads the current worker policy, job, agent,
audit helper, skill, and private kit; authenticates rv/Codex; and pairs Helix before
starting the outer agent. The outer uses its terminal tools to operate the recorded
inner session. Actual unattended inner-session control still needs live validation;
a missing terminal capability must produce an honest incomplete handoff.

The [skill](skills/swe-multimodal-task-author/SKILL.md) owns the task-building procedure.
Its [QC runbook](skills/swe-multimodal-task-author/references/qc-loop.md) runs judgment
plus four probes in parallel on frozen isolated copies. Only affected checks rerun,
with one initial run plus at most five reruns per probe. Its
[launch reference](skills/swe-multimodal-task-author/references/worker-launch.md) explains
remaining runtime prerequisites and supported capture-category limits.

## Output and audit

One normal outer ZIP contains the unmodified `helix task zip` output and a concise
`validation-summary.md`. The task itself has `instruction.md`, five-section
`reasoning.md`, media, source, gold, verifier, and root `disputes.md` when needed.

The controller runs [audit_handoff.py](scripts/audit_handoff.py) on every non-smoke ZIP.
It accepts a bare Helix task ZIP or the two-file handoff, checks required files/config,
media references/limits, reasoning sections, source history when present, archive safety,
and generated/private residue. It does not run tests, inspect video frames, or certify
QC/trace/hosted acceptance. Audit failures remain visible while the archive is still
preserved and downloaded; they are not reported as passed.

Blocked work uses a recovery ZIP with a work-in-progress task archive and
`failure-summary.md`. Recovery audits report `incomplete`. Completed downloads go to
`LOCAL_OUTPUT_DIR` (default `outputs/`). Existing files are not intentionally overwritten.

## Smoke tests

Authentication only (one configured-model call; no task build):

```bash
npm run start -- --auth-smoke
```

Provisioning/transfer dry run (no model calls or pairing, but creates a billed worker):

```bash
npm run start -- \
  --task-url 'https://helix.micro1.ai/pipelines/PIPELINE_ID/tasks?task_id=TASK_ID' \
  --brief-file /absolute/path/to/assignment.md --dry-run
```

Offline checks:

```bash
npm test
```

## Lifecycle

The configured TTL bounds worker lifetime. Successful verified downloads are followed
by Codex logout, Helix disconnect, and worker deletion. Failed jobs have credentials
removed where possible, are stopped, and retain their filesystem for the configured
recovery interval before deletion. Review the reported worker ID if cleanup fails.
No new worker, model run, snapshot push, task upload, or submission is implied by
editing the controller or running offline tests.
