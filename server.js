require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const multer = require("multer")
const nodemailer = require("nodemailer")

const cors = require("cors")
const path = require("path")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use("/uploads", express.static("uploads"))
app.use(express.static("public"))

/* ================= MONGODB ================= */
const dns = require("dns");

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
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})

const upload = multer({ storage })

/* ================= EMAIL ================= */

/* ================= EMAIL ================= */

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.log("❌ EMAIL_USER / EMAIL_PASS missing in .env");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((err) => {
  if (err) console.log("❌ Mail config error:", err);
  else console.log("✅ Mail transporter ready");
});

/* ================= ROUTES ================= */

app.post("/register", upload.single("logo"), async (req, res) => {
  try {
    const { firstName, lastName, phone, birthYear, teamName } = req.body

    if (![2007,2008,2009,2010].includes(Number(birthYear))) {
      return res.status(400).send("Invalid year")
    }

    const newTeam = new Team({
      firstName,
      lastName,
      phone,
      birthYear,
      teamName,
      logo: req.file ? req.file.path : null
    })

    await newTeam.save()

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: "Nouă echipă înscrisă",
      text: `
      Nume: ${firstName} ${lastName}
      Telefon: ${phone}
      An: ${birthYear}
      Echipă: ${teamName}
      `,
      attachments: req.file ? [
        {
          filename: req.file.filename,
          path: req.file.path
        }
      ] : []
    })

    res.send("Înregistrare reușită")
  } catch (err) {
    console.log(err)
    res.status(500).send("Eroare server")
  }
})

app.get("/teams", async (req, res) => {
  const teams = await Team.find()
  res.json(teams)
})

app.delete("/teams/:id", async (req, res) => {
  try {
    const deleted = await Team.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).send("Team not found");
    res.send("Team deleted");
  } catch (err) {
    console.log(err);
    res.status(400).send("Bad id");
  }
});

app.listen(process.env.PORT || 5000, () =>
  console.log("Server running on port", process.env.PORT || 5000)
);