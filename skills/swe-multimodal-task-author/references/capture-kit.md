# Runtime capture-kit integration

Use when preparing or capturing supporting media. This guide contains our integration
instructions. Read the installed kit's `README.md` and `capturekit/README.md`
for its current API and execution rules.

## Provisioning

On the controller, set `MEDIA_CAPTURE_KIT_DIR` in the ignored `.env` to an absolute
directory outside the repository. Keep the kit out of Git and the base-worker Docker
build context. Before creating a billable worker, the controller validates the source
and reads a bounded upload plan: builder, audit script, capture library, READMEs,
and root license/notice files when supplied. It excludes old jobs, caches, dependencies,
Git metadata, and unrelated top-level files.

After creating the private worker, the controller uploads only the kit, checks
every transferred file's size and SHA-256, and preserves executable modes. This
skill is registered separately in the local outer workspace's `.agents/skills/`.
Worker environment:

```text
MEDIA_CAPTURE_KIT_DIR=/opt/micro1/media-capture-kit
```

The manifest is `/opt/swegen/runtime-assets-manifest.json`. Task jobs require kit
configuration; an invalid configured kit fails before sandbox creation.
The controller separately preloads the exact kit-pinned public browser image from a
hash-verified local archive. `context.json` identifies captureBrowserImage and
capturePrepare. After generating a private capture task, run:

```bash
python3 /opt/swegen-agent/prepare_capture.py /home/daytona/capture-staging/ACTUAL_TASK/environment
```

Use the generated environment path, then build normally with the worker's Docker
daemon. The helper replaces only the known browser-download step with system-dependency
installation plus COPY from the preloaded image. Do not retry CDN mirrors, change
Playwright versions, edit the external kit, or apply this to the final task environment.
An unknown kit version or Dockerfile is a real compatibility error to report.
Auth-only smoke runs are local and skip worker provisioning. A configured controller dry run provisions
and verifies files, but does not invoke capture models.

Verify the environment variable and installed builder before capture. If absent,
report the provisioning gap; do not fetch an unapproved replacement or reconstruct
the proprietary implementation. Runtime upload supplies tools only; it does not establish capture executor access
or prove that interactive inner-session control works.

## Prepare a capture task

Use the assigned starting source. Read [local-bridge.md](local-bridge.md): stage
inputs locally, sync them, execute in the worker, and fetch media/reports to local
staging. The local recorded inner copies chosen final files into the task. The kit requires an environment Dockerfile,
`task.toml`, task brief, and reference patch. Prepare a disposable outer capture
scaffold from the assigned base and upstream patch in local staging outside the managed task, so
capture can precede the main `helix task author` build. This scaffold is capture
input, not final submission content. If that prerequisite genuinely needs a recorded
session first, report the exception and save/close that preliminary session. The
linked downloaded task remains the eventual submission.

Choose staging outside the configured Helix task root and final `/output`. Replace
the path below with the external capture scaffold (or an already suitable source
task). Never run builder output/jobs inside the managed task:

```bash
kit_dir="${MEDIA_CAPTURE_KIT_DIR:?runtime media kit is missing}"
task_dir="/home/daytona/task-snapshots/ACTUAL_CAPTURE_INPUT_HASH"
capture_stage="/home/daytona/capture-staging/assigned-task"
mkdir -p "$capture_stage"
python3 "$kit_dir/build_media_task.py" "$capture_stage/media-tasks" "$task_dir"
```

The builder accepts `--patch` for an explicit reference patch and `--pr` for staged
PR text when available; inspect installed help before adding flags. The outer agent
can prepare primary-source context. The capture agent must not fetch original issue/PR
media or upstream answers, and reference media may guide reproduction but never be
copied/cropped/re-encoded into the selected output.

## Run capture within the authorized budget

