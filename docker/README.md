# Swegen Daytona worker image

`Dockerfile.swegen` builds the multimodal worker image. It builds:

- `worker-base`: public toolchains, Docker, uv, Codex, **Helix 0.1.3**, and upload utilities;
- `worker`: the complete image, adding pinned private `rv` (currently 0.0.152).

Helix is installed from its versioned public release with checksum/version checks.
Change `HELIX_VERSION` deliberately when upgrading. Neither target contains Helix
pairing, Codex login, provider credentials, or micro1's proprietary capture kit.
The controller sends the kit to a private compute worker. Both authoring agents now
run locally. Codex runs on the worker for rv probes; Helix is retained for compatibility
and needs no worker pairing.
The earlier multimodal migration required a rebuild: the agent runtime path is now
`/opt/swegen-agent`, so snapshots with the previous path are insufficient. The local-agent refactor itself
does not require another rebuild; support scripts upload at runtime.

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

This uploads the image. The launcher uses local Helix and one persistent compute
worker. The launch contract and validation requirements are in
[worker-launch.md](../skills/swe-multimodal-task-author/references/worker-launch.md).
A local secret-backed build followed by `snapshot push` is the documented path here;
do not replace it with a remote Dockerfile build that lacks the private build secret.
Official references: [snapshots](https://www.daytona.io/docs/en/snapshots/),
[CLI](https://www.daytona.io/docs/en/tools/cli/).

## Runtime readiness

Pair Helix and sign into Codex on the operator's machine, then check `helix status`,
`helix doctor`, `codex login status` and local Docker. Helix download, recorded
authoring, trace saving and the final official oracle all run locally.

The controller uploads the private capture kit and execution helpers to the worker.
It provisions rv's selected judge credentials and the Codex login needed for probes,
then validates them before agents start. See [the setup guide](../README.md#setup).
Keep credentials out of snapshots, task ZIPs, prompts and media. Do not snapshot an
authenticated worker; successful workers are deleted after evidence transfer and
failed workers have their probe login removed before recovery retention.

The image includes `upload-task-to-drive` for jobs that explicitly use it. Supply a
restricted Google service-account credential at runtime and share only the destination
folder. It is unrelated to the default multimodal ZIP return path. See its installed
help for configuration; do not bake Google credentials into the image.
