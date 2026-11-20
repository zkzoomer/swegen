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

Judge contract and implementation before classifying. A 5/9 score does not prove the
other four requirements were fair. One passing run proves solvability, not universal
fairness. A correct diagnosis without media can expose a necessity problem even if
the solver's implementation fails.

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

Start with the shared brief request and clearly labeled broken/working media in
[authoring.md](authoring.md). Keep this initial version and its evidence. The user
wants the shortest fair report as a difficulty screen, not misleading text or an
implementation hint. Four valid authorized rollouts give this local screening rule:

- 0/4 true passes: potentially promising difficulty, but final solvability is unproven.
- 1–2/4 true passes: candidate target met if fairness, necessity, and verdicts hold.
- 3–4/4 true passes: above this job's desired lower-bound difficulty screen; flag it.

These are this job's screening preferences, not a replacement for the live pipeline.
Do not count infrastructure failures, false fails, or false passes toward the band.
After a promising low result, add only a natural clarification that addresses actual
confusion, preserving media necessity, to aim for 1–2/4 within the authorized budget.
No wording ensures that exact result. Stop rather than cycle indefinitely or obscure
the prompt to lower scores. Probes/oracle do not supply the rollout pass rate.

## Calibrate by what agents actually missed

- Missing/broken media access: fix paths and packaging.
- Unclear legitimate attachment roles: label those roles without explaining the fix.
- Fleeting or illegible evidence: improve the real capture.
- Missing feature API/constant: disclose the public contract; do not require guessing.
- Correct repair rejected by incidental assertion: fix the verifier.
- Correct understanding but bad engineering: investigate actual difficulty before
  repeating the diagnosis in the prompt.
- Unrelated hidden requirements: remove them or settle scope with the owner.

The outer agent updates the prompt; the inner saves it. Keep wording brief, natural,
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
