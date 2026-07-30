/**
 * Facade Design Pattern: Administrative Subsystem Simplification.
 * An AdmissionFacade exposes one simplified interface over bed allocation, doctor assignment, and billing subsystems.
 */

// Subsystem 1: Bed Allocation Manager
class BedManager {
    constructor() {
        // Mock beds database: key is category, value is array of bed numbers
        this.beds = {
            "ICU": ["ICU-101", "ICU-102", "ICU-103"],
            "General Ward": ["GW-201", "GW-202", "GW-203", "GW-204", "GW-205"],
            "Private Room": ["PR-301", "PR-302"]
        };
        this.allocatedBeds = new Map(); // patientId -> bedNumber
    }

    allocateBed(patientId, category) {
        const availableBeds = this.beds[category];
        if (!availableBeds || availableBeds.length === 0) {
            // Fallback to general ward if requested category is full
            if (category !== "General Ward" && this.beds["General Ward"].length > 0) {
                return this.allocateBed(patientId, "General Ward");
            }
            throw new Error(`No beds available in ${category} or fallback wards.`);
        }
        const bed = availableBeds.pop();
        this.allocatedBeds.set(patientId, { bed, category });
        return bed;
    }

    releaseBed(patientId) {
        if (this.allocatedBeds.has(patientId)) {
            const { bed, category } = this.allocatedBeds.get(patientId);
            this.beds[category].push(bed);
            this.allocatedBeds.delete(patientId);
            return bed;
        }
        return null;
    }
}

// Subsystem 2: Doctor Scheduler
class DoctorScheduler {
    constructor() {
        this.doctors = [
            { id: "D1", name: "Sarah Connor", specialty: "Emergency Medicine", available: true },
            { id: "D2", name: "John Carter", specialty: "Internal Medicine", available: true },
            { id: "D3", name: "Gregory House", specialty: "Diagnostic Specialist", available: true }
        ];
    }

    assignDoctor(patient) {
        // Find doctor based on patient type or availability
        let doctor = null;
        if (patient.getPatientType() === "Emergency") {
            doctor = this.doctors.find(d => d.specialty === "Emergency Medicine" && d.available);
        } else if (patient.severityScore > 6) {
            doctor = this.doctors.find(d => d.specialty === "Diagnostic Specialist" && d.available);
        }
        
        // Fallback to any available doctor
        if (!doctor) {
            doctor = this.doctors.find(d => d.available);
        }

        if (doctor) {
            doctor.available = false; // Mark doctor as busy
            return doctor;
        }
        // If all busy, assign a generic duty doctor
        return { id: "D-DUTY", name: "Duty Doctor", specialty: "General Practitioner" };
    }

    releaseDoctor(doctor) {
        if (doctor && doctor.id !== "D-DUTY") {
            const docObj = this.doctors.find(d => d.id === doctor.id);
            if (docObj) {
                docObj.available = true;
            }
        }
    }
}

// Subsystem 3: Billing System
class BillingSystem {
    constructor() {
        this.rates = {
            "Emergency": 500,
            "OPD": 150,
            "Follow-up": 100,
            "bedRates": {
                "ICU": 2000,
                "General Ward": 500,
                "Private Room": 1200
            }
        };
    }

    calculateInitialBill(patient, bedCategory, durationDays) {
        const baseFee = this.rates[patient.getPatientType()] || 100;
        const bedRate = this.rates.bedRates[bedCategory] || 0;
        const bedCharge = bedRate * durationDays;
        const total = baseFee + bedCharge;

        return {
            patientId: patient.id,
            baseFee,
            bedCategory,
            bedCharge,
            durationDays,
            total,
            status: "Unpaid"
        };
    }

    generateInvoice(bill) {
        return `
========================================
         HOSPITAL BILLING INVOICE
========================================
Patient ID  : ${bill.patientId}
Base Triage Fee   : $${bill.baseFee}
Bed Category      : ${bill.bedCategory}
Stay Duration     : ${bill.durationDays} day(s)
Bed Charges       : $${bill.bedCharge} ($${bill.bedCharge / (bill.durationDays || 1)}/day)
----------------------------------------
GRAND TOTAL       : $${bill.total}
Payment Status    : ${bill.status}
========================================`;
    }
}

// Facade Class exposing a simplified interface
class AdmissionFacade {
    constructor() {
        this.bedManager = new BedManager();
        this.doctorScheduler = new DoctorScheduler();
        this.billingSystem = new BillingSystem();
    }

    admitPatient(patient, bedCategory, durationDays) {
        patient.addLog(`[Admission Facade] Initializing admission process...`);

        // 1. Allocate bed
        const bed = this.bedManager.allocateBed(patient.id, bedCategory);
        patient.bedNumber = bed;
        patient.addLog(`[Bed Subsystem] Bed allocated: ${bed} in ${bedCategory}.`);

        // 2. Assign doctor
        const doctor = this.doctorScheduler.assignDoctor(patient);
        patient.assignedDoctor = doctor;
        patient.addLog(`[Scheduler Subsystem] Supervising physician assigned: Dr. ${doctor.name}.`);

        // 3. Generate initial bill
        const bill = this.billingSystem.calculateInitialBill(patient, bedCategory, durationDays);
        patient.billingSummary = bill;
        patient.addLog(`[Billing Subsystem] Initial invoice generated. Total: $${bill.total}.`);

        // 4. Change State to Admitted
        // State transition: waiting/consultation -> admitted
        if (patient.state && typeof patient.state.next === 'function') {
            try {
                patient.state.next(patient, 'admit');
            } catch (err) {
                // Force state if not in proper consultation yet (e.g. direct admin from triage)
                const { AdmittedState } = require('./state.js'); // fallback check if dynamic
                patient.state = new AdmittedState();
                patient.addLog(`[State Override] Forced transition to Admitted state.`);
            }
        }
        
        return {
            bed,
            doctor,
            billTotal: bill.total,
            invoiceText: this.billingSystem.generateInvoice(bill)
        };
    }

    dischargePatient(patient) {
        patient.addLog(`[Admission Facade] Initializing discharge process...`);

        // 1. Release bed
        const bedReleased = this.bedManager.releaseBed(patient.id);
        if (bedReleased) {
            patient.addLog(`[Bed Subsystem] Bed released: ${bedReleased}.`);
        }

        // 2. Release doctor
        if (patient.assignedDoctor) {
            this.doctorScheduler.releaseDoctor(patient.assignedDoctor);
            patient.addLog(`[Scheduler Subsystem] Physician Dr. ${patient.assignedDoctor.name} released.`);
        }

        // 3. Mark bill as Paid
        if (patient.billingSummary) {
            patient.billingSummary.status = "Paid";
            patient.addLog(`[Billing Subsystem] Payment received. Invoice finalized.`);
        }

        // 4. State transition
        if (patient.state && typeof patient.state.next === 'function') {
            patient.state.next(patient);
        }

        return patient.billingSummary ? this.billingSystem.generateInvoice(patient.billingSummary) : "No bill generated.";
    }
}

// Export for usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        AdmissionFacade,
        BedManager,
        DoctorScheduler,
        BillingSystem
    };
}
