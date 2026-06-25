/**
 * @file summary-project-scope.spec.ts
 * @description End-to-end guard, through the running stack, that a video
 * summary and the claims under it are stamped with their persona's project.
 * A summary born with projectId = NULL is invisible to project collaborators
 * and 403s their claim creation; this spec drives the real create routes and
 * asserts the persisted project scope is returned on the API.
 *
 * The cross-user 403 itself is reproduced in the server integration test
 * (test/integration/summary-claim-project-scope.test.ts); E2E worker users are
 * system admins that bypass CASL, so here we verify the stamping that the
 * authorization relies on.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Summary project scope', () => {
  test('stamps the persona project on summaries and claims created through the stack', async ({
    page,
    testUser,
    testVideo,
  }) => {
    const api = page.request

    // Create a project and a persona scoped to it.
    const slug = `scope-${Date.now()}`
    const projectRes = await api.post('/api/projects', {
      data: { name: `Scope ${slug}`, slug },
    })
    expect(projectRes.status()).toBe(201)
    const projectId = (await projectRes.json()).id

    const personaRes = await api.post('/api/personas', {
      data: {
        name: `Project persona ${slug}`,
        role: 'Analyst',
        informationNeed: 'Project-scoped authoring',
        projectId,
      },
    })
    expect(personaRes.status()).toBe(201)
    const personaId = (await personaRes.json()).id

    // Create a summary under the project persona.
    const summaryRes = await api.post('/api/summaries', {
      data: {
        videoId: testVideo.id,
        personaId,
        summary: [{ type: 'text', content: 'A red car drives through the intersection.' }],
      },
    })
    expect(summaryRes.status()).toBe(201)
    const summaryId = (await summaryRes.json()).id

    // The persisted summary carries the persona's project, not NULL.
    const readRes = await api.get(`/api/videos/${testVideo.id}/summaries/${personaId}`)
    expect(readRes.status()).toBe(200)
    expect((await readRes.json()).projectId).toBe(projectId)

    // A claim created under it inherits the same project scope.
    const claimRes = await api.post(`/api/summaries/${summaryId}/claims`, {
      data: { summaryType: 'video', text: 'The car is red.', audio: ['speech'] },
    })
    expect(claimRes.status()).toBe(201)

    const claimsRes = await api.get(`/api/summaries/${summaryId}/claims`)
    expect(claimsRes.status()).toBe(200)
    const claims = await claimsRes.json()
    expect(claims.length).toBeGreaterThan(0)
    expect(claims[0].projectId).toBe(projectId)
  })
})
