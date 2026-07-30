/**
 * Observer Design Pattern: Subscription & Notification.
 * Keeps reception counters, doctor consoles, and waiting-area displays synchronized the instant the queue changes.
 */

// Interface
class QueueObserver {
    update(event, data, queue) {
        throw new Error("Method 'update(event, data, queue)' must be implemented.");
    }
}

// Concrete Observer: Patient Waiting Area Display
class WaitingAreaDisplayObserver extends QueueObserver {
    constructor(renderCallback) {
        super();
        this.renderCallback = renderCallback; // UI update callback function
    }

    update(event, data, queue) {
        // Formats a clean list of patients waiting, showing token numbers/IDs and statuses
        console.log(`[Waiting Area Display] Queue updated. Current waiting: ${queue.length}`);
        if (this.renderCallback) {
            this.renderCallback(queue);
        }
    }
}

// Concrete Observer: Doctor Console Display
class DoctorConsoleObserver extends QueueObserver {
    constructor(renderCallback) {
        super();
        this.renderCallback = renderCallback;
    }

    update(event, data, queue) {
        // Filters patients that are in 'Waiting' or 'Consultation' state and schedules them
        console.log(`[Doctor Console Display] Updates synced. Queue length: ${queue.length}`);
        if (this.renderCallback) {
            this.renderCallback(queue);
        }
    }
}

// Concrete Observer: Reception Desk Display
class ReceptionDisplayObserver extends QueueObserver {
    constructor(renderCallback) {
        super();
        this.renderCallback = renderCallback;
    }

    update(event, data, queue) {
        // Displays metrics: total patients, emergency counts, average wait time estimate
        console.log(`[Reception Display] Triage dashboard refreshed. Current queue: ${queue.length}`);
        if (this.renderCallback) {
            this.renderCallback(queue);
        }
    }
}

// Export for usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        QueueObserver, 
        WaitingAreaDisplayObserver, 
        DoctorConsoleObserver, 
        ReceptionDisplayObserver 
    };
}
