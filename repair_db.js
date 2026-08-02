require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('./server/models/Patient');
const Doctor = require('./server/models/Doctor');

async function repair() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("🔧 Starting database integrity repair...");

    const doctors = await Doctor.find({});
    for (let doc of doctors) {
        if (doc.patientId) {
            const patientExists = await Patient.findOne({ id: doc.patientId });
            if (!patientExists) {
                console.log(`⚠️ Dangling patient link detected on Dr. ${doc.name}. Resetting availability.`);
                doc.available = true;
                doc.patientId = null;
                await doc.save();
            }
        }
    }
    
    console.log("✅ Repair complete. Active doctors restored.");
    process.exit(0);
}

repair().catch(err => {
    console.error(err);
    process.exit(1);
});
