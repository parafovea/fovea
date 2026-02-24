---
title: Common Issues
---

# Common Issues

## 500 error on first access after a fresh Docker deployment

**Symptom:** The first request to the Fovea server returns a 500 error. Subsequent requests may also fail until the database becomes available.

**Cause:** When the server starts before the database is ready (common in Docker Compose setups where both containers start simultaneously), the initial database connection fails.

**Fix:** The server now retries the database connection up to 5 times with a 2-second delay between attempts. This retry logic runs before the server accepts HTTP requests, so the startup sequence waits for the database to become reachable.

If you still encounter connection failures:

1. Check that the database container is healthy: `docker compose ps`
2. Check the database logs for errors: `docker compose logs db`
3. Increase the retry count by rebuilding with a higher `maxRetries` value if your database takes longer than 10 seconds to start.
4. As a last resort, restart all containers: `docker compose down && docker compose up`

## Model service 503 errors

**Symptom:** Requests to `/api/models/config`, `/api/models/status`, `/api/models/select`, or `/api/models/validate` return a 503 status with the message "Model service is unavailable".

**Cause:** The model service (Python process) is either not running, still starting up, or unreachable over the network. When the backend cannot connect to the model service (connection refused or timeout), it returns 503 instead of 500 to indicate the downstream dependency is unavailable rather than an internal server bug.

**Fix:**

1. Verify the model service container is running: `docker compose ps model-service`
2. Check model service logs: `docker compose logs model-service`
3. Confirm the `MODEL_SERVICE_URL` environment variable points to the correct address (default: `http://model-service:8000` in Docker, `http://localhost:8000` in development).
4. If the model service is loading a large model, wait for it to finish initialization. The 503 response is temporary and resolves once the service is ready.

## Video routes return 401 Unauthorized

**Symptom:** Requests to `/api/videos`, `/api/videos/:id`, or other video endpoints return 401.

**Cause:** All video routes require authentication. A valid session cookie must be included with each request.

**Fix:** Ensure the client sends the `session_token` cookie with video requests. If using a browser, verify that `withCredentials: true` is set on Axios or `credentials: 'include'` is set on fetch calls. If using Safari, confirm that the CORS origin list includes both `localhost` and `127.0.0.1` variants, as Safari treats these as different origins.

## Login does not redirect to the original page

**Symptom:** After logging in, the user is always redirected to `/` instead of the page they were trying to access.

**Cause:** The route guard that redirects unauthenticated users to `/login` must pass the original path in `location.state.from`. The login page reads this value and navigates to it after a successful login. If the route guard does not pass the `from` state, the login page defaults to `/`.

**Fix:** Ensure your route guard passes the intended destination:

```tsx
<Navigate to="/login" state={{ from: location.pathname }} replace />
```
