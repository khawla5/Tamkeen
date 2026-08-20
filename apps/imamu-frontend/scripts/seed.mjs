// ============================================================
// Tamkeen (تمكين) · seed script
// Populates the database with realistic, IMSIU-specific Saudi demo data.
//
// Run:    npm run seed
// Reset:  npm run seed -- --reset    (deletes all *@demo.tamkeen.sa users)
//
// REQUIRED in .env.local:
//   VITE_SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   (or the legacy service_role JWT)
//
// Naming rules (see CLAUDE.md): platform = Tamkeen / تمكين. The only university
// is IMSIU (جامعة الإمام محمد بن سعود الإسلامية). Training partner = ZAKA AI / زكا.
// Demo login company = SDAIA / سدايا. No Fursati / Yamamah / Tuwaiq / test.com.
// Western digits everywhere (1,247 — never ١٬٢٤٧).
// ============================================================

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// --- Load .env.local ---
const envPath = path.join(rootDir, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'Demo1234!'
const RESET = process.argv.includes('--reset')
const DOMAIN = '@demo.tamkeen.sa'

// Fixed reference date so seeded timestamps are deterministic across runs.
const NOW = new Date('2026-06-06T09:00:00.000Z')
function daysAgo(n) {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
}

// ============================================================
// Canonical demo numbers (must match CLAUDE.md / CONTENT_STYLE_GUIDE.md)
// ============================================================
const CANONICAL = {
  students_on_platform: 4218,
  assessments_completed: 3412,
  skills_records: 2847,
  active_coop: 318,
  employment_6m: 74,
  partnerships: 15,
  avg_readiness: 71,
}

// ============================================================
// Employers (14 — Saudi-credible). SDAIA is the demo-login company AND part of
// the employer pool: one account, no duplicate.
// ============================================================
const COMPANIES = [
  {
    email: `sdaia${DOMAIN}`,
    name: 'SDAIA', name_ar: 'سدايا',
    profile: { industry: 'AI & Data', industry_ar: 'الذكاء الاصطناعي والبيانات', size: '1,000+ employees', location: 'Riyadh', plan: 'premium', logo_url: '/logos/sdaia.svg' },
    opps: [
      { title: 'Machine Learning Research Co-op', title_ar: 'تدريب تعاوني — أبحاث تعلّم الآلة', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '5 months', duration_ar: '5 أشهر',
        salary: 'SAR 5,000 / mo', salary_ar: '5,000 ريال شهرياً', deadline: '2026-08-20',
        description: 'A co-op placement inside the National Center for AI, working on Arabic natural-language models with senior researchers. You will help prepare datasets, run training experiments, and document results for production teams. Open to final-year students in computer science or related fields.',
        description_ar: 'تدريب تعاوني داخل المركز الوطني للذكاء الاصطناعي للعمل على نماذج اللغة العربية مع باحثين متخصصين. تشارك في تجهيز البيانات وتشغيل تجارب التدريب وتوثيق النتائج لفرق الإنتاج. متاح لطلاب السنة الأخيرة في علوم الحاسب والتخصصات القريبة لمدة 5 أشهر.',
        skills: ['Python', 'PyTorch', 'NLP', 'Research'] },
      { title: 'AI Engineer', title_ar: 'مهندس ذكاء اصطناعي', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 18,000 – 28,000 / mo', salary_ar: '18,000 – 28,000 ريال شهرياً', deadline: '2026-09-15',
        description: 'Own machine-learning services end to end, from data pipeline to deployment and monitoring on national platforms. The role sits with a delivery squad that ships models supporting government services under رؤية المملكة 2030. Strong Python and MLOps fundamentals expected.',
        description_ar: 'مسؤولية كاملة عن خدمات تعلّم الآلة من مسار البيانات حتى النشر والمراقبة على منصات وطنية. تعمل ضمن فريق يطوّر نماذج تخدم القطاع الحكومي ضمن رؤية المملكة 2030. يتطلب إتقان Python وأساسيات MLOps.',
        skills: ['Python', 'MLOps', 'TensorFlow', 'Cloud'] },
      { title: 'Data Engineer', title_ar: 'مهندس بيانات', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 15,000 – 23,000 / mo', salary_ar: '15,000 – 23,000 ريال شهرياً', deadline: '2026-09-30',
        description: 'Design and operate the data backbone behind Saudi-scale analytics: streaming ingestion, warehouses, and governance. You will partner with data scientists to make trustworthy data available across the platform. Hands-on experience with SQL and distributed processing is essential.',
        description_ar: 'تصميم وتشغيل البنية التحتية للبيانات على نطاق وطني: التدفق اللحظي والمستودعات والحوكمة. تتعاون مع علماء البيانات لإتاحة بيانات موثوقة عبر المنصة. خبرة عملية في SQL والمعالجة الموزّعة شرط أساسي.',
        skills: ['SQL', 'Spark', 'Airflow', 'Snowflake'] },
      { title: 'Data Science Training Program', title_ar: 'برنامج تدريبي — علم البيانات', type: 'training',
        location: 'Riyadh', location_ar: 'الرياض', duration: '3 months', duration_ar: '3 أشهر',
        salary: 'Fully sponsored', salary_ar: 'مدعوم بالكامل', deadline: '2026-07-25',
        description: 'A structured training track that takes graduates from statistics fundamentals to a deployed analytics project. Sessions are led by practitioners and mixed with mentored project work. Graduates join a talent pool reviewed by hiring teams.',
        description_ar: 'مسار تدريبي منظّم ينقل الخريجين من أساسيات الإحصاء إلى مشروع تحليلي منشور. تُقدَّم الجلسات بإشراف ممارسين وتُدمج مع عمل مشاريع موجَّه. ينضم الخريجون إلى قائمة كفاءات تطّلع عليها فرق التوظيف.',
        skills: ['Statistics', 'Python', 'SQL', 'Data Visualization'] },
      { title: 'Data Analyst', title_ar: 'محلل بيانات', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 12,000 – 17,000 / mo', salary_ar: '12,000 – 17,000 ريال شهرياً', deadline: '2026-10-05',
        description: 'Turn raw operational data into decisions for programme leaders. The work spans dashboards, ad-hoc analysis, and clear written briefs for non-technical stakeholders. Comfort with SQL and a BI tool is the main requirement.',
        description_ar: 'تحويل البيانات التشغيلية إلى قرارات لقادة البرامج. يشمل العمل لوحات المعلومات والتحليل الفوري وكتابة موجزات واضحة لأطراف غير تقنية. إتقان SQL وإحدى أدوات ذكاء الأعمال هو المتطلب الرئيسي.',
        skills: ['SQL', 'Power BI', 'Excel', 'Storytelling'] },
    ],
  },
  {
    email: `aramco${DOMAIN}`,
    name: 'Saudi Aramco', name_ar: 'أرامكو السعودية',
    profile: { industry: 'Energy', industry_ar: 'الطاقة', size: '70,000+ employees', location: 'Dhahran', plan: 'premium', logo_url: '/logos/aramco.svg' },
    opps: [
      { title: 'Software Engineer — Digital', title_ar: 'مهندس برمجيات — القطاع الرقمي', type: 'job',
        location: 'Dhahran', location_ar: 'الظهران', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 14,000 – 22,000 / mo', salary_ar: '14,000 – 22,000 ريال شهرياً', deadline: '2026-09-30',
        description: 'Build internal platforms used by tens of thousands of employees across the energy value chain. The stack is modern (TypeScript, Python, cloud) and teams own their services end to end. A strong foundation in data structures and clean code is what we look for.',
        description_ar: 'بناء منصات داخلية يستخدمها عشرات الآلاف من الموظفين عبر سلسلة قيمة الطاقة. التقنيات حديثة (TypeScript وPython والسحابة) وتمتلك الفرق خدماتها بالكامل. نبحث عن أساس متين في هياكل البيانات وكتابة كود نظيف.',
        skills: ['TypeScript', 'Python', 'Cloud', 'System Design'] },
      { title: 'Petroleum Engineering Co-op', title_ar: 'تدريب تعاوني — هندسة البترول', type: 'coop',
        location: 'Dhahran', location_ar: 'الظهران', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 4,500 / mo', salary_ar: '4,500 ريال شهرياً', deadline: '2026-08-15',
        description: 'Spend six months alongside reservoir and production engineers on real field problems. You will rotate through well design, reservoir characterization, and production optimization. Suited to final-year engineering students seeking depth before graduation.',
        description_ar: 'ستة أشهر إلى جانب مهندسي المكامن والإنتاج على مسائل ميدانية حقيقية. تتنقّل بين تصميم الآبار وتوصيف المكامن وتحسين الإنتاج. مناسب لطلاب الهندسة في السنة الأخيرة الباحثين عن تعمّق قبل التخرج.',
        skills: ['Reservoir Engineering', 'MATLAB', 'Data Analysis'] },
      { title: 'Sustainability Analyst', title_ar: 'محلل استدامة', type: 'job',
        location: 'Dhahran', location_ar: 'الظهران', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 12,000 – 18,000 / mo', salary_ar: '12,000 – 18,000 ريال شهرياً', deadline: '2026-09-12',
        description: 'Support the company net-zero roadmap with quantitative analysis of emissions, efficiency, and renewables integration. Expect a blend of modeling, reporting, and cross-team coordination tied to رؤية المملكة 2030 targets. Strong spreadsheet and analytical skills required.',
        description_ar: 'دعم خارطة الطريق للحياد الكربوني عبر تحليل كمي للانبعاثات والكفاءة ودمج المصادر المتجددة. يجمع الدور بين النمذجة وإعداد التقارير والتنسيق بين الفرق ضمن مستهدفات رؤية المملكة 2030. يتطلب مهارات تحليلية قوية وإتقان جداول البيانات.',
        skills: ['Energy Modeling', 'Excel', 'Sustainability Reporting'] },
      { title: 'Cloud Platform Certification', title_ar: 'شهادة — منصات سحابية', type: 'certification',
        location: 'Dhahran', location_ar: 'الظهران', duration: '10 weeks', duration_ar: '10 أسابيع',
        salary: 'SAR 1,800', salary_ar: '1,800 ريال', deadline: '2026-07-22',
        description: 'A focused certification covering cloud architecture, security, and operations for enterprise workloads. It mixes labs with an assessed capstone on a real scenario. Useful for engineering graduates targeting platform roles.',
        description_ar: 'شهادة مركّزة تغطّي بنية السحابة وأمنها وعملياتها لأحمال العمل المؤسسية. تمزج بين المختبرات ومشروع ختامي مُقيَّم على سيناريو واقعي. مفيدة لخريجي الهندسة الراغبين في أدوار المنصات.',
        skills: ['Cloud', 'Security', 'DevOps'] },
    ],
  },
  {
    email: `stc${DOMAIN}`,
    name: 'stc', name_ar: 'stc — الاتصالات السعودية',
    profile: { industry: 'Telecom', industry_ar: 'الاتصالات', size: '20,000+ employees', location: 'Riyadh', plan: 'premium', logo_url: '/logos/stc.svg' },
    opps: [
      { title: 'Frontend Engineer', title_ar: 'مهندس واجهات أمامية', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 13,000 – 20,000 / mo', salary_ar: '13,000 – 20,000 ريال شهرياً', deadline: '2026-10-01',
        description: 'Ship customer apps used by millions of subscribers. The team works design-system-first with React and TypeScript and cares deeply about performance. You will own features from prototype to production behind real usage metrics.',
        description_ar: 'تطوير تطبيقات عملاء يستخدمها ملايين المشتركين. يعمل الفريق بمنهج نظام التصميم أولاً باستخدام React وTypeScript ويهتم كثيراً بالأداء. تمتلك الميزات من النموذج الأولي حتى الإنتاج خلف مؤشرات استخدام حقيقية.',
        skills: ['React', 'TypeScript', 'Performance', 'Design Systems'] },
      { title: 'Network Operations Trainee', title_ar: 'متدرب عمليات شبكات', type: 'training',
        location: 'Riyadh', location_ar: 'الرياض', duration: '4 months', duration_ar: '4 أشهر',
        salary: 'Fully sponsored', salary_ar: 'مدعوم بالكامل', deadline: '2026-07-30',
        description: 'Hands-on training across 5G core networks, network operations, and incident handling. You will shadow on-call engineers and complete graded labs each week. Top performers receive a full-time offer.',
        description_ar: 'تدريب عملي على شبكات الجيل الخامس وعمليات الشبكة ومعالجة الحوادث. تلازم مهندسي المناوبة وتنجز مختبرات مُقيَّمة أسبوعياً. يحصل المتميزون على عرض وظيفة بدوام كامل.',
        skills: ['Networking', 'Linux', 'TCP/IP'] },
      { title: 'Data Analytics Co-op', title_ar: 'تدريب تعاوني — تحليل البيانات', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 4,000 / mo', salary_ar: '4,000 ريال شهرياً', deadline: '2026-08-22',
        description: 'Analyze customer behaviour across stc products and present findings that shape decisions. The placement gives you a real business question to own end to end with SQL and BI dashboards. Open to final-year students.',
        description_ar: 'تحليل سلوك العملاء عبر منتجات stc وعرض نتائج تؤثر في القرارات. يمنحك التدريب سؤال أعمال حقيقياً تمتلكه بالكامل باستخدام SQL ولوحات ذكاء الأعمال. متاح لطلاب السنة الأخيرة.',
        skills: ['SQL', 'Tableau', 'Statistics'] },
      { title: 'Cybersecurity Analyst', title_ar: 'محلل أمن سيبراني', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 14,000 – 21,000 / mo', salary_ar: '14,000 – 21,000 ريال شهرياً', deadline: '2026-10-10',
        description: 'Monitor and defend telecom infrastructure inside a 24/7 security operations centre. Day to day you triage alerts, investigate incidents, and tune detections. Foundational knowledge of network security and a willingness to learn fast matter most.',
        description_ar: 'حماية البنية التحتية للاتصالات ومراقبتها داخل مركز عمليات أمنية يعمل على مدار الساعة. تتعامل يومياً مع التنبيهات وتحقق في الحوادث وتضبط أدوات الكشف. المعرفة الأساسية بأمن الشبكات والرغبة في التعلّم السريع هما الأهم.',
        skills: ['Network Security', 'SIEM', 'Incident Response'] },
    ],
  },
  {
    email: `neom${DOMAIN}`,
    name: 'NEOM', name_ar: 'نيوم',
    profile: { industry: 'Giga-project', industry_ar: 'مشروع عملاق', size: '5,000+ employees', location: 'Tabuk', plan: 'premium', logo_url: '/logos/neom.svg' },
    opps: [
      { title: 'Smart City Software Engineer', title_ar: 'مهندس برمجيات للمدن الذكية', type: 'job',
        location: 'Tabuk', location_ar: 'تبوك', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 16,000 – 26,000 / mo', salary_ar: '16,000 – 26,000 ريال شهرياً', deadline: '2026-11-15',
        description: 'Develop the digital services that run sensor-rich districts of THE LINE. You will work with streaming data, mapping, and reliable backend services at city scale. The work is hybrid with periods on site in the north-west.',
        description_ar: 'تطوير الخدمات الرقمية التي تُشغّل أحياء THE LINE الغنية بالمستشعرات. تعمل مع البيانات اللحظية وأنظمة الخرائط وخدمات خلفية موثوقة على مستوى مدينة. العمل هجين مع فترات حضور ميداني في الشمال الغربي.',
        skills: ['Go', 'Kubernetes', 'IoT', 'Backend'] },
      { title: 'Sustainability Co-op', title_ar: 'تدريب تعاوني — الاستدامة', type: 'coop',
        location: 'Hybrid', location_ar: 'هجين', duration: '5 months', duration_ar: '5 أشهر',
        salary: 'SAR 4,500 / mo', salary_ar: '4,500 ريال شهرياً', deadline: '2026-08-28',
        description: 'Join the environmental planning team measuring the footprint of a new kind of city. You will collect field data, build simple models, and help validate net-zero claims. Suited to final-year students in engineering or sciences.',
        description_ar: 'الانضمام إلى فريق التخطيط البيئي الذي يقيس الأثر البيئي لمدينة من نوع جديد. تجمع بيانات ميدانية وتبني نماذج بسيطة وتساعد في التحقق من مستهدفات الحياد الكربوني. مناسب لطلاب الهندسة أو العلوم في السنة الأخيرة.',
        skills: ['Sustainability', 'Data Analysis', 'GIS'] },
      { title: 'Hospitality Operations Training', title_ar: 'تدريب — عمليات الضيافة', type: 'training',
        location: 'AlUla / Tabuk', location_ar: 'العلا / تبوك', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 6,000 / mo', salary_ar: '6,000 ريال شهرياً', deadline: '2026-09-18',
        description: 'A six-month rotation through luxury hospitality operations across flagship destinations. You will learn guest experience, food and beverage, and multilingual service to international standards. Strong communication skills are essential.',
        description_ar: 'تدريب لمدة ستة أشهر يتنقّل بين عمليات الضيافة الفاخرة في وجهات رئيسية. تتعلّم تجربة الضيف وخدمات الأطعمة والمشروبات والخدمة متعددة اللغات وفق معايير عالمية. مهارات التواصل القوية شرط أساسي.',
        skills: ['Guest Experience', 'Communication', 'English'] },
      { title: 'Data Scientist', title_ar: 'عالم بيانات', type: 'job',
        location: 'Tabuk', location_ar: 'تبوك', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 17,000 – 27,000 / mo', salary_ar: '17,000 – 27,000 ريال شهرياً', deadline: '2026-10-20',
        description: 'Model mobility, energy, and environmental data to inform how a new city operates. You will frame questions, build models, and turn results into decisions with planners. Solid Python and statistics foundations are expected.',
        description_ar: 'نمذجة بيانات التنقّل والطاقة والبيئة لترشيد طريقة تشغيل مدينة جديدة. تصوغ الأسئلة وتبني النماذج وتحوّل النتائج إلى قرارات مع المخطّطين. يُتوقَّع أساس متين في Python والإحصاء.',
        skills: ['Python', 'Machine Learning', 'Statistics'] },
    ],
  },
  {
    email: `elm${DOMAIN}`,
    name: 'Elm', name_ar: 'علم',
    profile: { industry: 'GovTech', industry_ar: 'التقنية الحكومية', size: '4,000+ employees', location: 'Riyadh', plan: 'premium', logo_url: '/logos/elm.svg' },
    opps: [
      { title: 'Backend Engineer', title_ar: 'مهندس خلفية', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 13,000 – 20,000 / mo', salary_ar: '13,000 – 20,000 ريال شهرياً', deadline: '2026-10-08',
        description: 'Build secure digital services that millions of residents rely on every day. The role focuses on resilient APIs, clean data models, and careful handling of sensitive data. We value engineers who write tests and think about edge cases.',
        description_ar: 'بناء خدمات رقمية آمنة يعتمد عليها ملايين المقيمين يومياً. يركّز الدور على واجهات برمجية موثوقة ونماذج بيانات نظيفة وتعامل دقيق مع البيانات الحساسة. نقدّر المهندسين الذين يكتبون الاختبارات ويفكّرون في الحالات الحديّة.',
        skills: ['Java', 'Spring Boot', 'PostgreSQL', 'APIs'] },
      { title: 'Product Analyst', title_ar: 'محلل منتجات', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 11,000 – 16,000 / mo', salary_ar: '11,000 – 16,000 ريال شهرياً', deadline: '2026-09-25',
        description: 'Sit between product, design, and engineering to turn usage data into the next set of decisions. You will define metrics, run lightweight experiments, and write the brief that aligns the team. Curiosity and clear writing go a long way here.',
        description_ar: 'تعمل بين المنتج والتصميم والهندسة لتحويل بيانات الاستخدام إلى قرارات تالية. تحدّد المؤشرات وتدير تجارب خفيفة وتكتب الموجز الذي يوحّد الفريق. الفضول والكتابة الواضحة يصنعان فرقاً كبيراً هنا.',
        skills: ['SQL', 'Analytics', 'Product Sense', 'A/B Testing'] },
      { title: 'GovTech Delivery Co-op', title_ar: 'تدريب تعاوني — تسليم الحلول الحكومية', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 4,000 / mo', salary_ar: '4,000 ريال شهرياً', deadline: '2026-08-30',
        description: 'Support delivery squads shipping public-sector digital services from discovery to launch. You will help with requirements, testing, and release coordination on real programmes. A good fit for final-year information-systems students.',
        description_ar: 'دعم فرق التسليم التي تطلق خدمات القطاع العام الرقمية من الاستكشاف حتى الإطلاق. تساعد في المتطلبات والاختبار وتنسيق الإصدارات على برامج حقيقية. مناسب لطلاب نظم المعلومات في السنة الأخيرة.',
        skills: ['Requirements', 'QA', 'Agile', 'Communication'] },
      { title: 'UX Designer', title_ar: 'مصمم تجربة مستخدم', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 12,000 – 18,000 / mo', salary_ar: '12,000 – 18,000 ريال شهرياً', deadline: '2026-10-14',
        description: 'Design clear, accessible journeys for public-sector services used at national scale. You will research with real users, prototype, and partner closely with engineering. A strong portfolio matters more than years of experience.',
        description_ar: 'تصميم رحلات واضحة وسهلة الوصول لخدمات القطاع العام المستخدمة على نطاق وطني. تجري بحثاً مع مستخدمين حقيقيين وتبني النماذج وتتعاون عن قرب مع الهندسة. ملف الأعمال القوي أهم من سنوات الخبرة.',
        skills: ['Figma', 'UX Research', 'Accessibility'] },
    ],
  },
  {
    email: `sabic${DOMAIN}`,
    name: 'SABIC', name_ar: 'سابك',
    profile: { industry: 'Chemicals', industry_ar: 'الكيماويات', size: '30,000+ employees', location: 'Jubail', plan: 'premium', logo_url: '/logos/sabic.svg' },
    opps: [
      { title: 'Chemical Engineering Co-op', title_ar: 'تدريب تعاوني — الهندسة الكيميائية', type: 'coop',
        location: 'Jubail', location_ar: 'الجبيل', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 5,000 / mo', salary_ar: '5,000 ريال شهرياً', deadline: '2026-08-18',
        description: 'Work inside a world-scale petrochemical complex on process and operational-excellence projects. You will learn plant safety culture and apply core engineering under senior supervision. Open to final-year chemical and mechanical engineering students.',
        description_ar: 'العمل داخل مجمّع بتروكيماويات بحجم عالمي على مشاريع العمليات والتميّز التشغيلي. تتعلّم ثقافة السلامة في المصنع وتطبّق أساسيات الهندسة بإشراف مهندسين أقدم. متاح لطلاب الهندسة الكيميائية والميكانيكية في السنة الأخيرة.',
        skills: ['Process Safety', 'Chemical Engineering', 'Plant Operations'] },
      { title: 'Supply-Chain Analyst', title_ar: 'محلل سلاسل إمداد', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 12,000 – 17,000 / mo', salary_ar: '12,000 – 17,000 ريال شهرياً', deadline: '2026-09-28',
        description: 'Optimize the flow of materials across a global supply network. The role mixes data analysis, forecasting, and coordination with plants and logistics partners. Comfort with spreadsheets and a structured mind are the key requirements.',
        description_ar: 'تحسين تدفّق المواد عبر شبكة إمداد عالمية. يجمع الدور بين تحليل البيانات والتنبؤ والتنسيق مع المصانع وشركاء اللوجستيات. إتقان جداول البيانات والتفكير المنظّم هما المتطلبان الأساسيان.',
        skills: ['Supply Chain', 'Excel', 'Forecasting', 'SAP'] },
      { title: 'Process Safety Certification', title_ar: 'شهادة — سلامة العمليات', type: 'certification',
        location: 'Jubail', location_ar: 'الجبيل', duration: '8 weeks', duration_ar: '8 أسابيع',
        salary: 'SAR 1,500', salary_ar: '1,500 ريال', deadline: '2026-07-20',
        description: 'A focused certification covering process-safety fundamentals for industrial settings. It combines workshops, case studies, and an assessed final project. Useful for engineering graduates aiming for operations roles.',
        description_ar: 'شهادة مركّزة تغطّي أساسيات سلامة العمليات في البيئات الصناعية. تجمع بين ورش العمل ودراسات الحالة ومشروع نهائي مُقيَّم. مفيدة لخريجي الهندسة الراغبين في وظائف التشغيل.',
        skills: ['Process Safety', 'HSE', 'Risk Assessment'] },
    ],
  },
  {
    email: `acwa${DOMAIN}`,
    name: 'ACWA Power', name_ar: 'أكوا باور',
    profile: { industry: 'Renewable Energy', industry_ar: 'الطاقة المتجددة', size: '4,000+ employees', location: 'Riyadh', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Renewable Energy Engineer', title_ar: 'مهندس طاقة متجددة', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 14,000 – 21,000 / mo', salary_ar: '14,000 – 21,000 ريال شهرياً', deadline: '2026-10-12',
        description: 'Help deliver some of the largest solar and wind plants in the region. The role spans technical design reviews, performance analysis, and coordination with construction teams. Engineers who care about clean energy and رؤية المملكة 2030 will feel at home.',
        description_ar: 'المساهمة في تنفيذ بعض أكبر محطات الطاقة الشمسية والرياح في المنطقة. يشمل الدور مراجعات التصميم الفني وتحليل الأداء والتنسيق مع فرق الإنشاء. سيجد المهندسون المهتمون بالطاقة النظيفة ورؤية المملكة 2030 بيئتهم هنا.',
        skills: ['Electrical Engineering', 'Energy Systems', 'AutoCAD'] },
      { title: 'Project Controls Trainee', title_ar: 'متدرب ضبط المشاريع', type: 'training',
        location: 'Riyadh', location_ar: 'الرياض', duration: '4 months', duration_ar: '4 أشهر',
        salary: 'SAR 5,500 / mo', salary_ar: '5,500 ريال شهرياً', deadline: '2026-08-05',
        description: 'Learn how mega-projects stay on time and on budget from the controls team. You will track schedules, costs, and risks across active power plants. A structured, detail-oriented mindset matters more than prior experience.',
        description_ar: 'تعلّم كيف تبقى المشاريع الضخمة ضمن الوقت والميزانية مع فريق ضبط المشاريع. تتابع الجداول الزمنية والتكاليف والمخاطر عبر محطات طاقة نشطة. العقلية المنظّمة الدقيقة أهم من الخبرة السابقة.',
        skills: ['Project Controls', 'Primavera', 'Excel', 'Reporting'] },
      { title: 'Sustainability Co-op', title_ar: 'تدريب تعاوني — الاستدامة', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '5 months', duration_ar: '5 أشهر',
        salary: 'SAR 4,000 / mo', salary_ar: '4,000 ريال شهرياً', deadline: '2026-08-25',
        description: 'Support the team measuring environmental and social impact across the portfolio. You will gather data, prepare reports, and learn international ESG frameworks. Open to final-year students in engineering, sciences, or business.',
        description_ar: 'دعم الفريق الذي يقيس الأثر البيئي والاجتماعي عبر المحفظة. تجمع البيانات وتعدّ التقارير وتتعلّم أطر الحوكمة البيئية والاجتماعية الدولية. متاح لطلاب الهندسة أو العلوم أو الأعمال في السنة الأخيرة.',
        skills: ['ESG', 'Data Analysis', 'Reporting'] },
    ],
  },
  {
    email: `saudia${DOMAIN}`,
    name: 'Saudia', name_ar: 'الخطوط السعودية',
    profile: { industry: 'Aviation', industry_ar: 'الطيران', size: '15,000+ employees', location: 'Jeddah', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Operations Analyst', title_ar: 'محلل عمليات', type: 'job',
        location: 'Jeddah', location_ar: 'جدة', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 11,000 – 16,000 / mo', salary_ar: '11,000 – 16,000 ريال شهرياً', deadline: '2026-10-02',
        description: 'Keep one of the busiest airline networks in the region running smoothly. You will analyze flight, crew, and ground data to spot delays before they cascade, with peak focus during موسم الحج. Strong analytical and communication skills are essential.',
        description_ar: 'الحفاظ على انسيابية واحدة من أكثر شبكات الطيران ازدحاماً في المنطقة. تحلّل بيانات الرحلات والطواقم والخدمة الأرضية لرصد التأخيرات قبل تفاقمها، مع تركيز أكبر في موسم الحج. المهارات التحليلية والتواصلية القوية أساسية.',
        skills: ['Operations Analysis', 'Excel', 'SQL'] },
      { title: 'Digital Experience Co-op', title_ar: 'تدريب تعاوني — التجربة الرقمية', type: 'coop',
        location: 'Jeddah', location_ar: 'جدة', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 4,000 / mo', salary_ar: '4,000 ريال شهرياً', deadline: '2026-08-29',
        description: 'Help improve the booking and travel app used by millions of guests. You will work with designers and analysts on real user journeys and small experiments. Suited to final-year students in computing, design, or business.',
        description_ar: 'المساهمة في تحسين تطبيق الحجز والسفر الذي يستخدمه ملايين الضيوف. تعمل مع المصممين والمحلّلين على رحلات مستخدم حقيقية وتجارب صغيرة. مناسب لطلاب الحوسبة أو التصميم أو الأعمال في السنة الأخيرة.',
        skills: ['UX', 'Analytics', 'Figma'] },
      { title: 'Revenue Management Trainee', title_ar: 'متدرب إدارة الإيرادات', type: 'training',
        location: 'Jeddah', location_ar: 'جدة', duration: '4 months', duration_ar: '4 أشهر',
        salary: 'SAR 5,000 / mo', salary_ar: '5,000 ريال شهرياً', deadline: '2026-08-08',
        description: 'Learn how an airline prices seats and forecasts demand across a large network. You will work with pricing analysts on real routes and seasonal patterns. A numerate, detail-oriented mindset is what matters here.',
        description_ar: 'تعلّم كيف تسعّر شركة الطيران المقاعد وتتنبّأ بالطلب عبر شبكة واسعة. تعمل مع محلّلي التسعير على مسارات حقيقية وأنماط موسمية. العقلية العددية الدقيقة هي الأهم هنا.',
        skills: ['Analytics', 'Excel', 'Forecasting'] },
    ],
  },
  {
    email: `alrajhi${DOMAIN}`,
    name: 'Alrajhi Bank', name_ar: 'مصرف الراجحي',
    profile: { industry: 'Banking', industry_ar: 'المصرفية', size: '20,000+ employees', location: 'Riyadh', plan: 'premium', logo_url: '/logos/alrajhi.svg' },
    opps: [
      { title: 'Fintech Developer', title_ar: 'مطوّر تقنية مالية', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 14,000 – 22,000 / mo', salary_ar: '14,000 – 22,000 ريال شهرياً', deadline: '2026-10-15',
        description: 'Build the digital banking features used across the largest Islamic bank in the world. The work demands careful engineering around payments, security, and reliability at scale. Strong backend fundamentals and attention to detail are essential.',
        description_ar: 'بناء ميزات الخدمات المصرفية الرقمية المستخدمة عبر أكبر مصرف إسلامي في العالم. يتطلّب العمل هندسة دقيقة حول المدفوعات والأمان والموثوقية على نطاق واسع. أساسيات الخلفية القوية والدقة في التفاصيل أمران أساسيان.',
        skills: ['Java', 'APIs', 'Security', 'Microservices'] },
      { title: 'Risk Analyst — Graduate Program', title_ar: 'محلل مخاطر — برنامج الخريجين', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 12,000 – 17,000 / mo', salary_ar: '12,000 – 17,000 ريال شهرياً', deadline: '2026-09-22',
        description: 'A structured graduate path into credit and operational risk. You will rotate across teams, learn modeling and reporting, and earn a recognised qualification. Open to graduates in finance, economics, statistics, or related fields.',
        description_ar: 'مسار خريجين منظّم في مخاطر الائتمان والمخاطر التشغيلية. تتنقّل بين الفرق وتتعلّم النمذجة وإعداد التقارير وتحصل على مؤهل معترف به. متاح لخريجي التمويل أو الاقتصاد أو الإحصاء أو التخصصات القريبة.',
        skills: ['Risk', 'Statistics', 'Excel', 'Financial Modeling'] },
      { title: 'Finance Co-op', title_ar: 'تدريب تعاوني — التمويل', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '6 months', duration_ar: '6 أشهر',
        salary: 'SAR 4,500 / mo', salary_ar: '4,500 ريال شهرياً', deadline: '2026-08-26',
        description: 'Rotate through corporate, retail, and treasury teams to build a strong finance foundation. You will support real reporting cycles and analysis under mentorship. A good fit for final-year finance and accounting students.',
        description_ar: 'التنقّل بين فرق الشركات والأفراد والخزينة لبناء أساس مالي متين. تدعم دورات تقارير وتحليل حقيقية بإشراف وتوجيه. مناسب لطلاب التمويل والمحاسبة في السنة الأخيرة.',
        skills: ['Financial Analysis', 'Excel', 'Accounting'] },
    ],
  },
  {
    email: `tamara${DOMAIN}`,
    name: 'Tamara', name_ar: 'تمارا',
    profile: { industry: 'Fintech', industry_ar: 'التقنية المالية', size: '500+ employees', location: 'Riyadh', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Mobile Engineer', title_ar: 'مهندس تطبيقات جوال', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 13,000 – 20,000 / mo', salary_ar: '13,000 – 20,000 ريال شهرياً', deadline: '2026-10-06',
        description: 'Craft a fast, delightful shopping-and-payments app for a fast-growing fintech. You will own features across the mobile stack and ship frequently to real users. Care for detail and performance sets strong candidates apart.',
        description_ar: 'صناعة تطبيق تسوّق ومدفوعات سريع وممتع لشركة تقنية مالية سريعة النمو. تمتلك ميزات عبر منظومة الجوال وتطلق بانتظام لمستخدمين حقيقيين. الاهتمام بالتفاصيل والأداء يميّز المرشحين الأقوياء.',
        skills: ['Swift', 'Kotlin', 'React Native', 'Mobile'] },
      { title: 'Growth Analyst', title_ar: 'محلل نمو', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 11,000 – 15,000 / mo', salary_ar: '11,000 – 15,000 ريال شهرياً', deadline: '2026-09-20',
        description: 'Find and scale the levers that grow an ambitious consumer product. You will run experiments, analyze funnels, and turn results into clear recommendations. Strong SQL and a bias for action are what we look for.',
        description_ar: 'اكتشاف وتوسيع العوامل التي تنمّي منتجاً استهلاكياً طموحاً. تدير التجارب وتحلّل مسارات التحويل وتحوّل النتائج إلى توصيات واضحة. نبحث عن إتقان SQL وميل نحو المبادرة.',
        skills: ['SQL', 'Growth', 'Analytics', 'Experimentation'] },
      { title: 'Software Engineering Co-op', title_ar: 'تدريب تعاوني — هندسة البرمجيات', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '5 months', duration_ar: '5 أشهر',
        salary: 'SAR 4,000 / mo', salary_ar: '4,000 ريال شهرياً', deadline: '2026-08-31',
        description: 'Join a product team building payment features used across the region. You will ship small changes to production with mentorship and real review. A good fit for final-year computing students who want to learn fast.',
        description_ar: 'الانضمام إلى فريق منتج يبني ميزات دفع تُستخدم عبر المنطقة. تطلق تغييرات صغيرة إلى الإنتاج بتوجيه ومراجعة حقيقية. مناسب لطلاب الحوسبة في السنة الأخيرة الراغبين في التعلّم السريع.',
        skills: ['JavaScript', 'APIs', 'Git'] },
    ],
  },
  {
    email: `salla${DOMAIN}`,
    name: 'Salla', name_ar: 'سلة',
    profile: { industry: 'E-commerce', industry_ar: 'التجارة الإلكترونية', size: '500+ employees', location: 'Jeddah', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Full-Stack Engineer', title_ar: 'مهندس متكامل', type: 'job',
        location: 'Jeddah', location_ar: 'جدة', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 12,000 – 19,000 / mo', salary_ar: '12,000 – 19,000 ريال شهرياً', deadline: '2026-10-04',
        description: 'Help thousands of merchants run their stores on a leading commerce platform. You will work across the stack on features that directly affect merchant revenue. Pragmatic engineers who ship and iterate thrive here.',
        description_ar: 'مساعدة آلاف التجّار على إدارة متاجرهم عبر منصة تجارة رائدة. تعمل عبر كامل المنظومة على ميزات تؤثّر مباشرة في دخل التجّار. يزدهر هنا المهندسون العمليون الذين يطلقون ويحسّنون باستمرار.',
        skills: ['PHP', 'Laravel', 'Vue', 'MySQL'] },
      { title: 'Merchant Success Co-op', title_ar: 'تدريب تعاوني — نجاح التجّار', type: 'coop',
        location: 'Jeddah', location_ar: 'جدة', duration: '5 months', duration_ar: '5 أشهر',
        salary: 'SAR 3,500 / mo', salary_ar: '3,500 ريال شهرياً', deadline: '2026-08-24',
        description: 'Work with the team that helps merchants grow on the platform. You will support onboarding, answer real questions, and surface product feedback. A good fit for business and marketing students in their final year.',
        description_ar: 'العمل مع الفريق الذي يساعد التجّار على النمو عبر المنصة. تدعم عملية الانضمام وتجيب عن أسئلة حقيقية وتنقل ملاحظات المنتج. مناسب لطلاب الأعمال والتسويق في السنة الأخيرة.',
        skills: ['Customer Success', 'Communication', 'CRM'] },
      { title: 'Digital Marketing Specialist', title_ar: 'أخصائي تسويق رقمي', type: 'job',
        location: 'Jeddah', location_ar: 'جدة', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 10,000 – 15,000 / mo', salary_ar: '10,000 – 15,000 ريال شهرياً', deadline: '2026-09-29',
        description: 'Run growth and content campaigns that bring merchants onto the platform. The role blends performance marketing, analytics, and clear messaging. Comfort with data and a creative eye both matter.',
        description_ar: 'تشغيل حملات النمو والمحتوى التي تجذب التجّار إلى المنصة. يجمع الدور بين التسويق الأدائي والتحليلات والرسائل الواضحة. إتقان البيانات والحس الإبداعي كلاهما مهم.',
        skills: ['Performance Marketing', 'Analytics', 'Content'] },
    ],
  },
  {
    email: `jahez${DOMAIN}`,
    name: 'Jahez', name_ar: 'جاهز',
    profile: { industry: 'Delivery', industry_ar: 'التوصيل', size: '2,000+ employees', location: 'Riyadh', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Data Analyst', title_ar: 'محلل بيانات', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 11,000 – 16,000 / mo', salary_ar: '11,000 – 16,000 ريال شهرياً', deadline: '2026-10-09',
        description: 'Make sense of millions of orders to improve delivery speed and reliability. You will build dashboards, dig into operational questions, and brief the teams that act on them. Strong SQL and clear communication are the core skills.',
        description_ar: 'فهم ملايين الطلبات لتحسين سرعة التوصيل وموثوقيته. تبني لوحات المعلومات وتتعمّق في الأسئلة التشغيلية وتُطلع الفرق التي تتصرّف بناءً عليها. إتقان SQL والتواصل الواضح هما المهارتان الأساسيتان.',
        skills: ['SQL', 'Python', 'Dashboards', 'Statistics'] },
      { title: 'Logistics Operations Training', title_ar: 'تدريب — العمليات اللوجستية', type: 'training',
        location: 'Riyadh', location_ar: 'الرياض', duration: '3 months', duration_ar: '3 أشهر',
        salary: 'SAR 4,000 / mo', salary_ar: '4,000 ريال شهرياً', deadline: '2026-07-28',
        description: 'Learn how a large delivery network is planned and run day to day. You will rotate across dispatch, fleet, and zone operations with hands-on tasks. A practical, structured program for recent graduates.',
        description_ar: 'تعلّم كيف تُخطَّط وتُدار شبكة توصيل كبيرة يومياً. تتنقّل بين الإرسال والأسطول وعمليات المناطق بمهام عملية. برنامج تطبيقي منظّم للخريجين الجدد.',
        skills: ['Operations', 'Logistics', 'Excel'] },
      { title: 'Backend Engineer', title_ar: 'مهندس خلفية', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 13,000 – 19,000 / mo', salary_ar: '13,000 – 19,000 ريال شهرياً', deadline: '2026-10-07',
        description: 'Build the services that keep millions of orders moving reliably each day. The work centres on resilient APIs, queues, and clean data models under real load. Engineers who care about reliability will enjoy this.',
        description_ar: 'بناء الخدمات التي تُبقي ملايين الطلبات تتحرّك بموثوقية كل يوم. يتمحور العمل حول واجهات برمجية مرنة وطوابير ونماذج بيانات نظيفة تحت حمل حقيقي. سيستمتع به المهندسون الذين يهتمّون بالموثوقية.',
        skills: ['Node.js', 'PostgreSQL', 'Redis', 'APIs'] },
    ],
  },
  {
    email: `lean${DOMAIN}`,
    name: 'Lean Technologies', name_ar: 'لين',
    profile: { industry: 'Fintech Infrastructure', industry_ar: 'بنية التقنية المالية', size: '300+ employees', location: 'Riyadh', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Backend Engineer', title_ar: 'مهندس خلفية', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 14,000 – 22,000 / mo', salary_ar: '14,000 – 22,000 ريال شهرياً', deadline: '2026-10-11',
        description: 'Build the financial-data APIs that power the next wave of Saudi fintech. The work is demanding: secure integrations, reliability, and clean abstractions over messy banking systems. Engineers who enjoy hard backend problems will thrive.',
        description_ar: 'بناء واجهات بيانات مالية تُشغّل الموجة القادمة من التقنية المالية السعودية. العمل متطلّب: تكاملات آمنة وموثوقية وتجريدات نظيفة فوق أنظمة مصرفية معقّدة. سيزدهر المهندسون الذين يستمتعون بمسائل الخلفية الصعبة.',
        skills: ['Node.js', 'TypeScript', 'APIs', 'Security'] },
      { title: 'Solutions Engineer', title_ar: 'مهندس حلول', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 13,000 – 19,000 / mo', salary_ar: '13,000 – 19,000 ريال شهرياً', deadline: '2026-09-27',
        description: 'Sit between customers and engineering to make integrations succeed. You will scope technical needs, build proofs of concept, and guide partners to launch. Communication is as important as code here.',
        description_ar: 'تعمل بين العملاء والهندسة لإنجاح التكاملات. تحدّد الاحتياجات التقنية وتبني نماذج إثبات وترشد الشركاء حتى الإطلاق. التواصل لا يقلّ أهمية عن البرمجة هنا.',
        skills: ['APIs', 'JavaScript', 'Communication', 'Problem Solving'] },
    ],
  },
  {
    email: `thiqah${DOMAIN}`,
    name: 'THIQAH', name_ar: 'ثقة',
    profile: { industry: 'Business Services', industry_ar: 'خدمات الأعمال', size: '1,000+ employees', location: 'Riyadh', plan: 'basic', logo_url: null },
    opps: [
      { title: 'Business Analyst', title_ar: 'محلل أعمال', type: 'job',
        location: 'Riyadh', location_ar: 'الرياض', duration: 'Full-time', duration_ar: 'دوام كامل',
        salary: 'SAR 11,000 – 16,000 / mo', salary_ar: '11,000 – 16,000 ريال شهرياً', deadline: '2026-10-03',
        description: 'Bridge business needs and delivery teams on digital programmes for the private sector. You will gather requirements, map processes, and keep everyone aligned to outcomes. Clear thinking and strong documentation skills are essential.',
        description_ar: 'الربط بين احتياجات الأعمال وفرق التسليم في برامج رقمية للقطاع الخاص. تجمع المتطلبات وترسم العمليات وتُبقي الجميع متوائمين حول النتائج. التفكير الواضح ومهارات التوثيق القوية أساسية.',
        skills: ['Business Analysis', 'Requirements', 'Process Mapping'] },
      { title: 'QA Engineering Co-op', title_ar: 'تدريب تعاوني — هندسة الجودة', type: 'coop',
        location: 'Riyadh', location_ar: 'الرياض', duration: '5 months', duration_ar: '5 أشهر',
        salary: 'SAR 3,500 / mo', salary_ar: '3,500 ريال شهرياً', deadline: '2026-08-27',
        description: 'Join the quality team that keeps releases safe before they reach customers. You will write test cases, run manual and automated checks, and report issues clearly. A solid start for final-year computing students.',
        description_ar: 'الانضمام إلى فريق الجودة الذي يحافظ على سلامة الإصدارات قبل وصولها للعملاء. تكتب حالات الاختبار وتُجري فحوصاً يدوية وآلية وتُبلّغ عن المشكلات بوضوح. انطلاقة جيدة لطلاب الحوسبة في السنة الأخيرة.',
        skills: ['QA', 'Test Automation', 'Selenium'] },
      { title: 'Business Analytics Certification', title_ar: 'شهادة — تحليلات الأعمال', type: 'certification',
        location: 'Riyadh', location_ar: 'الرياض', duration: '8 weeks', duration_ar: '8 أسابيع',
        salary: 'SAR 1,200', salary_ar: '1,200 ريال', deadline: '2026-07-18',
        description: 'A practical certification turning business questions into dashboards and clear recommendations. It combines spreadsheet and BI work with a final case study. A solid first credential for analytics-bound graduates.',
        description_ar: 'شهادة عملية تحوّل أسئلة الأعمال إلى لوحات معلومات وتوصيات واضحة. تجمع بين العمل على جداول البيانات وذكاء الأعمال مع دراسة حالة ختامية. مؤهّل أول متين للخريجين المتجهين إلى التحليلات.',
        skills: ['Excel', 'Power BI', 'Business Analysis'] },
    ],
  },
]

