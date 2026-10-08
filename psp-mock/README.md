# PSP mock

A mock of the APIs exposed by the PSP ("tesoriere") POS layer, used during local
POS Gateway development and integration testing in place of a real PSP. It is an
Express + TypeScript service whose types are generated from the PSP OpenAPI
spec.

## Status

This is the project scaffold. No PSP endpoint is mocked yet.

| Endpoint                                       | Status    |
|------------------------------------------------|-----------|
| `GET /health`                                  | available |
| `POST /pos/terminals`                          | planned   |
| `POST /pos/sessions/{sessionId}/auth-requests` | planned   |
| `GET /pos/sessions/{sessionId}/auth-requests`  | planned   |
| Outcome callback (`PATCH` sent by the mock)    | planned   |
| Configuration API (`/config`)                  | planned   |

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
set `PSP_MOCK_PORT` in the root `.env` file or provide it when starting the mock:

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

| name   | description                              | default |
|--------|------------------------------------------|---------|
| `PORT` | The port the mock listens to. The mock fails at startup on an invalid value. | `3000`  |

## Types generated from the PSP spec

The request and response types come from
[`psp_pos_layer.json`](https://github.com/pagopa/pagopa-api/blob/fd7ca1c931e136df2d568262fd9a63941c5d8226/openapi/psp_pos_layer.json)
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
    types.ts            aliases over the generated types
    generated/          generated types (not committed)
```
