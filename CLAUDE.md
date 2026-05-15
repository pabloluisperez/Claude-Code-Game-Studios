# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

- **Engine**: [CHOOSE: Godot 4 / Unity / Unreal Engine 5 / Web]
- **Language**: [CHOOSE: GDScript / C# / C++ / Blueprint / TypeScript]
- **Version Control**: Git with trunk-based development
- **Build System**: [SPECIFY after choosing engine]
- **Asset Pipeline**: [SPECIFY after choosing engine]

> **Note**: Engine-specialist agents exist for Godot, Unity, Unreal, and Web
> with dedicated sub-specialists. Use the set matching your engine.
>
> - **Godot**: `godot-specialist`, `godot-gdscript-specialist`, `godot-csharp-specialist`, `godot-shader-specialist`, `godot-gdextension-specialist`
> - **Unity**: `unity-specialist`, `unity-dots-specialist`, `unity-shader-specialist`, `unity-ui-specialist`, `unity-addressables-specialist`
> - **Unreal**: `unreal-specialist`, `ue-blueprint-specialist`, `ue-gas-specialist`, `ue-replication-specialist`, `ue-umg-specialist`
> - **Web**: `web-specialist`, `web-frontend-specialist`, `web-backend-specialist`, `realtime-multiplayer-specialist` (TypeScript full-stack monorepo: SvelteKit + Hono + Drizzle + Socket.IO)

## Project Structure

@.claude/docs/directory-structure.md

## Engine Version Reference

Active engine reference depends on the project's chosen engine
(see `.claude/docs/technical-preferences.md`). Uncomment the matching
line and comment out the others when you pick an engine.

@docs/engine-reference/godot/VERSION.md
<!-- @docs/engine-reference/unity/VERSION.md -->
<!-- @docs/engine-reference/unreal/VERSION.md -->
<!-- @docs/engine-reference/web/VERSION.md -->

## Technical Preferences

@.claude/docs/technical-preferences.md

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** If the project has no engine configured and no game concept,
> run `/start` to begin the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

@.claude/docs/context-management.md
