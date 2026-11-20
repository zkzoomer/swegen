# Five-lane QC and bounded repairs

Use after the actual local oracle is 1.0 and starter/reference controls are verified.
This procedure is the user's automation policy. The master PDF defines the four
manual probes; it does not prescribe this parallelism or the five-rerun limit.

## Inspect the installed commands

Verified locally with `rv` 0.0.152 on 2026-11-20. The image now pins 0.0.152 too;
0.0.151 was checked in the old worker image and lacks media ablation. Rebuild/push
the updated image, then confirm stage/check IDs on the actual worker before execution:

```bash
rv --version
rv check --help
rv check --list-checks --no-color
```

First run cheap stages, without model calls:

```bash
rv check --until harness --executor docker --no-color
```

The current stage is **`judgment`**, not `judges`. `--skip-judges` is not forwarded by
the inspected seaworthy-backed implementation; select stages explicitly. The dynamic
starter/oracle checks are separate from the five lanes and remain required evidence.

## Initial batch: five processes in parallel

| Lane | Exact selection |
| --- | --- |
| Judges | `rv check --stage judgment --executor docker` |
| Gameability | `rv check --check 'swemultimodal/probe-gameability' --executor docker` |
| Alternative solution | `rv check --check 'swemultimodal/probe-altsolve' --executor docker` |
| Leakage | `rv check --check 'swemultimodal/probe-leakage' --executor docker` |
| Media ablation | `rv check --check 'swemultimodal/probe-media-ablation' --executor docker` |

Freeze/hash relevant task files, including prompt, media, environment, gold, tests,
config, and reasoning. Keep baseline inventory and tool versions outside the task.
Create five ordinary/CoW scratch copies, each with its own task path and artifact
output, outside the configured Helix root. Do not hardlink writable files. Never run
five writers against the managed folder: `rv` stages and merges reports into the
selected task's `qc_artifacts/`. Inspect the inventory first; do not replicate stale
jobs, archive extractions, caches, or credentials into QC copies.

Example Bash batch on a clean task (replace the actual task path). The clone step
finishes before any process starts. Keep this script and logs outside the task:

```bash
set -euo pipefail

task_dir="/absolute/path/printed/by/helix"
author_stage="/home/daytona/author-staging"
mkdir -p "$author_stage"
qc_dir=$(mktemp -d "$author_stage/qc-XXXXXXXX")
lanes=(judgment gameability altsolve leakage media-ablation)
for lane in "${lanes[@]}"; do
  mkdir -p "$qc_dir/$lane/task"
  cp -a --reflink=auto "$task_dir/." "$qc_dir/$lane/task/"
done

run_lane() {
  local lane=$1
  shift
  local rc=0
  rv check "$qc_dir/$lane/task" "$@" --executor docker \
    --no-cache --no-color --json >"$qc_dir/$lane/result.json" \
    2>"$qc_dir/$lane/stderr.log" || rc=$?
  printf '%s\n' "$rc" >"$qc_dir/$lane/exit-code.txt"
  return "$rc"
}

run_lane judgment --stage judgment &
p1=$!
run_lane gameability --check swemultimodal/probe-gameability &
p2=$!
run_lane altsolve --check swemultimodal/probe-altsolve &
p3=$!
run_lane leakage --check swemultimodal/probe-leakage &
p4=$!
run_lane media-ablation --check swemultimodal/probe-media-ablation &
p5=$!

batch_rc=0
for pid in "$p1" "$p2" "$p3" "$p4" "$p5"; do
  wait "$pid" || batch_rc=1
done
printf 'QC evidence: %s\nBatch exit: %s\n' "$qc_dir" "$batch_rc"
```

Inspect every lane's status/report, candidate patch, trajectory, and decisive verifier
result. A zero shell exit alone does not settle the finding. Empty output, missing
rewards, `needs_review`, timeouts, authentication errors, or permission failures are
not clean passes. Keep provider configuration and model IDs version-specific; old
`RV_PROBE_AGENT=opencode` overrides may be ignored by this realm.

Five simultaneous model runs can also create several containers each. Size the actual
worker/executor resources for that load. If the requested parallelism is unavailable,
report the resource blocker rather than count OOMs as task failures.

## Triage each finding before requesting an edit

Classify it as a genuine task defect, a defensibly invalid finding, or unresolved/
infrastructure failure. Use the report's actual version, patch, logs, and observable
behavior. A candidate labeled "correct" is not necessarily correct; an attack on
excluded behavior is not automatically a missing requirement.

For a genuine issue, send the inner session a request such as:

> Assess this finding against the agreed public contract before editing. Explain
> the general gap, not just this candidate's special case. Propose the smallest
> general repair. Show why it rejects this class of incomplete solutions while
> accepting different correct implementations and preserving existing behavior.
> Do not add a test solely because the probe suggested it. Replay saved valid and
> invalid patches together. Report the diff, evidence, and any scope change needed
> before declaring the issue fixed.

The outer agent then reviews the actual diff and results: does it enforce the public
invariant, or merely block a value, helper, implementation shape, or one probe patch?
Check for new hidden requirements, exact-call assertions, duplicated fixtures, unrelated
PR scope, and broken independent solutions. If reports repeat, revisit the finite
behavior model and whole verifier once; do not grow an endless list of F2P cases.

All edits happen through the recorded inner session. No mutations while a batch is
running. After executable changes, rerun relevant starter/reference controls and the
saved alternative/negative replay set before another model probe.

## Targeted reruns, counters, and stale evidence

Rerun only the affected probe or individual judgment check on a fresh frozen copy:

```bash
rv check /outside/helix-root/qc-retry/task \
  --check 'swemultimodal/probe-gameability' --executor docker --no-cache --no-color

rv check /outside/helix-root/qc-retry/task \
  --check 'swemultimodal/tests-exercise-observable-behavior' \
  --executor docker --no-cache --no-color
```

Use the actual failed check ID. Do not repeat the whole judgment stage to repair one
judge result. Do not rerun unaffected successful probes as a ritual. A verifier change
can invalidate both gameability and alternative-solution evidence; a prompt/media
change can invalidate media ablation; image/history changes can invalidate leakage.
Those checks are affected and need reassessment. Do not call old reports current just
because their lane was previously green. Final reasoning changes need the reasoning
judge and any other materially affected judgments, not automatically all probes.

Persist one counter per probe/check in outer staging, with snapshot hashes, commands,
start/end, result, classification, edit summary, evidence path, and next action.
Each of the four probes gets **one initial run plus at most five reruns** (six total).
For bounded automation use the same ceiling per individual judge. Count every rerun,
including infrastructure errors and changed snapshots; do not reset on rewording,
new sessions, different models, or renamed copies. The overall run/time/spend budget
can stop work sooner. No successful check needs five attempts.

At the limit, stop that lane, preserve work, and return the finding as unresolved in
an incomplete handoff. Never silently waive it, edit its report, or run a sixth retry.

## Invalid findings: root disputes.md

Have the inner session save a brief note in **`<task>/disputes.md`**, outside
`environment/repo/` and `environment/media/`. Keep underlying raw evidence in private
staging. Use this shape:

```markdown
## <check ID> — <snapshot hash / run ID>

Finding: <what was claimed>.
Why disputed: <contract-backed reason and concrete counterevidence>.
Evidence: <candidate patch/log path and decisive result>.
Requested resolution: <reassess or acknowledge excluded behavior>.
Status: disputed; not represented as a clean pass or platform acceptance.
```

Missing evidence calls for investigation, not an invented dispute. A file saved locally
is not a posted/accepted platform dispute. See [review-and-calibration.md](review-and-calibration.md).
