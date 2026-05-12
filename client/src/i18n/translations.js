// ─────────────────────────────────────────────────────────────────────────────
// i18n Translation Strings – MediShield AI
// Supports English (en) and Urdu (ur).
// All user-facing strings are defined here so the UI can switch languages
// without changing any component logic.
// ─────────────────────────────────────────────────────────────────────────────

export const translations = {
  // ── English ──────────────────────────────────────────────────────────────
  en: {
    // Navigation
    nav: {
      findDoctor:     'Find a Doctor',
      register:       'Register Doctor',
      viewProfile:    'View Profile',
      langSwitch:     'اردو',
    },

    // Search bar
    search: {
      placeholder:    'Search by symptom, doctor name, or specialization...',
      suggestLabel:   'Matching Specializations',
      clearSearch:    'Clear',
      searching:      'Searching...',
    },

    // Filters sidebar
    filters: {
      title:          'Filters',
      city:           'City',
      allCities:      'All Cities',
      type:           'Consultation Type',
      typeAll:        'All Types',
      typeOnline:     'Online',
      typePhysical:   'Physical / Clinic',
      feeRange:       'Fee Range (PKR)',
      feeMin:         'Min',
      feeMax:         'Max',
      availableOnly:  'Available Now Only',
      clearFilters:   'Clear Filters',
      apply:          'Apply',
    },

    // Results area
    results: {
      showing:        'Showing',
      of:             'of',
      doctors:        'doctors',
      for:            'results for',
      sortBy:         'Sort by relevance',
      loading:        'Finding the best doctors for you...',
      fetchError:     'Could not load doctors. Is the server running?',
    },

    // AI badge & scoring
    ai: {
      recommended:    'AI Recommended',
      topMatch:       'Top Match',
      score:          'Match Score',
    },

    // Doctor card fields
    card: {
      experience:     'yrs exp.',
      perConsult:     '/consultation',
      reviews:        'reviews',
      book:           'Book',
      available:      'Available',
      unavailable:    'Unavailable',
      verified:       'PMDC Verified',
      online:         'Online',
      physical:       'Clinic',
      both:           'Online & Clinic',
    },

    // Empty state
    empty: {
      title:          'No doctors found',
      subtitle:       'Try adjusting your filters or search term.',
      nearestTitle:   'Nearest available specialist:',
      nearestSub:     'This doctor best matches your search even with current filters.',
      tryAgain:       'Clear Filters',
    },

    // Page hero
    hero: {
      title:          'Find Your Doctor',
      subtitle:       "AI-powered matching across Pakistan's top verified specialists.",
      badge:          'AI Powered Search',
    },
  },

  // ── Urdu ─────────────────────────────────────────────────────────────────
  ur: {
    // Navigation
    nav: {
      findDoctor:     'ڈاکٹر تلاش کریں',
      register:       'ڈاکٹر رجسٹر کریں',
      viewProfile:    'پروفائل دیکھیں',
      langSwitch:     'English',
    },

    // Search bar
    search: {
      placeholder:    'علامات، ڈاکٹر کا نام، یا تخصص درج کریں...',
      suggestLabel:   'مماثل تخصص',
      clearSearch:    'صاف کریں',
      searching:      'تلاش جاری ہے...',
    },

    // Filters sidebar
    filters: {
      title:          'فلٹرز',
      city:           'شہر',
      allCities:      'تمام شہر',
      type:           'مشاورت کی قسم',
      typeAll:        'تمام اقسام',
      typeOnline:     'آن لائن',
      typePhysical:   'حاضری / کلینک',
      feeRange:       'فیس کی حد (روپے)',
      feeMin:         'کم از کم',
      feeMax:         'زیادہ سے زیادہ',
      availableOnly:  'صرف ابھی دستیاب',
      clearFilters:   'فلٹر صاف کریں',
      apply:          'لاگو کریں',
    },

    // Results area
    results: {
      showing:        'دکھایا جا رہا ہے',
      of:             'میں سے',
      doctors:        'ڈاکٹر',
      for:            'نتائج',
      sortBy:         'مطابقت کے مطابق ترتیب',
      loading:        'آپ کے لیے بہترین ڈاکٹر تلاش کیے جا رہے ہیں...',
      fetchError:     'ڈاکٹر لوڈ نہیں ہو سکے۔ کیا سرور چل رہا ہے؟',
    },

    // AI badge & scoring
    ai: {
      recommended:    'AI تجویز کردہ',
      topMatch:       'بہترین مطابقت',
      score:          'مطابقت اسکور',
    },

    // Doctor card fields
    card: {
      experience:     'سال تجربہ',
      perConsult:     '/مشاورت',
      reviews:        'جائزے',
      book:           'بک کریں',
      available:      'دستیاب',
      unavailable:    'غیر دستیاب',
      verified:       'PMDC تصدیق شدہ',
      online:         'آن لائن',
      physical:       'کلینک',
      both:           'آن لائن اور کلینک',
    },

    // Empty state
    empty: {
      title:          'کوئی ڈاکٹر نہیں ملا',
      subtitle:       'فلٹر یا تلاش کی اصطلاح تبدیل کریں۔',
      nearestTitle:   'قریب ترین دستیاب ماہر:',
      nearestSub:     'یہ ڈاکٹر آپ کی تلاش سے سب سے زیادہ مطابقت رکھتا ہے۔',
      tryAgain:       'فلٹر صاف کریں',
    },

    // Page hero
    hero: {
      title:          'اپنا ڈاکٹر تلاش کریں',
      subtitle:       'پاکستان کے بہترین تصدیق شدہ ماہرین کے ساتھ AI سے چلنے والی مطابقت۔',
      badge:          'AI سے چلنے والی تلاش',
    },
  },
};
