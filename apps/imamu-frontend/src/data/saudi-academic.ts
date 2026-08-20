// Saudi universities + common majors. Used by the profile picker so the user
// gets a tidy dropdown instead of two free-text fields per language.

export interface BilingualEntry {
  en: string
  ar: string
}

// Tamkeen is the IMSIU platform — student signup is locked to IMSIU only.
export const SAUDI_UNIVERSITIES: BilingualEntry[] = [
  { en: 'Imam Mohammad ibn Saud Islamic University',   ar: 'جامعة الإمام محمد بن سعود الإسلامية' },
  { en: 'Princess Nourah Bint Abdulrahman University', ar: 'جامعة الأميرة نورة بنت عبدالرحمن' },
  { en: 'King Khalid University',                      ar: 'جامعة الملك خالد' },
  { en: 'Umm Al-Qura University',                      ar: 'جامعة أم القرى' },
  { en: 'Qassim University',                           ar: 'جامعة القصيم' },
  { en: 'Taibah University',                           ar: 'جامعة طيبة' },
  { en: 'Tabuk University',                            ar: 'جامعة تبوك' },
  { en: 'Hail University',                             ar: 'جامعة حائل' },
  { en: 'Jazan University',                            ar: 'جامعة جازان' },
  { en: 'Najran University',                           ar: 'جامعة نجران' },
  { en: 'Saudi Electronic University',                 ar: 'الجامعة السعودية الإلكترونية' },
  { en: 'Alfaisal University',                         ar: 'جامعة الفيصل' },
  { en: 'Prince Sultan University',                    ar: 'جامعة الأمير سلطان' },
  { en: 'Effat University',                            ar: 'جامعة عفت' },
  { en: 'Dar Al-Hekma University',                     ar: 'جامعة دار الحكمة' },
  { en: 'Prince Mohammad Bin Fahd University',         ar: 'جامعة الأمير محمد بن فهد' },
  { en: 'King Faisal University',                      ar: 'جامعة الملك فيصل' },
  { en: 'Imam Abdulrahman Bin Faisal University',      ar: 'جامعة الإمام عبدالرحمن بن فيصل' },
  { en: 'Najran University',                           ar: 'جامعة نجران' },
  { en: 'Other',                                       ar: 'أخرى' },
]

export const MAJORS: BilingualEntry[] = [
  // Engineering
  { en: 'Computer Science',          ar: 'علوم الحاسب' },
  { en: 'Software Engineering',      ar: 'هندسة البرمجيات' },
  { en: 'Information Technology',    ar: 'تقنية المعلومات' },
  { en: 'Data Science',              ar: 'علم البيانات' },
  { en: 'Artificial Intelligence',   ar: 'الذكاء الاصطناعي' },
  { en: 'Cybersecurity',             ar: 'الأمن السيبراني' },
  { en: 'Information Systems',       ar: 'نظم المعلومات' },
  { en: 'Mechanical Engineering',    ar: 'الهندسة الميكانيكية' },
  { en: 'Electrical Engineering',    ar: 'الهندسة الكهربائية' },
  { en: 'Civil Engineering',         ar: 'الهندسة المدنية' },
  { en: 'Chemical Engineering',      ar: 'الهندسة الكيميائية' },
  { en: 'Industrial Engineering',    ar: 'الهندسة الصناعية' },
  { en: 'Petroleum Engineering',     ar: 'هندسة البترول' },
  { en: 'Aerospace Engineering',     ar: 'هندسة الطيران والفضاء' },
  { en: 'Biomedical Engineering',    ar: 'الهندسة الطبية الحيوية' },
  { en: 'Architecture',              ar: 'العمارة' },

  // Health & medical
  { en: 'Medicine',                  ar: 'الطب' },
  { en: 'Dentistry',                 ar: 'طب الأسنان' },
  { en: 'Pharmacy',                  ar: 'الصيدلة' },
  { en: 'Nursing',                   ar: 'التمريض' },
  { en: 'Public Health',             ar: 'الصحة العامة' },
  { en: 'Medical Laboratory Sciences', ar: 'علوم المختبرات الطبية' },

  // Business
  { en: 'Business Administration',   ar: 'إدارة الأعمال' },
  { en: 'Marketing',                 ar: 'التسويق' },
  { en: 'Finance',                   ar: 'التمويل' },
  { en: 'Accounting',                ar: 'المحاسبة' },
  { en: 'Economics',                 ar: 'الاقتصاد' },
  { en: 'Human Resources',           ar: 'الموارد البشرية' },
  { en: 'Supply Chain Management',   ar: 'إدارة سلاسل الإمداد' },
  { en: 'Entrepreneurship',          ar: 'ريادة الأعمال' },

  // Sciences
  { en: 'Mathematics',               ar: 'الرياضيات' },
  { en: 'Statistics',                ar: 'الإحصاء' },
  { en: 'Physics',                   ar: 'الفيزياء' },
  { en: 'Chemistry',                 ar: 'الكيمياء' },
  { en: 'Biology',                   ar: 'الأحياء' },
  { en: 'Geology',                   ar: 'الجيولوجيا' },
  { en: 'Environmental Science',     ar: 'العلوم البيئية' },

  // Humanities & social
  { en: 'Law',                       ar: 'القانون' },
  { en: 'Education',                 ar: 'التربية' },
  { en: 'Psychology',                ar: 'علم النفس' },
  { en: 'Sociology',                 ar: 'علم الاجتماع' },
  { en: 'Mass Communication',        ar: 'الإعلام' },
  { en: 'English Literature',        ar: 'الأدب الإنجليزي' },
  { en: 'Arabic Literature',         ar: 'الأدب العربي' },
  { en: 'Translation',               ar: 'الترجمة' },
  { en: 'History',                   ar: 'التاريخ' },
  { en: 'Political Science',         ar: 'العلوم السياسية' },
  { en: 'Islamic Studies',           ar: 'الدراسات الإسلامية' },

  // Design / arts
  { en: 'Industrial Design',         ar: 'التصميم الصناعي' },
  { en: 'Graphic Design',            ar: 'التصميم الجرافيكي' },
  { en: 'Interior Design',           ar: 'التصميم الداخلي' },
  { en: 'Fashion Design',            ar: 'تصميم الأزياء' },
  { en: 'Fine Arts',                 ar: 'الفنون الجميلة' },

  // Hospitality / tourism
  { en: 'Hospitality Management',    ar: 'إدارة الضيافة' },
  { en: 'Tourism Management',        ar: 'إدارة السياحة' },

  { en: 'Other',                     ar: 'أخرى' },
]

// Lookup helpers — match by either language so we can hydrate the picker from
// existing free-text values stored in the DB.
export function findUniversity(value: string | null | undefined): BilingualEntry | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return SAUDI_UNIVERSITIES.find((u) => u.en.toLowerCase() === v || u.ar === value.trim()) ?? null
}

export function findMajor(value: string | null | undefined): BilingualEntry | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return MAJORS.find((m) => m.en.toLowerCase() === v || m.ar === value.trim()) ?? null
}
