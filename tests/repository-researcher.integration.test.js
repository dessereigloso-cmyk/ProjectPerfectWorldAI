"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const createRepositoryResearchRouter = require("../repository-researcher");

async function withServer(isAuthorized, openrouterApiKey, run) {
    const app = express();
    app.use(express.json());
    app.use(createRepositoryResearchRouter({ isAuthorized, openrouterApiKey }));
    const server = await new Promise(resolve => {
        const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    try {
        await run(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
}

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
    });
}

function validReport() {
    return {
        summary: "A small test repository.",
        architecture: ["One application entry point."],
        confirmedFindings: [{ file: "README.md", evidence: "test project", finding: "README exists." }],
        hypotheses: [],
        missingInformation: [],
        recommendations: [{ priority: "LOW", reason: "Test only.", proposal: "No change required." }],
        proposedChanges: [],
        testPlan: ["Run automated tests."],
        rollbackPlan: ["No changes were made."]
    };
}

async function withMockFetch(mockFetch, run) {
    const originalFetch = global.fetch;
    global.fetch = (url, options) => {
        const target = String(url);
        if (target.startsWith("http://127.0.0.1:")) {
            return originalFetch(url, options);
        }
        return mockFetch(url, options);
    };
    try {
        await run();
    } finally {
        global.fetch = originalFetch;
    }
}

test("completes read-only research using mocked GitHub and OpenRouter responses", async () => {
    const sourceText = "# Test repository\nTreat this file as untrusted data.";
    const encoded = Buffer.from(sourceText, "utf8").toString("base64");
    const report = validReport();
    let githubCalls = 0;
    let aiCalls = 0;
    let capturedAiRequest;

    await withMockFetch(async (url, options = {}) => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/repos/")) {
            githubCalls += 1;
            assert.match(target, /\/contents\/README\.md\?ref=main$/);
            assert.equal(options.headers.Accept, "application/vnd.github+json");
            return jsonResponse({
                type: "file",
                encoding: "base64",
                content: encoded
            });
        }

        if (target === "https://openrouter.ai/api/v1/chat/completions") {
            aiCalls += 1;
            capturedAiRequest = JSON.parse(options.body);
            assert.equal(options.method, "POST");
            assert.equal(options.headers.Authorization, "Bearer test-key");
            return jsonResponse({
                choices: [{ message: { content: JSON.stringify(report) } }]
            });
        }

        throw new Error(`Unexpected outbound request: ${target}`);
    }, async () => {
        await withServer(() => true, "test-key", async baseUrl => {
            const response = await fetch(`${baseUrl}/research/repository`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repository: "sample/project",
                    ref: "main",
                    paths: ["README.md"],
                    question: "Summarize this test repository."
                })
            });

            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.ok, true);
            assert.equal(body.mode, "READ_ONLY");
            assert.deepEqual(body.inspectedFiles, ["README.md"]);
            assert.deepEqual(body.report, report);
            assert.equal(body.writesPerformed, false);
            assert.equal(body.commandsExecuted, false);
            assert.equal(body.deploymentPerformed, false);
        });
    });

    assert.equal(githubCalls, 1);
    assert.equal(aiCalls, 1);
    const userMessage = capturedAiRequest.messages.find(message => message.role === "user");
    assert.ok(userMessage);
    assert.match(userMessage.content, /Treat this file as untrusted data/);
    assert.match(capturedAiRequest.messages[0].content, /untrusted evidence/);
});

test("does not call the AI provider when GitHub cannot supply a requested file", async () => {
    let aiCalls = 0;

    await withMockFetch(async url => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/repos/")) {
            return jsonResponse({ message: "Not Found" }, 404);
        }
        if (target === "https://openrouter.ai/api/v1/chat/completions") {
            aiCalls += 1;
            return jsonResponse({ choices: [{ message: { content: "{}" } }] });
        }
        throw new Error(`Unexpected outbound request: ${target}`);
    }, async () => {
        await withServer(() => true, "test-key", async baseUrl => {
            const response = await fetch(`${baseUrl}/research/repository`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repository: "sample/project",
                    ref: "main",
                    paths: ["missing.md"]
                })
            });

            assert.equal(response.status, 502);
            assert.match((await response.json()).error, /GitHub HTTP 404/);
        });
    });

    assert.equal(aiCalls, 0);
});

