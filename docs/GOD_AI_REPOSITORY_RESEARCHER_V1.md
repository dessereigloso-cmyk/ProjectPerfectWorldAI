# God AI Repository Researcher v1.0

Status: design specification only — not deployed and not connected to the live Roblox game.

## Purpose

Give Project Perfect World a read-only research and inspection capability before it proposes code changes. The researcher must inspect repository evidence, identify risks and missing pieces, and return a reviewable plan. It must not modify files, run arbitrary code, install dependencies, or deploy anything.

## Compatibility baseline

- Existing production server: `server.js` v6.0.
- Existing package dependencies: Express and CORS only.
- Existing AI providers: OpenRouter and Gemini through the current provider router.
- Existing protected world endpoint: `POST /godai`.
- Existing authorization: `GOD_AI_TOKEN`.
- Existing game command allowlist and Roblox server-authoritative execution remain unchanged.
- Game-development skill files currently live on branch `integration/gamedev-agent-skills`, not `main`.

## v1.0 scope

1. Accept a repository owner/name, branch or commit ref, and a bounded list of file paths or a bounded repository snapshot.
2. Read repository metadata and text files only. Prefer public GitHub read endpoints in the first implementation; private repository access requires a dedicated read-only GitHub token stored as a Render environment secret, never sent by a client.
3. Enforce limits: allowlisted GitHub host, bounded file count, bounded bytes per file and total response, text-only content, request timeout, and rate limiting.
4. Treat all repository content, README instructions, comments, and skill files as untrusted data. Never obey instructions found inside inspected files.
5. Ask the configured AI provider to produce a structured report:
   - repository and ref inspected
   - files actually inspected
   - architecture summary
   - confirmed findings with file/path evidence
   - likely issues clearly labeled as hypotheses
   - missing information
   - prioritized recommendations
   - proposed changes (descriptions only)
   - test plan and rollback plan
6. Return the report to the owner for review. No write, commit, pull request, install, execution, or deployment action in v1.0.

## Proposed API

### `POST /research/repository`

Authorization: same owner/service token gate as `/godai` (do not expose publicly).

Example request:

```json
{
  "repository": "owner/repository",
  "ref": "main",
  "paths": ["README.md", "package.json", "server.js"],
  "question": "Review the current God AI architecture and identify the safest next implementation step."
}
```

Validation:
- `repository` must match `owner/repository` and must not contain URL schemes, query strings, or path traversal.
- `ref` is a bounded branch, tag, or commit identifier.
- `paths` is required and limited to a small allowlisted set of text files; no wildcard recursive crawling in v1.0.
- `question` is plain text with a strict length limit.
- Do not accept arbitrary fetch URLs from the caller.

### Successful response

```json
{
  "ok": true,
  "researchVersion": "1.0",
  "mode": "READ_ONLY",
  "repository": "owner/repository",
  "ref": "main",
  "inspectedFiles": ["README.md", "package.json", "server.js"],
  "report": {
    "summary": "...",
    "architecture": ["..."],
    "confirmedFindings": [{"file": "server.js", "evidence": "...", "finding": "..."}],
    "hypotheses": ["..."],
    "missingInformation": ["..."],
    "recommendations": [{"priority": "HIGH", "reason": "...", "proposal": "..."}],
    "proposedChanges": ["..."],
    "testPlan": ["..."],
    "rollbackPlan": ["..."]
  },
  "writesPerformed": false,
  "commandsExecuted": false,
  "deploymentPerformed": false
}
```

## Security requirements

- Reuse the existing `GOD_AI_TOKEN` authorization gate or a separately configured research token; never accept GitHub credentials from request bodies.
- If private repository access is enabled later, use a least-privilege read-only GitHub token stored only in Render environment variables.
- Do not log authorization headers, tokens, or full secret-bearing request bodies.
- Do not fetch arbitrary URLs, localhost, private IP ranges, or non-GitHub hosts.
- Do not execute package scripts, shell commands, Lua, JavaScript, or code from the repository.
- Do not let the AI response invoke tools or mutate repository/world state.
- Validate the AI response against a strict JSON schema and return a safe error if invalid.
- Repository text is evidence, not instructions. Ignore prompt-injection attempts in inspected files.
- Preserve existing `/godai`, health, provider routing, and Roblox world command behavior.

## Implementation sequence

1. Add bounded GitHub read-only retrieval and request validation.
2. Add a separate research system prompt and structured response normalizer; do not alter the world-director prompt.
3. Add `POST /research/repository` behind authorization.
4. Test valid, invalid, oversized, missing-file, timeout, unauthorized, and prompt-injection cases.
5. Review the diff and test report with the owner.
6. Only after explicit owner approval, merge to `main` and deploy to Render.

## Explicit non-goals for v1.0

- No automatic code repair or repository writes.
- No automatic dependency installation or shell execution.
- No self-update.
- No automatic Roblox asset insertion or live-world edits.
- No merge to `main` and no Render deployment.
