import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyAdvisories } from './audit-docs-dependencies.mjs'

const exception = {
  name: 'deepmerge',
  url: 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4',
  severity: 'low',
}
const report = (advisory) => ({
  auditReportVersion: 2,
  vulnerabilities: {
    deepmerge: { via: [advisory] },
    parent: { via: ['deepmerge'] },
  },
})

test('accepts a clean report', () => {
  assert.deepEqual(classifyAdvisories({ auditReportVersion: 2, vulnerabilities: {} }), {
    accepted: [], notAffected: [], blocked: [],
  })
})

test('allows only the documented low-severity advisory, including propagated findings', () => {
  assert.deepEqual(classifyAdvisories(report(exception)), { accepted: [exception], notAffected: [], blocked: [] })
})

test('blocks other low-severity advisories and an increased severity for the exception', () => {
  for (const advisory of [
    { ...exception, url: 'https://github.com/advisories/new-advisory' },
    { ...exception, severity: 'high' },
    { ...exception, name: 'another-package' },
  ]) {
    assert.deepEqual(classifyAdvisories(report(advisory)), { accepted: [], notAffected: [], blocked: [advisory] })
  }
})

const minimatchAdvisory = {
  name: 'minimatch',
  url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
  severity: 'moderate',
}
const minimatchReport = (nodes) => ({
  auditReportVersion: 2,
  vulnerabilities: { minimatch: { via: [minimatchAdvisory], nodes } },
})

test('classifies only the locked minimatch 3.1.5 implementation as not affected', () => {
  const lockfile = { packages: { 'node_modules/minimatch': { version: '3.1.5' } } }
  assert.deepEqual(classifyAdvisories(minimatchReport(['node_modules/minimatch']), lockfile), {
    accepted: [], notAffected: [minimatchAdvisory], blocked: [],
  })
})

test('blocks amplification findings with missing, mixed, or changed installed versions', () => {
  for (const [nodes, packages] of [
    [undefined, {}],
    [[], {}],
    [['node_modules/minimatch'], {}],
    [['node_modules/minimatch'], { 'node_modules/minimatch': { version: '10.2.6' } }],
    [['node_modules/minimatch'], { 'node_modules/minimatch': { version: '3.1.6' } }],
    [['node_modules/minimatch', 'node_modules/glob/node_modules/minimatch'], {
      'node_modules/minimatch': { version: '3.1.5' },
      'node_modules/glob/node_modules/minimatch': { version: '9.0.9' },
    }],
  ]) {
    assert.deepEqual(classifyAdvisories(minimatchReport(nodes), { packages }), {
      accepted: [], notAffected: [], blocked: [minimatchAdvisory],
    })
  }
})

test('does not exempt other advisories or severity changes for minimatch 3.1.5', () => {
  const lockfile = { packages: { 'node_modules/minimatch': { version: '3.1.5' } } }
  for (const advisory of [
    { ...minimatchAdvisory, url: 'https://github.com/advisories/another-advisory' },
    { ...minimatchAdvisory, severity: 'high' },
  ]) {
    const finding = minimatchReport(['node_modules/minimatch'])
    finding.vulnerabilities.minimatch.via = [advisory]
    assert.deepEqual(classifyAdvisories(finding, lockfile), {
      accepted: [], notAffected: [], blocked: [advisory],
    })
  }
})

test('fails closed for scanner errors and incomplete dependency evidence', () => {
  for (const invalid of [
    { error: { message: 'Registry unavailable' } },
    { auditReportVersion: 2, vulnerabilities: { parent: { via: ['missing'] } } },
    { auditReportVersion: 2, vulnerabilities: { parent: { via: [] } } },
    { auditReportVersion: 2, vulnerabilities: { parent: { via: ['parent'] } } },
  ]) {
    assert.throws(() => classifyAdvisories(invalid))
  }
})
