# PUC Backend

## Operational Endpoints

- `GET /health` returns service liveness details for load balancers and uptime monitors.
- Response includes:
  - `status`: `OK`
  - `timestamp`: ISO timestamp
  - `environment`: current `NODE_ENV`

Example response:

```json
{
  "status": "OK",
  "timestamp": "2026-04-14T10:45:00.000Z",
  "environment": "production"
}
```

#