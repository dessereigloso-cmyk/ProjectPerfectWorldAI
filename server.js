const http = require("http");

const PORT = process.env.PORT || 3000;

function sendJSON(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {

    if (req.method === "GET" && req.url === "/") {
        return sendJSON(res, 200, {
            online: true,
            system: "Project Perfect World",
            godAI: "ONLINE",
            message: "God AI server is running."
        });
    }

    if (req.method === "GET" && req.url === "/health") {
        return sendJSON(res, 200, {
            online: true,
            system: "Project Perfect World",
            godAI: "ONLINE",
            externalBrain: "WAITING_FOR_CONNECTION"
        });
    }

    return sendJSON(res, 404, {
        error: "Endpoint not found",
        path: req.url
    });
});

server.listen(PORT, () => {
    console.log("================================");
    console.log("PROJECT PERFECT WORLD");
    console.log("GOD AI SERVER");
    console.log("SERVER ONLINE");
    console.log("PORT:", PORT);
    console.log("================================");
});
