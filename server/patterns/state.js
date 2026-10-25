/**
 * State Pattern (Behavioral)
 * Encapsulates state-specific validation and transition behaviors for the patient lifecycle:
 * Waiting -> Consultation -> Admitted -> Discharged
 */
const { PatientFactory } = require("./factory");

class PatientState {
    getStateName() {
        throw new Error("getStateName() must be implemented.");
    }
    next(patient, option) {
        throw new Error("next() transition is invalid for this state.");
    }
    escalate(patient, issue) {
        throw new Error("escalate() is invalid in this state.");
    }
}

class WaitingState extends PatientState {
    getStateName() {
        return "Waiting";
    }

    next(patient, option) {
        // Enforce doctor allocation check (option must be an object representing the doctor)
        if (!option || typeof option !== 'object' || !option.name) {
            throw new Error("State Transition Error: A patient in 'Waiting' must be assigned a valid Doctor object to enter Consultation.");
        }
        
        patient.stateName = "Consultation";
        patient.assignedDoctor = { id: option.id, name: option.name, specialty: option.specialty };
        patient.logs.push(`[State change] Consultation started with Dr. ${option.name}.`);
        return new ConsultationState();
    }

    escalate(patient, issue) {
        patient.logs.push(`[Escalation] Triage level escalated: ${issue}`);
        if (patient.severityScore <= 3) {
            return "Nurse resolved: baseline monitoring. Case closed.";
        } else if (patient.severityScore <= 7) {
            return "Junior Doctor resolved: Prescribed medication and ordered standard tests. Case closed.";
        } else {
            return "Specialist resolved: Scheduled emergency surgical consultation and admitted to ICU/Ward. Case closed.";
        }
    }
}

class ConsultationState extends PatientState {
    getStateName() {
        return "Consultation";
    }

    next(patient, option) {
        if (option === 'admit') {
            patient.stateName = "Admitted";
            // Detailed properties (e.g. bedNumber, billingSummary) will be set by the AdmissionFacade coordinate wrapper
            patient.logs.push(`[State change] Consultation resolved: Patient requires ward admission.`);
            return new AdmittedState();
        } else if (option === 'discharge') {
            patient.stateName = "Discharged";
            const rx = PatientFactory.getClinicalPrescription(patient.symptoms);
            const baseFee = patient.triageType === 'Emergency' ? 250 : patient.triageType === 'OPD' ? 100 : 50;
            patient.billingSummary = {
                baseFee: baseFee,
                bedCharge: 0,
                durationDays: 0,
                pharmacyCharge: rx.cost,
                prescriptions: rx.prescriptions,
                total: baseFee + rx.cost,
                bedCategory: "None (Outpatient)"
            };
            patient.logs.push(`[State change] Consultation resolved: Patient discharged home directly.`);
            return new DischargedState();
        } else {
            throw new Error("State Transition Error: Consultations can only resolve in 'admit' or 'discharge' directives.");
        }
    }

    escalate(patient, issue) {
        patient.logs.push(`[Escalation] Vitals warning escalated in consult: ${issue}`);
        if (patient.severityScore <= 3) {
            return "Nurse resolved: baseline monitoring. Case closed.";
        } else if (patient.severityScore <= 7) {
            return "Junior Doctor resolved: Prescribed medication and ordered standard tests. Case closed.";
        } else {
            return "Specialist resolved: Scheduled emergency surgical consultation and admitted to ICU/Ward. Case closed.";
        }
    }
}

class AdmittedState extends PatientState {
    getStateName() {
        return "Admitted";
    }

    next(patient, option) {
        if (option === 'discharge') {
            patient.stateName = "Discharged";
            patient.logs.push(`[State change] Patient fully recovered and discharged from ward.`);
            return new DischargedState();
        } else {
            throw new Error("State Transition Error: Admitted patients must undergo invoice checkout before discharge.");
        }
    }

    escalate(patient, issue) {
        throw new Error("State Escalation Error: Ward occupants cannot undergo triage queue escalation.");
    }
}

class DischargedState extends PatientState {
    getStateName() {
        return "Discharged";
    }

    next(patient, option) {
        throw new Error("State Error: Cannot transition from terminal 'Discharged' state.");
    }

    escalate(patient, issue) {
        throw new Error("State Error: Cannot run clinical escalation on a discharged patient.");
    }
}

// Helper factory to load state class from string name
class StateFactory {
    static getState(stateName) {
        switch (stateName) {
            case "Waiting":
                return new WaitingState();
            case "Consultation":
                return new ConsultationState();
            case "Admitted":
                return new AdmittedState();
            case "Discharged":
                return new DischargedState();
            default:
                return new WaitingState();
        }
    }
}

module.exports = {
    PatientState,
    WaitingState,
    ConsultationState,
    AdmittedState,
    DischargedState,
    StateFactory
};
