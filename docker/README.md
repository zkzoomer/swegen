# Swegen Daytona worker image

`Dockerfile.swegen` builds the multimodal worker image. It builds:

- `worker-base`: public toolchains, Docker, uv, Codex, **Helix 0.1.3**, and upload utilities;
- `worker`: the complete image, adding pinned private `rv` (currently 0.0.152).

Helix is installed from its versioned public release with checksum/version checks.
Change `HELIX_VERSION` deliberately when upgrading. Neither target contains Helix
pairing, Codex login, provider credentials, or micro1's proprietary capture kit.
The controller sends the kit and multimodal skill to a private running worker.
Rebuild this image for the multimodal migration: the agent runtime path is now
`/opt/swegen-agent`, so an older snapshot with the previous path is insufficient.

## Build locally

If token refresh reports reauthentication required, run `gcloud auth login` locally
first. Then, from the repository root, use BuildKit's secret mount for the short-lived private
package token. Do not put it in a build argument, Dockerfile, or image:

```bash
set -euo pipefail
umask 077
rv_token_file=$(mktemp)
trap 'rm -f "$rv_token_file"' EXIT
gcloud auth print-access-token > "$rv_token_file"

docker build --platform linux/amd64 \
  --build-arg HELIX_VERSION=0.1.3 \
  --secret id=artifact_registry_token,src="$rv_token_file" \
  -f Dockerfile.swegen \
  -t swegen-worker:multimodal-v1 .
```

For public tools only, omit the secret and use `--target worker-base` with a distinct
tag. Full jobs need the final `worker` target because they run private `rv` checks.
A public-base build is not evidence that the private package installation works.

Smoke-check the built image without starting its Docker daemon or authenticating:

```bash
docker run --rm --entrypoint bash swegen-worker:multimodal-v1 -lc \
  'helix --version && helix task author --help && helix task zip --help && codex --version && rv --version'
```

## Push the local image to Daytona

Authenticate the local Daytona CLI with the operator's existing account. The installed
CLI supports local-image upload; a public Docker Hub push is unnecessary:

```bash
daytona snapshot push swegen-worker:multimodal-v1 \
  --name swegen-multimodal-v1 \
  --cpu 8 --memory 32 --disk 100

daytona snapshot list
```

Those resource values are an example (memory/disk in GB for the inspected CLI). Use
available quota and measured peaks for the actual five-lane workload, including its
nested Docker containers; the CLI's 1 CPU / 1 GB defaults are not a useful benchmark.
If the snapshot name already exists, use a new versioned name. The image must be AMD64
for this documented route, hence the build platform flag. Verify installed help:

```bash
daytona snapshot push --help
```

Set the exact ready snapshot name in the controller's ignored `.env`:

```ini
DAYTONA_SNAPSHOT=swegen-multimodal-v1
```

This uploads the image. The multimodal launcher pairs Helix separately in each
disposable worker, with the expected account set in the job configuration. The
outer-agent launch contract and remaining live-validation requirements are in
[worker-launch.md](../skills/swe-multimodal-task-author/references/worker-launch.md).
A local secret-backed build followed by `snapshot push` is the documented path here;
do not replace it with a remote Dockerfile build that lacks the private build secret.
Official references: [snapshots](https://www.daytona.io/docs/en/snapshots/),
[CLI](https://www.daytona.io/docs/en/tools/cli/).

## Runtime readiness

Before a Helix task job, pair the worker through the supported runtime approval flow,
then download the assigned task. Pairing the laptop does not pair the worker:

```bash
helix setup --root /home/daytona/helix-tasks
helix status
helix doctor
```

Authenticate Codex under the identity used by both outer and inner processes. Configure
judge/probe providers through supported runtime authentication. A selected `rv` mode
and model must match the installed realm; old provider overrides are not universal.
Keep all credentials out of snapshots, task ZIPs, prompts, and captured media. Never
snapshot a paired/authenticated worker for reuse; retire runtime credentials with it.
Harbor capture's executor credentials are a separate prerequisite.

The image includes `upload-task-to-drive` for jobs that explicitly use it. Supply a
restricted Google service-account credential at runtime and share only the destination
folder. It is unrelated to the default multimodal ZIP return path. See its installed
help for configuration; do not bake Google credentials into the image.
