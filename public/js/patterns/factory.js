/**
 * Factory Design Pattern: Instantiates different patient categories.
 * Decouples the client code from concrete patient-type classes.
 */

// Base Patient Class
class Patient {
    constructor(id, name, age, severityScore, symptoms) {
        if (this.constructor === Patient) {
            throw new Error("Cannot instantiate abstract class Patient directly.");
        }
        this.id = id;
        this.name = name;
        this.age = age;
        this.severityScore = parseInt(severityScore) || 5; // Scale of 1 to 10
        this.symptoms = symptoms || "Routine checkup";
        this.registeredTime = new Date();
        this.assignedDoctor = null;
        this.bedNumber = null;
        this.billingSummary = null;
        this.logs = [`Patient registered at ${this.registeredTime.toLocaleTimeString()}`];

        // State pattern property: initialized to WaitingState in app logic
        this.state = null; 
    }

    // Abstract methods/properties to be overridden
    getPatientType() {
        throw new Error("Method 'getPatientType()' must be implemented.");
    }

    getCategoryPriority() {
        throw new Error("Method 'getCategoryPriority()' must be implemented.");
    }

    addLog(message) {
        const time = new Date().toLocaleTimeString();
        this.logs.push(`[${time}] ${message}`);
    }
}

// Concrete Patient: Emergency
class EmergencyPatient extends Patient {
    getPatientType() {
        return "Emergency";
    }

    getCategoryPriority() {
        return 1; // Highest priority
    }
}

// Concrete Patient: Out-Patient Department (OPD)
class OPDPatient extends Patient {
    getPatientType() {
        return "OPD";
    }

    getCategoryPriority() {
        return 2; // Medium priority
    }
}

// Concrete Patient: Follow-up
class FollowUpPatient extends Patient {
    getPatientType() {
        return "Follow-up";
    }

    getCategoryPriority() {
        return 3; // Lowest priority
    }
}

// Creator Factory Class
class PatientFactory {
    static createPatient(id, name, age, type, severityScore, symptoms) {
        switch (type.toLowerCase()) {
            case "emergency":
                return new EmergencyPatient(id, name, age, severityScore, symptoms);
            case "opd":
                return new OPDPatient(id, name, age, severityScore, symptoms);
            case "follow-up":
            case "followup":
                return new FollowUpPatient(id, name, age, severityScore, symptoms);
            default:
                throw new Error(`Unknown patient type: ${type}`);
        }
    }
}

// Export for usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PatientFactory, EmergencyPatient, OPDPatient, FollowUpPatient };
}
