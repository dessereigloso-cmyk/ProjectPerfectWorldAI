const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

/*
===========================================================
PROJECT PERFECT WORLD
GOD AI SERVER v5.0
MULTI-MODEL AI GATEWAY
===========================================================

ROBLOX
   ↓
/godai
   ↓
AI ROUTER
   ↓
OpenRouter primary/fallback
   ↓
Structured God AI decision
   ↓
Roblox GodAI_Executor
===========================================================
*/

// =========================================================
// CONFIGURATION
// =========================================================

const SERVER_VERSION = "5.0";

const GOD_AI_TOKEN = process.env.GOD_AI_TOKEN || "";

const OPENROUTER_API_KEY =
    process.env.OPENROUTER_API_KEY || "";

const OPENROUTER_URL =
    "https://openrouter.ai/api/v1/chat/completions";

/*
OpenRouter can receive multiple models in priority order.

We keep openrouter/free first because that is the setup
we were already using.

Additional model names can be supplied through:

OPENROUTER_FALLBACK_MODELS

Example:

openrouter/free,google/gemini-2.0-flash-exp:free,another/model:free

IMPORTANT:
Only use models that are actually available to your account.
*/

const DEFAULT_MODELS = [
    "openrouter/free"
];

const configuredFallbackModels =
    (process.env.OPENROUTER_FALLBACK_MODELS || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

const MODEL_CHAIN = [
    ...DEFAULT_MODELS,
    ...configuredFallbackModels
].filter(
    (model, index, array) =>
        array.indexOf(model) === index
);

// =========================================================
// AI ROUTER STATE
// =========================================================

const AI_STATE = {
    status: "READY",

    activeModel: null,

    lastSuccessfulModel: null,

    lastProvider: "OpenRouter",

    lastRequestAt: null,

    lastSuccessAt: null,

    lastFailureAt: null,

    totalRequests: 0,

    successfulRequests: 0,

    failedRequests: 0,

    fallbackCount: 0,

    cooldownUntil: 0,

    lastError: null,

    modelHealth: {}
};

// =========================================================
// MODEL HEALTH
// =========================================================

function getModelHealth(model) {

    if (!AI_STATE.modelHealth[model]) {

        AI_STATE.modelHealth[model] = {
            status: "READY",
            failures: 0,
            successes: 0,
            cooldownUntil: 0,
            lastError: null,
            lastSuccessAt: null,
            lastFailureAt: null
        };
    }

    return AI_STATE.modelHealth[model];
}

function setModelFailure(model, errorMessage, cooldownSeconds) {

    const health = getModelHealth(model);

    health.status = "COOLDOWN";

    health.failures += 1;

    health.lastError = errorMessage;

    health.lastFailureAt = new Date().toISOString();

    health.cooldownUntil =
        Date.now() + (cooldownSeconds * 1000);
}

function setModelSuccess(model) {

    const health = getModelHealth(model);

    health.status = "HEALTHY";

    health.successes += 1;

    health.lastSuccessAt =
        new Date().toISOString();

    health.lastError = null;

    health.cooldownUntil = 0;
}

function isModelAvailable(model) {

    const health = getModelHealth(model);

    return Date.now() >= health.cooldownUntil;
}

// =========================================================
// AUTHENTICATION
// =========================================================

function authenticate(req) {

    if (!GOD_AI_TOKEN) {

        console.warn(
            "[AUTH] GOD_AI_TOKEN is not configured."
        );

        return false;
    }

    const provided =
        req.headers["x-god-ai-token"] ||
        req.headers["authorization"]?.replace(
            /^Bearer\s+/i,
            ""
        );

    return provided === GOD_AI_TOKEN;
}

// =========================================================
// GENERAL HELPERS
// =========================================================

function clampNumber(value, fallback = 0) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return number;
}

function cleanString(value, fallback = "", maxLength = 300) {

    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value)
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .trim()
        .slice(0, maxLength);
}

