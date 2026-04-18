import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export interface BinaryInfo {
  found: boolean
  binaryPath?: string
  version?: string
}

/**
 * Discover the OpenCode binary.
 * Priority: cliOverride > $OPENCODE_BIN > which opencode
 */
export function discoverOpenCodeBinary(cliOverride?: string): BinaryInfo {
  // 1. CLI override
  if (cliOverride) {
    return probeBinary(cliOverride)
  }

  // 2. Environment variable
  const envBin = process.env.OPENCODE_BIN
  if (envBin) {
    return probeBinary(envBin)
  }

  // 3. which opencode
  try {
    const whichResult = execSync('which opencode', { encoding: 'utf-8', timeout: 5000 }).trim()
    if (whichResult) {
      return probeBinary(whichResult)
    }
  } catch {
    // not found
  }

  return { found: false }
}

function probeBinary(binaryPath: string): BinaryInfo {
  if (!existsSync(binaryPath)) {
    return { found: false, binaryPath }
  }

  let version: string | undefined
  for (const flag of ['version', '--version']) {
    try {
      const out = execSync(`${binaryPath} ${flag}`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      if (out) {
        // Extract version-like string
        const match = out.match(/\d+\.\d+\.\d+/)
        version = match ? match[0] : out.split('\n')[0]
        break
      }
    } catch {
      // try next flag
    }
  }

  return { found: true, binaryPath, version }
}
