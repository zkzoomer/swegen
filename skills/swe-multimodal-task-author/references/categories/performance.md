# Performance branch

Use for an assigned observable efficiency problem while preserving correctness.
Keep a meaningful reasoning task rather than a hidden one-line optimization target.

- **Prompt:** identify the observable performance issue and applicable constraints;
  leave the diagnosis and prescribed optimization undisclosed. Do not name upstream
  answers or hide required workload constants from both prompt and real media.
- **Media:** capture the actual workload/state/sequence needed to identify or reproduce
  the issue. It must reveal a material fact. Do not slow the app artificially or rely
  on apparent video speed as the correctness/performance oracle.
- **Tests:** prefer deterministic work/cost measurements such as operation counts,
  bounded allocations, or supported complexity proxies, plus correct results and
  regressions. Use timing only when necessary; stabilize it with appropriate controls,
  warmup, and margins under measured resource limits.
- **Capture support:** verify that the installed bug/fix-oriented kit can run the
  actual workload and preserve comparable evidence. Missing services or workload data
  are explicit unsupported cases, not permission to synthesize a convenient scenario.

Return to [authoring](../authoring.md), [media](../media.md), and
[verification](../verification.md) at the relevant stage.
