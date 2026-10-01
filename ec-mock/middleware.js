const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

// Constants for simulating a timeout delay
const timeoutDelay = 30000; // 30 seconds

// Function for well formatted logging with color coding for accepted and rejected requests
function logRequest(req, sessionId, status, reason) {
  const accepted = status >= 200 && status < 300;
  const color = accepted ? colors.green : colors.red;
  const label = accepted ? 'ACCEPTED' : 'REJECTED';

  // Keep each request in one log entry; escape control characters.
  const safe = (value) => JSON.stringify(String(value));

  console.log(
    `${color}` +
    [
      `[${new Date().toISOString()}] ${label} | HTTP ${status}`,
      `  Request   : ${req.method} ${safe(req.path)}`,
      `  Session ID: ${safe(sessionId ?? '(not matched)')}`,
      `  Mock mode : ${safe(req.get('X-Mock-Response') ?? '(absent)')}`,
      `  Reason    : ${reason}`,
    ].join('\n') +
    `${colors.reset}\n`
  );
}

module.exports = (req, res, next) => {
  const matchesEndpoint = /^\/pos\/ci\/sessions\/([^/]+)\/auth-requests$/.exec(req.path);

  if (!matchesEndpoint) {
    return next();
  }

  console.log(`Mocking intercept for ${req.method} ${req.path}`);

  // Check the method received in the request. If it's not PATCH, return a 405 Method Not Allowed response.
  if (req.method !== 'PATCH') {
    res.set('Allow', 'PATCH');
    return res.status(405).json({
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only PATCH is supported',
    });
  }

  const sessionId = matchesEndpoint[1];

  // Get the value of the X-Mock-Response header from the request
  const response = req.get('X-Mock-Response');

  switch (response) {
    case undefined:
    case 'success':
      logRequest(req, sessionId, 204, 'Success');
      return res.status(204).end();

    case 'bad-request':
      logRequest(req, sessionId, 400, 'Bad Request');
      return res.status(400).json({
        code: 'BAD_REQUEST',
        message: 'Bad Request',
      });

    case 'not-found':
      logRequest(req, sessionId, 404, 'Not Found');
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Not Found',
      });

    case 'too-many-requests':
      logRequest(req, sessionId, 429, 'Too Many Requests');
      return res.status(429).json({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too Many Requests',
      });

    case 'server-error':
      logRequest(req, sessionId, 500, 'Internal Server Error');
      return res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });

    case 'bad-gateway':
      logRequest(req, sessionId, 502, 'Bad Gateway');
      return res.status(502).json({
        code: 'BAD_GATEWAY',
        message: 'Bad Gateway',
      });

    case 'service-unavailable':
      logRequest(req, sessionId, 503, 'Service Unavailable');
      return res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
      });

    case 'gateway-timeout':
      logRequest(req, sessionId, 504, 'Gateway Timeout');
      return res.status(504).json({
        code: 'GATEWAY_TIMEOUT',
        message: 'Gateway timeout',
      });

    case 'timeout':
      const sleep = (delay) => new Promise(resolve => setTimeout(resolve, delay));
      const timeoutFunc = async () => {
        await sleep(timeoutDelay);
      }
      timeoutFunc().then(() => {
        logRequest(req, sessionId, 500, 'Internal Server Error (Timeout)')
        return res.status(500).json({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: 'Internal server error',
              });
      });
      break;

    default:
      logRequest(req, sessionId, 400, `Unhandled X-Mock-Response: ${response}`);
      return res.status(400).json({
        code: 'INVALID_MOCK_RESPONSE',
        message: 'Bad request',
      });
  }
};
