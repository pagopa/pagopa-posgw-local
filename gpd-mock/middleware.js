const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

// Constants for simulating a timeout delay
const timeoutDelay = 30000; // 30 seconds

const basePath = '/pos-integration-gpd/api/v3';
const createRoute = new RegExp(`^(?:${basePath})?/organizations/([^/]+)/debtpositions$`);
const invalidateRoute = new RegExp(`^(?:${basePath})?/organizations/([^/]+)/debtpositions/([^/]+)/invalidate$`);

const problem = (status, title, detail) => ({ title, status, detail });

// Error responses shared by both operations. A null body means an empty response.
const sharedErrors = {
  unauthorized: { status: 401, body: null },
  forbidden: {
    status: 403,
    body: { statusCode: 403, message: 'You are not allowed to access this resource.' },
  },
  conflict: { status: 409, body: problem(409, 'Conflict', 'Debt position already exists or is in a conflicting state') },
  'server-error': { status: 500, body: problem(500, 'Internal Server Error', 'There was an error processing the request') },
  'bad-gateway': { status: 502, body: problem(502, 'Bad Gateway', 'Bad Gateway') },
  'service-unavailable': { status: 503, body: problem(503, 'Service Unavailable', 'Service unavailable') },
  'gateway-timeout': { status: 504, body: problem(504, 'Gateway Timeout', 'Gateway timeout') },
  'too-many-requests': { status: 429, body: problem(429, 'Too Many Requests', 'Too Many Requests') },
};

const operations = {
  create: {
    name: 'createPosition',
    method: 'POST',
    success: { status: 201, positionStatus: 'VALID' },
    errors: {
      ...sharedErrors,
      'bad-request': { status: 400, body: problem(400, 'Bad Request', 'Invalid request payload') },
    },
  },
  invalidate: {
    name: 'invalidatePosition',
    method: 'PATCH',
    success: { status: 200, positionStatus: 'UNPAYABLE' },
    errors: {
      ...sharedErrors,
      'not-found': { status: 404, body: problem(404, 'Not Found', 'Debt position not found') },
    },
  },
};

const buildPosition = (iupd, status) => ({
  iupd,
  payStandIn: true,
  companyName: 'Mock Company',
  officeName: 'Mock Office',
  status,
  paymentOption: [
    {
      description: 'Mock payment option',
      switchToExpired: false,
      debtor: {
        type: 'F',
        fiscalCode: 'RSSMRA80A01H501U',
        fullName: 'Mario Rossi',
      },
      installments: [
        {
          nav: '302000000000000001',
          iuv: '02000000000000001',
          amount: 10000,
          description: 'Mock installment',
          dueDate: '2099-12-31T23:59:59',
          status: 'UNPAID',
          transfer: [
            {
              idTransfer: '1',
              amount: 10000,
              organizationFiscalCode: '77777777777',
              remittanceInformation: 'Mock remittance information',
              category: '9/0101108AA/',
              iban: 'IT0000000000000000000000000',
            },
          ],
        },
      ],
    },
  ],
});

// Function for well formatted logging with color coding for accepted and rejected requests
function logRequest(req, operation, status, reason) {
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
      `  Operation : ${safe(operation)}`,
      `  Mock mode : ${safe(req.get('X-Mock-Response') ?? '(absent)')}`,
      `  Reason    : ${reason}`,
    ].join('\n') +
    `${colors.reset}\n`
  );
}

module.exports = (req, res, next) => {
  const createMatch = createRoute.exec(req.path);
  const invalidateMatch = invalidateRoute.exec(req.path);

  if (!createMatch && !invalidateMatch) {
    return next();
  }

  const operation = createMatch ? operations.create : operations.invalidate;

  console.log(`Mocking intercept for ${req.method} ${req.path}`);

  // Check the method received in the request. If it's not the expected one, return a 405 Method Not Allowed response.
  if (req.method !== operation.method) {
    res.set('Allow', operation.method);
    return res.status(405).json({
      code: 'METHOD_NOT_ALLOWED',
      message: `Only ${operation.method} is supported`,
    });
  }

  // Get the value of the X-Mock-Response header from the request
  const mockHeaderValue = req.get('X-Mock-Response')?.toLowerCase() ?? 'success';

  if (mockHeaderValue === 'success') {
    const iupd = invalidateMatch ? invalidateMatch[2] : 'mock-iupd';
    logRequest(req, operation.name, operation.success.status, 'Success');
    return res.status(operation.success.status).json(buildPosition(iupd, operation.success.positionStatus));
  }

  if (mockHeaderValue === 'timeout') {
    setTimeout(() => {
      logRequest(req, operation.name, 500, 'Internal Server Error (Timeout)');
      res.status(500).json(problem(500, 'Internal Server Error', 'There was an error processing the request'));
    }, timeoutDelay);
    return;
  }

  const error = Object.hasOwn(operation.errors, mockHeaderValue)
    ? operation.errors[mockHeaderValue]
    : undefined;

  if (error) {
    logRequest(req, operation.name, error.status, mockHeaderValue);
    return error.body === null
      ? res.status(error.status).end()
      : res.status(error.status).json(error.body);
  }

  logRequest(req, operation.name, 400, `Unhandled X-Mock-Response: ${mockHeaderValue}`);
  return res.status(400).json({
    code: 'INVALID_MOCK_RESPONSE',
    message: 'Bad request',
  });
};