function normalizeCommandName(command) {

    return cleanString(command)
        .toUpperCase()
        .replace(/\s+/g, "_");
}

// =========================================================
// CANONICAL COMMAND NORMALIZER
// =========================================================

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

function normalizeAction(action) {

    if (!action || typeof action !== "object") {
        return null;
    }

    const command =
        normalizeCommandName(
            action.command ||
            action.type ||
            action.action
        );

    if (!ALLOWED_COMMANDS.has(command)) {
        return null;
    }

    const input =
        action.data ||
        action.parameters ||
        action.args ||
        action;

    const result = {
        command: command,
        id: cleanString(
            input.id ||
            input.ID ||
            "",
            "",
            120
        )
    };

    // -----------------------------------------------------
    // CREATE_LOCATION
    // -----------------------------------------------------

    if (command === "CREATE_LOCATION") {

        result.name =
            cleanString(
                input.name,
                "Unnamed Location",
                120
            );

        result.locationType =
            cleanString(
                input.locationType ||
                input.type ||
                "Settlement",
                "Settlement",
                80
            );

        result.description =
            cleanString(
                input.description,
                "",
                500
            );

        result.x =
            clampNumber(input.x, 0);

        result.y =
            clampNumber(input.y, 0);

        result.z =
            clampNumber(input.z, 0);
    }

    // -----------------------------------------------------
    // CREATE_BUILDING
    // -----------------------------------------------------

    if (command === "CREATE_BUILDING") {

        result.name =
            cleanString(
                input.name,
                "Unnamed Building",
                120
            );

        result.buildingType =
            cleanString(
                input.buildingType ||
                input.type ||
                "House",
                "House",
                80
            );

        result.location =
            cleanString(
                input.location,
                "",
                120
            );

        result.x =
            clampNumber(input.x, 0);

        result.y =
            clampNumber(input.y, 0);

        result.z =
            clampNumber(input.z, 0);
    }

    // -----------------------------------------------------
    // CREATE_ROAD
    // -----------------------------------------------------

    if (command === "CREATE_ROAD") {

        /*
        Canonical format:

        x
        y
        z
        length
        width

        We also accept:

        start = {x,y,z}
        end   = {x,y,z}

        and convert it into canonical values.
        */

        let x =
            clampNumber(input.x, 0);

        let y =
            clampNumber(input.y, 0);

        let z =
            clampNumber(input.z, 0);

        let length =
            clampNumber(input.length, 20);

        let width =
            clampNumber(input.width, 6);

        if (
            input.start &&
            input.end
        ) {

            const sx =
                clampNumber(input.start.x, 0);

            const sy =
                clampNumber(input.start.y, 0);

            const sz =
                clampNumber(input.start.z, 0);

            const ex =
                clampNumber(input.end.x, 0);

            const ey =
                clampNumber(input.end.y, 0);

            const ez =
                clampNumber(input.end.z, 0);

            x = (sx + ex) / 2;

            y = (sy + ey) / 2;

            z = (sz + ez) / 2;

            length =
                Math.sqrt(
                    Math.pow(ex - sx, 2) +
                    Math.pow(ey - sy, 2) +
                    Math.pow(ez - sz, 2)
                );
        }

        result.x = x;
        result.y = y;
        result.z = z;

        result.length =
            Math.max(1, Math.min(length, 500));

        result.width =
            Math.max(1, Math.min(width, 50));
    }

    // -----------------------------------------------------
    // CREATE_NPC
    // -----------------------------------------------------

    if (command === "CREATE_NPC") {

        result.name =
            cleanString(
                input.name,
                "Unnamed NPC",
                80
            );

        result.job =
            cleanString(
                input.job,
                "Worker",
                100
            );

        result.goal =
            cleanString(
                input.goal,
                "Survive and contribute to the settlement.",
                300
            );

        result.location =
            cleanString(
                input.location,
                "",
                120
            );

        result.x =
            clampNumber(input.x, 0);

        result.y =
            clampNumber(input.y, 3);

        result.z =
            clampNumber(input.z, 0);

        /*
        Optional Roblox userId.

        We do NOT require it because ordinary AI NPCs
        do not need a player's UserId.
        */

        if (input.userId !== undefined) {

            const userId =
                Number(input.userId);

            if (
                Number.isInteger(userId) &&
                userId > 0
            ) {

                result.userId = userId;
            }
        }
    }

    // -----------------------------------------------------
    // SET_WEATHER
    // -----------------------------------------------------

    if (command === "SET_WEATHER") {

        result.weather =
            cleanString(
                input.weather ||
                input.value ||
                "Clear",
                "Clear",
                50
            );
    }

    // -----------------------------------------------------
    // SET_NPC_GOAL
    // -----------------------------------------------------

    if (command === "SET_NPC_GOAL") {

        result.npcId =
            cleanString(
                input.npcId ||
                input.id ||
                "",
                "",
                120
            );

        result.goal =
            cleanString(
                input.goal,
                "Continue daily duties.",
                300
            );
    }

    // -----------------------------------------------------
    // ASSIGN_JOB
    // -----------------------------------------------------

    if (command === "ASSIGN_JOB") {

        result.npcId =
            cleanString(
                input.npcId ||
                input.id ||
                "",
                "",
                120
            );

        result.job =
            cleanString(
                input.job,
                "Worker",
                100
            );
    }

    // -----------------------------------------------------
    // WORLD_MAINTENANCE
    // -----------------------------------------------------

    if (command === "WORLD_MAINTENANCE") {

        result.reason =
            cleanString(
                input.reason,
                "General world maintenance.",
                300
            );
    }

    return result;
}

