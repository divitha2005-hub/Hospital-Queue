# BioCare EHR - Design-Pattern Driven Enterprise Health Record System

BioCare EHR is a high-fidelity, interactive clinical workspace and hospital queue simulator built to demonstrate advanced software engineering architectures and **7 GoF (Gang of Four) Design Patterns** in a live Node.js, Express, and MongoDB environment.

The system manages real-time patient triaging, physician consult channels, priority queue sorting, ward bed allocations, severity-based clinical escalations, and customizable billing policies.

---

## 🏛️ System Architecture & Design Patterns

BioCare EHR leverages a series of design patterns to ensure loose coupling, modularity, and high-fidelity runtime simulation:

### 1. Creational Patterns
*   **Singleton Pattern (`DatabaseEngine`)**
    *   **Implementation**: `server/db.js`
    *   **Purpose**: Ensures a single, authoritative connection pool to the MongoDB Atlas cluster. It prevents concurrent database locking and acts as the unique gateway for patient, doctor, and bed data reads/writes.
*   **Factory Method Pattern (`PatientFactory`)**
    *   **Implementation**: `server/patterns/factory.js`
    *   **Purpose**: Encapsulates the instantiation of different patient categories. Depending on the triage desk inputs, the factory instantiates concrete subclasses (`OPDPatient`, `EmergencyPatient`, `FollowUpPatient`) which map mongoose schemas to distinct severity rules and base consultation fees.

### 2. Behavioral Patterns
*   **State Pattern (`PatientState`)**
    *   **Implementation**: `server/patterns/state.js`
    *   **Purpose**: Manages the patient's lifecycle transitions (`WaitingState` ➔ `ConsultationState` ➔ `AdmittedState` ➔ `DischargedState`). Illegal operations (e.g. attempting to discharge a patient without checking out or consult before triaging) are blocked by the state wrapper.
*   **Chain of Responsibility Pattern (`EscalationHandler`)**
    *   **Implementation**: `server/patterns/chain.js`
    *   **Purpose**: Handles clinical warnings and patient severity escalations. Warnings flow along a chain of handlers (`Nurse` ➔ `JuniorDoctor` ➔ `Specialist`). If a case has a severity score $\le 3$, it is resolved at the nurse level; if $\le 7$, it is handled by a Junior Doctor; otherwise, it escalates to the Specialist for admission.
*   **Observer Pattern (SSE Database Subject)**
    *   **Implementation**: `server/routes.js` & `public/js/app.js`
    *   **Purpose**: Synchronizes frontend displays in real-time. The server exposes a Server-Sent Events (SSE) channel `/api/events` acting as a network Subject. When the database state changes, update notifications are broadcast to all connected browser displays (Observers).
*   **Strategy Pattern (`BillingStrategy`)**
    *   **Implementation**: `server/patterns/strategy.js`
    *   **Purpose**: Encapsulates interchangeable clinical billing discount policies. During checkout (Step 6), selecting different insurance options dynamically swaps strategies (`StandardBillingStrategy`, `GovernmentInsuredStrategy`, `PremiumInsuredStrategy`, or `CorporateBillingStrategy`) to recalculate grand totals dynamically.

### 3. Structural Patterns
*   **Facade Pattern (`AdmissionFacade`)**
    *   **Implementation**: `server/patterns/facade.js`
    *   **Purpose**: Simplifies complex transactions by wrapping subsystem operations. During patient admission or discharge, the facade coordinates across the `BedManager` (booking beds), `DoctorScheduler` (allocating supervisors), and `BillingSystem` (compiling charges) models simultaneously.

---

## 💻 Technology Stack
*   **Backend**: Node.js, Express (REST API & SSE Event broadcasting)
*   **Database**: MongoDB Atlas (Mongoose ODM with polymorphic discriminators)
*   **Frontend**: Vanilla HTML5, CSS3 Grid/Flex (Frosted glassmorphism, responsive split-screen layouts, holographic splash animations), and Vanilla Javascript ES6.
*   **Testing**: Custom automated test harness assertions (`node js/test.js`)

---

## 🚀 Getting Started

### 📋 Prerequisites
*   Node.js (v16.x or higher)
*   A running MongoDB Atlas Database cluster URI

### 🔧 Installation & Setup
1.  Clone the repository:
    ```bash
    git clone <your-repo-url>
    cd hospital_queue_system
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Set up your environment variables:
    Create a `.env` file in the root directory:
    ```env
    MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/biocare_db
    PORT=8000
    ```

### 🏃 Running the Application
*   Start the development server:
    ```bash
    npm start
    ```
*   Access the EHR dashboard in your browser:
    ```
    http://localhost:8000
    ```

---

## 🧪 Verification & Testing
To run the automated backend test suite verifying the compilation and implementation of all 7 design patterns:
```bash
node js/test.js
```

### Expected Output:
```text
=== STARTING AUTOMATED DESIGN PATTERN TESTS ===
🌱 Seeding Doctor Collection...
🌱 Seeding Bed Collection...

[Singleton Pattern Test]
✅ Success: DatabaseEngine.getInstance() returns the exact same instance.

[Factory Pattern Test]
✅ Success: OPDPatient created with correct type and symptoms.
✅ Success: EmergencyPatient created with correct type and severity.

[Queue Sorting Test (Database Integration)]
✅ Success: Queue sorting correctly placed Emergency patient first.

[State Pattern Transitions Test]
✅ Success: WaitingState -> ConsultationState transition correct.

[Chain of Responsibility Test]
✅ Success: Escalated past Nurse & Junior Doctor, resolved by Specialist.

[Facade Pattern Test]
✅ Success: AdmissionFacade successfully allocated Bed & Doctor.
✅ Success: AdmissionFacade successfully discharged patient.

[Strategy Pattern Test]
✅ Success: StandardBillingStrategy calculates correct flat sum ($1600).
✅ Success: GovernmentInsuredStrategy calculates correct discounted sum ($750).
✅ Success: PremiumInsuredStrategy calculates correct discounted sum ($1150).
✅ Success: CorporateBillingStrategy calculates correct flat total discount ($1360).

🎉 ALL DESIGN PATTERN TESTS PASSED SUCCESSFULLY! 🎉
```
