# Local agents and persistent remote compute

The controller runs both agents on the operator's machine. The outer is a local
Codex SDK thread; the inner is the actual interactive `helix task author` process.
Daytona contains execution copies, the private capture kit, Docker and rv, with no
Helix pairing or task-authoring agent. The final official oracle runs locally.

## Launch contract

The operator supplies an existing task URL and assigned GitHub PR through
`--task-url` and `--pr`. The agent derives the base, behavior and reproduction from
the PR, linked issue and downloaded task references. `--brief-file` optionally adds
special instructions or limits; existing brief-only launches remain supported.
The launcher checks local Helix/Codex authentication,
Python, uv and Docker, downloads the task locally (or verifies --task-dir), and
creates one private persistent compute worker. It installs the runtime kit and rv
credential there. Multimodal probes in rv 0.0.152 require Codex regardless of judge mode,
so the launcher also transfers only the local Codex login over the private SDK file
channel, with directory/file permissions 700/600. It makes one live, bounded Codex
subscription request before either task agent starts. rv forwards the login to probe containers.
It is excluded from task files and review logs and removed before retaining a failed
worker. A successful worker is deleted after evidence transfer. The local outer workspace receives this skill, JOB.md and the
runtime context path. Read context.json; it contains paths and worker ID, no keys.

Current compatible worker snapshots need no rebuild: helper scripts upload at
runtime. The image still includes Helix/Codex binaries for compatibility, but they
do not run remote Helix authoring. Codex runs remotely only for rv probe trials. Existing local credentials are reused;
there is no per-worker Codex device login or Helix expected-account pairing.

Use the [bridge reference](local-bridge.md) for executable commands. The private
Unix socket exposes terminal controls, file snapshots, remote jobs, downloads and
final local oracle. No public listening port or direct incoming connection to the
laptop is needed. Keep the laptop awake and connected throughout execution.

## Readiness and honest limits

- A real inner session must show a usable terminal, accept instructions, close with
  exit code zero and have a verified complete/uploaded Helix journal. No console
  phrase is required. The inner launch applies tui.resume_cwd="session" through a
  private child-process wrapper, preserving the operator's config and login. It also
  scopes workspace-write roots to the linked task and staging, with network access
  for the supplied bridge; genuine approval requests still go to the outer. These
  child-only settings follow the [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). PTY tests establish
  transport behavior, not live task access or upload acceptance.
- The local task is authoritative. The inner makes technical task edits; the outer
  writes and saves instruction.md and reasoning.md with outer-save-text. Do not make final edits remotely
  and import a ZIP merely to manufacture a recording.
- Reuse worker filesystem, jobs and Docker cache. Sync sends a full initial snapshot
  and then deltas, verifies hashes and reuses unchanged inputs. Clone execution copies
  before mutating tests/probes; do not corrupt cached input snapshots.
- Tier 2 still restricts nonessential service hosts. Docker/GitHub/OpenRouter access
  does not prove every app dependency is reachable. Helix networking stays local.
- Capture uses the kit library directly in the existing worker unless the assignment
  explicitly includes separate capture workers and executor access.
- Inspect installed rv version/stages. Run judgment and four probes against isolated
  copies, respecting the assignment budget and shared initial-plus-five retry ceiling.
- After all final edits, close/save inner sessions and use oracle-start. The controller
  requires the LOCAL official oracle, explicit reward 1.0 and unchanged task hashes.
  Remote Harbor reference checks are development evidence, not the final local oracle.

The launcher automatically packages/audits the official local Helix ZIP plus the
outer's validation-summary.md after these gates and qc-finalize. Supported disputes
produce a clearly named review-handoff; missing or unresolved QC prevents a normal
handoff. It preserves local work and marks
failures incomplete, attempts a recovery ZIP and stops the compute worker for the
configured retention window. Logs must download before normal worker deletion.
Hosted rollouts/upload/submission remain separate authorized actions. Do not claim
live nested-session, capture or probe success from offline tests.
