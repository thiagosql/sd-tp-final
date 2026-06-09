const { Sequelize } = require("sequelize");
const defineUser = require("./User");

let sequelize;

function getSequelize() {
  if (!sequelize) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      logging: false,
    });
  }
  return sequelize;
}

function getModels() {
  const db = getSequelize();
  const User = defineUser(db);
  return { User, sequelize: db };
}

module.exports = { getSequelize, getModels };
