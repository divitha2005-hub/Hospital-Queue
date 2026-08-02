const mongoose = require('mongoose');

const bedSchema = new mongoose.Schema({
    bedNumber: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    occupied: { type: Boolean, default: false },
    patientId: { type: String, default: null }
});

module.exports = mongoose.model('Bed', bedSchema);
