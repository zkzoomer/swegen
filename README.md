# Swegen — SWE Multimodal task authoring

Run an outer Codex agent and a recorded inner `helix task author` session locally.
One persistent Daytona worker handles capture, builds, development verification,
and five QC lanes. The final official `helix task oracle` runs on your machine.
Helix never needs to connect from Daytona, so its Tier 2 domain restriction no
longer blocks download, recorded authoring, trace upload or task packaging.

## Setup

Install Node.js, Python 3, uv, local Docker, Helix and Codex. Install dependencies:

```bash
npm ci
npm ci --prefix agent
```

Pair Helix and sign into Codex **on this machine**. Start local Docker. The launcher
checks them before creating a paid compute worker. Build/upload the worker snapshot
using [docker/README.md](docker/README.md), then configure ignored `.env`:

```ini
DAYTONA_API_KEY=...
DAYTONA_SNAPSHOT=swegen-multimodal-v1
MEDIA_CAPTURE_KIT_DIR=/absolute/private/path/to/media-capture-kit
CODEX_MODEL=gpt-6.1-sol
CODEX_REASONING_EFFORT=medium
```

By default (`SWEGEN_RV_MODE=openrouter`), the controller reads `OPENROUTER_API_KEY`
or rv's OpenRouter key from `~/.rv/auth.json` / `RV_AUTH_PATH`, provisions it for
remote judges and validates it. Set `SWEGEN_RV_MODE=codex` to use rv's official
Codex subscription mode for judges without reading or provisioning OpenRouter
credentials. Unsupported modes fail before worker creation. In both modes, the
launcher transfers the local Codex login through the private SDK file channel
and requires the same bounded live subscription preflight before agents or QC.
Codex mode is selected only after that check succeeds. rv 0.0.152's multimodal
probes continue to use Codex independently of judge mode. Helix credentials
stay local; no task ZIP or review bundle contains the Codex login.
Use `helix status` to verify your local account. Keep the laptop awake and connected
for the whole run.

The proprietary media kit stays outside Git and image build context. Selected kit
files upload privately at runtime, with SHA-256 verification. Both agents use the
local Codex login. The worker uses its transferred login only for official rv probes
and needs no Helix pairing. The login is removed before retaining a failed worker;
successful workers are deleted after their evidence is saved. Tier 2 still
restricts other nonessential dependency/service domains; report real blockers.

## Launch

Supply the existing Helix task URL and assigned GitHub PR. The agent derives the
starting commit, intended behavior and reproduction from the PR and linked issue:

```bash
npm run start -- \
  --task-url 'https://helix.micro1.ai/pipelines/PIPELINE_ID/tasks?task_id=TASK_ID' \
  --pr 'https://github.com/OWNER/REPO/pull/NUMBER'
```

Add `--brief-file /absolute/path/to/notes.md` only for special instructions or limits.
Those notes supplement the assigned PR in the generated `JOB.md`. Existing
brief-only commands are also supported. An explicitly supplied brief must be nonempty.

`JOB.template.md` plus these inputs produces local `JOB.md`. Shared behavior and
default limits come from AGENTS.md and the [skill](skills/swe-multimodal-task-author/SKILL.md).
Download happens locally. To reuse an already downloaded folder, add
`--task-dir /absolute/path/to/linked-task`; the launcher verifies its task identity.
Independent launches share a local Helix queue, including Helix commands issued by
their agents. Downloads, recorded sessions, packaging and local oracles wait their
turn instead of colliding on Helix's writer lock. Remote builds and QC can run in
parallel. Close/save recorded sessions before long remote work to release the queue;
requesting another Helix write operation while your own session is open fails promptly
with an explanation. Verified read-only `helix doctor` forms (with optional
`--output json`), plus CLI help/version, remain available without taking this queue.
`helix task status` also queues because Helix 0.1.3 opens its local state writer.
Unknown options still queue. Native Helix locks are
unchanged. The queue uses a private
file under `~/.cache/swegen/`, never Helix's database or native locks.
The terminal bridge reports `phase` and `ready`; it sends no task message until the
real Codex composer is connected. Cancelling a queued launch creates no trace and
does not invalidate later saved author segments. A completed task still needs at
least one actual authoring segment with a verified upload receipt.
Existing compatible worker snapshots work:
the required helper scripts upload at runtime, so this refactor needs no rebuild.

Before creating a paid worker, normal task jobs prepare a shared local browser-only
image from the official amd64 Playwright 1.48.0 image pinned by digest. The roughly
383 MiB archive is cached under `~/.cache/swegen/`, SHA-256 checked and transferred
through the private SDK file channel. The worker verifies and loads it before either
agent starts. No private kit, task source or credentials enter this public bundle.
The kit's version must match; unknown versions fail before worker creation. Dry-run
remains transport-only and skips browser provisioning.

After running the kit builder in private worker staging, adapt its generated capture
environment before building it:

