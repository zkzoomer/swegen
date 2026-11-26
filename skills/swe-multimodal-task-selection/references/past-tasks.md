# Past tasks: what to repeat and what to avoid

Updated **26 November 2026** with version-bound #8650 reviews. Review-status labels
retain the user's 24 November clarification; measured batches below are historical
checkpoints, not claims about every subsequent task version or platform acceptance.

**MUI #5232, Tiptap #8650, Glide #1052 and Payload #11579 were good task selections.
All four are in review or close to it.** They required polishing, but the verifier,
scope and calibration issues encountered during that work do not make them bad
selections. These are the positive examples to learn from.

| Task | Outcome | Main selection lesson |
| --- | --- | --- |
| MUI Base UI #5232 | Good task; in or near review | Retained state and the timing of a UI transition create meaningful depth |
| Tiptap #8650 | Good task; in or near review | Several operations must agree on one visual/document relationship |
| Glide Data Grid #1052 | Good task; in or near review | Fixing the initial frame is insufficient when later interaction still breaks |
| Payload CMS #11579 | Good task; in or near review | Temporal evidence distinguishes a real scheduling problem from simpler nearby bugs |
| Tiptap #8619 | Technically worked, but too easy for the intended screen | A clear visual bug can still reduce to a recognizable local repair |
| Paper.js #2509 | Technically worked; retained for review, but media necessity failed | Graphics work is not automatically multimodal |
| React Three Fiber #3803 | Discarded after reproduction investigation | Complex source code is useless as a candidate without a verified reproduction |

## Why the four good tasks worked

They share a useful pattern: **the media identifies an interaction or relationship,
and a complete fix must keep several pieces of observable behavior consistent.**
There is a plausible first repair that looks right but misses something important.
The missed behavior belongs to the same problem, rather than being an unrelated
feature added to make the task harder. Independent implementations can still pass.

### MUI Base UI #5232 — restoring the retained selection

