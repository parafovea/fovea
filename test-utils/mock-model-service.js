/**
 * Mock model service for E2E tests.
 * Returns minimal responses to keep the frontend happy without running the full Python service.
 */
const http = require('http');

const mockResponses = {
  '/api/models/config': {
    available_models: {},
    selected_models: {},
    device: 'cpu'
  },
  '/health': { status: 'ok' }
};

const server = http.createServer((req, res) => {
  const url = req.url;

  if (mockResponses[url]) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockResponses[url]));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Mock model service listening on port ${PORT}`);
});
