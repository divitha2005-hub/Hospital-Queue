/**
 * Main application coordinator (Full-Stack EHR Edition).
 * Connects to the Express REST API endpoints and subscribes to
 * Server-Sent Events (SSE) to implement the Observer pattern across the network.
 */

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // 1. Initial State Variables
    // -------------------------------------------------------------
    let localPatients = [];
    let localHistory = [];
    let localDoctors = {};
    let localBeds = {};
    let localAllocatedBeds = {};

    // -------------------------------------------------------------
    // Symptoms Dictionary
    // -------------------------------------------------------------
    const CLINICAL_SYMPTOMS = [
        { id: "s1", label: "Cardiac Chest Pain / Pressure", category: "Emergency", severity: 10, group: "Cardiology" },
        { id: "s2", label: "Stroke Signs (Slurred speech / Face droop)", category: "Emergency", severity: 9, group: "Neurology" },
        { id: "s3", label: "Severe Breathing Distress / Anaphylaxis", category: "Emergency", severity: 9, group: "Pulmonology" },
        { id: "s4", label: "Unconsciousness / Severe Head Trauma", category: "Emergency", severity: 8, group: "Neurology" },
        { id: "s5", label: "Active Severe Arterial Bleeding", category: "Emergency", severity: 8, group: "Trauma" },
        { id: "s6", label: "High Fever (> 102°F) / Chills", category: "OPD", severity: 6, group: "General" },
        { id: "s7", label: "Acute Abdominal Pain / Cramps", category: "OPD", severity: 6, group: "Gastroenterology" },
        { id: "s8", label: "Persistent Vomiting & Dehydration", category: "OPD", severity: 5, group: "General" },
        { id: "s9", label: "Severe Migraine / Head Pressure", category: "OPD", severity: 4, group: "Neurology" },
        { id: "s10", label: "Moderate Back Pain / Spasms", category: "OPD", severity: 4, group: "Orthopedics" },
        { id: "s11", label: "Mild Cough / Sore Throat", category: "Follow-up", severity: 3, group: "General" },
        { id: "s12", label: "Minor Joint Sprains / Bruising", category: "Follow-up", severity: 3, group: "Orthopedics" },
        { id: "s13", label: "Post-Surgical Stitch Check / Removal", category: "Follow-up", severity: 2, group: "Surgery" },
        { id: "s14", label: "Routine Prescription Refill / Checkup", category: "Follow-up", severity: 1, group: "General" }
    ];

    let selectedSymptoms = [];

    function initSymptomWidget() {
        const searchInput = document.getElementById("symptoms-search-input");
        const dropdownList = document.getElementById("symptoms-dropdown-list");
        const tagsContainer = document.getElementById("selected-symptoms-tags");

        if (!searchInput || !dropdownList || !tagsContainer) return;

        // Render search options
        function renderDropdownOptions(filter = "") {
            const filtered = CLINICAL_SYMPTOMS.filter(sym => {
                const alreadySelected = selectedSymptoms.some(s => s.id === sym.id);
                const matchesFilter = sym.label.toLowerCase().includes(filter.toLowerCase()) || 
                                     sym.group.toLowerCase().includes(filter.toLowerCase());
                return !alreadySelected && matchesFilter;
            });

            if (filtered.length === 0) {
                dropdownList.innerHTML = `<div class="symptom-item" style="color:var(--text-muted); font-style:italic; font-size:0.7rem;">No symptoms found matching "${filter}"</div>`;
                return;
            }

            dropdownList.innerHTML = filtered.map(sym => {
                const sevClass = sym.category === "Emergency" ? "emergency" : sym.category === "OPD" ? "opd" : "followup";
                return `
                    <div class="symptom-item" data-id="${sym.id}">
                        <span>${sym.label} [${sym.group}]</span>
                        <span class="symptom-item-severity ${sevClass}">${sym.category} (Sev ${sym.severity})</span>
                    </div>
                `;
            }).join("");
        }

        // Search Input events
        searchInput.addEventListener("focus", () => {
            renderDropdownOptions(searchInput.value.trim());
            dropdownList.style.display = "block";
        });

        searchInput.addEventListener("input", () => {
            renderDropdownOptions(searchInput.value.trim());
        });

        // Click symptom from list
        dropdownList.addEventListener("click", (e) => {
            const item = e.target.closest(".symptom-item");
            if (!item || !item.dataset.id) return;

            const symId = item.dataset.id;
            const sym = CLINICAL_SYMPTOMS.find(s => s.id === symId);
            if (sym && !selectedSymptoms.some(s => s.id === symId)) {
                selectedSymptoms.push(sym);
                renderSelectedSymptomTags();
                updateESIRecommendationHUD();
                searchInput.value = "";
                renderDropdownOptions();
            }
        });

        // Hide dropdown on click outside
        document.addEventListener("click", (e) => {
            if (!e.target.closest(".symptoms-search-container")) {
                dropdownList.style.display = "none";
            }
        });
    }

    function renderSelectedSymptomTags() {
        const tagsContainer = document.getElementById("selected-symptoms-tags");
        if (!tagsContainer) return;

        if (selectedSymptoms.length === 0) {
            tagsContainer.innerHTML = `<div class="no-symptoms-placeholder">No symptoms selected. Type above or click to select from the list.</div>`;
            return;
        }

        tagsContainer.innerHTML = selectedSymptoms.map(sym => `
            <div class="symptom-tag" id="tag-${sym.id}">
                <span>${sym.label}</span>
                <span class="symptom-tag-remove" data-id="${sym.id}">&times;</span>
            </div>
        `).join("");

        // Attach tag remove events
        tagsContainer.querySelectorAll(".symptom-tag-remove").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const symId = btn.getAttribute("data-id");
                selectedSymptoms = selectedSymptoms.filter(s => s.id !== symId);
                renderSelectedSymptomTags();
                updateESIRecommendationHUD();
            });
        });
    }

    function calculateTriageStrategy() {
        if (selectedSymptoms.length === 0) {
            return { category: null, severity: null, desc: "Select symptoms to initiate clinical decision support." };
        }

        const weights = { "Emergency": 1, "OPD": 2, "Follow-up": 3 };
        let highestCategory = "Follow-up";
        let highestWeight = 3;

        selectedSymptoms.forEach(sym => {
            const w = weights[sym.category] || 3;
            if (w < highestWeight) {
                highestWeight = w;
                highestCategory = sym.category;
            }
        });

        let maxSeverity = 0;
        selectedSymptoms.forEach(sym => {
            if (sym.severity > maxSeverity) {
                maxSeverity = sym.severity;
            }
        });

        let finalSeverity = maxSeverity;
        let bonusMsg = "";
        if (selectedSymptoms.length > 1) {
            finalSeverity = Math.min(maxSeverity + 1, 10);
            bonusMsg = ` (+1 comorbidity risk added)`;
        }

        return {
            category: highestCategory,
            severity: finalSeverity,
            desc: `ESI level determined by highest risk: ${highestCategory} (${maxSeverity}/10)${bonusMsg}.`
        };
    }

    function updateESIRecommendationHUD() {
        const hud = document.getElementById("triage-recommendation-hud");
        const categoryVal = document.getElementById("rec-val-category");
        const severityVal = document.getElementById("rec-val-severity");
        const descVal = document.getElementById("rec-val-desc");

        if (!hud || !categoryVal || !severityVal || !descVal) return;

        const rec = calculateTriageStrategy();
        if (!rec.category) {
            hud.style.display = "none";
            return;
        }

        hud.style.display = "block";
        categoryVal.innerText = rec.category.toUpperCase();
        
        if (rec.category === "Emergency") {
            categoryVal.style.color = "#f87171"; // Red
        } else if (rec.category === "OPD") {
            categoryVal.style.color = "#fbbf24"; // Gold
        } else {
            categoryVal.style.color = "#34d399"; // Green
        }

        severityVal.innerText = `${rec.severity}/10`;
        descVal.innerText = rec.desc;
    }

    let ecgAnimationId = null; // ECG Animation handle
    let activeModalPatientId = null;
    let currentTutorialStep = 1;

    // Tab view details for Header sync
    const tabHeaders = {
        triage: {
            title: "PATIENT TRIAGE ENTRANCE",
            subtitle: "Register and classify patients using the Factory Method pattern."
        },
        queue: {
            title: "ACTIVE TRIAGE QUEUE MONITOR",
            subtitle: "Priority sorted list managed by TriageDesk (Singleton). Observers sync displays."
        },
        doctors: {
            title: "PHYSICIAN CONSULTATION TERMINALS",
            subtitle: "Call patients in priority order. Manage ECG monitor and transition patient States."
        },
        wards: {
            title: "WARD ADMISSIONS & FACILITY MAP",
            subtitle: "View hospital bed occupancy, trauma shield units, and private room allocations."
        },
        billing: {
            title: "BILLING LEDGER & INVOICES",
            subtitle: "Manage checkout invoice details, process facade-managed payments, and discharge recovered patients."
        }
    };

    // -------------------------------------------------------------
    // 2. Fetch data from REST API and refresh UI
    // -------------------------------------------------------------
    async function fetchAndRefreshUI() {
        try {
            const res = await fetch("/api/patients");
            const data = await res.json();
            
            localPatients = data.queue;
            localHistory = data.history;
            localDoctors = data.doctors;
            localBeds = data.beds;
            localAllocatedBeds = data.allocatedBeds;

            // Render UI Components
            updateQueueListUI(localPatients);
            updateSidebarStats();
            renderDoctorConsolesUI();
            renderBedsUI();
            updateAdmittedListUI();
        } catch (err) {
            console.error("EHR API read error:", err);
        }
    }

    // -------------------------------------------------------------
    // 3. Server-Sent Events (Full-Stack Observer Pattern)
    // -------------------------------------------------------------
    function setupSSEObserver() {
        const eventSource = new EventSource("/api/events");
        
        eventSource.addEventListener("queueUpdated", (e) => {
            const data = JSON.parse(e.data);
            logPatternExecution("Observer", "Server-Sent Events: Received broadcast from database Subject.");
            
            // Highlight Observer tab briefly
            highlightPatternTab("observer");
            
            // Reload all EHR data in real-time
            fetchAndRefreshUI();
        });

        eventSource.onerror = (err) => {
            console.error("SSE connection dropped. Retrying...", err);
        };
    }

    // Initial load
    fetchAndRefreshUI().then(() => {
        setupSSEObserver();
        initSymptomWidget();
    });

    // -------------------------------------------------------------
    // 4. UI Tab Switching & Auto-Sync Inspector
    // -------------------------------------------------------------
    function switchWorkspaceTab(tabId) {
        // Toggle Sidebar nav-item active class
        document.querySelectorAll(".nav-item").forEach(item => {
            item.classList.toggle("active", item.getAttribute("data-tab-target") === tabId);
        });

        // Toggle Tab Panel active class
        document.querySelectorAll(".tab-panel").forEach(panel => {
            panel.classList.toggle("active", panel.id === `panel-${tabId}`);
        });

        // Update Header Titles
        const headerInfo = tabHeaders[tabId];
        if (headerInfo) {
            document.getElementById("workspace-active-title").innerText = headerInfo.title;
            document.getElementById("workspace-active-subtitle").innerText = headerInfo.subtitle;
        }

        // Auto-sync Inspector focused pattern tab
        if (tabId === "triage") selectInspectorTab("factory");
        else if (tabId === "queue") selectInspectorTab("singleton");
        else if (tabId === "doctors") selectInspectorTab("state");
        else if (tabId === "wards") selectInspectorTab("facade");
        else if (tabId === "billing") selectInspectorTab("facade");
    }

    // Attach Sidebar Click Listeners
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabTarget = item.getAttribute("data-tab-target");
            switchWorkspaceTab(tabTarget);
            
            // Sync tutorial stepper step to match navigation category
            if (tabTarget === "triage") currentTutorialStep = 1;
            else if (tabTarget === "queue") currentTutorialStep = 2;
            else if (tabTarget === "doctors") currentTutorialStep = 3;
            else if (tabTarget === "wards") currentTutorialStep = 5;
            else if (tabTarget === "billing") currentTutorialStep = 6;
            updateTutorialBanner();
        });
    });

    // -------------------------------------------------------------
    // 5. UI Action Handlers (REST API triggers)
    // -------------------------------------------------------------

    // Register Patient Button
    document.getElementById("btn-register-patient").addEventListener("click", () => {
        const name = document.getElementById("patient-name").value.trim();
        const age = document.getElementById("patient-age").value.trim();

        if (!name || !age) {
            alert("Please provide patient name and age.");
            return;
        }

        const recommendation = calculateTriageStrategy();
        if (!recommendation.category) {
            alert("Please select at least one presenting symptom.");
            return;
        }

        const symptomsString = selectedSymptoms.map(s => s.label).join(", ");
        registerAndTriage(name, age, recommendation.category, recommendation.severity, symptomsString);

        // Reset form inputs
        document.getElementById("patient-name").value = "";
        document.getElementById("patient-age").value = "";
        selectedSymptoms = [];
        renderSelectedSymptomTags();
        updateESIRecommendationHUD();
    });

    // Register and Triage POST API call
    async function registerAndTriage(name, age, type, severity, symptoms) {
        highlightPatternTab("factory");
        try {
            const res = await fetch("/api/patients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, age, triageType: type, severityScore: severity, symptoms })
            });
            const patient = await res.json();
            
            logPatternExecution("Factory", `PatientFactory instantiated concrete subclass for "${patient.name}" on backend.`);
            logPatternExecution("Singleton", `DatabaseEngine Singleton serialized file write for "${patient.id}".`);
            highlightPatternTab("singleton");
        } catch (err) {
            console.error("Triaging error:", err);
        }
    }

    // Call Next Patient (Doctor action)
    window.callPatientTrigger = async function(docId) {
        highlightPatternTab("state");
        try {
            const res = await fetch("/api/consultations/call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docId })
            });
            const patient = await res.json();
            if (patient.error) {
                alert(patient.error);
                return;
            }
            logPatternExecution("State", `State validation: Patient ${patient.name} transitioned to ConsultationState.`);
        } catch (err) {
            console.error("Consultation call error:", err);
        }
    };

    // Load Sample Data (sequential triaging calls)
    document.getElementById("btn-load-samples").addEventListener("click", async () => {
        const samples = [
            { name: "John Doe", age: 45, type: "OPD", severity: 3, symptoms: "Moderate back pain and general checkup" },
            { name: "Divitha G", age: 20, type: "Emergency", severity: 9, symptoms: "Sudden chest pain, difficulty breathing" },
            { name: "Druthendra K", age: 21, type: "Follow-up", severity: 1, symptoms: "Surgical wound stitch check" },
            { name: "Guna Teja K", age: 22, type: "OPD", severity: 5, symptoms: "Persistent fever and dry cough" },
            { name: "Sarah Smith", age: 60, type: "Emergency", severity: 10, symptoms: "Acute trauma from road accident" }
        ];

        for (let s of samples) {
            await registerAndTriage(s.name, s.age, s.type, s.severity, s.symptoms);
        }
    });

    // Reset System
    document.getElementById("btn-reset").addEventListener("click", async () => {
        try {
            await fetch("/api/reset", { method: "POST" });
            const logsBody = document.getElementById("console-logs-body");
            logsBody.innerHTML = `<div class="console-line"><span class="timestamp">[System Info]</span> System reset completed. Queue and Beds cleared.</div>`;
            logPatternExecution("Singleton", "TriageDesk DatabaseEngine Singleton reset.");
            
            // Clean modal
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);
        } catch (err) {
            console.error(err);
        }
    });

    // Clear Logs Button
    document.getElementById("btn-clear-logs").addEventListener("click", () => {
        document.getElementById("console-logs-body").innerHTML = "";
    });

    // Toggle Design View Mode
    document.getElementById("btn-toggle-inspector").addEventListener("click", () => {
        const container = document.getElementById("workspace-split-container");
        const btn = document.getElementById("btn-toggle-inspector");
        
        const isShown = container.classList.toggle("show-inspector");
        
        if (isShown) {
            btn.style.borderColor = "var(--brand-color)";
            btn.style.color = "var(--brand-color)";
            btn.style.background = "rgba(99, 102, 241, 0.05)";
            btn.querySelector("span").innerText = "Design View: ON";
            btn.querySelector("svg").innerHTML = `<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>`;
        } else {
            btn.style.borderColor = "var(--border-color)";
            btn.style.color = "var(--text-secondary)";
            btn.style.background = "transparent";
            btn.querySelector("span").innerText = "Design View: OFF";
            btn.querySelector("svg").innerHTML = `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>`;
        }
    });

    // -------------------------------------------------------------
    // 6. Modal Interactions, ECG Simulator & Decisions
    // -------------------------------------------------------------
    const modal = document.getElementById("patient-modal");
    const closeModalBtn = document.getElementById("btn-close-modal");

    closeModalBtn.addEventListener("click", () => {
        modal.classList.remove("active");
        if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId); // Stop ECG
    });

    window.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId); // Stop ECG
        }
    });

    // Show patient actions/details modal
    window.showPatientDetails = function(patientId) {
        const patient = localPatients.find(p => p.id === patientId) || localHistory.find(p => p.id === patientId);
        if (!patient) return;
        
        activeModalPatientId = patientId;
        document.getElementById("modal-patient-name").innerText = `${patient.name.toUpperCase()} (AGE: ${patient.age}) // ID: ${patient.id}`;
        document.getElementById("modal-patient-state").innerText = patient.stateName;
        document.getElementById("modal-patient-symptoms").innerText = `Symptoms: ${patient.symptoms} (Severity Score: ${patient.severityScore}/10)`;
        
        // Style state badge in modal
        const stateBadge = document.getElementById("modal-patient-state");
        stateBadge.className = `state-badge ${patient.stateName.toLowerCase()}`;

        // Log trails
        const logContainer = document.getElementById("modal-patient-logs");
        logContainer.innerHTML = patient.logs.map(log => `<div class="log-item">${log}</div>`).join("");

        // Build conditional actions based on patient's current state
        const actionsArea = document.getElementById("modal-actions-area");
        actionsArea.innerHTML = "";

        const stateName = patient.stateName;

        if (stateName === "Waiting") {
            actionsArea.innerHTML = `
                <div class="form-group">
                    <label>Triage Escalation Request</label>
                    <div class="flex-col gap-xs">
                        <input type="text" id="escalation-issue" placeholder="Describe symptoms escalation..." style="width: 100%;">
                        <button class="btn-hud-primary" onclick="triggerEscalation()" style="width: 100%;">Escalate Urgency (Chain)</button>
                    </div>
                </div>
            `;
        } else if (stateName === "Consultation") {
            actionsArea.innerHTML = `
                <div class="form-group">
                    <label>Consultation Decision (Facade Admission)</label>
                    <div class="flex-col gap-xs" style="background: rgba(0,0,0,0.25); padding: 0.6rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.025);">
                        <select id="admit-bed-category" style="width: 100%;">
                            <option value="General Ward">General Ward ($500/day)</option>
                            <option value="Private Room">Private Room ($1200/day)</option>
                            <option value="ICU">ICU WARD ($2000/day)</option>
                        </select>
                        <input type="number" id="admit-duration" value="3" min="1" max="30" style="width: 100%;" placeholder="Duration (Days)">
                        <button class="btn-hud-primary" onclick="triggerAdmission()" style="width: 100%;">Admit Patient via Facade</button>
                    </div>
                </div>
                <button class="btn-hud" onclick="triggerDischarge()" style="width: 100%; border-color: var(--blue); color: var(--blue);">Discharge (No Admission)</button>
                <div class="form-group" style="margin-top:0.4rem;">
                    <label>Severity Escalation</label>
                    <div class="flex-col gap-xs">
                        <input type="text" id="escalation-issue" placeholder="Describe critical symptom development..." style="width: 100%;">
                        <button class="btn-hud btn-neon-red" onclick="triggerEscalation()" style="width: 100%; border-color: var(--red); color: var(--red);">Escalate Physician Chain</button>
                    </div>
                </div>
            `;
        } else if (stateName === "Admitted") {
            const bill = patient.billingSummary;
            const rxHtml = bill.prescriptions && bill.prescriptions.length > 0 
                ? `PRESCRIPTION:<br>` + bill.prescriptions.map(p => ` - ${p}<br>`).join("") + `----------------------------<br>`
                : "";
            
            actionsArea.innerHTML = `
                <div class="form-group">
                    <label>Subsystem Billing Summary (Facade Generated)</label>
                    <div class="thermal-receipt">
                        <strong>BIOCARE GENERAL HOSPITALS</strong><br>
                        ----------------------------<br>
                        PATIENT: ${patient.name.toUpperCase()} (ID: ${patient.id})<br>
                        BED CATEGORY: ${bill.bedCategory}<br>
                        STAY DURATION: ${bill.durationDays} day(s)<br>
                        BED CHARGES: $${bill.bedCharge}<br>
                        BASE TRIAGE: $${bill.baseFee}<br>
                        ${bill.pharmacyCharge ? `PHARMACY CHARGE: $${bill.pharmacyCharge}<br>` : ''}
                        ----------------------------<br>
                        ${rxHtml}
                        <strong>TOTAL DUE: $${bill.total}</strong><br>
                        STATUS: UNPAID
                        <div class="barcode-css">
                            <span class="wide"></span><span></span><span class="spacer"></span><span class="wide"></span><span></span><span></span><span class="spacer"></span><span class="wide"></span>
                        </div>
                    </div>
                </div>
                <button class="btn-hud-primary" onclick="finalizeDischarge()" style="width: 100%; margin-top: 0.5rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.35rem; display: inline-block; vertical-align: middle;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> PROCESS PAYMENT & DISCHARGE</button>
            `;
        } else if (stateName === "Discharged") {
            const bill = patient.billingSummary;
            const rxHtml = bill.prescriptions && bill.prescriptions.length > 0 
                ? `PRESCRIPTION:<br>` + bill.prescriptions.map(p => ` - ${p}<br>`).join("") + `----------------------------<br>`
                : "";

            actionsArea.innerHTML = `
                <div class="form-group">
                    <label>Receipt Summary</label>
                    <div class="thermal-receipt">
                        <strong>BIOCARE GENERAL HOSPITALS</strong><br>
                        ----------------------------<br>
                        PATIENT: ${patient.name.toUpperCase()}<br>
                        BASE TRIAGE: $${bill.baseFee}<br>
                        ${bill.bedCharge ? `BED CHARGES: $${bill.bedCharge}<br>` : ''}
                        ${bill.pharmacyCharge ? `PHARMACY CHARGE: $${bill.pharmacyCharge}<br>` : ''}
                        ----------------------------<br>
                        ${rxHtml}
                        <strong>TOTAL PAID: $${bill.total}</strong>
                        <span class="stamp-paid">PAID</span>
                        <div class="barcode-css">
                            <span class="wide"></span><span></span><span class="spacer"></span><span class="wide"></span><span></span><span></span><span class="spacer"></span><span class="wide"></span>
                        </div>
                    </div>
                </div>
            `;
        }

        modal.classList.add("active");
        
        // Start Canvas ECG Waveform Animation
        startECGAnimation(patient);
    };

    // Canvas ECG wave generator
    function startECGAnimation(patient) {
        const canvas = document.getElementById("ecg-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        
        if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);

        let bpm = 75;
        let spo2 = 98;
        let bp = "120/80";

        // Adapt metrics to severity
        if (patient.triageType === "Emergency" || patient.severityScore >= 8) {
            bpm = Math.floor(Math.random() * 15) + 122; // 122-137 BPM (Tachycardia)
            spo2 = Math.floor(Math.random() * 4) + 91;   // 91-94%
            bp = `${Math.floor(Math.random() * 20) + 140}/${Math.floor(Math.random() * 15) + 90}`;
        } else if (patient.triageType === "Follow-up" || patient.severityScore <= 3) {
            bpm = Math.floor(Math.random() * 10) + 56;  // 56-66 BPM (Bradycardia)
            spo2 = 99;
            bp = "115/75";
        } else {
            bpm = Math.floor(Math.random() * 8) + 72;   // 72-80 BPM (Normal)
            spo2 = 98;
            bp = "120/80";
        }

        document.getElementById("modal-vital-hr").innerText = bpm;
        document.getElementById("modal-vital-spo2").innerText = spo2;
        document.getElementById("modal-vital-bp").innerText = bp;

        let x = 0;
        const points = [];
        const maxPoints = width;
        let beatTime = 0;
        const beatPeriod = Math.floor((60 * 60) / bpm); // Frames between beats

        ctx.strokeStyle = "#10b981";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "rgba(16, 185, 129, 0.5)";
        ctx.lineWidth = 2.5;

        function draw() {
            ctx.fillStyle = "rgba(15, 23, 42, 0.18)"; // trails decay
            ctx.fillRect(0, 0, width, height);

            let y = height / 2;
            const phase = beatTime % beatPeriod;
            
            // Standard P-Q-R-S-T wave model
            if (phase >= 10 && phase < 15) {
                const t = (phase - 10) / 5;
                y -= Math.sin(t * Math.PI) * 6; // P wave
            } else if (phase >= 17 && phase < 20) {
                y += 5; // Q wave
            } else if (phase >= 20 && phase < 24) {
                const t = (phase - 20) / 4;
                y -= t * 38; // R peak
            } else if (phase >= 24 && phase < 28) {
                const t = (phase - 24) / 4;
                y += -38 + t * 48; // S dip
            } else if (phase >= 28 && phase < 32) {
                const t = (phase - 28) / 4;
                y += 10 - t * 10; // S return
            } else if (phase >= 38 && phase < 48) {
                const t = (phase - 38) / 10;
                y -= Math.sin(t * Math.PI) * 11; // T wave
            }

            if (patient.severityScore >= 9 && phase > 48) {
                y += (Math.random() - 0.5) * 5;
            }

            if (points.length > 0) {
                ctx.beginPath();
                ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
                ctx.lineTo(x, y);
                ctx.stroke();
            }

            points.push({ x, y });
            if (points.length > maxPoints) {
                points.shift();
            }

            x += 2;
            if (x > width) {
                x = 0;
                points.length = 0;
                ctx.clearRect(0, 0, width, height);
            }

            beatTime++;
            ecgAnimationId = requestAnimationFrame(draw);
        }
        
        draw();
    }

    // Trigger Escalation (Chain of Responsibility API call)
    window.triggerEscalation = async function() {
        const issue = document.getElementById("escalation-issue").value.trim() || "Clinical urgency escalation requested.";
        const patient = localPatients.find(p => p.id === activeModalPatientId) || localHistory.find(p => p.id === activeModalPatientId);
        
        if (!patient) return;

        highlightPatternTab("chain");
        try {
            const res = await fetch("/api/consultations/escalate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId: patient.id, issue })
            });
            const data = await res.json();
            
            logPatternExecution("Chain", `Chain of Responsibility resolved escalation: ${data.resolution}`);
            
            // Refresh modal layout details
            showPatientDetails(patient.id);
        } catch (err) {
            console.error(err);
        }
    };

    // Trigger Admission (Facade Pattern API Call)
    window.triggerAdmission = async function() {
        const bedCategory = document.getElementById("admit-bed-category").value;
        const durationDays = parseInt(document.getElementById("admit-duration").value) || 3;
        const patient = localHistory.find(p => p.id === activeModalPatientId);

        if (!patient) return;

        highlightPatternTab("facade");
        try {
            const res = await fetch("/api/admissions/admit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId: patient.id, bedCategory, durationDays })
            });
            const result = await res.json();
            if (result.error) {
                alert(result.error);
                return;
            }

            logPatternExecution("Facade", `Facade admitted Patient ${patient.name} to Bed ${result.bed}. supervising: Dr. ${result.doctor.name}`);
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);
        } catch (err) {
            console.error(err);
        }
    };

    // Trigger Discharge from Consultation (Direct discharge recovery)
    window.triggerDischarge = async function() {
        const patient = localHistory.find(p => p.id === activeModalPatientId);
        if (!patient) return;

        highlightPatternTab("state");
        try {
            const res = await fetch("/api/consultations/discharge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId: patient.id })
            });
            const result = await res.json();

            logPatternExecution("State", `State set to DischargedState for outpatient ${patient.name}.`);
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);
        } catch (err) {
            console.error(err);
        }
    };

    // Process payment & discharge (Facade checkout)
    window.finalizeDischarge = async function() {
        const patient = localHistory.find(p => p.id === activeModalPatientId);
        if (!patient) return;

        highlightPatternTab("facade");
        try {
            const res = await fetch("/api/admissions/discharge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId: patient.id })
            });
            const invoice = await res.json();

            logPatternExecution("Facade", `Facade discharged Patient ${patient.name}. Bed released, invoice paid.`);
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);
        } catch (err) {
            console.error(err);
        }
    };

    // -------------------------------------------------------------
    // 7. Guided Tutorial Walkthrough Controller
    // -------------------------------------------------------------
    const tutorialSteps = {
        1: {
            title: "Register a Patient (Factory Pattern)",
            pattern: "factory",
            tabId: "triage",
            body: "Fill out the Triage Entrance form below, or click the Auto-Run button. This invokes the **PatientFactory** method to instantiate patient subclasses dynamically.",
            runBtnText: "⚡ AUTO-REGISTER PATIENT",
            action: () => {
                const names = ["Sarah Smith", "Alice Green", "Divitha G", "Guna Teja K", "Druthendra K"];
                const idx = Math.floor(Math.random() * names.length);
                document.getElementById("patient-name").value = names[idx];
                document.getElementById("patient-age").value = Math.floor(Math.random() * 45) + 18;
                
                // Clear and select sample symptoms
                selectedSymptoms = [];
                if (idx % 3 === 0) {
                    // Emergency
                    selectedSymptoms.push(CLINICAL_SYMPTOMS[0]); // Cardiac Chest Pain
                    selectedSymptoms.push(CLINICAL_SYMPTOMS[2]); // Severe Breathing Distress
                } else if (idx % 3 === 1) {
                    // OPD
                    selectedSymptoms.push(CLINICAL_SYMPTOMS[5]); // High Fever
                    selectedSymptoms.push(CLINICAL_SYMPTOMS[7]); // Persistent Vomiting
                } else {
                    // Follow-up
                    selectedSymptoms.push(CLINICAL_SYMPTOMS[12]); // Post-Surgical Stitch Check
                }
                
                renderSelectedSymptomTags();
                updateESIRecommendationHUD();

                setTimeout(() => {
                    document.getElementById("btn-register-patient").click();
                }, 400);
            }
        },
        2: {
            title: "Triage Sorting & Notifications (Singleton & Observer)",
            pattern: "singleton",
            tabId: "queue",
            body: "Triage sorting is managed by the **TriageDesk (Singleton)**. Registering patients auto-sorts them by category priority, then severity. Concurrently, the **Observer Pattern** updates all displays.",
            runBtnText: "⚡ RE-TRIAGE & SORT QUEUE",
            action: () => {
                highlightPatternTab("singleton");
                if (localPatients.length < 2) {
                    registerAndTriage("Emergency Case", 50, "Emergency", 10, "Acute chest pains");
                    registerAndTriage("Routine OPD", 25, "OPD", 3, "Common cold");
                }
            }
        },
        3: {
            title: "Call Patient to Consultation (State Pattern)",
            pattern: "state",
            tabId: "doctors",
            body: "Physicians pull the top priority patient. Click 'Call Next Patient' on Dr. Connor's console to transition the patient's lifecycle **State** from 'Waiting' to 'Consultation'.",
            runBtnText: "🩺 CALL TOP PRIORITY PATIENT",
            action: () => {
                if (localPatients.length === 0) {
                    registerAndTriage("Bob Miller", 48, "Emergency", 9, "Chest pain");
                }
                setTimeout(() => {
                    callPatientTrigger("D1");
                }, 400);
            }
        },
        4: {
            title: "Escalate Urgency (Chain of Responsibility)",
            pattern: "chain",
            tabId: "doctors",
            body: "During Bob's consultation, symptoms worsen. Click below to escalate the case. The request flows through the **Chain of Responsibility** (Nurse ➔ Junior Doctor ➔ Specialist).",
            runBtnText: "🚨 ESCALATE BOB'S CASE",
            action: () => {
                let bob = localHistory.find(p => p.name.includes("Bob") && p.stateName === "Consultation");
                if (!bob) {
                    registerAndTriage("Bob Miller", 48, "Emergency", 9, "Chest pain");
                    setTimeout(() => {
                        callPatientTrigger("D1");
                        setTimeout(() => {
                            bob = localHistory.find(p => p.name.includes("Bob") && p.stateName === "Consultation");
                            runEscalationAction(bob);
                        }, 500);
                    }, 400);
                } else {
                    runEscalationAction(bob);
                }
            }
        },
        5: {
            title: "Admit Patient to ICU (Facade Pattern)",
            pattern: "facade",
            tabId: "wards",
            body: "Bob requires admission. The **AdmissionFacade** abstracts three actions: allocating an ICU bed, assigning supervising physicians, and calculating billing rates.",
            runBtnText: "🏥 ADMIT BOB TO ICU WARD",
            action: () => {
                let bob = localHistory.find(p => p.name.includes("Bob"));
                if (!bob) {
                    registerAndTriage("Bob Miller", 48, "Emergency", 9, "Chest pain");
                    setTimeout(() => {
                        callPatientTrigger("D1");
                        setTimeout(() => {
                            bob = localHistory.find(p => p.name.includes("Bob"));
                            runAdmitAction(bob);
                        }, 500);
                    }, 400);
                } else {
                    runAdmitAction(bob);
                }
            }
        },
        6: {
            title: "Discharge & Billing (Facade Pattern)",
            pattern: "facade",
            tabId: "billing",
            body: "Upon recovery, Bob is discharged. The **AdmissionFacade** processes payment, releases the ICU bed, and sets the patient state to 'Discharged'. Click below to finish.",
            runBtnText: "💳 PROCESS CHECKOUT & DISCHARGE",
            action: () => {
                let bob = localHistory.find(p => p.name.includes("Bob") && p.stateName === "Admitted");
                if (!bob) {
                    registerAndTriage("Bob Miller", 48, "Emergency", 9, "Chest pain");
                    setTimeout(() => {
                        callPatientTrigger("D1");
                        setTimeout(() => {
                            triggerAdmission();
                            setTimeout(() => {
                                bob = localHistory.find(p => p.name.includes("Bob") && p.stateName === "Admitted");
                                runCheckoutAction(bob);
                            }, 600);
                        }, 500);
                    }, 400);
                } else {
                    runCheckoutAction(bob);
                }
            }
        }
    };

    function runEscalationAction(bob) {
        showPatientDetails(bob.id);
        setTimeout(() => {
            const escInput = document.getElementById("escalation-issue");
            if (escInput) escInput.value = "Critical cardiology threat - heart rate dropping!";
            triggerEscalation();
        }, 600);
    }

    function runAdmitAction(bob) {
        if (!document.getElementById("patient-modal").classList.contains("active")) {
            showPatientDetails(bob.id);
        }
        setTimeout(() => {
            const categorySel = document.getElementById("admit-bed-category");
            const durationInput = document.getElementById("admit-duration");
            if (categorySel) categorySel.value = "ICU";
            if (durationInput) durationInput.value = "5";
            triggerAdmission();
        }, 600);
    }

    function runCheckoutAction(bob) {
        showPatientDetails(bob.id);
        setTimeout(() => {
            finalizeDischarge();
        }, 600);
    }

    function updateTutorialBanner() {
        const step = tutorialSteps[currentTutorialStep];
        if (!step) return;

        // Update step dots classes
        for (let i = 1; i <= 6; i++) {
            const dot = document.getElementById(`dot-step-${i}`);
            if (dot) {
                dot.className = "step-dot";
                if (i === currentTutorialStep) {
                    dot.classList.add("active");
                } else if (i < currentTutorialStep) {
                    dot.classList.add("passed");
                }
            }
        }

        // Update stepper connection lines
        for (let i = 1; i <= 5; i++) {
            const line = document.querySelectorAll(".step-line")[i - 1];
            if (line) {
                line.className = "step-line";
                if (i < currentTutorialStep) {
                    line.classList.add("active");
                }
            }
        }

        // Update text
        document.getElementById("tutorial-step-header").innerText = `STEP ${currentTutorialStep} of 6`;
        document.getElementById("tutorial-title-text").innerText = step.title;
        document.getElementById("tutorial-body-text").innerHTML = step.body;
        
        const runBtn = document.getElementById("btn-tutorial-run");
        runBtn.innerText = step.runBtnText;

        // Enable/Disable navigation buttons
        document.getElementById("btn-tutorial-prev").disabled = (currentTutorialStep === 1);
        document.getElementById("btn-tutorial-next").disabled = (currentTutorialStep === 6);

        // Switch Workspace view dynamically to show the active module panel!
        switchWorkspaceTab(step.tabId);
    }

    // Bind Walkthrough buttons
    document.getElementById("btn-tutorial-next").addEventListener("click", () => {
        if (currentTutorialStep < 6) {
            currentTutorialStep++;
            updateTutorialBanner();
        }
    });

    document.getElementById("btn-tutorial-prev").addEventListener("click", () => {
        if (currentTutorialStep > 1) {
            currentTutorialStep--;
            updateTutorialBanner();
        }
    });

    document.getElementById("btn-tutorial-run").addEventListener("click", () => {
        const step = tutorialSteps[currentTutorialStep];
        if (step && typeof step.action === "function") {
            step.action();
        }
    });

    window.jumpToTutorialStep = function(stepNum) {
        currentTutorialStep = stepNum;
        updateTutorialBanner();
    };

    // -------------------------------------------------------------
    // 8. UI Rendering, Sidebar Statistics & Helpers
    // -------------------------------------------------------------

    function updateSidebarStats() {
        document.getElementById("sidebar-queue-count").innerText = localPatients.length;

        // Bed occupancy percent
        const icuAvailable = (localBeds["ICU"] || []).length;
        const privateAvailable = (localBeds["Private Room"] || []).length;
        const generalAvailable = (localBeds["General Ward"] || []).length;

        const totalBeds = 10;
        const availableBeds = icuAvailable + privateAvailable + generalAvailable;
        const occupiedBeds = totalBeds - availableBeds;
        const occupancyPercent = Math.round((occupiedBeds / totalBeds) * 100);

        document.getElementById("sidebar-bed-occupancy").innerText = `${occupancyPercent}%`;

        // Critical emergency count in queue
        const criticalCount = localPatients.filter(p => p.triageType === "Emergency" && p.severityScore >= 8).length;
        document.getElementById("sidebar-critical-count").innerText = criticalCount;
    }

    function updateQueueListUI(queue) {
        const queueList = document.getElementById("queue-display-list");
        if (queue.length === 0) {
            queueList.innerHTML = `<div class="empty-queue">No active patients registered. Populate mock data or register a patient.</div>`;
            return;
        }

        queueList.innerHTML = queue.map((p, idx) => {
            const rowClass = p.triageType.toLowerCase() === "emergency" ? "emergency-row" :
                              p.triageType.toLowerCase() === "opd" ? "opd-row" : "followup-row";
            
            const severityLevel = p.severityScore <= 3 ? "low" : p.severityScore <= 7 ? "medium" : "high";
            const severityText = p.severityScore <= 3 ? "Minor" : p.severityScore <= 7 ? "Urgent" : "Critical";
            
            return `
                <div class="queue-patient-row ${rowClass}">
                    <div class="token-number">TOKEN #${idx + 1}</div>
                    <div class="patient-profile-cell">
                        <h5>${p.name.toUpperCase()}</h5>
                        <span>ID: ${p.id} • Age: ${p.age}y</span>
                    </div>
                    <div>
                        <span class="badge-type-hud ${p.triageType.toLowerCase()}">${p.triageType}</span>
                    </div>
                    <div>
                        <span class="severity-pill-hud ${severityLevel}">${p.severityScore} [${severityText}]</span>
                    </div>
                    <div>
                        <span class="status-badge-inline text-blue">${p.stateName.toUpperCase()}</span>
                    </div>
                    <div>
                        <button class="btn-saas" style="font-size:0.7rem; padding:0.25rem 0.5rem;" onclick="showPatientDetails('${p.id}')">VITAL DETAILS</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderDoctorConsolesUI() {
        const container = document.getElementById("doctors-dashboard-container");
        if (!container) return;

        container.innerHTML = Object.values(localDoctors).map(doc => {
            const isBusy = !doc.available && doc.patientId;
            const statusClass = isBusy ? "busy" : "available";
            const statusText = isBusy ? "CONSULTING" : "AVAILABLE";
            
            let patientInfoHtml = "";
            if (isBusy) {
                const consultingPatient = localHistory.find(p => p.id === doc.patientId);
                const patientName = consultingPatient ? consultingPatient.name : "Active Case";
                const patientSeverity = consultingPatient ? consultingPatient.severityScore : "TBD";

                patientInfoHtml = `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 6px; font-size: 0.75rem; width: 100%; text-align: left; margin-bottom: 0.5rem; font-family:'JetBrains Mono', monospace; display:flex; justify-content:space-between; align-items:center;">
                        <div>PATIENT: <strong>${patientName.toUpperCase()}</strong> (${doc.patientId})</div>
                        <div>SEVERITY: <strong class="text-red">${patientSeverity}/10</strong></div>
                    </div>
                    <button class="btn-saas btn-neon-green" style="font-size:0.7rem; padding:0.35rem 0.75rem; border-color:var(--green); color:var(--green);" onclick="showPatientDetails('${doc.patientId}')">🩺 OPEN CONSULTATION</button>
                `;
            } else {
                const isQueueEmpty = localPatients.length === 0;
                const disabledAttr = isQueueEmpty ? "disabled" : "";

                patientInfoHtml = `
                    <button class="btn-saas btn-call-patient" ${disabledAttr} onclick="callPatientTrigger('${doc.id}')">CALL NEXT PATIENT</button>
                `;
            }

            return `
                <div class="doctor-card" id="doc-card-${doc.id}">
                    <div class="doc-header">
                        <div>
                            <h4>DR. ${doc.name.toUpperCase()}</h4>
                            <span class="doc-specialty">${doc.specialty}</span>
                        </div>
                        <span class="status-badge ${statusClass}" id="doc-status-text-${doc.id}">${statusText}</span>
                    </div>
                    <div class="doc-work-area" id="doc-patient-area-${doc.id}">
                        ${patientInfoHtml}
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderBedsUI() {
        const icuRow = document.getElementById("icu-beds-row");
        const privateRow = document.getElementById("private-beds-row");
        const generalRow = document.getElementById("general-beds-row");

        if (!icuRow || !privateRow || !generalRow) return;

        const bedDef = {
            "ICU": ["ICU-101", "ICU-102", "ICU-103", "ICU-104", "ICU-105", "ICU-106", "ICU-107", "ICU-108", "ICU-109", "ICU-110"],
            "Private Room": ["PR-301", "PR-302", "PR-303", "PR-304", "PR-305", "PR-306", "PR-307", "PR-308", "PR-309", "PR-310"],
            "General Ward": ["GW-201", "GW-202", "GW-203", "GW-204", "GW-205", "GW-206", "GW-207", "GW-208", "GW-209", "GW-210", "GW-211", "GW-212", "GW-213", "GW-214", "GW-215", "GW-216", "GW-217", "GW-218", "GW-219", "GW-220"]
        };

        const allCategories = [
            { cat: "ICU", row: icuRow },
            { cat: "Private Room", row: privateRow },
            { cat: "General Ward", row: generalRow }
        ];

        allCategories.forEach(({ cat, row }) => {
            const bedList = bedDef[cat] || [];
            
            row.innerHTML = bedList.map(bedCode => {
                const patientId = localAllocatedBeds[bedCode];
                if (patientId) {
                    const patient = localHistory.find(p => p.id === patientId);
                    const patientName = patient ? patient.name : "Active Patient";
                    const doctorName = patient && patient.assignedDoctor ? patient.assignedDoctor.name : "Unassigned";
                    
                    return `
                        <div class="clinical-bed-card occupied" onclick="showPatientDetails('${patientId}')">
                            <div class="bed-card-header">
                                <span class="bed-code">${bedCode}</span>
                                <span class="bed-status-dot occupied"></span>
                            </div>
                            <div class="bed-card-body">
                                <div class="patient-name">${patientName.toUpperCase()}</div>
                                <div class="doctor-badge">Dr. ${doctorName}</div>
                                <div class="micro-vitals-pulse">
                                    <span>ECG Trace</span>
                                    <span class="blink">78 BPM</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="clinical-bed-card vacant">
                            <div class="bed-card-header">
                                <span class="bed-code">${bedCode}</span>
                                <span class="bed-status-dot vacant"></span>
                            </div>
                            <div class="bed-card-body">
                                <div class="patient-name" style="opacity: 0.5;">VACANT</div>
                                <div class="doctor-badge" style="opacity: 0.5;">Available</div>
                            </div>
                        </div>
                    `;
                }
            }).join("");
        });
    }

    function updateAdmittedListUI() {
        const container = document.getElementById("admitted-display-list");
        if (!container) return;

        const admittedPatients = localHistory.filter(p => p.stateName === "Admitted");

        if (admittedPatients.length === 0) {
            container.innerHTML = `<div class="empty-queue">No patients currently admitted.</div>`;
            return;
        }

        container.innerHTML = admittedPatients.map(p => {
            return `
                <div class="patient-card flex-col" style="border-left: 2px solid var(--violet); background: rgba(168, 85, 247, 0.04); padding: 0.5rem; border-radius:6px; margin-bottom: 0.35rem; font-family:'JetBrains Mono', monospace; font-size:0.75rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${p.name.toUpperCase()} (${p.bedNumber})</strong>
                        <span class="text-gold">$${p.billingSummary.total}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top: 0.25rem; align-items:center;">
                        <span style="font-size:0.65rem; color:var(--text-muted);">Dr. ${p.assignedDoctor.name}</span>
                        <button class="btn-saas" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;" onclick="showPatientDetails('${p.id}')">CHECKOUT</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    // -------------------------------------------------------------
    // 9. Design Pattern Inspector Core & UML Layouts
    // -------------------------------------------------------------
    const patternDetails = {
        factory: {
            title: "Factory Method Pattern (Creational)",
            filepath: "server/patterns/factory.js",
            text: "Decouples patient object instantiation from the Express route controller. A model class request payload routes to `PatientFactory.createPatient()`, returning specialized concrete subclass instances (`EmergencyPatient`, `OPDPatient`, `FollowUpPatient`) containing pre-configured default billing parameters and severity score floors.",
            uml: `
<div class="flex-center">
  <div class="uml-box">
    <div class="uml-title">PatientFactory</div>
    <div class="uml-field">+ createPatient(...)</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--brand-color);">▼ instantiates</div>
</div>
<div class="flex-center">
  <div class="uml-box highlighted">
    <div class="uml-title">Patient (Base)</div>
    <div class="uml-field"># id, name, age</div>
    <div class="uml-field"># severityScore</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--text-muted);">▲ inherits</div>
</div>
<div class="flex-center" style="gap: 0.3rem;">
  <div class="uml-box" style="font-size:0.55rem; min-width:80px;">Emergency</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:80px;">OPDPatient</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:80px;">FollowUp</div>
</div>
            `
        },
        singleton: {
            title: "Singleton Pattern (Creational)",
            filepath: "server/db.js",
            text: "Maintains a single authoritative entry point to the persistent data file (`database.json`). The `DatabaseEngine` class exposes a static `getInstance()` method. This guarantees that file streams, array sorts, and concurrency read/write locks are managed by a single instance, preventing data corruption or race conditions in patient records.",
            uml: `
<div class="flex-center">
  <div class="uml-box highlighted" style="min-width:180px;">
    <div class="uml-title">DatabaseEngine (Singleton)</div>
    <div class="uml-field">- instance: DatabaseEngine</div>
    <div class="uml-field">- dbPath: String</div>
    <div class="uml-field">+ getInstance(): DatabaseEngine</div>
    <div class="uml-field">+ readRaw()</div>
    <div class="uml-field">+ writeRaw()</div>
  </div>
</div>
            `
        },
        observer: {
            title: "Observer Pattern (Full-Stack Network SSE)",
            filepath: "server/routes.js (line 33)",
            text: "Maintains real-time synchronization between the server's database state and multiple open browser displays. The backend `/api/events` endpoint acts as the network Subject. When updates occur (e.g. triaging a patient, consulting, admitting), the server broadcasts data to all browser Observers listening to the EventSource stream.",
            uml: `
<div class="flex-center">
  <div class="uml-box" style="min-width:160px;">
    <div class="uml-title">Backend Event Stream</div>
    <div class="uml-field">- sseClients: list</div>
    <div class="uml-field">+ broadcastEvent()</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--green);">▼ pushes Server-Sent Events (Observer)</div>
</div>
<div class="flex-center">
  <div class="uml-box highlighted" style="min-width:160px;">
    <div class="uml-title">EventSource (Client)</div>
    <div class="uml-field">+ addEventListener()</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--text-muted);">▼ updates</div>
</div>
<div class="flex-center" style="gap: 0.35rem;">
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">Queue Display</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">Doctor Console</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">Wards Bed Map</div>
</div>
            `
        },
        state: {
            title: "State Pattern (Behavioral)",
            filepath: "server/patterns/state.js",
            text: "Encapsulates state-specific validation rules on the server. Before modifying database records, the patient lifecycle is model-wrapped using concrete classes (`WaitingState`, `ConsultationState`, `AdmittedState`). Validations ensure transitions are consistent (e.g. preventing direct discharge from Waiting state without a doctor's consultation).",
            uml: `
<div class="flex-center">
  <div class="uml-box" style="min-width:140px;">
    <div class="uml-title">Patient Model</div>
    <div class="uml-field">- stateName: String</div>
    <div class="uml-field">+ validateNextState()</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--gold);">▼ delegates validation to</div>
</div>
<div class="flex-center">
  <div class="uml-box highlighted" style="min-width:140px;">
    <div class="uml-title">PatientState</div>
    <div class="uml-field">+ next(patient, option)</div>
    <div class="uml-field">+ escalate(patient, ...)</div>
  </div>
</div>
<div class="flow-chart" style="margin-top:0.4rem; gap: 0.2rem;">
  <div class="uml-box" style="font-size:0.55rem; min-width:70px;">Waiting</div>
  <div class="uml-arrow">➔</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:70px;">Consult</div>
  <div class="uml-arrow">➔</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:70px;">Admit / Disc</div>
</div>
            `
        },
        facade: {
            title: "Facade Pattern (Structural)",
            filepath: "server/patterns/facade.js",
            text: "Simplifies backend routing by hiding complex multi-table interactions behind a unified service wrapper. The `AdmissionFacade` class orchestrates the `BedManager` (reserving bed spots), `DoctorScheduler` (scheduling supervising doctors), and `BillingSystem` (calculating charges) subsystems dynamically.",
            uml: `
<div class="flex-center">
  <div class="uml-box highlighted" style="min-width:160px;">
    <div class="uml-title">AdmissionFacade</div>
    <div class="uml-field">+ admitPatient(patient)</div>
    <div class="uml-field">+ dischargePatient(patient)</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--violet);">▼ coordinates</div>
</div>
<div class="flex-center" style="gap: 0.3rem;">
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">BedManager</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">DoctorSched</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">BillingSystem</div>
</div>
            `
        },
        chain: {
            title: "Chain of Responsibility Pattern (Behavioral)",
            filepath: "server/patterns/chain.js",
            text: "Decouples triage warning senders from clinical receivers. Severity-level escalations propagate along a chain of validation handlers. If minor (severity <= 3), a `Nurse` handler resolves the issue; if moderate, the `JuniorDoctor` resolves it; if critical, it escalates automatically to the `Specialist` handler.",
            uml: `
<div class="flex-center">
  <div class="uml-box" style="min-width:150px;">
    <div class="uml-title">EscalationHandler</div>
    <div class="uml-field">- next: Handler</div>
    <div class="uml-field">+ handleRequest(p, issue)</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--blue);">▼ propagates</div>
