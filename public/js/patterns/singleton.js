/**
 * Singleton Design Pattern: TriageDesk.
 * Guaranteed to have a single, globally consistent instance coordinating the patient queue.
 */

class TriageDesk {
    constructor() {
        if (TriageDesk.instance) {
            return TriageDesk.instance;
        }
        this.queue = [];
        this.observers = []; // For the Observer pattern
        this.history = [];   // For tracking processed patients
        TriageDesk.instance = this;
    }

    static getInstance() {
        if (!TriageDesk.instance) {
            TriageDesk.instance = new TriageDesk();
        }
        return TriageDesk.instance;
    }

    addPatient(patient) {
        this.queue.push(patient);
        this.sortQueue();
        patient.addLog("Added to Triage Desk Queue.");
        this.notifyObservers("patientAdded", patient);
    }

    removePatient(patientId) {
        const index = this.queue.findIndex(p => p.id === patientId);
        if (index !== -1) {
            const patient = this.queue[index];
            this.queue.splice(index, 1);
            this.notifyObservers("patientRemoved", patient);
            return patient;
        }
        return null;
    }

    getPatientById(patientId) {
        return this.queue.find(p => p.id === patientId) || this.history.find(p => p.id === patientId);
    }

    moveToHistory(patient) {
        this.removePatient(patient.id);
        if (!this.history.find(p => p.id === patient.id)) {
            this.history.push(patient);
        }
        this.notifyObservers("historyUpdated", patient);
    }

    updatePatientSeverity(patientId, newSeverity) {
        const patient = this.queue.find(p => p.id === patientId);
        if (patient) {
            const oldSeverity = patient.severityScore;
            patient.severityScore = parseInt(newSeverity) || 5;
            patient.addLog(`Severity updated from ${oldSeverity} to ${patient.severityScore}. Re-triaging...`);
            this.sortQueue();
            this.notifyObservers("queueUpdated", patient);
        }
    }

    sortQueue() {
        this.queue.sort((a, b) => {
            // Rule 1: Category Priority (Emergency 1, OPD 2, Follow-up 3)
            const prioA = a.getCategoryPriority();
            const prioB = b.getCategoryPriority();
            if (prioA !== prioB) {
                return prioA - prioB;
            }

            // Rule 2: Clinical Severity Score (10 is highest severity, 1 is lowest)
            if (a.severityScore !== b.severityScore) {
                return b.severityScore - a.severityScore; // Higher severity first
            }

            // Rule 3: Arrival/Registration Time (earliest first)
            return a.registeredTime - b.registeredTime;
        });
    }

    getQueue() {
        return this.queue;
    }

    getHistory() {
        return this.history;
    }

    // Observer Pattern integration
    registerObserver(observer) {
        if (!this.observers.includes(observer)) {
            this.observers.push(observer);
        }
    }

    removeObserver(observer) {
        this.observers = this.observers.filter(obs => obs !== observer);
    }

    notifyObservers(event, data) {
        this.observers.forEach(observer => {
            if (typeof observer.update === 'function') {
                observer.update(event, data, this.queue);
            }
        });
    }
}

// Export for usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TriageDesk };
}
