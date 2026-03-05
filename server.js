require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const multer = require("multer")
const nodemailer = require("nodemailer")
const dns = require("dns");
const cors = require("cors")
const path = require("path")
const fs = require("fs");

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use("/uploads", express.static("uploads"))
app.use(express.static("public"))

/* ================= MONGODB ================= */

// Принудительно используем публичные DNS (Cloudflare/Google)
dns.setServers(["1.1.1.1", "8.8.8.8"]);

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err))

const teamSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phone: String,
  birthYear: Number,
  teamName: String,
  logo: String
})

const Team = mongoose.model("Team", teamSchema)

/* ================= FILE UPLOAD ================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})

const upload = multer({ storage })


/* ================= EMAIL ================= */

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.log(" EMAIL_USER / EMAIL_PASS missing in .env");
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  // заставляем использовать IPv4
  lookup: (hostname, options, cb) => dns.lookup(hostname, { family: 4 }, cb),
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  requireTLS: true,
});

// transporter.verify((err) => {
//   if (err) console.log(" Mail config error:", err);
//   else console.log(" Mail transporter ready");
// });

/* ================= ROUTES ================= */

app.post("/register", upload.single("logo"), async (req, res) => {
  try {
    const { firstName, lastName, phone, birthYear, teamName } = req.body;

    if (![2007,2008,2009,2010].includes(Number(birthYear))) {
      return res.status(400).send("Invalid year");
    }

    const newTeam = new Team({
      firstName,
      lastName,
      phone,
      birthYear: Number(birthYear),
      teamName,
      logo: req.file ? req.file.path : null
    });

    await newTeam.save();

    //  ответ сразу — регистрация не зависнет
    res.send("Înregistrare reușită");

    //  почта не должна ломать регистрацию
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO || process.env.EMAIL_USER,
        subject: "Nouă echipă înscrisă",
        text: `Nume: ${firstName} ${lastName}\nTelefon: ${phone}\nAn: ${birthYear}\nEchipă: ${teamName}\n`,
        attachments: req.file ? [{ filename: req.file.filename, path: req.file.path }] : []
      }).catch(err => console.log("❌ sendMail error:", err));
    } else {
      console.log("⚠️ Email disabled: missing EMAIL_USER/EMAIL_PASS");
    }

  } catch (err) {
    console.log("❌ /register error:", err);
    if (!res.headersSent) res.status(500).send("Eroare server");
  }
});

//  Простая защита админки токеном
function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"]; // будем слать из админки
  if (!process.env.ADMIN_TOKEN) return res.status(500).send("ADMIN_TOKEN missing");
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).send("Unauthorized");
  next();
}

app.get("/teams", async (req, res) => {
  const teams = await Team.find()
  res.json(teams)
})


app.listen(process.env.PORT || 5000, () =>
  console.log("Server running on port", process.env.PORT || 5000)
);