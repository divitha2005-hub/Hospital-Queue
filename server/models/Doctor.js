const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    available: { type: Boolean, default: true },
    patientId: { type: String, default: null }
});

module.exports = mongoose.model('Doctor', doctorSchema);
