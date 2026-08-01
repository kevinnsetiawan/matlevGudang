---
name: uimobile
description: Audit and repair WARNOTO mobile UI for overflow, small controls, or broken responsive layout using a review-first, presentation-only workflow.
---

# WARNOTO mobile UI

Before auditing, read `AGENTS.md`, `HANDOFF.md`, `CLAUDE.md`, check `git status`, and locate the target with the project graph or targeted reads. Present evidence with file/line references and distinguish browser evidence from static inference. Pause for explicit user approval naming the presentation scope before editing.

Keep business logic, state transitions, schema, API contracts, and dependencies unchanged. The ATTB overlap files (`src/components/AttbTab.jsx`, `src/components/AttbDashboardSummary.jsx`, `src/styles/operations.css`, `src/index.css`) may be audited but require explicit coordination before editing. After approval, edit only approved presentation files. Preserve existing WARNOTO components, tokens, icons, and mobile branches. Validate 360x800, 390x844, 412x915, 768x1024, and 1366/1440 desktop: overflow, 44px targets, readable inputs/text, safe areas, modal scrolling, reflow, action hierarchy, and light/dark loading/empty/error/success states. Run `git diff --check`, `npm run build`, and focused browser tests when available. Never commit, push, mutate production, or edit `HANDOFF.md` without explicit approval.
