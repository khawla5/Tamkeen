// Holland RIASEC career framework — 6 codes, 18 career paths, 24 questions.
//
// Each question presents 4 activities/preferences. The user picks one. Each
// option is tagged with a single RIASEC code; selecting it adds +1 to that
// code's score. After 24 answers, the top-3 codes form the user's Holland Code
// (e.g. "IAS"), which we ship to the AI alongside raw answers.

export type RiasecCode = 'R' | 'I' | 'A' | 'S' | 'E' | 'C'
export const RIASEC_CODES: RiasecCode[] = ['R', 'I', 'A', 'S', 'E', 'C']

export const RIASEC_LABEL_EN: Record<RiasecCode, string> = {
  R: 'Realistic',
  I: 'Investigative',
  A: 'Artistic',
  S: 'Social',
  E: 'Enterprising',
  C: 'Conventional',
}

export const RIASEC_LABEL_AR: Record<RiasecCode, string> = {
  R: 'الواقعي',
  I: 'الاستقصائي',
  A: 'الفني',
  S: 'الاجتماعي',
  E: 'المُبادر',
  C: 'التقليدي',
}

// ──────────────────────────────────────────────────────────────────────
// Career catalog — 18 paths, 3 per RIASEC code. Saudi Vision 2030 aware.
// ──────────────────────────────────────────────────────────────────────
export interface CareerPath {
  id: string                  // slug used in the AI response
  code: RiasecCode            // primary RIASEC dimension
  title: string
  titleAr: string
  icon: string                // emoji / glyph
  tagline: string
  taglineAr: string
  // Detail-page enrichment
  salary: string              // e.g. "8,000 – 35,000 ﷼/mo"
  salaryAr: string
  topEmployers: string[]      // 3–5 well-known KSA employers per path
  skills: string[]            // 5–8 core skills
  stages: string[]            // 3 stages: junior → mid → senior (English only — short labels)
  stagesAr: string[]
}

// Stage labels reused across paths to keep curation light. Specialized
// titles per career are nice-to-have for v2.
const J_M_S = ['Junior', 'Mid-level', 'Senior']
const J_M_S_AR = ['مبتدئ', 'متوسط', 'متقدم']

