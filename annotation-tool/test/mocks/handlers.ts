import { http, HttpResponse } from 'msw'

/**
 * MSW 2.0 request handlers for API mocking.
 * Centralized mock handlers used across all tests.
 */
export const handlers = [
  http.get('http://localhost:3001/api/personas', () => {
    return HttpResponse.json([
      {
        id: 'test-persona-id',
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Test information need',
        wikidataId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ])
  }),

  http.post('http://localhost:3001/api/personas', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: '2',
      ...body
    }, { status: 201 })
  }),

  http.get('http://localhost:3001/api/videos', () => {
    return HttpResponse.json([
      { id: '1', filename: 'test.mp4', path: '/data/videos/test.mp4' }
    ])
  }),

  http.get('http://localhost:3001/api/videos/:videoId', ({ params }) => {
    const { videoId } = params
    return HttpResponse.json({
      id: videoId,
      filename: 'test.mp4',
      path: `/data/videos/${videoId}.mp4`,
      title: 'Test Video',
      description: 'A test video',
      uploader: 'Test User',
      uploaderId: 'user-1',
      uploaderUrl: 'https://example.com/user-1',
      fps: 30,
      duration: 100,
      width: 1920,
      height: 1080,
      uploadDate: '2025-01-01T00:00:00Z',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    })
  }),

  // Video summaries endpoints
  http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
    return HttpResponse.json([
      {
        id: 'summary-1',
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Baseball scout analyzing pitcher mechanics during spring training game',
        visualAnalysis: 'Pitcher demonstrates consistent three-quarter arm slot with late breaking curveball',
        audioTranscript: null,
        keyFrames: [0, 150, 300],
        confidence: 0.92,
        createdAt: '2025-10-01T10:00:00Z',
        updatedAt: '2025-10-01T10:00:00Z',
      },
    ])
  }),

  http.get('http://localhost:3001/api/videos/:videoId/summaries/:personaId', ({ params }) => {
    const { personaId } = params
    if (personaId === 'persona-missing') {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({
      id: 'summary-1',
      videoId: 'video-1',
      personaId: personaId as string,
      summary: 'Wildlife researcher documenting whale pod behavior',
      visualAnalysis: 'Three adult humpback whales surface in coordinated breathing pattern',
      audioTranscript: null,
      keyFrames: [0, 180, 360],
      confidence: 0.88,
      createdAt: '2025-10-01T10:00:00Z',
      updatedAt: '2025-10-01T10:00:00Z',
    })
  }),

  http.post('http://localhost:3001/api/videos/summaries/generate', async ({ request }) => {
    const body = await request.json() as { videoId: string; personaId: string }
    return HttpResponse.json(
      {
        jobId: 'job-123',
        videoId: body.videoId,
        personaId: body.personaId,
      },
      { status: 202 }
    )
  }),

  http.get('http://localhost:3001/api/jobs/:jobId', ({ params }) => {
    const { jobId } = params
    if (jobId === 'job-active') {
      return HttpResponse.json({
        id: 'job-active',
        state: 'active',
        progress: 50,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
      })
    }
    if (jobId === 'job-completed') {
      return HttpResponse.json({
        id: 'job-completed',
        state: 'completed',
        progress: 100,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
        returnvalue: {
          id: 'summary-1',
          videoId: 'video-1',
          personaId: 'persona-1',
          summary: 'Retail analyst studying customer flow patterns',
          visualAnalysis: 'Peak traffic occurs near product displays with promotional signage',
          audioTranscript: null,
          keyFrames: [0, 200, 400],
          confidence: 0.85,
          createdAt: '2025-10-01T10:00:00Z',
          updatedAt: '2025-10-01T10:00:00Z',
        },
        finishedOn: Date.now(),
      })
    }
    if (jobId === 'job-failed') {
      return HttpResponse.json({
        id: 'job-failed',
        state: 'failed',
        progress: 70,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
        failedReason: 'Video file not found',
      })
    }
    return HttpResponse.json({
      id: jobId as string,
      state: 'waiting',
      progress: 0,
      data: {
        videoId: 'video-1',
        personaId: 'persona-1',
      },
    })
  }),

  http.post('http://localhost:3001/api/summaries', async ({ request }) => {
    const body = await request.json() as {
      videoId: string
      personaId: string
      summary: string
    }
    return HttpResponse.json(
      {
        id: 'summary-new',
        ...body,
        createdAt: '2025-10-01T10:00:00Z',
        updatedAt: '2025-10-01T10:00:00Z',
      },
      { status: 201 }
    )
  }),

  http.delete('http://localhost:3001/api/videos/:videoId/summaries/:personaId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Ontology augmentation endpoint
  http.post('http://localhost:3001/api/ontology/augment', async ({ request }) => {
    const body = await request.json() as {
      personaId: string
      domain: string
      targetCategory: string
    }
    return HttpResponse.json({
      id: 'augment-1',
      personaId: body.personaId,
      targetCategory: body.targetCategory,
      suggestions: [
        {
          name: 'Home Run',
          description: 'A hit that allows the batter to circle all bases and score',
          parent: 'Scoring Play',
          confidence: 0.95,
          examples: ['Grand slam', 'Solo homer', 'Walk-off home run'],
        },
        {
          name: 'Strike Out',
          description: 'When a batter accumulates three strikes during an at-bat',
          parent: null,
          confidence: 0.92,
          examples: ['Swinging strikeout', 'Called strikeout', 'Caught looking'],
        },
      ],
      reasoning: 'Based on baseball domain analysis and existing event types',
    })
  }),

  // Object detection endpoint
  http.post('http://localhost:3001/api/videos/:videoId/detect', async ({ request }) => {
    const body = await request.json() as { manualQuery?: string }
    return HttpResponse.json({
      id: 'detection-1',
      videoId: 'video-1',
      query: body.manualQuery || 'baseball, bat, glove',
      frames: [
        {
          frameNumber: 0,
          timestamp: 0.0,
          detections: [
            {
              label: 'baseball',
              boundingBox: { x: 0.45, y: 0.3, width: 0.05, height: 0.05 },
              confidence: 0.94,
              trackId: 'track-1',
            },
            {
              label: 'bat',
              boundingBox: { x: 0.2, y: 0.4, width: 0.3, height: 0.1 },
              confidence: 0.89,
              trackId: 'track-2',
            },
          ],
        },
        {
          frameNumber: 30,
          timestamp: 1.0,
          detections: [
            {
              label: 'baseball',
              boundingBox: { x: 0.6, y: 0.25, width: 0.05, height: 0.05 },
              confidence: 0.91,
              trackId: 'track-1',
            },
          ],
        },
      ],
      totalDetections: 3,
      processingTime: 2.34,
    })
  }),

  // Model configuration endpoint
  http.get('http://localhost:3001/api/models/config', () => {
    return HttpResponse.json({
      models: {
        vlm: {
          selected: 'llava',
          options: {
            llava: {
              modelId: 'llava-hf/llava-1.5-7b-hf',
              framework: 'transformers',
              vramGb: 14.0,
              speed: 'medium',
              description: 'Vision-language model for image understanding',
              fps: 2.5,
            },
          },
        },
        detection: {
          selected: 'owlv2',
          options: {
            owlv2: {
              modelId: 'google/owlv2-base-patch16-ensemble',
              framework: 'transformers',
              vramGb: 4.0,
              speed: 'fast',
              description: 'Open-vocabulary object detection',
              fps: 15.0,
            },
          },
        },
      },
      inference: {
        maxMemoryPerModel: 24.0,
        offloadThreshold: 0.8,
        warmupOnStartup: true,
      },
      cudaAvailable: true,
    })
  }),

  // Model selection endpoint
  http.post('http://localhost:3001/api/models/select', async ({ request }) => {
    const url = new URL(request.url)
    const taskType = url.searchParams.get('taskType')
    const modelName = url.searchParams.get('modelName')
    return HttpResponse.json({
      status: 'success',
      taskType: taskType,
      selectedModel: modelName,
    })
  }),

  // Memory validation endpoint
  http.post('http://localhost:3001/api/models/validate', () => {
    return HttpResponse.json({
      valid: true,
      totalVramGb: 24.0,
      totalRequiredGb: 18.0,
      threshold: 0.8,
      maxAllowedGb: 19.2,
      modelRequirements: {
        vlm: {
          modelId: 'llava-hf/llava-1.5-7b-hf',
          vramGb: 14.0,
        },
        detection: {
          modelId: 'google/owlv2-base-patch16-ensemble',
          vramGb: 4.0,
        },
      },
    })
  }),

  // Model status endpoint
  http.get('http://localhost:3001/api/models/status', () => {
    return HttpResponse.json({
      loadedModels: [
        {
          modelId: 'llava-hf/llava-1.5-7b-hf',
          taskType: 'vlm',
          modelName: 'llava',
          framework: 'transformers',
          quantization: null,
          health: 'loaded' as const,
          vramAllocatedGb: 14.0,
          vramUsedGb: 13.8,
          warmUpComplete: true,
          lastUsed: '2025-10-03T10:00:00Z',
          loadTimeMs: 3456,
          performanceMetrics: {
            totalRequests: 150,
            averageLatencyMs: 234.5,
            requestsPerSecond: 0.8,
            averageFps: 2.5,
          },
          errorMessage: null,
        },
      ],
      totalVramAllocatedGb: 14.0,
      totalVramAvailableGb: 24.0,
      timestamp: '2025-10-03T10:00:00Z',
      cudaAvailable: true,
    })
  }),

  // Auth endpoints
  http.get('http://localhost:3001/api/config', () => {
    return HttpResponse.json({
      mode: 'multi-user',
      allowRegistration: true,
      wikidata: {
        mode: 'online',
        url: 'https://www.wikidata.org/w/api.php',
        allowExternalLinks: true,
      },
      externalLinks: {
        wikidata: true,
        videoSources: true,
      },
    })
  }),

  http.post('http://localhost:3001/api/auth/login', async ({ request }) => {
    const body = await request.json() as { username: string; password: string }
    if (body.username === 'admin' && body.password === 'admin123') {
      return HttpResponse.json({
        user: {
          id: 'user-1',
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          isAdmin: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      })
    }
    if (body.username === 'testuser' && body.password === 'test123') {
      return HttpResponse.json({
        user: {
          id: 'user-2',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          isAdmin: false,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      })
    }
    return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })
  }),

  http.post('http://localhost:3001/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('http://localhost:3001/api/auth/me', () => {
    return HttpResponse.json({
      user: {
        id: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isAdmin: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    })
  }),

  http.post('http://localhost:3001/api/auth/register', async ({ request }) => {
    const body = await request.json() as {
      username: string
      password: string
      displayName: string
      email?: string
    }
    return HttpResponse.json({
      user: {
        id: 'user-new',
        username: body.username,
        displayName: body.displayName,
        email: body.email,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }, { status: 201 })
  }),

  // Admin user management endpoints (with and without localhost for different call patterns)
  http.get('http://localhost:3001/api/admin/users', () => {
    return HttpResponse.json([
      {
        id: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isAdmin: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        personaCount: 3,
        sessionCount: 1,
      },
      {
        id: 'user-2',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        isAdmin: false,
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
        personaCount: 1,
        sessionCount: 0,
      },
    ])
  }),

  http.get('/api/admin/users', () => {
    return HttpResponse.json([
      {
        id: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isAdmin: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        personaCount: 3,
        sessionCount: 1,
      },
      {
        id: 'user-2',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        isAdmin: false,
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
        personaCount: 1,
        sessionCount: 0,
      },
    ])
  }),

  http.get('http://localhost:3001/api/admin/users/:userId', ({ params }) => {
    const { userId } = params
    if (userId === 'user-1') {
      return HttpResponse.json({
        id: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isAdmin: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        personaCount: 3,
        sessionCount: 1,
      })
    }
    return HttpResponse.json({ message: 'User not found' }, { status: 404 })
  }),

  http.post('http://localhost:3001/api/admin/users', async ({ request }) => {
    const body = await request.json() as {
      username: string
      password: string
      displayName: string
      email?: string
      isAdmin: boolean
    }
    return HttpResponse.json({
      id: 'user-new',
      username: body.username,
      displayName: body.displayName,
      email: body.email,
      isAdmin: body.isAdmin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('http://localhost:3001/api/admin/users/:userId', async ({ request }) => {
    const body = await request.json() as {
      displayName?: string
      email?: string
      isAdmin?: boolean
      password?: string
    }
    return HttpResponse.json({
      id: 'user-1',
      username: 'admin',
      displayName: body.displayName || 'Admin User',
      email: body.email || 'admin@example.com',
      isAdmin: body.isAdmin !== undefined ? body.isAdmin : true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    })
  }),

  http.delete('http://localhost:3001/api/admin/users/:userId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Session management endpoints
  http.get('http://localhost:3001/api/admin/sessions', () => {
    return HttpResponse.json([
      {
        id: 'session-1',
        userId: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: '2025-10-10T10:00:00Z',
        expiresAt: '2025-10-17T10:00:00Z',
      },
      {
        id: 'session-2',
        userId: 'user-2',
        username: 'testuser',
        displayName: 'Test User',
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: '2025-10-10T12:00:00Z',
        expiresAt: '2025-10-17T12:00:00Z',
      },
    ])
  }),

  http.delete('http://localhost:3001/api/admin/sessions/:sessionId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // API key management endpoints
  http.get('http://localhost:3001/api/api-keys', () => {
    return HttpResponse.json([
      {
        id: 'key-1',
        userId: 'user-1',
        provider: 'anthropic',
        keyName: 'My Anthropic Key',
        keyMask: 'sk-ant-...abc123',
        isActive: true,
        lastUsedAt: '2025-10-10T10:00:00Z',
        createdAt: '2025-10-01T00:00:00Z',
        updatedAt: '2025-10-01T00:00:00Z',
      },
      {
        id: 'key-2',
        userId: 'user-1',
        provider: 'openai',
        keyName: 'OpenAI Development',
        keyMask: 'sk-...xyz789',
        isActive: false,
        createdAt: '2025-10-05T00:00:00Z',
        updatedAt: '2025-10-05T00:00:00Z',
      },
    ])
  }),

  http.get('http://localhost:3001/api/admin/api-keys', () => {
    return HttpResponse.json([
      {
        id: 'admin-key-1',
        userId: null,
        provider: 'google',
        keyName: 'Shared Google Key',
        keyMask: 'AIza...def456',
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ])
  }),

  http.post('http://localhost:3001/api/api-keys', async ({ request }) => {
    const body = await request.json() as {
      provider: string
      keyName: string
      apiKey: string
    }
    return HttpResponse.json({
      id: 'key-new',
      userId: 'user-1',
      provider: body.provider,
      keyName: body.keyName,
      keyMask: body.apiKey.substring(0, 7) + '...' + body.apiKey.slice(-6),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('http://localhost:3001/api/api-keys/:keyId', async ({ request }) => {
    const body = await request.json() as {
      keyName?: string
      apiKey?: string
      isActive?: boolean
    }
    return HttpResponse.json({
      id: 'key-1',
      userId: 'user-1',
      provider: 'anthropic',
      keyName: body.keyName || 'My Anthropic Key',
      keyMask: 'sk-ant-...abc123',
      isActive: body.isActive !== undefined ? body.isActive : true,
      createdAt: '2025-10-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    })
  }),

  http.delete('http://localhost:3001/api/api-keys/:keyId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // User profile endpoints
  http.put('http://localhost:3001/api/user/profile', async ({ request }) => {
    const body = await request.json() as {
      displayName?: string
      email?: string
    }
    return HttpResponse.json({
      user: {
        id: 'user-1',
        username: 'testuser',
        displayName: body.displayName || 'Test User',
        email: body.email || 'test@example.com',
        isAdmin: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
      },
    })
  }),

  http.post('http://localhost:3001/api/user/password', async ({ request }) => {
    const body = await request.json() as {
      currentPassword: string
      newPassword: string
    }
    // Simple validation - accept if currentPassword matches
    if (body.currentPassword === 'test123') {
      return new HttpResponse(null, { status: 204 })
    }
    return HttpResponse.json(
      { message: 'Current password is incorrect' },
      { status: 400 }
    )
  }),

  // Duplicate handlers for relative URL requests (without baseURL)
  // These match requests from hooks that use the ApiClient singleton with relative URLs
  // Required for SSH port forwarding compatibility where all requests go through Vite proxy

  http.get('/api/annotations/:videoId', () => {
    return HttpResponse.json([])
  }),

  // Annotation mutations - with wildcard for both absolute and relative URLs
  http.post('*/api/annotations', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: 'annotation-new',
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('*/api/annotations/:annotationId', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: params.annotationId,
      ...body,
      updatedAt: new Date().toISOString(),
    })
  }),

  http.delete('*/api/annotations/:videoId/:annotationId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('*/api/annotations', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>[]
    return HttpResponse.json(body)
  }),

  // World state endpoint (for useWorld hook)
  http.get('/api/world', () => {
    return HttpResponse.json({
      entities: [],
      events: [],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: [],
    })
  }),

  // World mutations
  http.put('/api/world', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json(body)
  }),

  // Claims endpoint (for useClaims hook)
  http.get('/api/summaries/:summaryId/claims', () => {
    return HttpResponse.json([])
  }),

  // Claim mutations - with wildcard for both absolute and relative URLs
  http.post('*/api/summaries/:summaryId/claims', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: 'claim-new',
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('*/api/summaries/:summaryId/claims/:claimId', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: params.claimId,
      ...body,
      updatedAt: new Date().toISOString(),
    })
  }),

  http.delete('*/api/summaries/:summaryId/claims/:claimId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Claim relation mutations - with wildcard
  http.post('*/api/summaries/:summaryId/claims/:sourceClaimId/relations', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: 'relation-new',
      ...body,
      createdAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.delete('*/api/summaries/:summaryId/claims/relations/:relationId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Persona ontology endpoint (for usePersonaOntology hook)
  http.get('/api/personas/:personaId/ontology', () => {
    return HttpResponse.json({
      entities: [],
      roles: [],
      events: [],
      relationTypes: [],
      relations: [],
    })
  }),

  // Persona ontology mutations - with wildcard
  http.put('*/api/personas/:personaId/ontology', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: body,
    })
  }),

  http.post('/api/personas/:personaId/ontology/entities', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [{ id: 'entity-new', ...body }],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.put('/api/personas/:personaId/ontology/entities/:entityId', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [{ id: params.entityId, ...body }],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.delete('/api/personas/:personaId/ontology/entities/:entityId', ({ params }) => {
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.post('/api/personas/:personaId/ontology/roles', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [{ id: 'role-new', ...body }],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.put('/api/personas/:personaId/ontology/roles/:roleId', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [{ id: params.roleId, ...body }],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.delete('/api/personas/:personaId/ontology/roles/:roleId', ({ params }) => {
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.post('/api/personas/:personaId/ontology/events', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [{ id: 'event-new', ...body }],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.put('/api/personas/:personaId/ontology/events/:eventId', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [{ id: params.eventId, ...body }],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.delete('/api/personas/:personaId/ontology/events/:eventId', ({ params }) => {
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  http.post('/api/personas/:personaId/ontology/relation-types', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [{ id: 'relation-type-new', ...body }],
        relations: [],
      },
    })
  }),

  http.put('/api/personas/:personaId/ontology/relation-types/:relationTypeId', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [{ id: params.relationTypeId, ...body }],
        relations: [],
      },
    })
  }),

  http.delete('/api/personas/:personaId/ontology/relation-types/:relationTypeId', ({ params }) => {
    return HttpResponse.json({
      personaId: params.personaId,
      ontology: {
        entities: [],
        roles: [],
        events: [],
        relationTypes: [],
        relations: [],
      },
    })
  }),

  // Personas endpoint (for usePersonas hook) - wildcard origin
  http.get('*/api/personas', () => {
    return HttpResponse.json([
      {
        id: 'test-persona-id',
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Test information need',
        wikidataId: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ])
  }),

  // Persona creation - wildcard origin
  http.post('*/api/personas', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: '2',
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  // Persona ontology update - wildcard origin
  http.put('*/api/personas/:personaId/ontology', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      personaId: params.personaId,
      ...body,
    })
  }),

  // Persona deletion preview
  http.get('*/api/personas/:personaId/deletion-preview', () => {
    return HttpResponse.json({
      typeCount: 3,
      annotationCount: 5,
      summaryCount: 2,
      worldAssignmentCount: 1,
    })
  }),

  // Persona deletion
  http.delete('*/api/personas/:personaId', () => {
    return HttpResponse.json({ message: 'Persona deleted successfully' })
  }),

  // Video summaries endpoints (relative URLs)
  http.get('/api/videos/:videoId/summaries', () => {
    return HttpResponse.json([
      {
        id: 'summary-1',
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Baseball scout analyzing pitcher mechanics during spring training game',
        visualAnalysis: 'Pitcher demonstrates consistent three-quarter arm slot with late breaking curveball',
        audioTranscript: null,
        keyFrames: [0, 150, 300],
        confidence: 0.92,
        createdAt: '2025-10-01T10:00:00Z',
        updatedAt: '2025-10-01T10:00:00Z',
      },
    ])
  }),

  http.get('/api/videos/:videoId/summaries/:personaId', ({ params }) => {
    const { personaId } = params
    if (personaId === 'persona-missing') {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({
      id: 'summary-1',
      videoId: 'video-1',
      personaId: personaId as string,
      summary: 'Wildlife researcher documenting whale pod behavior',
      visualAnalysis: 'Three adult humpback whales surface in coordinated breathing pattern',
      audioTranscript: null,
      keyFrames: [0, 180, 360],
      confidence: 0.88,
      createdAt: '2025-10-01T10:00:00Z',
      updatedAt: '2025-10-01T10:00:00Z',
    })
  }),

  http.post('/api/videos/summaries/generate', async ({ request }) => {
    const body = await request.json() as { videoId: string; personaId: string }
    return HttpResponse.json(
      {
        jobId: 'job-123',
        videoId: body.videoId,
        personaId: body.personaId,
      },
      { status: 202 }
    )
  }),

  http.delete('/api/videos/:videoId/summaries/:personaId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/summaries', async ({ request }) => {
    const body = await request.json() as {
      videoId: string
      personaId: string
      summary: string
    }
    return HttpResponse.json(
      {
        id: 'summary-new',
        ...body,
        createdAt: '2025-10-01T10:00:00Z',
        updatedAt: '2025-10-01T10:00:00Z',
      },
      { status: 201 }
    )
  }),

  http.get('/api/jobs/:jobId', ({ params }) => {
    const { jobId } = params
    if (jobId === 'job-active') {
      return HttpResponse.json({
        id: 'job-active',
        state: 'active',
        progress: 50,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
      })
    }
    if (jobId === 'job-completed') {
      return HttpResponse.json({
        id: 'job-completed',
        state: 'completed',
        progress: 100,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
        returnvalue: {
          id: 'summary-1',
          videoId: 'video-1',
          personaId: 'persona-1',
          summary: 'Retail analyst studying customer flow patterns',
          visualAnalysis: 'Peak traffic occurs near product displays with promotional signage',
          audioTranscript: null,
          keyFrames: [0, 200, 400],
          confidence: 0.85,
          createdAt: '2025-10-01T10:00:00Z',
          updatedAt: '2025-10-01T10:00:00Z',
        },
        finishedOn: Date.now(),
      })
    }
    if (jobId === 'job-failed') {
      return HttpResponse.json({
        id: 'job-failed',
        state: 'failed',
        progress: 70,
        data: {
          videoId: 'video-1',
          personaId: 'persona-1',
        },
        failedReason: 'Video file not found',
      })
    }
    return HttpResponse.json({
      id: jobId as string,
      state: 'waiting',
      progress: 0,
      data: {
        videoId: 'video-1',
        personaId: 'persona-1',
      },
    })
  }),

  // Model endpoints (relative URLs)
  http.get('/api/models/config', () => {
    return HttpResponse.json({
      models: {
        vlm: {
          selected: 'llava',
          options: {
            llava: {
              modelId: 'llava-hf/llava-1.5-7b-hf',
              framework: 'transformers',
              vramGb: 14.0,
              speed: 'medium',
              description: 'Vision-language model for image understanding',
              fps: 2.5,
            },
          },
        },
        detection: {
          selected: 'owlv2',
          options: {
            owlv2: {
              modelId: 'google/owlv2-base-patch16-ensemble',
              framework: 'transformers',
              vramGb: 4.0,
              speed: 'fast',
              description: 'Open-vocabulary object detection',
              fps: 15.0,
            },
          },
        },
      },
      inference: {
        maxMemoryPerModel: 24.0,
        offloadThreshold: 0.8,
        warmupOnStartup: true,
      },
      cudaAvailable: true,
    })
  }),

  http.post('/api/models/select', async ({ request }) => {
    const url = new URL(request.url)
    const taskType = url.searchParams.get('taskType')
    const modelName = url.searchParams.get('modelName')
    return HttpResponse.json({
      status: 'success',
      taskType: taskType,
      selectedModel: modelName,
    })
  }),

  http.post('/api/models/validate', () => {
    return HttpResponse.json({
      valid: true,
      totalVramGb: 24.0,
      totalRequiredGb: 18.0,
      threshold: 0.8,
      maxAllowedGb: 19.2,
      modelRequirements: {
        vlm: {
          modelId: 'llava-hf/llava-1.5-7b-hf',
          vramGb: 14.0,
        },
        detection: {
          modelId: 'google/owlv2-base-patch16-ensemble',
          vramGb: 4.0,
        },
      },
    })
  }),

  http.get('/api/models/status', () => {
    return HttpResponse.json({
      loadedModels: [
        {
          modelId: 'llava-hf/llava-1.5-7b-hf',
          taskType: 'vlm',
          modelName: 'llava',
          framework: 'transformers',
          quantization: null,
          health: 'loaded' as const,
          vramAllocatedGb: 14.0,
          vramUsedGb: 13.8,
          warmUpComplete: true,
          lastUsed: '2025-10-03T10:00:00Z',
          loadTimeMs: 3456,
          performanceMetrics: {
            totalRequests: 150,
            averageLatencyMs: 234.5,
            requestsPerSecond: 0.8,
            averageFps: 2.5,
          },
          errorMessage: null,
        },
      ],
      totalVramAllocatedGb: 14.0,
      totalVramAvailableGb: 24.0,
      timestamp: '2025-10-03T10:00:00Z',
      cudaAvailable: true,
    })
  }),

  // Ontology augmentation (relative URL)
  http.post('/api/ontology/augment', async ({ request }) => {
    const body = await request.json() as {
      personaId: string
      domain: string
      targetCategory: string
    }
    return HttpResponse.json({
      id: 'augment-1',
      personaId: body.personaId,
      targetCategory: body.targetCategory,
      suggestions: [
        {
          name: 'Home Run',
          description: 'A hit that allows the batter to circle all bases and score',
          parent: 'Scoring Play',
          confidence: 0.95,
          examples: ['Grand slam', 'Solo homer', 'Walk-off home run'],
        },
        {
          name: 'Strike Out',
          description: 'When a batter accumulates three strikes during an at-bat',
          parent: null,
          confidence: 0.92,
          examples: ['Swinging strikeout', 'Called strikeout', 'Caught looking'],
        },
      ],
      reasoning: 'Based on baseball domain analysis and existing event types',
    })
  }),

  // Object detection (relative URL)
  http.post('/api/videos/:videoId/detect', async ({ request }) => {
    const body = await request.json() as { manualQuery?: string }
    return HttpResponse.json({
      id: 'detection-1',
      videoId: 'video-1',
      query: body.manualQuery || 'baseball, bat, glove',
      frames: [
        {
          frameNumber: 0,
          timestamp: 0.0,
          detections: [
            {
              label: 'baseball',
              boundingBox: { x: 0.45, y: 0.3, width: 0.05, height: 0.05 },
              confidence: 0.94,
              trackId: 'track-1',
            },
            {
              label: 'bat',
              boundingBox: { x: 0.2, y: 0.4, width: 0.3, height: 0.1 },
              confidence: 0.89,
              trackId: 'track-2',
            },
          ],
        },
        {
          frameNumber: 30,
          timestamp: 1.0,
          detections: [
            {
              label: 'baseball',
              boundingBox: { x: 0.6, y: 0.25, width: 0.05, height: 0.05 },
              confidence: 0.91,
              trackId: 'track-1',
            },
          ],
        },
      ],
      totalDetections: 3,
      processingTime: 2.34,
    })
  }),

  http.get('/api/admin/users/:userId', ({ params }) => {
    const { userId } = params
    if (userId === 'user-1') {
      return HttpResponse.json({
        id: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isAdmin: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        personaCount: 3,
        sessionCount: 1,
      })
    }
    return HttpResponse.json({ message: 'User not found' }, { status: 404 })
  }),

  http.post('/api/admin/users', async ({ request }) => {
    const body = await request.json() as {
      username: string
      password: string
      displayName: string
      email?: string
      isAdmin: boolean
    }
    return HttpResponse.json({
      id: 'user-new',
      username: body.username,
      displayName: body.displayName,
      email: body.email,
      isAdmin: body.isAdmin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('/api/admin/users/:userId', async ({ request }) => {
    const body = await request.json() as {
      displayName?: string
      email?: string
      isAdmin?: boolean
      password?: string
    }
    return HttpResponse.json({
      id: 'user-1',
      username: 'admin',
      displayName: body.displayName || 'Admin User',
      email: body.email || 'admin@example.com',
      isAdmin: body.isAdmin !== undefined ? body.isAdmin : true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    })
  }),

  http.delete('/api/admin/users/:userId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/admin/sessions', () => {
    return HttpResponse.json([
      {
        id: 'session-1',
        userId: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        createdAt: '2025-10-10T10:00:00Z',
        expiresAt: '2025-10-17T10:00:00Z',
      },
      {
        id: 'session-2',
        userId: 'user-2',
        username: 'testuser',
        displayName: 'Test User',
        ipAddress: '192.168.1.101',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: '2025-10-10T12:00:00Z',
        expiresAt: '2025-10-17T12:00:00Z',
      },
    ])
  }),

  http.delete('/api/admin/sessions/:sessionId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/api-keys', () => {
    return HttpResponse.json([
      {
        id: 'key-1',
        userId: 'user-1',
        provider: 'anthropic',
        keyName: 'My Anthropic Key',
        keyMask: 'sk-ant-...abc123',
        isActive: true,
        lastUsedAt: '2025-10-10T10:00:00Z',
        createdAt: '2025-10-01T00:00:00Z',
        updatedAt: '2025-10-01T00:00:00Z',
      },
      {
        id: 'key-2',
        userId: 'user-1',
        provider: 'openai',
        keyName: 'OpenAI Development',
        keyMask: 'sk-...xyz789',
        isActive: false,
        createdAt: '2025-10-05T00:00:00Z',
        updatedAt: '2025-10-05T00:00:00Z',
      },
    ])
  }),

  http.get('/api/admin/api-keys', () => {
    return HttpResponse.json([
      {
        id: 'admin-key-1',
        userId: null,
        provider: 'google',
        keyName: 'Shared Google Key',
        keyMask: 'AIza...def456',
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ])
  }),

  http.post('/api/api-keys', async ({ request }) => {
    const body = await request.json() as {
      provider: string
      keyName: string
      apiKey: string
    }
    return HttpResponse.json({
      id: 'key-new',
      userId: 'user-1',
      provider: body.provider,
      keyName: body.keyName,
      keyMask: body.apiKey.substring(0, 7) + '...' + body.apiKey.slice(-6),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 })
  }),

  http.put('/api/api-keys/:keyId', async ({ request }) => {
    const body = await request.json() as {
      keyName?: string
      apiKey?: string
      isActive?: boolean
    }
    return HttpResponse.json({
      id: 'key-1',
      userId: 'user-1',
      provider: 'anthropic',
      keyName: body.keyName || 'My Anthropic Key',
      keyMask: 'sk-ant-...abc123',
      isActive: body.isActive !== undefined ? body.isActive : true,
      createdAt: '2025-10-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    })
  }),

  http.delete('/api/api-keys/:keyId', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('/api/user/profile', async ({ request }) => {
    const body = await request.json() as {
      displayName?: string
      email?: string
    }
    return HttpResponse.json({
      user: {
        id: 'user-1',
        username: 'testuser',
        displayName: body.displayName || 'Test User',
        email: body.email || 'test@example.com',
        isAdmin: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
      },
    })
  }),

  http.post('/api/user/password', async ({ request }) => {
    const body = await request.json() as {
      currentPassword: string
      newPassword: string
    }
    if (body.currentPassword === 'test123') {
      return new HttpResponse(null, { status: 204 })
    }
    return HttpResponse.json(
      { message: 'Current password is incorrect' },
      { status: 400 }
    )
  }),

  http.get('/api/config', () => {
    return HttpResponse.json({
      mode: 'multi-user',
      allowRegistration: true,
      wikidata: {
        mode: 'online',
        url: 'https://www.wikidata.org/w/api.php',
        allowExternalLinks: true,
      },
      externalLinks: {
        wikidata: true,
        videoSources: true,
      },
    })
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { username: string; password: string }
    if (body.username === 'admin' && body.password === 'admin123') {
      return HttpResponse.json({
        user: {
          id: 'user-1',
          username: 'admin',
          displayName: 'Admin User',
          email: 'admin@example.com',
          isAdmin: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      })
    }
    if (body.username === 'testuser' && body.password === 'test123') {
      return HttpResponse.json({
        user: {
          id: 'user-2',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          isAdmin: false,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      })
    }
    return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })
  }),

  http.post('/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      user: {
        id: 'user-1',
        username: 'admin',
        displayName: 'Admin User',
        email: 'admin@example.com',
        isAdmin: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    })
  }),

  http.post('/api/auth/register', async ({ request }) => {
    const body = await request.json() as {
      username: string
      password: string
      displayName: string
      email?: string
    }
    return HttpResponse.json({
      user: {
        id: 'user-new',
        username: body.username,
        displayName: body.displayName,
        email: body.email,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }, { status: 201 })
  }),

  // =============================================================================
  // EXPORT ENDPOINTS
  // =============================================================================

  /**
   * Export all data endpoint.
   * Returns JSONL format with all user data (personas, ontologies, world state, summaries, claims, annotations).
   */
  http.get('http://localhost:3001/api/export', () => {
    const lines = [
      { type: 'persona', data: { id: 'persona-1', name: 'Test', role: 'Analyst', informationNeed: 'Testing', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' } },
      { type: 'ontology', data: { personaId: 'persona-1', entityTypes: [], eventTypes: [], roleTypes: [], relationTypes: [] } },
      { type: 'annotation', data: { id: 'annotation-1', videoId: 'video-1', annotationType: 'type', personaId: 'persona-1', typeId: 'entity-type-1', typeCategory: 'entity', boundingBoxSequence: { boxes: [{ x: 100, y: 100, width: 200, height: 150, frameNumber: 0, isKeyframe: true }], interpolationSegments: [], visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }], totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0 }, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' } },
    ]
    const content = lines.map(l => JSON.stringify(l)).join('\n') + '\n'
    return new HttpResponse(content, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="fovea-export.jsonl"',
        'X-Export-Personas': '1',
        'X-Export-Ontologies': '1',
        'X-Export-Entities': '0',
        'X-Export-Events': '0',
        'X-Export-Times': '0',
        'X-Export-Summaries': '0',
        'X-Export-Claims': '0',
        'X-Export-ClaimRelations': '0',
        'X-Export-Annotations': '1',
      },
    })
  }),

  /**
   * Export statistics endpoint.
   * Returns comprehensive counts for all data types.
   */
  http.get('http://localhost:3001/api/export/stats', () => {
    return HttpResponse.json({
      personaCount: 1,
      ontologyCount: 1,
      entityTypeCount: 1,
      eventTypeCount: 0,
      roleTypeCount: 0,
      relationTypeCount: 0,
      entityCount: 0,
      eventCount: 0,
      timeCount: 0,
      entityCollectionCount: 0,
      eventCollectionCount: 0,
      timeCollectionCount: 0,
      worldRelationCount: 0,
      summaryCount: 0,
      claimCount: 0,
      claimRelationCount: 0,
      annotationCount: 1,
      sequenceCount: 1,
      keyframeCount: 2,
      interpolatedFrameCount: 0,
      totalSize: 1024,
      totalSizeMB: '0.00MB',
    })
  }),

  /**
   * Export personas endpoint.
   */
  http.get('http://localhost:3001/api/export/personas', () => {
    const personaLine = {
      type: 'persona',
      data: {
        id: 'persona-1',
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Testing export',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    }
    const ontologyLine = {
      type: 'ontology',
      data: {
        personaId: 'persona-1',
        entityTypes: [{ id: 'entity-1', name: 'Person', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    }
    const content = [JSON.stringify(personaLine), JSON.stringify(ontologyLine)].join('\n') + '\n'
    return new HttpResponse(content, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="personas.jsonl"',
      },
    })
  }),

  /**
   * Export world state endpoint.
   */
  http.get('http://localhost:3001/api/export/world', () => {
    const entityLine = {
      type: 'entity',
      data: {
        id: 'entity-1',
        name: 'Test Entity',
        description: [{ type: 'text', content: 'A test entity' }],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    }
    return new HttpResponse(JSON.stringify(entityLine) + '\n', {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="world-state.jsonl"',
      },
    })
  }),

  /**
   * Export summaries endpoint.
   */
  http.get('http://localhost:3001/api/export/summaries', () => {
    const summaryLine = {
      type: 'summary',
      data: {
        id: 'summary-1',
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: [{ type: 'text', content: 'Test video summary' }],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    }
    return new HttpResponse(JSON.stringify(summaryLine) + '\n', {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="summaries.jsonl"',
        'X-Export-Summaries': '1',
        'X-Export-Claims': '0',
        'X-Export-ClaimRelations': '0',
      },
    })
  }),

  // =============================================================================
  // IMPORT ENDPOINTS
  // =============================================================================

  /**
   * Import data endpoint.
   */
  http.post('http://localhost:3001/api/import', async () => {
    return HttpResponse.json({
      success: true,
      summary: {
        totalLines: 5,
        processedLines: 5,
        importedItems: {
          personas: 1,
          ontologies: 1,
          entities: 0,
          events: 0,
          times: 0,
          entityCollections: 0,
          eventCollections: 0,
          timeCollections: 0,
          relations: 0,
          summaries: 0,
          claims: 0,
          claimRelations: 0,
          annotations: 3,
          totalKeyframes: 6,
          totalInterpolatedFrames: 0,
          singleKeyframeSequences: 1,
        },
        skippedItems: {
          personas: 0,
          worldObjects: 0,
          summaries: 0,
          claims: 0,
          annotations: 0,
          sequenceAnnotations: 0,
        },
      },
      warnings: [],
      errors: [],
      conflicts: [],
    })
  }),

  /**
   * Import preview endpoint.
   */
  http.post('http://localhost:3001/api/import/preview', async () => {
    return HttpResponse.json({
      counts: {
        personas: 1,
        ontologies: 1,
        entities: 0,
        events: 0,
        times: 0,
        entityCollections: 0,
        eventCollections: 0,
        timeCollections: 0,
        relations: 0,
        summaries: 0,
        claims: 0,
        claimRelations: 0,
        annotations: 3,
        totalKeyframes: 6,
        singleKeyframeSequences: 1,
      },
      conflicts: [],
      warnings: [],
    })
  }),

  /**
   * Import history endpoint.
   */
  http.get('http://localhost:3001/api/import/history', () => {
    return HttpResponse.json({
      imports: [
        {
          id: 'import-1',
          filename: 'backup.jsonl',
          success: true,
          itemsImported: 5,
          itemsSkipped: 0,
          createdAt: '2025-01-01T10:00:00Z',
        },
      ],
      total: 1,
    })
  }),

  // =============================================================================
  // TYPE DELETION PREVIEW AND GRACEFUL DELETE ENDPOINTS
  // =============================================================================

  /**
   * Entity type deletion preview.
   */
  http.get('*/api/personas/:personaId/ontology/entities/:typeId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 2,
      annotationCount: 5,
      worldAssignmentCount: 3,
    })
  }),

  /**
   * Entity type graceful delete.
   */
  http.delete('*/api/personas/:personaId/ontology/entities/:typeId', () => {
    return HttpResponse.json({
      message: 'Entity type deleted successfully',
      glossReferencesConverted: 2,
      annotationsDeleted: 5,
      worldAssignmentsRemoved: 3,
    })
  }),

  /**
   * Role type deletion preview.
   */
  http.get('*/api/personas/:personaId/ontology/roles/:typeId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 1,
      annotationCount: 0,
      worldAssignmentCount: 0,
      eventTypeRoleCount: 4,
    })
  }),

  /**
   * Role type graceful delete.
   */
  http.delete('*/api/personas/:personaId/ontology/roles/:typeId', () => {
    return HttpResponse.json({
      message: 'Role type deleted successfully',
      glossReferencesConverted: 1,
      annotationsDeleted: 0,
      worldAssignmentsRemoved: 0,
      eventTypeRolesRemoved: 4,
    })
  }),

  /**
   * Event type deletion preview.
   */
  http.get('*/api/personas/:personaId/ontology/events/:typeId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 3,
      annotationCount: 10,
      worldAssignmentCount: 2,
    })
  }),

  /**
   * Event type graceful delete.
   */
  http.delete('*/api/personas/:personaId/ontology/events/:typeId', () => {
    return HttpResponse.json({
      message: 'Event type deleted successfully',
      glossReferencesConverted: 3,
      annotationsDeleted: 10,
      worldAssignmentsRemoved: 2,
    })
  }),

  /**
   * Relation type deletion preview.
   */
  http.get('*/api/personas/:personaId/ontology/relation-types/:typeId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 0,
      annotationCount: 0,
      worldAssignmentCount: 0,
    })
  }),

  /**
   * Relation type graceful delete.
   */
  http.delete('*/api/personas/:personaId/ontology/relation-types/:typeId', () => {
    return HttpResponse.json({
      message: 'Relation type deleted successfully',
      glossReferencesConverted: 0,
      annotationsDeleted: 0,
      worldAssignmentsRemoved: 0,
    })
  }),

  // =============================================================================
  // WORLD OBJECT DELETION PREVIEW AND GRACEFUL DELETE ENDPOINTS
  // =============================================================================

  /**
   * World entity deletion preview.
   */
  http.get('*/api/world/entities/:entityId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 5,
      relationCount: 3,
      collectionMemberships: 1,
      annotationCount: 8,
    })
  }),

  /**
   * World entity graceful delete.
   */
  http.delete('*/api/world/entities/:entityId', () => {
    return HttpResponse.json({
      message: 'Entity deleted successfully',
      glossReferencesConverted: 5,
      relationsRemoved: 3,
      collectionMembershipsRemoved: 1,
      annotationsDeleted: 8,
    })
  }),

  /**
   * World event deletion preview.
   */
  http.get('*/api/world/events/:eventId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 2,
      relationCount: 1,
      collectionMemberships: 0,
      annotationCount: 4,
    })
  }),

  /**
   * World event graceful delete.
   */
  http.delete('*/api/world/events/:eventId', () => {
    return HttpResponse.json({
      message: 'Event deleted successfully',
      glossReferencesConverted: 2,
      relationsRemoved: 1,
      collectionMembershipsRemoved: 0,
      annotationsDeleted: 4,
    })
  }),

  /**
   * World time deletion preview.
   */
  http.get('*/api/world/times/:timeId/deletion-preview', () => {
    return HttpResponse.json({
      glossReferences: 1,
      relationCount: 2,
      collectionMemberships: 1,
      annotationCount: 3,
    })
  }),

  /**
   * World time graceful delete.
   */
  http.delete('*/api/world/times/:timeId', () => {
    return HttpResponse.json({
      message: 'Time deleted successfully',
      glossReferencesConverted: 1,
      relationsRemoved: 2,
      collectionMembershipsRemoved: 1,
      annotationsDeleted: 3,
    })
  }),
]
