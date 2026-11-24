/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/** Quote one literal argument for the worker's POSIX shell. */
export function quoteShell(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}
