const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const GOD_AI_TOKEN = process.env.GOD_AI_TOKEN || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const OPENROUTER_URL =
    "https://openrouter.ai/api/v1/chat/completions";

const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models";

const SERVER_VERSION = "6.0";

const MAX_ACTIONS = 8;
const PROVIDER_COOLDOWN_MS = 30 * 60 * 1000;

/*
============================================================
 PROJECT PERFECT WORLD
 GOD AI SERVER v6.0
 TRUE MULTI-PROVIDER AI ROUTER
============================================================
*/

const state = {
    startedAt: Date.now(),

    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    fallbackCount: 0,

    activeProvider: null,
    activeModel: null,

    lastSuccessfulProvider: null,
    lastSuccessfulModel: null,

    lastError: null,

    providers: {
        openrouter: {
            configured: !!OPENROUTER_API_KEY,
            cooldownUntil: 0,
            successes: 0,
            failures: 0
        },

        gemini: {
            configured: !!GEMINI_API_KEY,
            cooldownUntil: 0,
            successes: 0,
            failures: 0
        }
    }
};

/*
============================================================
 AUTH
============================================================
*/

function isAuthorized(req) {
    if (!GOD_AI_TOKEN) {
        return false;
    }

    const headerToken =
        req.headers["x-god-ai-token"];

    const authorization =
        req.headers.authorization || "";

    const bearer =
        authorization.startsWith("Bearer ")
            ? authorization.substring(7)
            : "";

    return (
        headerToken === GOD_AI_TOKEN ||
        bearer === GOD_AI_TOKEN
    );
}

/*
============================================================
 PROVIDER HELPERS
============================================================
*/

function isCoolingDown(provider) {
    return state.providers[provider].cooldownUntil > Date.now();
}

function cooldownSeconds(provider) {
    const remaining =
        state.providers[provider].cooldownUntil - Date.now();

    return Math.max(0, Math.ceil(remaining / 1000));
}

function setCooldown(provider, ms = PROVIDER_COOLDOWN_MS) {
    state.providers[provider].cooldownUntil =
        Date.now() + ms;
}

function clearCooldown(provider) {
    state.providers[provider].cooldownUntil = 0;
}

function markSuccess(provider, model) {
    state.providers[provider].successes++;

    clearCooldown(provider);

    state.activeProvider = provider;
    state.activeModel = model;

    state.lastSuccessfulProvider = provider;
    state.lastSuccessfulModel = model;

    state.lastError = null;

    state.successfulRequests++;
}

function markFailure(provider, error) {
    state.providers[provider].failures++;

    state.lastError = error;

    /*
    Only temporarily cooldown providers that are
    clearly unavailable/rate-limited.
    */
    if (
        error &&
        (
            error.status === 429 ||
            error.status === 503 ||
            error.status === 502 ||
            error.status === 500
        )
    ) {
        setCooldown(provider);
    }
}

/*
============================================================
 GOD AI SYSTEM PROMPT
============================================================
*/

const GOD_AI_SYSTEM = `
You are God AI, the World Director of Project Perfect World.

You are NOT allowed to generate arbitrary Lua code.
You are NOT allowed to generate executable code.
You are NOT allowed to use loadstring.
You are NOT allowed to request remote code execution.

Your job is to reason about the persistent Roblox world and
return safe structured world-management commands.

WORLD LOOP:

OBSERVE
UNDERSTAND
PRIORITIZE
PLAN
BUILD
TEST
MONITOR
REPAIR
REMEMBER
IMPROVE
EXPAND

You may only use these command types:

CREATE_LOCATION
CREATE_BUILDING
CREATE_ROAD
CREATE_NPC
SET_WEATHER
SET_NPC_GOAL
ASSIGN_JOB
WORLD_MAINTENANCE

Return ONLY valid JSON.

Required format:

{
  "summary": "short explanation",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL",
  "goal": "current world goal",
  "actions": [
    {
      "type": "COMMAND_TYPE",
      "id": "stable_unique_id",
      "name": "name",
      "description": "description",
      "x": 0,
      "y": 0,
      "z": 0
    }
  ]
}

Maximum 8 actions.

Prefer small safe incremental changes.

Never duplicate existing objects.

If the world is empty, begin with foundational civilization
elements such as a settlement, basic buildings, roads and
initial NPC population.

The world should evolve gradually from Stone Age toward later
eras only when population, technology and infrastructure
justify it.

God AI is the director. Roblox is the authoritative executor.
`;

/*
============================================================
 WORLD STATE COMPACTION
============================================================
*/