// ============================================================
// Training provider — ZAKA AI (زكا). The only provider.
// ============================================================
const PROVIDERS = [
  {
    email: `zaka${DOMAIN}`,
    name: 'ZAKA AI', name_ar: 'زكا',
    profile: { rating: 4.8, logo_url: '/logos/zaka.png' },
    courses: [
      { title: 'Applied Artificial Intelligence', title_ar: 'احتراف الذكاء الاصطناعي التطبيقي',
        description: 'A hands-on programme that takes you from machine-learning foundations to deploying applied AI projects. Sessions blend live instruction with mentored practice on real datasets.',
        description_ar: 'برنامج عملي ينقلك من أساسيات تعلّم الآلة إلى نشر مشاريع ذكاء اصطناعي تطبيقية. تمزج الجلسات بين التدريب المباشر والممارسة الموجَّهة على بيانات حقيقية.',
        price: 0, skills: ['Python', 'Machine Learning', 'Deep Learning'] },
      { title: 'Data Science Foundations', title_ar: 'أساسيات علم البيانات',
        description: 'Build a solid base in statistics, Python, and SQL, then apply it to a guided analytics project. Designed for graduates entering data careers.',
        description_ar: 'بناء أساس متين في الإحصاء وPython وSQL ثم تطبيقه على مشروع تحليلي موجَّه. مصمَّم للخريجين الداخلين إلى مجالات البيانات.',
        price: 0, skills: ['Statistics', 'Python', 'SQL'] },
      { title: 'Computer Vision', title_ar: 'رؤية الحاسب',
        description: 'An advanced track covering image processing, modern vision models, and practical deployment. Suited to learners with a Python and machine-learning background.',
        description_ar: 'مسار متقدّم يغطّي معالجة الصور ونماذج الرؤية الحديثة والنشر العملي. مناسب للمتعلّمين ذوي خلفية في Python وتعلّم الآلة.',
        price: 0, skills: ['Computer Vision', 'PyTorch', 'OpenCV'] },
      { title: 'Data Engineering Bootcamp', title_ar: 'معسكر هندسة البيانات',
        description: 'An intensive bootcamp on building reliable data pipelines, warehouses, and orchestration. Graduates leave with a portfolio project and production-ready habits.',
        description_ar: 'معسكر مكثّف لبناء مسارات بيانات موثوقة ومستودعات وأنظمة تنسيق. يخرج المشاركون بمشروع في ملف الأعمال وعادات جاهزة للإنتاج.',
        price: 0, skills: ['SQL', 'Spark', 'Airflow', 'Data Modeling'] },
    ],
  },
]

