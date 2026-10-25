/**
 * State Design Pattern: Patient Status Lifecycle.
 * Models patient-status transitions: Waiting -> Consultation -> Admitted / Discharged.
 */

// Base Patient State
class PatientState {
    constructor() {
        if (this.constructor === PatientState) {
            throw new Error("Cannot instantiate abstract class PatientState.");
        }
    }

    next(patient, option) {
        throw new Error("Method 'next(patient, option)' must be implemented.");
    }

    escalate(patient, issue) {
        throw new Error("Method 'escalate(patient, issue)' must be implemented.");
    }

    getStateName() {
        throw new Error("Method 'getStateName()' must be implemented.");
    }
}

// Concrete State: Waiting
class WaitingState extends PatientState {
    getStateName() {
        return "Waiting";
    }

    next(patient, doctor) {
        if (!doctor || typeof doctor !== 'object') {
            throw new Error("Cannot transition to Consultation without assigning a valid doctor object.");
        }
        patient.assignedDoctor = doctor;
        patient.state = new ConsultationState();
        patient.addLog(`Called for Consultation by Dr. ${doctor.name}.`);
    }

    escalate(patient, issue) {
        patient.addLog(`Escalation triggered during Wait state. Issue: ${issue}`);
        let result = "Specialist resolved: emergency intervention.";
        if (patient.severityScore <= 3) {
            result = "Nurse resolved: baseline monitoring. Case closed.";
        } else if (patient.severityScore <= 7) {
            result = "Junior Doctor resolved: prescribed medication. Case closed.";
        }
        patient.addLog(`Escalation resolved: ${result}`);
        return result;
    }
}

// Concrete State: Consultation
class ConsultationState extends PatientState {
    getStateName() {
        return "Consultation";
    }

    next(patient, decision) {
        // decision can be 'admit' or 'discharge'
        if (decision === 'admit') {
            patient.state = new AdmittedState();
            patient.addLog(`Consultation completed. Recommended for Admission.`);
        } else if (decision === 'discharge') {
            patient.state = new DischargedState();
            patient.addLog(`Consultation completed. Patient Discharged.`);
        } else {
            throw new Error("Invalid transition choice from Consultation. Must choose 'admit' or 'discharge'.");
        }
    }

    escalate(patient, issue) {
        patient.addLog(`Doctor requested escalation during consultation. Issue: ${issue}`);
        let result = "Specialist resolved: scheduled emergency ICU admission.";
        if (patient.severityScore <= 3) {
            result = "Nurse resolved: baseline vitals monitoring.";
        } else if (patient.severityScore <= 7) {
            result = "Junior Doctor resolved: prescribed medications.";
        }
        patient.addLog(`Escalation resolved: ${result}`);
        return result;
    }
}

// Concrete State: Admitted
class AdmittedState extends PatientState {
    getStateName() {
        return "Admitted";
    }

    next(patient, option) {
        patient.state = new DischargedState();
        patient.addLog(`Treatment completed. Patient discharged from ward.`);
    }

    escalate(patient, issue) {
        patient.addLog(`Emergency ward escalation triggered. Issue: ${issue}`);
        const result = "Attending Specialist notified: immediate ward visit scheduled.";
        patient.addLog(`Escalation resolved: ${result}`);
        return result;
    }
}

// Concrete State: Discharged
class DischargedState extends PatientState {
    getStateName() {
        return "Discharged";
    }

    next(patient, option) {
        throw new Error("Patient has already been discharged. No further lifecycle states available.");
    }

    escalate(patient, issue) {
        throw new Error("Cannot escalate a discharged patient.");
    }
}

// Export for usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        PatientState, 
        WaitingState, 
        ConsultationState, 
        AdmittedState, 
        DischargedState 
    };
}
