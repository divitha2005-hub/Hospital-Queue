/**
 * Automated test script to verify design patterns in the Node.js backend.
 */
require('dotenv').config();
const { PatientFactory } = require('../server/patterns/factory.js');
const DatabaseEngine = require('../server/db.js');
const { WaitingState, ConsultationState, AdmittedState, DischargedState } = require('../server/patterns/state.js');
const { NurseHandler, JuniorDoctorHandler, SpecialistHandler } = require('../server/patterns/chain.js');
const AdmissionFacade = require('../server/patterns/facade.js');

async function runTests() {
    console.log("=== STARTING AUTOMATED DESIGN PATTERN TESTS ===");

    // Initialize Database for testing
    const db = DatabaseEngine.getInstance();
    await db.resetAll();

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
    const admission = await facade.admitPatient(bobInstance, "ICU", 3);
    
    // Retrieve bob from history in database
    const dbHistory = await db.getHistory();
    const dbBob = dbHistory.find(p => p.id === bobInstance.id);
    
    if (dbBob && dbBob.bedNumber && dbBob.stateName === "Admitted" && dbBob.billingSummary) {
        console.log(`✅ Success: AdmissionFacade successfully allocated Bed: ${dbBob.bedNumber}, Doctor: ${dbBob.assignedDoctor.name}, Bill Total: $${dbBob.billingSummary.total}`);
    } else {
        console.error("❌ Failure: AdmissionFacade execution failed.");
        process.exit(1);
    }

    // Discharge
    const bobReconstituted = PatientFactory.reconstitute(dbBob);
    await facade.dischargePatient(bobReconstituted);
    
    const dbBobDischarged = (await db.getHistory()).find(p => p.id === bobInstance.id);
    if (dbBobDischarged && dbBobDischarged.stateName === "Discharged" && dbBobDischarged.billingSummary.status === "Paid") {
        console.log("✅ Success: AdmissionFacade successfully discharged patient and marked bill as Paid.");
    } else {
        console.error("❌ Failure: AdmissionFacade discharge failed.");
        process.exit(1);
    }

    // 7. Strategy Pattern Test
    console.log("\n[Strategy Pattern Test]");
    const { StrategyFactory } = require('../server/patterns/strategy.js');
    
    const baseFee = 100;
    const bedCharge = 1000;
    const pharmacyCharge = 500;
    
    // Standard Strategy
    const standardStrategy = StrategyFactory.getStrategy("none");
    const totalStandard = standardStrategy.calculateTotal(baseFee, bedCharge, pharmacyCharge);
    if (totalStandard === 1600) {
        console.log("✅ Success: StandardBillingStrategy calculates correct flat sum ($1600).");
    } else {
        console.error(`❌ Failure: StandardBillingStrategy total incorrect: ${totalStandard}`);
        process.exit(1);
    }
    
    // Government Shield Strategy (70% Bed Disc, 30% RX Disc)
    // 100 + (1000 * 0.3) + (500 * 0.7) = 100 + 300 + 350 = 750
    const govtStrategy = StrategyFactory.getStrategy("govt");
    const totalGovt = govtStrategy.calculateTotal(baseFee, bedCharge, pharmacyCharge);
    if (totalGovt === 750) {
        console.log("✅ Success: GovernmentInsuredStrategy calculates correct discounted sum ($750).");
    } else {
        console.error(`❌ Failure: GovernmentInsuredStrategy total incorrect: ${totalGovt}`);
        process.exit(1);
    }
    
    // Premium Private Strategy (50% Consult Disc, 40% Bed Disc)
    // (100 * 0.5) + (1000 * 0.6) + 500 = 50 + 600 + 500 = 1150
    const premiumStrategy = StrategyFactory.getStrategy("premium");
    const totalPremium = premiumStrategy.calculateTotal(baseFee, bedCharge, pharmacyCharge);
    if (totalPremium === 1150) {
        console.log("✅ Success: PremiumInsuredStrategy calculates correct discounted sum ($1150).");
    } else {
        console.error(`❌ Failure: PremiumInsuredStrategy total incorrect: ${totalPremium}`);
        process.exit(1);
    }

    // Corporate Partner Strategy (Flat 15% Disc)
    // 1600 * 0.85 = 1360
    const corporateStrategy = StrategyFactory.getStrategy("corporate");
    const totalCorporate = corporateStrategy.calculateTotal(baseFee, bedCharge, pharmacyCharge);
    if (totalCorporate === 1360) {
        console.log("✅ Success: CorporateBillingStrategy calculates correct flat total discount ($1360).");
    } else {
        console.error(`❌ Failure: CorporateBillingStrategy total incorrect: ${totalCorporate}`);
        process.exit(1);
    }

    console.log("\n🎉 ALL DESIGN PATTERN TESTS PASSED SUCCESSFULLY! 🎉\n");
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
        console.error("Mongoose test setup failed:", err);
        process.exit(1);
    });