// ============================================================
// University — IMSIU (the only one)
// ============================================================
const UNIVERSITIES = [
  {
    email: `imsiu${DOMAIN}`,
    name: 'Imam Mohammad Ibn Saud Islamic University',
    name_ar: 'جامعة الإمام محمد بن سعود الإسلامية',
    profile: { location: 'Riyadh', total_students: 60000, logo_url: '/brand/imsiu_logo_horizontal.jpg' },
  },
]

// ============================================================
// IMSIU colleges & majors (from CONTENT_STYLE_GUIDE.md)
// ============================================================
const MAJORS = {
  cs:   { college: 'College of Computer & Information Sciences', college_ar: 'كلية علوم الحاسب والمعلومات', major: 'Computer Science', major_ar: 'علوم الحاسب' },
  is:   { college: 'College of Computer & Information Sciences', college_ar: 'كلية علوم الحاسب والمعلومات', major: 'Information Systems', major_ar: 'نظم المعلومات' },
  ce:   { college: 'College of Computer & Information Sciences', college_ar: 'كلية علوم الحاسب والمعلومات', major: 'Computer Engineering', major_ar: 'هندسة الحاسب' },
  ee:   { college: 'College of Engineering', college_ar: 'كلية الهندسة', major: 'Electrical Engineering', major_ar: 'الهندسة الكهربائية' },
  me:   { college: 'College of Engineering', college_ar: 'كلية الهندسة', major: 'Mechanical Engineering', major_ar: 'الهندسة الميكانيكية' },
  cv:   { college: 'College of Engineering', college_ar: 'كلية الهندسة', major: 'Civil Engineering', major_ar: 'الهندسة المدنية' },
  ba:   { college: 'College of Economics & Administrative Sciences', college_ar: 'كلية الاقتصاد والعلوم الإدارية', major: 'Business Administration', major_ar: 'إدارة الأعمال' },
  fin:  { college: 'College of Economics & Administrative Sciences', college_ar: 'كلية الاقتصاد والعلوم الإدارية', major: 'Finance', major_ar: 'التمويل' },
  econ: { college: 'College of Economics & Administrative Sciences', college_ar: 'كلية الاقتصاد والعلوم الإدارية', major: 'Economics', major_ar: 'الاقتصاد' },
  acct: { college: 'College of Economics & Administrative Sciences', college_ar: 'كلية الاقتصاد والعلوم الإدارية', major: 'Accounting', major_ar: 'المحاسبة' },
  mkt:  { college: 'College of Economics & Administrative Sciences', college_ar: 'كلية الاقتصاد والعلوم الإدارية', major: 'Marketing', major_ar: 'التسويق' },
  media:{ college: 'College of Media & Communication', college_ar: 'كلية الإعلام والاتصال', major: 'Digital Media', major_ar: 'الإعلام الرقمي' },
  pr:   { college: 'College of Media & Communication', college_ar: 'كلية الإعلام والاتصال', major: 'Public Relations', major_ar: 'العلاقات العامة' },
  math: { college: 'College of Science', college_ar: 'كلية العلوم', major: 'Mathematics', major_ar: 'الرياضيات' },
  phys: { college: 'College of Science', college_ar: 'كلية العلوم', major: 'Physics', major_ar: 'الفيزياء' },
  eng:  { college: 'College of Languages & Translation', college_ar: 'كلية اللغات والترجمة', major: 'English & Translation', major_ar: 'اللغة الإنجليزية والترجمة' },
  law:  { college: 'College of Sharia', college_ar: 'كلية الشريعة', major: 'Law', major_ar: 'الأنظمة (القانون)' },
}

