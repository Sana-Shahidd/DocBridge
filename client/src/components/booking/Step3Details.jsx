import { useState } from 'react';

export default function Step3Details({ doctor, onSubmit, onBack }) {
  const [form, setForm] = useState({
    patientName:  '',
    patientPhone: '',
    patientEmail: '',
    type:         'physical',
    note:         '',
  });
  const [errors, setErrors] = useState({});

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  }

  function validate() {
    const errs = {};
    if (!form.patientName.trim())  errs.patientName  = 'Full name is required.';
    if (!form.patientPhone.trim()) errs.patientPhone = 'Phone number is required.';
    else if (!/^[0-9+\s\-]{7,15}$/.test(form.patientPhone))
      errs.patientPhone = 'Enter a valid phone number.';
    if (form.patientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patientEmail))
      errs.patientEmail = 'Enter a valid email address.';
    if (!['online', 'physical'].includes(form.type))
      errs.type = 'Select appointment type.';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(form);
  }

  const consultType = doctor?.consultationType?.toLowerCase();
  const showBoth    = consultType === 'both' || !consultType;
  const onlyOnline  = consultType === 'online';
  const onlyPhysical = consultType === 'physical';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Patient name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.patientName}
          onChange={(e) => set('patientName', e.target.value)}
          placeholder="Enter your full name"
          className="form-input"
        />
        {errors.patientName && <p className="text-red-500 text-xs mt-1">{errors.patientName}</p>}
      </div>

      {/* Phone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          value={form.patientPhone}
          onChange={(e) => set('patientPhone', e.target.value)}
          placeholder="e.g. 03001234567"
          className="form-input"
        />
        {errors.patientPhone && <p className="text-red-500 text-xs mt-1">{errors.patientPhone}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-gray-400 font-normal">(optional – for confirmation)</span>
        </label>
        <input
          type="email"
          value={form.patientEmail}
          onChange={(e) => set('patientEmail', e.target.value)}
          placeholder="you@example.com"
          className="form-input"
        />
        {errors.patientEmail && <p className="text-red-500 text-xs mt-1">{errors.patientEmail}</p>}
      </div>

      {/* Appointment type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Appointment Type <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          {(showBoth || onlyPhysical) && (
            <label className={`flex-1 border rounded-xl p-3 flex items-center gap-2 cursor-pointer transition-all ${form.type === 'physical' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
              <input
                type="radio"
                name="type"
                value="physical"
                checked={form.type === 'physical'}
                onChange={() => set('type', 'physical')}
                className="text-blue-600"
              />
              <span className="text-sm font-medium">🏥 In-Person</span>
            </label>
          )}
          {(showBoth || onlyOnline) && (
            <label className={`flex-1 border rounded-xl p-3 flex items-center gap-2 cursor-pointer transition-all ${form.type === 'online' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
              <input
                type="radio"
                name="type"
                value="online"
                checked={form.type === 'online'}
                onChange={() => set('type', 'online')}
                className="text-blue-600"
              />
              <span className="text-sm font-medium">💻 Online</span>
            </label>
          )}
        </div>
        {errors.type && <p className="text-red-500 text-xs mt-1">{errors.type}</p>}
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Note <span className="text-gray-400 font-normal">(optional – describe your symptoms)</span>
        </label>
        <textarea
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. I've had a fever for 3 days..."
          className="form-input resize-none"
        />
        <p className="text-xs text-gray-400 text-right mt-1">{form.note.length}/500</p>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack} className="btn-outline flex-1">← Back</button>
        <button type="submit" className="btn-primary flex-1">Review →</button>
      </div>
    </form>
  );
}
