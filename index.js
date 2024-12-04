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
  database: "chat-app",
  password: "loken7213",
  port: 5432,
});

app.use(cors());
app.use(express.json());

app.get("/rooms", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM rooms");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

app.post("/rooms", async (req, res) => {
  const { name } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO rooms (name) VALUES ($1) RETURNING *",
      [name]
    );
    const room = result.rows[0];
    io.emit("new_room", room);
    res.json(room);
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.get("/users", async (req, res) => {
  try {
    let query = "SELECT * FROM users";

    const result = await pool.query(query);
    console.log(result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/users", async (req, res) => {
  const { userId, name, socketId } = req.body;
  try {
    let result;

    if (userId) {
      const query = `
        UPDATE users 
        SET socket_id = $2 
        WHERE id = $1 
        RETURNING *`;
      result = await pool.query(query, [userId, socketId]);
    } else {
      const query = `
        INSERT INTO users (name, socket_id) 
        VALUES ($1, $2) 
        ON CONFLICT (name) DO UPDATE 
        SET socket_id = EXCLUDED.socket_id 
        RETURNING *`;
      result = await pool.query(query, [name, socketId]);
      const user = result.rows[0];
      io.emit("new_user", user);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join_room", async ({ roomId, userId }) => {
    try {
      if (!userId || !roomId) {
        console.error("Invalid userId or roomId");
        return;
      }

      await pool.query(
        "INSERT INTO user_rooms (user_id, room_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, roomId]
      );

      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);
    } catch (error) {
      console.error("Error joining room:", error);
    }
  });

  socket.on("register_user", ({ userId, userName }) => {
    const socketId = socket.id;
    const query =
      "INSERT INTO users (id, name, socket_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET socket_id = $3 RETURNING id";
    const values = [userId, userName, socketId];

    pool
      .query(query, values)
      .then((result) => {
        console.log("User registered with socket_id", result.rows[0]);
      })
      .catch((error) => {
        console.error("Error registering user with socket_id:", error);
      });
  });

  socket.on(
    "send_private_message",
    async ({ senderId, recipientId, content }) => {
      console.log("message sent", senderId, recipientId, content);
      try {
        const recipientSocket = await pool.query(
          "SELECT socket_id FROM users WHERE id = $1",
          [recipientId]
        );
        const socketId = recipientSocket.rows[0]?.socket_id;
        console.log("socketId", socketId);

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

  socket.on("disconnect", async () => {
    try {
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