// Career-path slug per major key → used for canned analysis recommendation.
const PATH_FOR_MAJOR = {
  cs: 'software_engineering', is: 'data_science_ai', ce: 'software_engineering',
  ee: 'renewable_energy', me: 'mechanical_engineering', cv: 'architecture_design',
  ba: 'business_entrepreneurship', fin: 'finance_banking', econ: 'finance_banking',
  acct: 'accounting_auditing', mkt: 'marketing_brand', media: 'film_media_gaming',
  pr: 'counseling_hr', math: 'data_science_ai', phys: 'data_science_ai',
  eng: 'counseling_hr', law: 'counseling_hr',
}

const PATH_LABEL_AR = {
  software_engineering: 'هندسة البرمجيات',
  data_science_ai: 'علم البيانات والذكاء الاصطناعي',
  renewable_energy: 'الطاقة المتجددة والاستدامة',
  mechanical_engineering: 'الهندسة الميكانيكية',
  architecture_design: 'العمارة والتصميم العمراني',
  business_entrepreneurship: 'الأعمال وريادة الأعمال',
  finance_banking: 'التمويل والبنوك',
  accounting_auditing: 'المحاسبة والتدقيق',
  marketing_brand: 'التسويق واستراتيجية العلامات',
  film_media_gaming: 'الإعلام والسينما والألعاب',
  counseling_hr: 'الإرشاد والموارد البشرية',
}

