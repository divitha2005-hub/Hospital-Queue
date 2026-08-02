const mongoose = require("mongoose");
const Patient = require("./models/Patient");
const Doctor = require("./models/Doctor");
const Bed = require("./models/Bed");

/**
 * DatabaseEngine (Singleton Pattern)
 * Manages persistent storage using MongoDB (Mongoose ODM) for patients, doctors, and bed allocations.
 */
class DatabaseEngine {
    constructor() {
        if (DatabaseEngine.instance) {
            return DatabaseEngine.instance;
        }
        DatabaseEngine.instance = this;
    }

    static getInstance() {
        if (!DatabaseEngine.instance) {
            DatabaseEngine.instance = new DatabaseEngine();
        }
        return DatabaseEngine.instance;
    }

    /**
     * Connect to MongoDB and seed default static structures if needed
     */
    async connect(uri) {
        try {
            await mongoose.connect(uri);
            console.log("✅ MongoDB successfully connected to Atlas cluster.");
            await this.seedIfNeeded();
        } catch (err) {
            console.error("❌ MongoDB connection error:", err);
            throw err;
        }
    }

    async seedIfNeeded() {
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
        const docs = await Patient.find({ stateName: "Waiting" });
        return docs.map(d => d.toObject());
    }

    async getHistory() {
        const docs = await Patient.find({ stateName: { $ne: "Waiting" } });
        return docs.map(d => d.toObject());
    }

    async getDoctors() {
        const docs = await Doctor.find();
        const map = {};
        docs.forEach(d => {
            map[d.id] = { id: d.id, name: d.name, specialty: d.specialty, available: d.available, patientId: d.patientId };
        });
        return map;
    }

    async getBeds() {
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
        const docs = await Bed.find({ occupied: true });
        const map = {};
        docs.forEach(b => {
            map[b.bedNumber] = b.patientId;
        });
        return map;
    }

    async savePatient(patientData) {
        await Patient.findOneAndUpdate(
            { id: patientData.id },
            patientData,
            { upsert: true, returnDocument: 'after' }
        );
    }

    async saveHistoryPatient(patientData) {
        await Patient.findOneAndUpdate(
            { id: patientData.id },
            patientData,
            { upsert: true, returnDocument: 'after' }
        );
    }

    async updateDoctorAvailability(docId, available, patientId = null) {
        await Doctor.findOneAndUpdate(
            { id: docId },
            { available, patientId }
        );
    }

    async allocateBed(bedNumber, category, patientId) {
        await Bed.findOneAndUpdate(
            { bedNumber },
            { occupied: true, patientId }
        );
    }

    async releaseBed(bedNumber, category) {
        await Bed.findOneAndUpdate(
            { bedNumber },
            { occupied: false, patientId: null }
        );
    }

    async resetAll() {
        await Patient.deleteMany({});
        await Doctor.deleteMany({});
        await Bed.deleteMany({});
        await this.seedIfNeeded();
    }
}

module.exports = DatabaseEngine;