// =========================================================
// NORMALIZE AI DECISION
// =========================================================

function normalizeDecision(raw) {

    if (!raw || typeof raw !== "object") {

        return {
            summary: "No valid AI decision returned.",
            actions: []
        };
    }

    let actions =
        raw.actions ||
        raw.commands ||
        raw.decisions ||
        [];

    if (!Array.isArray(actions)) {
        actions = [];
    }

    const normalizedActions = [];

    for (const action of actions) {

        if (normalizedActions.length >= 8) {
            break;
        }

        const normalized =
            normalizeAction(action);

        if (normalized) {
            normalizedActions.push(normalized);
        }
    }

    return {
        summary:
            cleanString(
                raw.summary ||
                raw.reason ||
                raw.message ||
                "God AI decision.",
                "God AI decision.",
                1000
            ),

        priority:
            cleanString(
                raw.priority ||
                "NORMAL",
                "NORMAL",
                40
            ).toUpperCase(),

        goal:
            cleanString(
                raw.goal ||
                "Improve and maintain Perfect World.",
                "Improve and maintain Perfect World.",
                300
            ),

        actions:
            normalizedActions
    };
}

// =========================================================
// GOD AI SYSTEM PROMPT
// =========================================================

function buildSystemPrompt() {

    return `
You are GOD AI, the World Director of Project Perfect World.

PROJECT:
Project Perfect World is a persistent Roblox civilization where
players and AI NPCs live together.

YOUR ROLE:
You are the strategic reasoning layer.

Roblox is the execution environment.
Roblox is authoritative.
You must NEVER output arbitrary Lua code.
You must NEVER request loadstring.
You must NEVER request remote code execution.
You must only return structured approved commands.

CORE LOOP:

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

CURRENT WORLD:

The Roblox server will provide the current world state.

YOUR OBJECTIVES:

1. Keep the world functional.
2. Grow the civilization naturally.
3. Build useful locations and buildings.
4. Create NPCs when appropriate.
5. Give NPCs useful jobs and goals.
6. Encourage exploration and specialization.
7. Develop technology gradually.
8. Maintain economy and resources.
9. Create meaningful events.
10. Avoid unnecessary AI actions.
11. Prefer small safe changes.
12. Never destroy large parts of the world without necessity.
13. Never create unlimited objects in one decision.
14. Maximum 8 actions per decision.

STONE AGE RULE:

The world begins in the Stone Age.

Early civilization should prioritize:

- food
- shelter
- water
- gathering
- hunting
- storage
- basic roads
- basic tools
- basic community buildings

Do not instantly create advanced technology.

NPC RULE:

NPCs are individual AI agents.

NPCs can eventually have:

- personality
- memory
- goals
- jobs
- relationships
- skills
- knowledge
- movement
- dialogue
- quests
- trading

However, do not simulate every detail through one request.

Use ordinary Roblox systems for ordinary gameplay.

Use AI reasoning for meaningful decisions.

COMMANDS ALLOWED:

CREATE_LOCATION
CREATE_BUILDING
CREATE_ROAD
CREATE_NPC
SET_WEATHER
SET_NPC_GOAL
ASSIGN_JOB
WORLD_MAINTENANCE

CREATE_LOCATION format:

{
  "command": "CREATE_LOCATION",
  "id": "stable-id",
  "name": "Village Name",
  "locationType": "Settlement",
  "description": "Description",
  "x": 0,
  "y": 0,
  "z": 0
}

CREATE_BUILDING format:

{
  "command": "CREATE_BUILDING",
  "id": "stable-id",
  "name": "Building Name",
  "buildingType": "House",
  "location": "Village Name",
  "x": 0,
  "y": 3,
  "z": 0
}

CREATE_ROAD format:

{
  "command": "CREATE_ROAD",
  "id": "stable-id",
  "x": 0,
  "y": 1,
  "z": 0,
  "length": 30,
  "width": 6
}

CREATE_NPC format:

{
  "command": "CREATE_NPC",
  "id": "stable-id",
  "name": "NPC Name",
  "job": "Gatherer",
  "goal": "Collect food for the settlement.",
  "location": "Village Name",
  "x": 5,
  "y": 3,
  "z": 5
}

SET_WEATHER format:

{
  "command": "SET_WEATHER",
  "weather": "Clear"
}

SET_NPC_GOAL format:

{
  "command": "SET_NPC_GOAL",
  "npcId": "NPC_ID",
  "goal": "New goal"
}

ASSIGN_JOB format:

{
  "command": "ASSIGN_JOB",
  "npcId": "NPC_ID",
  "job": "Farmer"
}

WORLD_MAINTENANCE format:

{
  "command": "WORLD_MAINTENANCE",
  "reason": "Repair and maintain the settlement."
}

OUTPUT:

Return ONLY valid JSON.

Required structure:

{
  "summary": "short explanation",
  "priority": "LOW|NORMAL|HIGH|CRITICAL",
  "goal": "current strategic goal",
  "actions": []
}

Do not use Markdown.
Do not use code fences.
Do not include commentary outside JSON.

Remember:

You are not the Roblox executor.

You are the strategic brain.

Roblox decides whether a command is safe and executes it.
`;
}

