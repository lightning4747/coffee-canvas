# Agent Memory: Coffee & Canvas Implementation

## Core Instructions & Rules

1. **No Half-Baking**: Do not skip subtasks or leave them "partially implemented" to move to next phases.
2. **Slow Down**: Ensure every block of code is intentional, clean, and fully addresses the requirement.
3. **No Jumping Around**: Finish the current task (Phase 7) completely before proposing or starting the next one.
4. **Verification First**: Validate all logic (tests, visual feedback) before declaring a task done.

## Current State

- **Phase 1-6**: Backend Infrastructure (Completed & Verified).
- **Phase 7**: Frontend Canvas Engine (**COMPLETED**).
  - [x] 7.1: Next.js + PixiJS Integration (Infinite Viewport).
  - [x] 7.2: Drawing Tools & Interactions (Pen, Proper Eraser).
  - [x] 7.3: Coffee Pour Interface (Animated Liquid Expansion).
  - [x] 7.4: Unit & Performance Stress Tests (11/11 Passed).
- **Next Phase**: Phase 8 - Real-time Communication Bridge (**IN PROGRESS**).

## Notes for Phase 8.1 (Socket.IO Integration)

- I must ensure the socket connection is persistent and handles JWT/Room mapping correctly.
- Implement the `useSocket` custom hook for clean concern-separation.
