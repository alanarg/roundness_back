'use-strict'
require("dotenv").config({path:__dirname+"/.env"});
require("./db");
const Users = require("./models/user_schema");
const express = require("express");

const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
//midlle
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(__dirname + "/uploaded"));
app.use("/api/v1", require("./api"));
const port = 8080;

app.listen(port, () => {
  console.log("Server is running... on port " + port);
});