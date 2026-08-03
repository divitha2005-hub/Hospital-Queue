const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Patient = require("./models/Patient");
const Doctor = require("./models/Doctor");
const Bed = require("./models/Bed");

/**
 * DatabaseEngine (Singleton Pattern)
 * Manages persistent storage using MongoDB (Mongoose ODM) or falls back to local database.json 
 * if MongoDB Atlas is blocked by IP Whitelisting / Offline.
 */
class DatabaseEngine {
    constructor() {
        if (DatabaseEngine.instance) {
            return DatabaseEngine.instance;
        }
        DatabaseEngine.instance = this;
        this.isLocalJSONMode = false;
        this.jsonPath = path.join(__dirname, "../database.json");
    }

    static getInstance() {
        if (!DatabaseEngine.instance) {
            DatabaseEngine.instance = new DatabaseEngine();
        }
        return DatabaseEngine.instance;
    }

    readJSON() {
        try {
            const data = fs.readFileSync(this.jsonPath, "utf8");
            return JSON.parse(data);
        } catch (err) {
            return { patients: [], history: [], beds: { "ICU": [], "Private Room": [], "General Ward": [] }, allocatedBeds: {}, doctors: {} };
        }
    }

    writeJSON(data) {
        try {
            fs.writeFileSync(this.jsonPath, JSON.stringify(data, null, 2), "utf8");
        } catch (err) {
            console.error("❌ Failed to write local JSON DB:", err);
        }
    }

    /**
     * Connect to MongoDB and seed structures, or fallback to database.json if blocked
     */
    async connect(uri) {
        try {
            console.log("⚡ Connecting to MongoDB Atlas...");
            // Use 5 seconds timeout so it fails quickly if IP is blocked
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
            console.log("✅ MongoDB successfully connected to Atlas cluster.");
            await this.seedIfNeeded();
        } catch (err) {
            console.warn("\n⚠️  MongoDB Atlas Connection Failed (IP Whitelist block or Offline).");
            console.log("🚀 Enabling local offline JSON database mode fallback (database.json)...");
            this.isLocalJSONMode = true;
            
            // Seed base structure if database.json doesn't exist
            if (!fs.existsSync(this.jsonPath)) {
                await this.resetAll();
            }
        }
    }

    async seedIfNeeded() {
        if (this.isLocalJSONMode) return;
        const docCount = await Doctor.countDocuments();
        if (docCount === 0) {
            console.log("🌱 Seeding Doctor Collection...");
            const defaultDoctors = [
                { id: "D1", name: "Sarah Connor", specialty: "Emergency Trauma Specialist", available: true, patientId: null },
                { id: "D2", name: "John Carter", specialty: "Internal Diagnostics Physician", available: true, patientId: null },
                { id: "D3", name: "Elizabeth Blackwell", specialty: "Pediatrics Coordinator", available: true, patientId: null },
                { id: "D4", name: "Gregory House", specialty: "Chief of Diagnostic Medicine", available: true, patientId: null },
                { id: "D5", name: "Meredith Grey", specialty: "General Surgery Specialist", available: true, patientId: null },
                { id: "D6", name: "Stephen Strange", specialty: "Neurosurgeon Specialist", available: true, patientId: null },
                { id: "D7", name: "Beverly Crusher", specialty: "Chief Medical Officer", available: true, patientId: null },
                { id: "D8", name: "Leonard McCoy", specialty: "Critical Care Trauma", available: true, patientId: null },
                { id: "D9", name: "Shaun Murphy", specialty: "Autism & Savant Diagnostics", available: true, patientId: null },
                { id: "D10", name: "Allison Cameron", specialty: "Immunology Specialist", available: true, patientId: null },
                { id: "D11", name: "James Wilson", specialty: "Oncology Coordinator", available: true, patientId: null },
                { id: "D12", name: "Perry Cox", specialty: "Chief of Medicine Specialist", available: true, patientId: null }
            ];
            await Doctor.insertMany(defaultDoctors);
        }

        const bedCount = await Bed.countDocuments();
        if (bedCount === 0) {
            console.log("🌱 Seeding Bed Collection...");
            const defaultBeds = [];
            
            // ICU Beds (10)
            for (let i = 101; i <= 110; i++) {
                defaultBeds.push({ bedNumber: `ICU-${i}`, category: "ICU", occupied: false, patientId: null });
            }
            // Private Rooms (10)
            for (let i = 301; i <= 310; i++) {
                defaultBeds.push({ bedNumber: `PR-${i}`, category: "Private Room", occupied: false, patientId: null });
            }
            // General Wards (20)
            for (let i = 201; i <= 220; i++) {
                defaultBeds.push({ bedNumber: `GW-${i}`, category: "General Ward", occupied: false, patientId: null });
            }
            
            await Bed.insertMany(defaultBeds);
        }
    }

