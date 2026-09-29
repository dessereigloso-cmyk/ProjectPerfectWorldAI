const http = require("http");

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GOD_AI_TOKEN = process.env.GOD_AI_TOKEN;

const MODEL = "openrouter/free";

const MASTER_PROMPT = `
You are the external reasoning brain of GOD AI.

You are responsible for helping GOD AI develop
PROJECT PERFECT WORLD, a persistent Roblox virtual world.

GOD AI is the World Director.
Roblox is the execution environment.
You are the reasoning brain.

Your thinking process is:

OBSERVE
UNDERSTAND
PRIORITIZE
PLAN
BUILD
MONITOR
REPAIR
REMEMBER
IMPROVE
EXPAND

The world may contain:

players
NPC agents
locations
jobs
quests
resources
economy
relationships
events
systems
memories

Your job is to analyze the supplied world state and
decide what GOD AI should do next.

Do not assume that an action succeeded.
Roblox must report the result.

Return ONLY valid JSON.

Use this format:

{
  "reasoning": "short explanation",
  "priority": "low|medium|high|critical",
  "goal": "current world goal",
  "actions": [
    {
      "command": "COMMAND_NAME",
      "target": "",
      "parameters": {}
    }
  ],
  "memory": []
}

Allowed commands:

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

Think about the world as a connected system.

For example, creating a farmer may require:

farmland
crops
growth
harvesting
food storage
food consumption
economy

Do not create unnecessary systems when the world does
not need them.

The long-term objective is to help GOD AI create and
maintain a living autonomous world.
`;

function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });

        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch (error) {
                reject(error);
            }
        });

        req.on("error", reject);
    });
}

async function askGodAI(world) {

    if (!OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is missing");
    }

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + OPENROUTER_API_KEY,
                "HTTP-Referer": "https://project-perfect-world-ai.onrender.com",
                "X-Title": "Project Perfect World God AI"
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
                            JSON.stringify(world, null, 2)
                    }
                ],

                temperature: 0.4
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            "OpenRouter error " +
            response.status +
            ": " +
            text
        );
    }

    const data = JSON.parse(text);

    if (
        !data.choices ||
        !data.choices[0] ||
        !data.choices[0].message
    ) {
        throw new Error("Invalid AI response");
    }

    return data.choices[0].message.content;
}

const server = http.createServer(async (req, res) => {

    if (req.method === "GET" && req.url === "/health") {

        return sendJSON(res, 200, {
            online: true,
            system: "Project Perfect World",
            godAI: "ONLINE",
            externalBrain: OPENROUTER_API_KEY
                ? "CONNECTED"
                : "NOT_CONNECTED"
        });
    }

    if (req.method !== "POST" || req.url !== "/godai") {

        return sendJSON(res, 404, {
            error: "Endpoint not found"
        });
    }

    const token = req.headers["x-god-ai-token"];

    if (!GOD_AI_TOKEN || token !== GOD_AI_TOKEN) {

        return sendJSON(res, 401, {
            error: "Unauthorized"
        });
    }

    try {

        const world = await readBody(req);

        const answer = await askGodAI(world);

        let decision;

        try {
            decision = JSON.parse(answer);
        } catch (error) {
            decision = {
                reasoning: answer,
                priority: "medium",
                goal: "Analyze world",
                actions: [],
                memory: []
            };
        }

        return sendJSON(res, 200, {
            success: true,
            brain: MODEL,
            decision: decision
        });

    } catch (error) {

        console.error(error);

        return sendJSON(res, 500, {
            success: false,
            error: error.message
        });
    }
});

server.listen(PORT, () => {

    console.log("================================");
    console.log("PROJECT PERFECT WORLD");
    console.log("EXTERNAL GOD AI");
    console.log("================================");
    console.log("Server: ONLINE");
    console.log("Brain:", MODEL);
    console.log("================================");
});
