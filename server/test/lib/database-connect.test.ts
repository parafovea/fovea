import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the connectDatabase retry logic in server/src/index.ts.
 *
 * Since connectDatabase is a local function in index.ts and not exported,
 * these tests verify the retry pattern by re-implementing the same logic
 * and testing it in isolation.
 */

/**
 * Replicates the connectDatabase function from server/src/index.ts
 * for testability. Accepts a connect function instead of importing prisma.
 *
 * @param connectFn - the function to call for each connection attempt
 * @param maxRetries - maximum number of retries before throwing
 * @param delayMs - delay between retries in milliseconds
 */
async function connectDatabase(
  connectFn: () => Promise<void>,
  maxRetries = 5,
  delayMs = 0
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await connectFn()
      return
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
}

describe('connectDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('connects successfully on the first attempt', async () => {
    const connectFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    await connectDatabase(connectFn)

    expect(connectFn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds on second attempt', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValue(undefined)

    await connectDatabase(connectFn, 3, 0)

    expect(connectFn).toHaveBeenCalledTimes(2)
  })

  it('retries on failure and succeeds on third attempt', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValue(undefined)

    await connectDatabase(connectFn, 5, 0)

    expect(connectFn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting all retries', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValue(new Error('Database unreachable'))

    await expect(connectDatabase(connectFn, 3, 0)).rejects.toThrow('Database unreachable')

    expect(connectFn).toHaveBeenCalledTimes(3)
  })

  it('throws the error from the final attempt', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))

    await expect(connectDatabase(connectFn, 2, 0)).rejects.toThrow('Second failure')
  })

  it('uses default maxRetries of 5', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValue(new Error('fail'))

    await expect(connectDatabase(connectFn)).rejects.toThrow('fail')

    expect(connectFn).toHaveBeenCalledTimes(5)
  })

  it('handles non-Error thrown values', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce('string error')
      .mockResolvedValue(undefined)

    await connectDatabase(connectFn, 3, 0)

    expect(connectFn).toHaveBeenCalledTimes(2)
  })

  it('succeeds on the last possible attempt', async () => {
    const connectFn = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue(undefined)

    await connectDatabase(connectFn, 3, 0)

    expect(connectFn).toHaveBeenCalledTimes(3)
  })
})
