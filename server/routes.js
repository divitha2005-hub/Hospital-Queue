const express = require("express");
const router = express.Router();
const DatabaseEngine = require("./db");
const { PatientFactory } = require("./patterns/factory");
const { StateFactory } = require("./patterns/state");
const { NurseHandler, JuniorDoctorHandler, SpecialistHandler } = require("./patterns/chain");
const AdmissionFacade = require("./patterns/facade");

const db = DatabaseEngine.getInstance();
const admissionFacade = new AdmissionFacade();

// SSE Client list for network-based Observer Pattern
let sseClients = [];

/**
 * Helper to sort triage queue by category and severity
 */
function sortQueue(patients) {
    const categoryPriority = { "Emergency": 1, "OPD": 2, "Follow-up": 3, "FollowUp": 3 };
    return patients.sort((a, b) => {
        const priorityA = categoryPriority[a.triageType] || 3;
        const priorityB = categoryPriority[b.triageType] || 3;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        if (b.severityScore !== a.severityScore) {
            return b.severityScore - a.severityScore;
        }
        return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

/**
 * Broadcast Event Helper (Observer Pattern over Server-Sent Events)
 */
function broadcastEvent(eventType, payload) {
    sseClients.forEach(res => {
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
}

// -------------------------------------------------------------
// 1. Server-Sent Events Endpoint (Observer Registration)
// -------------------------------------------------------------
router.get("/events", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });
    
    res.write("data: { \"status\": \"observer_connected\" }\n\n");
    sseClients.push(res);
    
    req.on("close", () => {
        sseClients = sseClients.filter(c => c !== res);
    });
});

// -------------------------------------------------------------
// 2. Patient Operations Endpoints
// -------------------------------------------------------------

// Retrieve Queue and History Lists
router.get("/patients", (req, res) => {
    try {
        const activePatients = sortQueue(db.getPatients());
        const historyPatients = db.getHistory();
        const doctors = db.getDoctors();
        const beds = db.getBeds();
        const allocatedBeds = db.getAllocatedBeds();

        res.json({
            queue: activePatients,
            history: historyPatients,
            doctors,
            beds,
            allocatedBeds
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register and Triage Patient (Factory Method)
router.post("/patients", (req, res) => {
    try {
        const { name, age, triageType, severityScore, symptoms } = req.body;
        
        if (!name || !age || !triageType || !severityScore) {
            return res.status(400).json({ error: "Missing required triage values: name, age, triageType, severityScore." });
        }

        const patientId = "P-" + (Date.now().toString().slice(-5));
        
        // Factory Method instantiates concrete Patient model
        const patientInstance = PatientFactory.createPatient(patientId, name, age, triageType, severityScore, symptoms);
        const patientData = patientInstance.serialize();

        // Save active patient
        const patients = db.getPatients();
        patients.push(patientData);
        db.writeRaw({
            ...db.readRaw(),
            patients: sortQueue(patients)
        });

        // Broadcast updates to all connected browser Observers
        broadcastEvent("queueUpdated", { queue: sortQueue(patients) });

        res.status(201).json(patientData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// 3. Consultation / Doctor Endpoints
// -------------------------------------------------------------

// Doctor Calls Patient (State Pattern Validation)
router.post("/consultations/call", (req, res) => {
    try {
        const { docId } = req.body;
        if (!docId) {
            return res.status(400).json({ error: "Missing doctor ID." });
        }

        const doctorsMap = db.getDoctors();
        const doctor = doctorsMap[docId];
        if (!doctor) {
            return res.status(404).json({ error: "Doctor not found." });
        }

        if (!doctor.available) {
            return res.status(400).json({ error: "Doctor is currently consulting another patient." });
        }

        const activeQueue = sortQueue(db.getPatients());
        if (activeQueue.length === 0) {
            return res.status(400).json({ error: "No patients currently waiting in triage queue." });
        }

        // Dequeue top patient
        const patientData = activeQueue.shift();
        
        // Reconstitute class instance and state
        const patient = PatientFactory.reconstitute(patientData);
        const state = StateFactory.getState(patient.stateName);
        
        // State Pattern transitions from Waiting to Consultation
        state.next(patient, doctor);

        // Update Doctor status
        db.updateDoctorAvailability(docId, false, patient.id);
        
        // Update patient list in DB
        db.writeRaw({
            ...db.readRaw(),
            patients: activeQueue
        });
        db.saveHistoryPatient(patient.serialize());

        // Broadcast queue update & doctor consoles refresh
        broadcastEvent("queueUpdated", { 
            queue: activeQueue, 
            doctorCalled: patient.serialize() 
        });

        res.json(patient.serialize());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clinical Case Escalation (Chain of Responsibility)
router.post("/consultations/escalate", (req, res) => {
    try {
        const { patientId, issue } = req.body;
        if (!patientId || !issue) {
            return res.status(400).json({ error: "Missing parameters: patientId, issue." });
        }

        const allPatients = [...db.getPatients(), ...db.getHistory()];
        const patientData = allPatients.find(p => p.id === patientId);
        if (!patientData) {
            return res.status(404).json({ error: "Patient record not found." });
        }

        const patient = PatientFactory.reconstitute(patientData);
        
        // Setup Escalation Chain
        const nurse = new NurseHandler();
        const juniorDoc = new JuniorDoctorHandler();
        const specialist = new SpecialistHandler();
        nurse.setNext(juniorDoc).setNext(specialist);

        // State delegates to chain
        const currentState = StateFactory.getState(patient.stateName);
        const resolution = currentState.escalate(patient, issue, nurse);

        // Adjust triage severity score dynamically if critical
        if (patient.severityScore < 9 && issue.toLowerCase().includes("critical")) {
            patient.severityScore = 9;
        } else if (patient.severityScore < 7) {
            patient.severityScore += 2;
        }

        // Save updates
        if (db.getPatients().some(p => p.id === patient.id)) {
            db.savePatient(patient.serialize());
        } else {
            db.saveHistoryPatient(patient.serialize());
        }

        broadcastEvent("queueUpdated", { escalated: patient.serialize() });

        res.json({ resolution, patient: patient.serialize() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// 4. Facade Admissions & Billing Endpoints
// -------------------------------------------------------------

// Admit Patient (AdmissionFacade coordinates Bed, Doctor, Bill subsystems)
router.post("/admissions/admit", (req, res) => {
    try {
        const { patientId, bedCategory, durationDays } = req.body;
        if (!patientId || !bedCategory || !durationDays) {
            return res.status(400).json({ error: "Missing parameters: patientId, bedCategory, durationDays." });
        }

        const history = db.getHistory();
        const patientData = history.find(p => p.id === patientId);
        if (!patientData) {
            return res.status(404).json({ error: "Patient record not found in system." });
        }

        const patient = PatientFactory.reconstitute(patientData);
        
        // Invoke AdmissionFacade
        const result = admissionFacade.admitPatient(patient, bedCategory, parseInt(durationDays));

        // Free doctor shift that was consulting
        const doctors = db.getDoctors();
        for (let key in doctors) {
            if (doctors[key].patientId === patient.id) {
                db.updateDoctorAvailability(key, true, null);
            }
        }

        broadcastEvent("queueUpdated", { admitted: patient.serialize() });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Process Payment & Discharge (Facade processes bill, releases bed, frees doctor)
router.post("/admissions/discharge", (req, res) => {
    try {
        const { patientId } = req.body;
        if (!patientId) {
            return res.status(400).json({ error: "Missing patientId parameter." });
        }

        const history = db.getHistory();
        const patientData = history.find(p => p.id === patientId);
        if (!patientData) {
            return res.status(404).json({ error: "Patient record not found." });
        }

        const patient = PatientFactory.reconstitute(patientData);
        
        // Invoke Facade
        const invoice = admissionFacade.dischargePatient(patient);

        broadcastEvent("queueUpdated", { discharged: patient.serialize() });

        res.json(invoice);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Direct Outpatient Discharge (No Admission)
router.post("/consultations/discharge", (req, res) => {
    try {
        const { patientId } = req.body;
        if (!patientId) {
            return res.status(400).json({ error: "Missing patientId." });
        }

        const history = db.getHistory();
        const patientData = history.find(p => p.id === patientId);
        if (!patientData) {
            return res.status(404).json({ error: "Patient record not found." });
        }

        const patient = PatientFactory.reconstitute(patientData);
        const currentState = StateFactory.getState(patient.stateName);
        
        // Transition state to DischargedState directly
        currentState.next(patient, 'discharge');

        // Free doctor shift
        const doctors = db.getDoctors();
        for (let key in doctors) {
            if (doctors[key].patientId === patient.id) {
                db.updateDoctorAvailability(key, true, null);
            }
        }

        db.saveHistoryPatient(patient.serialize());

        broadcastEvent("queueUpdated", { discharged: patient.serialize() });

        res.json(patient.serialize());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset System
router.post("/reset", (req, res) => {
    try {
        db.resetAll();
        broadcastEvent("queueUpdated", { reset: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
