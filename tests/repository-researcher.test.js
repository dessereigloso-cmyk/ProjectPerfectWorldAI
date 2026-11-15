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

test("rejects requests without authorization", async () => {
    await withServer(() => false, "test-key", async baseUrl => {
        const response = await fetch(`${baseUrl}/research/repository`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                repository: "owner/repo",
                paths: ["README.md"]
            })
        });
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { ok: false, error: "Unauthorized" });
    });
});

test("rejects malformed repository input before upstream requests", async () => {
    await withServer(() => true, "test-key", async baseUrl => {
        const response = await fetch(`${baseUrl}/research/repository`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                repository: "../invalid",
                paths: ["README.md"]
            })
        });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, "repository must be owner/repository");
    });
});

test("returns service unavailable when the research provider is not configured", async () => {
    await withServer(() => true, "", async baseUrl => {
        const response = await fetch(`${baseUrl}/research/repository`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                repository: "owner/repo",
                ref: "main",
                paths: ["README.md"],
                question: "Summarize the project."
            })
        });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error, "Repository research AI provider is not configured");
    });
});
