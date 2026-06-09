const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    createdBy: {
      type: String,
      required: true,
    },
    // IDs dos participantes (para grupos)
    members: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Room", roomSchema);
