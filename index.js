const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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

const JWT_SECRET = "hghrghdget";

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
app.use(express.json());

function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

app.get("/rooms", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM rooms");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

app.get("/messages", authenticateToken, async (req, res) => {
  const { sender_id, recipient_id, room_id } = req.query;

  let query = "";
  let params = [];

  if (recipient_id) {
    query = ` 
      SELECT * 
      FROM messages 
      WHERE (sender_id = $1 AND recipient_id = $2)
         OR (sender_id = $2 AND recipient_id = $1)
      ORDER BY created_at ASC`;
    params = [sender_id, recipient_id];
  } else if (room_id) {
    query = `
      SELECT * 
      FROM messages 
      WHERE room_id = $1 
      ORDER BY created_at ASC`;
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

app.post("/rooms", authenticateToken, async (req, res) => {
  const { name, sender_id } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO rooms (name, creator_id, joiners) VALUES ($1, $2, $3) RETURNING *",
      [name, sender_id, [sender_id]]
    );
    const room = result.rows[0];
    io.emit("new_room", room);
    res.json(room);
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.get("/users", authenticateToken, async (req, res) => {
  try {
    let query = "SELECT * FROM users";

    const result = await pool.query(query);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/users", async (req, res) => {
  const { userId, name, email, password, socketId } = req.body;
  try {
    let query = "";
    let result;
    if (userId) {
      query = `UPDATE users 
        SET socket_id = $2 
        WHERE id = $1 
        RETURNING id, name, email, socket_id`;
      result = await pool.query(query, [userId, socketId]);
      return res.status(200).json({ user: result?.rows[0] });
    }
    const emailCheckQuery = "SELECT * FROM users WHERE email = $1";
    const emailCheckResult = await pool.query(emailCheckQuery, [email]);

    if (emailCheckResult?.rows?.length > 0) {
      return res
        .status(400)
        .json({ error: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    query = `
      INSERT INTO users (name, email, password, socket_id) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, name, email, socket_id`;
    result = await pool.query(query, [name, email, hashedPassword, socketId]);

    const user = result.rows[0];

    io.emit("new_user", user);
    res.status(201).json({ message: "User Registered Succesfully!!" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password, socketId } = req.body;
  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    const user = result.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Authorization failed" });
    }

    if (socketId) {
      const updateSocketQuery = `
        UPDATE users
        SET socket_id = $1
        WHERE id = $2
        RETURNING id, name, email, socket_id`;
      const updateSocketResult = await pool.query(updateSocketQuery, [
        socketId,
        user.id,
      ]);

      user.socket_id = updateSocketResult.rows[0].socket_id;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1w",
    });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

io.on("connection", (socket) => {
  socket.on("join_room", async ({ roomId, userId }) => {
    const roomQuery = "SELECT * FROM rooms WHERE id = $1";
    const roomResult = await pool.query(roomQuery, [roomId]);

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    const updateQuery = `
          UPDATE rooms
          SET joiners = array_append(joiners, $1)
          WHERE id = $2
          RETURNING *;
        `;
    await pool.query(updateQuery, [userId, roomId]);

    socket.join(roomId);
  });

  socket.on("join_room_chat", async ({ roomId }) => {
    try {
      if (!roomId) {
        console.error("Invalid roomId");
        return;
      }

      socket.join(roomId);
    } catch (error) {
      console.error("Error joining room:", error);
    }
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
