const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    triageType: { type: String, required: true },
    severityScore: { type: Number, required: true },
    symptoms: { type: String, default: "" },
    stateName: { type: String, default: "Waiting" },
    assignedDoctor: {
        id: String,
        name: String,
        specialty: String
    },
    bedNumber: { type: String, default: null },
    billingSummary: {
        baseFee: Number,
        bedCharge: Number,
        durationDays: Number,
        pharmacyCharge: Number,
        prescriptions: [String],
        total: Number,
        bedCategory: String,
        status: { type: String, default: "Unpaid" }
    },
    logs: [String],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Patient', patientSchema);
