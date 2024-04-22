const fs = require("fs")
if (fs.existsSync(".env")) return require('dotenv').config()
if (!fs.existsSync(".env.vault") || !fs.existsSync(".env.keys")) throw new Error("No .env or .env.vault/.env.keys found.")

if (process.env.NODE_ENV != "production") {
    var devkey = fs.readFileSync(".env.keys", "utf8").split("\n").find(key => key.includes("DOTENV_KEY_DEVELOPMENT"))
    if (!devkey) throw new Error("No development key found. Are you sure you wanted to use a development key?")
    devkey = devkey.replace("DOTENV_KEY_DEVELOPMENT=", "").replaceAll('"', "")
    require('dotenv').config({
        DOTENV_KEY: devkey
    })
} else {
    var prodkey = fs.readFileSync(".env.keys", "utf8").split("\n").find(key => key.includes("DOTENV_KEY_PRODUCTION"))
    if (!prodkey) throw new Error("No production key found. Are you sure you wanted to use a production key?")
    prodkey = prodkey.replace("DOTENV_KEY_PRODUCTION=", "").replaceAll('"', "")
    require('dotenv').config({
        DOTENV_KEY: prodkey
    })
}