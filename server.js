const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "application/json"
    });

    res.end(JSON.stringify({
        online: true,
        system: "Project Perfect World",
        godAI: "ONLINE",
        message: "External God AI server is running."
    }));
});

server.listen(PORT, () => {
    console.log("================================");
    console.log("PROJECT PERFECT WORLD");
    console.log("EXTERNAL GOD AI");
    console.log("SERVER ONLINE");
    console.log("PORT:", PORT);
    console.log("================================");
});
