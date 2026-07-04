const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Client } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { Medicine, Patient, Bill, User } = require("./models/Schemas");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const JWT_SECRET = "KAMALESH"; // Remember to use an environment variable in production

// ======================== MONGOOSE DATABASE CONNECTION ========================
mongoose.connect(process.env.MONGO_URI)
JWT_SECRET=KAMALESH
  .then(async () => {
    console.log("💾 Connected to MongoDB");
    
    // --- AUTOMATIC CONFLICTING INDEX CLEANUP DROP ---
    try {
      const collections = await mongoose.connection.db.listCollections({ name: 'bills' }).toArray();
      if (collections.length > 0) {
        // Forcefully drops the old unique billId_1 index tracking restriction safely
        await mongoose.connection.db.collection('bills').dropIndex('billId_1');
        console.log("🧹 Legacy index conflict 'billId_1' dropped successfully!");
      }
    } catch (indexErr) {
      // If the index doesn't exist or is already dropped, ignore the error and proceed safely
      console.log("ℹ️ Index cleanup skipped (already dropped or not present).");
    }
    // ------------------------------------------------
  })
  .catch(err => console.error("Database connection error:", err));
// ======================== WHATSAPP BOT CLIENT INIT ========================
const client = new Client({
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on("qr", (qr) => {
  console.log("📱 Scan this QR code:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => console.log("✅ WhatsApp is ready!"));
client.initialize();

// Helper helper for WhatsApp alerts
// ======================== CRASH-PROOF WHATSAPP ALERT FUNCTION ========================
async function triggerWhatsAppAlert(medName, remainingQty) {
  const message = `🚨 *MEDILONG RESTOCK ALERT*\n\n💊 *${medName}* is low on stock.\n📦 Remaining: *${remainingQty} units*.\n\n⚠️ Please restock immediately.`;
  
  try {
    // 1. Clean the target number to ensure no extra symbols are present
    const cleanNumber = "918300113008".replace(/[^0-9]/g, ""); 
    
    // 2. Append the classic user suffix explicitly
    const formattedUser = `${cleanNumber}@c.us`;
    
    // 3. Send via the raw message pipeline—this bypasses the getChat LID lookup bug entirely
    await client.sendMessage(formattedUser, message);
    console.log(`📱 WhatsApp low-stock alert dispatched to ${cleanNumber}`);
    
  } catch (err) {
    console.error("⚠️ Direct WhatsApp delivery failed:", err.message);
  }
}

// ======================== AUTHENTICATION MIDDLEWARE ========================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer TOKEN"

  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user; // Stores user payload (id, role, name) into the request object
    next();
  });
}

// ======================== AUTHENTICATION API ENDPOINTS ========================

// 1. Register a new user (Pharmacist/Admin)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: "Email already registered." });

    // Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email, password: hashedPassword, role });
    await newUser.save();

    res.status(201).json({ success: true, message: "User registered successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Login User
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found." });

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid password." });

    // Sign JWT Token (Expires in 8 hours)
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "8h" });

    res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== PROTECTED REST API DATA ROUTES ========================

// --- MEDICINES ---
app.get("/api/medicines", authenticateToken, async (req, res) => {
  try {
    const meds = await Medicine.find();
    res.json(meds);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/medicines", authenticateToken, async (req, res) => {
  try {
    const newMed = new Medicine(req.body);
    await newMed.save();
    res.json(newMed);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put("/api/medicines/:id", authenticateToken, async (req, res) => {
  try {
    const updatedMed = await Medicine.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (updatedMed && updatedMed.qty <= updatedMed.threshold) {
      await triggerWhatsAppAlert(updatedMed.name, updatedMed.qty);
    }
    res.json(updatedMed);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete("/api/medicines/:id", authenticateToken, async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PATIENTS ---
app.get("/api/patients", authenticateToken, async (req, res) => {
  try {
    const pts = await Patient.find();
    res.json(pts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/patients", authenticateToken, async (req, res) => {
  try {
    const newPatient = new Patient(req.body);
    await newPatient.save();
    res.json(newPatient);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// --- BILLING / CHECKOUT TRANSACTIONS ---
app.get("/api/bills", authenticateToken, async (req, res) => {
  try {
    res.json(await Bill.find().sort({ date: -1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/bills", authenticateToken, async (req, res) => {
  try {
    const { billId, items, total, method, patientId, patient } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cannot process checkout: items list is missing or empty." });
    }

    const assignedId = billId || 'BILL-' + Date.now();

    // POPULATE BOTH 'id' AND 'billId' TO SATISFY LEGACY UNIQUE INDEX CONSTRAINTS
    const newBill = new Bill({
      id: assignedId,     // Satisfies the schema rule requirement
      billId: assignedId, // Satisfies the legacy unique index in MongoDB!
      date: new Date(),
      items: items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      total: parseFloat(total) || 0,
      method: method || 'CASH',
      patientId: patientId || null,
      patient: patient || 'Walk-in'
    });

    await newBill.save();
    
    // Process stock inventory decrements sequentially
    for (let item of items) {
      if (!item.id) continue;
      
      const med = await Medicine.findById(item.id);
      if (med) {
        med.qty = Math.max(0, med.qty - (parseInt(item.qty) || 0));
        
        if (!med.sales || !Array.isArray(med.sales)) {
          med.sales = [];
        }

        med.sales.push({ 
          date: new Date().toISOString().slice(0, 10), 
          qty: parseInt(item.qty) || 0, 
          amount: (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0) 
        });

        med.lastStockUpdate = new Date();
        await med.save();
        
        if (med.qty <= med.threshold) {
          await triggerWhatsAppAlert(med.name, med.qty);
        }
      }
    }

    res.status(201).json(newBill);
  } catch (err) { 
    console.error("Critical Billing Checkout Error:", err);
    res.status(500).json({ error: "Internal server validation crashed: " + err.message }); 
  }
});

// Legacy backward-compatibility endpoint for frontend-only legacy instances
app.post("/send-alert", async (req, res) => {
  const { message } = req.body;
  try {
    await client.sendMessage("918300113008@c.us", message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== SERVICE LISTENER ========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
