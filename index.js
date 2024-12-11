const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./controller");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { pool } = require("./db");
const { sendEMail } = require("./services/email_service");

dotenv.config();

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

const JWT_SECRET = process.env.JWT_SECRET_KEY;

function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// API Routes

app.get("/", (req, res) => {
  res.json({ message: "Node.js, Express, and Postgres API" });
});

app.get("/messages", authenticateToken, db.getMessages);
app.get("/rooms", authenticateToken, db.getRooms);
app.post("/rooms", authenticateToken, db.createRoom);
app.get("/users", authenticateToken, db.getUsers);
app.post("/users", db.createUsers);
app.post("/login", db.loginUser);

// Socket Connection

io.on("connection", (socket) => {
  socket.on("join_room", async ({ roomId, userId }) => {
    const roomQuery = "SELECT * FROM rooms WHERE id = $1";
    const roomResult = await pool.query(roomQuery, [roomId]);

    if (roomResult?.rows?.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }
    const room = roomResult?.rows[0];

    const creator_id = room?.creator_id;

    if (creator_id) {
      try {
        const query = `SELECT (email) FROM users where id = $1`;
        const res = await pool.query(query, [creator_id]);
        sendEMail(res.rows[0]?.email, room.name, "https://www.youtube.com/");
        io.emit("join_room_message_success", "Request mail sent Succesfully!!");
      } catch (err) {
        io.emit("join_room_message_error", `Error in Sending Email!!, ${err}`);
      }
    }

    // const updateQuery = `
    //       UPDATE rooms
    //       SET joiners = array_append(joiners, $1)
    //       WHERE id = $2
    //       RETURNING *;
    //     `;
    // await pool.query(updateQuery, [userId, roomId]);

    // socket.join(roomId);
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
        io.in(room_id).emit("receive_room_message", {
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
