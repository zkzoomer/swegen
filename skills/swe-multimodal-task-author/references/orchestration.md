# Local outer/inner workflow with remote compute

The outer plans, captures, reviews and supervises. The recorded inner edits final
local task files. One Daytona worker runs commands and retains Docker/build cache.
Read [worker-launch.md](worker-launch.md) and [local-bridge.md](local-bridge.md).

1. **Understand the assignment.** The launcher downloads or verifies the supplied
   task locally. Read its template, base/PR and existing contents. Keep one observable
   contract and clear exclusions; do not replace the assigned task or its identity.
   Run cheap compatibility preflight before heavy setup and handle recovery as
   references/recovery.md describes; the outer owns these decisions.
2. **Capture.** Prepare an author-only capture scaffold in local staging, sync it to
   the worker and run the installed kit library there. Capture comparable real broken/
   working behavior, fetch outputs and inspect frames locally. Keep reproduction code,
   reference patches and private tooling outside final task/media. See media.md.
3. **Write staged task text.** The outer MUST write both instruction.md and reasoning.md.
   Use the shortest fair request with labeled /media references, then reasoning from
   known facts. Drafts live in staging. Do not stop over contrary human-writing wording.
   Do not ask the inner to assess authorship or expose the outer/AI drafting process.
4. **Open the recorded inner.** Use inner-start/read/send. Supply task-specific brief,
   PR/base, exact text, staged media paths, build request and acceptance criteria. Do
   not send this outer orchestration policy as the inner's task brief. The inner
   saves every technical task-file change and can request remote execution via the bridge.
5. **Build and prove behavior remotely.** Sync current task versions. On clean remote
   execution copies, prove starter F2P fail/P2P pass, reference all-pass/reward 1.0,
   valid alternatives accepted and plausible incomplete repairs rejected. Review
   behavior, verifier scope, managed files and leakage before spending on QC. Close/
   save the inner during long remote checks so other jobs can use the local Helix
   queue; reopen for technical edits and close/save before the final local oracle.
6. **Run five remote QC lanes.** Freeze one snapshot and make independent execution
   copies. Run judgment plus gameability, altsolve, leakage and media ablation in
   parallel using qc-run/worker-wait/qc-collect as qc-loop.md defines. No final edits during a batch. Inspect evidence
   before requesting general repairs; review diffs and replay controls. Rerun only
   affected checks. The initial-plus-five rerun ceiling is shared across the job,
   errors included. Have the inner save justified disputes in task-root disputes.md.
7. **Review and finalize prose.** The outer writes simple final reasoning.md from
   actual changes/results. Save the prose with outer-save-text; the inner saves disputes through recording. Rerun
   affected reasoning judgments; do not launch all probes after prose-only changes.
8. **Close and run the final LOCAL oracle.** Exit/save every author segment, confirm
   traceSaved=true, then use oracle-start/status. The official local oracle must
   verify reward 1.0 on unchanged inputs. If it fails, repair through the inner and
   repeat affected checks plus the final local oracle. Do not bypass writer locks.
9. **Deliver.** Finalize QC on the unchanged task with qc-finalize, including
   evidence-backed disputes when needed. Write validation-summary.md in local staging with actual results,
   hashes, retry/dispute counts, trace state and limitations. The controller uses
   local helix task zip, audits the handoff and saves review evidence before deleting
   the compute worker. On blockers, preserve useful local work and clearly mark the
   recovery handoff incomplete. Upload/evaluation/submission need job authorization.

Task files remain local and authoritative. Local staging/runtime paths come from
context.json; do not reuse historical author-machine paths. Remote execution paths
are /home/daytona/author-staging, /home/daytona/capture-staging and verified
/home/daytona/task-snapshots/<hash>. The last are inputs: copy them before mutation.

Calibration is separate from QC. If hosted evaluation is included, inspect actual
four-run traces, count true versus false failures, and clarify fairly toward the
assigned 1–2/4 target. No prompt guarantees that count. Missing infrastructure,
unscored attempts and absent media are not legitimate task failures.
