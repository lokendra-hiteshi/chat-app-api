// socket.js
const { pool } = require("../db-config");
const { sendEmailRequest } = require("../services/email_service");

const socketConnection = (io) => {
  io.on("connection", (socket) => {
    socket.on("join_room", async ({ roomId, userId }) => {
      const roomQuery = "SELECT * FROM rooms WHERE id = $1";
      const roomResult = await pool.query(roomQuery, [roomId]);

      if (roomResult?.rows?.length === 0) {
        return socket.emit("join_room_message_error", "Room not found");
      }
      const room = roomResult?.rows[0];

      const creator_id = room?.creator_id;

      if (creator_id) {
        try {
          const query = `SELECT (email) FROM users where id = $1`;
          const res = await pool.query(query, [creator_id]);
          sendEmailRequest(
            res.rows[0]?.email,
            room.name,
            "https://www.youtube.com/"
          );
          io.emit(
            "join_room_message_success",
            "Request mail sent Successfully!!"
          );
        } catch (err) {
          io.emit(
            "join_room_message_error",
            `Error in Sending Email!!, ${err}`
          );
        }
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
};

module.exports = socketConnection;
