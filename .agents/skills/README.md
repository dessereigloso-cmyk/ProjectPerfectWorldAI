# Project Perfect World AI — Agent Skills

This directory vendors selected, human-readable Agent Skills from
[gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
for the Project Perfect World AI / Arcade Hub development workflow.

## Included skills

- `router/SKILL.md` — choose the minimum relevant game-development skill before changing code.
- `roblox-luau/SKILL.md` — Roblox Luau, service usage, Script/LocalScript/ModuleScript boundaries.
- `roblox-datastores/SKILL.md` — persistent data, safe loads/saves, failure handling.
- `roblox-networking/SKILL.md` — server authority, remote validation, rate limiting and replication.
- `roblox-studio-workflow/SKILL.md` — preserve the existing Studio hierarchy and verify changes honestly.
- `game-ai/SKILL.md` — NPC decision models, behavior trees, steering and pathfinding.
- `create-game-assets/SKILL.md` — consistent art direction, asset manifests, provenance and validation.

## How God AI should use these

1. Read the router at the beginning of a development task.
2. Select only the relevant skill files; combine them when needed.
3. Inspect the current Project Perfect World AI code and existing Roblox object names before proposing edits.
4. Prefer minimal, reversible changes. Do not replace production systems or duplicate RemoteEvents/DataStores without inspection.
5. Treat downloaded code/assets as untrusted until reviewed. Never auto-run arbitrary scripts or deploy third-party assets without the existing owner review and approval process.
6. Report tests actually performed; never claim Studio/runtime verification without evidence.

## Source and licensing

These skill files are sourced from the upstream repository above. Review its current license and notices before redistributing this bundle outside this project. The upstream repository may change; this is a project snapshot, not an automatic updater.

Upstream install/reference: `npx skills add gamedev-skills/awesome-gamedev-agent-skills`