function compactWorld(world) {
    if (!world || typeof world !== "object") {
        return {
            day: 1,
            time: 360,
            season: "Spring",
            era: "Stone Age",
            weather: "Clear",
            population: 0,
            players: 0,
            npcs: [],
            locations: [],
            buildings: [],
            roads: []
        };
    }

    function keys(value) {
        if (!value || typeof value !== "object") {
            return [];
        }

        return Object.keys(value).slice(0, 100);
    }

    return {
        version: world.Version || 3,
        day: world.Day || 1,
        time: world.Time || 360,
        season: world.Season || "Spring",
        era: world.Era || "Stone Age",
        weather: world.Weather || "Clear",

        population:
            world.Population || 0,

        players:
            world.Players || 0,

        npcs:
            keys(world.NPCs),

        locations:
            keys(world.Locations),

        buildings:
            keys(world.Buildings),

        roads:
            keys(world.Roads),

        technologies:
            keys(world.Technologies),

        quests:
            keys(world.Quests),

        events:
            keys(world.Events),

        completedActions:
            Array.isArray(world.CompletedActions)
                ? world.CompletedActions.slice(-50)
                : [],

        actionHistory:
            Array.isArray(world.ActionHistory)
                ? world.ActionHistory.slice(-50)
                : []
    };
}

/*
============================================================
 JSON EXTRACTION
============================================================
*/

function extractJSON(text) {
    if (!text || typeof text !== "string") {
        throw new Error("AI returned empty response");
    }

    let cleaned = text.trim();

    if (cleaned.startsWith("```")) {
        cleaned = cleaned
            .replace(/^```json/i, "")
            .replace(/^```/i, "")
            .replace(/```$/i, "")
            .trim();
    }

    try {
        return JSON.parse(cleaned);
    } catch (firstError) {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");

        if (start >= 0 && end > start) {
            return JSON.parse(
                cleaned.substring(start, end + 1)
            );
        }

        throw firstError;
    }
}

/*
============================================================
 COMMAND VALIDATION
============================================================
*/

const ALLOWED_COMMANDS = new Set([
    "CREATE_LOCATION",
    "CREATE_BUILDING",
    "CREATE_ROAD",
    "CREATE_NPC",
    "SET_WEATHER",
    "SET_NPC_GOAL",
    "ASSIGN_JOB",
    "WORLD_MAINTENANCE"
]);

function normalizeDecision(raw) {
    const decision = {
        summary:
            typeof raw.summary === "string"
                ? raw.summary.substring(0, 500)
                : "God AI world decision.",

        priority:
            typeof raw.priority === "string"
                ? raw.priority.toUpperCase()
                : "MEDIUM",

        goal:
            typeof raw.goal === "string"
                ? raw.goal.substring(0, 300)
                : "Improve the world.",

        actions: []
    };

    const inputActions =
        Array.isArray(raw.actions)
            ? raw.actions
            : [];

    for (
        let i = 0;
        i < Math.min(inputActions.length, MAX_ACTIONS);
        i++
    ) {
        const action = inputActions[i];

        if (!action || typeof action !== "object") {
            continue;
        }

        const type =
            typeof action.type === "string"
                ? action.type.toUpperCase()
                : "";

        if (!ALLOWED_COMMANDS.has(type)) {
            continue;
        }

        const safe = {
            type,

            id:
                typeof action.id === "string"
                    ? action.id.substring(0, 100)
                    : `${type}_${Date.now()}_${i}`,

            name:
                typeof action.name === "string"
                    ? action.name.substring(0, 150)
                    : "God AI Object",

            description:
                typeof action.description === "string"
                    ? action.description.substring(0, 500)
                    : "",

            x: Number(action.x) || 0,
            y: Number(action.y) || 0,
            z: Number(action.z) || 0
        };

        for (const key of [
            "location",
            "locationType",
            "buildingType",
            "npcType",
            "job",
            "goal",
            "weather",
            "roadType",
            "target"
        ]) {
            if (typeof action[key] === "string") {
                safe[key] =
                    action[key].substring(0, 150);
            }
        }

        decision.actions.push(safe);
    }

    return decision;
}

/*
============================================================
 OPENROUTER
============================================================
*/

async function callOpenRouter(world) {
    const models = [];

    models.push("openrouter/free");

    const fallbackModels =
        (process.env.OPENROUTER_FALLBACK_MODELS || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

    for (const model of fallbackModels) {
        if (!models.includes(model)) {
            models.push(model);
        }
    }

    let lastError = null;

    for (const model of models) {
        console.log(
            `[AI ROUTER] TRY openrouter/${model}`
        );

        try {
            const response =
                await fetch(OPENROUTER_URL, {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${OPENROUTER_API_KEY}`,

                        "Content-Type":
                            "application/json",

                        "HTTP-Referer":
                            "https://project-perfect-world-ai.onrender.com",

                        "X-Title":
                            "Project Perfect World God AI"
                    },

                    body: JSON.stringify({
                        model,

                        messages: [
                            {
                                role: "system",
                                content: GOD_AI_SYSTEM
                            },
                            {
                                role: "user",
                                content:
                                    JSON.stringify({
                                        world:
                                            compactWorld(world)
                                    })
                            }
                        ],

                        max_tokens: 1800
                    })
                });

            const text =
                await response.text();

            if (!response.ok) {
                const error = new Error(
                    `OpenRouter HTTP ${response.status}: ${text.substring(0, 500)}`
                );

                error.status =
                    response.status;

                throw error;
            }

            const data =
                JSON.parse(text);

            const content =
                data?.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error(
                    "OpenRouter returned no content."
                );
            }

            const json =
                extractJSON(content);

            console.log(
                `[AI ROUTER] SUCCESS openrouter/${model}`
            );

            return {
                provider: "OpenRouter",
                providerId: "openrouter",
                model,
                decision: normalizeDecision(json)
            };

        } catch (error) {
            lastError = error;

            console.log(
                `[AI ROUTER] FAIL openrouter/${model}:`,
                error.message
            );
        }
    }

    throw lastError ||
        new Error("OpenRouter unavailable.");
}

