# Source and portability notes

This package distills the user-maintained
`SWE_MULTIMODAL_TASK_CREATION_AND_POLISHING_GUIDE.md` reviewed on 2026-11-20.
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

Packaging this skill in `swegen/skills/` does not convert the existing CyberSWE
controller into a Helix controller. Its advisory inputs, Realm commands, worker
policy, and ZIP handoff belong to a separate workflow. Runtime kit/skill provisioning
and the [capture integration guide](capture-kit.md) were added on 2026-11-20.
The Helix terminal controller, non-bug capture support, capture-executor authentication,
remote-gate interface, and actual Daytona capture/oracle execution still need
implementation/verification. Local transfer tests do not establish live execution.

The 2026-11-20 automation revision adds the outer launch prompt and ordered workflow,
paired broken/working media policy, fair lower-bound screen, one judgment plus four
parallel probe lanes, and one initial run plus at most five reruns per probe. This
parallelism/retry ceiling is user policy, not a quote from the PDF. It changes default
completion to returning a Helix ZIP; upload remains available in explicitly included
jobs. The canonical explanation remains `reasoning.md`. Final prose saving may need
a brief resumed recorded session after the main author session has closed.

The local `rv` 0.0.152 check listing exposes `judgment` and four named swemultimodal
probes. A no-network listing in the old 0.0.151 worker confirmed only three probes, with
media ablation absent. The image pin was therefore advanced to 0.0.152; verify the
rebuilt worker listing. Helix 0.1.3
help confirms `author`, `author --upload-only`, and `zip --destination`. The image
installs a pinned public binary using the official HTTPS release locator/checksum
layout inspected at https://helix.micro1.ai/install.sh; it does not include pairing.
