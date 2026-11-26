# Probe findings, rollout verdicts, and calibration

Use when reports or evaluation archives already exist. Inventory once, then inspect
the relevant evidence. An analysis request does not authorize rerunning paid probes.

## Establish identity and evidence

Use full run IDs, task checksum/version, and actual result, not only download order,
browser filenames, block numbers, or guessed model identity. Several downloads can
be copies of one run. Keep archives/extraction outside the managed task and reject
absolute/traversal paths before extracting.

Locate results rather than assuming one exporter layout: trial/result metadata,
production patch, verifier results/reward, test stdout/stderr, trajectory, and relevant
resource/model logs. Read passing runs too. A final response is not proof the claimed
commands ran. A protected-test modification flag or absent stderr is not a verdict.

| Verdict | Evidence |
| --- | --- |
| True pass | General correct behavior, required preservation, legitimate grading. |
| False pass | Full reward despite a missing contract behavior, overfit, or verifier gap. |
| True fail | A normally executed production repair is wrong/incomplete for a fair in-scope requirement. |
| False fail | A correct reasonable repair is rejected through unfair requirements, ambiguity, or grading/setup defects. |
| Infrastructure failure | Execution/provider/environment failure prevents a completion judgment. |
| Unresolved | Evidence is insufficient to settle the requirement or implementation; retain the question. |

Judge contract and implementation before classifying. A 5/9 score does not prove the
other four requirements were fair. One passing run proves solvability, not universal
fairness. A correct diagnosis without media can expose a necessity problem even if
the solver's implementation fails.

For each decisive failure, record the required behavior, where the solver could
discover it, the patch's behavior and the assertion that distinguishes them. The
brief, media and existing public behavior establish the solver-facing contract;
an author-only PR or hidden test alone does not. Requirements may be inferred from
those interfaces without every input variant being transcribed into the prompt.

An agent's hesitation is not proof of an unfair requirement. A deliberate change to
established behavior can be a true failure even when the agent calls it preservation.
Conversely, rejecting an outcome that the task never established is not engineering
difficulty. Separate that policy question from any independently demonstrated bug.
Count shared causes: six replacement assertions can expose one wrong behavior.
Weak-model successes support discoverability; they do not prove all other verdicts
fair. If reclassifying a run, retain the previous verdict and the new fact or reasoning
that changed it. Do not change verdicts merely to reach a pass band.

## Triage probes before edits

1. Match the report to its actual task snapshot, trial, candidate diff, and results.
2. Reproduce the decisive public behavior and distinguish a real defect from a
   private implementation preference or excluded adjacent transition.
3. Classify the candidate as correct or incomplete against the agreed contract.
4. Repair only the demonstrated gap, through the inner session. Replay appropriate
   saved positive/negative controls together against the new frozen verifier.
5. Keep the report and concrete counterevidence. Do not rewrite reports to manufacture
   a pass or expand scope just because a judge requests another case.

Repeated gameability reports often signal an unsettled contract or overbroad reference.
Reconcile scope and gold once rather than appending fixtures indefinitely. Combining
cases into a parameterized test does not reduce the graded requirements. A real new
gap can still justify a behavioral test after comparison with independent solutions.

An alternative agent's "correct" claim is advisory; inspect regressions. Conversely,
an exact `scrollIntoView` call object or private sentinel can reject a valid alternative.
Use observable visibility/state instead. `needs_review` or "could not decide" means
unresolved evidence, not automatic failure or permission to invent a pass.

## Fair lower-bound screen and calibration

Start with the shortest fair report and selected, clearly labeled media under
[authoring.md](authoring.md) and [media.md](media.md). Keep that version and its evidence.
Follow the live pipeline's model identities and trial counts. The captured ladder
starts with three weak-model runs, then four Frontier runs; historical platform
batches may contain more weak attempts. Record the actual configured stage, not a
model tier guessed from block numbers or redacted aliases.

| Stage | Difficulty criterion |
| --- | --- |
| Weak-model screen | At most one true pass across the configured weak runs. More than one calls for fair hardening or a harder candidate. Zero can advance to Frontier. |
| Frontier calibration | One or two true passes out of four. Zero needs investigation and fair clarification; more than two calls for fair hardening or a harder candidate. |

Do not count infrastructure failures, false fails or false passes as difficulty
evidence. When Frontier has zero passes, address actual confusion with a natural
clarification where needed, preserving media necessity and the agreed contract.
Four attempts are a small sample; changing both wording and model tier cannot
isolate a sentence's effect. No wording ensures an exact pass count. Stop rather
than cycle indefinitely or obscure the prompt to lower scores. Probes/oracle do
not supply the rollout pass rate.

## Calibrate by what agents actually missed

- Missing/broken media access: fix paths and packaging.
- Unclear legitimate attachment roles: label those roles without explaining the fix.
- Fleeting or illegible evidence: improve the real capture.
- Missing feature API/constant: disclose the public contract; do not require guessing.
- Correct repair rejected by incidental assertion: fix the verifier.
- Correct understanding but bad engineering: investigate actual difficulty before
  repeating the diagnosis in the prompt.
- Unrelated hidden requirements: remove them or settle scope with the owner.

The outer agent writes and saves the prompt with outer-save-text. Keep wording brief, natural,
and appropriate to the category. New hints may introduce ambiguity or destroy media
necessity; review actual interpretation and rerun the relevant ablation. Do not
silently simplify/expand the supplied task or select verdicts to hit a pass band.

Follow the current platform ladder. Stop once a fair calibration meets its criteria,
or when the job's budget is exhausted or missing input blocks progress. Keep task
versions separate; old successes do not certify changed tests, gold, environment,
prompt, or media.

## Review notes and disputes

For this job, have the recorded inner session save defensible invalid-finding notes
in task-root `disputes.md`, never inside source or media. Use the evidence-backed
shape in [qc-loop.md](qc-loop.md). A dispute is a retained unresolved/review status,
not a manufactured green check. Probe reruns are limited there; do not reset counters
when a candidate, session, or snapshot changes.


Retain run ID, verdict, approach, decisive failure/preservation result, and any action
required for a false verdict. Keep short factual notes supported by separate evidence.
Use finding → counterevidence → requested reassessment. Missing/truncated judge input
does not prove missing local media, nor does local judge code prove hosted inputs.

The source PDF restricts AI-written reviewer feedback. Analyze locally as needed;
posting analysis/disputes is a separate policy/authorization question. Do not claim
that a saved local note was posted, accepted, or approved.
