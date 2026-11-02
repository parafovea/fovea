#!/usr/bin/env node
/** Classify docs dependency advisories against their locked implementations. */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const deepmergeAdvisory = 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4'
const minimatchAmplificationAdvisory = 'https://github.com/advisories/GHSA-g3hv-75wg-m249'

/** Resolve npm's propagated findings to distinct advisories and reject unknown report shapes. */
export function classifyAdvisories(report, lockfile = {}) {
  if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities) {
    throw new Error('npm did not return a complete version-2 audit report')
  }
  const advisories = new Map()
  for (const finding of Object.values(report.vulnerabilities)) {
    if (!Array.isArray(finding.via) || finding.via.length === 0) {
      throw new Error('npm returned a finding without advisory evidence')
    }
    for (const advisory of finding.via) {
      if (typeof advisory === 'string') {
        if (!Object.hasOwn(report.vulnerabilities, advisory)) {
          throw new Error(`npm returned an unresolved advisory dependency: ${advisory}`)
        }
      } else if (advisory && advisory.name && advisory.url && advisory.severity) {
        advisories.set(`${advisory.name}:${advisory.url}`, advisory)
      } else {
        throw new Error('npm returned an unsupported advisory record')
      }
    }
  }
  if (Object.keys(report.vulnerabilities).length > 0 && advisories.size === 0) {
    throw new Error('npm reported vulnerable packages without any underlying advisory')
  }
  const accepted = []
  const notAffected = []
  const blocked = []
  for (const advisory of advisories.values()) {
    // Version 3.1.5 has no optimizationLevel or firstPhasePreProcess implementation.
    // Require every reported installation to be that exact version; never exempt
    // newer implementations or findings whose installed version is unknown.
    const minimatchNodes = report.vulnerabilities.minimatch?.nodes
    if (advisory.name === 'minimatch'
      && advisory.url === minimatchAmplificationAdvisory
      && advisory.severity === 'moderate'
      && Array.isArray(minimatchNodes)
      && minimatchNodes.length > 0
      && minimatchNodes.every(node => lockfile.packages?.[node]?.version === '3.1.5')) {
      notAffected.push(advisory)
      continue
    }
    const destination = advisory.name === 'deepmerge'
      && advisory.url === deepmergeAdvisory
      && advisory.severity === 'low' ? accepted : blocked
    destination.push(advisory)
  }
  return { accepted, notAffected, blocked }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = spawnSync('npm', ['--prefix', 'docs', 'audit', '--json'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  try {
    if (result.error || result.signal || ![0, 1].includes(result.status)) {
      throw result.error ?? new Error(`npm audit failed: ${result.stderr}`)
    }
    const lockfile = JSON.parse(readFileSync(new URL('../docs/package-lock.json', import.meta.url), 'utf8'))
    const { accepted, notAffected, blocked } = classifyAdvisories(JSON.parse(result.stdout), lockfile)
    for (const advisory of accepted) {
      console.log(`Unpatched docs-build exception: ${advisory.name} (${advisory.url})`)
    }
    for (const advisory of blocked) {
      console.error(`${advisory.severity}: ${advisory.name} (${advisory.url})`)
    }
    for (const advisory of notAffected) {
      console.log(`Not affected: minimatch 3.1.5 lacks the reported optimization preprocessing (${advisory.url})`)
    }
    console.log(`Documentation audit: ${blocked.length} blocking advisories, ${accepted.length} documented exception(s), ${notAffected.length} non-applicable advisory(s)`)
    process.exitCode = blocked.length ? 1 : 0
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
