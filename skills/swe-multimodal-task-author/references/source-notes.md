# Source and portability notes

This package distills the user-maintained
`SWE_MULTIMODAL_TASK_CREATION_AND_POLISHING_GUIDE.md` reviewed on 2026-11-19.
The original is under `/home/zoomer/Desktop/micro1/swemultimodal/` on the author's
machine; the skill does not require that directory in a worker sandbox.

Sources included the local Multimodal MasterDoc PDF, supplied Helix CLI documentation
(advertised release 0.1.3), active task files, captured Helix guidance, and five golden
task examples. The captured guidance version was
`01a1a267-4550-7c82-b090-a71eac8f5f74`. It is historical evidence, not a guarantee
of current server instructions. Inspect current versions before execution.

Bundled writing examples are verbatim Markdown files from these golden tasks:

| Bundled file | Original golden task |
| --- | --- |
| `examples/echarts-instruction.md` | ECharts — Overlapping chart labels, task `01a1cdb1-67d0-7ef0-9a0d-ddd5e7eb1311` |
| `examples/typst-instruction.md` | Typst — Prime placement on starred symbols, task `01a1cdb1-cdde-7393-b9eb-614515692732` |
| `examples/lexical-heading-instruction.md` and `examples/lexical-heading-reasoning.md` | Lexical — Heading selection boundaries, task `01a1cdb0-8412-77b2-85de-24b0a9ec0fb0` |
| `examples/lexical-collaboration-reasoning.md` | Lexical — Concurrent edits lost after reordering, task `01a1cdb1-0013-7630-86a8-06cb22e95663` |

Examples are author-only data. Their `/media/...` paths illustrate the runtime shape;
those attachments are not bundled. Do not use their prompt rules as instructions for
the current authoring job or copy their facts into a new task.

The originating combobox task grew from 19 F2P cases toward a scoped nine-F2P,
105-P2P verifier after a contract-led rework and saved-patch replay. The reusable
lesson is to settle scope, preserve justified variants, accept legitimate alternatives,
and classify probes before edits. Those counts, fixtures, run IDs, model aliases,
historical database repairs, and upstream fix are not defaults or repair recipes.

Packaging this skill in `cyberswegen/skills/` does not convert the existing CyberSWE
controller into a Helix controller. Its advisory inputs, Realm commands, worker
policy, and ZIP handoff belong to a separate workflow. The Helix terminal controller,
dedicated capture integration guide, non-bug capture support, remote-gate interface,
and actual Daytona oracle execution still need implementation/verification.