// ============================================================
// Students — golden Ahmed + 27 others, all IMSIU.
// ============================================================
const GOLDEN_STUDENT_EMAIL = `ahmed${DOMAIN}`

const STUDENTS = [
  { email: GOLDEN_STUDENT_EMAIL, name: 'Ahmed Al-Omari', name_ar: 'أحمد العمري', m: 'cs',
    gpa: 3.78, grad: 2026, completion: 92, cv: 86, assessed: true, golden: true,
    skills: ['Python', 'SQL', 'Machine Learning', 'Pandas', 'TypeScript', 'React', 'Git', 'Data Visualization'] },

  { email: `sara${DOMAIN}`, name: 'Sara Al-Otaibi', name_ar: 'سارة العتيبي', m: 'is',
    gpa: 3.71, grad: 2026, completion: 84, cv: 76, assessed: true,
    skills: ['SQL', 'Power BI', 'Python', 'Excel', 'Statistics'] },
  { email: `abdullah${DOMAIN}`, name: 'Abdullah Al-Rashid', name_ar: 'عبدالله الراشد', m: 'cs',
    gpa: 3.85, grad: 2026, completion: 88, cv: 80, assessed: true,
    skills: ['React', 'TypeScript', 'Node.js', 'SQL', 'Git'] },
  { email: `noura${DOMAIN}`, name: 'Noura Al-Qahtani', name_ar: 'نورة القحطاني', m: 'mkt',
    gpa: 3.52, grad: 2026, completion: 74, cv: 66, assessed: true,
    skills: ['SEO', 'Analytics', 'Content Strategy', 'Social Media'] },
  { email: `faisal${DOMAIN}`, name: 'Faisal Al-Harbi', name_ar: 'فيصل الحربي', m: 'ce',
    gpa: 3.64, grad: 2027, completion: 70, cv: 64, assessed: true,
    skills: ['C++', 'Embedded Systems', 'Python', 'Linux'] },
  { email: `lama${DOMAIN}`, name: 'Lama Al-Shehri', name_ar: 'لمى الشهري', m: 'media',
    gpa: 3.40, grad: 2026, completion: 68, cv: 60, assessed: true,
    skills: ['Video Editing', 'Storytelling', 'Social Media', 'Premiere'] },
  { email: `khalid${DOMAIN}`, name: 'Khalid Al-Dosari', name_ar: 'خالد الدوسري', m: 'cs',
    gpa: 3.90, grad: 2026, completion: 90, cv: 84, assessed: true,
    skills: ['Java', 'Spring Boot', 'Docker', 'AWS', 'System Design'] },
  { email: `reema${DOMAIN}`, name: 'Reema Al-Zahrani', name_ar: 'ريما الزهراني', m: 'ba',
    gpa: 3.75, grad: 2026, completion: 80, cv: 72, assessed: true,
    skills: ['Excel', 'Strategy', 'Project Management', 'Communication'] },
  { email: `mohammed${DOMAIN}`, name: 'Mohammed Al-Ghamdi', name_ar: 'محمد الغامدي', m: 'me',
    gpa: 3.66, grad: 2026, completion: 72, cv: 67, assessed: true,
    skills: ['SolidWorks', 'MATLAB', 'Thermodynamics', 'AutoCAD'] },
  { email: `hind${DOMAIN}`, name: 'Hind Al-Mutairi', name_ar: 'هند المطيري', m: 'fin',
    gpa: 3.81, grad: 2026, completion: 82, cv: 74, assessed: true,
    skills: ['Financial Modeling', 'Excel', 'Valuation', 'Accounting'] },
  { email: `sultan${DOMAIN}`, name: 'Sultan Al-Subaie', name_ar: 'سلطان السبيعي', m: 'is',
    gpa: 3.58, grad: 2027, completion: 66, cv: 62, assessed: true,
    skills: ['SQL', 'Excel', 'Python', 'Tableau'] },
  { email: `ghada${DOMAIN}`, name: 'Ghada Al-Anazi', name_ar: 'غادة العنزي', m: 'acct',
    gpa: 3.69, grad: 2026, completion: 78, cv: 70, assessed: true,
    skills: ['Accounting', 'Excel', 'IFRS', 'Auditing'] },
  { email: `badr${DOMAIN}`, name: 'Badr Al-Shammari', name_ar: 'بدر الشمري', m: 'ee',
    gpa: 3.55, grad: 2026, completion: 71, cv: 65, assessed: true,
    skills: ['Power Systems', 'MATLAB', 'AutoCAD', 'Control Systems'] },
  { email: `joud${DOMAIN}`, name: 'Joud Al-Juhani', name_ar: 'جود الجهني', m: 'cs',
    gpa: 3.88, grad: 2027, completion: 86, cv: 79, assessed: true,
    skills: ['Python', 'Machine Learning', 'SQL', 'Pandas'] },
  { email: `turki${DOMAIN}`, name: 'Turki Al-Malki', name_ar: 'تركي المالكي', m: 'econ',
    gpa: 3.47, grad: 2026, completion: 64, cv: 61, assessed: true,
    skills: ['Economics', 'Excel', 'Statistics', 'Data Analysis'] },
  { email: `rahaf${DOMAIN}`, name: 'Rahaf Bawazir', name_ar: 'رهف باوزير', m: 'pr',
    gpa: 3.62, grad: 2026, completion: 73, cv: 66, assessed: true,
    skills: ['Communication', 'Media Relations', 'Writing', 'Event Planning'] },
  { email: `nasser${DOMAIN}`, name: 'Nasser Al-Qarni', name_ar: 'ناصر القرني', m: 'cv',
    gpa: 3.50, grad: 2027, completion: 62, cv: 58, assessed: false,
    skills: ['AutoCAD', 'Structural Analysis', 'Project Management'] },
  { email: `shahad${DOMAIN}`, name: 'Shahad Al-Harthi', name_ar: 'شهد الحارثي', m: 'math',
    gpa: 3.92, grad: 2026, completion: 84, cv: 78, assessed: true,
    skills: ['Mathematics', 'Python', 'Statistics', 'R'] },
  { email: `yazid${DOMAIN}`, name: 'Yazid Al-Tamimi', name_ar: 'يزيد التميمي', m: 'cs',
    gpa: 3.60, grad: 2027, completion: 69, cv: 63, assessed: false,
    skills: ['JavaScript', 'React', 'CSS', 'Git'] },
  { email: `dana${DOMAIN}`, name: 'Dana Al-Faisal', name_ar: 'دانة الفيصل', m: 'ba',
    gpa: 3.77, grad: 2026, completion: 79, cv: 71, assessed: true,
    skills: ['Strategy', 'Excel', 'Marketing', 'Communication'] },
  { email: `omar${DOMAIN}`, name: 'Omar Bakhsh', name_ar: 'عمر بخش', m: 'is',
    gpa: 3.54, grad: 2026, completion: 70, cv: 64, assessed: true,
    skills: ['SQL', 'Power BI', 'Excel', 'Data Analysis'] },
  { email: `areej${DOMAIN}`, name: 'Areej Al-Sulami', name_ar: 'أريج السلمي', m: 'eng',
    gpa: 3.66, grad: 2026, completion: 72, cv: 65, assessed: false,
    skills: ['Translation', 'Writing', 'Editing', 'English'] },
  { email: `mishal${DOMAIN}`, name: 'Mishal Al-Oufi', name_ar: 'مشعل العوفي', m: 'me',
    gpa: 3.49, grad: 2027, completion: 63, cv: 60, assessed: false,
    skills: ['SolidWorks', 'MATLAB', 'Manufacturing'] },
  { email: `leen${DOMAIN}`, name: 'Leen Al-Saqri', name_ar: 'لين الصقري', m: 'media',
    gpa: 3.71, grad: 2026, completion: 76, cv: 68, assessed: true,
    skills: ['Content Creation', 'Design', 'Social Media', 'Analytics'] },
  { email: `saud${DOMAIN}`, name: 'Saud Al-Ruwaili', name_ar: 'سعود الرويلي', m: 'fin',
    gpa: 3.58, grad: 2026, completion: 70, cv: 64, assessed: true,
    skills: ['Excel', 'Financial Analysis', 'Risk', 'Accounting'] },
  { email: `munira${DOMAIN}`, name: 'Munira Al-Khalidi', name_ar: 'منيرة الخالدي', m: 'cs',
    gpa: 3.83, grad: 2026, completion: 85, cv: 77, assessed: true,
    skills: ['Python', 'Django', 'SQL', 'React', 'Git'] },
  { email: `ziyad${DOMAIN}`, name: 'Ziyad Kurdi', name_ar: 'زياد كردي', m: 'ce',
    gpa: 3.52, grad: 2027, completion: 67, cv: 62, assessed: false,
    skills: ['C', 'Embedded Systems', 'Verilog'] },
  { email: `waad${DOMAIN}`, name: 'Waad Al-Ghanim', name_ar: 'وعد الغانم', m: 'acct',
    gpa: 3.74, grad: 2026, completion: 78, cv: 70, assessed: true,
    skills: ['Accounting', 'Excel', 'Auditing', 'IFRS'] },
]

