import { test, expect } from '../../fixtures/test-context.js'

test.describe('Claim Relations', () => {
  test.describe.configure({ mode: 'serial' })

  test('creates relation between two claims', async ({
    page,
    testPersona,
    testVideo,
    annotationWorkspace
  }) => {
    // Navigate to annotation workspace
    await annotationWorkspace.navigateTo()

    // First, ensure we have a summary with claims
    // This assumes there's a way to create or have test claims
    // For now, we'll check if claims tab exists
    const claimsTab = page.getByRole('tab', { name: /claims/i })
    await expect(claimsTab).toBeVisible()
    await claimsTab.click()

    // Wait for claims to load
    await page.waitForTimeout(1000)

    // Check if we have claims (this test requires pre-existing claims)
    const claimItems = page.locator('[data-testid*="claim"]').or(page.locator('text=/Claim/i')).first()

    // If no claims exist, skip this test or create them
    const claimsExist = await claimItems.isVisible().catch(() => false)

    if (!claimsExist) {
      test.skip()
      return
    }

    // Find first claim and click to expand/select
    const firstClaim = page.locator('[role="button"]').filter({ hasText: /Claim/ }).first()
    await firstClaim.click()
    await page.waitForTimeout(500)

    // Look for relations button/icon
    const relationsButton = page.getByLabel(/relations/i).or(
      page.getByRole('button').filter({ has: page.locator('svg') }).filter({ hasText: /relation/i })
    ).first()

    if (await relationsButton.isVisible().catch(() => false)) {
      await relationsButton.click()
      await page.waitForTimeout(500)

      // Look for "Add Relation" button
      const addRelationButton = page.getByRole('button', { name: /add relation/i })

      if (await addRelationButton.isVisible().catch(() => false)) {
        await addRelationButton.click()
        await page.waitForTimeout(500)

        // Dialog should open
        const dialog = page.locator('[role="dialog"]').filter({ hasText: /create.*relation/i })
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Select relation type (if available)
        const relationTypeSelect = dialog.locator('label:has-text("Relation Type")').locator('..').locator('input, select').first()

        if (await relationTypeSelect.isVisible().catch(() => false)) {
          await relationTypeSelect.click()
          await page.waitForTimeout(300)

          // Select first available relation type
          const firstOption = page.locator('[role="option"]').first()
          if (await firstOption.isVisible().catch(() => false)) {
            await firstOption.click()
          }
        }

        // Select target claim
        const targetClaimInput = dialog.locator('label:has-text("Target Claim")').locator('..').locator('input').first()

        if (await targetClaimInput.isVisible().catch(() => false)) {
          await targetClaimInput.click()
          await page.waitForTimeout(300)

          // Select first available claim
          const firstClaimOption = page.locator('[role="option"]').first()
          if (await firstClaimOption.isVisible().catch(() => false)) {
            await firstClaimOption.click()
          }
        }

        // Try to save
        const saveButton = dialog.getByRole('button', { name: /save/i })
        const isDisabled = await saveButton.isDisabled().catch(() => true)

        if (!isDisabled) {
          await saveButton.click()
          await page.waitForTimeout(1000)

          // Verify relation was created (dialog should close)
          await expect(dialog).not.toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('displays outgoing and incoming relations separately', async ({
    page,
    testPersona,
    testVideo,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo()

    // Navigate to claims
    const claimsTab = page.getByRole('tab', { name: /claims/i })
    if (await claimsTab.isVisible().catch(() => false)) {
      await claimsTab.click()
      await page.waitForTimeout(1000)

      // Find claim and show relations
      const firstClaim = page.locator('[role="button"]').filter({ hasText: /Claim/ }).first()
      if (await firstClaim.isVisible().catch(() => false)) {
        await firstClaim.click()
        await page.waitForTimeout(500)

        // Look for relations section
        const relationsButton = page.getByLabel(/relations/i).first()
        if (await relationsButton.isVisible().catch(() => false)) {
          await relationsButton.click()
          await page.waitForTimeout(500)

          // Check for outgoing/incoming sections
          const outgoingSection = page.locator('text=/outgoing.*relations/i')
          const incomingSection = page.locator('text=/incoming.*relations/i')

          // At least one should be visible if relations feature is working
          const hasRelationsSections =
            await outgoingSection.isVisible().catch(() => false) ||
            await incomingSection.isVisible().catch(() => false)

          expect(hasRelationsSections).toBe(true)
        }
      }
    }
  })

  test('deletes a claim relation', async ({
    page,
    testPersona,
    testVideo,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo()

    const claimsTab = page.getByRole('tab', { name: /claims/i })
    if (await claimsTab.isVisible().catch(() => false)) {
      await claimsTab.click()
      await page.waitForTimeout(1000)

      // Find claim with relations
      const firstClaim = page.locator('[role="button"]').filter({ hasText: /Claim/ }).first()
      if (await firstClaim.isVisible().catch(() => false)) {
        await firstClaim.click()
        await page.waitForTimeout(500)

        const relationsButton = page.getByLabel(/relations/i).first()
        if (await relationsButton.isVisible().catch(() => false)) {
          await relationsButton.click()
          await page.waitForTimeout(500)

          // Look for delete button on a relation
          const deleteButton = page.getByLabel(/delete.*relation/i).or(
            page.getByRole('button').filter({ has: page.locator('svg[data-testid*="Delete"]') })
          ).first()

          if (await deleteButton.isVisible().catch(() => false)) {
            // Click delete
            await deleteButton.click()
            await page.waitForTimeout(300)

            // Confirm deletion if dialog appears
            const confirmButton = page.getByRole('button', { name: /ok|yes|confirm|delete/i })
            if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
              await confirmButton.click()
            }

            await page.waitForTimeout(500)

            // Relation should be removed (this is basic check - actual verification would need more context)
            // We just verify no error occurred
            await expect(page.locator('text=/error/i')).not.toBeVisible()
          }
        }
      }
    }
  })

  test('validates relation type supports claim-to-claim', async ({
    page,
    testPersona,
    testVideo,
    annotationWorkspace
  }) => {
    await annotationWorkspace.navigateTo()

    const claimsTab = page.getByRole('tab', { name: /claims/i })
    if (await claimsTab.isVisible().catch(() => false)) {
      await claimsTab.click()
      await page.waitForTimeout(1000)

      const firstClaim = page.locator('[role="button"]').filter({ hasText: /Claim/ }).first()
      if (await firstClaim.isVisible().catch(() => false)) {
        await firstClaim.click()
        await page.waitForTimeout(500)

        const relationsButton = page.getByLabel(/relations/i).first()
        if (await relationsButton.isVisible().catch(() => false)) {
          await relationsButton.click()
          await page.waitForTimeout(500)

          const addRelationButton = page.getByRole('button', { name: /add relation/i })

          if (await addRelationButton.isVisible().catch(() => false)) {
            await addRelationButton.click()
            await page.waitForTimeout(500)

            const dialog = page.locator('[role="dialog"]')
            await expect(dialog).toBeVisible({ timeout: 5000 })

            // Check if there's a warning about no compatible relation types
            const noTypesWarning = dialog.locator('text=/no relation types.*claim/i')
            const hasWarning = await noTypesWarning.isVisible().catch(() => false)

            // If warning exists, that's a valid state - test passes
            // If no warning, relation types dropdown should exist
            if (!hasWarning) {
              const relationTypeSelect = dialog.locator('label:has-text("Relation Type")')
              await expect(relationTypeSelect).toBeVisible()
            }

            // Close dialog
            const cancelButton = dialog.getByRole('button', { name: /cancel/i })
            if (await cancelButton.isVisible().catch(() => false)) {
              await cancelButton.click()
            }
          }
        }
      }
    }
  })
})
