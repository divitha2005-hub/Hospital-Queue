/**
 * Factory Method Pattern (Creational)
 * Defines a structural interface for creating Patient objects, letting subclasses decide concrete clinical properties.
 */

class Patient {
    constructor(id, name, age, triageType, severityScore, symptoms) {
        this.id = id;
        this.name = name;
        this.age = parseInt(age);
        this.triageType = triageType;
        this.severityScore = parseInt(severityScore);
        this.symptoms = symptoms || "No symptoms listed";
        this.stateName = "Waiting"; // Default State
        this.assignedDoctor = null;
        this.bedNumber = null;
        this.billingSummary = null;
        this.logs = [`Patient triage initialized as type: ${triageType}.`];
        this.createdAt = new Date().toISOString();
    }

    getPatientType() {
        return this.triageType;
    }

    getPriorityCategory() {
        return 3; // Default lowest priority
    }

    addLog(message) {
        this.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            age: this.age,
            triageType: this.triageType,
            severityScore: this.severityScore,
            symptoms: this.symptoms,
            stateName: this.stateName,
            assignedDoctor: this.assignedDoctor,
            bedNumber: this.bedNumber,
            billingSummary: this.billingSummary,
            logs: this.logs,
            createdAt: this.createdAt
        };
    }
}

class EmergencyPatient extends Patient {
    getPriorityCategory() {
        return 1; // Highest priority
    }
}

class OPDPatient extends Patient {
    getPriorityCategory() {
        return 2; // Medium priority
    }
}

class FollowUpPatient extends Patient {
    getPriorityCategory() {
        return 3; // Lowest priority
    }
}

class PatientFactory {
    static createPatient(id, name, age, type, severityScore, symptoms) {
        let patient;
        switch (type) {
            case "Emergency":
                patient = new EmergencyPatient(id, name, age, type, severityScore, symptoms);
                break;
            case "OPD":
                patient = new OPDPatient(id, name, age, type, severityScore, symptoms);
                break;
            case "Follow-up":
            case "FollowUp":
                patient = new FollowUpPatient(id, name, age, type, severityScore, symptoms);
                break;
            default:
                throw new Error(`Unknown Triage Type: ${type}`);
        }
        
        // Auto-configure default severity limits based on factory types
        if (type === "Emergency" && patient.severityScore < 5) {
            patient.severityScore = 7; // Floor emergency severity to urgent level
        }
        
        return patient;
    }

    /**
     * Reconstitute a Patient class instance from a stored JSON object
     */
    static reconstitute(data) {
        if (!data) return null;
        let patient;
        switch (data.triageType) {
            case "Emergency":
                patient = new EmergencyPatient(data.id, data.name, data.age, data.triageType, data.severityScore, data.symptoms);
                break;
            case "OPD":
                patient = new OPDPatient(data.id, data.name, data.age, data.triageType, data.severityScore, data.symptoms);
                break;
            case "Follow-up":
            case "FollowUp":
                patient = new FollowUpPatient(data.id, data.name, data.age, data.triageType, data.severityScore, data.symptoms);
                break;
            default:
                patient = new Patient(data.id, data.name, data.age, data.triageType, data.severityScore, data.symptoms);
        }
        
        // Restore properties
        patient.stateName = data.stateName || "Waiting";
        patient.assignedDoctor = data.assignedDoctor || null;
        patient.bedNumber = data.bedNumber || null;
        patient.billingSummary = data.billingSummary || null;
        patient.logs = data.logs || [];
        patient.createdAt = data.createdAt || new Date().toISOString();
        
        return patient;
    }

    static getClinicalPrescription(symptoms) {
        const symStr = (symptoms || "").toLowerCase();
        if (symStr.includes("cardiac") || symStr.includes("chest") || symStr.includes("heart")) {
            return {
                prescriptions: ["Nitroglycerin 0.4mg SL (PRN)", "Aspirin 325mg PO (QD)", "Lisinopril 10mg PO (QD)"],
                cost: 120
            };
        } else if (symStr.includes("stroke") || symStr.includes("speech") || symStr.includes("paralysis")) {
            return {
                prescriptions: ["Alteplase (tPA) IV Infusion", "Clopidogrel 75mg PO (QD)", "Atorvastatin 40mg PO (QD)"],
                cost: 450
            };
        } else if (symStr.includes("breathing") || symStr.includes("anaphylaxis") || symStr.includes("asthma")) {
            return {
                prescriptions: ["EpiPen 0.3mg IM Auto-Injector", "Methylprednisolone 40mg IV", "Albuterol Nebulizer 2.5mg"],
                cost: 180
            };
        } else if (symStr.includes("unconsciousness") || symStr.includes("head") || symStr.includes("trauma")) {
            return {
                prescriptions: ["Mannitol 20% IV Infusion", "Ondansetron 4mg IV", "Acetaminophen 500mg PO"],
                cost: 95
            };
        } else if (symStr.includes("bleeding") || symStr.includes("fracture") || symStr.includes("sprain")) {
            return {
                prescriptions: ["Morphine 4mg IV (PRN)", "Tetanus Toxoid Booster IM", "Cefazolin 1g IV Prophylaxis"],
                cost: 110
            };
        } else if (symStr.includes("fever") || symStr.includes("vomiting") || symStr.includes("abdominal")) {
            return {
                prescriptions: ["Ondansetron 4mg PO", "Amoxicillin 500mg PO (TID)", "Acetaminophen 500mg PO"],
                cost: 45
            };
        } else {
            return {
                prescriptions: ["Loratadine 10mg PO (QD)", "Ibuprofen 400mg PO (PRN)"],
                cost: 15
            };
        }
    }
}

module.exports = {
    Patient,
    EmergencyPatient,
    OPDPatient,
    FollowUpPatient,
    PatientFactory
};