// ============================================================
// Canned career analysis (Arabic — demo language). Mirrors the shape written
// by the career-analysis edge function / src/lib/career-analysis.ts.
// ============================================================
const STRENGTHS_GENERIC_AR = [
  'تحليلي يبحث في جوهر المسألة قبل القفز إلى الحل',
  'منظّم في تنفيذ المهام ويلتزم بالمواعيد',
  'متعلّم سريع ويبني مهاراته باطّراد',
  'متواصل واضح يعرض أفكاره بثقة',
  'دقيق في التفاصيل ويلتقط ما يفوت غيره',
]
const GROWTH_GENERIC_AR = [
  'تحويل الفهم النظري إلى مشاريع ملموسة في ملف الأعمال',
  'توسيع شبكة العلاقات المهنية داخل مجال التخصص',
  'تعميق مهارة تقنية محورية عبر دورة قصيرة مركّزة',
]

function buildAnalysisAr(slug, name) {
  const label = PATH_LABEL_AR[slug] ?? 'مسارك المهني'
  const first = (name || '').split(' ')[0] || ''
  return {
    top_match: slug,
    top_match_label: label,
    match_score: 0, // set by caller
    secondary_match: null,
    secondary_match_label: null,
    holland_code: 'IRE',
    why: `${first ? first + '، ' : ''}إجاباتك تُظهر ميلاً واضحاً نحو التحليل وحل المشكلات، وهذا المزيج يلتقي بدقة مع ${label}.`,
    strengths: STRENGTHS_GENERIC_AR.slice(0, 3),
    growth_areas: GROWTH_GENERIC_AR.slice(0, 3),
    first_steps: [
      `ابدأ بإتقان مهارة أساسية في ${label} عبر دورة قصيرة — زكا، ومسك، ومنصة سدايا من أفضل نقاط الانطلاق`,
      'تابع الإعلانات الوظيفية في الجهات الرائدة لتفهم متطلبات السوق فعلياً',
      'ابنِ مشروعاً واحداً ملموساً يُظهر قدرتك ويصلح كنواة لملف أعمالك',
    ],
    source: 'local',
  }
}

// Rich, hand-written analysis for the golden student (Ahmed → data_science_ai).
function goldenAnalysisAr() {
  return {
    top_match: 'data_science_ai',
    top_match_label: 'علم البيانات والذكاء الاصطناعي',
    match_score: 87,
    secondary_match: 'software_engineering',
    secondary_match_label: 'هندسة البرمجيات',
    holland_code: 'IRE',
    why: 'أحمد، إجاباتك تُظهر طابعاً تحليلياً قوياً مع ميل عملي للبناء، وهذا المزيج يلتقي بدقة مع علم البيانات والذكاء الاصطناعي — حيث يلتقي الفضول البحثي مع تنفيذ حلول ملموسة على نطاق واسع.',
    strengths: [
      'تفكير تحليلي يبدأ من السؤال الصحيح قبل اختيار الأداة',
      'قدرة على تحويل البيانات إلى قرار واضح يفهمه غير المتخصص',
      'انضباط هندسي في كتابة كود نظيف وقابل للتكرار',
    ],
    growth_areas: [
      'تعميق أساسيات الإحصاء الاستدلالي خلف النماذج',
      'التدرّب على نشر النماذج ومراقبتها في بيئة إنتاج (MLOps)',
      'عرض النتائج أمام جمهور غير تقني بسرد مقنع',
    ],
    first_steps: [
      'أكمل مساراً مركّزاً في تعلّم الآلة التطبيقي — برنامج زكا «احتراف الذكاء الاصطناعي التطبيقي» نقطة انطلاق ممتازة',
      'ابنِ مشروعاً واحداً متكاملاً على بيانات سعودية حقيقية من الفكرة حتى النشر',
      'تابع فرص التدريب التعاوني في سدايا وأرامكو لفهم متطلبات السوق عن قرب',
      'شارك نتائج مشروعك في ملف أعمال عام ليكون نواة لسيرتك المهنية',
    ],
    source: 'ai',
  }
}

