const http = require("http");

const PORT = process.env.PORT || 3000;

function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    });

    res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {

    // Get only the pathname.
    // This removes things like ?utm_source=chatgpt.com
    let path = "/";

    try {
        const fullURL = new URL(
            req.url,
            "http://" + (req.headers.host || "localhost")
        );

        path = fullURL.pathname;
    } catch (error) {
        path = req.url.split("?")[0];
    }

    // ==============================
    // ROOT
    // ==============================

    if (req.method === "GET" && path === "/") {

        return sendJSON(res, 200, {
            online: true,
            system: "Project Perfect World",
            godAI: "ONLINE",
            message: "God AI server is running."
        });
    }

    // ==============================
    // HEALTH CHECK
    // ==============================

    if (req.method === "GET" && path === "/health") {

        return sendJSON(res, 200, {
            online: true,
            system: "Project Perfect World",
            godAI: "ONLINE",
            externalBrain: "WAITING_FOR_CONNECTION",
            serverVersion: "1.1"
        });
    }

    // ==============================
    // 404
    // ==============================

    return sendJSON(res, 404, {
        error: "Endpoint not found",
        path: path
    });
});

server.listen(PORT, () => {

    console.log("================================");
    console.log("PROJECT PERFECT WORLD");
    console.log("GOD AI SERVER");
    console.log("================================");
    console.log("SERVER: ONLINE");
    console.log("PORT:", PORT);
    console.log("VERSION: 1.1");
    console.log("================================");
});
