const express = require("express");
const babyagi = require("./message.js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.send("Hello there");
});

app.post("/babyagi", babyagi);
// app.post("/qa", questionAndAnswer);

module.exports = app;
