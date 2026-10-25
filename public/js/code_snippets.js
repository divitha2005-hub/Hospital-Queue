/**
 * Stores raw string versions of the 3 justifiable design pattern codes
 * to display in the Code Inspector UI.
 */

const PATTERN_CODE = {
    factory: `// Factory Method Design Pattern (Creational)
// Location: server/patterns/factory.js & js/patterns/factory.js

// Base Abstract Patient Class
class Patient {
    constructor(id, name, age, severityScore, symptoms) {
        if (this.constructor === Patient) {
            throw new Error("Cannot instantiate abstract class Patient directly.");
        }
        this.id = id;
        this.name = name;
        this.age = age;
        this.severityScore = parseInt(severityScore) || 5;
        this.symptoms = symptoms || "Routine checkup";
        this.registeredTime = new Date();
        this.assignedDoctor = null;
        this.state = null; // Controlled by State Pattern
        this.logs = [];
    }
}

// Concrete Patient Implementations
class EmergencyPatient extends Patient {
    getPatientType() { return "Emergency"; }
    getCategoryPriority() { return 1; } // Highest Priority
}

class OPDPatient extends Patient {
    getPatientType() { return "OPD"; }
    getCategoryPriority() { return 2; } // Medium Priority
}

class FollowUpPatient extends Patient {
    getPatientType() { return "Follow-up"; }
    getCategoryPriority() { return 3; } // Lowest Priority
}

// Patient Factory
class PatientFactory {
    static createPatient(id, name, age, type, severityScore, symptoms) {
        switch (type.toLowerCase()) {
            case "emergency":
                return new EmergencyPatient(id, name, age, severityScore, symptoms);
            case "opd":
                return new OPDPatient(id, name, age, severityScore, symptoms);
            case "follow-up":
                return new FollowUpPatient(id, name, age, severityScore, symptoms);
            default:
                throw new Error("Unknown patient type");
        }
    }
}`,

    facade: `// Facade Design Pattern (Structural)
// Location: server/patterns/facade.js & js/patterns/facade.js

// Complex Subsystems: BedManager, DoctorScheduler, BillingSystem
class BedManager { ... allocateBed(category, patientId) { ... } }
class DoctorScheduler { ... assignDoctor(patient) { ... } }
class BillingSystem { ... calculateBill(...) { ... } settleInvoice(...) { ... } }

// Unified Facade Interface
class AdmissionFacade {
    constructor() {
        this.bedManager = new BedManager();
        this.doctorScheduler = new DoctorScheduler();
        this.billingSystem = new BillingSystem();
    }

    async admitPatient(patient, bedCategory, durationDays) {
        // Orchestrate subsystems behind a single atomic interface
        const bed = await this.bedManager.allocateBed(bedCategory, patient.id);
        const doctor = await this.doctorScheduler.assignDoctor(patient);
        const bill = this.billingSystem.calculateBill(patient.triageType, bedCategory, durationDays, ...);
        
        // Update patient state using State Pattern
        currentState.next(patient, 'admit'); 
        
        return { bed, doctor, billTotal: bill.total };
    }
    
    async dischargePatient(patient, insurancePlan) {
        // Coordinate bed release, doctor availability, and bill settlement
        await this.bedManager.releaseBed(patient.bedNumber, category);
        await this.doctorScheduler.freeDoctor(patient.assignedDoctor.id);
        const settled = this.billingSystem.settleInvoice(patient.billingSummary, insurancePlan);
        currentState.next(patient, 'discharge'); // Transitions to DischargedState
        return settled;
    }
}`,

    state: `// State Design Pattern (Behavioral)
// Location: server/patterns/state.js & js/patterns/state.js

class PatientState {
    next(patient, option) { throw new Error("Not implemented"); }
    escalate(patient, issue) { throw new Error("Not implemented"); }
}

// Concrete State: Patient Waiting in Triage Queue
class WaitingState extends PatientState {
    getStateName() { return "Waiting"; }
    next(patient, doctor) {
        patient.assignedDoctor = doctor;
        patient.stateName = "Consultation";
        return new ConsultationState();
    }
    escalate(patient, issue) {
        return "Triage severity evaluated and escalated.";
    }
}

// Concrete State: Patient in Consultation
class ConsultationState extends PatientState {
    getStateName() { return "Consultation"; }
    next(patient, decision) {
        if (decision === 'admit') {
            patient.stateName = "Admitted";
            return new AdmittedState();
        } else {
            patient.stateName = "Discharged";
            return new DischargedState();
        }
    }
}

// Concrete State: Inpatient Ward Admission
class AdmittedState extends PatientState {
    getStateName() { return "Admitted"; }
    next(patient, option) {
        if (option === 'discharge') {
            patient.stateName = "Discharged";
            return new DischargedState();
        }
    }
}`
};