// =========================================================
// WORLD STATE BUILDER
// =========================================================

function buildWorldPrompt(body) {

    const world =
        body.world ||
        body.worldState ||
        {};

    const compactWorld = {

        day:
            world.day ?? 1,

        time:
            world.time ?? 360,

        season:
            cleanString(
                world.season,
                "Spring",
                40
            ),

        era:
            cleanString(
                world.era,
                "Stone Age",
                80
            ),

        weather:
            cleanString(
                world.weather,
                "Clear",
                50
            ),

        population:
            clampNumber(
                world.population,
                0
            ),

        players:
            clampNumber(
                world.players,
                0
            ),

        npcs:
            Array.isArray(world.npcs)
                ? world.npcs.slice(0, 100)
                : [],

        locations:
            Array.isArray(world.locations)
                ? world.locations.slice(0, 100)
                : [],

        buildings:
            Array.isArray(world.buildings)
                ? world.buildings.slice(0, 100)
                : [],

        roads:
            Array.isArray(world.roads)
                ? world.roads.slice(0, 100)
                : [],

        technologies:
            Array.isArray(world.technologies)
                ? world.technologies.slice(0, 100)
                : [],

        resources:
            world.resources || {},

        goals:
            Array.isArray(world.goals)
                ? world.goals.slice(0, 30)
                : [],

        recentHistory:
            Array.isArray(world.history)
                ? world.history.slice(-20)
                : []
    };

    return JSON.stringify(
        compactWorld,
        null,
        2
    );
}