// Synthetic 24-answer array (option indices 0–3), deterministic per seed offset.
function syntheticAnswers(offset) {
  const out = []
  for (let i = 0; i < 24; i++) out.push((i + offset) % 4)
  return out
}

// ============================================================
// Applications — generated. Statuses span the full enum; ~14 target SDAIA.
// ============================================================
const STATUSES = ['submitted', 'reviewed', 'shortlisted', 'accepted', 'rejected', 'cv_update_required']

// ============================================================
// Helpers
// ============================================================
const userIdByEmail = new Map()
const careerPathIdBySlug = new Map()

async function loadExistingUsers() {
  userIdByEmail.clear() // drop any stale entries (e.g. users just deleted in --reset)
  let page = 1
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id)
    }
    if (data.users.length < 1000) break
    page++
  }
}

async function loadCareerPaths() {
  const { data } = await sb.from('career_paths').select('id, slug')
  for (const row of data ?? []) careerPathIdBySlug.set(row.slug, row.id)
}

async function ensureUser(email, role, name, name_ar) {
  const lower = email.toLowerCase()
  if (userIdByEmail.has(lower)) return userIdByEmail.get(lower)

  const { data, error } = await sb.auth.admin.createUser({
    email: lower,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, name, name_ar },
  })
  if (error) {
    if (error.code === 'email_exists' || /already/i.test(error.message)) {
      await loadExistingUsers()
      return userIdByEmail.get(lower)
    }
    throw error
  }
  userIdByEmail.set(lower, data.user.id)
  return data.user.id
}

async function deleteSeededUsers() {
  console.log(`🗑  Resetting seed data — deleting all *${DOMAIN} users...`)
  await loadExistingUsers()
  let count = 0
  for (const [email, id] of userIdByEmail.entries()) {
    if (!email.endsWith(DOMAIN)) continue
    const { error } = await sb.auth.admin.deleteUser(id)
    if (error) console.warn(`  · failed ${email}: ${error.message}`)
    else count++
  }
  console.log(`✓ Deleted ${count} demo users (cascades clean child rows).\n`)
}

// ============================================================
// Phases
// ============================================================
async function seedCompanies() {
  console.log('→ Seeding employers + opportunities...')
  let oppCount = 0
  for (const c of COMPANIES) {
    const userId = await ensureUser(c.email, 'company', c.name, c.name_ar)
    await sb.from('companies').update({
      name: c.name, name_ar: c.name_ar,
      industry: c.profile.industry, size: c.profile.size,
      location: c.profile.location, plan: c.profile.plan,
      logo_url: c.profile.logo_url,
    }).eq('user_id', userId)

    const { data: company } = await sb.from('companies').select('id').eq('user_id', userId).single()
    const companyId = company.id

    const { count } = await sb.from('opportunities').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
    if (count && count > 0) { oppCount += count; continue }

    const rows = c.opps.map((o, i) => ({
      company_id: companyId,
      title: o.title, title_ar: o.title_ar,
      type: o.type,
      location: o.location, location_ar: o.location_ar,
      duration: o.duration, duration_ar: o.duration_ar,
      salary: o.salary, salary_ar: o.salary_ar,
      description: o.description, description_ar: o.description_ar,
      skills: o.skills,
      deadline: o.deadline,
      is_active: true,
      created_at: daysAgo(2 + i * 3),
    }))
    const { error } = await sb.from('opportunities').insert(rows)
    if (error) console.warn(`  · ${c.name}: ${error.message}`)
    else oppCount += rows.length
  }
  console.log(`✓ ${COMPANIES.length} employers, ${oppCount} opportunities.`)
}

async function seedProviders() {
  console.log('→ Seeding training provider (ZAKA AI) + courses...')
  for (const p of PROVIDERS) {
    const userId = await ensureUser(p.email, 'provider', p.name, p.name_ar)
    await sb.from('course_providers').update({
      name: p.name, name_ar: p.name_ar, rating: p.profile.rating, logo_url: p.profile.logo_url,
    }).eq('user_id', userId)

    const { data: provider } = await sb.from('course_providers').select('id').eq('user_id', userId).single()
    const providerId = provider.id

    const { count } = await sb.from('opportunities').select('*', { count: 'exact', head: true }).eq('provider_id', providerId)
    if (count && count > 0) continue

    const rows = p.courses.map((c, i) => ({
      provider_id: providerId,
      title: c.title, title_ar: c.title_ar,
      type: 'training',
      location: 'Riyadh', location_ar: 'الرياض',
      description: c.description, description_ar: c.description_ar,
      price: c.price ?? 0,
      skills: c.skills ?? [],
      is_active: true,
      created_at: daysAgo(5 + i * 2),
    }))
    const { error } = await sb.from('opportunities').insert(rows)
    if (error) console.warn(`  · ${p.name}: ${error.message}`)
  }
  console.log(`✓ ${PROVIDERS.length} provider, ${PROVIDERS.reduce((s, p) => s + p.courses.length, 0)} courses.`)
}

async function seedUniversities() {
  console.log('→ Seeding university (IMSIU)...')
  for (const u of UNIVERSITIES) {
    const userId = await ensureUser(u.email, 'university', u.name, u.name_ar)
    await sb.from('universities').update({
      name: u.name, name_ar: u.name_ar,
      location: u.profile.location, total_students: u.profile.total_students,
      logo_url: u.profile.logo_url,
    }).eq('user_id', userId)
  }
  console.log(`✓ ${UNIVERSITIES.length} university.`)
}

async function seedStudents() {
  console.log('→ Seeding students + profiles + skills + assessments...')
  let assessedCount = 0
  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i]
    const m = MAJORS[s.m]
    const userId = await ensureUser(s.email, 'student', s.name, s.name_ar)

    const slug = PATH_FOR_MAJOR[s.m]
    const recommendedId = s.assessed ? (careerPathIdBySlug.get(slug) ?? null) : null

    await sb.from('student_profiles').upsert({
      user_id: userId,
      university: UNIVERSITIES[0].name,
      university_ar: UNIVERSITIES[0].name_ar,
      college: m.college, college_ar: m.college_ar,
      major: m.major, major_ar: m.major_ar,
      graduation_year: s.grad,
      gpa: s.gpa,
      profile_completion: s.completion,
      cv_score: s.cv,
      assessment_completed: s.assessed,
      recommended_career_path_id: recommendedId,
    }, { onConflict: 'user_id' })

    if (s.skills?.length) {
      const skillRows = s.skills.map((name, j) => ({
        student_id: userId, name, level: 60 + (j * 7) % 35,
      }))
      await sb.from('student_skills').upsert(skillRows, { onConflict: 'student_id,name' })
    }

    // Canned assessment / career analysis (no Gemini).
    if (s.assessed) {
      const answers = syntheticAnswers(i)
      const analysis = s.golden ? goldenAnalysisAr() : buildAnalysisAr(slug, s.name)
      if (!s.golden) analysis.match_score = 72 + ((i * 3) % 18) // 72–89
      await sb.from('assessment_responses').upsert({
        user_id: userId,
        answers: { raw: answers, items: [], holland_code: analysis.holland_code },
        ai_analysis: analysis,
        match_score: Math.round(analysis.match_score),
        completed_at: daysAgo(10 + (i % 30)),
      }, { onConflict: 'user_id' })
      assessedCount++
    }
  }
  console.log(`✓ ${STUDENTS.length} students (${assessedCount} with completed assessments).`)
}

// Resolve a company's opportunity id list (ordered) by company email.
async function oppsForCompany(email) {
  const userId = userIdByEmail.get(email)
  if (!userId) return []
  const { data: company } = await sb.from('companies').select('id').eq('user_id', userId).single()
  if (!company) return []
  const { data: opps } = await sb.from('opportunities')
    .select('id').eq('company_id', company.id).order('created_at', { ascending: true })
  return (opps ?? []).map((o) => o.id)
}

async function seedApplications() {
  console.log('→ Seeding applications...')

  // Map company email → ordered opportunity ids.
  const oppMap = new Map()
  for (const c of COMPANIES) oppMap.set(c.email, await oppsForCompany(c.email))

  const rows = []
  const nonGolden = STUDENTS.filter((s) => !s.golden)
  const companyEmails = COMPANIES.map((c) => c.email)

  // Spread ~4 applications per non-golden student across employers + statuses.
  let sdaiaCount = 0
  for (let i = 0; i < nonGolden.length; i++) {
    const student = nonGolden[i]
    const studentId = userIdByEmail.get(student.email)
    if (!studentId) continue

    const appsPerStudent = 3 + (i % 3) // 3–5
    const used = new Set()
    for (let k = 0; k < appsPerStudent; k++) {
      // Bias the first few students toward SDAIA so its dashboard is busy.
      let cEmail
      if (sdaiaCount < 14 && (k === 0 || i % 2 === 0)) {
        cEmail = `sdaia${DOMAIN}`
      } else {
        cEmail = companyEmails[(i + k) % companyEmails.length]
      }
      const opps = oppMap.get(cEmail) ?? []
      if (!opps.length) continue
      const oppId = opps[(i + k) % opps.length]
      const key = `${cEmail}#${oppId}`
      if (used.has(key)) continue
      used.add(key)
      if (cEmail === `sdaia${DOMAIN}`) sdaiaCount++

      rows.push({
        user_id: studentId,
        opportunity_id: oppId,
        status: STATUSES[(i + k) % STATUSES.length],
        applied_at: daysAgo(3 + ((i * 5 + k * 2) % 53)),
        updated_at: daysAgo(1 + ((i + k) % 20)),
      })
    }
  }

  // Insert in batches (idempotent on user_id+opportunity_id).
  let count = 0
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const { error } = await sb.from('applications').upsert(batch, { onConflict: 'user_id,opportunity_id' })
    if (error) console.warn(`  · applications batch: ${error.message}`)
    else count += batch.length
  }
  console.log(`✓ ${count} applications (${sdaiaCount} targeting SDAIA).`)
}

