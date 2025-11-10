---
title: Job Queues and Async Processing
sidebar_position: 8
---

# Job Queues and Async Processing

FOVEA uses BullMQ and Redis for asynchronous job processing. This architecture enables long-running AI tasks like video summarization, claim extraction, and object tracking to run in the background without blocking the API.

## Overview

Job queues decouple request handling from task execution:

```
┌─────────┐         ┌─────────┐         ┌─────────┐         ┌──────────────┐
│ Browser │────────▶│ Backend │────────▶│  Redis  │────────▶│ Queue Worker │
└─────────┘         │   API   │         │  Queue  │         │   (Backend)  │
     │              └─────────┘         └─────────┘         └──────────────┘
     │                                                              │
     │                                                              ▼
     │                                                       ┌──────────────┐
     └──────────────── Poll Status ─────────────────────────│ Model Service│
                                                             └──────────────┘
```

1. **Browser** sends request to backend API
2. **Backend** creates a job in Redis queue and returns job ID
3. **Queue Worker** picks up job and processes it
4. **Browser** polls job status until completion
5. **Model Service** performs AI inference when invoked by worker

## Architecture

### Components

**BullMQ**: TypeScript job queue library
- Job creation and scheduling
- Worker processes for job execution
- Progress tracking and status updates
- Retry logic and error handling

**Redis**: In-memory data store
- Stores job queues and data
- Pub/sub for real-time updates
- Fast, atomic operations
- Persistence for job history

**Backend Workers**: Node.js processes
- Execute jobs from queues
- Call model service APIs
- Update job status in Redis
- Handle errors and retries

### Queue Types

FOVEA uses multiple queues for different task types:

#### 1. Video Summarization Queue

- **Purpose**: Generate text summaries from videos
- **Job data**: Video ID, persona context, model configuration
- **Duration**: 30-90 seconds per video
- **Priority**: Medium
- **Retry**: 3 attempts

#### 2. Claim Extraction Queue

- **Purpose**: Extract atomic claims from video summaries
- **Job data**: Summary ID, extraction strategy, confidence threshold
- **Duration**: 20-60 seconds per summary
- **Priority**: Medium
- **Retry**: 3 attempts

#### 3. Claim Synthesis Queue

- **Purpose**: Generate synthesized claims from multiple sources
- **Job data**: Multiple summary IDs, synthesis parameters
- **Duration**: 30-120 seconds
- **Priority**: Low
- **Retry**: 2 attempts

## Job Lifecycle

### 1. Job Creation

When a user initiates a task:

```typescript
// Backend creates job
const job = await videoSummarizationQueue.add('summarize', {
  videoId: 'video-123',
  personaRole: 'Sports Analyst',
  informationNeed: 'Track player movements',
  modelId: 'qwen-2-5-vl-7b'
})

// Return job ID to client
return { jobId: job.id, status: 'queued' }
```

### 2. Job Queuing

Job enters Redis queue:

```
Status: queued
Position: #3 in queue
Created: 2025-01-20T10:30:00Z
Data: { videoId, personaRole, ... }
```

### 3. Job Processing

Worker picks up job:

```typescript
// Worker processes job
worker.on('active', async (job) => {
  // Update status
  await job.updateProgress(0)

  // Call model service
  const result = await modelService.summarizeVideo(job.data)

  // Update progress
  await job.updateProgress(50)

  // Save result to database
  await saveToDatabase(result)

  // Complete job
  await job.updateProgress(100)
  return result
})
```

Job status updates:

```
Status: active → progress: 0%
Status: active → progress: 50%
Status: active → progress: 100%
Status: completed
```

### 4. Job Completion

Worker marks job complete:

```
Status: completed
Result: { summaryId: 'summary-456', ... }
Completed: 2025-01-20T10:31:30Z
Duration: 90 seconds
```

### 5. Error Handling

If job fails:

```
Status: failed
Error: "Model service timeout"
Attempt: 1 of 3
Retry: 2025-01-20T10:35:00Z (5 min delay)
```

After retries exhausted:

```
Status: failed
Error: "Model service timeout after 3 attempts"
Failed: 2025-01-20T10:45:00Z
```

## Client-Side Integration

### Polling Job Status

Frontend polls job status until completion:

```typescript
// Submit job
const { jobId } = await apiClient.post('/api/summaries/generate', data)

// Poll status
const pollInterval = setInterval(async () => {
  const status = await apiClient.get(`/api/jobs/${jobId}`)

  if (status.state === 'completed') {
    clearInterval(pollInterval)
    // Use result
    console.log('Summary created:', status.result)
  } else if (status.state === 'failed') {
    clearInterval(pollInterval)
    // Handle error
    console.error('Job failed:', status.error)
  } else {
    // Update progress UI
    updateProgress(status.progress || 0)
  }
}, 1000) // Poll every second
```

### Job Status Response

```json
{
  "jobId": "job-123",
  "state": "active",
  "progress": 65,
  "data": {
    "videoId": "video-123",
    "personaRole": "Sports Analyst"
  },
  "result": null,
  "error": null,
  "createdAt": "2025-01-20T10:30:00Z",
  "startedAt": "2025-01-20T10:30:15Z",
  "completedAt": null
}
```

States:
- `queued`: Waiting in queue
- `active`: Currently processing
- `completed`: Successfully finished
- `failed`: Error occurred
- `delayed`: Scheduled for future execution

## Configuration

### Queue Options

```typescript
// Queue configuration
const queueOptions = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  defaultJobOptions: {
    attempts: 3,           // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000,         // Start with 5s, then 10s, 20s
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
  }
}
```

### Worker Options