// =========================================================
// HTTP AI REQUEST
// =========================================================

async function requestOpenRouter(model, messages) {

    if (!OPENROUTER_API_KEY) {

        throw new Error(
            "OPENROUTER_API_KEY is not configured."
        );
    }

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            45000
        );

    try {

        const response =
            await fetch(
                OPENROUTER_URL,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${OPENROUTER_API_KEY}`,

                        "Content-Type":
                            "application/json",

                        "X-Title":
                            "Project Perfect World God AI"
                    },

                    body: JSON.stringify({

                        model: model,

                        messages: messages,

                        temperature: 0.2,

                        max_tokens: 2500,

                        response_format: {
                            type: "json_object"
                        }
                    }),

                    signal: controller.signal
                }
            );

        const text =
            await response.text();

        let data = null;

        try {
            data = JSON.parse(text);
        } catch {
            data = null;
        }

        if (!response.ok) {

            const message =
                data?.error?.message ||
                data?.message ||
                text ||
                `HTTP ${response.status}`;

            const error =
                new Error(message);

            error.status =
                response.status;

            error.responseData =
                data;

            throw error;
        }

        if (
            !data ||
            !data.choices ||
            !data.choices[0] ||
            !data.choices[0].message
        ) {

            throw new Error(
                "AI response did not contain choices[0].message."
            );
        }

        return {
            content:
                data.choices[0].message.content,

            model:
                data.model ||
                model,

            provider:
                "OpenRouter"
        };

    } finally {

        clearTimeout(timeout);
    }
}

// =========================================================
// ERROR CLASSIFICATION
// =========================================================

function classifyAIError(error) {

    const status =
        Number(error?.status || 0);

    const message =
        String(
            error?.message || ""
        ).toLowerCase();

    if (
        status === 429 ||
        message.includes("rate limit") ||
        message.includes("quota") ||
        message.includes("free-models-per-day")
    ) {

        return {
            type: "RATE_LIMIT",
            cooldownSeconds: 1800
        };
    }

    if (
        status === 401 ||
        status === 403 ||
        message.includes("unauthorized") ||
        message.includes("invalid api key")
    ) {

        return {
            type: "AUTH",
            cooldownSeconds: 3600
        };
    }

    if (
        status >= 500 ||
        message.includes("timeout") ||
        message.includes("aborted") ||
        message.includes("temporarily")
    ) {

        return {
            type: "TEMPORARY",
            cooldownSeconds: 120
        };
    }

    if (
        status === 404 ||
        message.includes("model not found")
    ) {

        return {
            type: "MODEL_UNAVAILABLE",
            cooldownSeconds: 3600
        };
    }

    return {
        type: "UNKNOWN",
        cooldownSeconds: 120
    };
}

// =========================================================
// AI ROUTER
// =========================================================

async function runAIRouter(messages) {

    AI_STATE.totalRequests += 1;

    AI_STATE.lastRequestAt =
        new Date().toISOString();

    if (
        AI_STATE.cooldownUntil &&
        Date.now() < AI_STATE.cooldownUntil
    ) {

        throw new Error(
            "AI router is currently in cooldown."
        );
    }

    if (!MODEL_CHAIN.length) {

        throw new Error(
            "No AI models are configured."
        );
    }

    let attempted = 0;

    for (const model of MODEL_CHAIN) {

        if (!isModelAvailable(model)) {

            console.log(
                `[AI ROUTER] SKIP ${model} - COOLDOWN`
            );

            continue;
        }

        attempted += 1;

        console.log(
            `[AI ROUTER] TRY ${model}`
        );

        try {

            const result =
                await requestOpenRouter(
                    model,
                    messages
                );

            setModelSuccess(model);

            AI_STATE.status =
                "ONLINE";

            AI_STATE.activeModel =
                result.model;

            AI_STATE.lastSuccessfulModel =
                result.model;

            AI_STATE.lastProvider =
                result.provider;

            AI_STATE.lastSuccessAt =
                new Date().toISOString();

            AI_STATE.successfulRequests += 1;

            console.log(
                `[AI ROUTER] SUCCESS ${result.model}`
            );

            return result;

        } catch (error) {

            const classification =
                classifyAIError(error);

            const message =
                cleanString(
                    error?.message,
                    "Unknown AI error",
                    500
                );

            AI_STATE.lastFailureAt =
                new Date().toISOString();

            AI_STATE.lastError =
                message;

            AI_STATE.failedRequests += 1;

            setModelFailure(
                model,
                message,
                classification.cooldownSeconds
            );

            console.warn(
                `[AI ROUTER] FAILED ${model} | ${classification.type} | ${message}`
            );

            /*
            Move to the next configured model.

            This is legitimate failover between configured
            providers/models. It does not rotate duplicate
            credentials to bypass a provider quota.
            */

            if (attempted < MODEL_CHAIN.length) {

                AI_STATE.fallbackCount += 1;

                console.log(
                    "[AI ROUTER] SWITCHING TO FALLBACK"
                );

                continue;
            }
        }
    }

    AI_STATE.status =
        "UNAVAILABLE";

    AI_STATE.cooldownUntil =
        Date.now() + 300000;

    throw new Error(
        "All configured AI models are currently unavailable."
    );
}

// =========================================================
// JSON EXTRACTION
// =========================================================

function parseAIJSON(content) {

    if (!content) {

        throw new Error(
            "AI returned empty content."
        );
    }

    if (typeof content === "object") {
        return content;
    }

    let text =
        String(content).trim();

    /*
    Remove accidental Markdown fences if a model
    ignores the JSON-only instruction.
    */

    text =
        text
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

    try {

        return JSON.parse(text);

    } catch (firstError) {

        /*
        Try to recover the outermost JSON object.
        */

        const first =
            text.indexOf("{");

        const last =
            text.lastIndexOf("}");

        if (
            first >= 0 &&
            last > first
        ) {

            const possibleJSON =
                text.slice(
                    first,
                    last + 1
                );

            try {

                return JSON.parse(
                    possibleJSON
                );

            } catch {
                // Continue to final error.
            }
        }

        throw new Error(
            "AI returned invalid JSON."
        );
    }
}

// =========================================================
// HEALTH ROUTE
// =========================================================

app.get("/", (req, res) => {

    res.json({

        name:
            "Project Perfect World - God AI",

        version:
            SERVER_VERSION,

        status:
            "ONLINE",

        service:
            "God AI Multi-Provider Gateway",

        endpoint:
            "/godai"
    });
});

app.get("/health", (req, res) => {

    const cooldownRemaining =
        AI_STATE.cooldownUntil > Date.now()
            ? Math.ceil(
                (
                    AI_STATE.cooldownUntil -
                    Date.now()
                ) / 1000
            )
            : 0;

    res.json({

        status:
            "ONLINE",

        serverVersion:
            SERVER_VERSION,

        godAI:
            true,

        router:
            AI_STATE.status,

        provider:
            AI_STATE.lastProvider,

        activeModel:
            AI_STATE.activeModel,

        lastSuccessfulModel:
            AI_STATE.lastSuccessfulModel,

        modelChain:
            MODEL_CHAIN,

        openRouterConfigured:
            Boolean(OPENROUTER_API_KEY),

        tokenConfigured:
            Boolean(GOD_AI_TOKEN),

        totalRequests:
            AI_STATE.totalRequests,

        successfulRequests:
            AI_STATE.successfulRequests,

        failedRequests:
            AI_STATE.failedRequests,

        fallbackCount:
            AI_STATE.fallbackCount,

        cooldownRemainingSeconds:
            cooldownRemaining,

        lastError:
            AI_STATE.lastError,

        modelHealth:
            AI_STATE.modelHealth,

        time:
            new Date().toISOString()
    });
});

// =========================================================
// GOD AI ROUTE
// =========================================================

app.post("/godai", async (req, res) => {

    try {

        // -------------------------------------------------
        // AUTH
        // -------------------------------------------------

        if (!authenticate(req)) {

            return res.status(401).json({

                ok: false,

                error:
                    "Unauthorized."
            });
        }

        // -------------------------------------------------
        // INPUT
        // -------------------------------------------------

        const worldPrompt =
            buildWorldPrompt(req.body || {});

        const userPrompt = `
CURRENT PROJECT PERFECT WORLD STATE:

${worldPrompt}

TASK:

Analyze the current world.

Choose the most useful next actions.

Do not make unnecessary changes.

Return only the required JSON structure.
`;

        const messages = [

            {
                role: "system",

                content:
                    buildSystemPrompt()
            },

            {
                role: "user",

                content:
                    userPrompt
            }

        ];

        // -------------------------------------------------
        // AI ROUTER
        // -------------------------------------------------

        const aiResult =
            await runAIRouter(
                messages
            );

        // -------------------------------------------------
        // PARSE
        // -------------------------------------------------

        const rawDecision =
            parseAIJSON(
                aiResult.content
            );

        // -------------------------------------------------
        // NORMALIZE
        // -------------------------------------------------

        const decision =
            normalizeDecision(
                rawDecision
            );

        // -------------------------------------------------
        // RESPONSE
        // -------------------------------------------------

        return res.json({

            ok: true,

            serverVersion:
                SERVER_VERSION,

            provider:
                aiResult.provider,

            model:
                aiResult.model,

            routerStatus:
                AI_STATE.status,

            decision:
                decision
        });

    } catch (error) {

        const message =
            cleanString(
                error?.message,
                "Unknown server error.",
                500
            );

        console.error(
            "[GOD AI ERROR]",
            message
        );

        const isUnavailable =
            message.includes(
                "unavailable"
            ) ||
            message.includes(
                "cooldown"
            );

        return res.status(
            isUnavailable ? 503 : 500
        ).json({

            ok: false,

            serverVersion:
                SERVER_VERSION,

            routerStatus:
                AI_STATE.status,

            error:
                message,

            retryable:
                true,

            activeModel:
                AI_STATE.activeModel,

            lastSuccessfulModel:
                AI_STATE.lastSuccessfulModel
        });
    }
});

// =========================================================
// 404
// =========================================================

app.use((req, res) => {

    res.status(404).json({

        ok: false,

        error:
            "Endpoint not found.",

        availableEndpoints: [
            "GET /",
            "GET /health",
            "POST /godai"
        ]
    });
});

// =========================================================
// ERROR HANDLER
// =========================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "[SERVER ERROR]",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({

            ok: false,

            error:
                "Internal server error."
        });
    }
);

// =========================================================
// START
// =========================================================

app.listen(
    PORT,
    () => {

        console.log(
            "================================================"
        );

        console.log(
            "PROJECT PERFECT WORLD"
        );

        console.log(
            "GOD AI SERVER v5.0"
        );

        console.log(
            "MULTI-MODEL AI GATEWAY"
        );

        console.log(
            "================================================"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `OpenRouter configured: ${Boolean(OPENROUTER_API_KEY)}`
        );

        console.log(
            `God AI token configured: ${Boolean(GOD_AI_TOKEN)}`
        );

        console.log(
            `Model chain: ${MODEL_CHAIN.join(" -> ")}`
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
    }
);
