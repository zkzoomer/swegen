# Feature branch

Use for adding an assigned public capability or behavioral contract. A task with
externally observable new behavior is not a behavior-preserving refactor.

- **Prompt:** state the required observable capability. Disclose new public names,
  imports, signatures, defaults and constants only where the graded interface requires
  them. Existing UI/command behavior can be the public contract; do not prescribe a
  new internal callback merely because the gold uses one. Hidden callers must not
  require guessed APIs. Withhold implementation and keep the brief plain.
- **Media:** use a real supplied design/specification or authorized reference program
  containing a material requirement not already fully stated by text and code. A
  screenshot of an absent feature often specifies nothing. Do not create a target by
  capturing the gold implementation and pretending it was an independent specification.
- **Tests:** use the public surface, representative boundaries, error cases, and
  preservation behavior. Require only facts discoverable from the combined brief,
  real media, and established interfaces. Accept different correct implementations.
- **Unsupported:** the current capture kit is bug/fix focused. Confirm actual tool
  support and source material before capture; report a missing design or unsupported
  path instead of inventing the task's visual contract.

Return to [authoring](../authoring.md), [media](../media.md), and
[verification](../verification.md) at the relevant stage.
