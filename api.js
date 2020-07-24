const express = require("express")
const router = express.Router()
require("./db")
router.use(require("./api_auth"))

module.exports = router