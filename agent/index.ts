/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

// Local outer Codex agent. Helix launches the separate recorded inner session.

import { Codex, Thread } from '@openai/codex-sdk'
import type {ThreadOptions} from '@openai/codex-sdk'
import logging from './logging.cjs'

const redactor = logging.createRedactor(logging.secretValues())
const log = logging.createWorkerLog(
  process.env.SWEGEN_REVIEW_LOG_DIR ?? './outputs/outer-logs', redactor,
)
const report = (message: string) => console.log(log.text(message))
const progress = logging.createProgressReporter(report)

async function main(): Promise<void> {
  const prompt = process.env.PROMPT?.trim()
  if (!prompt) {
    console.error('Error: PROMPT not provided')
    process.exit(1)
  }

  const supportedReasoningEfforts = new Set([
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
    'persistent',
  ])
  const reasoningEffort = process.env.CODEX_REASONING_EFFORT ?? 'medium'
  if (!supportedReasoningEfforts.has(reasoningEffort)) {
    console.error(`Error: unsupported CODEX_REASONING_EFFORT: ${reasoningEffort}`)
    process.exit(1)
  }

  log.event({type: 'run.input', prompt})

  // The outer uses the local login; the controller provisions rv probe authentication separately.
  const codex = new Codex()

  // Configure one autonomous task-building turn.
  const options: ThreadOptions = {
    model: process.env.CODEX_MODEL ?? 'gpt-5.6-sol',
    modelReasoningEffort: reasoningEffort as NonNullable<ThreadOptions['modelReasoningEffort']>,
    workingDirectory: process.env.SWEGEN_OUTER_WORKSPACE ?? process.cwd(),
    skipGitRepoCheck: true,
    sandboxMode: 'danger-full-access',
    approvalPolicy: 'never',
    networkAccessEnabled: true,
    webSearchMode: 'live',
  }
  const thread: Thread = codex.startThread(options)

  // Run the Codex agent and stream the output
  const { events } = await thread.runStreamed(prompt)
  let failed = false
  for await (const event of events) {
    const diagnostic = log.event(event)
    progress(event)
    if (event.type === 'item.completed' && event.item.type === 'command_execution' &&
        (event.item.status === 'failed' || (event.item.exit_code != null && event.item.exit_code !== 0))) {
      report(`Command failed (exit ${event.item.exit_code ?? 'unknown'})` + (diagnostic ? `; details: ${diagnostic}` : ''))
    } else if (diagnostic) report(`Tool failed; details: ${diagnostic}`)
    if (event.type === 'turn.completed') {
      report('Outer agent finished.')
    } else if (event.type === 'turn.failed') {
      failed = true
      report(`Codex turn failed: ${event.error.message}`)
    } else if (event.type === 'error') {
      failed = true
      report(`Codex stream error: ${event.message}`)
    }
  }
  log.event({type: 'run.finished', failed})
  if (failed) throw new Error('Codex worker reported a failed turn; inspect retained evidence.')
}

main().catch((err) => {
  log.event({type: 'run.error', message: String(err), stack: err instanceof Error ? err.stack : undefined})
  console.error(log.text(`Agent error: ${String(err)}`))
  process.exitCode = 1
})
