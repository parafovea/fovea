import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config.js'

afterEach(() => vi.unstubAllEnvs())

describe('forwarding header trust', () => {
  it.each([undefined, '', 'false', '0', '1', '2', '-1'])('ignores forged headers with TRUST_PROXY=%s', async (value) => {
    vi.stubEnv('TRUST_PROXY', value)
    const app = Fastify({ trustProxy: config.server.trustProxy })
    app.get('/', (request) => ({ ip: request.ip, host: request.host, protocol: request.protocol }))
    try {
      const response = await app.inject({
        url: '/',
        remoteAddress: '198.51.100.4',
        headers: {
          host: 'api.example.test',
          'x-forwarded-for': '203.0.113.9, 192.0.2.10',
          'x-forwarded-host': 'forged.example.test',
          'x-forwarded-proto': 'https',
        },
      })
      expect(response.json()).toEqual({ ip: '198.51.100.4', host: 'api.example.test', protocol: 'http' })
    } finally {
      await app.close()
    }
  })

  it.each([
    ['192.0.2.10', '203.0.113.9', 'proxy.example.test', 'https'],
    ['198.51.100.4', '198.51.100.4', 'api.example.test', 'http'],
  ])('accepts headers only from an explicitly trusted peer: %s', async (peer, ip, host, protocol) => {
    vi.stubEnv('TRUST_PROXY', '192.0.2.0/24, 127.0.0.1')
    const app = Fastify({ trustProxy: config.server.trustProxy })
    app.get('/', (request) => ({ ip: request.ip, host: request.host, protocol: request.protocol }))
    try {
      const response = await app.inject({
        url: '/',
        remoteAddress: peer,
        headers: {
          host: 'api.example.test',
          'x-forwarded-for': '203.0.113.9',
          'x-forwarded-host': 'proxy.example.test',
          'x-forwarded-proto': 'https',
        },
      })
      expect(response.json()).toEqual({ ip, host, protocol })
    } finally {
      await app.close()
    }
  })
})
