const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GOD_AI_TOKEN = process.env.GOD_AI_TOKEN;

const MODEL = "openrouter/free";

app.use(express.json({ limit: "256kb" }));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
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

app.get("/", (req, res) => {
    res.json({
        online: true,
        system: "Project Perfect World",
        godAI: "ONLINE",
        externalBrain: OPENROUTER_API_KEY
            ? "CONNECTED"
            : "DISCONNECTED",
        serverVersion: "4.1"
    });
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        system: "Project Perfect World",
        godAI: "ONLINE",
        externalBrain: OPENROUTER_API_KEY
            ? "CONNECTED"
            : "DISCONNECTED",
        serverVersion: "4.1",
        architecture: "Multi-Server World Director"
    });
});

function authenticate(req, res) {
    if (!GOD_AI_TOKEN) {
        res.status(500).json({
            error: "GOD_AI_TOKEN is not configured on Render."
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
            error: "Invalid God AI token."
        });

        return false;
    }

    return true;
}

const MASTER_PROMPT = `
You are GOD AI, the World Director of Project Perfect World.

You are the reasoning brain of a persistent Roblox virtual world.

Your responsibilities:

1. Observe the current world.
2. Understand what the world needs.
3. Prioritize improvements.
4. Plan safe changes.
5. Maintain NPCs.
6. Expand locations.
7. Create buildings.
8. Create roads.
9. Create quests.
10. Create events.
11. Manage weather.
12. Assign NPC jobs.
13. Assign NPC goals.
14. Keep the world alive.
15. Avoid unnecessary duplication.

IMPORTANT:

You DO NOT write Lua.
You DO NOT return Roblox Lua.
You DO NOT execute arbitrary code.

Return ONLY valid JSON.

Roblox validates and executes your commands.

ALLOWED COMMANDS:

CREATE_NPC
CREATE_LOCATION
CREATE_BUILDING
CREATE_ROAD
CREATE_QUEST
CREATE_EVENT
SET_WEATHER
SET_NPC_GOAL
ASSIGN_JOB
WORLD_MAINTENANCE

WORLD RULES:

- Build gradually.
- Do not duplicate existing locations.
- Do not duplicate existing buildings.
- Do not duplicate existing roads.
- Do not duplicate NPCs unnecessarily.
- If the world is empty, create a small starter settlement.
- Prefer 1 to 8 useful actions.
- Keep coordinates organized.
- NPCs should have meaningful jobs and goals.
- Never destroy the entire world unnecessarily.
- Never output Lua.
- Never output Markdown.

If the world is empty:
create a starter settlement.

If the world has locations but lacks infrastructure:
create roads and buildings.

If the world has infrastructure but few NPCs:
create useful NPCs.

If NPCs exist but have little activity:
create quests or events.

If the world is healthy:
perform maintenance or one useful improvement.

Return exactly:

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

Return ONLY JSON.
`;

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

    const response = await fetch(
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

            body: JSON.stringify(requestBody)
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
        data = JSON.parse(rawText);
    } catch (error) {
        throw new Error(
            "OpenRouter returned invalid JSON."
        );
    }

    const message =
        data.choices &&
        data.choices[0] &&
        data.choices[0].message;

    if (
        !message ||
        typeof message.content !== "string"
    ) {
        throw new Error(
            "OpenRouter returned no AI message."
        );
    }

    let content =
        message.content.trim();

    if (content.startsWith("```")) {
        content = content
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
    }

    try {
        return JSON.parse(content);
    } catch (error) {
        throw new Error(
            "AI returned invalid decision JSON."
        );
    }
}

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

    const priority =
        String(
            decision.priority || ""
        ).toUpperCase();

    if (
        ![
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
        ].includes(priority)
    ) {
        decision.priority =
            "MEDIUM";
    } else {
        decision.priority =
            priority;
    }

    if (
        typeof decision.reasoning !==
        "string"
    ) {
        decision.reasoning =
            "Maintain and improve the world.";
    }

    if (
        !Array.isArray(
            decision.actions
        )
    ) {
        decision.actions = [];
    }

    const validActions = [];

    for (
        const action of
        decision.actions.slice(0, 8)
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
            typeof parameters !==
            "object"
        ) {
            parameters = {};
        }

        validActions.push({
            command: command,
            parameters: parameters
        });
    }

    decision.actions =
        validActions;

    return data;
}

app.post("/godai", async (req, res) => {
    if (!authenticate(req, res)) {
        return;
    }

    try {
        const world =
            req.body &&
            (
                req.body.world ||
                req.body
            );

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

        return res.json(
            validated
        );

    } catch (error) {
        console.error(
            "[GOD AI] ERROR:",
            error.message
        );

        return res.status(500).json({
            error:
                "God AI request failed.",

            message:
                error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(
        "================================"
    );

    console.log(
        "PROJECT PERFECT WORLD"
    );

    console.log(
        "GOD AI SERVER v4.1"
    );

    console.log(
        "================================"
    );

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

    console.log(
        "================================"
    );
});
