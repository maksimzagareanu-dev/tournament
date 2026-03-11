require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const dns = require("dns");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Resend } = require("resend");

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));

/* ================= MONGODB ================= */

dns.setServers(["1.1.1.1", "8.8.8.8"]);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const teamSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phone: String,
  birthYear: Number,
  teamName: String,
  logo: String,
});

const Team = mongoose.model("Team", teamSchema);

/* ================= FILE UPLOAD ================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

/* ================= ADMIN ================= */

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).send("ADMIN_TOKEN missing");
  }

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }

  next();
}

/* ================= ROUTES ================= */
app.post("/register", upload.single("logo"), async (req, res) => {
  try {
    const { firstName, lastName, phone, birthYear, teamName } = req.body;

    if (![2007, 2008, 2009, 2010].includes(Number(birthYear))) {
      return res.status(400).send("Invalid year");
    }

    // проверяем количество команд
    const teamCount = await Team.countDocuments();

    if (teamCount >= 12) {
      return res.status(400).send("Регистрация закрыта. Достигнут лимит команд.");
    }

    const newTeam = new Team({
      firstName,
      lastName,
      phone,
      birthYear: Number(birthYear),
      teamName,
      logo: req.file ? req.file.path : null,
    });

    await newTeam.save();

    res.send("Înregistrare reușită");

    if (process.env.RESEND_API_KEY && process.env.EMAIL_TO) {
      try {
        const { data, error } = await resend.emails.send({
          from: "Tournament <onboarding@resend.dev>",
          to: process.env.EMAIL_TO.trim(),
          subject: "Nouă echipă înscrisă",
          text: `Nume: ${firstName} ${lastName}
Telefon: ${phone}
An: ${birthYear}
Echipă: ${teamName}`,
        });

        if (error) {
          console.error("Resend error:", error);
        } else {
          console.log("Resend success:", data);
        }
      } catch (err) {
        console.error("Send catch error:", err);
      }
    }

  } catch (error) {
    console.error("Register error:", error);
    res.status(500).send("Eroare la înregistrare");
  }
});

app.get("/teams", async (req, res) => {
  try {
    const teams = await Team.find();
    res.json(teams);
  } catch (err) {
    console.log("❌ /teams error:", err);
    res.status(500).send("Server error");
  }
});

app.delete("/teams/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await Team.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).send("Not found");
    }

    res.send("Deleted");
  } catch (err) {
    console.log("❌ delete error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port", process.env.PORT || 5000);
});