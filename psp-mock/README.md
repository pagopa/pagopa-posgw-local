# PSP mock

A mock of the APIs exposed by the PSP ("tesoriere") POS layer, used during local
POS Gateway development and integration testing in place of a real PSP. It is an
Express + TypeScript service whose types are generated from the PSP OpenAPI
spec.

## Status

The endpoints served by the PSP and the configuration API are available. The
outcome callback is not sent yet, so the `callback` settings other than
`outcome` and `delayMs` have no effect so far.

| Endpoint                                       | Status    |
|------------------------------------------------|-----------|
| `GET /health`                                  | available |
| `POST /pos/terminals`                          | available |
| `POST /pos/sessions/{sessionId}/auth-requests` | available |
| `GET /pos/sessions/{sessionId}/auth-requests`  | available |
| Outcome callback (`PATCH` sent by the mock)    | planned   |
| Configuration API (`/config`)                  | available |

Any route that is not mocked answers `404` with a `ProblemJson` body:

```json
{
  "type": "about:blank",
  "title": "Not found",
  "status": 404,
  "detail": "No mock defined for POST /pos/reconciliations/batches"
}
```

## Start the mock

Prerequisites: Docker running locally. Run from the **repository root**:

```sh
docker compose up --build --detach psp-mock
curl -i http://localhost:3001/health
```

The mock is available at `http://localhost:3001`. To use a different host port,
change `PSP_MOCK_PORT` in the root `.env` file or provide it when starting the mock:

```sh
PSP_MOCK_PORT=3006 docker compose up --build --detach psp-mock
```

The container always listens on port `3000`. The mock has no dependencies on the
other services, so it can be started on its own. It also starts with the full
stack when you run `docker compose up`.

Compose connects the mock to `pagopa-posgw-net`: other containers reach it at
`http://psp-mock:3000`.

The image build needs network access, because it downloads the PSP spec from
GitHub (see below).

## Environment variables

| name                | description                                                                                                    | default                                         |
|---------------------|----------------------------------------------------------------------------------------------------------------|-------------------------------------------------|
| `PORT`              | The port the mock listens to. The mock fails at startup on an invalid value.                                   | `3000`                                          |
| `CALLBACK_BASE_URL` | Default base URL the outcome callback is sent to. Must be an http(s) URL, the mock fails at startup otherwise. | `http://pagopa-posgw-transactions-handler:8080` |
| `CALLBACK_API_KEY`  | Default value of the `Ocp-Apim-Subscription-Key` header sent with the outcome callback.                        | `psp-mock-api-key`                              |

The two callback variables only set the defaults of the configuration API:
`callback.baseUrl` and `callback.apiKey` can be changed at runtime with
`PATCH /config`.

## Mocked endpoints

The mock serves plain HTTP, without the mTLS the spec asks for. Every endpoint
requires the `x-correlation-id` header (a UUID) and answers `400`, listing what
is missing or invalid, when the header or a required body field is not valid.
Errors have a `ProblemJson` body.

| Endpoint                                       | Behavior                                                                                                                                                                                                                                               |
|------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `POST /pos/terminals`                          | `200` with the configured terminal list.                                                                                                                                                                                                               |
| `POST /pos/sessions/{sessionId}/auth-requests` | `204` and the session is stored. The same request again answers `204` (idempotent), a different request for the same session `409`. `404` when `terminalId` is not in the terminal list, `400` when the `sessionId` in the body differs from the path. |
| `GET /pos/sessions/{sessionId}/auth-requests`  | `200` with the outcome of the session, `404` for an unknown session.                                                                                                                                                                                   |

The outcome of a session is the configured `callback.outcome` and becomes
available `callback.delayMs` after the authorization request, using the values
set when the request was accepted. Until then the `GET` answers with
`operations.sessionOutcome.pendingStatus` (`404` by default): the spec has no
representation for a pending session.

Each operation can be forced to fail or to time out through its `mode` in the
configuration. The forced answer comes before any validation of the request.

```sh
CORRELATION_ID='x-correlation-id: 3fa85f64-5717-4562-b3fc-2c963f66afa6'

curl -s -X POST http://localhost:3001/pos/terminals \
  -H 'Content-Type: application/json' -H "$CORRELATION_ID" \
  -d '{"psp":{"id":"PSP_001","broker":"INT_123","channel":"CANALE_POS"},"creditorInstitution":{"fiscalCode":"80001230456"}}'

curl -i -X POST http://localhost:3001/pos/sessions/session-1/auth-requests \
  -H 'Content-Type: application/json' -H "$CORRELATION_ID" \
  -d '{"amount":1500,"psp":{"id":"PSP_001","broker":"INT_123","channel":"CANALE_POS"},"creditorInstitution":{"fiscalCode":"80001230456"},"terminalId":"POS-001","outcomeAuthToken":"token","sessionId":"session-1"}'

curl -s http://localhost:3001/pos/sessions/session-1/auth-requests -H "$CORRELATION_ID"
```

## Configuration API

The behavior of the mock is driven by a configuration held in memory. It is
lost, with the stored sessions, when the container restarts.

| Endpoint         | Description                                             | Response                                                          |
|------------------|---------------------------------------------------------|-------------------------------------------------------------------|
| `GET /config`    | Returns the current configuration.                      | `200`                                                             |
| `PATCH /config`  | Partial update: only the properties in the body change. | `200` with the new configuration, `400` with a `ProblemJson` body |
| `DELETE /config` | Restores the defaults and deletes the stored sessions.  | `204`                                                             |

Default configuration:

```json
{
  "terminals": [
    { "id": "POS-001", "description": "POS Sportello 01", "status": "AVAILABLE", "authorizationTimeout": 60 },
    { "id": "POS-002", "description": "POS Sportello 02", "status": "MAINTENANCE", "authorizationTimeout": 30 }
  ],
  "operations": {
    "terminals":      { "mode": "OK", "koStatus": 500, "delayMs": 0, "timeoutMs": 30000 },
    "authRequest":    { "mode": "OK", "koStatus": 500, "delayMs": 0, "timeoutMs": 30000 },
    "sessionOutcome": { "mode": "OK", "koStatus": 500, "delayMs": 0, "timeoutMs": 30000, "pendingStatus": 404 }
  },
  "callback": {
    "baseUrl": "http://pagopa-posgw-transactions-handler:8080",
    "apiKey": "psp-mock-api-key",
    "outcome": "AUTHORIZED",
    "delivery": "SEND",
    "delayMs": 0,
    "retry": { "minDelayMs": 2000, "maxAttempts": 50 }
  }
}
```

`terminals` is the list returned by `POST /pos/terminals`. It is replaced as a
whole: at least one terminal, unique `id`, `status` in `AVAILABLE`,
`UNAVAILABLE`, `MAINTENANCE`, optional `statusCode` in `S0001`, `S0002`,
`S0003`, `authorizationTimeout` from 1 to 60 seconds.

`operations` has one entry per mocked PSP operation: `terminals`
(`POST /pos/terminals`), `authRequest` (`POST .../auth-requests`) and
`sessionOutcome` (`GET .../auth-requests`).

| Property        | Values                                                                                                                                     | Description                                                                    |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `mode`          | `OK`, `KO`, `TIMEOUT`                                                                                                                      | `KO` answers with `koStatus`, `TIMEOUT` answers `500` after `timeoutMs`.       |
| `koStatus`      | `terminals`: 400, 401, 404, 500<br>`authRequest`: 400, 401, 404, 409, 422, 429, 500, 502, 503, 504<br>`sessionOutcome`: 400, 404, 429, 500 | Limited to the error statuses the spec declares for the operation.             |
| `delayMs`       | 0 to 600000                                                                                                                                | Delay before the answer.                                                       |
| `timeoutMs`     | 0 to 600000                                                                                                                                | How long the `TIMEOUT` mode waits.                                             |
| `pendingStatus` | 400, 404, 429, 500                                                                                                                         | `sessionOutcome` only: answer of the `GET` while the outcome is not available. |

`callback` drives the outcome callback the mock sends after an accepted
authorization request.

| Property            | Values                                                             | Description                                                                                                        |
|---------------------|--------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `baseUrl`           | http(s) URL                                                        | Where the `PATCH /pos/sessions/{sessionId}/auth-requests` is sent.                                                 |
| `apiKey`            | non-empty string                                                   | Value of the `Ocp-Apim-Subscription-Key` header.                                                                   |
| `outcome`           | `AUTHORIZED`, `DECLINED`, `REFUSED`, `CANCELED_BY_USER`, `TIMEOUT` | Outcome reported by the PSP. `TIMEOUT` is a KO outcome that is still delivered.                                    |
| `delivery`          | `SEND`, `NONE`, `LATE`                                             | `NONE` never calls back, `LATE` calls back after the session has expired.                                          |
| `delayMs`           | 0 to 600000                                                        | Delay between the authorization request and the outcome.                                                           |
| `retry.minDelayMs`  | 0 to 600000                                                        | Minimum wait between attempts. The default is the SANP minimum (2 s), lower values are accepted to speed up tests. |
| `retry.maxAttempts` | 1 to 100                                                           | Upper bound on the attempts. With the default, session expiry stops the retries first.                             |

Examples:

```sh
curl -s http://localhost:3001/config

# terminal list answers 404, the callback is never sent
curl -s -X PATCH http://localhost:3001/config \
  -H 'Content-Type: application/json' \
  -d '{"operations":{"terminals":{"mode":"KO","koStatus":404}},"callback":{"delivery":"NONE"}}'

curl -i -X DELETE http://localhost:3001/config
```

An update is all or nothing: if any property is unknown or invalid, nothing
changes and the `400` lists every error in `detail`:

```json
{
  "type": "about:blank",
  "title": "Invalid configuration",
  "status": 400,
  "detail": "operations.terminals.koStatus: must be one of 400, 401, 404, 500; callback.foo: unknown property"
}
```

## Types generated from the PSP spec

The request and response types come from
[`psp_pos_layer.json`](https://github.com/pagopa/pagopa-api/blob/6678950ad5c87ad7290fa087a25fe5f2d6276c9d/openapi/psp_pos_layer.json)
in `pagopa-api`, generated with `openapi-typescript`. The spec is pinned to a
commit through `config.pspSpecRef` in `package.json`: change that value to move
to a newer version of the contract.

`npm run generate` writes `src/generated/psp-pos-layer.ts`. The file is not
committed: it is produced by `npm run build` (locally and in the image build).

## Run without Docker

Requires Node 24 or later. Run from the `psp-mock` folder:

```sh
npm ci
npm run build
PORT=3001 npm start
```

## Project layout

```text
psp-mock/
  Dockerfile.psp-mock   multi-stage build, runs as a non-root user
  package.json          scripts and the pinned spec commit
  src/
    index.ts            server bootstrap
    app.ts              Express app and routes
    config.ts           environment variables
    handlers/           one router per group of endpoints
    store/              in-memory state (mock configuration, sessions)
    types.ts            aliases over the generated types
    generated/          generated types (not committed)
```