[PR](https://github.com/mui/base-ui/pull/5232) · Folder: `mui-base-ui-combobox-clear`

The user filters a combobox and clears the query. The selected value is still
correct, but its active highlight and scroll position are lost or move to another
option. The recordings distinguish selection, highlight and visibility.

This is good task depth: filtering changes indexes and mounted options, while a
controlled input may reject the clear. A repair must restore the right item at
the right time without changing selection or breaking later navigation.

**Evidence indexed 24 November:** `01a1ee29-9230-7f0a-89b3-a4b82eaacf69`
(checksum `f91f2ba2398b…`) passes all 9 feature and 105 preservation tests with a
general repair. Other reviewed versions include one passing all feature tests but failing both rejected-controlled-clear cases:
it restores after a requested clear that never actually commits.

**What to repeat:** interaction bugs involving retained state across filtering,
rendering or controlled updates. **What to improve:** settle that state transition
before writing tests. Our repeated probe-driven additions made authoring needlessly
long. Exact scroll arguments, private caches and automatic clears after changing
selection were not the core task.

### Tiptap #8650 — search across continued paragraphs

[PR](https://github.com/ueberdosis/tiptap/pull/8650) · Folder: `ueberdosis-tiptap-pr8650`

The media, brief and existing editor establish which paragraph fragments form one
logical searchable span and which boundaries remain separators. Search, highlighting,
navigation, replacement and updates after edits must all agree on that relationship.

This makes a good task because concatenated text offsets differ from document
positions, and a working initial search can become stale after marker changes.
These are connected requirements of the same feature.

**24 November checkpoint:** Frontier batch `01a20dcd`, checksum `3c67edc345d7…`,
has two genuine passes at 16 feature + 120 preservation tests. Its other two pass
13/16 feature tests and all regressions but miss attribute-only refresh. The full
run IDs and checksum are in the dated inventory below; this is an older version.

**26 November checkpoint:** the weak batch `01a21490` and Frontier batch `01a216a2`
both score 1/4 on checksum
`359562a6bab9c3170c7f9c0872aa3eecc96bf8364157b6b99325aad4ad74023d`.
The prompt is: "Can you fix the issue shown here? The last search is fine. Please
preserve the existing Replace behavior." It supplies only the broken recording.
Weak winner `01a21490-236b-7404-b19d-13ff09181d48` passes all 136 checks; the other
three have range, pending-query, update or paragraph-boundary defects.

| Frontier run | Feature / preservation passed | Reviewed outcome |
| --- | --- | --- |
| `01a216a2-7be0-7a36-9858-ed74e542e725` | 9/16 + 120/120 | Keeps paragraphs separate during replacement; also misses a whole-word match after continuation is removed. |
| `01a216a2-7be2-7592-ba35-d107482cdb35` | 16/16 + 120/120 | Genuine general solve; retains ordinary full-range replacement and handles marker edits and pending queries. |
| `01a216a2-7be6-7fa4-b5fb-184f5b915a2e` | 10/16 + 120/120 | Deliberately changes replacement to retain the split paragraphs. |
| `01a216a2-7be7-78a4-b041-670ea6c165a1` | 10/16 + 120/120 | Makes the same replacement-policy change through a different helper. |

The review initially questioned replacement ambiguity. The final true-failure case
rests on the explicit preservation request, existing full-range replacement semantics
and the patches' deliberate change to those semantics. The author-only PR confirms
intent but is not itself solver-facing evidence. Six joining assertions expose one
behavior change. Weak runs retained the existing operation; Frontier hesitation does
not by itself establish an unfair requirement. This is our evidence-based assessment,
not a claim that the platform has accepted the review.

**What to repeat:** features where several existing operations must implement one
media-defined relationship. **What to improve:** grade the real application behavior,
identify expected negative results, and assess which uncertainty each prompt hint
removes. Do not infer causation from small batches or change verdicts to hit a band.
We removed the requirement to guess the reference's exact new `continuesNode` API
and tested the existing React demo instead. Unshown cross-parent joining remained
outside the task.

### Glide Data Grid #1052 — usable navigation after zoom

[PR](https://github.com/glideapps/glide-data-grid/pull/1052) · Folder: `glideapps-glide-data-grid-pr1052`

The grid is logically taller than the browser can physically scroll. Zoom changes
the mapping between physical scroll position and virtual rows. The recorded failure
includes blanking and broken navigation afterward.

This is a good task because clamping the visible result can hide the symptom while
leaving the stored offset wrong. The next wheel or scrollbar interaction exposes
the incomplete repair. The difficulty lies in coherent state feedback.

**Evidence indexed 24 November:** `01a20d99-702f-7e49-987a-2984bec6e11d`
(checksum `8adb3255e6ca…`) is a genuine weak-track regraded pass at 2 feature +
155 preservation tests using bounded native height and coherent offsets. The four
Frontier runs in batch `01a20dce` (checksum `f932b9c16b0e…`) fix initial validity but
still trap upward scrolling. Those version-bound incomplete fixes are useful
difficulty evidence, not a reason to classify the selection as bad.

**What to repeat:** recovery bugs where later interaction separates a complete fix
from a cosmetic one. **What to improve:** reproduce native browser behavior early
and cover both movement directions. We corrected an unfair metadata-overscan guard
and a missing downward-scroll case; both were verifier-polishing lessons.

### Payload CMS #11579 — bounded work while editing

[PR](https://github.com/payloadcms/payload/pull/11579) · Folder: `payloadcms-payload-pr11579`

The real form's Network panel shows requests continuing long after typing stops.
The working behavior settles promptly while retaining current values and validation.
That timing evidence points to scheduling rather than merely a merge-helper bug.

The task is good because debounce-only and stale-response-only repairs are both
plausible but incomplete. Admitted work, pending edits, accepted server state and
ordinary form behavior must stay consistent.

**Evidence indexed 24 November:** `01a20325-5e8e-73cd-be2c-a951ff413777`
(checksum `4a5a541e86f6…`) passes all 4 feature and 115 preservation tests with a
general coalescing/revision-aware repair. Three other attempts in that batch fail
the backlog cases. Another batch solves those
cases but loses existing data when adding an array row—a real integration regression.
The blind probe instead fixes an unrelated mutation issue.

**What to repeat:** temporal bugs with competing plausible diagnoses and meaningful
state preservation. **What to improve:** exercise the real public composition so
repairs in Form, Edit or the provider remain valid. Treat demands for a particular
preemption policy as scope questions; they do not automatically invalidate an
otherwise bounded, correct scheduler.

## The three selections that did not pay off

### Tiptap #8619 — valid behavior, insufficient difficulty

Historical snapshot rendering loses deleted text's earlier formatting. The task
was technically completed, but weak agents continued to solve it even with a
generic prompt and only the broken clip.

The weak batch `01a20ddf`, reviewed on 24 November at checksum `e0ceefc43e12…`,
contains two independent full passes at 2 feature + 107 preservation tests. The
other two correctly diagnose the issue but stop over unavailable GitHub checks;
they do not demonstrate engineering difficulty. An older answer-retrieval run is
separate from these independent solves.

**Lesson:** once the clip reveals the defect, a historical-formatting merge is too
recognizable for the desired screen. Stop stripping fair information or adding
unshown requirements just to lower scores; choose a harder candidate.

### Paper.js #2509 — source already supplies the specification

The stroke profile needed to govern paint, bounds, hits and edits. We built a good
technical implementation and verifier. However, authentic source documentation
already described that missing integration.

A blind agent independently repaired the entire behavior and passed all 4 feature
and 978 preservation tests. The clips were redundant. The user retained the task
for review, but it is a negative selection example for media necessity.

**Lesson:** inspect source comments and existing APIs before investing. A task can
be visually rich and difficult without requiring the supplied media. Removing
authentic documentation to manufacture necessity is not a good remedy.

### React Three Fiber #3803 — no verified causal reproduction

The resource-lifecycle/HMR repair looked deep, but we could not obtain a reliable
broken/working visual difference, including after GPU investigation and checking
that the reference patch was applied. Some scenarios worked in both versions;
others stayed stale in both.

The user discarded it before a completed behavioral verifier. This was reproduction
risk, not measured model difficulty.

**Lesson:** for GPU/HMR candidates, first prove the exact edit sequence and scoped
visual improvement on the actual execution stack. Nine interconnected source files
do not compensate for a missing reproduction.

## What this means for selecting the next tasks

1. **Use all four good tasks as positive examples.** Their shared strength is a
   media-demonstrated interaction with several related behaviors that must agree.
2. **Look for a convincing incomplete repair.** A clamp that traps navigation,
   search that becomes stale, restoration before an accepted clear, or stale-state
   protection that leaves a request backlog reveals useful engineering depth.
3. **Check media necessity early.** Ask what the recording tells the engineer that
   the source and prompt do not. Paper shows the cost of postponing this check.
4. **Prove reproduction before heavy authoring.** Especially for native zoom, GPU,
   HMR and service-heavy applications. R3F should have stopped at this checkpoint.
5. **Keep grading on the public contract.** Accept independent APIs, repair layers
   and algorithms. Assess probe findings before expanding scope or adding tests.
6. **Review actual attempts.** Workflow refusals, infrastructure errors and answer
   retrieval differ from incomplete repairs. Verify scored passes too.
7. **Separate selection quality from polishing and review.** MUI, #8650, #1052 and
   Payload were good choices despite issues we corrected or discussed along the
   way. A difficult review or one awkward batch does not erase that outcome.
8. **Use file counts only to estimate work.** The initial shortlist favored #8619
   and reserved #8650. Glide's two-file repair proved deep; R3F's nine-file repair
   never became reproducible. Source size did not predict suitability.

## Supporting evidence

The 24 November review indexed **102 unique downloaded runs**, including multiple
versions and regrades. Duplicate ZIPs were excluded. The concise conclusions above
retain that evidence; they do not repeat every intermediate grading result.

- Run inventory: `outputs/task-selection-review-20261124/run-index.json`.
- Previous detailed write-up: `outputs/task-selection-review-20261124/past-tasks-detailed.md`.
- Hosted ZIPs: `/home/zoomer/Downloads/<task title> - rollout_<run_id>.zip`.
- Tasks: `/home/zoomer/Desktop/micro1/swemultimodal/swe_multimodal/tasks/`.
- 24 November #8619/#8650/#1052 audits: `outputs/task-batch-20261123/trace-review-20261124/`.
- 26 November #8650 batches: the eight original ZIPs in Downloads with run prefixes
  `01a21490` (weak) and `01a216a2` (Frontier). Match the full run IDs and shared
  checksum above; these are additional attempts, outside the 102-run inventory.
- Payload summary: `outputs/payloadcms-payload-pr11579-handoff-1795292993625/validation-summary.md`.
- Paper/R3F reports: `outputs/paperjs-pr2509/` and `outputs/react-three-fiber-pr3803/`.

Raw evidence stays outside the skill and solver task environments. When revisiting
a result, match the run ID and task version; regrades are not new model attempts.
