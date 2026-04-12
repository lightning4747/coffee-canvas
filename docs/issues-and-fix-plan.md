# Coffee Canvas - Current High-Level Issues and Fix Plan

## Purpose

This document captures the currently observed high-level stability/design issues and a step-by-step plan to fix them safely, one by one.

## High-Level Issues (Current)

## 1) Canvas service build-time crash (hard blocker)

- **What is failing:** Canvas service does not compile.
- **Evidence:** `services/canvas-service/src/index.ts` around lines `733` and `736`.
- **Symptoms:**
  - `pourId` referenced in `catch` scope where it is not defined.
  - Fallback `StainPolygon` object uses `points`, which does not match current `StainPolygon` type.
- **Impact:** Service fails to start reliably in dev/prod because build/start can crash.

## 2) Canvas init path lacks top-level startup error handling

- **What is failing:** Startup promise has no top-level `.catch`.
- **Evidence:** `services/canvas-service/src/index.ts` around `857-954`.
- **Impact:** Dependency init failures (Redis/DB/etc.) can cause unhandled rejection behavior and poor failure visibility.

## 3) Physics service env var mismatch (compose vs code)

- **What is failing:** Docker compose and code use different env var names.
- **Evidence:**
  - `docker-compose.yml` uses `PHYSICS_GRPC_URL`.
  - `services/canvas-service/src/physics-client.ts` reads `PHYSICS_SERVICE_URL`.
- **Impact:** Canvas may connect to wrong physics endpoint (fallback localhost), causing physics feature failures and instability.

## 4) Room service Redis configuration mismatch

- **What is failing:** Room service expects Redis but compose does not wire it explicitly.
- **Evidence:**
  - `services/room-service/src/index.ts` uses Redis (`REDIS_URL`, `createClient`, `connect`).
  - `docker-compose.yml` room-service env lacks `REDIS_URL` and no Redis dependency condition.
- **Impact:** Startup can fail in certain environments/orderings; behavior differs across local/CI/docker.

## 5) Service tsconfig path alias risk

- **What is failing:** `baseUrl` + `paths` setup can resolve shared paths incorrectly.
- **Evidence:**
  - `services/canvas-service/tsconfig.json`
  - `services/room-service/tsconfig.json`
- **Impact:** Module resolution can become fragile and produce intermittent TS compile/import issues.

## 6) Architecture drift from plan

- **What is drifting:**
  - Plan expects `@socket.io/redis-adapter` + `ioredis`; code uses `socket.io-redis` + `redis`.
  - Plan expects Room service stack with Pothos + Prisma; current implementation uses custom DB manager and SDL resolvers.
  - Plan target for physics latency is `<100ms`, but client deadline is `5000ms`.
- **Evidence:** `docs/plan.md`, `README.md`, service source files.
- **Impact:** Design inconsistency, scaling/performance uncertainty, and maintainability risk.

---

## Ordered Fix Plan (One by One)

## Phase 1 - Restore Startup Stability First

**Status:** In progress  
**Current completion:** Steps 1-4 implemented in code/config.

### Step 1. Fix canvas compile blockers

1. Move `pourId` derivation so it is available to both `try` and `catch`.
2. Make fallback stain object conform to actual `StainPolygon` type.
3. Run canvas build and startup scripts to ensure no TypeScript runtime/compiler crash remains.

### Step 2. Add top-level startup error handling in canvas

1. Wrap `initializeCanvasService(...)` with explicit `.catch(...)` (or convert to `async` bootstrap with `try/catch`).
2. Log structured startup failure reason.
3. Exit process with non-zero code on init failure.

### Step 3. Fix physics endpoint env mismatch

1. Standardize on **one** env var name across docs, compose, and code.
2. Update `docker-compose.yml` and/or `physics-client.ts` accordingly.
3. Verify canvas reaches physics service in docker network.

### Step 4. Fix room-service Redis wiring

1. Add `REDIS_URL=redis://redis:6379` to room-service environment in compose.
2. Add Redis health/start dependency for room-service.
3. Confirm room starts cleanly when stack boots from scratch.

## Phase 2 - Eliminate Fragile Build/Resolution Paths

### Step 5. Correct tsconfig path alias setup

1. Adjust service `tsconfig.json` (`baseUrl`/`paths`) to resolve shared package deterministically.
2. Ensure workspace build order and project references are consistent.
3. Rebuild shared + canvas + room to confirm stable imports.

## Phase 3 - Re-align with Architecture Plan

### Step 6. Adapter/data-layer alignment decision

1. Decide whether to:
   - keep current stack and update architecture docs, or
   - migrate implementation toward planned stack.
2. If migrating, do in controlled increments:
   - socket adapter layer first,
   - then room service data layer.

### Step 7. Performance target alignment

1. Reduce physics deadline from 5000ms to a realistic bounded value (near design intent).
2. Measure p95/p99 and tune without destabilizing user experience.
3. Update docs with achieved targets and fallback behavior.

---

## Execution Checklist (Recommended Order)

1. Canvas compile fix
2. Canvas startup error handling
3. Physics env var standardization
4. Room Redis wiring
5. TS path alias hardening
6. Architecture re-alignment decision + implementation
7. Physics latency target tuning

---

## Definition of Done

- Canvas and Room services start consistently in fresh docker boot.
- No compile-time crash loop on service startup.
- Physics endpoint resolves correctly in containerized environment.
- Startup failures fail fast with explicit logs and non-zero exit.
- Docs and implementation are aligned (or divergence is explicitly documented).
