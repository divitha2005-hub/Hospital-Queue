/**
 * Chain of Responsibility Design Pattern: Clinical Escalation.
 * Requests pass along Nurse -> Junior Doctor -> Specialist until a handler capable of resolving the case is reached.
 */

// Base Handler Class
class EscalationHandler {
    constructor() {
        this.nextHandler = null;
    }

    setNext(handler) {
        this.nextHandler = handler;
        return handler; // Allows chaining: handler1.setNext(handler2).setNext(handler3)
    }

    handleRequest(patient, issue) {
        if (this.nextHandler) {
            return this.nextHandler.handleRequest(patient, issue);
        }
        return `Escalation chain exhausted. Issue: "${issue}" remains unresolved for Patient ${patient.name}.`;
    }
}

// Concrete Handler: Nurse (Triage & Minor Issues)
class NurseHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        // Nurses handle general discomfort, simple vitals, or low-severity (<=3) cases
        if (patient.severityScore <= 3) {
            patient.addLog("[Escalation Chain] Nurse handled: Provided basic first aid and vitals monitoring.");
            return `Nurse resolved: Simple pain management and baseline monitoring. Case closed.`;
        }
        
        patient.addLog("[Escalation Chain] Nurse cannot resolve. Escalating to Junior Doctor...");
        return super.handleRequest(patient, issue);
    }
}

// Concrete Handler: Junior Doctor (General Diagnostics & Consultation)
class JuniorDoctorHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        // Junior Doctors handle moderate cases (severity <= 7) and regular consultations
        if (patient.severityScore <= 7) {
            patient.addLog("[Escalation Chain] Junior Doctor handled: Checked diagnostics and administered non-surgical treatments.");
            return `Junior Doctor resolved: Prescribed medication and ordered standard tests. Case closed.`;
        }

        patient.addLog("[Escalation Chain] Junior Doctor cannot resolve. Escalating to Specialist...");
        return super.handleRequest(patient, issue);
    }
}

// Concrete Handler: Specialist (Critical Emergencies & Specialized Care)
class SpecialistHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        // Specialists handle severe, critical or complex cases (severity > 7)
        patient.addLog("[Escalation Chain] Specialist handled: Critical diagnosis, advanced medication, and surgical consultation.");
        return `Specialist resolved: Scheduled emergency surgical consultation and admitted to ICU/Ward. Case closed.`;
    }
}

// Export for usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        EscalationHandler, 
        NurseHandler, 
        JuniorDoctorHandler, 
        SpecialistHandler 
    };
}
