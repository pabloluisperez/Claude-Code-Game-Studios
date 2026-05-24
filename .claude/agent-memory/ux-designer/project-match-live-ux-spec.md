---
name: project-match-live-ux-spec
description: Match-Live UX spec completed 2026-05-19 — resolves OQ-HUD-11/12/13; 6 new OQs flagged; sprite library + pacing rules fully specced
metadata:
  type: project
---

Match-Live UX spec written to `design/ux/match-live.md` (2026-05-19).

**Resolves**:
- OQ-HUD-11 (pixel-art match event animations) — fully resolved via ADR-018 sprite library + emoji fallback
- OQ-HUD-12 (dramatic event pacing rules) — fully resolved: teaser 900ms → 10s modal (2s reduced-motion) → optional VAR theater
- OQ-HUD-13 (live match playback timing + speed toggle) — fully resolved: 1s=1min default + ×1/×3/×10 + skip-to-end

**Key design decisions**:
- Sprite library: pixel-art GIFs under `apps/web/static/sprites/match/`; emoji fallback when assets missing (validated from slice)
- Speed toggle: 4-option ButtonGroup (ADR-017 categorical); persists in `localStorage.cascada.match.playbackSpeed`
- Substitution decision: ItemSelect for bench player + ButtonGroup for tactics + EventChoiceButtons for confirm/skip (all per ADR-017)
- Z-index stack: backdrop=100, confetti=110, modal-card=120, outcome-modal=125 — critical for confetti crispness (no backdrop-filter:blur)
- COUNTER formation instruction hidden for home team (per match-simulation.md R4)
- VAR overturns: production must decrement score (slice was visual-only — this is corrected in spec)
- Reconnect: client freezes clock + shows dim "Reconectando..." badge; re-subscribes and replays from snapshot

**New OQs flagged**:
- OQ-LIVE-01: Should Outcome Modal show ∆MPI or just win/draw/loss label? (Pablo + game-designer)
- OQ-LIVE-02: What does cascade engine do when match session = 'failed'? (web-backend-specialist + game-designer)
- OQ-LIVE-03: Playback bar at 375px — label fit check for "×1 ×3 ×10 ⏭" (ui-programmer)
- OQ-LIVE-04: Substitution modal landscape on mobile — overflow-y needed? (ui-programmer)
- OQ-LIVE-05: ×10 speed client-server sync protocol (realtime-multiplayer-specialist)
- OQ-LIVE-06: Staff flavor text delivery — in match:event payload or separate request? (web-backend-specialist)

**New patterns flagged for interaction-patterns.md**:
- "Sticky scoreboard" — persistent score+clock header during match
- "Teaser banner" — 900ms pre-reveal tension buildup (distinct from Toast)
- "Decision modal with timeout" — blocks ongoing process but has server-side default (distinct from Confirmation Modal)

**Why:** Unblocks match-live implementation sprint. Resolves the three OQs that were blocking hud-ui epic stories for the /match route.
**How to apply:** Before /match epic stories are written, confirm OQ-LIVE-01 (∆MPI in outcome) with Pablo. Confirm OQ-LIVE-02 with backend for error UX copy. Assign OQ-LIVE-05 to realtime-specialist before ×10 speed story is implemented.