The kit documents two execution paths. Prefer its **"Using capturekit without an
agent"** path when the outer agent can write/run the capture script in the built task
image using Docker inside this existing worker. Read the installed library API and
image requirements; use the kit's native desktop/browser input during recording.
This records the real app without spawning another Daytona worker or requiring a
second copy of the Daytona API key. Preserve the reproduction script and logs in
private staging so the same actions can be checked against the broken and fixed code.

Alternatively, use the installed kit's Harbor/Daytona recipe when the assignment
provides the required executor access and extra-worker budget. Its documented capture
agent is
`openai/gpt-6.1-sol` through Codex, with `web_search=disabled`, high reasoning, a pinned
agent version, and two candidate rollouts. Match the installed README's exact flags
and allocate setup/worker lifetime for its build and capture duration. Do not infer
that the outer worker's model selection or API credentials configure Harbor.

Command shape, to be completed using the installed recipe and authorized options:

```bash
harbor run -p "$capture_stage/media-tasks" -a codex \
  -m openai/gpt-6.1-sol -e daytona \
  --ak web_search=disabled -o "$capture_stage/media-jobs"
```

The `-e daytona` executor creates additional sandboxes. Its authentication and spending
must be explicitly available for the job. The controller's Daytona API key is not
automatically forwarded to the worker. Codex login and the capture executor's
authentication are separate prerequisites. Do not silently forward credentials.
If choosing the separate-worker recipe,
configure its access explicitly; otherwise use the supported direct-capture path
when suitable. Report a blocker only if neither authorized path can run.

A missing service/OS or failed real reproduction is an unsupported result, often
recorded by the capture agent as `BLOCKED.md`. Keep that evidence; do not fabricate
frames or claim that a valid media file proves reproduction.

## Audit, inspect, and select

For Harbor capture jobs, find each trial's `verifier/output/`. Inspect its README and
trajectory, `bug.*`, `fixed.*`, and `repro/`. Run the installed audit script against
actual trial directories:

```bash
python3 -I "$kit_dir/scripts/audit_cmds.py" /absolute/path/to/capture-trial
```

For direct capture, retain equivalent command/reproduction logs and inspect both
outputs; the Harbor trial audit command does not apply without a Harbor trial.

Check that the bug capture uses the unfixed source, the fixed capture uses identical
steps, and the repository is restored afterward. Reject copied reference media,
fake interfaces, overlays, exaggerated settings, and input-driver artifacts. Use the
kit's native input channel while recording. Open actual frames in temporal order;
the kit reward checks basic artifacts, not visual correctness or media necessity.

Choose fresh `bug.png`/`bug.mp4` and matched `fixed.png`/`fixed.mp4` showing the
assigned broken/working behavior. This user requests both as clearly labeled task
media, overriding the kit recipe's bug-only final selection. Only the selected visual
outputs are eligible; keep the audit output, patches, and reproduction script in
persistent private staging. Rename selected files to neutral broken/working names
if useful, and use those exact `/media/...` paths in the prompt.
For feature/refactor/performance tasks, first apply the category-specific evidence
decision in [media.md](media.md); the bug-capture recipe is not proof those branches
are supported or that an independent specification exists.

## Inner-session handoff and cleanup

Give the inner Helix session the chosen media path, attachment role, and exact prompt
references to save. It places media in `environment/media/`, mapped to `/media/...`.
Keep the kit's source/documentation, capture task/image, unselected comparisons,
reference patch, and reproduction/audit files outside the final task and solver
environment. Selected broken/working visual outputs are task media, not tooling.
Inspect the final upload inventory rather than assuming an ignored directory is safe.

Keep the kit out of shared base-worker snapshots and published images. The kit creates
private temporary capture images containing its library; keep those private and clean
them up with the capture jobs. Runtime files live in private workers; the controller deletes successful workers and temporarily retains
stopped failed workers for recovery. Temporary capture-executor sandboxes have their
own lifecycle and also need cleanup. Retain only permitted selected media and private
review evidence. Preserve the kit's supplied notices without copying its implementation
into this repository or task artifacts.