```bash
python3 /opt/swegen-agent/prepare_capture.py /home/daytona/capture-staging/assigned-task/environment
```

Use the actual generated environment path. This changes only the disposable capture
Dockerfile: it installs matching system dependencies and copies the verified browser
cache, rather than contacting browser CDNs. It preserves the external kit and final
task Dockerfile. New workers do not require a new snapshot for these helpers.

## Execution and completion

The outer controls the real inner session through a private Unix socket and PTY.
The bridge renders its screen, sends multiline messages and waits for Helix's saved
session confirmation. This is not a separate SDK thread posing as Helix authoring.
The local linked task remains authoritative; the inner makes technical task edits.
The outer writes and saves instruction.md and reasoning.md. It handles operational
recovery and scope review through the skill; a third supervising chat is not required.
Use qc-run/worker-wait/qc-collect for automatic isolation, bounded retries and receipts.
Close/save the inner during long remote QC to release the shared Helix queue;
reopen for repairs, and close/save again before the final local oracle.

Snapshots are content-addressed. The first transfer sends task inputs; later transfers
send changed files/deletions. Unchanged copies are verified and reused. Jobs run in
one persistent worker, retaining Docker layers/dependencies. Use separate run copies
for mutating checks; no edits during a parallel QC batch. Only affected checks rerun,
with one initial run plus at most five reruns per probe across the whole task.

The inner launch uses a private Codex wrapper with `tui.resume_cwd="session"` to
avoid conflicts between a personal `current` preference and Helix's remote TUI.
The override applies to inner child processes; personal config/login stay in place.
The same wrapper scopes writable roots to task/staging and permits bridge networking
on the Codex app-server only. The remote terminal receives the UI preference without
server sandbox overrides, which Codex rejects with `--remote`.
Genuine approval prompts remain for the outer to inspect and handle.

Close/save the inner session before the final **local** oracle. The controller requires
successful exit, explicit full reward in oracle JSON and unchanged task input hashes.
Trace confirmation checks Helix's matching task journal: a fresh completed capture,
no pending upload, and an upload digest matching the complete journal bytes. It does
not depend on console wording. Retrying upload-only with uploaded=0 is normal when
the trace is already uploaded. Missing reward evidence or an unconfirmed trace
produces an incomplete result. qc-finalize also checks raw QC records against the
final task and concrete dispute evidence. Missing/unresolved QC yields a recovery
handoff; supported disputes yield a review-handoff with no clean-QC claim.
The controller then runs local `helix task zip`, audits the task and creates a handoff ZIP
containing the official task ZIP plus validation-summary.md. The task ZIP must include
`qc_artifacts/probes/{gameability,altsolve,leakage,media-ablation}.md` and the latest
judge reports. The inner restores original rv Markdown with `scripts/stage_qc_reports.py`
before the final oracle; the archive audit rejects missing probe reports. Upload/hosted evaluation/
submission are separate actions and need inclusion in the assignment.

## Logs and recovery

Each launch creates `outputs/logs/run-*/` (or under --output-dir / LOCAL_OUTPUT_DIR):

- controller.txt: commands and brief status/error messages, matching the console.
- outer/outer-events.jsonl: completed command metadata, exit codes and usage; no
  intermediate output, successful tool results, reasoning or repeated screen reads.
- outer/diagnostics/: failed command/tool output, retained once for investigation.
- inner-N/: supplied messages and session status; an unconfirmed exit also saves
  its final screen. Terminal redraws stay in memory. Helix keeps its recorded trace.
- worker-jobs/: submitted commands and retrieved stdout/stderr.
- oracle-*.txt: final local oracle output.
- worker-review-*.zip: hash-verified execution diagnostics and QC reports, without
  another combined TXT or copies of agent transcripts.
- context.json and author-staging/: runtime state and useful drafts/results.

Long commands show their first line and a length limit in the console; the outer
journal or worker command file retains the full command. Known credentials are
redacted; logs remain private and separate from task ZIPs. Helix journals stay in
Helix's local store; helix-journals.json records matching paths. No tee is needed.
The controller verifies remote diagnostics before normal deletion. Failures preserve
the local task and attempt a clearly incomplete recovery handoff; remote workers are
stopped and retained for the configured recovery interval. A forced kill, lost network
or expired worker TTL can still prevent final download. No offline test proves a live
nested session or successful paid capture/probe run.

## Checks

```bash
npm test
npm run start -- --auth-smoke
```

The auth smoke makes one local configured-model call and creates no worker. A compute
provisioning/transfer smoke creates a billed worker but starts neither agent:

```bash
npm run start -- --task-url '<helix-task-url>' --pr 'https://github.com/OWNER/REPO/pull/NUMBER' --dry-run
```

Offline tests exercise real PTYs with fixture processes, snapshot deltas, file safety,
logging and oracle gates without contacting models or creating workers.