/*
============================================================
 GEMINI
============================================================
*/

async function callGemini(world) {
    /*
    We use the current Gemini 3.5 Flash-Lite family here.
    Google documents generateContent through this endpoint.
    */

    const models = [];

    const configuredModels =
        (process.env.GEMINI_MODELS || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

    if (configuredModels.length > 0) {
        models.push(...configuredModels);
    } else {
        models.push("gemini-3.5-flash-lite");
    }

    let lastError = null;

    for (const model of models) {
        console.log(
            `[AI ROUTER] TRY gemini/${model}`
        );

        try {
            const response =
                await fetch(
                    `${GEMINI_URL}/${model}:generateContent`,
                    {
                        method: "POST",

                        headers: {
                            "x-goog-api-key":
                                GEMINI_API_KEY,

                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            systemInstruction: {
                                parts: [
                                    {
                                        text:
                                            GOD_AI_SYSTEM
                                    }
                                ]
                            },

                            contents: [
                                {
                                    role: "user",

                                    parts: [
                                        {
                                            text:
                                                JSON.stringify({
                                                    world:
                                                        compactWorld(world)
                                                })
                                        }
                                    ]
                                }
                            ],

                            generationConfig: {
                                responseMimeType:
                                    "application/json",

                                maxOutputTokens:
                                    1800
                            }
                        })
                    }
                );

            const text =
                await response.text();

            if (!response.ok) {
                const error = new Error(
                    `Gemini HTTP ${response.status}: ${text.substring(0, 500)}`
                );

                error.status =
                    response.status;

                throw error;
            }

            const data =
                JSON.parse(text);

            const content =
                data?.candidates?.[0]
                    ?.content
                    ?.parts
                    ?.map(part => part.text || "")
                    .join("")
                    .trim();

            if (!content) {
                throw new Error(
                    "Gemini returned no content."
                );
            }

            const json =
                extractJSON(content);

            console.log(
                `[AI ROUTER] SUCCESS gemini/${model}`
            );

            return {
                provider: "Google Gemini",
                providerId: "gemini",
                model,
                decision: normalizeDecision(json)
            };

        } catch (error) {
            lastError = error;

            console.log(
                `[AI ROUTER] FAIL gemini/${model}:`,
                error.message
            );
        }
    }

    throw lastError ||
        new Error("Gemini unavailable.");
}

/*
============================================================
 PROVIDER ROUTER
============================================================
*/

async function askGodAI(world) {
    const providers = [];

    if (
        state.providers.openrouter.configured &&
        !isCoolingDown("openrouter")
    ) {
        providers.push("openrouter");
    }

    if (
        state.providers.gemini.configured &&
        !isCoolingDown("gemini")
    ) {
        providers.push("gemini");
    }

    if (providers.length === 0) {
        const error = new Error(
            "All configured AI providers are currently unavailable."
        );

        error.code = "ALL_PROVIDERS_COOLDOWN";

        throw error;
    }

    let lastError = null;

    for (let i = 0; i < providers.length; i++) {
        const provider =
            providers[i];

        if (i > 0) {
            state.fallbackCount++;

            console.log(
                `[AI ROUTER] FALLBACK → ${provider}`
            );
        }

        try {
            let result;

            if (provider === "openrouter") {
                result =
                    await callOpenRouter(world);
            }

            if (provider === "gemini") {
                result =
                    await callGemini(world);
            }

            if (!result) {
                throw new Error(
                    `Unknown provider: ${provider}`
                );
            }

            markSuccess(
                provider,
                result.model
            );

            return result;

        } catch (error) {
            lastError = error;

            markFailure(
                provider,
                error
            );

            console.log(
                `[AI ROUTER] PROVIDER FAILED ${provider}: ${error.message}`
            );
        }
    }

    throw lastError ||
        new Error(
            "All configured AI providers are currently unavailable."
        );
}