```typescript
// Worker configuration
const workerOptions = {
  connection: { /* redis connection */ },
  concurrency: 5,         // Process 5 jobs concurrently
  limiter: {
    max: 10,              // Max 10 jobs per...
    duration: 60000,      // ...60 seconds
  }
}
```

## Monitoring and Observability

### Queue Metrics

Monitor queue health via:

- **Queue length**: Number of jobs waiting
- **Active jobs**: Currently processing
- **Completed rate**: Jobs/minute completion rate
- **Failed rate**: Percentage of failed jobs
- **Average duration**: Mean job processing time

### Prometheus Metrics

FOVEA exports queue metrics to Prometheus:

```
# Queue job counter
fovea_queue_job_total{queue="video_summarization",state="completed"} 150
fovea_queue_job_total{queue="video_summarization",state="failed"} 5

# Queue job duration
fovea_queue_job_duration_seconds{queue="video_summarization"} 45.2

# Queue length
fovea_queue_length{queue="video_summarization"} 3
```

### Grafana Dashboards

View queue metrics in Grafana:

- Queue length over time
- Job completion rate
- Failure rate by queue
- Average job duration
- Worker concurrency

Access Grafana at `http://localhost:3002`

## Performance Optimization

### Concurrency Tuning

Adjust worker concurrency based on resources:

**Low resources** (2 CPU cores, 8GB RAM):
```typescript
concurrency: 2  // Process 2 jobs at once
```

**Medium resources** (4 CPU cores, 16GB RAM):
```typescript
concurrency: 5  // Process 5 jobs at once
```

**High resources** (8+ CPU cores, 32GB+ RAM):
```typescript
concurrency: 10  // Process 10 jobs at once
```

### Rate Limiting

Prevent overwhelming model service:

```typescript
limiter: {
  max: 10,        // Max 10 jobs...
  duration: 60000 // ...per 60 seconds
}
```

Adjust based on model service capacity.

### Priority Queues

Prioritize urgent jobs:

```typescript
// High priority
await queue.add('urgent-task', data, { priority: 1 })

// Normal priority
await queue.add('normal-task', data, { priority: 5 })

// Low priority
await queue.add('batch-task', data, { priority: 10 })
```

Lower priority numbers execute first.

## Error Handling and Retries

### Automatic Retries

Failed jobs automatically retry with exponential backoff:

```
Attempt 1: Fails at T+0s → Retry at T+5s
Attempt 2: Fails at T+5s → Retry at T+15s (5s + 10s)
Attempt 3: Fails at T+15s → Retry at T+35s (5s + 10s + 20s)
Attempt 4: Exhausted → Mark as failed permanently
```

### Retry Strategy

Retries are appropriate for:

✅ Temporary model service unavailability
✅ Network timeouts
✅ Rate limiting (429 errors)
✅ Temporary resource constraints

Retries are NOT appropriate for:

❌ Invalid input data
❌ Authentication failures
❌ Client errors (400-level HTTP errors)
❌ Quota exceeded

### Manual Retry

Retry failed jobs manually:

```typescript
// Get failed job
const job = await queue.getJob(jobId)

// Retry
if (job && job.failedReason) {
  await job.retry()
}
```

## Troubleshooting

### Jobs Stuck in Queue

**Symptom**: Jobs remain in `queued` state indefinitely

**Causes**:
1. Worker process not running
2. Redis connection lost
3. Worker crashed

**Solution**:
```bash
# Check worker status
docker compose logs backend | grep Worker

# Restart workers
docker compose restart backend

# Check Redis connection
docker compose logs redis
```

### High Failure Rate

**Symptom**: Many jobs failing repeatedly

**Causes**:
1. Model service down or overloaded
2. Invalid job data
3. Insufficient resources

**Solution**:
```bash
# Check model service
curl http://localhost:8000/health

# View failed jobs
docker compose logs backend | grep "Job failed"

# Check resources
docker stats
```

### Slow Job Processing

**Symptom**: Jobs take longer than expected

**Causes**:
1. Low worker concurrency
2. Model service slow
3. Resource constraints
4. Large queue backlog

**Solution**:
- Increase worker concurrency
- Scale model service
- Add more CPU/RAM
- Monitor queue length

### Redis Connection Issues

**Symptom**: "ECONNREFUSED" errors

**Solution**:
```bash
# Check Redis running
docker compose ps redis

# Test connection
docker compose exec redis redis-cli ping
# Should return "PONG"

# Restart Redis
docker compose restart redis
```

## Development and Testing

### Running Workers Locally

```bash
# Start all services including workers
docker compose up

# Workers start automatically with backend service
# Check logs
docker compose logs backend | grep "Worker started"
```

### Testing Job Flow

```typescript
// Create test job
const job = await queue.add('test', { videoId: 'test-123' })

// Wait for completion
await job.waitUntilFinished()

// Check result
console.log(job.returnvalue)
```

### Inspecting Queue State

```typescript
// Get queue stats
const waiting = await queue.getWaitingCount()
const active = await queue.getActiveCount()
const completed = await queue.getCompletedCount()
const failed = await queue.getFailedCount()

console.log({ waiting, active, completed, failed })
```

## Security Considerations

### Redis Security

1. **Network isolation**: Redis should not be exposed to public internet
2. **Authentication**: Use `requirepass` in production
3. **Encryption**: Use TLS for Redis connections in production

### Job Data Privacy

- Don't store sensitive data in job payloads
- Use database IDs instead of full data
- Sanitize job data before logging

### Rate Limiting

- Prevent job spam with rate limits
- Validate job data before queuing
- Authenticate job creation requests

## See Also

- [Architecture Overview](./architecture.md): Overall system architecture
- [Model Service](../model-service/overview.md): AI model integration
- [Observability](./observability.md): Monitoring and metrics
- [BullMQ Documentation](https://docs.bullmq.io/): Official BullMQ docs
