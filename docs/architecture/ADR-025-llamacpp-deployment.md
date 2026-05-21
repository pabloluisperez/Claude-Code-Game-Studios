# ADR-025: llama.cpp Deployment Model

## Status

Proposed (v1.2 design draft — autopilot 2026-05-21)

## Date

2026-05-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack + native sidecar |
| **Domain** | Infrastructure / AI |
| **Knowledge Risk** | HIGH — llama.cpp evolves quickly; pin version |
| **References Consulted** | ADR-004 (Narrative AI architecture — reactivated), narrative-ai.md, llama.cpp README |
| **Verification Required** | Sprint 29 spike: p95 < 2s on target hardware with 8B-Q4 |

## Supersedes

ADR-004 stays Accepted (use llama.cpp). This ADR refines the deployment model.

## Context

v1.2 introduces narrative AI. We need to decide:

1. Sidecar (same host as API) vs separate service (different host)
2. Model file source + version pinning
3. HTTP API mode vs gRPC mode
4. GPU vs CPU
5. Scaling beyond single instance

## Decision

### D1. Sidecar deployment for v1.2 launch

llama.cpp runs as a **sidecar process** on the same host as the API
server. Communication: HTTP localhost.

Why sidecar:

- Lowest latency (no network hop)
- Simplest ops (no separate service to monitor)
- Cost effective for indie scale (no dedicated AI hardware)

Tradeoffs:

- Couples API + AI scaling (can't scale independently)
- API host needs ~6-8GB RAM for 8B-Q4 model
- Single point of failure

When to revisit: if API host hits memory ceiling or AI demand outpaces
API demand, split to separate service. ADR amendment, not full v2.0.

### D2. Model: Llama 3 8B Instruct Q4_K_M (or equivalent)

Initial pick: **Llama 3 8B Instruct quantized to Q4_K_M**.

- ~4.5GB on disk
- ~5GB RAM at runtime
- p95 ~1.5-3s on M2 / Ryzen 7 for 200-token output
- Good Spanish proficiency per public benchmarks

Backup options (if Sprint 29 spike fails):

- Mistral 7B Q4_K_M (smaller, slightly faster)
- Llama 3 8B Q5_K_M (more RAM, better quality)

Pinned exact GGUF filename + sha256 in ADR amendment after spike.

### D3. HTTP API mode

`llama-server --host 127.0.0.1 --port 8080 --model <path>`

Native HTTP server mode (no Python wrapper, no gRPC complexity). API
service in apps/api calls it via fetch.

OpenAI-compatible endpoints (`/v1/chat/completions`, `/v1/completions`).
Useful for future swap to other backends if needed.

### D4. CPU-only deployment for v1.2 launch

No GPU dependency. M-series Apple Silicon and Ryzen 7+ generations
handle 8B-Q4 acceptably for our latency targets.

When to revisit GPU:

- Latency p95 > 5s on production hardware
- DAU growth makes single-instance CPU saturated
- v2.0 MMO multi-tenant might justify dedicated GPU

### D5. Single instance for v1.2

One llama.cpp process per API host. Concurrent requests serialize at the
model (a single instance can't truly parallelize).

For v1.2 with predicted ~10-20 active users, single instance suffices.

When to revisit: when concurrent in-flight requests > 3 cause queueing
> 5s. Add a second llama.cpp instance on same host (different port) +
round-robin in API layer.

### D6. Version pinning

`docs/infrastructure/llamacpp-pinning.md` (TBD) documents:

- Exact llama.cpp commit SHA
- GGUF model file name + sha256
- Upgrade procedure (test in staging, regression check vs gold standard
  outputs, gradual rollout)

## Alternatives Considered

### A1. Cloud LLM API (OpenAI, Anthropic, Mistral API)

REJECTED for v1.2 launch — cost model doesn't work for free MVP (per
narrative-ai.md cost analysis: $5-10/user/mo vs $1 self-hosted).

If monetization activates in v1.3 and revenue justifies, cloud is an
optional path for users on overload-routed traffic.

### A2. Local LM Studio / Ollama as proxy

REJECTED — adds layers without clear benefit. llama.cpp HTTP server
mode already does what we need.

### A3. Embed llama.cpp via WASM in browser (client-side)

REJECTED — model size (4-5GB) makes browser delivery impractical;
also security risk (model + user data leak via bug). Server-side only.

### A4. Custom inference (vLLM, TGI)

REJECTED — overkill for indie scale. Revisit at v2.0 if MMO multi-tenant.

## Consequences

### Positive

- Low operational cost
- No external dependencies (privacy + reliability)
- Latency predictable
- Stack consistent with the "everything self-hosted" indie value

### Negative

- API host needs more RAM
- Single instance = bottleneck if concurrent demand spikes
- Model version management is manual

### Mitigations

- Health check endpoint pings llama.cpp; failures auto-failover to templates
- Monitoring: queue depth + latency p95 alerts in Sentry
- Pinning doc has rollback procedure

## Operational notes

### Startup

```bash
# In production deploy
./bin/llama-server \
  --host 127.0.0.1 --port 8080 \
  --model /opt/smt/models/llama-3-8b-instruct-Q4_K_M.gguf \
  --ctx-size 4096 \
  --threads 4 \
  --n-gpu-layers 0 \
  --log-disable
```

### Process management

systemd unit `smt-llama.service` defined in `docs/infrastructure/systemd/`
(TBD Sprint 29). Restart on crash. journald logs.

### Health check

API has `GET /health/llama` that pings the sidecar's `/health` endpoint.
Sentry watches the API health endpoint at 60s cadence.

## Implementation milestones

| Sprint | Milestone |
|--------|-----------|
| v1.2 #29 | Spike: validate p95 < 2s with 8B-Q4 on target hardware |
| v1.2 #30 | systemd unit + version pinning doc |
| v1.2 #31 | API service layer wiring + health check |
| v1.2 #37 | Production deploy + monitoring |

## References

- ADR-004 (Narrative AI architecture)
- narrative-ai.md
- llama.cpp HTTP server: https://github.com/ggerganov/llama.cpp/tree/master/examples/server
