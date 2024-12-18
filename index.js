const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const socketConnection = require("./socket-connections/index");
const routes = require("./routes/index");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());

// API Routes

app.use("/", routes);

// Socket Connection

socketConnection(io);

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
