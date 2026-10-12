# EC mock

A lightweight HTTP mock for the EC authorization-request endpoint used during
local POS Gateway development and integration testing. It runs
`json-server@0.17.4` with custom middleware so you can simulate successful requests
and HTTP errors without connecting to a real EC service.

## What it does

The middleware handles:

```text
PATCH /pos/ci/sessions/{sessionId}/auth-requests
```

Any non-empty session ID occupying a single URL path segment is accepted. The
mock does not look up sessions, validate the request body, or persist
authorization requests. Responses are selected only by the `X-Mock-Response`
header; omitting it returns `204 No Content`.

Other methods on this path return `405 Method Not Allowed`, with an
`Allow: PATCH` header and the following JSON body:

```json
{
  "code": "METHOD_NOT_ALLOWED",
  "message": "Only PATCH is supported"
}
```

Paths not matching this endpoint are passed to json-server. The database file is
empty (`{}`), so no additional application resources are configured.

## Start the mock

Prerequisites: Docker running locally and `curl` for the examples below.
Run these commands from the **repository root**:

```sh
docker compose up --build --detach ec-mock
```

The mock is available at `http://localhost:3000`. To use a different host port,
change `EC_MOCK_PORT` in the root `.env` file or provide it when starting the mock:

```sh
EC_MOCK_PORT=3005 docker compose up --build --detach ec-mock
```

The container always listens on port `3000`. The mock has no dependencies on
MongoDB or SigNoz, so it can be started on its own. It also starts with the full
stack when you run `docker compose up`.

The JSON file is deliberately mounted as `/config/ec-server.json`: this is the
path expected by the Dockerfile's startup command.

Compose automatically connects the mock to `pagopa-posgw-net`. Configure the
calling service's EC base URL as `http://ec-mock:3000`.
From your host, use `http://localhost:3000` (or your chosen `EC_MOCK_PORT`).

## Send requests

Each example below is a collapsible section. Run the `curl` command from a
terminal after starting the mock.

<details>
<summary>Success (omit X-Mock-Response)</summary>

```sh
curl -i -X PATCH \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>Success (explicit response value)</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: success' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>400 Bad Request</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: bad-request' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>404 Not Found</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: not-found' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>429 Too Many Requests</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: too-many-requests' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>500 Internal Server Error</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: server-error' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>502 Bad Gateway</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: bad-gateway' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>503 Service Unavailable</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: service-unavailable' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>504 Gateway Timeout (immediate response)</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: gateway-timeout' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>Simulated timeout (wait 30 seconds, then return 500)</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: timeout' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>Invalid response value</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response: invalid-value' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>Empty response value</summary>

```sh
curl -i -X PATCH \
  -H 'X-Mock-Response:' \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

<details>
<summary>Unsupported method (405 Method Not Allowed)</summary>

```sh
curl -i -X GET \
  http://localhost:3000/pos/ci/sessions/demo-session/auth-requests
```

</details>

### Available responses

Header values are case-sensitive.

| `X-Mock-Response` | HTTP status | JSON `code` | JSON `message` |
| --- | --- | --- | --- |
| Omitted or `success` | 204 | No body | No body |
| `bad-request` | 400 | `BAD_REQUEST` | `Bad Request` |
| `not-found` | 404 | `NOT_FOUND` | `Not Found` |
| `too-many-requests` | 429 | `TOO_MANY_REQUESTS` | `Too Many Requests` |
| `server-error` | 500 | `INTERNAL_SERVER_ERROR` | `Internal server error` |
| `bad-gateway` | 502 | `BAD_GATEWAY` | `Bad Gateway` |
| `service-unavailable` | 503 | `SERVICE_UNAVAILABLE` | `Service unavailable` |
| `gateway-timeout` | 504 | `GATEWAY_TIMEOUT` | `Gateway timeout` |
| `timeout` | 500 after 30 seconds | `INTERNAL_SERVER_ERROR` | `Internal server error` |
| Any other value (including an empty value) | 400 | `INVALID_MOCK_RESPONSE` | `Bad request` |

`gateway-timeout` returns immediately; only `timeout` waits 30 seconds before
returning its 500 response. `too-many-requests` simulates a response and does not
implement actual rate limiting. Methods other than `PATCH` return `405` with
`Allow: PATCH`.

## Logs and lifecycle

```sh
docker compose logs --follow ec-mock
docker compose stop ec-mock
docker compose start ec-mock
```

For handled PATCH requests, the middleware logs the timestamp, HTTP status,
session ID, mock response mode, and reason. Successful responses are labeled
`ACCEPTED` in green; errors are labeled `REJECTED` in red.

After editing `middleware.js`, restart the container to load the changes:

```sh
docker compose restart ec-mock
```

To remove the container when finished:

```sh
docker compose stop ec-mock
docker compose rm -f ec-mock
```