/*
============================================================
 ROOT
============================================================
*/

app.get("/", (req, res) => {
    res.json({
        ok: true,
        project: "Project Perfect World",
        serverVersion: SERVER_VERSION,
        service: "God AI Multi-Provider Gateway",
        status: "ONLINE"
    });
});

/*
============================================================
 HEALTH
============================================================
*/

app.get("/health", (req, res) => {
    res.json({
        status: "ONLINE",

        serverVersion:
            SERVER_VERSION,

        godAI: true,

        router: "READY",

        providers: {
            openrouter: {
                configured:
                    state.providers.openrouter.configured,

                cooldownRemainingSeconds:
                    cooldownSeconds("openrouter"),

                successes:
                    state.providers.openrouter.successes,

                failures:
                    state.providers.openrouter.failures
            },

            gemini: {
                configured:
                    state.providers.gemini.configured,

                cooldownRemainingSeconds:
                    cooldownSeconds("gemini"),

                successes:
                    state.providers.gemini.successes,

                failures:
                    state.providers.gemini.failures
            }
        },

        activeProvider:
            state.activeProvider,

        activeModel:
            state.activeModel,

        lastSuccessfulProvider:
            state.lastSuccessfulProvider,

        lastSuccessfulModel:
            state.lastSuccessfulModel,

        totalRequests:
            state.totalRequests,

        successfulRequests:
            state.successfulRequests,

        failedRequests:
            state.failedRequests,

        fallbackCount:
            state.fallbackCount,

        lastError:
            state.lastError,

        uptimeSeconds:
            Math.floor(
                (Date.now() -
                    state.startedAt) / 1000
            ),

        time:
            new Date().toISOString()
    });
});

/*
============================================================
 GOD AI
============================================================
*/

app.post("/godai", async (req, res) => {
    if (!isAuthorized(req)) {
        return res.status(401).json({
            ok: false,
            error: "Unauthorized"
        });
    }

    state.totalRequests++;

    const world =
        req.body?.world ||
        req.body?.worldState ||
        {};

    console.log(
        "==============================================="
    );

    console.log(
        "[GOD AI] NEW REQUEST"
    );

    console.log(
        "[GOD AI] World:",
        world?.Day || 1,
        world?.Era || "Stone Age"
    );

    try {
        const result =
            await askGodAI(world);

        console.log(
            `[GOD AI] SUCCESS ${result.provider} / ${result.model}`
        );

        return res.status(200).json({
            ok: true,

            serverVersion:
                SERVER_VERSION,

            routerStatus:
                "READY",

            provider:
                result.provider,

            providerId:
                result.providerId,

            model:
                result.model,

            decision:
                result.decision,

            fallbackUsed:
                state.fallbackCount > 0,

            retryable:
                false
        });

    } catch (error) {
        state.failedRequests++;

        console.log(
            "[GOD AI] ALL PROVIDERS FAILED:",
            error.message
        );

        return res.status(503).json({
            ok: false,

            serverVersion:
                SERVER_VERSION,

            routerStatus:
                "UNAVAILABLE",

            error:
                error.message,

            retryable:
                true,

            activeProvider:
                state.activeProvider,

            activeModel:
                state.activeModel,

            providers: {
                openrouterCooldown:
                    cooldownSeconds("openrouter"),

                geminiCooldown:
                    cooldownSeconds("gemini")
            }
        });
    }
});

/*
============================================================
 START SERVER
============================================================
*/

app.listen(PORT, () => {
    console.log(
        "================================================"
    );

    console.log(
        "PROJECT PERFECT WORLD"
    );

    console.log(
        "GOD AI SERVER v6.0"
    );

    console.log(
        "TRUE MULTI-PROVIDER AI ROUTER"
    );

    console.log(
        "================================================"
    );

    console.log(
        "Port:",
        PORT
    );

    console.log(
        "OpenRouter configured:",
        !!OPENROUTER_API_KEY
    );

    console.log(
        "Gemini configured:",
        !!GEMINI_API_KEY
    );

    console.log(
        "God AI token configured:",
        !!GOD_AI_TOKEN
    );

    console.log(
        "OpenRouter model:",
        "openrouter/free"
    );

    console.log(
        "Gemini model:",
        process.env.GEMINI_MODELS ||
            "gemini-3.5-flash-lite"
    );

    console.log(
        "God AI endpoint: POST /godai"
    );

    console.log(
        "Health endpoint: GET /health"
    );

    console.log(
        "================================================"
    );
});
