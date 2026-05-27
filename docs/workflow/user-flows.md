---
title: Oxveil User Flows
generated: true
source: scripts/generate-flow.ts
views: ["not-found","empty","ready","running","stopped","failed","completed","planning","self-improvement"]
---

# User Flows

Generated from source. Do not edit manually — regenerate: `npm run generate:flow`

## User Journeys

### UJ-1: First-time setup

```
[not-found] --install--> [empty]
```

### UJ-2: Create and execute plan

```
[empty] --createPlan--> [planning] --formPlan--> [ready] --start--> [running] --(done)--> [completed]
```

### UJ-3: Handle failure

```
[failed] --retry--> [running] --(done)--> [completed]
```

### UJ-4: Skip failed phase

```
[failed] --skip--> [running] --(done)--> [completed]
```

### UJ-5: Resume stopped work

```
[stopped] --resume--> [running] --(done)--> [completed]
```

### UJ-6: Self-improvement flow

```
[completed] --(auto: lessons)--> [self-improvement] --skip--> [completed]
```

### UJ-7: Restart from scratch

```
[completed] --fullReset--> [empty]
```

### UJ-8: Cancel plan creation

```
[planning] --(terminal close)--> [empty]
```

## Full State Diagram

```mermaid
flowchart TD
    not_found["not-found"] -->|install| empty[empty]
    empty[empty] -->|createPlan| planning[planning]
    planning[planning] -->|formPlan| ready[ready]
    planning[planning] -->|terminal close| empty[empty]
    ready[ready] -->|start| running[running]
    running[running] -->|all done| completed[completed]
    running[running] -->|phase fails| failed[failed]
    running[running] -->|stop| stopped[stopped]
    failed[failed] -->|retry| running[running]
    failed[failed] -->|skip| running[running]
    stopped[stopped] -->|resume| running[running]
    completed[completed] -->|lessons captured| self_improvement["self-improvement"]
    self_improvement["self-improvement"] -->|skip/done| completed[completed]
    completed[completed] -->|fullReset| empty[empty]
    failed[failed] -->|fullReset| empty[empty]
    stopped[stopped] -->|fullReset| empty[empty]
```

## Views

- `not-found`
- `empty`
- `ready`
- `running`
- `stopped`
- `failed`
- `completed`
- `planning`
- `self-improvement`