    async getPatients() {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            return dbData.patients;
        }
        const docs = await Patient.find({ stateName: "Waiting" });
        return docs.map(d => d.toObject());
    }

    async getHistory() {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            return dbData.history;
        }
        const docs = await Patient.find({ stateName: { $ne: "Waiting" } });
        return docs.map(d => d.toObject());
    }

    async getPatientById(patientId) {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            const patient = dbData.patients.find(p => p.id === patientId) || dbData.history.find(p => p.id === patientId);
            return patient || null;
        }
        const doc = await Patient.findOne({ id: patientId });
        return doc ? doc.toObject() : null;
    }

    async getDoctors() {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            return dbData.doctors;
        }
        const docs = await Doctor.find();
        const map = {};
        docs.forEach(d => {
            map[d.id] = { id: d.id, name: d.name, specialty: d.specialty, available: d.available, patientId: d.patientId };
        });
        return map;
    }

    async getBeds() {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            return dbData.beds;
        }
        const docs = await Bed.find({ occupied: false });
        const map = {
            "ICU": [],
            "Private Room": [],
            "General Ward": []
        };
        docs.forEach(b => {
            if (map[b.category]) {
                map[b.category].push(b.bedNumber);
            }
        });
        Object.keys(map).forEach(k => map[k].sort());
        return map;
    }

    async getAllocatedBeds() {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            return dbData.allocatedBeds;
        }
        const docs = await Bed.find({ occupied: true });
        const map = {};
        docs.forEach(b => {
            map[b.bedNumber] = b.patientId;
        });
        return map;
    }

    async savePatient(patientData) {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            const idx = dbData.patients.findIndex(p => p.id === patientData.id);
            if (idx !== -1) {
                dbData.patients[idx] = patientData;
            } else {
                dbData.patients.push(patientData);
            }
            this.writeJSON(dbData);
            return;
        }
        await Patient.findOneAndUpdate(
            { id: patientData.id },
            patientData,
            { upsert: true, returnDocument: 'after' }
        );
    }

    async saveHistoryPatient(patientData) {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            
            // Remove from patients queue if it exists there
            dbData.patients = dbData.patients.filter(p => p.id !== patientData.id);
            
            // Upsert in history
            const idx = dbData.history.findIndex(p => p.id === patientData.id);
            if (idx !== -1) {
                dbData.history[idx] = patientData;
            } else {
                dbData.history.push(patientData);
            }
            this.writeJSON(dbData);
            return;
        }
        await Patient.findOneAndUpdate(
            { id: patientData.id },
            patientData,
            { upsert: true, returnDocument: 'after' }
        );
    }

    async updateDoctorAvailability(docId, available, patientId = null) {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            if (dbData.doctors[docId]) {
                dbData.doctors[docId].available = available;
                dbData.doctors[docId].patientId = patientId;
                this.writeJSON(dbData);
            }
            return;
        }
        await Doctor.findOneAndUpdate(
            { id: docId },
            { available, patientId }
        );
    }

    async allocateBed(bedNumber, category, patientId) {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            dbData.allocatedBeds[bedNumber] = patientId;
            // Remove from free beds
            if (dbData.beds[category]) {
                dbData.beds[category] = dbData.beds[category].filter(b => b !== bedNumber);
            }
            this.writeJSON(dbData);
            return;
        }
        await Bed.findOneAndUpdate(
            { bedNumber },
            { occupied: true, patientId }
        );
    }

    async releaseBed(bedNumber, category) {
        if (this.isLocalJSONMode) {
            const dbData = this.readJSON();
            delete dbData.allocatedBeds[bedNumber];
            // Add back to free beds if not present
            if (dbData.beds[category] && !dbData.beds[category].includes(bedNumber)) {
                dbData.beds[category].push(bedNumber);
                dbData.beds[category].sort();
            }
            this.writeJSON(dbData);
            return;
        }
        await Bed.findOneAndUpdate(
            { bedNumber },
            { occupied: false, patientId: null }
        );
    }

    async resetAll() {
        if (this.isLocalJSONMode) {
            const defaultBeds = {
                "ICU": ["ICU-101", "ICU-102", "ICU-103", "ICU-104", "ICU-105", "ICU-106", "ICU-107", "ICU-108", "ICU-109", "ICU-110"],
                "Private Room": ["PR-301", "PR-302", "PR-303", "PR-304", "PR-305", "PR-306", "PR-307", "PR-308", "PR-309", "PR-310"],
                "General Ward": ["GW-201", "GW-202", "GW-203", "GW-204", "GW-205", "GW-206", "GW-207", "GW-208", "GW-209", "GW-210", "GW-211", "GW-212", "GW-213", "GW-214", "GW-215", "GW-216", "GW-217", "GW-218", "GW-219", "GW-220"]
            };
            const defaultDoctors = {
                "D1": { id: "D1", name: "Sarah Connor", specialty: "Emergency Trauma Specialist", available: true, patientId: null },
                "D2": { id: "D2", name: "John Carter", specialty: "Internal Diagnostics Physician", available: true, patientId: null },
                "D3": { id: "D3", name: "Elizabeth Blackwell", specialty: "Pediatrics Coordinator", available: true, patientId: null },
                "D4": { id: "D4", name: "Gregory House", specialty: "Chief of Diagnostic Medicine", available: true, patientId: null },
                "D5": { id: "D5", name: "Meredith Grey", specialty: "General Surgery Specialist", available: true, patientId: null },
                "D6": { id: "D6", name: "Stephen Strange", specialty: "Neurosurgeon Specialist", available: true, patientId: null },
                "D7": { id: "D7", name: "Beverly Crusher", specialty: "Chief Medical Officer", available: true, patientId: null },
                "D8": { id: "D8", name: "Leonard McCoy", specialty: "Critical Care Trauma", available: true, patientId: null },
                "D9": { id: "D9", name: "Shaun Murphy", specialty: "Autism & Savant Diagnostics", available: true, patientId: null },
                "D10": { id: "D10", name: "Allison Cameron", specialty: "Immunology Specialist", available: true, patientId: null },
                "D11": { id: "D11", name: "James Wilson", specialty: "Oncology Coordinator", available: true, patientId: null },
                "D12": { id: "D12", name: "Perry Cox", specialty: "Chief of Medicine Specialist", available: true, patientId: null }
            };
            this.writeJSON({
                patients: [],
                history: [],
                beds: defaultBeds,
                allocatedBeds: {},
                doctors: defaultDoctors
            });
            return;
        }
        await Patient.deleteMany({});
        await Doctor.deleteMany({});
        await Bed.deleteMany({});
        await this.seedIfNeeded();
    }
}

module.exports = DatabaseEngine;
