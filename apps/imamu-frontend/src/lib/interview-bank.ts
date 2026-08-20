// Local question bank for interview prep — 3 technical questions per career
// path (54 total) plus a shared pool of behavioral + situational questions.
// Lets us run interview-prep entirely client-side, no AI required.

import type { InterviewQuestion } from '@/lib/interview-prep'

interface BankQuestion {
  en: string
  ar: string
  hintEn: string
  hintAr: string
  skills: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Path-specific TECHNICAL questions (3 per path, 18 paths = 54 total).
// ─────────────────────────────────────────────────────────────────────────────

export const TECHNICAL_BANK: Record<string, BankQuestion[]> = {
  // R — Realistic
  mechanical_engineering: [
    { en: 'Walk me through how you would diagnose a vibration issue in a rotating shaft assembly.', ar: 'صف كيف تشخّص مشكلة اهتزاز في مجموعة عمود دوّار.', hintEn: 'Think about FFT, balancing, alignment, bearing condition.', hintAr: 'فكّر في تحليل التردد والاتزان والمحاذاة وحالة المحامل.', skills: ['Vibration Analysis', 'Diagnostics'] },
    { en: 'Explain the trade-offs between using FEA and analytical methods to validate a structural design.', ar: 'اشرح المفاضلات بين استخدام FEA والطرق التحليلية للتحقق من تصميم إنشائي.', hintEn: 'Cost, time, accuracy, complexity of geometry.', hintAr: 'التكلفة والوقت والدقة وتعقيد الهندسة.', skills: ['FEA', 'Structural Analysis'] },
    { en: 'Describe a manufacturing process choice you made and why it fit the part design.', ar: 'صف اختياراً لعملية تصنيع قمت به وسبب ملاءمته لتصميم القطعة.', hintEn: 'Volume, tolerance, material, surface finish.', hintAr: 'الكمية والدقة والمادة والتشطيب السطحي.', skills: ['Manufacturing', 'DFM'] },
  ],
  aerospace_aviation: [
    { en: 'Walk me through how lift is generated and how you would measure it on a small UAV.', ar: 'صف كيف تتولّد قوة الرفع وكيف تقيسها على طائرة بدون طيار صغيرة.', hintEn: 'Bernoulli, Newton, AoA, pitot tubes, load cells.', hintAr: 'برنولي، نيوتن، زاوية الهجوم، أنابيب بيتو.', skills: ['Aerodynamics'] },
    { en: 'How would you approach reliability requirements for a flight-critical component?', ar: 'كيف تتعامل مع متطلبات الموثوقية لمكوّن حرج للطيران؟', hintEn: 'Redundancy, MTBF, FMEA, certification standards.', hintAr: 'التكرار، متوسط الوقت بين الأعطال، تحليل الأسباب.', skills: ['Reliability', 'Safety'] },
    { en: 'Explain how you would size the propulsion system for a regional aircraft.', ar: 'اشرح كيف تحدد مقاس نظام الدفع لطائرة إقليمية.', hintEn: 'Range, payload, cruise speed, thrust-to-weight.', hintAr: 'المدى والحمولة وسرعة الإبحار ونسبة الدفع للوزن.', skills: ['Propulsion', 'Sizing'] },
  ],
  renewable_energy: [
    { en: 'How would you site a utility-scale solar farm in the Saudi context?', ar: 'كيف تختار موقع مزرعة شمسية واسعة النطاق في السياق السعودي؟', hintEn: 'Irradiance, dust, grid access, land tenure.', hintAr: 'الإشعاع والغبار والوصول للشبكة وحقوق الأراضي.', skills: ['Solar PV', 'Site Selection'] },
    { en: 'Walk me through balancing intermittent renewables on a national grid.', ar: 'صف كيفية موازنة المصادر المتجددة المتقطعة على الشبكة الوطنية.', hintEn: 'Storage, demand response, gas peaking, forecasting.', hintAr: 'التخزين، الاستجابة للطلب، الذروة الغازية، التنبؤ.', skills: ['Grid Engineering'] },
    { en: 'Explain the financial model behind a PPA for a wind project.', ar: 'اشرح النموذج المالي لاتفاقية شراء طاقة لمشروع رياح.', hintEn: 'CAPEX, capacity factor, LCOE, off-taker risk.', hintAr: 'التكلفة الرأسمالية وعامل القدرة وLCOE.', skills: ['Energy Economics'] },
  ],

  // I — Investigative
  software_engineering: [
    { en: 'Walk me through designing a URL shortener that scales to 100M users.', ar: 'صف كيف تصمم خدمة اختصار روابط تتوسّع إلى 100 مليون مستخدم.', hintEn: 'Hashing, collisions, caching layers, sharding.', hintAr: 'التجزئة والتصادمات وطبقات التخزين والتقسيم.', skills: ['System Design', 'Scalability'] },
    { en: 'Explain the trade-offs between SQL and NoSQL for a real-time analytics workload.', ar: 'اشرح المفاضلات بين SQL وNoSQL لعبء تحليلي لحظي.', hintEn: 'Consistency, query patterns, write throughput, schema rigidity.', hintAr: 'التماسك وأنماط الاستعلام وسرعة الكتابة وصرامة البنية.', skills: ['Databases', 'Architecture'] },
    { en: 'How would you debug a production memory leak you can\'t reproduce locally?', ar: 'كيف تشخّص تسرّب ذاكرة في الإنتاج لا يمكنك تكراره محلياً؟', hintEn: 'Heap dumps, profilers, observability, narrowing endpoints.', hintAr: 'لقطات الذاكرة والملمّحات والرصد وتضييق نقاط النهاية.', skills: ['Debugging', 'Observability'] },
  ],
  data_science_ai: [
    { en: 'Walk me through how you would build a churn-prediction model from scratch.', ar: 'صف كيف تبني نموذج تنبؤ بفقدان العملاء من الصفر.', hintEn: 'Problem framing, features, baseline, eval, deployment.', hintAr: 'صياغة المشكلة، الميزات، الأساس، التقييم، النشر.', skills: ['ML', 'Feature Engineering'] },
    { en: 'When does a deep model beat a tree-based model, and when not?', ar: 'متى يتفوّق النموذج العميق على النماذج الشجرية ومتى لا؟', hintEn: 'Tabular vs unstructured data, sample size, latency.', hintAr: 'البيانات المهيكلة مقابل غير المهيكلة، حجم العينة، الكمون.', skills: ['ML Theory'] },
    { en: 'How do you guard against data leakage in your evaluation pipeline?', ar: 'كيف تحمي تقييمك من تسرّب البيانات؟', hintEn: 'Time-based splits, fit only on train, target encoding gotchas.', hintAr: 'التقسيم الزمني، التدريب على التدريب فقط، أخطاء ترميز الهدف.', skills: ['ML Eval'] },
  ],
  healthcare_medicine: [
    { en: 'Walk me through your clinical reasoning for a patient with chest pain.', ar: 'صف منطقك السريري لمريض يشكو من ألم في الصدر.', hintEn: 'Differential, red flags, history, exam, triage.', hintAr: 'التشخيص التفريقي والعلامات الحمراء والتاريخ والفحص.', skills: ['Clinical Reasoning'] },
    { en: 'How would you evaluate a new diagnostic test that claims 95% accuracy?', ar: 'كيف تقيّم اختباراً تشخيصياً جديداً يدّعي دقة 95%؟', hintEn: 'Sensitivity, specificity, PPV/NPV, prevalence dependence.', hintAr: 'الحساسية والنوعية والقيم التنبؤية والاعتماد على الانتشار.', skills: ['Evidence-Based Medicine'] },
    { en: 'Describe how you would communicate a difficult diagnosis to a family.', ar: 'صف كيف تتعامل مع إيصال تشخيص صعب لعائلة.', hintEn: 'SPIKES protocol, empathy, plan, follow-up.', hintAr: 'بروتوكول SPIKES، التعاطف، الخطة، المتابعة.', skills: ['Patient Communication'] },
  ],

  // A — Artistic
  architecture_design: [
    { en: 'Walk me through your design process for a mid-rise mixed-use building.', ar: 'صف عملية تصميمك لمبنى متعدد الاستخدام متوسط الارتفاع.', hintEn: 'Site, program, massing, circulation, sustainability.', hintAr: 'الموقع والبرنامج والكتلة والحركة والاستدامة.', skills: ['Design Process'] },
    { en: 'How do you balance client wishes with code constraints when they conflict?', ar: 'كيف توازن بين رغبات العميل وقيود الأنظمة حين تتعارض؟', hintEn: 'Re-frame brief, present trade-offs, propose alternates.', hintAr: 'إعادة صياغة المتطلبات، عرض المقايضات، اقتراح بدائل.', skills: ['Stakeholder Management'] },
    { en: 'Explain how you approach passive cooling in a hot-arid climate.', ar: 'اشرح كيف تتعامل مع التبريد السلبي في مناخ حار جاف.', hintEn: 'Orientation, shading, mass, ventilation, materials.', hintAr: 'التوجيه، التظليل، الكتلة، التهوية، المواد.', skills: ['Sustainable Design'] },
  ],
  film_media_gaming: [
    { en: 'Walk me through how you developed the visual identity for your last project.', ar: 'صف كيف طوّرت الهوية البصرية لآخر مشروع لك.', hintEn: 'Tone, references, audience, iteration loop.', hintAr: 'النبرة والمراجع والجمهور وحلقة التكرار.', skills: ['Art Direction'] },
    { en: 'How do you write coverage notes that actually help a script get better?', ar: 'كيف تكتب ملاحظات تحليل سيناريو تساعده فعلاً على التطور؟', hintEn: 'Specific, structural, character-driven, prioritised.', hintAr: 'محددة، بنيوية، مرتكزة على الشخصية، مرتبة.', skills: ['Storytelling', 'Editing'] },
    { en: 'Explain your pipeline for moving from concept art to in-engine asset.', ar: 'اشرح خط الإنتاج من رسم المفهوم إلى الأصل داخل المحرّك.', hintEn: 'Concept, modeling, texturing, rigging, integration.', hintAr: 'المفهوم، النمذجة، التكسية، التحريك، الدمج.', skills: ['Production Pipeline'] },
  ],
  visual_arts_design: [
    { en: 'Walk me through a brand redesign you led — what changed and why?', ar: 'صف عملية إعادة تصميم علامة تجارية قدتها — ما الذي تغيّر ولماذا؟', hintEn: 'Audit, brief, principles, system, rollout.', hintAr: 'التدقيق، الإيجاز، المبادئ، النظام، التطبيق.', skills: ['Brand Identity'] },
    { en: 'How do you defend a design choice when stakeholders push back?', ar: 'كيف تدافع عن خيار تصميمي حين يعترض أصحاب القرار؟', hintEn: 'User evidence, principles, trade-off framing.', hintAr: 'دليل المستخدم، المبادئ، إطار المقايضة.', skills: ['Critique', 'Communication'] },
    { en: 'Explain your typography hierarchy on a content-heavy product.', ar: 'اشرح هرم الخطوط لديك في منتج كثيف المحتوى.', hintEn: 'Scale, weight, contrast, rhythm, readability.', hintAr: 'الحجم، الوزن، التباين، الإيقاع، القراءة.', skills: ['Typography'] },
  ],

  // S — Social
  education_teaching: [
    { en: 'Walk me through how you would teach a topic students find dry.', ar: 'صف كيف تدرّس موضوعاً يجده الطلاب مملاً.', hintEn: 'Hook, real-world tie-in, active learning, formative checks.', hintAr: 'لفت الانتباه، الربط بالواقع، التعلم النشط، الفحص التكويني.', skills: ['Pedagogy', 'Curriculum Design'] },
    { en: 'How do you handle a class where ability levels are very mixed?', ar: 'كيف تتعامل مع فصل مستويات الطلاب فيه متفاوتة جداً؟', hintEn: 'Differentiation, scaffolding, pair work, choice boards.', hintAr: 'التفريد، الدعم المتدرّج، العمل الثنائي، خيارات المهام.', skills: ['Differentiation'] },
    { en: 'How would you design assessment that measures real learning, not memorisation?', ar: 'كيف تصمم تقييماً يقيس تعلماً حقيقياً وليس حفظاً؟', hintEn: 'Application tasks, transfer, rubrics, performance assessment.', hintAr: 'مهام تطبيقية، نقل، روبركس، تقييم أداء.', skills: ['Assessment'] },
  ],
  nursing_therapy: [
    { en: 'Walk me through how you triage four patients arriving simultaneously.', ar: 'صف كيف تفرز أربعة مرضى وصلوا في وقت واحد.', hintEn: 'ABCDE, severity, acuity, escalation.', hintAr: 'تقييم ABCDE، الخطورة، الحدّة، التصعيد.', skills: ['Triage', 'Clinical Practice'] },
    { en: 'How do you build trust with a patient who is anxious or non-cooperative?', ar: 'كيف تبني الثقة مع مريض قلق أو غير متعاون؟', hintEn: 'Active listening, naming feelings, small wins, consistency.', hintAr: 'الإصغاء الفعّال، تسمية المشاعر، انتصارات صغيرة، الاتساق.', skills: ['Patient Communication'] },
    { en: 'Describe how you would educate a patient on managing a chronic condition.', ar: 'صف كيف تثقّف مريضاً عن إدارة حالة مزمنة.', hintEn: 'Teach-back, written aids, lifestyle vs meds, follow-up.', hintAr: 'إعادة الشرح، أدوات مكتوبة، نمط الحياة والأدوية، المتابعة.', skills: ['Patient Education'] },
  ],
  counseling_hr: [
    { en: 'Walk me through how you would structure a 1-on-1 with a struggling employee.', ar: 'صف كيف تنظّم لقاءً فردياً مع موظف يعاني.', hintEn: 'Open, listen, identify gap, plan, follow-up.', hintAr: 'الانفتاح، الإصغاء، تحديد الفجوة، الخطة، المتابعة.', skills: ['Coaching'] },
    { en: 'How would you design a hiring process that minimises bias?', ar: 'كيف تصمم عملية توظيف تقلل التحيز؟', hintEn: 'Structured interviews, work samples, blind reviews, panels.', hintAr: 'مقابلات منظمة، عينات عمل، مراجعات عمياء، لجان.', skills: ['Recruiting'] },
    { en: 'Walk me through how you would diagnose a team morale problem.', ar: 'صف كيف تشخّص مشكلة معنويات فريق.', hintEn: 'Listen broadly, eNPS, exit data, manager 1-1s.', hintAr: 'إصغاء واسع، eNPS، بيانات الاستقالة، لقاءات المدراء.', skills: ['Org Health'] },
  ],

  // E — Enterprising
  business_entrepreneurship: [
    { en: 'Walk me through how you would validate a startup idea in 30 days.', ar: 'صف كيف تتحقق من فكرة شركة ناشئة خلال 30 يوماً.', hintEn: 'Customer interviews, fake door, MVP, willingness to pay.', hintAr: 'مقابلات العملاء، اختبار الباب الزائف، MVP، الاستعداد للدفع.', skills: ['Discovery', 'Lean Startup'] },
    { en: 'How would you decide between raising capital and bootstrapping?', ar: 'كيف تختار بين جلب استثمار أو التمويل الذاتي؟', hintEn: 'Speed, scale, dilution, market timing, control.', hintAr: 'السرعة، التوسع، التخفيف، توقيت السوق، السيطرة.', skills: ['Fundraising'] },
    { en: 'Explain how you set the first 3 KPIs for a B2B SaaS startup.', ar: 'اشرح كيف تحدد أول 3 مؤشرات أداء لشركة SaaS B2B.', hintEn: 'Activation, retention, revenue per customer.', hintAr: 'التفعيل، الاحتفاظ، الإيراد لكل عميل.', skills: ['Strategy', 'Metrics'] },
  ],
  marketing_brand: [
    { en: 'Walk me through how you would launch a new product with limited budget.', ar: 'صف كيف تطلق منتجاً جديداً بميزانية محدودة.', hintEn: 'ICP, channel pick, content engine, partnerships, paid only after PMF.', hintAr: 'العميل المستهدف، اختيار القناة، محرّك المحتوى، الشراكات.', skills: ['Go-to-Market'] },
    { en: 'How do you measure brand health, not just performance metrics?', ar: 'كيف تقيس صحة العلامة التجارية لا الأداء فقط؟', hintEn: 'Awareness, consideration, NPS, share of voice.', hintAr: 'الوعي، الاعتبار، NPS، حصة الصوت.', skills: ['Brand Strategy'] },
    { en: 'Walk me through a campaign you ran that underperformed — what did you learn?', ar: 'صف حملة أدرتها لم تنجح — ماذا تعلّمت؟', hintEn: 'Hypothesis, attribution, post-mortem, next iteration.', hintAr: 'الفرضية، النسب، التحليل البعدي، التكرار التالي.', skills: ['Campaign Optimisation'] },
  ],
  hospitality_tourism: [
    { en: 'Walk me through how you would design the guest journey for a new hotel.', ar: 'صف كيف تصمم رحلة الضيف لفندق جديد.', hintEn: 'Pre-arrival, check-in, in-stay, departure, post-stay.', hintAr: 'ما قبل الوصول، تسجيل الدخول، الإقامة، المغادرة، ما بعد.', skills: ['Guest Experience'] },
    { en: 'How would you handle a 4-star reviewer publicly criticising service?', ar: 'كيف تتعامل مع ناقد بأربع نجوم ينتقد الخدمة علناً؟', hintEn: 'Acknowledge, take it offline, fix, follow up publicly.', hintAr: 'الاعتراف، نقل الحوار، الإصلاح، المتابعة علناً.', skills: ['Reputation Management'] },
    { en: 'Explain how you would price rooms during off-season.', ar: 'اشرح كيف تسعّر الغرف خارج الموسم.', hintEn: 'Demand forecast, packages, length-of-stay, dynamic pricing.', hintAr: 'التنبؤ بالطلب، الباقات، طول الإقامة، التسعير الديناميكي.', skills: ['Revenue Management'] },
  ],

  // C — Conventional
  finance_banking: [
    { en: 'Walk me through how you would value a private SaaS company.', ar: 'صف كيف تقيّم شركة SaaS خاصة.', hintEn: 'Revenue multiples, DCF, comparables, growth/margin scoring.', hintAr: 'مضاعفات الإيراد، DCF، المقارنات، تقييم النمو والهامش.', skills: ['Valuation'] },
    { en: 'Explain how you would manage interest-rate risk on a banking book.', ar: 'اشرح كيف تدير مخاطر سعر الفائدة لسجل بنكي.', hintEn: 'Duration matching, swaps, repricing gap.', hintAr: 'مطابقة المدة، المقايضات، فجوة إعادة التسعير.', skills: ['Risk Management'] },
    { en: 'How would you build a 3-statement model from scratch?', ar: 'كيف تبني نموذجاً مالياً ثلاثي القوائم من الصفر؟', hintEn: 'Drivers, IS → BS → CF logic, balancing.', hintAr: 'المحركات، منطق ربط القوائم، التوازن.', skills: ['Financial Modeling'] },
  ],
  accounting_auditing: [
    { en: 'Walk me through how you would audit revenue recognition for a SaaS company.', ar: 'صف كيف تدقّق الاعتراف بالإيراد لشركة SaaS.', hintEn: 'IFRS 15, performance obligations, deferred revenue testing.', hintAr: 'IFRS 15، التزامات الأداء، اختبار الإيراد المؤجل.', skills: ['Audit', 'IFRS'] },
    { en: 'How would you investigate a sudden drop in gross margin?', ar: 'كيف تبحث في انخفاض مفاجئ بهامش الربح الإجمالي؟', hintEn: 'Mix shift, pricing, COGS line items, cut-off issues.', hintAr: 'تغيّر المزيج، التسعير، بنود التكلفة، قضايا القطع.', skills: ['Analysis'] },
    { en: 'Explain how you would handle a Zakat/VAT dispute with the authority.', ar: 'اشرح كيف تتعامل مع نزاع زكاة أو ضريبة قيمة مضافة مع الهيئة.', hintEn: 'Documentation, ruling letters, escalation steps.', hintAr: 'التوثيق، خطابات الحكم، خطوات التصعيد.', skills: ['Tax', 'Compliance'] },
  ],
  operations_supply_chain: [
    { en: 'Walk me through how you would reduce a 3-week order lead time.', ar: 'صف كيف تخفّض زمن تنفيذ طلب من 3 أسابيع.', hintEn: 'Map current state, identify bottleneck, eliminate vs accelerate.', hintAr: 'رسم الحالة الحالية، تحديد العنق، الإلغاء أو التسريع.', skills: ['Process Improvement'] },
    { en: 'How would you decide between regional warehouses and a central hub?', ar: 'كيف تختار بين مستودعات إقليمية ومركز توزيع رئيسي؟', hintEn: 'Cost-to-serve, lead time, inventory pooling, demand patterns.', hintAr: 'تكلفة الخدمة، زمن التسليم، تجميع المخزون، أنماط الطلب.', skills: ['Network Design'] },
    { en: 'Explain how you would build supplier resilience without inflating cost.', ar: 'اشرح كيف تبني مرونة الموردين دون تضخيم التكلفة.', hintEn: 'Dual sourcing, regional split, buffer at key nodes, contracts.', hintAr: 'المصادر الثنائية، التوزيع الإقليمي، احتياطي عند العقد الرئيسية.', skills: ['Supplier Management'] },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared BEHAVIORAL questions — apply to any path.
// ─────────────────────────────────────────────────────────────────────────────

export const BEHAVIORAL_BANK: BankQuestion[] = [
  {
    en: 'Tell me about a time you disagreed with a teammate or manager. How did you handle it?',
    ar: 'حدّثني عن موقف اختلفت فيه مع زميل أو مدير. كيف تعاملت معه؟',
    hintEn: 'Use STAR. Show empathy, evidence, and how you reached resolution.',
    hintAr: 'استخدم طريقة STAR. أظهر التعاطف والدليل وكيفية الوصول لحل.',
    skills: ['Communication', 'Conflict Resolution'],
  },
  {
    en: 'Describe the most ambiguous problem you\'ve worked on. How did you make progress?',
    ar: 'صف أكثر مشكلة غامضة عملت عليها. كيف تقدّمت فيها؟',
    hintEn: 'Frame the ambiguity, your structure, and how you reduced uncertainty.',
    hintAr: 'صياغة الغموض، هيكلك، وكيف قلّلت الشكوك.',
    skills: ['Problem Solving', 'Initiative'],
  },
  {
    en: 'Walk me through a time you had to learn something new fast for a project.',
    ar: 'صف وقتاً اضطررت فيه لتعلّم شيء جديد بسرعة لمشروع.',
    hintEn: 'Show your learning approach and how you applied it.',
    hintAr: 'أظهر نهج تعلّمك وكيف طبّقته.',
    skills: ['Learning Agility'],
  },
  {
    en: 'Tell me about your proudest accomplishment in the last 12 months.',
    ar: 'حدّثني عن أكثر إنجاز تفخر به في آخر 12 شهراً.',
    hintEn: 'Quantify the impact and your specific contribution.',
    hintAr: 'كمّ الأثر وارفق مساهمتك المحددة.',
    skills: ['Impact', 'Ownership'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Shared SITUATIONAL questions — hypothetical scenarios.
// ─────────────────────────────────────────────────────────────────────────────

export const SITUATIONAL_BANK: BankQuestion[] = [
  {
    en: 'Imagine you have a tight deadline and incomplete information. How do you proceed?',
    ar: 'تخيّل أن لديك موعداً ضيقاً ومعلومات ناقصة. كيف تتصرف؟',
    hintEn: 'Show prioritisation, communication with stakeholders, and how you de-risk.',
    hintAr: 'أظهر الأولويات، التواصل مع أصحاب القرار، وتقليل المخاطر.',
    skills: ['Prioritisation', 'Communication'],
  },
  {
    en: 'You discover a serious issue right before a major release. What do you do?',
    ar: 'تكتشف مشكلة جادة قبل إصدار كبير مباشرة. ماذا تفعل؟',
    hintEn: 'Triage severity, communicate up, weigh ship vs. delay.',
    hintAr: 'فرز الخطورة، التواصل للأعلى، الموازنة بين الإصدار والتأجيل.',
    skills: ['Judgment', 'Crisis Handling'],
  },
  {
    en: 'A teammate is consistently missing commitments. How would you address it?',
    ar: 'زميل لا يلتزم بمواعيد التسليم باستمرار. كيف تتعامل معه؟',
    hintEn: 'Direct conversation, root cause, expectation reset, escalation only if needed.',
    hintAr: 'محادثة مباشرة، السبب الجذري، إعادة ضبط التوقعات، التصعيد عند الحاجة.',
    skills: ['Accountability', 'Feedback'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Picker — assemble 5 questions for a given path with a balanced category mix.
// Order: 2 technical (path-specific), 2 behavioral, 1 situational.
// ─────────────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function toQuestion(b: BankQuestion, id: number, category: 'technical' | 'behavioral' | 'situational', lang: 'en' | 'ar'): InterviewQuestion {
  return {
    id,
    category,
    question: lang === 'ar' ? b.ar : b.en,
    hint: lang === 'ar' ? b.hintAr : b.hintEn,
    target_skills: b.skills,
  }
}

export function pickInterviewQuestions(pathSlug: string, lang: 'en' | 'ar'): InterviewQuestion[] {
  const techPool = TECHNICAL_BANK[pathSlug] ?? TECHNICAL_BANK.software_engineering
  const tech = shuffle(techPool).slice(0, 2)
  const behave = shuffle(BEHAVIORAL_BANK).slice(0, 2)
  const sit = shuffle(SITUATIONAL_BANK).slice(0, 1)

  let id = 0
  return [
    ...tech.map((b) => toQuestion(b, ++id, 'technical', lang)),
    ...behave.map((b) => toQuestion(b, ++id, 'behavioral', lang)),
    ...sit.map((b) => toQuestion(b, ++id, 'situational', lang)),
  ]
}
