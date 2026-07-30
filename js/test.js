/**
 * Automated test script to verify design patterns in the Node.js backend.
 */

const { PatientFactory } = require('../server/patterns/factory.js');
const DatabaseEngine = require('../server/db.js');
const { WaitingState, ConsultationState, AdmittedState, DischargedState } = require('../server/patterns/state.js');
const { NurseHandler, JuniorDoctorHandler, SpecialistHandler } = require('../server/patterns/chain.js');
const AdmissionFacade = require('../server/patterns/facade.js');

function runTests() {
    console.log("=== STARTING AUTOMATED DESIGN PATTERN TESTS ===");

    // Initialize Database for testing
    const db = DatabaseEngine.getInstance();
    db.resetAll();

    // 1. Singleton Test
    console.log("\n[Singleton Pattern Test]");
    const db1 = DatabaseEngine.getInstance();
    const db2 = DatabaseEngine.getInstance();
    if (db1 === db2) {
        console.log("✅ Success: DatabaseEngine.getInstance() returns the exact same instance.");
    } else {
        console.error("❌ Failure: DatabaseEngine is not a Singleton.");
        process.exit(1);
    }

    // 2. Factory Pattern Test
    console.log("\n[Factory Pattern Test]");
    const patient1 = PatientFactory.createPatient("P1", "Alice", 30, "OPD", 4, "Headache");
    const patient2 = PatientFactory.createPatient("P2", "Bob", 45, "Emergency", 9, "Chest pain");
    
    if (patient1.getPatientType() === "OPD" && patient1.symptoms === "Headache") {
        console.log("✅ Success: OPDPatient created with correct type and symptoms.");
    } else {
        console.error("❌ Failure: OPDPatient factory creation failed.");
        process.exit(1);
    }
    
    if (patient2.getPatientType() === "Emergency" && patient2.severityScore === 9) {
        console.log("✅ Success: EmergencyPatient created with correct type and severity.");
    } else {
        console.error("❌ Failure: EmergencyPatient factory creation failed.");
        process.exit(1);
    }

    // 3. Singleton Queue Sorting Test
    console.log("\n[Queue Sorting Test (Database Integration)]");
    const activePatients = [patient1.serialize(), patient2.serialize()];
    
    // Sort logic matching server.js
    const categoryPriority = { "Emergency": 1, "OPD": 2, "Follow-up": 3 };
    const sorted = activePatients.sort((a, b) => {
        const priorityA = categoryPriority[a.triageType] || 3;
        const priorityB = categoryPriority[b.triageType] || 3;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return b.severityScore - a.severityScore;
    });

    if (sorted[0].id === "P2" && sorted[1].id === "P1") {
        console.log("✅ Success: Queue sorting correctly placed Emergency patient first.");
    } else {
        console.error("❌ Failure: Queue sorting incorrect.", sorted);
        process.exit(1);
    }

    // 4. State Pattern Transitions Test
    console.log("\n[State Pattern Transitions Test]");
    const waiting = new WaitingState();
    console.log(`Initial State: ${waiting.getStateName()}`);
    
    const mockDoctor = { id: "D1", name: "Connor", specialty: "Emergency Trauma Specialist" };
    
    // Reconstitute bob
    const bobInstance = PatientFactory.reconstitute(patient2.serialize());
    
    // waiting -> consultation (requires a valid doctor object)
    const nextState = waiting.next(bobInstance, mockDoctor);
    console.log(`Transition 1 (Consultation): ${nextState.getStateName()}`);
    if (bobInstance.stateName === "Consultation" && bobInstance.assignedDoctor.name === "Connor") {
        console.log("✅ Success: WaitingState -> ConsultationState transition correct.");
    } else {
        console.error("❌ Failure: Transition 1 failed.");
        process.exit(1);
    }

    // 5. Chain of Responsibility Test
    console.log("\n[Chain of Responsibility Test]");
    const nurse = new NurseHandler();
    const junior = new JuniorDoctorHandler();
    const specialist = new SpecialistHandler();
    nurse.setNext(junior).setNext(specialist);

    // patient1 severity is 4 (should be handled by Junior Doctor)
    const res1 = nurse.handleRequest(patient1, "Mild pain escalation");
    console.log(`Severity 4 Escalation Result: "${res1}"`);
    if (res1.includes("Junior Doctor")) {
        console.log("✅ Success: Escalated past Nurse, resolved by Junior Doctor.");
    } else {
        console.error("❌ Failure: Chain of Responsibility routing failed for severity 4.");
        process.exit(1);
    }

    // patient2 severity is 9 (should be handled by Specialist)
    const res2 = nurse.handleRequest(patient2, "Critical cardiac event");
    console.log(`Severity 9 Escalation Result: "${res2}"`);
    if (res2.includes("Specialist")) {
        console.log("✅ Success: Escalated past Nurse & Junior Doctor, resolved by Specialist.");
    } else {
        console.error("❌ Failure: Chain of Responsibility routing failed for severity 9.");
        process.exit(1);
    }

    // 6. Facade Test
    console.log("\n[Facade Pattern Test]");
    const facade = new AdmissionFacade();
    
    // Admit bob
    const admission = facade.admitPatient(bobInstance, "ICU", 3);
    
    // Retrieve bob from history in database
    const dbHistory = db.getHistory();
    const dbBob = dbHistory.find(p => p.id === bobInstance.id);
    
    if (dbBob && dbBob.bedNumber && dbBob.stateName === "Admitted" && dbBob.billingSummary) {
        console.log(`✅ Success: AdmissionFacade successfully allocated Bed: ${dbBob.bedNumber}, Doctor: ${dbBob.assignedDoctor.name}, Bill Total: $${dbBob.billingSummary.total}`);
    } else {
        console.error("❌ Failure: AdmissionFacade execution failed.");
        process.exit(1);
    }

    // Discharge
    const bobReconstituted = PatientFactory.reconstitute(dbBob);
    facade.dischargePatient(bobReconstituted);
    
    const dbBobDischarged = db.getHistory().find(p => p.id === bobInstance.id);
    if (dbBobDischarged && dbBobDischarged.stateName === "Discharged" && dbBobDischarged.billingSummary.status === "Paid") {
        console.log("✅ Success: AdmissionFacade successfully discharged patient and marked bill as Paid.");
    } else {
        console.error("❌ Failure: AdmissionFacade discharge failed.");
        process.exit(1);
    }

    console.log("\n🎉 ALL DESIGN PATTERN TESTS PASSED SUCCESSFULLY! 🎉\n");
}

runTests();
