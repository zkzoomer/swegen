# Technical construction and verifier fairness

Use for directing the inner build, reviewing its changes, and validating the task.
Consult the active template for exact schema and managed-file checks.

## Contract and environment

Confirm the assigned repository/base and coherent task contract. Captured requirements
include a permissive license with its root license preserved, a real non-toy repository,
at least 30 files and ten commits, meaningful activity from 2023 onward, and an existing
suite. Recheck the active pipeline rather than importing old example exemptions.
Keep source history needed by author-side checks while flattening runtime history so
the solver cannot retrieve the upstream fix.

The inner session maintains `task.toml`, `instruction.md`, `reasoning.md`,
`environment/{Dockerfile,repo,media,skills}`, `solution/{solve.sh,gold_patch.diff}`,
and `tests/{test.sh,config.json,test_patch.diff,log_parsers.py,helpers}` as required by
the current separate-verifier template. Basic Harbor format recognition is only the
first gate; every relevant file needs correct content.

Pin appropriate runtimes, package managers, dependencies, browser binaries, fonts,
and renderers. Test the real image at actual CPU/memory limits and offline where
required. Browser geometry/focus needs a real browser; jsdom alone is insufficient.
Preserve template networking/privilege setup, managed harness/parser/helpers, runtime
skills, and `skills_dir`. Do not add verifier image overrides or separate verifier
Dockerfiles. Captured agent timeout range is 3600–7200 seconds.

In Daytona, preserve the template's `nproc` wrapper and `M1_BUILD_JOBS`; host CPU counts
can exceed sandbox capacity. Use cgroup limits/peak measurements, not host-wide free
memory, to diagnose OOMs. Do not change production behavior to accommodate build limits.

## Reference and tests

Keep `gold_patch.diff` production-only, minimal, and general across the assigned
behavior. Remove unrelated changes. The upstream PR is evidence, not the complete
task specification. `solve.sh` applies the reference in the supported template.

Generate hidden tests in `test_patch.diff` using real public interfaces and supported
compositions. Use representative input/state/boundary variants, not an automatic
Cartesian product. Grade outputs, content, public state, geometry, or deterministic
work rather than private helpers, caches, scheduler choices, exact scroll arguments,
or one algorithm. Permit equivalent focus policies, render arrangements, and repairs
at different layers when the public contract permits them.

Every F2P needs accurate What/How/Why documentation. Explain why it belongs to the
same task and why another correct implementation can pass. A relevant case already
working on starter belongs in P2P. Captured P2P minimum is 15, target 100; justify
coverage limitations from the actual available suites. There is no target F2P count.

Protect every graded F2P/P2P test file in `protected_paths`; no pattern may overlap a
production gold path. Move graded inline tests out of editable production source when
needed, preserve module wiring, and update IDs. Use distinctive hidden filenames such
as the realm's `sequoia` marker. Managed reconstruction excludes/restores protected
edits; a modification flag is diagnostic, not automatically proof of cheating or zero.

Configure exact `test_cmd`, `log_parser`, `fail_to_pass`, `pass_to_pass`, and
`protected_paths` using current schema. Copy IDs from parsed execution, not guessed
test names. Expose framework report files to parser input where needed. Keep streams
parseable and ANSI-free through supported runner/config commands; preserve exit codes
through pipes. Do not patch the managed parser to make a task pass.

## Required executable evidence

Freeze/hash prompt, media, gold, tests, config, and relevant environment files before
a validation batch. Stage frozen copies and logs outside synchronization. Require:

| Candidate | Required result |
| --- | --- |
| Starter | Every F2P fails for its intended reason; every P2P passes. |
| Reference | All required tests pass and oracle reward is 1.0. |
| Independent correct alternative | All required tests pass. |
| Correct alternative using different legitimate implementation choices | Accepted. |
| Plausible incomplete or hardcoded production patch | Rejected for an in-scope public behavior. |
| Patch affecting only excluded behavior | Do not call it an in-scope attack. |

Gold-derived variants demonstrate some flexibility, not full independence. Verify
that patches actually applied, the runner started, and every required ID was parsed.
Never test the baseline accidentally after patch preparation failed. Separate runner
or parser failure from assertion failure; retain infrastructure retries.

Use full-suite results as additional evidence. A full upstream snapshot suite can
legitimately differ after a rendering fix; explain those differences. Do not silently
ignore unrelated failures or require obsolete output merely because it existed before.

After the inner session saves its trace, run `helix task oracle`. A scratch mounted
harness replay is useful isolation but does not replace required local/hosted oracle.
Revalidate after executable changes; do not replay every expensive check after a pure
documentation change without a material reason.

## Probes and leakage

Inspect installed syntax with `rv check --help` and `rv check --list-checks --no-color`.
Versioned examples from the source environment were:

```bash
rv check --check 'swemultimodal/probe-gameability' --executor docker
rv check --check 'swemultimodal/probe-altsolve' --executor docker
rv check --check 'swemultimodal/probe-leakage' --executor docker
rv check --check 'swemultimodal/probe-media-ablation' --executor docker
```

Verify current provider/model support, output paths, and job authorization before
launching. A general `rv check` may invoke models; it is not necessarily cheap lint.
Do not reuse historical OpenRouter environment overrides blindly; the inspected
swemultimodal implementation pinned Codex execution irrespective of the old override.

Audit image copies, Git history, services, media, caches, test outputs, author notes,
and duplicate fixed source for leakage. Keep only deliberate compact review evidence;
do not accumulate raw probe jobs inside the managed task. Missing evidence, expired
keys, permission-denied staging, and timeouts are not clean probe passes. Read the
report's candidate patch and results before accepting its conclusion; route findings
through [review-and-calibration.md](review-and-calibration.md).