export const CAREER_PATHS: CareerPath[] = [
  // R — Realistic
  { id: 'mechanical_engineering', code: 'R', icon: '', title: 'Mechanical Engineering', titleAr: 'الهندسة الميكانيكية',
    tagline: 'Designing machines, vehicles, and industrial systems.',
    taglineAr: 'تصميم الآلات والمركبات والأنظمة الصناعية',
    salary: '8,000 – 30,000 ﷼/mo', salaryAr: '8,000 – 30,000 ﷼/شهر',
    topEmployers: ['Aramco', 'SABIC', 'Maaden', 'Royal Commission Jubail', 'Ma\'aden'],
    skills: ['CAD/SolidWorks', 'Thermodynamics', 'Manufacturing', 'FEA', 'MATLAB'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'aerospace_aviation', code: 'R', icon: '', title: 'Aerospace & Aviation', titleAr: 'الطيران والفضاء',
    tagline: 'Aircraft, satellites, and the next generation of flight.',
    taglineAr: 'الطائرات والأقمار الصناعية وجيل جديد من الطيران',
    salary: '10,000 – 38,000 ﷼/mo', salaryAr: '10,000 – 38,000 ﷼/شهر',
    topEmployers: ['Saudia', 'Flynas', 'GACA', 'KACST', 'Saudi Space Agency'],
    skills: ['Aerodynamics', 'Avionics', 'Systems Engineering', 'CFD', 'Pilot Licensing'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'renewable_energy', code: 'R', icon: '', title: 'Renewable Energy & Sustainability', titleAr: 'الطاقة المتجددة والاستدامة',
    tagline: 'Solar, wind and clean-tech projects of Vision 2030.',
    taglineAr: 'الطاقة الشمسية والرياح ومشاريع الاستدامة في رؤية 2030',
    salary: '9,000 – 32,000 ﷼/mo', salaryAr: '9,000 – 32,000 ﷼/شهر',
    topEmployers: ['NEOM Energy', 'ACWA Power', 'Aramco', 'PIF', 'Red Sea Global'],
    skills: ['Solar PV', 'Energy Modeling', 'Sustainability Standards', 'Grid Engineering', 'GIS'],
    stages: J_M_S, stagesAr: J_M_S_AR },

  // I — Investigative
  { id: 'software_engineering', code: 'I', icon: '', title: 'Software Engineering', titleAr: 'هندسة البرمجيات',
    tagline: 'Building products, platforms, and infrastructure with code.',
    taglineAr: 'بناء المنتجات والمنصات والأنظمة بالبرمجة',
    salary: '12,000 – 45,000 ﷼/mo', salaryAr: '12,000 – 45,000 ﷼/شهر',
    topEmployers: ['STC', 'Elm', 'Noon', 'Tabby', 'Lean Technologies'],
    skills: ['JavaScript/TypeScript', 'Python', 'Cloud (AWS/GCP)', 'System Design', 'Git'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'data_science_ai', code: 'I', icon: '', title: 'Data Science & AI', titleAr: 'علم البيانات والذكاء الاصطناعي',
    tagline: 'Models, analytics, and intelligence at scale.',
    taglineAr: 'النماذج والتحليلات والذكاء الاصطناعي على نطاق واسع',
    salary: '14,000 – 50,000 ﷼/mo', salaryAr: '14,000 – 50,000 ﷼/شهر',
    topEmployers: ['SDAIA', 'KAUST', 'STC', 'Aramco Digital', 'Arabian Centres'],
    skills: ['Python', 'SQL', 'Machine Learning', 'Statistics', 'PyTorch/TensorFlow'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'healthcare_medicine', code: 'I', icon: '', title: 'Healthcare & Medicine', titleAr: 'الرعاية الصحية والطب',
    tagline: 'Diagnosing, treating, and advancing health science.',
    taglineAr: 'التشخيص والعلاج وتطوير علوم الصحة',
    salary: '12,000 – 60,000 ﷼/mo', salaryAr: '12,000 – 60,000 ﷼/شهر',
    topEmployers: ['MOH', 'King Faisal Hospital', 'Cleveland Clinic Riyadh', 'Dr. Sulaiman Al Habib', 'Ministry of Health'],
    skills: ['Clinical Reasoning', 'Patient Care', 'Medical Research', 'EHR Systems', 'Specialty Training'],
    stages: J_M_S, stagesAr: J_M_S_AR },

  // A — Artistic
  { id: 'architecture_design', code: 'A', icon: '', title: 'Architecture & Urban Design', titleAr: 'العمارة والتصميم العمراني',
    tagline: 'Shaping spaces, buildings, and cities of the future.',
    taglineAr: 'تشكيل الفضاءات والمباني ومدن المستقبل',
    salary: '8,000 – 28,000 ﷼/mo', salaryAr: '8,000 – 28,000 ﷼/شهر',
    topEmployers: ['NEOM', 'Diriyah Gate', 'Red Sea Global', 'Royal Commission AlUla', 'Dar Al-Handasah'],
    skills: ['AutoCAD', 'Revit', '3D Modeling', 'Urban Planning', 'Sustainable Design'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'film_media_gaming', code: 'A', icon: '', title: 'Film, Media & Gaming', titleAr: 'الإعلام والسينما والألعاب',
    tagline: 'Storytelling across screens, studios, and games.',
    taglineAr: 'سرد القصص عبر الشاشات والاستوديوهات والألعاب',
    salary: '7,000 – 30,000 ﷼/mo', salaryAr: '7,000 – 30,000 ﷼/شهر',
    topEmployers: ['MBC Group', 'Savvy Games', 'Manga Productions', 'NEOM Media', 'Red Sea Film Foundation'],
    skills: ['Storytelling', 'Adobe Premiere', 'Unity / Unreal', 'Cinematography', 'Sound Design'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'visual_arts_design', code: 'A', icon: '', title: 'Visual Arts & Design', titleAr: 'الفنون البصرية والتصميم',
    tagline: 'Graphic design, fashion, photography and visual identity.',
    taglineAr: 'التصميم الجرافيكي والأزياء والتصوير والهوية البصرية',
    salary: '6,000 – 22,000 ﷼/mo', salaryAr: '6,000 – 22,000 ﷼/شهر',
    topEmployers: ['Misk Foundation', 'Saudi Fashion Commission', 'Kayanee', 'Tashkeel', 'Wetaqah'],
    skills: ['Adobe Suite', 'Figma', 'Typography', 'Brand Identity', 'Photography'],
    stages: J_M_S, stagesAr: J_M_S_AR },

  // S — Social
  { id: 'education_teaching', code: 'S', icon: '', title: 'Education & Teaching', titleAr: 'التعليم والتدريس',
    tagline: 'Teaching, training, and shaping the next generation.',
    taglineAr: 'التدريس والتدريب وتشكيل الجيل القادم',
    salary: '6,000 – 20,000 ﷼/mo', salaryAr: '6,000 – 20,000 ﷼/شهر',
    topEmployers: ['Ministry of Education', 'Tatweer', 'KAUST Schools', 'Misk Schools', 'British International'],
    skills: ['Curriculum Design', 'Pedagogy', 'Classroom Management', 'EdTech Tools', 'Assessment'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'nursing_therapy', code: 'S', icon: '', title: 'Nursing & Therapy', titleAr: 'التمريض والعلاج',
    tagline: 'Caring for patients, recovery, and mental health.',
    taglineAr: 'رعاية المرضى والتأهيل والصحة النفسية',
    salary: '7,000 – 22,000 ﷼/mo', salaryAr: '7,000 – 22,000 ﷼/شهر',
    topEmployers: ['MOH', 'KFSHRC', 'Saudi German Hospitals', 'Dr. Sulaiman Al Habib', 'Cleveland Clinic'],
    skills: ['Clinical Practice', 'Patient Communication', 'Pharmacology', 'Mental Health', 'Triage'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'counseling_hr', code: 'S', icon: '', title: 'Counseling & HR', titleAr: 'الإرشاد والموارد البشرية',
    tagline: 'Coaching people, building teams, growing talent.',
    taglineAr: 'إرشاد الأفراد وبناء الفرق وتنمية المواهب',
    salary: '8,000 – 28,000 ﷼/mo', salaryAr: '8,000 – 28,000 ﷼/شهر',
    topEmployers: ['HRDF', 'Aramco', 'STC', 'PIF Companies', 'Tatweer'],
    skills: ['Recruiting', 'Coaching', 'L&D', 'HR Analytics', 'Org Design'],
    stages: J_M_S, stagesAr: J_M_S_AR },

  // E — Enterprising
  { id: 'business_entrepreneurship', code: 'E', icon: '', title: 'Business & Entrepreneurship', titleAr: 'الأعمال وريادة الأعمال',
    tagline: 'Building companies, leading ventures, scaling impact.',
    taglineAr: 'بناء الشركات وقيادة المشاريع وتوسيع الأثر',
    salary: '10,000 – 60,000+ ﷼/mo', salaryAr: '10,000 – 60,000+ ﷼/شهر',
    topEmployers: ['Monsha\'at', 'Misk Innovation', 'Wa\'ed Ventures', 'PIF', 'Khwarizmi Ventures'],
    skills: ['Strategy', 'Fundraising', 'Sales', 'Product Thinking', 'Operations'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'marketing_brand', code: 'E', icon: '', title: 'Marketing & Brand Strategy', titleAr: 'التسويق واستراتيجية العلامات',
    tagline: 'Brands, growth, audience and commercial strategy.',
    taglineAr: 'العلامات التجارية والنمو والجمهور والاستراتيجية',
    salary: '8,000 – 28,000 ﷼/mo', salaryAr: '8,000 – 28,000 ﷼/شهر',
    topEmployers: ['Noon', 'Almarai', 'STC', 'Saudia', 'Mobily'],
    skills: ['Brand Strategy', 'Performance Marketing', 'Content', 'Analytics', 'Storytelling'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'hospitality_tourism', code: 'E', icon: '', title: 'Hospitality, Tourism & Events', titleAr: 'الضيافة والسياحة والفعاليات',
    tagline: 'Hotels, destinations, and experiences across the Kingdom.',
    taglineAr: 'الفنادق والوجهات والتجارب في جميع أنحاء المملكة',
    salary: '6,000 – 25,000 ﷼/mo', salaryAr: '6,000 – 25,000 ﷼/شهر',
    topEmployers: ['Royal Commission AlUla', 'Red Sea Global', 'NEOM', 'Diriyah Gate', 'Saudi Tourism Authority'],
    skills: ['Guest Experience', 'Event Management', 'F&B Operations', 'Multilingual Service', 'Revenue Management'],
    stages: J_M_S, stagesAr: J_M_S_AR },

  // C — Conventional
  { id: 'finance_banking', code: 'C', icon: '', title: 'Finance & Banking', titleAr: 'التمويل والبنوك',
    tagline: 'Capital, investment, risk, and financial markets.',
    taglineAr: 'رأس المال والاستثمار والمخاطر والأسواق المالية',
    salary: '12,000 – 50,000 ﷼/mo', salaryAr: '12,000 – 50,000 ﷼/شهر',
    topEmployers: ['SNB', 'Al Rajhi', 'Riyad Bank', 'PIF', 'SAMA'],
    skills: ['Financial Modeling', 'Excel/SQL', 'Valuation', 'Risk Analysis', 'CFA Track'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'accounting_auditing', code: 'C', icon: '', title: 'Accounting & Auditing', titleAr: 'المحاسبة والتدقيق',
    tagline: 'Financial reporting, compliance, and assurance.',
    taglineAr: 'التقارير المالية والامتثال والتدقيق',
    salary: '8,000 – 30,000 ﷼/mo', salaryAr: '8,000 – 30,000 ﷼/شهر',
    topEmployers: ['PwC KSA', 'EY', 'KPMG', 'Deloitte', 'GAZT'],
    skills: ['IFRS', 'Audit Procedures', 'Tax (Zakat/VAT)', 'ERP Systems', 'SOCPA Track'],
    stages: J_M_S, stagesAr: J_M_S_AR },
  { id: 'operations_supply_chain', code: 'C', icon: '', title: 'Operations & Supply Chain', titleAr: 'العمليات وسلاسل الإمداد',
    tagline: 'Logistics, procurement, and large-scale operations.',
    taglineAr: 'اللوجستيات والمشتريات والعمليات واسعة النطاق',
    salary: '8,000 – 28,000 ﷼/mo', salaryAr: '8,000 – 28,000 ﷼/شهر',
    topEmployers: ['Saudi Post (SPL)', 'Bahri', 'Aramex KSA', 'Tabadul', 'Almarai'],
    skills: ['Supply Chain Planning', 'Procurement', 'Lean / Six Sigma', 'ERP (SAP/Oracle)', 'Data Analytics'],
    stages: J_M_S, stagesAr: J_M_S_AR },
]

// Quick lookup helpers
export function findCareer(slug: string): CareerPath | undefined {
  return CAREER_PATHS.find((p) => p.id === slug)
}

// ──────────────────────────────────────────────────────────────────────
// Question bank — 24 questions across 6 thematic sections (4 per section).
// Each option is tagged with a single RIASEC code.
// ──────────────────────────────────────────────────────────────────────
export type SectionKey = 'activities' | 'environment' | 'problems' | 'skills' | 'values' | 'future'

export const SECTIONS: { key: SectionKey; range: [number, number] }[] = [
  { key: 'activities',  range: [0, 3] },
  { key: 'environment', range: [4, 7] },
  { key: 'problems',    range: [8, 11] },
  { key: 'skills',      range: [12, 15] },
  { key: 'values',      range: [16, 19] },
  { key: 'future',      range: [20, 23] },
]

export const SECTION_LABELS: Record<SectionKey, { en: string; ar: string }> = {
  activities:  { en: 'Activities You Enjoy',     ar: 'الأنشطة التي تستمتع بها' },
  environment: { en: 'Work Environment',          ar: 'بيئة العمل' },
  problems:    { en: 'Approach to Problems',      ar: 'أسلوب حل المشكلات' },
  skills:      { en: 'Skills & Strengths',        ar: 'المهارات ونقاط القوة' },
  values:      { en: 'Values & Motivation',       ar: 'القيم والتحفيز' },
  future:      { en: 'Future Vision',             ar: 'رؤية المستقبل' },
}

export interface RiasecOption {
  text: string
  textAr: string
  code: RiasecCode
}

export interface RiasecQuestion {
  id: number
  question: string
  questionAr: string
  options: RiasecOption[]
}

export const RIASEC_QUESTIONS: RiasecQuestion[] = [
  // ── Section 1 — Activities you enjoy ─────────────────────────────────
  {
    id: 1,
    question: 'Which would you rather spend a free Saturday on?',
    questionAr: 'أي نشاط تفضّل قضاء يوم سبت في فعله؟',
    options: [
      { code: 'R', text: 'Building or repairing something hands-on', textAr: 'بناء شيء بيديك أو إصلاحه' },
      { code: 'I', text: 'Solving a tricky puzzle or coding challenge', textAr: 'حل لغز معقد أو تحدٍّ برمجي' },
      { code: 'A', text: 'Painting, photography, music or design', textAr: 'الرسم أو التصوير أو الموسيقى أو التصميم' },
      { code: 'S', text: 'Volunteering with a community group', textAr: 'التطوع مع مجموعة مجتمعية' },
    ],
  },
  {
    id: 2,
    question: 'You have an afternoon free — what calls you?',
    questionAr: 'لديك بعد ظهيرة فارغة، ما الذي يجذبك؟',
    options: [
      { code: 'I', text: 'Reading deeply about a topic that fascinates you', textAr: 'القراءة المعمّقة في موضوع يأسرك' },
      { code: 'A', text: 'A film, exhibition, or creative project', textAr: 'فيلم أو معرض أو مشروع إبداعي' },
      { code: 'E', text: 'A networking event, meeting new people', textAr: 'حدث تواصل ولقاء أشخاص جدد' },
      { code: 'C', text: 'Organizing your space and planning the week', textAr: 'تنظيم مساحتك والتخطيط للأسبوع' },
    ],
  },
  {
    id: 3,
    question: 'Which kind of content draws you in?',
    questionAr: 'أي نوع من المحتوى يجذبك أكثر؟',
    options: [
      { code: 'R', text: 'How-things-are-made / engineering documentaries', textAr: 'وثائقيات عن الصناعة والهندسة' },
      { code: 'I', text: 'Science deep-dives and research breakthroughs', textAr: 'أبحاث علمية وإنجازات في المعرفة' },
      { code: 'A', text: 'Films, fiction, biographies, design', textAr: 'الأفلام والروايات والسير والتصميم' },
      { code: 'E', text: 'Business stories, founders, deal-making', textAr: 'قصص الأعمال والمؤسسين والصفقات' },
    ],
  },
  {
    id: 4,
    question: 'At a community event you naturally end up:',
    questionAr: 'في فعالية مجتمعية، تجد نفسك تلقائياً:',
    options: [
      { code: 'R', text: 'Helping set things up, fixing what breaks', textAr: 'تساعد في الإعداد وإصلاح ما يتعطل' },
      { code: 'S', text: 'Welcoming people, making them feel at home', textAr: 'تستقبل الناس وتشعرهم بالراحة' },
      { code: 'E', text: 'Leading or coordinating the activity', textAr: 'تقود أو تنسّق النشاط' },
      { code: 'C', text: 'Managing the schedule and registration list', textAr: 'تدير الجدول وقائمة المشاركين' },
    ],
  },

  // ── Section 2 — Work environment ─────────────────────────────────────
  {
    id: 5,
    question: 'Your ideal workspace looks like:',
    questionAr: 'مساحة عملك المثالية تبدو كـ:',
    options: [
      { code: 'R', text: 'A workshop, lab bench, or job site', textAr: 'ورشة أو مختبر أو موقع عمل ميداني' },
      { code: 'I', text: 'A quiet office for deep thinking', textAr: 'مكتب هادئ للتفكير العميق' },
      { code: 'A', text: 'A studio with creative freedom', textAr: 'استوديو فيه حرية إبداعية' },
      { code: 'S', text: 'A team-based collaborative space', textAr: 'مساحة تعاونية مع فريق' },
    ],
  },
  {
    id: 6,
    question: 'You\'d thrive most at:',
    questionAr: 'ستزدهر أكثر في:',
    options: [
      { code: 'I', text: 'A research-driven institution', textAr: 'مؤسسة بحثية' },
      { code: 'A', text: 'A creative agency or studio', textAr: 'وكالة إبداعية أو استوديو' },
      { code: 'E', text: 'A fast-moving startup or venture', textAr: 'شركة ناشئة أو مشروع سريع النمو' },
      { code: 'C', text: 'A structured corporate environment', textAr: 'بيئة شركة منظمة' },
    ],
  },
  {
    id: 7,
    question: 'The pace that suits you best:',
    questionAr: 'الإيقاع الذي يناسبك:',
    options: [
      { code: 'R', text: 'Steady, with concrete daily progress', textAr: 'منتظم مع تقدم يومي ملموس' },
      { code: 'I', text: 'Deep focus on long-form thinking', textAr: 'تركيز عميق على تفكير طويل المدى' },
      { code: 'E', text: 'Fast, with constant action and decisions', textAr: 'سريع وفيه قرارات وأفعال مستمرة' },
      { code: 'S', text: 'People-paced, lots of interaction', textAr: 'بإيقاع الناس ومع كثير من التفاعل' },
    ],
  },
  {
    id: 8,
    question: 'You feel most alive working with:',
    questionAr: 'تشعر بأنك في قمة عطائك حين تعمل مع:',
    options: [
      { code: 'R', text: 'Tools, machines, physical materials', textAr: 'الأدوات والآلات والمواد المادية' },
      { code: 'I', text: 'Data, theories, and concepts', textAr: 'البيانات والنظريات والمفاهيم' },
      { code: 'A', text: 'Designs, stories, and ideas', textAr: 'التصاميم والقصص والأفكار' },
      { code: 'C', text: 'Numbers, records, and documentation', textAr: 'الأرقام والسجلات والوثائق' },
    ],
  },

  // ── Section 3 — Approach to problems ─────────────────────────────────
  {
    id: 9,
    question: 'Facing a tough problem, your first instinct is to:',
    questionAr: 'أمام مشكلة صعبة، أول ما تفعله:',
    options: [
      { code: 'I', text: 'Research it, look up the theory', textAr: 'تبحث فيها وتقرأ النظرية' },
      { code: 'A', text: 'Imagine wild creative angles', textAr: 'تتخيل زوايا إبداعية جريئة' },
      { code: 'E', text: 'Talk to people who solved it before', textAr: 'تتحدث لمن حلّوها سابقاً' },
      { code: 'C', text: 'Build a step-by-step plan', textAr: 'تضع خطة بخطوات منظمة' },
    ],
  },
  {
    id: 10,
    question: 'Your friends would say you\'re best at:',
    questionAr: 'أصدقاؤك سيقولون إنك الأفضل في:',
    options: [
      { code: 'R', text: 'Fixing things that are broken', textAr: 'إصلاح الأشياء المعطلة' },
      { code: 'I', text: 'Spotting patterns no one else sees', textAr: 'ملاحظة الأنماط التي يفوتها الآخرون' },
      { code: 'S', text: 'Mediating between people', textAr: 'الوساطة بين الناس' },
      { code: 'E', text: 'Convincing others to take action', textAr: 'إقناع الآخرين بالتحرك' },
    ],
  },
  {
    id: 11,
    question: 'Given a vague brief, you would:',
    questionAr: 'إذا أُعطيت تكليفاً غير واضح، ستـ:',
    options: [
      { code: 'A', text: 'Brainstorm a wide set of possibilities', textAr: 'تستعرض مجموعة واسعة من الاحتمالات الإبداعية' },
      { code: 'I', text: 'Break it down into testable parts', textAr: 'تفككه إلى أجزاء قابلة للاختبار' },
      { code: 'E', text: 'Pitch a bold direction and rally a team', textAr: 'تقترح اتجاهاً جريئاً وتحشد الفريق' },
      { code: 'C', text: 'Define clear scope and success criteria', textAr: 'تحدد النطاق الواضح ومعايير النجاح' },
    ],
  },
  {
    id: 12,
    question: 'When something fails, you instinctively:',
    questionAr: 'عند الفشل، غريزتك أن تـ:',
    options: [
      { code: 'R', text: 'Take it apart to see what broke', textAr: 'تفكك الأمر لترى أين الخلل' },
      { code: 'I', text: 'Analyze which assumption was wrong', textAr: 'تحلل أي فرضية كانت خاطئة' },
      { code: 'A', text: 'Step back and try a different angle', textAr: 'تتراجع وتجرّب زاوية مختلفة' },
      { code: 'S', text: 'Talk it through with someone you trust', textAr: 'تتحدث عنها مع شخص تثق به' },
    ],
  },

  // ── Section 4 — Skills & strengths ───────────────────────────────────
  {
    id: 13,
    question: 'Which skill would you most enjoy mastering?',
    questionAr: 'أي مهارة ستستمتع بإتقانها؟',
    options: [
      { code: 'R', text: 'Engineering, mechanics, manufacturing', textAr: 'الهندسة والميكانيكا والتصنيع' },
      { code: 'I', text: 'Programming, statistics, scientific methods', textAr: 'البرمجة والإحصاء والمنهج العلمي' },
      { code: 'A', text: 'Design, writing, music, video production', textAr: 'التصميم والكتابة والموسيقى وإنتاج الفيديو' },
      { code: 'C', text: 'Accounting, financial modelling, audit', textAr: 'المحاسبة والنمذجة المالية والتدقيق' },
    ],
  },
  {
    id: 14,
    question: 'You learn fastest when you:',
    questionAr: 'تتعلم بأسرع وقت حين:',
    options: [
      { code: 'R', text: 'Do it with your own hands', textAr: 'تنفّذ بيديك' },
      { code: 'I', text: 'Read deeply about the theory', textAr: 'تقرأ بعمق عن النظرية' },
      { code: 'A', text: 'Watch it created and copy then improvise', textAr: 'تشاهد كيف يُصنع ثم تُقلّد وتبدع' },
      { code: 'S', text: 'Teach it to someone else', textAr: 'تعلّمها لشخص آخر' },
    ],
  },
  {
    id: 15,
    question: 'Your strongest type of intelligence is:',
    questionAr: 'أقوى أنواع ذكائك هو:',
    options: [
      { code: 'I', text: 'Logical / analytical', textAr: 'منطقي / تحليلي' },
      { code: 'A', text: 'Creative / aesthetic', textAr: 'إبداعي / جمالي' },
      { code: 'S', text: 'Emotional / interpersonal', textAr: 'عاطفي / اجتماعي' },
      { code: 'E', text: 'Persuasive / strategic', textAr: 'إقناعي / استراتيجي' },
    ],
  },
  {
    id: 16,
    question: 'The compliment you\'d most enjoy at work:',
    questionAr: 'الإطراء الذي تستمتع به في العمل:',
    options: [
      { code: 'R', text: '"Reliable — always gets things done"', textAr: '"موثوق — ينجز دائماً"' },
      { code: 'I', text: '"Brilliant and thoughtful"', textAr: '"عبقري ومتأنّي"' },
      { code: 'A', text: '"Original and imaginative"', textAr: '"أصيل ومُبدع"' },
      { code: 'E', text: '"Inspiring and charismatic"', textAr: '"ملهم وكاريزمي"' },
    ],
  },

  // ── Section 5 — Values & motivation ──────────────────────────────────
  {
    id: 17,
    question: 'What drives you most?',
    questionAr: 'ما الذي يحرّكك أكثر؟',
    options: [
      { code: 'R', text: 'Mastery — being truly skilled at a craft', textAr: 'الإتقان — أن تكون بارعاً حقيقياً في حرفتك' },
      { code: 'I', text: 'Understanding — knowing how things work', textAr: 'الفهم — معرفة كيف تعمل الأشياء' },
      { code: 'S', text: 'Impact — improving lives', textAr: 'الأثر — تحسين حياة الناس' },
      { code: 'E', text: 'Achievement — reaching big goals', textAr: 'الإنجاز — بلوغ أهداف كبرى' },
    ],
  },
  {
    id: 18,
    question: 'You\'d feel most proud at year-end if you:',
    questionAr: 'ستشعر بالفخر في نهاية السنة إذا:',
    options: [
      { code: 'R', text: 'Built something tangible that lasts', textAr: 'بنيت شيئاً ملموساً يدوم' },
      { code: 'I', text: 'Discovered or proved something new', textAr: 'اكتشفت أو أثبتت شيئاً جديداً' },
      { code: 'A', text: 'Created a body of original work', textAr: 'أنتجت أعمالاً إبداعية أصيلة' },
      { code: 'S', text: 'Genuinely helped many people', textAr: 'ساعدت كثيراً من الناس فعلاً' },
    ],
  },
  {
    id: 19,
    question: 'The workplace value that matters most:',
    questionAr: 'القيمة الأهم في بيئة عملك:',
    options: [
      { code: 'I', text: 'Intellectual integrity', textAr: 'النزاهة الفكرية' },
      { code: 'A', text: 'Creative freedom', textAr: 'الحرية الإبداعية' },
      { code: 'S', text: 'Care for others', textAr: 'العناية بالآخرين' },
      { code: 'C', text: 'Reliability and order', textAr: 'الموثوقية والنظام' },
    ],
  },
  {
    id: 20,
    question: 'The recognition that means most to you:',
    questionAr: 'التقدير الذي يعني لك الكثير:',
    options: [
      { code: 'R', text: 'A craftsman peer respecting your work', textAr: 'احترام صانع ماهر لعملك' },
      { code: 'I', text: 'Being cited for original thinking', textAr: 'الاستشهاد بك على فكر أصيل' },
      { code: 'E', text: 'Trusted with bigger responsibility', textAr: 'يُعهد إليك بمسؤولية أكبر' },
      { code: 'C', text: 'Known as the dependable expert', textAr: 'معروف بأنك الخبير الذي يُعتمد عليه' },
    ],
  },

  // ── Section 6 — Future vision ────────────────────────────────────────
  {
    id: 21,
    question: 'Ten years from now you\'d most love to be:',
    questionAr: 'بعد عشر سنوات تتمنى أن تكون:',
    options: [
      { code: 'R', text: 'Leading an engineering team building real things', textAr: 'تقود فريقاً هندسياً يبني أشياء حقيقية' },
      { code: 'I', text: 'A respected expert / researcher', textAr: 'خبير أو باحث محترم في مجالك' },
      { code: 'A', text: 'Running your own creative practice', textAr: 'تدير ممارستك الإبداعية الخاصة' },
      { code: 'E', text: 'Founding or running a company', textAr: 'تؤسس أو تدير شركة' },
    ],
  },
  {
    id: 22,
    question: 'A future profile of you would headline:',
    questionAr: 'العنوان المستقبلي عن مسيرتك سيكون:',
    options: [
      { code: 'R', text: '"Builder of [a major project]"', textAr: '"باني [مشروع كبير]"' },
      { code: 'I', text: '"Pioneer of [a scientific field]"', textAr: '"رائد [مجال علمي]"' },
      { code: 'S', text: '"Champion of [a social cause]"', textAr: '"بطل [قضية اجتماعية]"' },
      { code: 'C', text: '"Trusted advisor of [an industry]"', textAr: '"مستشار موثوق لـ[قطاع]"' },
    ],
  },
  {
    id: 23,
    question: 'In your dream career you\'d most influence:',
    questionAr: 'في حلمك المهني، تريد أن تؤثر في:',
    options: [
      { code: 'R', text: 'Physical world / infrastructure', textAr: 'العالم المادي / البنية التحتية' },
      { code: 'I', text: 'Knowledge and discovery', textAr: 'المعرفة والاكتشاف' },
      { code: 'A', text: 'Culture and aesthetics', textAr: 'الثقافة والجمال' },
      { code: 'S', text: 'People and society', textAr: 'الناس والمجتمع' },
    ],
  },
  {
    id: 24,
    question: 'The legacy you\'d most want to leave:',
    questionAr: 'الإرث الذي تتمناه:',
    options: [
      { code: 'R', text: 'Something built that improves daily life', textAr: 'شيء مبني يحسّن الحياة اليومية' },
      { code: 'A', text: 'A creative work that moves people', textAr: 'عمل إبداعي يلامس الناس' },
      { code: 'S', text: 'Mentees and students who change the world', textAr: 'طلاب وموجَّهون يغيرون العالم' },
      { code: 'E', text: 'A successful organization you founded', textAr: 'منظمة ناجحة أسستها' },
    ],
  },
]

// ──────────────────────────────────────────────────────────────────────
// Scoring
// ──────────────────────────────────────────────────────────────────────
export type RiasecScores = Record<RiasecCode, number>

export function emptyScores(): RiasecScores {
  return { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 }
}

export function scoreAnswers(answers: number[]): RiasecScores {
  const scores = emptyScores()
  for (let i = 0; i < answers.length; i++) {
    const q = RIASEC_QUESTIONS[i]
    if (!q) continue
    const opt = q.options[answers[i]]
    if (!opt) continue
    scores[opt.code] += 1
  }
  return scores
}

// Returns the top-3 codes as a single string, e.g. "IAS"
export function hollandCode(scores: RiasecScores): string {
  return [...RIASEC_CODES]
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, 3)
    .join('')
}
