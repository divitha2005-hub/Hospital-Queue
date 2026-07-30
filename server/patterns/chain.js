/**
 * Chain of Responsibility Pattern (Behavioral)
 * Passes triage escalation warnings along a chain of authorized clinical personnel.
 */

class EscalationHandler {
    constructor() {
        this.nextHandler = null;
    }

    setNext(handler) {
        this.nextHandler = handler;
        return handler;
    }

    handleRequest(patient, issue) {
        if (this.nextHandler) {
            return this.nextHandler.handleRequest(patient, issue);
        }
        return "Unresolved escalation: Escalation exceeded maximum specialist authority limit.";
    }
}

class NurseHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        if (patient.severityScore <= 3) {
            patient.addLog(`Escalation resolved by Nurse: Registered symptom warning ("${issue}"). Ordered rest and vitals check.`);
            return `Nurse resolved: Registered symptom warning ("${issue}"). Ordered rest and vitals check. Case closed.`;
        }
        
        patient.addLog(`Nurse authorized escalation: Severity level ${patient.severityScore} exceeds Nurse limit. Escalating to Junior Doctor.`);
        return super.handleRequest(patient, issue);
    }
}

class JuniorDoctorHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        if (patient.severityScore <= 7) {
            patient.addLog(`Escalation resolved by Junior Doctor: Prescribed symptom-targeted medication for "${issue}".`);
            return `Junior Doctor resolved: Prescribed medication and ordered standard tests. Case closed.`;
        }
        
        patient.addLog(`Junior Doctor authorized escalation: Severity level ${patient.severityScore} exceeds Junior Doctor limit. Escalating to Specialist.`);
        return super.handleRequest(patient, issue);
    }
}

class SpecialistHandler extends EscalationHandler {
    handleRequest(patient, issue) {
        patient.addLog(`Escalation resolved by Specialist: Initiated high-priority surgical/clinical intervention for "${issue}".`);
        return `Specialist resolved: Scheduled emergency surgical consultation and admitted to ICU/Ward. Case closed.`;
    }
}

module.exports = {
    EscalationHandler,
    NurseHandler,
    JuniorDoctorHandler,
    SpecialistHandler
};