</div>
<div class="flex-center" style="flex-direction: column; gap: 0.25rem;">
  <div class="uml-box" style="font-size:0.55rem; min-width:160px;">Nurse (severity <= 3)</div>
  <div class="uml-arrow" style="font-size:0.6rem; padding:0;">▼ next</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:160px;">Junior Doctor (severity <= 7)</div>
  <div class="uml-arrow" style="font-size:0.6rem; padding:0;">▼ next</div>
  <div class="uml-box highlighted" style="font-size:0.55rem; min-width:160px;">Specialist (severity > 7)</div>
</div>
            `
        }
    };

    // Render Pattern Tab content
    function selectInspectorTab(tabName) {
        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
        });

        const data = patternDetails[tabName];
        if (!data) return;

        document.getElementById("pattern-detail-title").innerText = data.title;
        document.getElementById("pattern-detail-text").innerHTML = data.text;
        document.getElementById("code-filepath").innerText = data.filepath;
        document.getElementById("uml-diagram-content").innerHTML = data.uml;

        // Code display
        const codeBlock = document.getElementById("code-block-content");
        codeBlock.textContent = PATTERN_CODE[tabName];
        
        // Highlight code
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(codeBlock);
        }
    }

    // Set up tab click listeners
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            selectInspectorTab(e.target.getAttribute("data-tab"));
        });
    });

    // Helper to log pattern execution
    function logPatternExecution(patternName, message) {
        const logsBody = document.getElementById("console-logs-body");
        const time = new Date().toLocaleTimeString();
        
        const cssTagClass = patternName.toLowerCase().replace(/ /g, "-");
        
        const line = document.createElement("div");
        line.className = "console-line";
        line.innerHTML = `
            <span class="timestamp">[${time}]</span>
            <span class="tag ${cssTagClass}">${patternName}</span>
            <span>${message}</span>
        `;
        
        logsBody.appendChild(line);
        logsBody.scrollTop = logsBody.scrollHeight; // Auto-scroll to bottom
    }

    // Briefly highlight/flash the tab of the pattern being used
    function highlightPatternTab(patternName) {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${patternName}"]`);
        if (tabBtn) {
            tabBtn.classList.add("pulse-highlight");
            setTimeout(() => tabBtn.classList.remove("pulse-highlight"), 1000);
        }

        const label = document.getElementById("active-pattern-label");
        label.innerText = `${patternName.toUpperCase()} ACTIVE`;
        label.style.borderColor = "var(--brand-color)";
        label.style.color = "var(--brand-color)";

        setTimeout(() => {
            label.innerText = "STANDBY";
            label.style.borderColor = "var(--border-color)";
            label.style.color = "var(--text-muted)";
        }, 1500);

        // Auto switch tab to show the code to faculty
        selectInspectorTab(patternName);
    }

    // Code copy function
    document.getElementById("btn-copy-code").addEventListener("click", () => {
        const codeText = document.getElementById("code-block-content").textContent;
        navigator.clipboard.writeText(codeText).then(() => {
            const btn = document.getElementById("btn-copy-code");
            btn.innerText = "COPIED!";
            setTimeout(() => btn.innerText = "Copy Class Code", 1500);
        });
    });

    // Initialize tutorial layout
    updateTutorialBanner();
});
