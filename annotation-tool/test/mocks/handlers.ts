import { http, HttpResponse } from 'msw'

/**
 * MSW 2.0 request handlers for API mocking.
 * Centralized mock handlers used across all tests.
 */
export const handlers = [
  http.get('/api/personas', () => {
    return HttpResponse.json([
      { id: '1', name: 'Test Persona', role: 'Analyst', informationNeed: 'Test need' }
    ])
  }),

  http.post('/api/personas', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: '2',
      ...body
    }, { status: 201 })
  }),

  http.get('/api/videos', () => {
    return HttpResponse.json([
      { id: '1', filename: 'test.mp4', path: '/data/videos/test.mp4' }
    ])
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
      persona_id: string
      domain: string
      target_category: string
    }
    return HttpResponse.json({
      id: 'augment-1',
      persona_id: body.persona_id,
      target_category: body.target_category,
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
    const body = await request.json() as { manual_query?: string }
    return HttpResponse.json({
      id: 'detection-1',
      video_id: 'video-1',
      query: body.manual_query || 'baseball, bat, glove',
      frames: [
        {
          frame_number: 0,
          timestamp: 0.0,
          detections: [
            {
              label: 'baseball',
              bounding_box: { x: 0.45, y: 0.3, width: 0.05, height: 0.05 },
              confidence: 0.94,
              track_id: 'track-1',
            },
            {
              label: 'bat',
              bounding_box: { x: 0.2, y: 0.4, width: 0.3, height: 0.1 },
              confidence: 0.89,
              track_id: 'track-2',
            },
          ],
        },
        {
          frame_number: 30,
          timestamp: 1.0,
          detections: [
            {
              label: 'baseball',
              bounding_box: { x: 0.6, y: 0.25, width: 0.05, height: 0.05 },
              confidence: 0.91,
              track_id: 'track-1',
            },
          ],
        },
      ],
      total_detections: 3,
      processing_time: 2.34,
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
              model_id: 'llava-hf/llava-1.5-7b-hf',
              framework: 'transformers',
              vram_gb: 14.0,
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
              model_id: 'google/owlv2-base-patch16-ensemble',
              framework: 'transformers',
              vram_gb: 4.0,
              speed: 'fast',
              description: 'Open-vocabulary object detection',
              fps: 15.0,
            },
          },
        },
      },
      inference: {
        max_memory_per_model: 24.0,
        offload_threshold: 0.8,
        warmup_on_startup: true,
      },
      cuda_available: true,
    })
  }),

  // Model selection endpoint
  http.post('http://localhost:3001/api/models/select', async ({ request }) => {
    const url = new URL(request.url)
    const taskType = url.searchParams.get('task_type')
    const modelName = url.searchParams.get('model_name')
    return HttpResponse.json({
      status: 'success',
      task_type: taskType,
      selected_model: modelName,
    })
  }),

  // Memory validation endpoint
  http.post('http://localhost:3001/api/models/validate', () => {
    return HttpResponse.json({
      valid: true,
      total_vram_gb: 24.0,
      total_required_gb: 18.0,
      threshold: 0.8,
      max_allowed_gb: 19.2,
      model_requirements: {
        vlm: {
          model_id: 'llava-hf/llava-1.5-7b-hf',
          vram_gb: 14.0,
        },
        detection: {
          model_id: 'google/owlv2-base-patch16-ensemble',
          vram_gb: 4.0,
        },
      },
    })
  }),

  // Model status endpoint
  http.get('http://localhost:3001/api/models/status', () => {
    return HttpResponse.json({
      loaded_models: [
        {
          model_id: 'llava-hf/llava-1.5-7b-hf',
          task_type: 'vlm',
          model_name: 'llava',
          framework: 'transformers',
          quantization: null,
          health: 'loaded' as const,
          vram_allocated_gb: 14.0,
          vram_used_gb: 13.8,
          warm_up_complete: true,
          last_used: '2025-10-03T10:00:00Z',
          load_time_ms: 3456,
          performance_metrics: {
            total_requests: 150,
            average_latency_ms: 234.5,
            requests_per_second: 0.8,
            average_fps: 2.5,
          },
          error_message: null,
        },
      ],
      total_vram_allocated_gb: 14.0,
      total_vram_available_gb: 24.0,
      timestamp: '2025-10-03T10:00:00Z',
      cuda_available: true,
    })
  }),

  // Auth endpoints
  http.get('/api/config', () => {
    return HttpResponse.json({
      mode: 'multi-user',
      allowRegistration: true,
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

  // Admin user management endpoints
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

  // Session management endpoints
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

  // API key management endpoints
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
]
