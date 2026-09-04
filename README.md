# pagopa-posgw-local
All you need to start the whole pagopa pos-gateway platform locally for development purposes and integration tests

For more details you can read the POS Gateway [Design Review](https://pagopa.atlassian.net/wiki/spaces/I/pages/2175074356/DR+PFM-1+Integrazione+POS+Fisici+in+PagoPA)

### Configure

In the _.env_ file there are configurations related to containers that can be customized, in particular the container ports and the services git branch to run a given version of microservices.

#### Infrastructure Services

| name                                         | description                                                                                     |
|----------------------------------------------|-------------------------------------------------------------------------------------------------|
| MONGO_PORT                                   | The port the mongodb listens to.                                                                |
| MONGO_EXPRESS_PORT                           | The port the mongo-express listens to.                                                          |
| REDIS_PORT                                   | The port the redis listens to.                                                                  |
| REDIS_INSIGHT_PORT                           | The port the redis-insight listens to.                                                          |
| SIGNOZ_PORT                                  | The port the SigNoz observability UI listens to.                                                |
| POSGW_<service_name>_GIT_REF*                | The git ref to be fetched when building the `<service_name>` image                               |
| POSGW_<service_name>_PORT*                   | The HTTP port where the `<service_name>` service will listen                                     |
| POSGW_<service_name>_COMPILATION_MODE*       | Build mode for `<service_name>` (`native` or `jvm`)                                               |

\* The `POSGW_<service_name>_` prefix means these properties are present once per pagoPA POS gateway service

### Run Pos Gateway pagoPA

You can build and startup all services with the command

```sh
docker compose up
```

Watch out: there are many services that will be build and run parallel, consider giving proper resources to any virtual machine used to build in order to reduce build time or reduce build parallelism in order to build services sequentially and reduce concurrency.


#### Infrastructure & Observability

You can check data persisted to either Mongo, Redis or SigNoz for example with their respective web interfaces (Mongo express/Redis Insight/SigNoz UI). To do so, go to:

| service             | url                                         |
|---------------------|---------------------------------------------|
| `Traefik Dashboard` | http://localhost:8090                       |
| `Traefik Proxy`     | http://localhost:8000                       |
| `Redis Insight`     | http://localhost:8001                       |
| `Mongo Express`     | http://localhost:8081                       |
| `SigNoz UI`         | http://localhost:3301                       |
| `ClickHouse`        | http://localhost:8123 (HTTP), 9001 (native) |
| `OTEL Collector`    | http://localhost:4318 (HTTP), 4317 (gRPC)   |


### Observability with SigNoz

This setup includes [SigNoz](https://signoz.io/), a complete observability platform that provides distributed tracing, metrics, and logs for all Pos Gateway services.

#### Accessing SigNoz

Navigate to **http://localhost:3301** to access the SigNoz UI where you can:
- View distributed traces across all microservices
- Monitor service metrics (latency, throughput, error rates)
- Query and analyze application logs
- Visualize service dependencies and performance

**First-time Setup**: On initial startup, SigNoz will prompt you to create an account. This is a **local account** stored in the Docker volume, not an online account. You can use any credentials (e.g., `test@example.com` with any password).

To keep your account between container restarts, use `docker-compose down` (without the `-v` flag) to preserve volumes. Using `docker-compose down -v` will delete volumes and require recreating the account.

#### OpenTelemetry Configuration

All services are instrumented with OpenTelemetry Java agent and send telemetry data to the OTEL collector at:
- **gRPC**: `localhost:4317`
- **HTTP**: `localhost:4318`

To enable/disable telemetry for a specific service, modify the service's `.env` file:
```bash
# Enable telemetry
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp

# Disable telemetry
OTEL_TRACES_EXPORTER=none
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=none
```

#### SigNoz Components

The observability stack includes:
- **SigNoz UI**: Web interface for viewing telemetry data
- **ClickHouse**: Time-series database for storing traces, metrics, and logs
- **OTEL Collector**: Receives and processes OpenTelemetry data
- **Zookeeper**: Coordination service for ClickHouse cluster

**Note**: On first startup, the schema migrator creates all necessary database tables. This process takes 1-3 minutes and only runs once.

### Data Persistence & Debugging

#### MongoDB
If you want to connect to MongoDB using an external client (such as Mongo Compass etc) you will have to add an entry in hosts file:

```
127.0.0.1 pagopa-posgw-mongo
```
to map the pagopa-posgw-mongo hostname with localhost. This is required since mongo is started as a replica set with that hostname.

You can also use **Mongo Express** at http://localhost:8081 for a web-based interface.

#### Redis
Use **Redis Insight** at http://localhost:8001 to inspect Redis data.

### Building Services

When changing configuration parameters, remember to rebuild containers with:
```sh
docker-compose build SERVICE_NAME [--no-cache]
```

### Troubleshooting

To fix:
```sh
#0 135.0 [output clipped, log limit 1MiB reached]
```

run docker compose with:
```sh
DOCKER_BUILDKIT=1 docker compose up
```
#### SigNoz Startup Time

On first startup, the SigNoz schema migrator creates all necessary database tables. This process:
- Takes 1-3 minutes on first run
- Only runs when schema changes are detected
- Is required for SigNoz to function properly

If services seem to hang during startup, check `docker-compose logs signoz-schema-migrator` to see migration progress.

#### Disable SigNoz for Faster Development

If you don't need observability during development, you can disable telemetry for specific services by setting in their `.env` files:
```bash
OTEL_TRACES_EXPORTER=none
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=none
```

Alternatively, to disable the entire SigNoz stack, comment out these services in `docker-compose.yml`:
- `signoz`
- `signoz-clickhouse`
- `signoz-otel-collector`
- `signoz-zookeeper`
- `signoz-init-clickhouse`
- `signoz-schema-migrator`

