const { pool } = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendEmailAprovel } = require("./services/email_service");

const JWT_SECRET = process.env.JWT_SECRET_KEY;

const getUsers = async (req, res) => {
  try {
    let query = "SELECT * FROM users";

    const result = await pool.query(query);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

const createUsers = async (req, res) => {
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

    res.status(201).json({ message: "User Registered Succesfully!!" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
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

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      {
        expiresIn: "1w",
      }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getRooms = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM rooms");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

const createRoom = async (req, res) => {
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
};

const joinRoom = async (req, res) => {
  const { room_id, joiner_id } = req.body;

  const user = await pool.query(`SELECT * from users where id = $1`, [
    joiner_id,
  ]);

  try {
    const updateQuery = `
          UPDATE rooms
          SET joiners = array_append(joiners, $1)
          WHERE id = $2
          RETURNING *;
        `;
    const result = await pool.query(updateQuery, [joiner_id, room_id]);
    res.json(result.rows[0]);
    sendEmailAprovel(
      user.rows[0]?.email,
      user.rows[0]?.name,
      result.rows[0].name
    );
  } catch (error) {
    console.error("Error Joining room:", error);
    res.status(500).json({ error: "Failed to Join room" });
  }
};

const getMessages = async (req, res) => {
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
    query = `
      SELECT * 
      FROM messages`;
  }

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

module.exports = {
  getUsers,
  createUsers,
  loginUser,
  getRooms,
  createRoom,
  getMessages,
  joinRoom,
};
