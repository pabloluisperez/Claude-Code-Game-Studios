---
name: project-cascada-fc
description: Cascada FC — football manager web game with emergent cascade engine, isometric pixel art world, and mobile PWA. UX review status and open blockers.
metadata:
  type: project
---

Cascada FC is a web football manager game (PWA) with an emergent cascade engine. Core loop: decision panel -> skip time -> read feedback -> (optional) walk isometric world. Hybrid UI: menus for management + isometric world for key moments. Mobile session: 10-20 min = 1 in-game week. Web/PC session: 30-120 min = 1 in-game month.

**Why:** Game is in concept/prototype phase. A prototype was validated in HTML and produced three key learnings that are not in the main document.

**Prototype learnings (not in the GDD):**
1. Players expect to see upcoming calendar events in advance — surprise event interactions do not give time for informed decisions. A "next events preview" system is needed.
2. Staff quality should drive recommendation specificity — e.g., staff suggests specific values ("raise ticket prices this week — rival on TV"). No UI pattern for "contextual staff suggestions" exists in the document.
3. Narrative texture IS the cascade UI — staff message text is the primary interface for the cascade engine. Message system design (timing, priority, archival) is critical UX.

**UX adversarial review completed 2026-05-16. Four BLOCKING issues found:**

1. BLOCKING: Menu/isometric world transition trigger is undefined. No defined mechanism for what sends the player to the isometric world vs. keeping them in the menu. Cannot write navigation UX spec without answering: Is the world push or pull? What events qualify as "key moments"? What is the idle state of the world if there are no events?

2. BLOCKING: Information priority hierarchy is undefined. Five layers compete for attention in the decision panel: Manager RPG, Club sports, Visual city, Cascade engine, Staff messages. No defined priority order. The cascade engine has no visible interface without a message system with hierarchy. Layout of the main decision panel cannot be specified.

3. BLOCKING: Interruption model for mobile session is undefined. 10-20 min = 1 week only works if the player can exit mid-week and resume. Minimum auto-save unit and session interruption model must be decided before specifying the mobile session rhythm.

4. BLOCKING: Implicit tutorial has undiscovered mechanic holes. The "ruins club forces learning" pressure tutorial works for crisis mechanics but not for optimization mechanics (ticket price slider, training budget). No system exists for detecting unused mechanics and triggering staff suggestions after N in-game weeks.

**How to apply:** Before writing any UX spec for Cascada FC, surface these four blockers to the game designer and get design decisions. Do not proceed to spec without answers.

**Staff suggestion UI pattern (RECOMMENDED, not blocking):** Pattern C (integrated as decision context) aligns best with the cascade engine differentiator. Pattern D (weekly mandatory briefing before time skip) is safer for MVP. Staff novice vs. expert distinction should be expressed through text specificity + single confidence signal (border color, star, staff name + level) — avoid color as sole differentiator for accessibility.
