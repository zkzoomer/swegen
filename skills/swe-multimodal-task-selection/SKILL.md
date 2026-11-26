---
name: swe-multimodal-task-selection
description: Screen and compare candidate SWE Multimodal tasks before authoring, using evidence from past tasks to assess visual necessity, scope, verifier fairness, difficulty and reproduction cost. Currently a scaffold with a completed historical casebook.
---

# SWE Multimodal Task Selection

This skill is intentionally a scaffold. The selection workflow and decision templates
are not written yet. Only [the past-task casebook](references/past-tasks.md) contains
completed analysis. Read that file for evidence and lessons; do not treat the other
files' planned sections as an implemented or validated procedure.

## Planned reference files

| File | Intended use | Status |
| --- | --- | --- |
| [Candidate screening](references/candidate-screening.md) | Find candidates, check eligibility, compare initial hypotheses | Outline only |
| [Visual evidence](references/visual-evidence.md) | Establish necessary information, realism and reproducible contrast | Outline only |
| [Scope and verifier](references/scope-and-verifier.md) | Define one observable contract and grade alternatives fairly | Outline only |
| [Feasibility and cost](references/feasibility-and-cost.md) | Bound setup, capture and verification effort | Outline only |
| [Difficulty and trace review](references/difficulty-and-trace-review.md) | Separate genuine solves/failures from refusals, retrieval and grading defects | Outline only |
| [Selection handoff](references/selection-handoff.md) | Record a go, hold or reject decision with evidence | Outline only |
| [Past tasks](references/past-tasks.md) | Four good selections, three misses and practical lessons | Written |

## Workflow

Placeholder: derive the operational workflow from the casebook and current pipeline
requirements in a later revision. This skill does not start paid runs, claim tasks,
replace an assigned PR, or authorize external actions.

The existing `swe-multimodal-task-author` skill covers implementation after selection.
Historical outcomes concern particular versions, not guarantees about a repository,
model family or future pass rate.
