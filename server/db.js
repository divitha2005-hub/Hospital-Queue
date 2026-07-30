const fs = require("fs");
const path = require("path");

/**
 * DatabaseEngine (Singleton Pattern)
 * Manages persistent storage (database.json) for patients, doctors, and bed allocations.
 * Ensures single-threaded, file-locked-like updates to prevent data race conditions.
 */
class DatabaseEngine {
    constructor() {
        if (DatabaseEngine.instance) {
            return DatabaseEngine.instance;
        }
        
        this.dbPath = path.join(__dirname, "../database.json");
        this.initDatabase();
        DatabaseEngine.instance = this;
    }

    static getInstance() {
        if (!DatabaseEngine.instance) {
            DatabaseEngine.instance = new DatabaseEngine();
        }
        return DatabaseEngine.instance;
    }

    /**
     * Set up default JSON data if file does not exist
     */
    initDatabase() {
        if (!fs.existsSync(this.dbPath)) {
            const defaultData = {
                patients: [],
                history: [],
                beds: {
                    "ICU": ["ICU-101", "ICU-102", "ICU-103", "ICU-104", "ICU-105", "ICU-106", "ICU-107", "ICU-108", "ICU-109", "ICU-110"],
                    "Private Room": ["PR-301", "PR-302", "PR-303", "PR-304", "PR-305", "PR-306", "PR-307", "PR-308", "PR-309", "PR-310"],
                    "General Ward": ["GW-201", "GW-202", "GW-203", "GW-204", "GW-205", "GW-206", "GW-207", "GW-208", "GW-209", "GW-210", "GW-211", "GW-212", "GW-213", "GW-214", "GW-215", "GW-216", "GW-217", "GW-218", "GW-219", "GW-220"]
                },
                allocatedBeds: {}, // bedNumber -> patientId
                doctors: {
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
                }
            };
            this.writeRaw(defaultData);
        }
    }

    /**
     * Read data from disk
     */
    readRaw() {
        try {
            const dataStr = fs.readFileSync(this.dbPath, "utf8");
            return JSON.parse(dataStr);
        } catch (err) {
            console.error("Database read error, restoring defaults.", err);
            this.initDatabase();
            return JSON.parse(fs.readFileSync(this.dbPath, "utf8"));
        }
    }

    /**
     * Write data to disk
     */
    writeRaw(data) {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), "utf8");
        } catch (err) {
            console.error("Database write error", err);
        }
    }

    // --- Helper Domain Operations ---

    getPatients() {
        return this.readRaw().patients || [];
    }

    getHistory() {
        return this.readRaw().history || [];
    }

    getDoctors() {
        return this.readRaw().doctors || {};
    }

    getBeds() {
        return this.readRaw().beds || {};
    }

    getAllocatedBeds() {
        return this.readRaw().allocatedBeds || {};
    }

    savePatient(patientData) {
        const db = this.readRaw();
        const index = db.patients.findIndex(p => p.id === patientData.id);
        if (index !== -1) {
            db.patients[index] = patientData;
        } else {
            db.patients.push(patientData);
        }
        this.writeRaw(db);
    }

    saveHistoryPatient(patientData) {
        const db = this.readRaw();
        // Remove from active queue
        db.patients = db.patients.filter(p => p.id !== patientData.id);
        
        const index = db.history.findIndex(p => p.id === patientData.id);
        if (index !== -1) {
            db.history[index] = patientData;
        } else {
            db.history.push(patientData);
        }
        this.writeRaw(db);
    }

    updateDoctorAvailability(docId, available, patientId = null) {
        const db = this.readRaw();
        if (db.doctors[docId]) {
            db.doctors[docId].available = available;
            db.doctors[docId].patientId = patientId;
            this.writeRaw(db);
        }
    }

    allocateBed(bedNumber, category, patientId) {
        const db = this.readRaw();
        if (db.beds[category]) {
            db.beds[category] = db.beds[category].filter(b => b !== bedNumber);
            db.allocatedBeds[bedNumber] = patientId;
            this.writeRaw(db);
        }
    }

    releaseBed(bedNumber, category) {
        const db = this.readRaw();
        if (!db.beds[category].includes(bedNumber)) {
            db.beds[category].push(bedNumber);
            db.beds[category].sort(); // Keep sorted
        }
        delete db.allocatedBeds[bedNumber];
        this.writeRaw(db);
    }

    resetAll() {
        const defaultData = {
            patients: [],
            history: [],
            beds: {
                "ICU": ["ICU-101", "ICU-102", "ICU-103", "ICU-104", "ICU-105", "ICU-106", "ICU-107", "ICU-108", "ICU-109", "ICU-110"],
                "Private Room": ["PR-301", "PR-302", "PR-303", "PR-304", "PR-305", "PR-306", "PR-307", "PR-308", "PR-309", "PR-310"],
                "General Ward": ["GW-201", "GW-202", "GW-203", "GW-204", "GW-205", "GW-206", "GW-207", "GW-208", "GW-209", "GW-210", "GW-211", "GW-212", "GW-213", "GW-214", "GW-215", "GW-216", "GW-217", "GW-218", "GW-219", "GW-220"]
            },
            allocatedBeds: {},
            doctors: {
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
            }
        };
        this.writeRaw(defaultData);
    }
}

module.exports = DatabaseEngine;
