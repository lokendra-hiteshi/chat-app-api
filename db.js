const { Pool } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: process.env.DB,
  password: process.env.DB_PASS,
  port: process.env.POSTGRES_PORT,
});

module.exports = { pool };
