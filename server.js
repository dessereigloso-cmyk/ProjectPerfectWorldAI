
const express = require("express");

const app = express();

app.use(express.json({ limit: "256kb" }));

// ============================================================
// CONFIG
// ============================================================

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY =
    process.env.OPENROUTER_API_KEY;

const GOD_AI_TOKEN =
    process.env.GOD_AI_TOKEN;

const MODEL = "openrouter/free";

// ============================================================
// CORS
// ============================================================

app.use((req, res, next) => {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, x-god-ai-token"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// ============================================================
// BASIC ROUTES
// ============================================================

app.get("/", (req, res) => {

    res.json({
        online: true,
        system: "Project Perfect World",
        godAI: "ONLINE",
        externalBrain: "CONNECTED",
        serverVersion: "4.0"
    });

});

app.get("/health", (req, res) => {

    res.json({

        online: true,

        system:
            "Project Perfect World",

        godAI:
            "ONLINE",

        externalBrain:
            OPENROUTER_API_KEY
                ? "CONNECTED"
                : "DISCONNECTED",

        serverVersion:
            "4.0",

        architecture:
            "Multi-Server World Director"

    });

});

// ============================================================
// AUTHENTICATION
// ============================================================

function authenticate(req, res) {

    if (!GOD_AI_TOKEN) {

        res.status(500).json({
            error:
                "GOD_AI_TOKEN is not configured on Render."
        });

        return false;
    }

    const suppliedToken =
        req.headers["x-god-ai-token"];

    if (
        !suppliedToken ||
        suppliedToken !== GOD_AI_TOKEN
    ) {

        res.status(401).json({
            error:
                "Invalid God AI token."
        });

        return false;
    }

    return true;
}

// ============================================================
// GOD AI MASTER PROMPT
// ============================================================

const MASTER_PROMPT = `
You are GOD AI, the World Director of Project Perfect World.

You are the reasoning brain of a persistent Roblox virtual world.

Your responsibilities are:

1. Observe the current world.
2. Understand what the world needs.
3. Prioritize important improvements.
4. Plan safe changes.
5. Create approved world changes through structured commands.
6. Maintain NPCs.
7. Expand locations.
8. Create buildings and roads.
9. Create quests and events.
10. Manage weather.
11. Give NPCs jobs and goals.
12. Maintain a living world.
13. Avoid unnecessary duplication.
14. Prefer incremental world expansion.
15. Never destroy or replace the entire world unnecessarily.

IMPORTANT ARCHITECTURE:

You DO NOT write Lua code.

You DO NOT return Roblox Lua.

You DO NOT use arbitrary code execution.

You return ONLY structured JSON.

Roblox validates and executes your commands.

AVAILABLE COMMANDS:

CREATE_NPC

Parameters:
{
  "name": "NPC name",
  "job": "Citizen/Farmer/Merchant/Guard/etc",
  "goal": "NPC goal",
  "location": "Location name",
  "x": 0,
  "y": 5,
  "z": 0,
  "userId": 0
}

CREATE_LOCATION

Parameters:
{
  "name": "Location name",
  "locationType": "Village/Town/Farm/etc",
  "description": "Description",
  "x": 0,
  "y": 0,
  "z": 0
}

CREATE_BUILDING

Parameters:
{
  "name": "Building name",
  "buildingType": "House/Shop/Farm/Hall/etc",
  "x": 0,
  "y": 0,
  "z": 0
}

CREATE_ROAD

Parameters:
{
  "name": "Road name",
  "x": 0,
  "y": 0,
  "z": 0,
  "length": 100,
  "width": 8
}

CREATE_QUEST

Parameters:
{
  "name": "Quest name",
  "description": "Quest description",
  "reward": "Reward"
}

CREATE_EVENT

Parameters:
{
  "name": "Event name",
  "description": "Event description"
}

SET_WEATHER

Parameters:
{
  "weather": "Clear/Rain/Storm/etc"
}

SET_NPC_GOAL

Parameters:
{
  "name": "Existing NPC",
  "goal": "New goal"
}

ASSIGN_JOB

Parameters:
{
  "name": "Existing NPC",
  "job": "New job"
}

WORLD_MAINTENANCE

Parameters:
{}

WORLD BUILDING RULES:

- Build gradually.
- Do not create duplicates.
- If the world already has a location, do not recreate it.
- If there are no meaningful locations, begin with a starter settlement.
- A starter settlement may contain:
  - one main location
  - several roads
  - several buildings
  - several NPCs
  - at least one useful quest
- Keep coordinates organized around the existing world.
- Do not create enormous structures.
- Do not spam hundreds of commands in one decision.
- Prefer 1 to 8 useful actions per decision.
- NPC names must be unique.
- Building names must be unique.
- Location names must be unique.
- Roads must be unique.
- Think like a world administrator, not a random generator.

NPC DESIGN:

NPCs should have meaningful jobs and goals.

Examples:

Farmer:
goal = "Grow food and support the village."

Merchant:
goal = "Trade useful goods with players and NPCs."

Guard:
goal = "Protect the settlement."

Builder:
goal = "Help maintain and expand the settlement."

Citizen:
goal = "Live and participate in the community."

WORLD DIRECTOR BEHAVIOR:

If the world is empty:
create a small starter settlement.

If the world has a settlement but lacks infrastructure:
add roads and buildings.

If the world has infrastructure but few NPCs:
create useful NPCs.

If the world has NPCs but no activities:
create quests or events.

If the world is already healthy:
perform maintenance or make one useful improvement.

Never output Lua.

Return ONLY valid JSON using exactly this structure:

{
  "decision": {
    "goal": "short goal",
    "priority": "LOW/MEDIUM/HIGH/CRITICAL",
    "reasoning": "short explanation",
    "actions": [
      {
        "command": "COMMAND_NAME",
        "parameters": {}
      }
    ]
  }
}

Do not include Markdown.

Do not include code fences.

Do not include text outside the JSON.
`;

// ============================================================
// OPENROUTER REQUEST
// ============================================================

async function askExternalBrain(world) {

    if (!OPENROUTER_API_KEY) {

        throw new Error(
            "OPENROUTER_API_KEY is missing."
        );

    }

    const requestBody = {

        model: MODEL,

        messages: [

            {
                role: "system",
                content: MASTER_PROMPT
            },

            {
                role: "user",
                content:
                    "Current world state:\n" +
                    JSON.stringify(
                        world,
                        null,
                        2
                    )
            }

        ],

        temperature: 0.3,

        response_format: {
            type: "json_object"
        }

    };

    const response =
        await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {

                method: "POST",

                headers: {

                    "Authorization":
                        `Bearer ${OPENROUTER_API_KEY}`,

                    "Content-Type":
                        "application/json",

                    "HTTP-Referer":
                        "https://project-perfect-world-ai.onrender.com",

                    "X-Title":
                        "Project Perfect World"

                },

                body:
                    JSON.stringify(
                        requestBody
                    )

            }
        );

    const rawText =
        await response.text();

    if (!response.ok) {

        throw new Error(
            `OpenRouter ${response.status}: ${rawText}`
        );

    }

    let data;

    try {

        data =
            JSON.parse(rawText);

    } catch (error) {

        throw new Error(
            "OpenRouter returned invalid JSON."
        );

    }

    if (
        !data.choices ||
        !data.choices[0] ||
        !data.choices[0].message
    ) {

        throw new Error(
            "OpenRouter returned no AI message."
        );

    }

    let content =
        data.choices[0].message.content;

    if (typeof content !== "string") {

        throw new Error(
            "AI response content is not text."
        );

    }

    content =
        content.trim();

    // Remove accidental markdown fences
    if (content.startsWith("```")) {

        content =
            content
                .replace(/^```json/i, "")
                .replace(/^```/i, "")
                .replace(/```$/i, "")
                .trim();

    }

    let parsed;

    try {

        parsed =
            JSON.parse(content);

    } catch (error) {

        throw new Error(
            "AI returned invalid decision JSON: " +
            content
        );

    }

    return parsed;
}

// ============================================================
// VALID COMMANDS
// ============================================================

const ALLOWED_COMMANDS = new Set([

    "CREATE_NPC",

    "CREATE_LOCATION",

    "CREATE_BUILDING",

    "CREATE_ROAD",

    "CREATE_QUEST",

    "CREATE_EVENT",

    "SET_WEATHER",

    "SET_NPC_GOAL",

    "ASSIGN_JOB",

    "WORLD_MAINTENANCE"

]);

// ============================================================
// VALIDATE DECISION
// ============================================================

function validateDecision(data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        throw new Error(
            "Decision is not an object."
        );
    }

    if (
        !data.decision ||
        typeof data.decision !== "object"
    ) {
        throw new Error(
            "Missing decision object."
        );
    }

    const decision =
        data.decision;

    if (
        typeof decision.goal !== "string"
    ) {
        decision.goal =
            "Maintain the world";
    }

    if (
        typeof decision.priority !== "string"
    ) {
        decision.priority =
            "MEDIUM";
    }

    if (
        typeof decision.reasoning !== "string"
    ) {
        decision.reasoning =
            "Maintain and improve the world.";
    }

    if (
        !Array.isArray(decision.actions)
    ) {

        decision.actions = [];

    }

    // Safety limit
    decision.actions =
        decision.actions.slice(0, 8);

    const validActions = [];

    for (
        const action
        of decision.actions
    ) {

        if (
            !action ||
            typeof action !== "object"
        ) {
            continue;
        }

        const command =
            String(
                action.command || ""
            ).toUpperCase();

        if (
            !ALLOWED_COMMANDS.has(
                command
            )
        ) {
            continue;
        }

        let parameters =
            action.parameters;

        if (
            !parameters ||
            typeof parameters !== "object"
        ) {
            parameters = {};
        }

        validActions.push({

            command,

            parameters

        });

    }

    decision.actions =
        validActions;

    return data;
}

// ============================================================
// GOD AI ENDPOINT
// ============================================================

app.post("/godai", async (req, res) => {

    try {

        if (!authenticate(req, res)) {
            return;
        }

        const world =
            req.body.world ||
            req.body;

        if (
            !world ||
            typeof world !== "object"
        ) {

            return res.status(400).json({

                error:
                    "World state is required."

            });

        }

        console.log(
            "[GOD AI] World received."
        );

        const decision =
            await askExternalBrain(
                world
            );

        const validated =
            validateDecision(
                decision
            );

        console.log(
            "[GOD AI] Goal:",
            validated.decision.goal
        );

        console.log(
            "[GOD AI] Actions:",
            validated.decision.actions.length
        );

        res.json(validated);

    } catch (error) {

        console.error(
            "[GOD AI] ERROR:",
            error.message
        );

        res.status(500).json({

            error:
                "God AI request failed.",

            message:
                error.message

        });

    }

});

// ============================================================
// SERVER
// ============================================================

app.listen(PORT, () => {

    console.log("================================");
    console.log("PROJECT PERFECT WORLD");
    console.log("GOD AI SERVER v4");
    console.log("================================");
    console.log(
        "Port:",
        PORT
    );
    console.log(
        "OpenRouter:",
        OPENROUTER_API_KEY
            ? "CONFIGURED"
            : "MISSING"
    );
    console.log(
        "God AI Token:",
        GOD_AI_TOKEN
            ? "CONFIGURED"
            : "MISSING"
    );
    console.log("================================");

});
