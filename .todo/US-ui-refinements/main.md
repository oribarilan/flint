# US-ui-refinements

## Goal
Four independent UI refinements to improve Flint's overlay experience: chat auto-scroll, SVG icons, bottom bar layout, and simplified card interactions.

## Definition of Done
- [ ] Chat panel auto-scrolls on new messages/streaming; scroll-lock works when user scrolls up
- [ ] All attention pane icons are Lucide SVGs, no emoji icons remain in the attention components
- [ ] App chrome is a bottom bar with only a settings icon — no "FLINT" branding visible
- [ ] Clicking a card anywhere toggles selection; Open button is prominent and independent
- [ ] `just check` passes (lint, format, typecheck, test)

## Task Priority
1. `lucide-icons.md` — installs dependency needed by tasks 2–4
2. `attention-icons.md` — replaces emojis in attention components
3. `tool-icon-names.md` — updates Copilot tool/prompt for icon name strings
4. `bottom-bar.md` — moves header to bottom, uses Lucide Settings icon
5. `chat-auto-scroll.md` — independent, can be done in parallel
6. `click-to-select.md` — uses Lucide ExternalLink, can parallel after task 1

## Cross-Cutting Concerns
- All tasks share `lucide-react` dependency (except chat auto-scroll)
- No CSS transitions on selection states (keyboard-driven app)
- `prefers-reduced-motion` is not a concern here (no new animations added)
- All changes are renderer-side except task 3 (tool description + system prompt in main process)

## References
- Spec: `docs/superpowers/specs/2026-04-25-ui-refinements-design.md`
- Plan: `docs/superpowers/plans/2026-04-25-ui-refinements-plan.md`
