# Worker launch contract

The operator's machine creates a private Daytona worker. Provision this entire skill
and the proprietary capture kit through the existing runtime asset uploader, then
launch the outer agent with the prompt below. Register the skill in that agent's
workspace `.agents/skills/`; do not send the CyberSWE advisory `AGENTS.md` or advisory
job template to a Helix task worker.

## Initial outer-agent prompt

Replace the task-specific fields before launch. The build/QC flow is shared; task
facts are inputs, not additions to the generic skill.

```text
Use $swe-multimodal-task-author to prepare this assigned task.

Helix task: <existing task URL>
Assigned issue and scope: <brief supplied assignment>
Repository/base and issue or PR: <author-side references>
Output: return the complete Helix task ZIP to /output and a brief validation summary.
Upload/submission: return-only unless this job explicitly includes upload.

Understand the issue, capture clear real broken/working media with the installed
capture kit, and write the shortest fair initial request with /media links. Guide a
recorded helix task author session until the task is complete and oracle passes.
Run the judgment lane and four separate probes in parallel on one frozen snapshot.
Inspect findings carefully. Require general fixes, review them, and rerun only affected
checks. Each probe has at most five reruns after its initial run, errors included.
Save supported disputes in task-root disputes.md. Finish recorded sessions, finalize
simple five-section reasoning.md through a recorded save, and return the inspected ZIP.

Evaluation: <not included, or live Helix stages/models and budget>
If included, screen with the fair lower-bound prompt; <=2 true passes out of four is
promising, then clarify toward 1–2/4. Zero is not final proof of fair solvability.
Total run/spend/time budget: <concrete limits, including capture workers and QC>
```

Do not confuse this controller prompt with solver `instruction.md`. PRs, gold context,
probe details, and orchestration instructions are author-only.

## Image and runtime readiness

`Dockerfile.cyberswe` is currently the shared image filename. Its public toolchain stage
installs pinned Helix 0.1.3, Codex, uv, and Docker; its final stage adds pinned private
`rv`. The image contains no Helix pairing or Codex login. Build/push instructions are in
`docker/README.md` in the controller repository. Do not snapshot an authenticated worker.

Before asking the agent to build, verify:

- The configured snapshot actually includes Helix: version, `task author --help`, and
  `task zip --help`; Docker works under the actual worker identity.
- Helix is paired for that worker and can access the assigned task. Use runtime
  `helix setup --root /home/daytona/helix-tasks` and its supported approval flow; do
  not assume pairing this laptop automatically paired Daytona.
- Codex is authenticated for both outer and inner processes under the intended user.
  Different users/homes need their own supported setup. Keep credentials out of jobs.
- Kit/skill transfer hashes are verified and both runtime paths exist. Harbor capture
  execution has its own supported dependency/authentication setup and authorized budget.
- Judge/probe providers are authenticated. Inspect `rv check --list-checks --no-color`
  on the actual worker version before launching the documented five lanes.
- The worker has persistent staging, sufficient lifetime and memory for five concurrent
  lanes, and a functioning terminal controller for the inner interactive session.

A full run can exceed the controller's existing four-hour TTL. Choose a job lifetime
and capture/QC budgets explicitly; do not silently truncate or count timeouts as passes.
Pairing and Codex runtime credentials need cleanup when a disposable worker is retired.

## What is implemented versus still to wire

Implemented: runtime upload/hash verification of kit and this skill, skill discovery,
Docker/uv/Codex tools, controller artifact download/hash verification, and the image's
Helix installation. Local tests are not proof of a live capture or nested session.

Still separate integration work: the current `src/index.ts` CLI accepts CyberSWE
advisory jobs and sends their policy/prompt. It does not yet offer this Helix URL job
mode, select this prompt instead, pair Helix, or drive an interactive inner session.
`helix task author --output json` is not documented as a headless conversation API.
A terminal driver must demonstrate start, send, read, clean exit, and trace-save
confirmation before unattended jobs are claimed to work. Do not launch a CyberSWE
advisory command and claim it executed this workflow.

Hosted rollouts and final platform gates also need a supported interaction path;
results listing/downloading does not start an evaluation. This guide does not invent
those interfaces. Report the precise missing capability with preserved staging.