// ============================================================
// Golden student — exact mid-story state
// ============================================================
async function seedGoldenStudent() {
  console.log('→ Seeding golden student state (Ahmed Al-Omari)...')
  const userId = userIdByEmail.get(GOLDEN_STUDENT_EMAIL)
  if (!userId) { console.warn('  · golden student not found'); return }

  const dsId = careerPathIdBySlug.get('data_science_ai') ?? null
  await sb.from('student_profiles').update({ recommended_career_path_id: dsId }).eq('user_id', userId)

  const cvRating = {
    overall: 86,
    categories: { completeness: 92, impact: 84, clarity: 88, keywords: 82, relevance: 86 },
    strengths: [
      'بياناتك الأساسية مكتملة وسهل التواصل معك.',
      'الأرقام في وصف خبراتك تجعل الأثر ملموساً.',
      'قائمة مهاراتك واسعة وتمنح المسؤولين عدة نقاط جذب.',
    ],
    improvements: [
      'أضف سطراً أو سطرين عن أثر مشروع التخرج بأرقام.',
      'وحّد ترتيب الأفعال القيادية في بداية كل نقطة خبرة.',
      'أضف رابط ملف أعمال (GitHub) لإبراز مشاريعك.',
    ],
    recruiter_insight: 'سيرة قوية وجاهزة للتقديم — ركّز على التحضير للمقابلة أكثر من تعديل السيرة.',
  }
  await sb.from('cv_data').upsert({
    user_id: userId,
    personal: {
      nameEn: 'Ahmed Al-Omari', nameAr: 'أحمد العمري',
      email: GOLDEN_STUDENT_EMAIL, phone: '+966 50 123 4567',
      city: 'الرياض', linkedin: 'linkedin.com/in/ahmed-alomari',
      summary: 'طالب علوم حاسب في جامعة الإمام محمد بن سعود الإسلامية، شغوف بعلم البيانات والذكاء الاصطناعي، مع مشاريع تطبيقية على بيانات حقيقية.',
    },
    education: [
      { school: 'جامعة الإمام محمد بن سعود الإسلامية', degree: 'بكالوريوس علوم الحاسب', start: '2022', end: '2026', gpa: '3.78 / 4.0' },
    ],
    experience: [
      { title: 'متدرب تحليل بيانات', company: 'سدايا', start: '2025', end: '2025',
        description: 'طوّرت لوحة معلومات قلّصت زمن إعداد التقرير الأسبوعي بنسبة 40%، وبنيت نموذج تصنيف بدقة 0.91 على بيانات حقيقية.' },
    ],
    skills: [
      { name: 'Python', level: 88 }, { name: 'SQL', level: 82 },
      { name: 'Machine Learning', level: 80 }, { name: 'Pandas', level: 85 },
      { name: 'TypeScript', level: 72 }, { name: 'React', level: 70 },
    ],
    languages: [
      { language: 'العربية', proficiency: 'اللغة الأم' },
      { language: 'الإنجليزية', proficiency: 'متقدّم' },
    ],
    ai_rating: cvRating,
    ai_rating_at: daysAgo(4),
    updated_at: daysAgo(4),
  }, { onConflict: 'user_id' })

  const sdaiaOpps = await oppsForCompany(`sdaia${DOMAIN}`)
  const aramcoOpps = await oppsForCompany(`aramco${DOMAIN}`)
  const elmOpps = await oppsForCompany(`elm${DOMAIN}`)
  const stcOpps = await oppsForCompany(`stc${DOMAIN}`)

  const goldenApps = [
    { opp: sdaiaOpps[0], status: 'accepted',    applied: 38, updated: 4 },
    { opp: aramcoOpps[0], status: 'shortlisted', applied: 24, updated: 6 },
    { opp: stcOpps[2], status: 'reviewed',      applied: 17, updated: 9 },
    { opp: elmOpps[1], status: 'submitted',     applied: 6,  updated: 6 },
  ].filter((a) => a.opp)

  for (const a of goldenApps) {
    await sb.from('applications').upsert({
      user_id: userId, opportunity_id: a.opp, status: a.status,
      applied_at: daysAgo(a.applied), updated_at: daysAgo(a.updated),
    }, { onConflict: 'user_id,opportunity_id' })
  }

  const notifs = [
    { status: 'accepted',    opp: 'تدريب تعاوني — أبحاث تعلّم الآلة', oppEn: 'Machine Learning Research Co-op', co: 'سدايا', coEn: 'SDAIA', d: 4 },
    { status: 'shortlisted', opp: 'مهندس برمجيات — القطاع الرقمي', oppEn: 'Software Engineer — Digital', co: 'أرامكو السعودية', coEn: 'Saudi Aramco', d: 6 },
    { status: 'reviewed',    opp: 'تدريب تعاوني — تحليل البيانات', oppEn: 'Data Analytics Co-op', co: 'stc — الاتصالات السعودية', coEn: 'stc', d: 9 },
    { status: 'reviewed',    opp: 'محلل منتجات', oppEn: 'Product Analyst', co: 'علم', coEn: 'Elm', d: 12 },
    { status: 'shortlisted', opp: 'مهندس بيانات', oppEn: 'Data Engineer', co: 'سدايا', coEn: 'SDAIA', d: 18 },
    { status: 'reviewed',    opp: 'برنامج تدريبي — علم البيانات', oppEn: 'Data Science Training Program', co: 'سدايا', coEn: 'SDAIA', d: 22 },
  ]
  await sb.from('notifications').delete().eq('user_id', userId)
  const notifRows = notifs.map((n) => ({
    user_id: userId,
    type: 'application_status_changed',
    metadata: {
      opportunity_title: n.oppEn, opportunity_title_ar: n.opp,
      company_name: n.coEn, company_name_ar: n.co,
      new_status: n.status, old_status: 'submitted',
    },
    link: '/opportunities',
    read_at: n.d > 10 ? daysAgo(n.d - 1) : null,
    created_at: daysAgo(n.d),
  }))
  const { error: nErr } = await sb.from('notifications').insert(notifRows)
  if (nErr) console.warn(`  · golden notifications: ${nErr.message}`)

  console.log(`✓ Golden student ready: ${goldenApps.length} applications, ${notifRows.length} notifications, CV score 86, assessment 87%.`)
}

// ============================================================
// University metrics — one JSON row for IMSIU.
// ============================================================
async function seedUniversityMetrics() {
  console.log('→ Seeding university metrics (IMSIU)...')
  const userId = userIdByEmail.get(`imsiu${DOMAIN}`)
  if (!userId) { console.warn('  · IMSIU user not found'); return }
  const { data: uni } = await sb.from('universities').select('id').eq('user_id', userId).single()
  if (!uni) { console.warn('  · IMSIU university row not found'); return }

  const metrics = {
    headline: {
      students_on_platform: CANONICAL.students_on_platform,
      assessments_completed: CANONICAL.assessments_completed,
      skills_records: CANONICAL.skills_records,
      active_coop: CANONICAL.active_coop,
      employment_6m: CANONICAL.employment_6m,
      partnerships: CANONICAL.partnerships,
      avg_readiness: CANONICAL.avg_readiness,
      total_students: 60000,
    },
    readiness_by_college: [
      { college: 'Computer & Information Sciences', college_ar: 'علوم الحاسب والمعلومات', readiness: 84 },
      { college: 'Engineering', college_ar: 'الهندسة', readiness: 79 },
      { college: 'Economics & Administrative Sciences', college_ar: 'الاقتصاد والعلوم الإدارية', readiness: 73 },
      { college: 'Media & Communication', college_ar: 'الإعلام والاتصال', readiness: 68 },
      { college: 'Science', college_ar: 'العلوم', readiness: 64 },
      { college: 'Languages & Translation', college_ar: 'اللغات والترجمة', readiness: 61 },
      { college: 'Sharia', college_ar: 'الشريعة', readiness: 58 },
    ],
    coop_partners: [
      { company: 'Saudi Aramco', company_ar: 'أرامكو السعودية', placed: 46, status: 'active', logo: '/logos/aramco.svg' },
      { company: 'stc', company_ar: 'stc', placed: 32, status: 'active', logo: '/logos/stc.svg' },
      { company: 'SABIC', company_ar: 'سابك', placed: 28, status: 'active', logo: '/logos/sabic.svg' },
      { company: 'Elm', company_ar: 'علم', placed: 18, status: 'pending', logo: '/logos/elm.svg' },
      { company: 'NEOM', company_ar: 'نيوم', placed: 13, status: 'new', logo: '/logos/neom.svg' },
    ],
    employment_outcomes: [
      { key: 'employed', label: 'Employed', label_ar: 'موظّف', value: 64 },
      { key: 'coop', label: 'Co-op', label_ar: 'تدريب تعاوني', value: 20 },
      { key: 'grad_studies', label: 'Graduate studies', label_ar: 'دراسات عليا', value: 10 },
      { key: 'seeking', label: 'Seeking', label_ar: 'باحث عن فرصة', value: 6 },
    ],
    engagement: [
      { label: 'Skills records created', label_ar: 'سجلات مهارية مُنشأة', value: 2847, pct: 67 },
      { label: 'Assessments completed', label_ar: 'تقييمات مهنية مكتملة', value: 3412, pct: 81 },
      { label: 'Opportunities applied', label_ar: 'طلبات على الفرص', value: 5630, pct: 88 },
      { label: 'Co-op placements active', label_ar: 'تدريب تعاوني نشط', value: 318, pct: 42 },
      { label: 'Training enrollments', label_ar: 'تسجيلات تدريبية', value: 1290, pct: 38 },
    ],
    recent_activity: [
      { label: 'New co-op placement at Saudi Aramco', label_ar: 'تدريب تعاوني جديد في أرامكو السعودية', days: 0 },
      { label: 'SDAIA confirmed 4 new offers', label_ar: 'سدايا تؤكد 4 عروض جديدة', days: 1 },
      { label: '120 students completed the career assessment', label_ar: '120 طالباً أكملوا التقييم المهني', days: 2 },
      { label: 'New partnership review with NEOM', label_ar: 'مراجعة شراكة جديدة مع نيوم', days: 4 },
    ],
  }

  const { error } = await sb.from('university_metrics').upsert({
    university_id: uni.id, metrics, updated_at: NOW.toISOString(),
  }, { onConflict: 'university_id' })
  if (error) console.warn(`  · university_metrics: ${error.message}`)
  else console.log('✓ IMSIU metrics seeded (canonical numbers).')
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('━━━ Tamkeen seed script ━━━')
  console.log(`  Project: ${URL}`)
  console.log()

  if (RESET) {
    await deleteSeededUsers()
  }

  await loadExistingUsers()
  await loadCareerPaths()
  await seedCompanies()
  await seedProviders()
  await seedUniversities()
  await seedStudents()
  await seedApplications()
  await seedGoldenStudent()
  await seedUniversityMetrics()

  console.log()
  console.log('━━━ Done ━━━')
  console.log(`Test password for every demo user: ${PASSWORD}`)
  console.log()
  console.log('Sign-in shortcuts:')
  console.log(`  Student (golden) → ahmed${DOMAIN}  /  ${PASSWORD}`)
  console.log(`  Company (SDAIA)  → sdaia${DOMAIN}  /  ${PASSWORD}`)
  console.log(`  University (IMSIU) → imsiu${DOMAIN}  /  ${PASSWORD}`)
  console.log(`  Provider (ZAKA AI) → zaka${DOMAIN}  /  ${PASSWORD}`)
}

main().catch((err) => {
  console.error('❌', err)
  process.exit(1)
})
