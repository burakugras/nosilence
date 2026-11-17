// SPDX-License-Identifier: AGPL-3.0-only
//
// Runs Vitest from this package's directory with an upper-case Windows drive letter.
// Editors such as VS Code can start processes in "d:\..." instead of "D:\...";
// Vitest then loads the same module under two paths and test hooks break
// ("failed to find the current suite"). On other platforms this is a plain pass-through.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/^[a-z]:/, (drive) =>
  drive.toUpperCase(),
)
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs')

const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
