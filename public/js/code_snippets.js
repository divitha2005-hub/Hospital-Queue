/**
 * Stores raw string versions of the design pattern code to display in the Code Inspector UI.
 */

const PATTERN_CODE = {
    factory: `// Factory Design Pattern (Creational)
// Location: js/patterns/factory.js

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

    singleton: `// Singleton Design Pattern (Creational)
// Location: js/patterns/singleton.js

class TriageDesk {
    constructor() {
        if (TriageDesk.instance) {
            return TriageDesk.instance;
        }
        this.queue = [];
        this.observers = [];
        this.history = [];
        TriageDesk.instance = this;
    }

    static getInstance() {
        if (!TriageDesk.instance) {
            TriageDesk.instance = new TriageDesk();
        }
        return TriageDesk.instance;
    }

    addPatient(patient) {
        this.queue.push(patient);
        this.sortQueue();
        this.notifyObservers("patientAdded", patient);
    }

    sortQueue() {
        this.queue.sort((a, b) => {
            // Sort by Category Priority (Emergency first, then OPD, then Follow-up)
            const prioA = a.getCategoryPriority();
            const prioB = b.getCategoryPriority();
            if (prioA !== prioB) return prioA - prioB;

            // Sort by Severity Score (10 down to 1) within category
            if (a.severityScore !== b.severityScore) {
                return b.severityScore - a.severityScore;
            }

            // FIFO sorting for same severity
            return a.registeredTime - b.registeredTime;
        });
    }
}`,

    observer: `// Observer Design Pattern (Behavioral)
// Location: js/patterns/observer.js

// Subject / Observable Interface is integrated in TriageDesk (Singleton)
// observers list: this.observers = []
// registerObserver(obs), removeObserver(obs), notifyObservers(event, data)

class QueueObserver {
    update(event, data, queue) {
        throw new Error("Must implement update()");
    }
}

// Concrete Observer: Patient display terminal
class WaitingAreaDisplayObserver extends QueueObserver {
    constructor(renderCallback) {
        super();
        this.renderCallback = renderCallback;
    }
    update(event, data, queue) {
        this.renderCallback(queue); // Update waiting display screen
    }
}

// Concrete Observer: Doctor dashboard monitor
class DoctorConsoleObserver extends QueueObserver {
    constructor(renderCallback) {
        super();
        this.renderCallback = renderCallback;
    }
    update(event, data, queue) {
        this.renderCallback(queue); // Update patient lists in doctor consoles
    }
}`,

    state: `// State Design Pattern (Behavioral)
// Location: js/patterns/state.js

class PatientState {
    next(patient, option) { throw new Error("Not implemented"); }
    escalate(patient, issue, chain) { throw new Error("Not implemented"); }
}

// Concrete State: Patient is in the Queue
class WaitingState extends PatientState {
    getStateName() { return "Waiting"; }
    next(patient, doctor) {
        patient.assignedDoctor = doctor;
        patient.state = new ConsultationState();
    }
    escalate(patient, issue, escalationChain) {
        return escalationChain.handleRequest(patient, issue);
    }
}

// Concrete State: Patient is currently with a Doctor
class ConsultationState extends PatientState {
    getStateName() { return "Consultation"; }
    next(patient, decision) {
        if (decision === 'admit') {
            patient.state = new AdmittedState();
        } else {
            patient.state = new DischargedState();
        }
    }
    escalate(patient, issue, escalationChain) {
        return escalationChain.handleRequest(patient, issue);
    }
}`,

    facade: `// Facade Design Pattern (Structural)
// Location: js/patterns/facade.js

// Complex Subsystems: BedManager, DoctorScheduler, BillingSystem
class BedManager { ... allocateBed(patientId, category) { ... } }
class DoctorScheduler { ... assignDoctor(patient) { ... } }
class BillingSystem { ... calculateInitialBill(patient, category, days) { ... } }

// Unified Facade Interface
class AdmissionFacade {
    constructor() {
        this.bedManager = new BedManager();
        this.doctorScheduler = new DoctorScheduler();
        this.billingSystem = new BillingSystem();
    }

    admitPatient(patient, bedCategory, durationDays) {
        // Orchestrate subsystems simply
        const bed = this.bedManager.allocateBed(patient.id, bedCategory);
        const doctor = this.doctorScheduler.assignDoctor(patient);
        const bill = this.billingSystem.calculateInitialBill(patient, bedCategory, durationDays);
        
        // Update patient state using State Pattern
        patient.state.next(patient, 'admit'); 
        
        return { bed, doctor, billTotal: bill.total };
    }
    
    dischargePatient(patient) {
        this.bedManager.releaseBed(patient.id);
        this.doctorScheduler.releaseDoctor(patient.assignedDoctor);
        this.billingSystem.finalizeInvoice(patient.billingSummary);
        patient.state.next(patient); // consultation/admitted -> discharged
    }
}`,

    chain: `// Chain of Responsibility Design Pattern (Behavioral)
// Location: js/patterns/chain.js

class EscalationHandler {
    setNext(handler) {
        this.nextHandler = handler;
        return handler;
    }
    handleRequest(patient, issue) {
        if (this.nextHandler) {
            return this.nextHandler.handleRequest(patient, issue);
        }
        return "Escalation chain exhausted.";
    }
}

// Handler 1: Nurse (Handles low severity issues <= 3)
class NurseHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        if (patient.severityScore <= 3) {
            return \`Nurse resolved: baseline monitoring. Case closed.\`;
        }
        return super.handleRequest(patient, issue); // Escalate
    }
}

// Handler 2: Junior Doctor (Handles moderate severity issues <= 7)
class JuniorDoctorHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        if (patient.severityScore <= 7) {
            return \`Junior Doctor resolved: prescribed medications. Case closed.\`;
        }
        return super.handleRequest(patient, issue); // Escalate
    }
}

// Handler 3: Specialist (Handles critical issues > 7)
class SpecialistHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        return \`Specialist resolved: scheduled emergency ICU admission.\`;
    }
}`
};
