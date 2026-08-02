/**
 * Strategy Pattern (Behavioral)
 * Defines a family of billing calculation algorithms and encapsulates them in strategies.
 */

class BillingStrategy {
    calculateTotal(baseFee, bedCharge, pharmacyCharge) {
        throw new Error("calculateTotal must be implemented.");
    }
    getPolicyDescription() {
        throw new Error("getPolicyDescription must be implemented.");
    }
}

// Concrete Strategy 1: Standard No Insurance Billing
class StandardBillingStrategy extends BillingStrategy {
    calculateTotal(baseFee, bedCharge, pharmacyCharge) {
        return baseFee + bedCharge + pharmacyCharge;
    }
    getPolicyDescription() {
        return "Standard Patient Self-Pay Policy";
    }
}

// Concrete Strategy 2: Government Insured Shield
class GovernmentInsuredStrategy extends BillingStrategy {
    calculateTotal(baseFee, bedCharge, pharmacyCharge) {
        const finalBed = bedCharge * 0.3; // 70% discount
        const finalPharm = pharmacyCharge * 0.7; // 30% discount
        return Math.round(baseFee + finalBed + finalPharm);
    }
    getPolicyDescription() {
        return "Government Health Shield (70% Bed, 30% RX Discount)";
    }
}

// Concrete Strategy 3: Premium Private Insurance
class PremiumInsuredStrategy extends BillingStrategy {
    calculateTotal(baseFee, bedCharge, pharmacyCharge) {
        const finalBase = baseFee * 0.5; // 50% discount
        const finalBed = bedCharge * 0.6; // 40% discount
        return Math.round(finalBase + finalBed + pharmacyCharge);
    }
    getPolicyDescription() {
        return "Premium Private Insurance (50% Consult, 40% Bed Discount)";
    }
}

// Concrete Strategy 4: Corporate Partner Discount
class CorporateBillingStrategy extends BillingStrategy {
    calculateTotal(baseFee, bedCharge, pharmacyCharge) {
        const sum = baseFee + bedCharge + pharmacyCharge;
        return Math.round(sum * 0.85); // Flat 15% discount
    }
    getPolicyDescription() {
        return "Corporate Partner Discount (Flat 15% Total Discount)";
    }
}

class StrategyFactory {
    static getStrategy(name) {
        switch (name) {
            case "govt": return new GovernmentInsuredStrategy();
            case "premium": return new PremiumInsuredStrategy();
            case "corporate": return new CorporateBillingStrategy();
            default: return new StandardBillingStrategy();
        }
    }
}

module.exports = {
    BillingStrategy,
    StandardBillingStrategy,
    GovernmentInsuredStrategy,
    PremiumInsuredStrategy,
    CorporateBillingStrategy,
    StrategyFactory
};
