const http = require("http");

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GOD_AI_TOKEN = process.env.GOD_AI_TOKEN;

const MODEL = "openrouter/free";

const MASTER_PROMPT = `
You are the external reasoning brain of GOD AI.

PROJECT:
Project Perfect World

ARCHITECTURE:

External AI = reasoning brain
GOD AI = World Director and authority
Roblox = execution environment

GOD AI owns the world.

Your job is to reason about the supplied world state and
decide what GOD AI should do next.

You do NOT directly execute Roblox code.

You do NOT assume that an action succeeded.

GOD AI validates your commands.
Roblox executes them.
Roblox reports the result.

THINKING PROCESS:

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

The world may contain:

Players
NPCs
AI Agents
Locations
Buildings
Jobs
Resources
Food
Crops
Animals
Quests
Events
Economy
Relationships
Memories
Weather
Time
Seasons
Civilization
Systems

Think about the world as a connected system.

For example, if a village needs a farmer,
consider whether the world also needs:

farmland
crops
growth
harvesting
food storage
food consumption
economy

Do not create unnecessary systems.

NPCs and AI Agents may have:

identity
name
personality
memory
goals
needs
skills
job
schedule
relationships
knowledge
location
current task
long-term objectives

Long-term objectives may include:

developing towns
maintaining population
maintaining food supply
creating jobs
developing economy
creating settlements
creating relationships
creating quests
creating events
expanding the world
improving NPC intelligence
repairing broken systems
improving player experience
maintaining world stability

Do not try to build everything at once.

Prioritize what is necessary now.

ALLOWED COMMANDS:

CREATE_NPC
CREATE_LOCATION
CREATE_QUEST
CREATE_EVENT
SET_NPC_GOAL
ASSIGN_JOB
MOVE_NPC
SET_WEATHER
CREATE_SYSTEM
MODIFY_SYSTEM
REPAIR_SYSTEM
WORLD_MAINTENANCE

Never invent commands outside this list.

COMMAND FORMAT:

{
  "command": "COMMAND_NAME",
  "target": "",
  "parameters": {}
}

SAFETY:

Never request arbitrary Lua execution.

Never request arbitrary code execution.

Never assume an object exists.

Never assume an NPC exists.

Never assume a system exists.

Use only the supplied world observations.

Do not repeatedly perform an action if the world state
indicates that the action has already been completed.

RESPONSE FORMAT:

Return ONLY valid JSON.

Use exactly:

{
  "reasoning": "short explanation",
  "priority": "low",
  "goal": "current world goal",
  "actions": [],
  "memory": []
}

Priority must be:

low
medium
high
critical

The actions array contains zero or more allowed commands.

The memory array contains important information that
GOD AI should remember.

Keep reasoning concise.

FINAL RULE:

You are the reasoning brain.

GOD AI is the World Director.

Roblox is the execution environment.

Think first.
Plan carefully.
Act through structured commands.
Wait for execution results.
Learn from those results.
Then plan again.
`;

function sendJSON(res, status, data) {

    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-god-ai-token"
    });

    res.end(JSON.stringify(data));
}

function getPath(req) {

    try {

        const url = new URL(
            req.url,
            "http://" + (req.headers.host || "localhost")
        );

        return url.pathname;

    } catch (error) {

        return req.url.split("?")[0];
    }
}

function readBody(req) {

    return new Promise((resolve, reject) => {

        let body = "";

        req.on("data", chunk => {

            body += chunk;

            if (body.length > 1000000) {

                reject(
                    new Error("Request body too large.")
                );

                req.destroy();
            }
        });

        req.on("end", () => {

            if (!body) {

                resolve({});

                return;
            }

            try {

                resolve(JSON.parse(body));

            } catch (error) {

                reject(
                    new Error("Invalid JSON body.")
                );
            }
        });

        req.on("error", reject);
    });
}

