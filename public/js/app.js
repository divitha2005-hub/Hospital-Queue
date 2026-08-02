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
            title: "PHYSICIAN ALLOCATION TERMINALS",
            subtitle: "Call patients in priority order. Assign active cases dynamically to consulting portals."
        },
        consultation: {
            title: "CLINICAL CONSULTATION DESK",
            subtitle: "Prescribe custom medications, generate ECG telemetry, and decide inpatient admissions."
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

            // Rebuild active consultation dropdown
            const busyDocs = Object.values(localDoctors).filter(d => !d.available && d.patientId);
            const select = document.getElementById("consultation-doctor-select");
            if (select) {
                const currentSelected = select.value;
                let optionsHtml = `<option value="">No Active Consultation (Select Physician)...</option>`;
                busyDocs.forEach(d => {
                    const patientName = localHistory.find(p => p.id === d.patientId)?.name || "Active Case";
                    optionsHtml += `<option value="${d.id}">Dr. ${d.name} (Patient: ${patientName} [${d.patientId}])</option>`;
                });
                select.innerHTML = optionsHtml;
                if (busyDocs.some(d => d.id === currentSelected)) {
                    select.value = currentSelected;
                } else {
                    select.value = "";
                }
            }

            // Render UI Components
            updateQueueListUI(localPatients);
            updateSidebarStats();
            renderDoctorConsolesUI();
            renderBedsUI();
            updateAdmittedListUI();
            renderConsultationWorkspace();
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
        initConsultationTab();
        initSplitterResize();
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
        else if (tabId === "consultation") selectInspectorTab("state");
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
            else if (tabTarget === "consultation") currentTutorialStep = 4;
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
    const loadSamplesBtn = document.getElementById("btn-load-samples");
    if (loadSamplesBtn) {
        loadSamplesBtn.addEventListener("click", async () => {
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
    }

    // Reset System
    document.getElementById("btn-reset").addEventListener("click", async () => {
        try {
            await fetch("/api/reset", { method: "POST" });
            const logsBody = document.getElementById("console-logs-body");
            if (logsBody) {
                logsBody.innerHTML = `<div class="console-line"><span class="timestamp">[System Info]</span> System reset completed. Queue and Beds cleared.</div>`;
            }
            logPatternExecution("Singleton", "TriageDesk DatabaseEngine Singleton reset.");
            
            // Clean modal
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);
        } catch (err) {
            console.error(err);
        }
    });

    // Clear Logs Button
    const clearLogsBtn = document.getElementById("btn-clear-logs");
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener("click", () => {
            const logsBody = document.getElementById("console-logs-body");
            if (logsBody) logsBody.innerHTML = "";
        });
    }

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

        // Redirect to Clinical Consultation tab if active
        if (patient.stateName === "Consultation") {
            const doc = Object.values(localDoctors).find(d => d.patientId === patientId);
            if (doc) {
                switchWorkspaceTab("consultation");
                const select = document.getElementById("consultation-doctor-select");
                if (select) {
                    select.value = doc.id;
                    renderConsultationWorkspace();
                }
                return;
            }
        }
        
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

    let activeCheckoutPatientId = null;

    window.selectCheckoutPatient = function(patientId) {
        activeCheckoutPatientId = patientId;
        renderCheckoutReceipt();
    };

    // -------------------------------------------------------------
    // Strategy Pattern (Behavioral) - Client-side Billing Policy
    // -------------------------------------------------------------
    class BillingStrategy {
        calculateTotal(baseFee, bedCharge, pharmacyCharge) { return baseFee + bedCharge + pharmacyCharge; }
        getPolicyDescription() { return "Standard Patient Self-Pay Policy"; }
        getDiscountBreakdown(baseFee, bedCharge, pharmacyCharge) { return { discountAmount: 0, desc: "None" }; }
    }

    class GovernmentInsuredStrategy extends BillingStrategy {
        calculateTotal(baseFee, bedCharge, pharmacyCharge) {
            const finalBed = bedCharge * 0.3;
            const finalPharm = pharmacyCharge * 0.7;
            return Math.round(baseFee + finalBed + finalPharm);
        }
        getPolicyDescription() { return "Government Shield (70% Bed, 30% RX)"; }
        getDiscountBreakdown(baseFee, bedCharge, pharmacyCharge) {
            const disc = Math.round((bedCharge * 0.7) + (pharmacyCharge * 0.3));
            return { discountAmount: disc, desc: "Govt Health Shield Policy" };
        }
    }

    class PremiumInsuredStrategy extends BillingStrategy {
        calculateTotal(baseFee, bedCharge, pharmacyCharge) {
            const finalBase = baseFee * 0.5;
            const finalBed = bedCharge * 0.6;
            return Math.round(finalBase + finalBed + pharmacyCharge);
        }
        getPolicyDescription() { return "Premium Private (50% Consult, 40% Bed)"; }
        getDiscountBreakdown(baseFee, bedCharge, pharmacyCharge) {
            const disc = Math.round((baseFee * 0.5) + (bedCharge * 0.4));
            return { discountAmount: disc, desc: "Premium Insured Policy" };
        }
    }

    class CorporateBillingStrategy extends BillingStrategy {
        calculateTotal(baseFee, bedCharge, pharmacyCharge) {
            const sum = baseFee + bedCharge + pharmacyCharge;
            return Math.round(sum * 0.85);
        }
        getPolicyDescription() { return "Corporate Partner (Flat 15% Total)"; }
        getDiscountBreakdown(baseFee, bedCharge, pharmacyCharge) {
            const sum = baseFee + bedCharge + pharmacyCharge;
            const disc = Math.round(sum * 0.15);
            return { discountAmount: disc, desc: "Corporate Partner Shield" };
        }
    }

    let activeBillingStrategyKey = "none";

    window.applyBillingStrategy = function() {
        const select = document.getElementById("billing-strategy-select");
        if (!select) return;

        activeBillingStrategyKey = select.value;

        let strategy;
        if (activeBillingStrategyKey === "govt") strategy = new GovernmentInsuredStrategy();
        else if (activeBillingStrategyKey === "premium") strategy = new PremiumInsuredStrategy();
        else if (activeBillingStrategyKey === "corporate") strategy = new CorporateBillingStrategy();
        else strategy = new BillingStrategy();

        const patient = localHistory.find(p => p.id === activeCheckoutPatientId);
        if (!patient) return;

        const bill = patient.billingSummary;
        const baseFee = bill ? bill.baseFee : 0;
        const bedCharge = bill ? bill.bedCharge : 0;
        const pharmacyCharge = bill ? bill.pharmacyCharge : 0;

        const finalTotal = strategy.calculateTotal(baseFee, bedCharge, pharmacyCharge);
        const { discountAmount, desc } = strategy.getDiscountBreakdown(baseFee, bedCharge, pharmacyCharge);

        const totalEl = document.getElementById("invoice-grand-total");
        if (totalEl) totalEl.innerText = `$${finalTotal}`;

        const discContainer = document.getElementById("invoice-discount-row");
        if (discContainer) {
            if (discountAmount > 0) {
                discContainer.innerHTML = `
                    <div class="flex-row justify-between" style="color: #34d399; font-size: 0.65rem; margin-top:0.25rem; font-weight:700;">
                        <span>Discount (${desc})</span>
                        <span>-$${discountAmount}</span>
                    </div>
                `;
            } else {
                discContainer.innerHTML = "";
            }
        }
        
        logPatternExecution("Strategy", `Selected policy: ${strategy.getPolicyDescription()}. Net charge recalculated.`);
    };

    function renderCheckoutReceipt() {
        const container = document.getElementById("billing-ledger-receipt-area");
        if (!container) return;

        if (!activeCheckoutPatientId) {
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.alignItems = "center";
            container.style.justifyContent = "center";
            container.style.borderStyle = "dashed";
            container.style.borderColor = "rgba(255,255,255,0.06)";
            container.style.background = "transparent";
            container.style.textAlign = "center";
            container.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted" style="margin-bottom: 0.5rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span class="text-muted" style="font-style: italic; font-size: 0.78rem;">Click 'Checkout' on an admitted patient to open the billing summary.</span>
            `;
            return;
        }

        const patient = localHistory.find(p => p.id === activeCheckoutPatientId);
        if (!patient) {
            container.innerHTML = `<span class="text-muted">Loading billing details...</span>`;
            return;
        }

        const bill = patient.billingSummary;
        const rxList = (bill && bill.prescriptions && bill.prescriptions.length > 0)
            ? bill.prescriptions.map(med => `<div class="receipt-rx-item" style="color: var(--text-primary); font-size: 0.65rem; margin-top:0.15rem;">• ${med}</div>`).join("")
            : `<div class="receipt-rx-item" style="color:var(--text-muted); font-style:italic; font-size:0.65rem; margin-top:0.15rem;">No drugs prescribed.</div>`;

        const totalIndex = bill ? bill.total : 0;
        const baseFee = bill ? bill.baseFee : 0;
        const bedCharge = bill ? bill.bedCharge : 0;
        const pharmacyCharge = bill ? bill.pharmacyCharge : 0;
        const duration = bill ? bill.durationDays : 0;
        const category = bill ? bill.bedCategory : "None";

        container.style.display = "block";
        container.style.borderStyle = "solid";
        container.style.borderColor = "var(--border-color)";
        container.style.background = "rgba(15, 23, 42, 0.4)";
        container.style.textAlign = "left";

        // Reset strategy key to standard on checkout selection
        activeBillingStrategyKey = "none";

        container.innerHTML = `
            <div class="invoice-container flex-col gap-xs" style="font-family:'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--text-secondary);">
                <!-- Invoice Header -->
                <div class="flex-row justify-between align-center" style="border-bottom: 1px dashed var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    <div>
                        <strong style="color: var(--brand-color); font-size:0.8rem;">BIOCARE EHR INVOICE</strong><br>
                        <span style="font-size:0.6rem; color:var(--text-muted);">DATE: ${new Date(patient.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style="text-align: right;">
                        <span class="state-badge waiting" style="font-size: 0.6rem; padding: 0.1rem 0.4rem;">PENDING DISCHARGE</span>
                    </div>
                </div>

                <!-- Patient & Clinical metadata -->
                <div class="flex-col gap-xxs" style="background: rgba(0, 0, 0, 0.15); padding: 0.4rem; border-radius: 4px; margin-bottom: 0.5rem; border: 1px solid rgba(255,255,255,0.02);">
                    <div><strong>PATIENT:</strong> ${patient.name.toUpperCase()} (ID: ${patient.id})</div>
                    <div><strong>SUPERVISOR:</strong> Dr. ${patient.assignedDoctor?.name || "TBD"}</div>
                    <div><strong>WARD UNIT:</strong> ${patient.bedNumber} (${category})</div>
                    <div><strong>DURATION:</strong> ${duration} Days</div>
                </div>

                <!-- Itemized Cost Summary -->
                <div class="flex-col gap-xxs" style="border-bottom: 1px dashed var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.2rem;">ITEMIZED COST ANALYSIS:</div>
                    <div class="flex-row justify-between">
                        <span>1. Base Triage Consultation Fee</span>
                        <span style="color:var(--text-primary); font-weight:700;">$${baseFee}</span>
                    </div>
                    <div class="flex-row justify-between">
                        <span>2. Ward Bed Occupancy (${duration} days)</span>
                        <span style="color:var(--text-primary); font-weight:700;">$${bedCharge}</span>
                    </div>
                    <div class="flex-row justify-between" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.25rem;">
                        <span>3. Pharmacy & Clinical Drugs</span>
                        <span style="color:var(--text-primary); font-weight:700;">$${pharmacyCharge}</span>
                    </div>
                    <!-- Prescriptions list -->
                    <div class="flex-col gap-xxs" style="padding-left: 0.5rem; margin-top: 0.25rem; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.25rem;">
                        ${rxList}
                    </div>
                    <!-- Real-time Strategy Discount Line -->
                    <div id="invoice-discount-row"></div>
                </div>

                <!-- Select Insurance Plan / Strategy -->
                <div class="flex-col gap-xxs" style="margin-bottom: 0.75rem; background: rgba(0, 0, 0, 0.25); padding: 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                    <label style="font-size: 0.58rem; color: var(--brand-color); font-weight: 700; letter-spacing:0.3px; margin-bottom:0.25rem;">STRATEGY: CHOOSE INSURANCE / BILLING DISCOUNT POLICY</label>
                    <select id="billing-strategy-select" onchange="applyBillingStrategy()" style="width: 100%; font-size: 0.65rem; padding: 0.3rem; background: #070a13; border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: #fff; font-family:'JetBrains Mono', monospace; cursor:pointer;">
                        <option value="none">Standard Policy (No Insurance Discount)</option>
                        <option value="govt">Government Shield (70% Bed, 30% Pharmacy Disc)</option>
                        <option value="premium">Premium Private Care (50% Consult, 40% Bed Disc)</option>
                        <option value="corporate">Corporate Partner Shield (Flat 15% Grand Total Disc)</option>
                    </select>
                </div>

                <!-- Total Row -->
                <div class="flex-row justify-between align-center" style="margin-bottom: 0.75rem;">
                    <strong style="font-size:0.8rem; color:var(--text-primary);">GRAND TOTAL DUE:</strong>
                    <strong class="text-gold" id="invoice-grand-total" style="font-size: 0.95rem;">$${totalIndex}</strong>
                </div>

                <!-- Action Button -->
                <button class="btn-hud-primary" onclick="finalizeDischarge()" style="width: 100%; font-size: 0.72rem; padding: 0.55rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    PROCESS DISCHARGE & PAYMENT (FACADE)
                </button>
            </div>
        `;
    }

    function renderDischargedReceipt(invoice) {
        const container = document.getElementById("billing-ledger-receipt-area");
        if (!container) return;

        let policyText = "Standard Policy (Self-Pay)";
        if (invoice.policyUsed === "govt") policyText = "Government Health Shield (70% Bed, 30% RX)";
        else if (invoice.policyUsed === "premium") policyText = "Premium Private Care (50% Consult, 40% Bed)";
        else if (invoice.policyUsed === "corporate") policyText = "Corporate Partner (Flat 15%)";

        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.borderStyle = "dashed";
        container.style.borderColor = "var(--green)";
        container.style.background = "rgba(16, 185, 129, 0.03)";
        container.style.textAlign = "center";

        container.innerHTML = `
            <div class="flex-col align-center justify-center gap-sm" style="padding: 1.5rem 1rem;">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(16,185,129,0.1); border: 2px solid var(--green); display: flex; align-items: center; justify-content: center; color: var(--green); font-size: 1.3rem;">✓</div>
                <div style="font-family:'JetBrains Mono', monospace; font-size:0.75rem;">
                    <strong style="color:var(--green); font-size:0.85rem;">INVOICE PAID SUCCESSFULLY</strong><br>
                    <span style="color:var(--text-muted); font-size:0.65rem;">FACADE & STRATEGY TRANSACTION COMPLETE</span>
                </div>
                
                <div class="flex-col gap-xxs" style="background: rgba(0,0,0,0.15); padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.02); font-family:'JetBrains Mono', monospace; font-size: 0.72rem; text-align: left; min-width: 240px; margin: 0.25rem 0;">
                    <div><strong>RECEIPT:</strong> #${invoice.receiptId}</div>
                    <div><strong>PATIENT:</strong> ${invoice.patientName?.toUpperCase() || "PATIENT"}</div>
                    <div><strong>BED RELEASED:</strong> ${invoice.bedReleased || "YES"}</div>
                    <div><strong>POLICY USED:</strong> <span style="color: var(--brand-color); font-weight:700;">${policyText}</span></div>
                    <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:0.25rem; margin-top:0.25rem;">
                        <strong>TOTAL PAID:</strong> <span class="text-gold">$${invoice.totalAmount}</span>
                    </div>
                </div>

                <button class="btn-hud" onclick="clearReceiptArea()" style="font-size:0.65rem; padding: 0.35rem 0.75rem; border-color:var(--border-color); color:var(--text-muted) !important;">Close Receipt</button>
            </div>
        `;
    }

    window.clearReceiptArea = function() {
        activeCheckoutPatientId = null;
        renderCheckoutReceipt();
    };

    window.finalizeDischarge = async function() {
        const patientId = activeCheckoutPatientId || activeModalPatientId;
        const patient = localHistory.find(p => p.id === patientId);
        if (!patient) return;

        // Read selected billing strategy from UI dropdown
        const select = document.getElementById("billing-strategy-select");
        const strategy = select ? select.value : "none";

        highlightPatternTab("facade");
        try {
            const res = await fetch("/api/admissions/discharge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId: patient.id, strategy })
            });
            const invoice = await res.json();

            logPatternExecution("Facade", `Facade discharged Patient ${patient.name}. Bed released, invoice paid.`);
            
            if (activeCheckoutPatientId === patient.id) {
                activeCheckoutPatientId = null;
            }
            
            modal.classList.remove("active");
            if (ecgAnimationId) cancelAnimationFrame(ecgAnimationId);

            renderDischargedReceipt(invoice);
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
            body: "Physicians pull the top priority patient. Click the run button to assign the top-priority waiting patient to the first available doctor, transitioning the patient's State from 'Waiting' to 'Consultation'.",
            runBtnText: "🩺 CALL TOP PRIORITY PATIENT",
            action: () => {
                if (localPatients.length === 0) {
                    alert("No patients currently waiting in the triage queue! Please register a patient in Step 1 first.");
                    return;
                }
                const availableDoc = Object.values(localDoctors).find(d => d.available);
                if (!availableDoc) {
                    alert("All doctors are currently busy consulting patients!");
                    return;
                }
                callPatientTrigger(availableDoc.id);
            }
        },
        4: {
            title: "Escalate Urgency (Chain of Responsibility)",
            pattern: "chain",
            tabId: "consultation",
            body: "During the patient's consultation, symptoms worsen. Click below to escalate the case. The request flows through the **Chain of Responsibility** (Nurse ➔ Junior Doctor ➔ Specialist) depending on severity.",
            runBtnText: "🚨 ESCALATE ACTIVE CASE",
            action: () => {
                const activePatient = localHistory.find(p => p.stateName === "Consultation");
                if (!activePatient) {
                    alert("No patients currently in consultation! Please call a patient to consultation in Step 3 first.");
                    return;
                }
                runEscalationAction(activePatient);
            }
        },
        5: {
            title: "Admit Patient to Wards (Facade Pattern)",
            pattern: "facade",
            tabId: "wards",
            body: "The patient requires ward admission. The **AdmissionFacade** abstracts three actions: allocating a bed, assigning supervising physicians, and calculating billing rates.",
            runBtnText: "🏥 ADMIT ACTIVE PATIENT",
            action: () => {
                const activePatient = localHistory.find(p => p.stateName === "Consultation");
                if (!activePatient) {
                    alert("No active consultation patient to admit! Please call a patient to consultation in Step 3 first.");
                    return;
                }
                runAdmitAction(activePatient);
            }
        },
        6: {
            title: "Discharge & Billing (Facade Pattern)",
            pattern: "facade",
            tabId: "billing",
            body: "Upon recovery, the patient is discharged. The **AdmissionFacade** processes payment, releases the allocated bed, and sets the patient state to 'Discharged'. Click below to finish.",
            runBtnText: "💳 PROCESS CHECKOUT & DISCHARGE",
            action: () => {
                const activePatient = localHistory.find(p => p.stateName === "Admitted");
                if (!activePatient) {
                    alert("No admitted patients to checkout! Please admit a patient to the wards in Step 5 first.");
                    return;
                }
                runCheckoutAction(activePatient);
            }
        }
    };

    function runEscalationAction(bob) {
        showPatientDetails(bob.id);
        setTimeout(() => {
            const escInput = document.getElementById("consult-escalation-input");
            if (escInput) escInput.value = "Critical cardiology threat - heart rate dropping!";
            const btn = document.getElementById("btn-consult-escalate");
            if (btn) btn.click();
        }, 600);
    }

    function runAdmitAction(bob) {
        showPatientDetails(bob.id);
        setTimeout(() => {
            const categorySel = document.getElementById("consult-bed-category");
            const durationInput = document.getElementById("consult-stay-duration");
            if (categorySel) categorySel.value = "ICU";
            if (durationInput) durationInput.value = "5";
            const btn = document.getElementById("btn-consult-admit");
            if (btn) btn.click();
        }, 600);
    }

    function runCheckoutAction(bob) {
        selectCheckoutPatient(bob.id);
        setTimeout(() => {
            finalizeDischarge();
        }, 600);
    }

    function updateTutorialBanner() {
        const step = tutorialSteps[currentTutorialStep];
        if (!step) return;

        // Set CSS custom property for glowing progress bar width
        const card = document.querySelector(".tutorial-card");
        if (card) {
            const pct = (currentTutorialStep / 6) * 100;
            card.style.setProperty("--progress-pct", `${pct}%`);
        }

        // Update text
        document.getElementById("tutorial-step-header").innerText = `STEP ${currentTutorialStep} of 6`;
        document.getElementById("tutorial-title-text").innerText = step.title;
        document.getElementById("tutorial-body-text").innerHTML = step.body;
        
        const runBtn = document.getElementById("btn-tutorial-run");
        runBtn.innerText = step.runBtnText;
        if (currentTutorialStep === 1) {
            runBtn.style.display = "none";
        } else {
            runBtn.style.display = "inline-block";
        }

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

        const totalBeds = 40;
        const availableBeds = icuAvailable + privateAvailable + generalAvailable;
        const occupiedBeds = totalBeds - availableBeds;
        const occupancyPercent = Math.max(0, Math.round((occupiedBeds / totalBeds) * 100));

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
            container.innerHTML = `<div class="empty-queue">No patients currently admitted to wards.</div>`;
            return;
        }

        container.innerHTML = admittedPatients.map(p => {
            return `
                <div class="patient-card flex-col" style="border-left: 3px solid var(--violet); background: rgba(168, 85, 247, 0.04); padding: 0.75rem; border-radius: 8px; margin-bottom: 0.5rem; font-family:'JetBrains Mono', monospace; font-size:0.75rem; border: 1px solid rgba(168, 85, 247, 0.15); border-left-width: 3px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: all 0.2s ease-in-out;">
                    <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom: 0.35rem;">
                        <strong style="color: var(--text-primary); font-size: 0.78rem;">${p.name.toUpperCase()}</strong>
                        <span class="state-badge admitted" style="font-size: 0.58rem; padding: 0.1rem 0.35rem; margin-left: 0.5rem;">${p.bedNumber}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.65rem; color:var(--text-muted);">Physician: Dr. ${p.assignedDoctor?.name || "TBD"}</span>
                        <div class="flex-row align-center gap-xs">
                            <span class="text-gold" style="font-weight: 700; margin-right: 0.25rem;">$${p.billingSummary?.total || 0}</span>
                            <button class="btn-saas" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; border-color: var(--violet); color: var(--violet) !important; font-weight: 700; background: rgba(168, 85, 247, 0.08);" onclick="selectCheckoutPatient('${p.id}')">CHECKOUT</button>
                        </div>
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
        },
        strategy: {
            title: "Strategy Pattern (Behavioral)",
            filepath: "server/patterns/strategy.js",
            text: "Encapsulates interchangeable billing discount algorithms to support runtime plan changes. The `BillingStrategy` interface specifies `calculateTotal()`. At checkout (Step 6), selecting an insurance provider dynamically loads the corresponding strategy (`GovernmentInsuredStrategy`, `PremiumInsuredStrategy`, or `CorporateBillingStrategy`) to recalculate the invoice totals dynamically on both client and server.",
            uml: `
<div class="flex-center">
  <div class="uml-box highlighted" style="min-width:160px;">
    <div class="uml-title">BillingStrategy</div>
    <div class="uml-field">+ calculateTotal(base, bed, rx)</div>
    <div class="uml-field">+ getPolicyDescription()</div>
  </div>
</div>
<div class="flex-center">
  <div class="uml-arrow" style="color:var(--brand-color);">▼ implemented by</div>
</div>
<div class="flex-center" style="gap: 0.3rem;">
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">StandardStrategy</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">GovtInsured</div>
  <div class="uml-box" style="font-size:0.55rem; min-width:85px;">PremiumInsured</div>
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

        const titleEl = document.getElementById("pattern-detail-title");
        if (titleEl) titleEl.innerText = data.title;

        const textEl = document.getElementById("pattern-detail-text");
        if (textEl) textEl.innerHTML = data.text;

        const filepathEl = document.getElementById("code-filepath");
        if (filepathEl) filepathEl.innerText = data.filepath;

        const umlEl = document.getElementById("uml-diagram-content");
        if (umlEl) umlEl.innerHTML = data.uml;

        // Code display
        const codeBlock = document.getElementById("code-block-content");
        if (codeBlock) {
            codeBlock.textContent = PATTERN_CODE[tabName];
            if (typeof hljs !== 'undefined') {
                hljs.highlightElement(codeBlock);
            }
        }
    }

    // Set up tab click listeners
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            selectInspectorTab(e.target.getAttribute("data-tab"));
        });
    });

    // Zoom in on diagram click (Anime Spring Pop-out Effect)
    const diagContainer = document.querySelector(".diagram-container");
    if (diagContainer) {
        diagContainer.addEventListener("click", () => {
            const currentUml = document.getElementById("uml-diagram-content").innerHTML;
            const zoomTarget = document.getElementById("zoom-diagram-content");
            const zoomOverlay = document.getElementById("diagram-zoom-overlay");
            if (zoomTarget && zoomOverlay) {
                zoomTarget.innerHTML = currentUml;
                zoomOverlay.classList.add("active");
            }
        });
    }

    // Dismiss diagram zoom overlay
    const diagZoomOverlay = document.getElementById("diagram-zoom-overlay");
    const closeZoomBtn = document.getElementById("close-zoom-btn");
    if (diagZoomOverlay) {
        const closeHandler = () => {
            diagZoomOverlay.classList.remove("active");
        };
        if (closeZoomBtn) closeZoomBtn.addEventListener("click", closeHandler);
        diagZoomOverlay.addEventListener("click", (e) => {
            if (e.target === diagZoomOverlay) {
                closeHandler();
            }
        });
    }

    // Helper to log pattern execution
    function logPatternExecution(patternName, message) {
        const logsBody = document.getElementById("console-logs-body");
        if (!logsBody) return;
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
        if (label) {
            label.innerText = `${patternName.toUpperCase()} ACTIVE`;
            label.style.borderColor = "var(--brand-color)";
            label.style.color = "var(--brand-color)";

            setTimeout(() => {
                label.innerText = "STANDBY";
                label.style.borderColor = "var(--border-color)";
                label.style.color = "var(--text-muted)";
            }, 1500);
        }

        // Auto switch tab to show the code to faculty
        selectInspectorTab(patternName);
    }

    // Code copy function
    const copyBtn = document.getElementById("btn-copy-code");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const codeBlock = document.getElementById("code-block-content");
            if (codeBlock) {
                const codeText = codeBlock.textContent;
                navigator.clipboard.writeText(codeText).then(() => {
                    copyBtn.innerText = "COPIED!";
                    setTimeout(() => copyBtn.innerText = "Copy Class Code", 1500);
                });
            }
        });
    }

    let consultEcgAnimationId = null;

    function initConsultationTab() {
        const select = document.getElementById("consultation-doctor-select");
        if (select) {
            select.addEventListener("change", () => {
                renderConsultationWorkspace();
            });
        }

        // Attach close listeners for Chain of Responsibility alert overlay
        const overlay = document.getElementById("escalation-alert-overlay");
        const closeX = document.getElementById("close-esc-alert");
        const closeBtn = document.getElementById("btn-close-esc-alert");

        if (overlay) {
            const closeHandler = () => {
                overlay.classList.remove("active");
            };
            if (closeX) closeX.addEventListener("click", closeHandler);
            if (closeBtn) closeBtn.addEventListener("click", closeHandler);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) {
                    closeHandler();
                }
            });
        }
    }

    function renderConsultationWorkspace() {
        const select = document.getElementById("consultation-doctor-select");
        const container = document.getElementById("active-consultation-case-container");
        if (!select || !container) return;

        const docId = select.value;

        // Clear existing animation
        if (consultEcgAnimationId) {
            cancelAnimationFrame(consultEcgAnimationId);
            consultEcgAnimationId = null;
        }

        if (!docId) {
            container.innerHTML = `
                <div class="no-consultation-placeholder" style="text-align: center; padding: 4rem 2rem; background: rgba(15,23,42,0.25); border: 1px dashed var(--border-color); border-radius: 8px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted); margin-bottom:1rem; display: inline-block;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">No Active Consultation Case</h3>
                    <p style="font-size: 0.75rem; color: var(--text-muted); max-width: 400px; margin: 0 auto;">Select a physician currently consulting a patient from the dropdown list above, or call a patient from the Physician Terminals tab.</p>
                </div>
            `;
            return;
        }

        const doc = localDoctors[docId];
        if (!doc || doc.available || !doc.patientId) {
            container.innerHTML = `
                <div class="no-consultation-placeholder" style="text-align: center; padding: 4rem 2rem; background: rgba(15,23,42,0.25); border: 1px dashed var(--border-color); border-radius: 8px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted); margin-bottom:1rem; display: inline-block;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">Dr. ${doc ? doc.name : "Physician"} is Available</h3>
                    <p style="font-size: 0.75rem; color: var(--text-muted); max-width: 400px; margin: 0 auto;">This doctor is not currently consulting. Select a busy doctor or assign a patient to them in the Physician Terminals tab.</p>
                </div>
            `;
            return;
        }

        const patient = localHistory.find(p => p.id === doc.patientId);
        if (!patient) {
            container.innerHTML = `
                <div class="no-consultation-placeholder" style="text-align: center; padding: 4rem 2rem; background: rgba(15,23,42,0.25); border: 1px dashed var(--border-color); border-radius: 8px;">
                    <span style="color: var(--gold); font-size: 1.5rem; display: block; margin-bottom: 0.5rem;">⚠️</span>
                    <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem;">Loading Patient Details...</h3>
                    <p style="font-size: 0.75rem; color: var(--text-muted);">Please wait while the patient record loads from MongoDB cloud...</p>
                </div>
            `;
            return;
        }

        // Draw Clinical Consultation UI
        container.innerHTML = `
            <div class="consultation-workspace">
                <div class="consultation-vitals-header">
                    <div class="vital-monitor-box">
                        <span class="lbl">HEART RATE</span>
                        <span class="val" id="consult-vital-hr">-</span>
                    </div>
                    <div class="vital-monitor-box">
                        <span class="lbl">SPO2 VALUE</span>
                        <span class="val" id="consult-vital-spo2">-</span>
                    </div>
                    <div class="vital-monitor-box">
                        <span class="lbl">BLOOD PRESSURE</span>
                        <span class="val" id="consult-vital-bp">-</span>
                    </div>
                </div>

                <div class="consultation-canvas-container">
                    <canvas id="consult-ecg-canvas" width="600" height="90"></canvas>
                </div>

                <div class="consultation-double-column">
                    <div class="consult-col">
                        <div class="form-group">
                            <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">PATIENT PROFILE: ${patient.name.toUpperCase()} (${patient.id}, AGE: ${patient.age})</label>
                            <div class="symptom-display-box" id="consult-symptoms-display">
                                <strong>Triage Class:</strong> ${patient.triageType} | <strong>Urgency Level:</strong> ${patient.severityScore}/10<br>
                                <strong>Presenting Symptoms:</strong> ${patient.symptoms || "No symptoms selected."}
                            </div>
                        </div>

                        <!-- Prescription Panel -->
                        <div class="form-group">
                            <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">PRESCRIBED MEDICATIONS & SUGGESTIONS</label>
                            <div class="medication-input-row">
                                <input type="text" id="consult-medication-input" placeholder="Type drug name (e.g. Paracetamol 500mg)..." style="font-family: 'JetBrains Mono', monospace;">
                                <button class="btn-saas-primary" id="btn-add-medication" type="button" style="padding:0.4rem 0.8rem; font-size:0.7rem; display: flex; align-items: center; justify-content: center;">+ Add</button>
                            </div>
                            <div class="medication-tags-list" id="consult-medications-list"></div>
                        </div>

                        <div class="form-group">
                            <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">CLINICAL AUDIT LOGS</label>
                            <div class="consult-logs-box" id="consult-logs-list"></div>
                        </div>
                    </div>

                    <div class="consult-col">
                        <div class="form-group">
                            <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">DISPOSITION DECISION (FACADE ADMISSION)</label>
                            <div class="facade-admit-box flex-col gap-xs">
                                <select id="consult-bed-category" style="width: 100%; padding: 0.45rem; background: #0f172a; border: 1px solid var(--border-color); border-radius: 6px; color: #ffffff; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; margin-bottom: 0.35rem;">
                                    <option value="General Ward">General Ward ($500/day)</option>
                                    <option value="Private Room">Private Room ($1200/day)</option>
                                    <option value="ICU">ICU ($2000/day)</option>
                                </select>
                                <div class="flex-row gap-xs align-center">
                                    <input type="number" id="consult-stay-duration" min="1" max="30" value="3" placeholder="Stay Duration (days)" style="flex: 1; padding: 0.45rem; background: #0f172a; border: 1px solid var(--border-color); border-radius: 6px; color: #ffffff; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;">
                                    <button class="btn-hud-primary" id="btn-consult-admit" type="button" style="padding: 0.45rem 1rem;">Admit Patient</button>
                                </div>
                            </div>
                            <button class="btn-hud" id="btn-consult-discharge" type="button" style="width: 100%; margin-top: 0.4rem; border-color: var(--green); color: var(--green);">Discharge Outpatient directly</button>
                        </div>

                        <div class="form-group">
                            <label style="font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">SEVERITY ESCALATION (CHAIN OF RESPONSIBILITY)</label>
                            <div class="medication-input-row">
                                <input type="text" id="consult-escalation-input" placeholder="Describe critical symptom development..." style="font-family: 'JetBrains Mono', monospace;">
                                <button class="btn-hud btn-neon-red" id="btn-consult-escalate" type="button" style="padding:0.4rem 0.8rem; font-size:0.7rem;">Escalate Case</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        startConsultationECG(patient);
        renderConsultationPrescriptions(patient);
        document.getElementById("consult-logs-list").innerText = patient.logs.join("\n");

        document.getElementById("btn-add-medication").addEventListener("click", () => {
            const input = document.getElementById("consult-medication-input");
            const medName = input.value.trim();
            if (medName) {
                addMedicationAction(patient.id, medName);
            }
        });

        document.getElementById("btn-consult-admit").addEventListener("click", () => {
            const category = document.getElementById("consult-bed-category").value;
            const duration = document.getElementById("consult-stay-duration").value;
            if (category && duration) {
                admitPatientFromConsult(patient.id, category, duration);
            }
        });

        document.getElementById("btn-consult-discharge").addEventListener("click", () => {
            dischargePatientFromConsult(patient.id);
        });

        document.getElementById("btn-consult-escalate").addEventListener("click", () => {
            const input = document.getElementById("consult-escalation-input");
            const issue = input.value.trim();
            if (issue) {
                escalatePatientFromConsult(patient.id, issue);
            }
        });
    }

    function renderConsultationPrescriptions(patient) {
        const listContainer = document.getElementById("consult-medications-list");
        if (!listContainer) return;

        const prescriptions = (patient.billingSummary && patient.billingSummary.prescriptions) || [];
        if (prescriptions.length === 0) {
            listContainer.innerHTML = `<span style="font-size:0.7rem; color:var(--text-muted); font-style:italic;">No medications prescribed yet. Add above.</span>`;
            return;
        }

        listContainer.innerHTML = prescriptions.map((med, index) => `
            <div class="medication-chip">
                <span>${med}</span>
                <span class="medication-chip-remove" data-index="${index}">&times;</span>
            </div>
        `).join("");

        listContainer.querySelectorAll(".medication-chip-remove").forEach(btn => {
            btn.addEventListener("click", () => {
                const index = btn.getAttribute("data-index");
                removeMedicationAction(patient.id, index);
            });
        });
    }

    function startConsultationECG(patient) {
        const canvas = document.getElementById("consult-ecg-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        
        let bpm = 72;
        let spo2 = 98;
        let bp = "120/80";

        if (patient.triageType === "Emergency" || patient.severityScore >= 8) {
            bpm = 125;
            spo2 = 91;
            bp = "155/96";
        } else if (patient.triageType === "Follow-up" || patient.severityScore <= 3) {
            bpm = 60;
            spo2 = 99;
            bp = "115/75";
        } else {
            bpm = 78;
            spo2 = 97;
            bp = "122/82";
        }

        document.getElementById("consult-vital-hr").innerText = bpm;
        document.getElementById("consult-vital-spo2").innerText = `${spo2}%`;
        document.getElementById("consult-vital-bp").innerText = bp;

        let x = 0;
        const points = [];
        const maxPoints = width;
        let beatTime = 0;
        const beatPeriod = Math.floor((60 * 60) / bpm);

        ctx.strokeStyle = "#10b981";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "rgba(16, 185, 129, 0.5)";
        ctx.lineWidth = 2.5;

        function draw() {
            if (!document.getElementById("consult-ecg-canvas")) return;
            ctx.fillStyle = "rgba(9, 13, 22, 0.18)";
            ctx.fillRect(0, 0, width, height);

            let y = height / 2;
            const phase = beatTime % beatPeriod;
            
            if (phase >= 10 && phase < 15) {
                const t = (phase - 10) / 5;
                y -= Math.sin(t * Math.PI) * 4;
            } else if (phase >= 17 && phase < 20) {
                y += 3;
            } else if (phase >= 20 && phase < 24) {
                const t = (phase - 20) / 4;
                y -= t * 25;
            } else if (phase >= 24 && phase < 28) {
                const t = (phase - 24) / 4;
                y += -25 + t * 32;
            } else if (phase >= 28 && phase < 32) {
                const t = (phase - 28) / 4;
                y += 7 - t * 7;
            } else if (phase >= 38 && phase < 48) {
                const t = (phase - 38) / 10;
                y -= Math.sin(t * Math.PI) * 7;
            }

            if (patient.severityScore >= 9 && phase > 48) {
                y += (Math.random() - 0.5) * 3;
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
            consultEcgAnimationId = requestAnimationFrame(draw);
        }
        
        draw();
    }

    async function addMedicationAction(patientId, medicationName) {
        try {
            const res = await fetch("/api/consultations/medication", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId, medicationName })
            });
            const updatedPatient = await res.json();
            const idx = localHistory.findIndex(p => p.id === patientId);
            if (idx !== -1) {
                localHistory[idx] = updatedPatient;
                renderConsultationWorkspace();
            }
        } catch (err) {
            console.error("Error adding medication:", err);
        }
    }

    async function removeMedicationAction(patientId, index) {
        try {
            const res = await fetch("/api/consultations/medication/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId, index })
            });
            const updatedPatient = await res.json();
            const idx = localHistory.findIndex(p => p.id === patientId);
            if (idx !== -1) {
                localHistory[idx] = updatedPatient;
                renderConsultationWorkspace();
            }
        } catch (err) {
            console.error("Error removing medication:", err);
        }
    }

    async function admitPatientFromConsult(patientId, bedCategory, durationDays) {
        highlightPatternTab("facade");
        try {
            const res = await fetch("/api/admissions/admit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId, bedCategory, durationDays })
            });
            const result = await res.json();
            if (result.error) {
                alert(result.error);
                return;
            }
            
            logPatternExecution("Facade", `AdmissionFacade coordinated bed and doctor allocation for patient.`);
            const select = document.getElementById("consultation-doctor-select");
            if (select) select.value = "";
            renderConsultationWorkspace();
        } catch (err) {
            console.error("Admission error:", err);
        }
    }

    async function dischargePatientFromConsult(patientId) {
        highlightPatternTab("state");
        try {
            const res = await fetch("/api/consultations/discharge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId })
            });
            const result = await res.json();
            if (result.error) {
                alert(result.error);
                return;
            }
            
            logPatternExecution("State", `DischargedState instantiated. Outpatient released.`);
            const select = document.getElementById("consultation-doctor-select");
            if (select) select.value = "";
            renderConsultationWorkspace();
        } catch (err) {
            console.error("Discharge error:", err);
        }
    }

    async function escalatePatientFromConsult(patientId, issue) {
        highlightPatternTab("chain");
        try {
            const res = await fetch("/api/consultations/escalate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ patientId, issue })
            });
            const result = await res.json();
            
            logPatternExecution("Chain", `Chain of Responsibility routed clinical escalation: ${result.resolution}`);
            
            const idx = localHistory.findIndex(p => p.id === patientId);
            if (idx !== -1) {
                localHistory[idx] = result.patient;
                renderConsultationWorkspace();
            }

            // Show visual routing chain alert overlay
            showChainOfResponsibilityAlert(result.patient, issue, result.resolution);
        } catch (err) {
            console.error("Escalation error:", err);
        }
    }

    function showChainOfResponsibilityAlert(patient, issue, resolution) {
        const overlay = document.getElementById("escalation-alert-overlay");
        if (!overlay) return;

        document.getElementById("esc-alert-issue").innerText = issue;
        document.getElementById("esc-alert-resolution").innerText = resolution;

        const score = patient.severityScore;

        const nodeNurse = document.getElementById("node-nurse");
        const nodeJunior = document.getElementById("node-junior");
        const nodeSpec = document.getElementById("node-specialist");
        
        const statusNurse = document.getElementById("status-nurse");
        const statusJunior = document.getElementById("status-junior");
        const statusSpec = document.getElementById("status-specialist");

        // Clear previous classes
        nodeNurse.className = "chain-node";
        nodeJunior.className = "chain-node";
        nodeSpec.className = "chain-node";

        if (score <= 3) {
            nodeNurse.classList.add("active");
            statusNurse.className = "node-status resolved";
            statusNurse.innerText = "RESOLVED";
            
            statusJunior.className = "node-status idle";
            statusJunior.innerText = "IDLE";
            
            statusSpec.className = "node-status idle";
            statusSpec.innerText = "IDLE";
        } else if (score <= 7) {
            nodeNurse.classList.add("active");
            statusNurse.className = "node-status bypassed";
            statusNurse.innerText = "PASSED";
            
            nodeJunior.classList.add("active");
            statusJunior.className = "node-status resolved";
            statusJunior.innerText = "RESOLVED";
            
            statusSpec.className = "node-status idle";
            statusSpec.innerText = "IDLE";
        } else {
            nodeNurse.classList.add("active");
            statusNurse.className = "node-status bypassed";
            statusNurse.innerText = "PASSED";
            
            nodeJunior.classList.add("active");
            statusJunior.className = "node-status bypassed";
            statusJunior.innerText = "PASSED";
            
            nodeSpec.classList.add("active");
            statusSpec.className = "node-status resolved";
            statusSpec.innerText = "RESOLVED";
        }

        overlay.classList.add("active");
    }

    function initSplitterResize() {
        const splitter = document.getElementById("workspace-splitter");
        const container = document.querySelector(".workspace-main-split");
        if (!splitter || !container) return;

        let isDragging = false;

        splitter.addEventListener("mousedown", (e) => {
            isDragging = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;

            const containerRect = container.getBoundingClientRect();
            const containerRight = containerRect.right;
            const mouseX = e.clientX;
            
            let newWidth = containerRight - mouseX;

            if (newWidth < 280) newWidth = 280;
            if (newWidth > 750) newWidth = 750;

            container.style.setProperty("--inspector-width", `${newWidth}px`);
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = "default";
                document.body.style.userSelect = "auto";
            }
        });
    }

    function runSplashBootSequence() {
        const splash = document.getElementById("ehr-splash-screen");
        const progressBar = document.getElementById("splash-progress-bar");
        const statusText = document.getElementById("splash-status-text");

        if (!splash || !progressBar) return;

        const bootSteps = [
            { pct: 15, msg: "Establishing secure database connection..." },
            { pct: 35, msg: "Verifying DatabaseEngine Singleton instance..." },
            { pct: 55, msg: "Compiling PatientFactory Triaging Subclasses..." },
            { pct: 75, msg: "Mounting State Machine validation checks..." },
            { pct: 90, msg: "Connecting Observer Network SSE streams..." },
            { pct: 100, msg: "System integrity verified. Welcome, Chief Medical Officer." }
        ];

        let currentStepIndex = 0;
        let progress = 0;

        const interval = setInterval(() => {
            if (progress < 100) {
                progress += 2;
                progressBar.style.width = `${progress}%`;

                const step = bootSteps[currentStepIndex];
                if (step && progress >= step.pct) {
                    statusText.style.opacity = 0;
                    setTimeout(() => {
                        statusText.innerText = step.msg;
                        statusText.style.opacity = 1;
                    }, 150);
                    currentStepIndex++;
                }
            } else {
                clearInterval(interval);
                statusText.style.opacity = 0;
                setTimeout(() => {
                    statusText.innerText = "ACCESS GRANTED. REDIRECTING...";
                    statusText.style.opacity = 1;
                    statusText.style.color = "#10b981"; // Safe green alert on success
                    statusText.style.textShadow = "0 0 10px rgba(16, 185, 129, 0.4)";
                }, 150);
                setTimeout(() => {
                    splash.classList.add("fade-out");
                }, 850);
            }
        }, 32); // Fast, snappy, professional boot speed
    }

    // Run the splash boot sequence on load
    runSplashBootSequence();

    // Initialize tutorial layout
    updateTutorialBanner();
});
