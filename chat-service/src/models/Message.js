const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // ID único da sala (para 1:1: "userId1_userId2" em ordem; para grupos: roomId)
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
    },
    senderUsername: {
      type: String,
      required: true,
    },
    // "private" (1:1) ou "group" (1:N)
    type: {
      type: String,
      enum: ["private", "group"],
      default: "private",
    },
    content: {
      type: String,
      required: true,
      maxlength: 4000,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Message", messageSchema);
