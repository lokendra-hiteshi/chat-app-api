const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "chat_app",
  password: "loken7213",
  port: 5432,
});

app.use(cors());
app.use(express.json());

// Fetch all rooms
app.get("/rooms", async (req, res) => {
  const result = await pool.query("SELECT * FROM rooms");
  res.json(result.rows);
});

// Create a new room
app.post("/rooms", async (req, res) => {
  const { name } = req.body;
  const result = await pool.query(
    "INSERT INTO rooms (name) VALUES ($1) RETURNING *",
    [name]
  );
  io.emit("new_room", result.rows[0]);
  res.json(result.rows[0]);
});

// Fetch all users
app.get("/users", async (req, res) => {
  const result = await pool.query("SELECT * FROM users");
  console.log("Users", result.rows);
  res.json(result.rows);
});

// Create or update user
app.post("/users", async (req, res) => {
  const { name, socketId } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO users (name, socket_id) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET socket_id = EXCLUDED.socket_id RETURNING *",
      [name, socketId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error handling user registration:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user registration
  socket.on("register_user", async (name) => {
    try {
      const result = await pool.query(
        "INSERT INTO users (name, socket_id) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET socket_id = $2 RETURNING *",
        [name, socket.id]
      );
      const user = result.rows[0];
      io.emit("new_user", user); // Notify all users about the new user
    } catch (error) {
      console.error("Error registering user:", error);
    }
  });

  // Handle joining a room
  socket.on("join_room", ({ roomId, userId }) => {
    if (!userId) {
      console.error("Invalid userId in join_room event");
      return;
    }
    socket.join(roomId);
    console.log(`User ${userId} joined room: ${roomId}`);
  });

  // Handle private messages
  socket.on(
    "send_private_message",
    async ({ senderId, recipientId, content }) => {
      try {
        const recipientSocket = await pool.query(
          "SELECT socket_id FROM users WHERE id = $1",
          [recipientId]
        );
        const socketId = recipientSocket.rows[0]?.socket_id;

        if (socketId) {
          io.to(socketId).emit("receive_private_message", {
            senderId,
            content,
          });
        }

        await pool.query(
          "INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1, $2, $3)",
          [senderId, recipientId, content]
        );
      } catch (error) {
        console.error("Error sending private message:", error);
      }
    }
  );

  // Handle group messages
  socket.on("send_room_message", async ({ senderId, roomId, content }) => {
    try {
      io.to(roomId).emit("receive_room_message", { senderId, content });
      await pool.query(
        "INSERT INTO messages (sender_id, room_id, content) VALUES ($1, $2, $3)",
        [senderId, roomId, content]
      );
    } catch (error) {
      console.error("Error sending room message:", error);
    }
  });

  // Handle user disconnect
  socket.on("disconnect", async () => {
    try {
      // Instead of deleting the user, nullify their socket_id
      await pool.query(
        "UPDATE users SET socket_id = NULL WHERE socket_id = $1",
        [socket.id]
      );
      console.log(`User disconnected: ${socket.id}`);
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  });
});

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
