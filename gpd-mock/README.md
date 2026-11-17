# GPD - Debt Position mock

A lightweight HTTP mock of the GPD Debt Position POS v3 API
([OpenAPI](https://raw.githubusercontent.com/pagopa/pagopa-debt-position/refs/heads/main/openapi/openapi_pos_v3.json)),
built on `json-server@0.17.4` with custom middleware.

## Endpoints

Paths are accepted with or without the `/pos-integration-gpd/api/v3` base path.

| Method  | Path                                                                      | Success                                     |
|---------|---------------------------------------------------------------------------|---------------------------------------------|
| `POST`  | `/organizations/{organizationfiscalcode}/debtpositions`                   | 201, fixed position with status `VALID`     |
| `PATCH` | `/organizations/{organizationfiscalcode}/debtpositions/{iupd}/invalidate` | 200, fixed position with status `UNPAYABLE` |

Other methods on these paths return `405` with an `Allow` header.

## Selecting the response

The response is selected by the `X-Mock-Response` header (case-sensitive).
When omitted or `success`, the success response is returned.

| `X-Mock-Response`     | Status               | POST | PATCH |
|-----------------------|----------------------|------|-------|
| `success`             | 201 / 200            | yes  | yes   |
| `bad-request`         | 400                  | yes  | no    |
| `unauthorized`        | 401 (empty body)     | yes  | yes   |
| `forbidden`           | 403                  | yes  | yes   |
| `not-found`           | 404                  | no   | yes   |
| `conflict`            | 409                  | yes  | yes   |
| `too-many-requests`   | 429                  | yes  | yes   |
| `server-error`        | 500                  | yes  | yes   |
| `bad-gateway`         | 502                  | yes  | yes   |
| `service-unavailable` | 503                  | yes  | yes   |
| `gateway-timeout`     | 504                  | yes  | yes   |
| `timeout`             | 500 after 30 seconds | yes  | yes   |

Error bodies follow `ProblemJson` (`title`, `status`, `detail`). A value not
supported by the operation returns `400` with code `INVALID_MOCK_RESPONSE`.

## Running

```bash
docker compose up --build --detach gpd-mock
```
using https://github.com/mikefarah/yq

The port defaults to `3002`; override it with `GPD_MOCK_PORT`. Inside
the Docker network use `http://gpd-mock:3000`.

Through Traefik the mock is reachable at `http://localhost:8000/gpd-mock/...`.
Traefik sets `X-Mock-Response: success` in `traefik_conf/conf.yaml`; change it with the following command (f.e. to set conflict response)

```bash
yq -i '.http.middlewares."gpd-mock-headers".headers.customRequestHeaders."X-Mock-Response" = "conflict"' traefik_conf/conf.yaml
```
