require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('./server/models/Patient');
const Doctor = require('./server/models/Doctor');
const Bed = require('./server/models/Bed');

async function inspect() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("=== INSPECTING MONGODB ATLAS ===");
    
    const patients = await Patient.find({});
    console.log(`Patients count: ${patients.length}`);
    patients.forEach(p => {
        console.log(`- Patient ID: ${p.id}, Name: ${p.name}, State: ${p.stateName}, Severity: ${p.severityScore}`);
    });

    const doctors = await Doctor.find({});
    console.log(`\nDoctors count: ${doctors.length}`);
    doctors.forEach(d => {
        if (!d.available) {
            console.log(`- Doctor ID: ${d.id}, Name: ${d.name}, Available: ${d.available}, PatientId: ${d.patientId}`);
        }
    });

    const occupiedBeds = await Bed.find({ occupied: true });
    console.log(`\nOccupied Beds: ${occupiedBeds.length}`);
    occupiedBeds.forEach(b => {
        console.log(`- Bed: ${b.bedNumber}, PatientId: ${b.patientId}`);
    });

    process.exit(0);
}

inspect().catch(err => {
    console.error(err);
    process.exit(1);
});
