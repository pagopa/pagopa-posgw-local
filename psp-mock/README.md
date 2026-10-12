# PSP mock

A mock of the APIs exposed by the PSP ("tesoriere") POS layer, used during local
POS Gateway development and integration testing in place of a real PSP. It is an
Express + TypeScript service whose types are generated from the PSP OpenAPI
spec.

## Status

The configuration API is available. No PSP endpoint is mocked yet, so the
configuration is stored and validated but nothing reads it so far.

| Endpoint                                       | Status    |
|------------------------------------------------|-----------|
| `GET /health`                                  | available |
| `POST /pos/terminals`                          | planned   |
| `POST /pos/sessions/{sessionId}/auth-requests` | planned   |
| `GET /pos/sessions/{sessionId}/auth-requests`  | planned   |
| Outcome callback (`PATCH` sent by the mock)    | planned   |
| Configuration API (`/config`)                  | available |

Any route that is not mocked answers `404` with a `ProblemJson` body:

```json
{
  "type": "about:blank",
  "title": "Not found",
  "status": 404,
  "detail": "No mock defined for POST /pos/terminals"
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

## Configuration API

The behavior of the mock is driven by a configuration held in memory. It is
lost when the container restarts.

| Endpoint         | Description                                             | Response                                                          |
|------------------|---------------------------------------------------------|-------------------------------------------------------------------|
| `GET /config`    | Returns the current configuration.                      | `200`                                                             |
| `PATCH /config`  | Partial update: only the properties in the body change. | `200` with the new configuration, `400` with a `ProblemJson` body |
| `DELETE /config` | Restores the defaults.                                  | `204`                                                             |

Default configuration:

```json
{
  "operations": {
    "terminals":      { "mode": "OK", "koStatus": 500, "delayMs": 0, "timeoutMs": 30000 },
    "authRequest":    { "mode": "OK", "koStatus": 500, "delayMs": 0, "timeoutMs": 30000 },
    "sessionOutcome": { "mode": "OK", "koStatus": 500, "delayMs": 0, "timeoutMs": 30000 }
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

`operations` has one entry per mocked PSP operation: `terminals`
(`POST /pos/terminals`), `authRequest` (`POST .../auth-requests`) and
`sessionOutcome` (`GET .../auth-requests`).

| Property    | Values                                                                                                                                     | Description                                                              |
|-------------|--------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `mode`      | `OK`, `KO`, `TIMEOUT`                                                                                                                      | `KO` answers with `koStatus`, `TIMEOUT` answers `500` after `timeoutMs`. |
| `koStatus`  | `terminals`: 400, 401, 404, 500<br>`authRequest`: 400, 401, 404, 409, 422, 429, 500, 502, 503, 504<br>`sessionOutcome`: 400, 404, 429, 500 | Limited to the error statuses the spec declares for the operation.       |
| `delayMs`   | 0 to 600000                                                                                                                                | Delay before the answer.                                                 |
| `timeoutMs` | 0 to 600000                                                                                                                                | How long the `TIMEOUT` mode waits.                                       |

`callback` drives the outcome callback the mock sends after an accepted
authorization request.

| Property            | Values                                                             | Description                                                                                                        |
|---------------------|--------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `baseUrl`           | http(s) URL                                                        | Where the `PATCH /pos/sessions/{sessionId}/auth-requests` is sent.                                                 |
| `apiKey`            | non-empty string                                                   | Value of the `Ocp-Apim-Subscription-Key` header.                                                                   |
| `outcome`           | `AUTHORIZED`, `DECLINED`, `REFUSED`, `CANCELED_BY_USER`, `TIMEOUT` | Outcome reported by the PSP. `TIMEOUT` is a KO outcome that is still delivered.                                    |
| `delivery`          | `SEND`, `NONE`, `LATE`                                             | `NONE` never calls back, `LATE` calls back after the session has expired.                                          |
| `delayMs`           | 0 to 600000                                                        | Delay before the outcome is produced.                                                                              |
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
[`psp_pos_layer.json`](https://github.com/pagopa/pagopa-api/blob/fd7ca1c931e136df2d568262fd9a63941c5d8226/openapi/psp_pos_layer.json)
in `pagopa-api`, generated with `openapi-typescript`. The spec is pinned to a
commit through `config.pspSpecRef` in `package.json`: change that value to move
to a newer version of the contract.

`npm run generate` writes `src/generated/psp-pos-layer.ts`. The file is not
committed: it is produced by `npm run build` (locally and in the image build).

## Postman collection

A Postman collection with its local environment is in
[`api-tests/psp-mock`](../api-tests/psp-mock): import both files in Postman and
select the environment. It has one request per configuration preset (an
operation in KO or timeout, callback never sent or sent late, and so on), as an
alternative to the curl commands above.

The presets are partial updates, so they add up: use "Reset configuration" to go
back to the defaults. The environment points to `http://localhost:3001`: change
`HOSTNAME` if the mock runs on a different port.

The "PSP operations" folder calls the mocked endpoints (terminal list,
authorization request, session outcome), and "Get sessions" shows the stored
sessions with their callback attempts. The session id comes from `SESSION_ID`
in the environment: change it to start a new session, because the same
authorization request sent again is a replay. A session keeps the callback
settings in force when it was accepted, so send the presets before the
authorization request.

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
    store/              in-memory state (mock configuration)
    types.ts            aliases over the generated types
    generated/          generated types (not committed)
```