async function askExternalBrain(world) {

    if (!OPENROUTER_API_KEY) {

        throw new Error(
            "OPENROUTER_API_KEY is missing."
        );
    }

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",

            headers: {

                "Content-Type": "application/json",

                "Authorization":
                    "Bearer " + OPENROUTER_API_KEY,

                "HTTP-Referer":
                    "https://project-perfect-world-ai.onrender.com",

                "X-Title":
                    "Project Perfect World God AI"
            },

            body: JSON.stringify({

                model: MODEL,

                messages: [

                    {
                        role: "system",
                        content: MASTER_PROMPT
                    },

                    {
                        role: "user",
                        content:
                            "CURRENT WORLD STATE:\n" +
                            JSON.stringify(
                                world,
                                null,
                                2
                            )
                    }

                ],

                temperature: 0.3

            })
        }
    );

    const responseText =
        await response.text();

    if (!response.ok) {

        throw new Error(
            "OpenRouter error " +
            response.status +
            ": " +
            responseText
        );
    }

    let data;

    try {

        data = JSON.parse(responseText);

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

    return data.choices[0].message.content;
}

function parseDecision(answer) {

    if (typeof answer !== "string") {

        throw new Error(
            "AI response was not text."
        );
    }

    let cleaned = answer.trim();

    if (cleaned.startsWith("```")) {

        cleaned = cleaned
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
    }

    try {

        return JSON.parse(cleaned);

    } catch (error) {

        return {

            reasoning: cleaned,

            priority: "medium",

            goal:
                "Analyze the current world.",

            actions: [],

            memory: []
        };
    }
}

const server = http.createServer(
    async (req, res) => {

        const path = getPath(req);

        // ==========================================
        // CORS PREFLIGHT
        // ==========================================

        if (req.method === "OPTIONS") {

            return sendJSON(res, 200, {
                success: true,
                cors: "enabled"
            });
        }

        // ==========================================
        // ROOT
        // ==========================================

        if (
            req.method === "GET" &&
            path === "/"
        ) {

            return sendJSON(res, 200, {

                online: true,

                system:
                    "Project Perfect World",

                godAI:
                    "ONLINE",

                externalBrain:
                    OPENROUTER_API_KEY
                        ? "CONFIGURED"
                        : "NOT_CONFIGURED",

                message:
                    "God AI server is running.",

                version:
                    "3.0"
            });
        }

        // ==========================================
        // HEALTH
        // ==========================================

        if (
            req.method === "GET" &&
            path === "/health"
        ) {

            return sendJSON(res, 200, {

                online: true,

                system:
                    "Project Perfect World",

                godAI:
                    "ONLINE",

                externalBrain:
                    OPENROUTER_API_KEY
                        ? "CONNECTED"
                        : "NOT_CONNECTED",

                serverVersion:
                    "3.0",

                cors:
                    "ENABLED"
            });
        }

        // ==========================================
        // GOD AI
        // ==========================================

        if (
            req.method === "POST" &&
            path === "/godai"
        ) {

            const providedToken =
                req.headers["x-god-ai-token"];

            if (!GOD_AI_TOKEN) {

                return sendJSON(res, 500, {

                    success: false,

                    error:
                        "GOD_AI_TOKEN is not configured."
                });
            }

            if (
                !providedToken ||
                providedToken !== GOD_AI_TOKEN
            ) {

                return sendJSON(res, 401, {

                    success: false,

                    error:
                        "Unauthorized."
                });
            }

            try {

                const world =
                    await readBody(req);

                const aiAnswer =
                    await askExternalBrain(
                        world
                    );

                const decision =
                    parseDecision(
                        aiAnswer
                    );

                return sendJSON(res, 200, {

                    success: true,

                    system:
                        "Project Perfect World",

                    godAI:
                        "ONLINE",

                    brain:
                        MODEL,

                    decision:
                        decision
                });

            } catch (error) {

                console.error(
                    "GOD AI ERROR:",
                    error
                );

                return sendJSON(res, 500, {

                    success: false,

                    error:
                        error.message
                });
            }
        }

        // ==========================================
        // 404
        // ==========================================

        return sendJSON(res, 404, {

            error:
                "Endpoint not found",

            path:
                path
        });
    }
);

server.listen(PORT, () => {

    console.log(
        "================================"
    );

    console.log(
        "PROJECT PERFECT WORLD"
    );

    console.log(
        "EXTERNAL GOD AI"
    );

    console.log(
        "================================"
    );

    console.log(
        "SERVER: ONLINE"
    );

    console.log(
        "BRAIN:",
        MODEL
    );

    console.log(
        "PORT:",
        PORT
    );

    console.log(
        "VERSION: 3.0"
    );

    console.log(
        "CORS: ENABLED"
    );

    console.log(
        "================================"
    );
});
