const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
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

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
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

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/messages", async (req, res) => {
  const { sender_id, recipient_id, room_id } = req.query;

  let query = "";
  let params = [];

  if (recipient_id) {
    query = `
      SELECT * 
      FROM messages 
      WHERE (sender_id = $1 AND recipient_id = $2)
         OR (sender_id = $2 AND recipient_id = $1)
      ORDER BY created_at ASC;
    `;
    params = [sender_id, recipient_id];
  } else if (room_id) {
    query = `
      SELECT * 
      FROM messages 
      WHERE room_id = $1 
      ORDER BY created_at ASC;
    `;
    params = [room_id];
  } else {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
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
    async ({ sender_id, sender_info, recipient_id, content }) => {
      try {
        const recipientSocket = await pool.query(
          "SELECT socket_id FROM users WHERE id = $1",
          [recipient_id]
        );
        const socketId = recipientSocket.rows[0]?.socket_id;

        if (socketId) {
          io.to(socketId).emit("receive_private_message", {
            sender_id,
            content,
          });
        }

        await pool.query(
          "INSERT INTO messages (sender_id, recipient_id, content, sender_info) VALUES ($1, $2, $3, $4)",
          [sender_id, recipient_id, content, sender_info]
        );
      } catch (error) {
        console.error("Error sending private message:", error);
      }
    }
  );

  socket.on(
    "send_room_message",
    async ({ sender_id, room_id, content, sender_info }) => {
      try {
        io.to(room_id).emit("receive_room_message", {
          sender_id,
          content,
          sender_info,
        });

        await pool.query(
          "INSERT INTO messages (sender_id, room_id, content, sender_info) VALUES ($1, $2, $3, $4)",
          [sender_id, room_id, content, sender_info]
        );
      } catch (error) {
        console.error("Error sending room message:", error);
      }
    }
  );

  socket.on("disconnect", async () => {
    try {
      await pool.query(
        "UPDATE users SET socket_id = NULL WHERE socket_id = $1",
        [socket.id]
      );
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  });
});

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
