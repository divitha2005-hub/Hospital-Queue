const DatabaseEngine = require("../db");
const { StateFactory } = require("./state");
const { PatientFactory } = require("./factory");

/**
 * BedManager Subsystem
 * Manages allocation and tracking of available beds.
 */
class BedManager {
    constructor() {
        this.dailyRates = {
            "ICU": 2000,
            "Private Room": 1200,
            "General Ward": 500
        };
    }

    allocateBed(category, patientId, db) {
        const beds = db.getBeds();
        const availableBeds = beds[category] || [];
        
        if (availableBeds.length === 0) {
            throw new Error(`Subsystem Exception: No beds currently available in category '${category}'.`);
        }

        const bedNumber = availableBeds[0];
        db.allocateBed(bedNumber, category, patientId);
        return bedNumber;
    }

    releaseBed(bedNumber, category, db) {
        db.releaseBed(bedNumber, category);
    }

    getDailyRate(category) {
        return this.dailyRates[category] || 0;
    }
}

/**
 * DoctorScheduler Subsystem
 * Coordinates shifts and registers doctors assigned to ward occupants.
 */
class DoctorScheduler {
    assignDoctor(patient, db) {
        const doctorsMap = db.getDoctors();
        let assignedDoc = null;

        // Check if there is an available doctor
        for (let key in doctorsMap) {
            if (doctorsMap[key].available) {
                assignedDoc = doctorsMap[key];
                break;
            }
        }

        // If no doctors are available, assign Dr. Carter as supervisor
        if (!assignedDoc) {
            assignedDoc = doctorsMap["D2"];
        }

        db.updateDoctorAvailability(assignedDoc.id, false, patient.id);
        return { id: assignedDoc.id, name: assignedDoc.name, specialty: assignedDoc.specialty };
    }

    freeDoctor(docId, db) {
        db.updateDoctorAvailability(docId, true, null);
    }
}

/**
 * BillingSystem Subsystem
 * Compiles invoices and handles payments.
 */
class BillingSystem {
    constructor() {
        this.baseFees = {
            "Emergency": 250,
            "OPD": 100,
            "Follow-up": 50
        };
    }

    calculateBill(triageType, category, durationDays, dailyRate, pharmacyCharge = 0, prescriptions = []) {
        const baseFee = this.baseFees[triageType] || 50;
        const bedCharge = dailyRate * durationDays;
        const total = baseFee + bedCharge + pharmacyCharge;

        return {
            baseFee,
            bedCharge,
            durationDays,
            pharmacyCharge,
            prescriptions,
            total,
            bedCategory: category,
            status: "Unpaid"
        };
    }
}

/**
 * AdmissionFacade (Facade Pattern)
 * Orchestrates the BedManager, DoctorScheduler, and BillingSystem subsystems
 * to expose a clean, unified interface for patient admissions and checkouts.
 */
class AdmissionFacade {
    constructor() {
        this.bedManager = new BedManager();
        this.doctorScheduler = new DoctorScheduler();
        this.billingSystem = new BillingSystem();
        this.db = DatabaseEngine.getInstance();
    }

    admitPatient(patient, bedCategory, durationDays) {
        // 1. Allocate bed
        const bedNumber = this.bedManager.allocateBed(bedCategory, patient.id, this.db);
        
        // 2. Assign doctor
        const supervisingDoctor = this.doctorScheduler.assignDoctor(patient, this.db);
        
        // 3. Compile bill
        const dailyRate = this.bedManager.getDailyRate(bedCategory);
        const rx = PatientFactory.getClinicalPrescription(patient.symptoms);
        const bill = this.billingSystem.calculateBill(patient.triageType, bedCategory, durationDays, dailyRate, rx.cost, rx.prescriptions);
        
        // 4. Update Patient state using State validation pattern
        const currentState = StateFactory.getState(patient.stateName);
        currentState.next(patient, 'admit'); // Validates and transitions to AdmittedState
        
        patient.bedNumber = bedNumber;
        patient.assignedDoctor = supervisingDoctor;
        patient.billingSummary = bill;
        patient.addLog(`Admitted to room ${bedNumber}. Billing total: $${bill.total}.`);
        
        // 5. Persist patient to database
        this.db.saveHistoryPatient(patient.serialize());
        
        return {
            bed: bedNumber,
            doctor: supervisingDoctor,
            billTotal: bill.total
        };
    }

    dischargePatient(patient) {
        if (patient.stateName !== 'Admitted') {
            throw new Error("Facade Exception: Only currently admitted patients can undergo checkout.");
        }

        // 1. Release bed
        this.bedManager.releaseBed(patient.bedNumber, patient.billingSummary.bedCategory, this.db);
        
        // 2. Free doctor
        this.doctorScheduler.freeDoctor(patient.assignedDoctor.id, this.db);
        
        // 3. Settle bill
        patient.billingSummary.status = "Paid";
        
        // 4. Transition state
        const currentState = StateFactory.getState(patient.stateName);
        currentState.next(patient, 'discharge'); // Validates and transitions to DischargedState
        
        patient.addLog("Receipt paid. Released room assignment.");
        
        // 5. Persist update
        this.db.saveHistoryPatient(patient.serialize());
        
        return patient.billingSummary;
    }
}

module.exports = AdmissionFacade;
