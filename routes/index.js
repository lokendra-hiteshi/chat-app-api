const express = require("express");
const router = express.Router();

const userController = require("../controllers/index");

const { authenticateToken } = require("../middleware/auth");

router.get("/users", authenticateToken, userController.getUsers);
router.post("/users", userController.createUsers);
router.post("/login", userController.loginUser);
router.get("/rooms", authenticateToken, userController.getRooms);
router.post("/rooms", authenticateToken, userController.createRoom);
router.post("/join-room", authenticateToken, userController.joinRoom);
router.get("/messages", authenticateToken, userController.getMessages);

module.exports = router;
