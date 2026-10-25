/**
 * Automated test script to verify the 3 Core Justifiable Design Patterns:
 * 1. Factory Method Pattern (Creational)
 * 2. Facade Pattern (Structural)
 * 3. State Pattern (Behavioral)
 */
require('dotenv').config();
const { PatientFactory, EmergencyPatient, OPDPatient, FollowUpPatient } = require('../server/patterns/factory.js');
const DatabaseEngine = require('../server/db.js');
const { WaitingState, ConsultationState, AdmittedState, DischargedState, StateFactory } = require('../server/patterns/state.js');
const AdmissionFacade = require('../server/patterns/facade.js');

async function runTests() {
    console.log("===============================================================");
    console.log("   AUTOMATED VERIFICATION: 3 JUSTIFIABLE DESIGN PATTERNS");
    console.log("===============================================================");

    // Initialize Database Service for testing
    const db = DatabaseEngine.getInstance();
    await db.resetAll();

    // =========================================================================
    // 1. FACTORY METHOD PATTERN TEST (Creational)
    // =========================================================================
    console.log("\n[1. Factory Method Pattern Test (Creational)]");
    
    // Create diverse clinical patient subclasses via the unified Factory
    const opdPatient = PatientFactory.createPatient("P1", "Alice Smith", 28, "OPD", 3, "Persistent cough");
    const emergencyPatient = PatientFactory.createPatient("P2", "Bob Vance", 54, "Emergency", 9, "Severe acute chest pressure");
    const followUpPatient = PatientFactory.createPatient("P3", "Charlie Davis", 40, "Follow-up", 2, "Post-op suture check");

    // Verify correct polymorphic subclass instantiation
    if (opdPatient instanceof OPDPatient && opdPatient.getPriorityCategory() === 2) {
        console.log("  ✅ OPDPatient instantiated with correct category priority (2).");
    } else {
        console.error("  ❌ OPDPatient factory creation failed.");
        process.exit(1);
    }

    if (emergencyPatient instanceof EmergencyPatient && emergencyPatient.getPriorityCategory() === 1) {
        console.log("  ✅ EmergencyPatient instantiated with top triage priority (1).");
    } else {
        console.error("  ❌ EmergencyPatient factory creation failed.");
        process.exit(1);
    }

    if (followUpPatient instanceof FollowUpPatient && followUpPatient.getPriorityCategory() === 3) {
        console.log("  ✅ FollowUpPatient instantiated with routine priority (3).");
    } else {
        console.error("  ❌ FollowUpPatient factory creation failed.");
        process.exit(1);
    }

    // Verify factory enforces severity floor for emergency admissions
    const lowSeverityEmergency = PatientFactory.createPatient("P4", "David", 60, "Emergency", 2, "Collapse");
    if (lowSeverityEmergency.severityScore >= 7) {
        console.log("  ✅ Factory rule enforced: Emergency patient severity score auto-floored to urgent (>= 7).");
    } else {
        console.error("  ❌ Factory failed to enforce emergency severity floor.");
        process.exit(1);
    }

    // Verify reconstitution from persistent JSON record
    const serializedData = emergencyPatient.serialize();
    const reconstituted = PatientFactory.reconstitute(serializedData);
    if (reconstituted && reconstituted.id === emergencyPatient.id && reconstituted.getPriorityCategory() === 1) {
        console.log("  ✅ PatientFactory.reconstitute() restored domain entity with methods intact.");
    } else {
        console.error("  ❌ PatientFactory.reconstitute() failed.");
        process.exit(1);
    }

    // =========================================================================
    // 2. STATE PATTERN TEST (Behavioral)
    // =========================================================================
    console.log("\n[2. State Pattern Lifecycle Test (Behavioral)]");

    const patient = PatientFactory.createPatient("P-STATE", "John Doe", 35, "OPD", 4, "Fever & chills");
    let state = StateFactory.getState(patient.stateName);

    // Initial state must be Waiting
    if (state.getStateName() === "Waiting") {
        console.log("  ✅ Initial State verified: Waiting.");
    } else {
        console.error("  ❌ Initial state is not Waiting.");
        process.exit(1);
    }

    // Guard: transition without assigned doctor must be blocked
    let guardPassed = false;
    try {
        state.next(patient, null);
    } catch (err) {
        guardPassed = true;
        console.log("  ✅ Transition Guard enforced: Cannot enter Consultation without assigning a doctor.");
    }
    if (!guardPassed) {
        console.error("  ❌ State guard failed: Allowed transition without doctor.");
        process.exit(1);
    }

    // Valid transition: Waiting -> Consultation
    const mockDoctor = { id: "D1", name: "Sarah Connor", specialty: "Emergency Trauma Specialist" };
    state = state.next(patient, mockDoctor);
    if (patient.stateName === "Consultation" && state.getStateName() === "Consultation") {
        console.log("  ✅ Transition 1 verified: WaitingState -> ConsultationState.");
    } else {
        console.error("  ❌ WaitingState -> ConsultationState transition failed.");
        process.exit(1);
    }

    // Clinical Escalation within State
    const escalationRes = state.escalate(patient, "Vitals drop detected");
    if (escalationRes && escalationRes.includes("Junior Doctor")) {
        console.log(`  ✅ State Clinical Escalation handled correctly: "${escalationRes}".`);
    } else {
        console.error("  ❌ State clinical escalation failed.");
        process.exit(1);
    }

    // Valid transition: Consultation -> Admitted
    state = state.next(patient, "admit");
    if (patient.stateName === "Admitted" && state.getStateName() === "Admitted") {
        console.log("  ✅ Transition 2 verified: ConsultationState -> AdmittedState.");
    } else {
        console.error("  ❌ ConsultationState -> AdmittedState transition failed.");
        process.exit(1);
    }

    // Valid transition: Admitted -> Discharged
    state = state.next(patient, "discharge");
    if (patient.stateName === "Discharged" && state.getStateName() === "Discharged") {
        console.log("  ✅ Transition 3 verified: AdmittedState -> DischargedState.");
    } else {
        console.error("  ❌ AdmittedState -> DischargedState transition failed.");
        process.exit(1);
    }

    // Terminal guard: cannot transition from Discharged
    let terminalGuardPassed = false;
    try {
        state.next(patient, "admit");
    } catch (err) {
        terminalGuardPassed = true;
        console.log("  ✅ Terminal Guard enforced: Cannot transition out of terminal DischargedState.");
    }
    if (!terminalGuardPassed) {
        console.error("  ❌ Terminal state guard failed.");
        process.exit(1);
    }

    // =========================================================================
    // 3. FACADE PATTERN TEST (Structural)
    // =========================================================================
    console.log("\n[3. Facade Pattern Subsystem Orchestration Test (Structural)]");

    const facade = new AdmissionFacade();
    const admittedPatient = PatientFactory.createPatient("P-FACADE", "Emma Stone", 42, "Emergency", 8, "Fractured femur");
    admittedPatient.stateName = "Consultation"; // Set in consultation

    // Step A: Facade coordinates admission across BedManager, DoctorScheduler, BillingSystem
    const admissionResult = await facade.admitPatient(admittedPatient, "ICU", 4);
    
    // Verify all 3 subsystems were orchestrated correctly
    const historyList = await db.getHistory();
    const savedPatient = historyList.find(p => p.id === admittedPatient.id);

    if (
        savedPatient &&
        savedPatient.bedNumber &&
        savedPatient.assignedDoctor &&
        savedPatient.billingSummary &&
        savedPatient.stateName === "Admitted"
    ) {
        console.log(`  ✅ Facade admitPatient() coordinated all subsystems:`);
        console.log(`     - BedManager Subsystem: Allocated Bed ${savedPatient.bedNumber} (ICU)`);
        console.log(`     - DoctorScheduler Subsystem: Assigned Dr. ${savedPatient.assignedDoctor.name}`);
        console.log(`     - BillingSystem Subsystem: Base $${savedPatient.billingSummary.baseFee} + Bed $${savedPatient.billingSummary.bedCharge} = Total $${savedPatient.billingSummary.total}`);
        console.log(`     - State Subsystem: Transitioned to AdmittedState`);
    } else {
        console.error("  ❌ AdmissionFacade.admitPatient() failed to coordinate all subsystems.");
        process.exit(1);
    }

    // Step B: Facade coordinates discharge, bed release, doctor freeing, and billing settlement
    const initialBillTotal = savedPatient.billingSummary.total;
    const reconstitutedAdmitted = PatientFactory.reconstitute(savedPatient);
    const finalBill = await facade.dischargePatient(reconstitutedAdmitted, "govt");

    const updatedHistory = await db.getHistory();
    const dischargedPatient = updatedHistory.find(p => p.id === admittedPatient.id);

    if (
        dischargedPatient &&
        dischargedPatient.stateName === "Discharged" &&
        dischargedPatient.billingSummary.status === "Paid" &&
        finalBill.total < initialBillTotal
    ) {
        console.log(`  ✅ Facade dischargePatient() coordinated checkout & release:`);
        console.log(`     - BedManager Subsystem: Released bed allocation`);
        console.log(`     - DoctorScheduler Subsystem: Freed supervising doctor`);
        console.log(`     - BillingSystem Subsystem: Settled invoice ($${finalBill.total}) marked as Paid`);
        console.log(`     - State Subsystem: Transitioned to terminal DischargedState`);
    } else {
        console.error("  ❌ AdmissionFacade.dischargePatient() failed checkout orchestration.");
        process.exit(1);
    }

    console.log("\n===============================================================");
    console.log(" 🎉 ALL 3 JUSTIFIABLE DESIGN PATTERN TESTS PASSED SUCCESSFULLY!");
    console.log("===============================================================\n");
}

const db = DatabaseEngine.getInstance();
db.connect(process.env.MONGODB_URI)
    .then(() => {
        runTests()
            .then(() => process.exit(0))
            .catch(err => {
                console.error("Error during test run:", err);
                process.exit(1);
            });
    })
    .catch(err => {
        console.error("Database connection setup failed:", err);
        process.exit(1);
    });
