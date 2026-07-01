const mongoose = require("mongoose");

// User Account Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["Admin", "Pharmacist"], default: "Pharmacist" },
  createdAt: { type: Date, default: Date.now }
});

// Medicine Schema
const MedicineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String },
  dosage: { type: String },
  price: { type: Number, required: true },
  qty: { type: Number, required: true },
  threshold: { type: Number, default: 10 },
  expiry: { type: Date },
  category: { type: String, default: 'Tablet' },
  sales: [{ date: String, qty: Number, amount: Number }],
  lastStockUpdate: { type: Date, default: Date.now }
});

// Patient Schema
const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number },
  gender: { type: String },
  phone: { type: String, required: true },
  email: { type: String },
  address: { type: String }
});

// Bill Schema
const BillSchema = new mongoose.Schema({
  id: { type: String, required: true},
  date: { type: Date, default: Date.now },
  items: [{ id: String, name: String, price: Number, qty: Number }],
  total: { type: Number, required: true },
  method: { type: String, required: true },
  patientId: { type: String },
  patient: { type: String }
});

module.exports = {
  User: mongoose.model("User", UserSchema),
  Medicine: mongoose.model("Medicine", MedicineSchema),
  Patient: mongoose.model("Patient", PatientSchema),
  Bill: mongoose.model("Bill", BillSchema)
};