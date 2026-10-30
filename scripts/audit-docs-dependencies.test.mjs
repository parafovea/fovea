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
    accepted: [], blocked: [],
  })
})

test('allows only the documented low-severity advisory, including propagated findings', () => {
  assert.deepEqual(classifyAdvisories(report(exception)), { accepted: [exception], blocked: [] })
})

test('blocks other low-severity advisories and an increased severity for the exception', () => {
  for (const advisory of [
    { ...exception, url: 'https://github.com/advisories/new-advisory' },
    { ...exception, severity: 'high' },
    { ...exception, name: 'another-package' },
  ]) {
    assert.deepEqual(classifyAdvisories(report(advisory)), { accepted: [], blocked: [advisory] })
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
