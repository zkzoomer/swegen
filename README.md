# CyberSWE Daytona task generator

This controller creates a disposable Daytona sandbox from the configured CyberSWE
snapshot, asks the operator to authorize Codex with a one-time ChatGPT device login,
and runs an autonomous task-building job. A successful job returns one verified handoff
ZIP to the local `outputs/` directory.

Codex uses the operator's signed-in ChatGPT plan. The controller does not send an
OpenAI API key to Daytona and does not require separate API billing.

## Prerequisites

- Node.js 18 or newer
- A Daytona API key and the name of the prepared CyberSWE snapshot
- A ChatGPT account eligible to run the configured Codex model

Install dependencies with:

```bash
npm install
```

Copy `.env.example` to `.env` and configure:

```ini
DAYTONA_API_KEY=
DAYTONA_SNAPSHOT=cyberswe-worker-rv-0-0-151-v2
CODEX_MODEL=gpt-5.6-sol
CODEX_REASONING_EFFORT=high
LOCAL_OUTPUT_DIR=./outputs
```

Do not add `OPENAI_API_KEY`, `CODEX_API_KEY`, or a ChatGPT credential to the image,
snapshot, repository, or `.env` file.

## Optional media capture tools

Keep micro1's proprietary `media-capture-kit` outside this repository. Set its
absolute local path in the ignored `.env` file:

```ini
MEDIA_CAPTURE_KIT_DIR=/absolute/private/path/to/media-capture-kit
```

Before creating the sandbox, the controller validates that directory and prepares
the required kit files, library, documentation/notices, and the repository's
`swe-multimodal-task-author` skill. It uploads them at runtime, verifies SHA-256
checksums, and registers the skill under the outer workspace's `.agents/skills/`.
The worker receives these paths:

```text
MEDIA_CAPTURE_KIT_DIR=/opt/micro1/media-capture-kit
SWE_MULTIMODAL_SKILL_DIR=/opt/swegen/skills/swe-multimodal-task-author
```

No kit source is committed or included in the base-worker Docker build context or
snapshot. The kit may build private temporary capture images containing its library.
Existing jobs are unaffected when the setting is absent. Auth-only smoke
runs skip the kit. Configured dry runs include provisioning but do not capture media
or invoke a model. Normal sandbox success/recovery cleanup also covers these files.

The transfer does not install Harbor executor credentials or launch captures.
Follow the skill's [capture guide](skills/swe-multimodal-task-author/references/capture-kit.md).
Only selected media belongs in a submitted task; keep the proprietary kit, temporary
capture tasks, unselected comparisons, and reproduction/audit files in private staging.
The multimodal task workflow selects matching broken/working visual outputs for the
solver and labels their roles; neither capture tooling nor reference source is shipped.

The current CLI still builds CyberSWE advisory jobs. Runtime provisioning makes the
tools available; the full Helix job mode and nested author-session controller remain
separate integration work.

## SWE Multimodal outer-agent workflow

The operator launches an outer agent in a private Daytona worker. It receives the
assigned Helix URL/brief and the
[`swe-multimodal-task-author` skill](skills/swe-multimodal-task-author/SKILL.md), captures
real broken/working media, supplies a short fair prompt, and guides an inner recorded
`helix task author` session through construction and oracle success. One judgment
lane and four separate probes run in parallel on frozen isolated copies. Repairs
are reviewed for generality; only affected checks rerun, with at most five reruns per
probe. Invalid findings go in task-root `disputes.md`. The outer finalizes concise
`reasoning.md` through a recorded save, then returns the inspected Helix ZIP.

The [initial prompt and prerequisites](skills/swe-multimodal-task-author/references/worker-launch.md)
and [exact QC commands/retry loop](skills/swe-multimodal-task-author/references/qc-loop.md)
are part of that skill and transfer with it. The
[image build/push instructions](docker/README.md) now include Helix. Pairing and
Codex/provider authentication happen at runtime, never in the image.

The existing `--advisory` launcher below still runs CyberSWE. A Helix URL mode and
interactive inner-session driver must be wired separately; transferring a skill and
installing Helix do not implement those interfaces. Do not use the CyberSWE worker
policy/template as a replacement for the multimodal initial prompt.

## Authentication smoke test

Run this before the first real job:

```bash
npm run start -- \
  --advisory https://github.com/cosmos/evm/security/advisories/GHSA-7g4w-cg88-2cq2 \
  --auth-smoke
```

The controller prints a URL and one-time device code. Open the URL in your browser,
enter the code, and approve access. The sandbox then runs a one-turn Codex request,
logs out, and is deleted. It does not build or download a task.

## Real task-building job

```bash
npm run start -- \
  --advisory https://github.com/OWNER/REPOSITORY/security/advisories/GHSA-xxxx-xxxx-xxxx \
  --task-id 1234
```

Use `--focus "short approved scope"` when one advisory describes several independent
issues. `--task-id` is optional and defaults to placeholder `1`; when the real Realm ID is
known, provide it so the generated `task.toml` is immediately correct. The fixed task author is
`Sergio Martinez <sema8047@expert.micro1.ai>` and is written into every `JOB.md` automatically.
The worker names the task `<organization>-<repository>-<advisory-identifier>`, so normal
`rv submit` produces the same canonical basename with a `.zip` extension.

After device authorization, the controller streams the task-building worker's progress. On
success it verifies the remote artifact, downloads it, verifies the local SHA-256, logs Codex
out, and deletes the sandbox. The outer handoff contains the untouched `rv submit` task ZIP,
`reasoning-notes.md`, and `draft-proposal.txt`. It includes `validation-summary.md` only when a
misleading probe finding needs explanation. The worker runs `rv submit` normally and must not
delete Realm's `qc_artifacts/` first. The controller downloads the handoff; it does not rebuild
the task ZIP.

## Non-authentication dry run

```bash
npm run start -- \
  --advisory https://github.com/cosmos/evm/security/advisories/GHSA-7g4w-cg88-2cq2 \
  --dry-run
```

This tests snapshot creation, Docker, Realm Verifier configuration, ZIP validation,
download, and cleanup without authenticating or invoking Codex.

## Credential lifecycle

`codex login --device-auth` stores a renewable login only inside the newly created
sandbox. The controller removes that login with `codex logout` before normal deletion.
Failed and interrupted jobs destroy their sandbox instead of retaining an authenticated
worker. If Daytona reports that deletion failed, delete the named sandbox manually from
the Daytona dashboard.

The credential is accessible to processes running as the sandbox user while the job is
active. Do not reuse or snapshot an authenticated sandbox.

## References

- [Codex SDK](https://developers.openai.com/codex/sdk/)
- [Sign in with ChatGPT for self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
- [Daytona documentation](https://www.daytona.io/docs)

## License

See [LICENSE](LICENSE).


```
set -o pipefail

npm run start -- \
  --advisory <advisory> \
  --task-id <task-id> \
  2>&1 | tee "traces/task-1234-$(date -u +%Y%m%dT%H%M%SZ).txt"
```


npm run start -- \
  --advisory https://github.com/cosmos/evm/security/advisories/GHSA-367m-g444-9mg3 \
  --task-id 3157 \
  2>&1 | tee "traces/task-3157-$(date -u +%Y%m%dT%H%M%SZ).txt"
