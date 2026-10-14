// Copies the website's index.html into the desktop app before running or packaging.
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "..", "index.html");
const dest = path.join(__dirname, "..", "app", "index.html");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied index.html into the desktop app");
