# 🏥 BioCare EHR - Hospital Queue & Clinical Workflow Management System

[![JavaScript](https://img.shields.io/badge/Language-ES6%20JavaScript-f7df1e.svg?style=flat-square&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Runtime-Node.js-339933.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Framework-Express%20v4-000000.svg?style=flat-square&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB%20Atlas-47A248.svg?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**BioCare EHR** is a full-stack, enterprise-grade hospital queue management and triage application. Designed to model real-world clinical healthcare workflows, the platform automates emergency triage evaluation, priority patient queuing, physician consultations, inpatient ward bed assignments, and billing invoice checkout.

The system is engineered around **Three Core Gang of Four (GoF) Design Patterns**:
* 🏗️ **Creational**: **Factory Method Pattern** (`PatientFactory`)
* 🏛️ **Structural**: **Facade Pattern** (`AdmissionFacade`)
* 🔄 **Behavioral**: **State Pattern** (`PatientState`)

---

## 🏛️ System Architecture

BioCare EHR employs a decoupled **Three-Tier Architecture**:
* **Presentation Tier**: Responsive HTML5, CSS3, and JavaScript front-end featuring a dynamic triage intake desk, live priority queue monitor, physician call terminals, ward occupancy map, and billing ledger.
* **Domain & Application Tier**: Express.js REST API with domain modules governed by the Factory Method, Facade, and State patterns.
* **Persistence Tier**: Dual-mode data access engine supporting primary cloud storage via MongoDB Atlas and a local, resilient JSON data store (`database.json`) for seamless offline operation.

```mermaid
flowchart TD
    subgraph PresentationTier ["1. Presentation Layer (Browser Client)"]
        UI1["Triage & Registration Desk"]
        UI2["Priority Wait Queue Monitor"]
        UI3["Physician Terminals & Consultation"]
        UI4["Inpatient Ward Occupancy Map"]
        UI5["Billing & Invoice Checkout"]
    end

    subgraph APITier ["2. Application & Routing Layer (Express.js)"]
        Routes["REST API Router\n(server/routes.js)"]
    end

    subgraph PatternTier ["3. Domain Layer: Design Patterns"]
        subgraph CreationalPattern ["Creational: Factory Method"]
            PF["PatientFactory\n(server/patterns/factory.js)"]
            P1["EmergencyPatient\n(Priority 1, Min Sev >= 7)"]
            P2["OPDPatient\n(Priority 2, Standard)"]
            P3["FollowUpPatient\n(Priority 3, Routine)"]
            PF --> P1
            PF --> P2
            PF --> P3
        end

        subgraph BehavioralPattern ["Behavioral: State Pattern"]
            PS["«Abstract» PatientState\n(server/patterns/state.js)"]
            S1["WaitingState\n(Queue Guard: Requires Doctor)"]
            S2["ConsultationState\n(Clinical Escalation Rules)"]
            S3["AdmittedState\n(Ward Bed Occupancy)"]
            S4["DischargedState\n(Terminal Immutable Sink)"]
            SF["StateFactory\n(Rehydration Helper)"]
            PS --> S1
            PS --> S2
            PS --> S3
            PS --> S4
        end

        subgraph StructuralPattern ["Structural: Facade Pattern"]
            AF["AdmissionFacade\n(server/patterns/facade.js)"]
            BM["BedManager Subsystem\n(ICU / Private / General)"]
            DS["DoctorScheduler Subsystem\n(Physician Allocation)"]
            BS["BillingSystem Subsystem\n(Tariffs & Payer Discounts)"]
            AF --> BM
            AF --> DS
            AF --> BS
        end
    end

    subgraph DataTier ["4. Persistence Layer (Dual-Mode Data Access)"]
        DB["DatabaseEngine (server/db.js)"]
        Mongo[("MongoDB Atlas\n(Mongoose ORM)")]
        LocalJSON[("database.json\n(Offline Resilient Fallback)")]
        DB -->|Primary Online| Mongo
        DB -->|Offline Fallback| LocalJSON
    end

    UI1 & UI2 & UI3 & UI4 & UI5 <-->|JSON REST HTTP Requests| Routes
    Routes --> PF
    Routes --> AF
    Routes --> PS
    AF -.->|Advances Lifecycle| PS
    PF --> DB
    AF --> DB
    PS --> DB

    classDef client fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px;
    classDef router fill:#ede9fe,stroke:#6d28d9,stroke-width:2px;
    classDef factory fill:#d1fae5,stroke:#047857,stroke-width:2px;
    classDef state fill:#fef3c7,stroke:#b45309,stroke-width:2px;
    classDef facade fill:#cffafe,stroke:#0e7490,stroke-width:2px;
    classDef db fill:#f1f5f9,stroke:#475569,stroke-width:2px;

    class UI1,UI2,UI3,UI4,UI5 client;
    class Routes router;
    class PF,P1,P2,P3 factory;
    class PS,S1,S2,S3,S4,SF state;
    class AF,BM,DS,BS facade;
    class DB,Mongo,LocalJSON db;
```

---

## 🗺️ Clinical Workflow & Pattern Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Nurse as Nurse / Intake Staff
    actor Doctor as Attending Doctor
    participant Routes as Express Router
    participant Factory as PatientFactory
    participant State as PatientState
    participant Facade as AdmissionFacade
    participant DB as DatabaseEngine

    Note over Nurse, Factory: 1. INTAKE & TRIAGE REGISTRATION
    Nurse->>Routes: POST /api/patients { name, age, triageType, symptoms }
    Routes->>Factory: PatientFactory.createPatient(type, ...)
    Factory->>Factory: Apply triage rules (Emergency severity floor >= 7)
    Factory-->>Routes: Return concrete Patient instance
    Routes->>State: Initialize State = WaitingState
    Routes->>DB: Save Patient Record to Queue

    Note over Doctor, State: 2. CONSULTATION & CLINICAL ESCALATION
    Doctor->>Routes: POST /api/consultations/call { doctorId }
    Routes->>State: WaitingState.next(patient, doctor)
    Note over State: Transition Guard validates physician assignment
    State-->>Routes: Transition to ConsultationState
    
    opt Clinical Escalation during Consultation
        Doctor->>Routes: POST /api/consultations/escalate { issue }
        Routes->>State: ConsultationState.escalate(patient, issue)
        State-->>Routes: Evaluates severity (>= 8 -> Specialist Escalation)
    end

    Note over Doctor, Facade: 3. INPATIENT WARD ADMISSION
    Doctor->>Routes: POST /api/admissions/admit { bedCategory, durationDays }
    Routes->>Facade: AdmissionFacade.admitPatient(patient, category, days)
    Facade->>DB: BedManager.allocateBed(category)
    Facade->>DB: DoctorScheduler.assignDoctor(patient)
    Facade->>DB: BillingSystem.calculateBill(...)
    Facade->>State: ConsultationState.next(patient, 'admit')
    State-->>Facade: Transition to AdmittedState
    Facade->>DB: Save Inpatient Record
    Facade-->>Routes: Return { bed, doctor, billTotal }

    Note over Nurse, Facade: 4. CHECKOUT & DISCHARGE
    Nurse->>Routes: POST /api/admissions/discharge { insurancePlan }
    Routes->>Facade: AdmissionFacade.dischargePatient(patient, plan)
    Facade->>DB: BedManager.releaseBed(bedNumber)
    Facade->>DB: DoctorScheduler.freeDoctor(docId)
    Facade->>DB: BillingSystem.settleInvoice(bill, plan)
    Facade->>State: AdmittedState.next(patient, 'discharge')
    State-->>Facade: Transition to DischargedState
    Facade->>DB: Save Settled Record (Status: Paid)
    Facade-->>Routes: Return Settled Invoice

    Note over State: TERMINAL GUARD ENFORCED
    Note over State: Subsequent transition calls are blocked (Immutable record)
```

---

## 🔍 Core Design Patterns

### 1. 🏗️ Factory Method Pattern (Creational)
* **Location**: `server/patterns/factory.js`
* **Purpose**: Encapsulates patient object instantiation and enforces triage-specific baseline rules.
* **Classes**:
  * `EmergencyPatient`: Priority score `1` (Urgent), severity score auto-floored to $\ge 7$.
  * `OPDPatient`: Priority score `2` (Medium), standard outpatient flow.
  * `FollowUpPatient`: Priority score `3` (Routine), minimal base tariff.
* **Key Capabilities**:
  * `PatientFactory.createPatient()`: Instantiates domain subclasses dynamically based on triage input.
  * `PatientFactory.reconstitute()`: Reconstructs domain class instances with methods intact from stored JSON/MongoDB records.
* **Benefit**: Removes object creation branching from route controllers and satisfies the Open/Closed Principle for new patient categories.

---

### 2. 🏛️ Facade Pattern (Structural)
* **Location**: `server/patterns/facade.js`
* **Purpose**: Exposes unified, high-level operations for complex multi-subsystem hospital workflows.
* **Subsystems Coordinated**:
  * `BedManager`: Allocates and releases beds across ICU (`$2000/day`), Private Rooms (`$1200/day`), and General Wards (`$500/day`).
  * `DoctorScheduler`: Manages physician availability, assignment, and release.
  * `BillingSystem`: Compiles itemized invoices and applies payer policies (Standard, Government Insured, Premium Private, Corporate).
* **Unified Operations**:
  * `admitPatient(patient, bedCategory, durationDays)`: Reserves bed, assigns supervising doctor, calculates billing, updates patient record, and executes the `AdmittedState` transition.
  * `dischargePatient(patient, insurancePlan)`: Releases bed, frees doctor, settles invoice with insurance subsidies, marks bill as Paid, and executes the `DischargedState` transition.
* **Benefit**: Eliminates brittle multi-step coordination across route handlers and ensures transactional integrity.

---

### 3. 🔄 State Pattern (Behavioral)
* **Location**: `server/patterns/state.js`
* **Purpose**: Governs patient lifecycle progression and encapsulates state-specific behaviors and transition guards.
* **State Lifecycle**:
  $$\text{WaitingState} \xrightarrow[\text{Assign Doctor}]{\text{next()}} \text{ConsultationState} \xrightarrow[\text{Admit directive}]{\text{next()}} \text{AdmittedState} \xrightarrow[\text{Settle checkout}]{\text{next()}} \text{DischargedState}$$
* **Classes**:
  * `PatientState` (Abstract Base): Defines lifecycle interface (`getStateName()`, `next()`, `escalate()`) with default transition guards that throw descriptive domain errors.
  * `WaitingState`: Enforces doctor assignment guard before allowing consultation. Blocks premature admission or discharge.
  * `ConsultationState`: Evaluates vital signs and clinical severity scores. Routes severe cases ($\ge 8$) to senior specialists with ICU priority.
  * `AdmittedState`: Manages inpatient ward occupancy. Requires checkout settlement to advance.
  * `DischargedState`: Terminal state. Strictly blocks any subsequent state changes or clinical escalations, protecting finalized records.
  * `StateFactory`: Utility factory for rehydrating state instances from persisted string identifiers.
* **Benefit**: Eliminates scattered string comparisons and conditional flags, ensuring that clinical workflows cannot violate operational sequencing.

---

## 📊 State Transition & Guard Matrix

| Current State | Action / Input | Transition Guard / Precondition | Next State | Clinical Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **WaitingState** | `next(patient, doctor)` | `doctor` must be valid assigned physician object | `ConsultationState` | Doctor begins clinical examination |
| **WaitingState** | `next(patient, 'admit')` | Illegal transition from waiting | *Throws Error* | Blocked: Patient must undergo consultation first |
| **ConsultationState** | `escalate(patient, issue)` | Evaluates `severityScore` & symptoms | *Retains State* | $\ge 8$: Escalated to Specialist with ICU priority |
| **ConsultationState** | `next(patient, 'admit')` | Doctor signs admission directive | `AdmittedState` | Bed allocated, supervising doctor assigned |
| **ConsultationState** | `next(patient, 'discharge')` | Doctor signs outpatient release | `DischargedState` | Outpatient discharged home directly with prescriptions |
| **AdmittedState** | `next(patient, 'discharge')` | Requires checkout settlement | `DischargedState` | Bed released, doctor freed, invoice marked Paid |
| **AdmittedState** | `escalate(patient, issue)` | Triage escalation on ward occupants | *Throws Error* | Blocked: Ward occupants cannot undergo triage queue escalation |
| **DischargedState** | *Any call to next() or escalate()* | Terminal state immutability | *Throws Error* | Blocked: Case closed; records are immutable |

---

## 🌐 REST API Reference

| Method | Endpoint | Description | Handled By |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/patients` | Retrieve active queue, history, doctors, and bed status | Database Engine |
| `POST` | `/api/patients` | Register a new patient through triage intake | **Factory Method** (`PatientFactory.createPatient`) |
| `POST` | `/api/consultations/call` | Assign doctor and call next waiting patient | **State Pattern** (`WaitingState.next`) |
| `POST` | `/api/consultations/escalate` | Escalate patient condition during consultation | **State Pattern** (`ConsultationState.escalate`) |
| `POST` | `/api/consultations/discharge`| Discharge an outpatient directly after consultation | **State Pattern** (`ConsultationState.next`) |
| `POST` | `/api/admissions/admit` | Admit patient to an inpatient ward | **Facade** (`admitPatient`) & **State** (`AdmittedState`) |
| `POST` | `/api/admissions/discharge`| Settle invoice and discharge inpatient | **Facade** (`dischargePatient`) & **State** (`DischargedState`) |
| `POST` | `/api/reset` | Reset all patients, beds, and doctors to initial state | System Utility |

---

## 🧪 Automated Testing

The project includes an automated test harness covering all three design patterns:

```bash
npm test
```

### Verified Test Output:
```text
===============================================================
   AUTOMATED VERIFICATION: 3 JUSTIFIABLE DESIGN PATTERNS
===============================================================

[1. Factory Method Pattern Test (Creational)]
  ✅ OPDPatient instantiated with correct category priority (2).
  ✅ EmergencyPatient instantiated with top triage priority (1).
  ✅ FollowUpPatient instantiated with routine priority (3).
  ✅ Factory rule enforced: Emergency patient severity score auto-floored to urgent (>= 7).
  ✅ PatientFactory.reconstitute() restored domain entity with methods intact.

[2. State Pattern Lifecycle Test (Behavioral)]
  ✅ Initial State verified: Waiting.
  ✅ Transition Guard enforced: Cannot enter Consultation without assigning a doctor.
  ✅ Transition 1 verified: WaitingState -> ConsultationState.
  ✅ State Clinical Escalation handled correctly: "Junior Doctor resolved: Prescribed medication and ordered standard tests. Case closed.".
  ✅ Transition 2 verified: ConsultationState -> AdmittedState.
  ✅ Transition 3 verified: AdmittedState -> DischargedState.
  ✅ Terminal Guard enforced: Cannot transition out of terminal DischargedState.

[3. Facade Pattern Subsystem Orchestration Test (Structural)]
  ✅ Facade admitPatient() coordinated all subsystems:
     - BedManager Subsystem: Allocated Bed ICU-101 (ICU)
     - DoctorScheduler Subsystem: Assigned Dr. Sarah Connor
     - BillingSystem Subsystem: Base $250 + Bed $8000 = Total $8360
     - State Subsystem: Transitioned to AdmittedState
  ✅ Facade dischargePatient() coordinated checkout & release:
     - BedManager Subsystem: Released bed allocation
     - DoctorScheduler Subsystem: Freed supervising doctor
     - BillingSystem Subsystem: Settled invoice ($2727) marked as Paid
     - State Subsystem: Transitioned to terminal DischargedState

===============================================================
 🎉 ALL 3 JUSTIFIABLE DESIGN PATTERN TESTS PASSED SUCCESSFULLY!
===============================================================
```

---

## 🚀 Getting Started

### 📋 Prerequisites
* **Node.js** (v16.x or higher)
* **npm** (v8.x or higher)

### ⚙️ Installation & Running
```bash
# 1. Clone the repository
git clone https://github.com/divitha2005-hub/Hospital-Queue.git
cd Hospital_Queue

# 2. Install dependencies
npm install

# 3. Configure environment (Optional - default runs in resilient offline JSON mode)
cp .env.example .env

# 4. Start the server
npm start
```

Navigate to **[http://localhost:8000](http://localhost:8000)** in your browser to access the EHR application.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