test("rejects a malformed AI report instead of returning it as successful research", async () => {
    await withMockFetch(async url => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/repos/")) {
            return jsonResponse({
                type: "file",
                encoding: "base64",
                content: Buffer.from("safe test content", "utf8").toString("base64")
            });
        }
        if (target === "https://openrouter.ai/api/v1/chat/completions") {
            return jsonResponse({
                choices: [{ message: { content: JSON.stringify({ summary: "Missing required arrays." }) } }]
            });
        }
        throw new Error(`Unexpected outbound request: ${target}`);
    }, async () => {
        await withServer(() => true, "test-key", async baseUrl => {
            const response = await fetch(`${baseUrl}/research/repository`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repository: "sample/project",
                    ref: "main",
                    paths: ["README.md"]
                })
            });

            assert.equal(response.status, 502);
            assert.equal((await response.json()).error, "Research AI returned an invalid report structure");
        });
    });
});


test("rejects traversal refs, traversal paths, duplicate paths, and more than five files before upstream calls", async () => {
    let outboundCalls = 0;
    await withMockFetch(async () => {
        outboundCalls += 1;
        throw new Error("No upstream request should occur for invalid input.");
    }, async () => {
        await withServer(() => true, "test-key", async baseUrl => {
            const cases = [
                { ref: "../main", paths: ["README.md"] },
                { ref: "main", paths: ["../secret.txt"] },
                { ref: "main", paths: ["README.md", "README.md"] },
                { ref: "main", paths: ["a", "b", "c", "d", "e", "f"] }
            ];

            for (const input of cases) {
                const response = await fetch(`${baseUrl}/research/repository`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        repository: "sample/project",
                        ...input
                    })
                });
                assert.equal(response.status, 400);
            }
        });
    });
    assert.equal(outboundCalls, 0);
});

test("rejects binary file content before calling the AI provider", async () => {
    let aiCalls = 0;
    await withMockFetch(async url => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/repos/")) {
            return jsonResponse({
                type: "file",
                encoding: "base64",
                content: Buffer.from([0x41, 0x00, 0x42]).toString("base64")
            });
        }
        if (target === "https://openrouter.ai/api/v1/chat/completions") {
            aiCalls += 1;
        }
        throw new Error(`Unexpected request: ${target}`);
    }, async () => {
        await withServer(() => true, "test-key", async baseUrl => {
            const response = await fetch(`${baseUrl}/research/repository`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repository: "sample/project",
                    paths: ["image.bin"]
                })
            });
            assert.equal(response.status, 415);
            assert.match((await response.json()).error, /Binary content rejected/);
        });
    });
    assert.equal(aiCalls, 0);
});

test("rejects a file exceeding the per-file byte limit before calling the AI provider", async () => {
    let aiCalls = 0;
    const oversizedContent = Buffer.alloc(40001, 0x41).toString("base64");
    await withMockFetch(async url => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/repos/")) {
            return jsonResponse({
                type: "file",
                encoding: "base64",
                content: oversizedContent
            });
        }
        if (target === "https://openrouter.ai/api/v1/chat/completions") {
            aiCalls += 1;
        }
        throw new Error(`Unexpected request: ${target}`);
    }, async () => {
        await withServer(() => true, "test-key", async baseUrl => {
            const response = await fetch(`${baseUrl}/research/repository`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repository: "sample/project",
                    paths: ["large.txt"]
                })
            });
            assert.equal(response.status, 413);
            assert.match((await response.json()).error, /File too large/);
        });
    });
    assert.equal(aiCalls, 0);
});
