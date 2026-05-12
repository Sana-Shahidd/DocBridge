// ─────────────────────────────────────────────────────────────────────────────
// Symptom → Specialization mapping for MediShield AI autocomplete
//
// Keys   : symptom keywords a patient might type (lowercase)
// Values : ordered array of matching specializations (most relevant first)
//
// Coverage: 60+ entries covering common Pakistani health complaints
// ─────────────────────────────────────────────────────────────────────────────

export const SYMPTOM_MAP = {
  // ── Cardiac ────────────────────────────────────────────────────────────────
  'chest pain':           ['Cardiologist', 'General Physician'],
  'heart pain':           ['Cardiologist'],
  'palpitations':         ['Cardiologist'],
  'irregular heartbeat':  ['Cardiologist'],
  'high blood pressure':  ['Cardiologist', 'General Physician'],
  'hypertension':         ['Cardiologist', 'General Physician'],
  'heart attack':         ['Cardiologist'],
  'cholesterol':          ['Cardiologist', 'General Physician'],

  // ── Respiratory ────────────────────────────────────────────────────────────
  'cough':                ['Pulmonologist', 'General Physician'],
  'shortness of breath':  ['Pulmonologist', 'Cardiologist'],
  'asthma':               ['Pulmonologist'],
  'breathing difficulty': ['Pulmonologist'],
  'tb':                   ['Pulmonologist'],
  'tuberculosis':         ['Pulmonologist'],
  'chronic cough':        ['Pulmonologist'],
  'wheezing':             ['Pulmonologist'],

  // ── Dermatology ────────────────────────────────────────────────────────────
  'skin rash':            ['Dermatologist'],
  'acne':                 ['Dermatologist'],
  'eczema':               ['Dermatologist'],
  'psoriasis':            ['Dermatologist'],
  'hair loss':            ['Dermatologist'],
  'itching':              ['Dermatologist'],
  'pigmentation':         ['Dermatologist'],
  'dandruff':             ['Dermatologist'],
  'fungal infection':     ['Dermatologist'],
  'warts':                ['Dermatologist'],

  // ── Orthopedic / Rheumatology ──────────────────────────────────────────────
  'joint pain':           ['Orthopedic Surgeon', 'Rheumatologist'],
  'back pain':            ['Orthopedic Surgeon', 'Neurologist'],
  'knee pain':            ['Orthopedic Surgeon'],
  'fracture':             ['Orthopedic Surgeon'],
  'bone pain':            ['Orthopedic Surgeon'],
  'arthritis':            ['Rheumatologist', 'Orthopedic Surgeon'],
  'swollen joints':       ['Rheumatologist', 'Orthopedic Surgeon'],
  'neck pain':            ['Orthopedic Surgeon', 'Neurologist'],
  'shoulder pain':        ['Orthopedic Surgeon'],
  'slip disc':            ['Orthopedic Surgeon', 'Neurologist'],

  // ── Neurology ──────────────────────────────────────────────────────────────
  'headache':             ['Neurologist', 'General Physician'],
  'migraine':             ['Neurologist'],
  'dizziness':            ['Neurologist', 'ENT Specialist'],
  'memory loss':          ['Neurologist', 'Psychiatrist'],
  'seizure':              ['Neurologist'],
  'epilepsy':             ['Neurologist'],
  'paralysis':            ['Neurologist'],
  'numbness':             ['Neurologist'],
  'stroke':               ['Neurologist'],
  'tremor':               ['Neurologist'],

  // ── Psychiatry / Mental Health ─────────────────────────────────────────────
  'depression':           ['Psychiatrist'],
  'anxiety':              ['Psychiatrist'],
  'stress':               ['Psychiatrist'],
  'insomnia':             ['Psychiatrist', 'Neurologist'],
  'sleep problems':       ['Psychiatrist', 'Neurologist'],
  'mood swings':          ['Psychiatrist'],
  'panic attack':         ['Psychiatrist'],
  'ocd':                  ['Psychiatrist'],
  'phobia':               ['Psychiatrist'],
  'addiction':            ['Psychiatrist'],

  // ── Ophthalmology ──────────────────────────────────────────────────────────
  'eye pain':             ['Ophthalmologist'],
  'blurry vision':        ['Ophthalmologist'],
  'vision problems':      ['Ophthalmologist'],
  'red eye':              ['Ophthalmologist'],
  'cataract':             ['Ophthalmologist'],
  'glaucoma':             ['Ophthalmologist'],
  'eye infection':        ['Ophthalmologist'],
  'dry eyes':             ['Ophthalmologist'],

  // ── ENT ────────────────────────────────────────────────────────────────────
  'ear pain':             ['ENT Specialist'],
  'hearing loss':         ['ENT Specialist'],
  'sore throat':          ['ENT Specialist', 'General Physician'],
  'nose bleed':           ['ENT Specialist'],
  'tonsils':              ['ENT Specialist'],
  'sinusitis':            ['ENT Specialist'],
  'snoring':              ['ENT Specialist'],
  'hoarse voice':         ['ENT Specialist'],

  // ── Urology / Nephrology ───────────────────────────────────────────────────
  'urinary problems':     ['Urologist'],
  'kidney stones':        ['Urologist', 'Nephrologist'],
  'kidney pain':          ['Nephrologist', 'Urologist'],
  'kidney failure':       ['Nephrologist'],
  'prostate':             ['Urologist'],
  'blood in urine':       ['Urologist', 'Nephrologist'],

  // ── Gastroenterology / Hepatology ──────────────────────────────────────────
  'stomach pain':         ['Gastroenterologist', 'General Physician'],
  'acidity':              ['Gastroenterologist', 'General Physician'],
  'vomiting':             ['Gastroenterologist', 'General Physician'],
  'constipation':         ['Gastroenterologist'],
  'diarrhea':             ['Gastroenterologist', 'General Physician'],
  'bloating':             ['Gastroenterologist'],
  'liver pain':           ['Hepatologist', 'Gastroenterologist'],
  'jaundice':             ['Hepatologist', 'Gastroenterologist'],
  'hepatitis':            ['Hepatologist'],
  'ibs':                  ['Gastroenterologist'],

  // ── Endocrinology / Diabetes ───────────────────────────────────────────────
  'diabetes':             ['Diabetologist', 'Endocrinologist'],
  'sugar':                ['Diabetologist', 'Endocrinologist'],
  'thyroid':              ['Endocrinologist'],
  'weight gain':          ['Endocrinologist', 'General Physician'],
  'obesity':              ['Endocrinologist', 'General Physician'],
  'hormonal imbalance':   ['Endocrinologist'],
  'fatigue':              ['General Physician', 'Endocrinologist'],

  // ── Gynecology / Obstetrics ────────────────────────────────────────────────
  'pregnancy':            ['Gynecologist / Obstetrician'],
  'periods':              ['Gynecologist / Obstetrician'],
  'menstrual':            ['Gynecologist / Obstetrician'],
  'fertility':            ['Gynecologist / Obstetrician'],
  'pcos':                 ['Gynecologist / Obstetrician', 'Endocrinologist'],
  'menopause':            ['Gynecologist / Obstetrician'],

  // ── Pediatrics ─────────────────────────────────────────────────────────────
  'child fever':          ['Pediatrician'],
  'baby':                 ['Pediatrician'],
  'vaccination':          ['Pediatrician'],
  'growth problems':      ['Pediatrician'],
  'child cough':          ['Pediatrician'],

  // ── Hematology / Oncology ──────────────────────────────────────────────────
  'blood disorder':       ['Hematologist'],
  'anemia':               ['Hematologist', 'General Physician'],
  'thalassemia':          ['Hematologist'],
  'cancer':               ['Oncologist'],
  'tumor':                ['Oncologist'],
  'chemotherapy':         ['Oncologist'],

  // ── General ────────────────────────────────────────────────────────────────
  'fever':                ['General Physician'],
  'weakness':             ['General Physician'],
  'weight loss':          ['General Physician', 'Endocrinologist'],
  'general checkup':      ['General Physician'],
};

// ── Urdu symptom aliases → map to same English keys ───────────────────────────
// Used when user types partial Urdu
export const URDU_SYMPTOM_HINTS = {
  'سینے میں درد':   'chest pain',
  'سردرد':          'headache',
  'بخار':            'fever',
  'جلد':             'skin rash',
  'جوڑوں کا درد':   'joint pain',
  'ذیابیطس':        'diabetes',
  'بلڈ پریشر':      'high blood pressure',
  'حمل':             'pregnancy',
  'کھانسی':         'cough',
  'آنکھ':           'eye pain',
};
