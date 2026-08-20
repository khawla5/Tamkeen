-- ============================================================
-- Fursati · revision 0004
-- Seed the 18 RIASEC-aligned career paths into public.career_paths.
-- Idempotent: re-running this migration won't duplicate rows.
-- ============================================================

-- Add a helper column so we can match the AI's slug back to a path row.
alter table public.career_paths
  add column if not exists slug text unique;

-- Add a column for the primary RIASEC code.
alter table public.career_paths
  add column if not exists riasec_code text
  check (riasec_code in ('R','I','A','S','E','C'));

-- Seed the 18 paths.
insert into public.career_paths (slug, riasec_code, title, title_ar, icon, description, description_ar)
values
  -- R — Realistic
  ('mechanical_engineering', 'R', 'Mechanical Engineering', 'الهندسة الميكانيكية', '🔧',
   'Designing machines, vehicles, and industrial systems.',
   'تصميم الآلات والمركبات والأنظمة الصناعية'),
  ('aerospace_aviation', 'R', 'Aerospace & Aviation', 'الطيران والفضاء', '✈️',
   'Aircraft, satellites, and the next generation of flight.',
   'الطائرات والأقمار الصناعية وجيل جديد من الطيران'),
  ('renewable_energy', 'R', 'Renewable Energy & Sustainability', 'الطاقة المتجددة والاستدامة', '🌱',
   'Solar, wind and clean-tech projects of Vision 2030.',
   'الطاقة الشمسية والرياح ومشاريع الاستدامة في رؤية 2030'),

  -- I — Investigative
  ('software_engineering', 'I', 'Software Engineering', 'هندسة البرمجيات', '💻',
   'Building products, platforms, and infrastructure with code.',
   'بناء المنتجات والمنصات والأنظمة بالبرمجة'),
  ('data_science_ai', 'I', 'Data Science & AI', 'علم البيانات والذكاء الاصطناعي', '🧠',
   'Models, analytics, and intelligence at scale.',
   'النماذج والتحليلات والذكاء الاصطناعي على نطاق واسع'),
  ('healthcare_medicine', 'I', 'Healthcare & Medicine', 'الرعاية الصحية والطب', '🩺',
   'Diagnosing, treating, and advancing health science.',
   'التشخيص والعلاج وتطوير علوم الصحة'),

  -- A — Artistic
  ('architecture_design', 'A', 'Architecture & Urban Design', 'العمارة والتصميم العمراني', '🏛️',
   'Shaping spaces, buildings, and cities of the future.',
   'تشكيل الفضاءات والمباني ومدن المستقبل'),
  ('film_media_gaming', 'A', 'Film, Media & Gaming', 'الإعلام والسينما والألعاب', '🎬',
   'Storytelling across screens, studios, and games.',
   'سرد القصص عبر الشاشات والاستوديوهات والألعاب'),
  ('visual_arts_design', 'A', 'Visual Arts & Design', 'الفنون البصرية والتصميم', '🎨',
   'Graphic design, fashion, photography and visual identity.',
   'التصميم الجرافيكي والأزياء والتصوير والهوية البصرية'),

  -- S — Social
  ('education_teaching', 'S', 'Education & Teaching', 'التعليم والتدريس', '👩‍🏫',
   'Teaching, training, and shaping the next generation.',
   'التدريس والتدريب وتشكيل الجيل القادم'),
  ('nursing_therapy', 'S', 'Nursing & Therapy', 'التمريض والعلاج', '💚',
   'Caring for patients, recovery, and mental health.',
   'رعاية المرضى والتأهيل والصحة النفسية'),
  ('counseling_hr', 'S', 'Counseling & HR', 'الإرشاد والموارد البشرية', '🤝',
   'Coaching people, building teams, growing talent.',
   'إرشاد الأفراد وبناء الفرق وتنمية المواهب'),

  -- E — Enterprising
  ('business_entrepreneurship', 'E', 'Business & Entrepreneurship', 'الأعمال وريادة الأعمال', '🚀',
   'Building companies, leading ventures, scaling impact.',
   'بناء الشركات وقيادة المشاريع وتوسيع الأثر'),
  ('marketing_brand', 'E', 'Marketing & Brand Strategy', 'التسويق واستراتيجية العلامات', '📣',
   'Brands, growth, audience and commercial strategy.',
   'العلامات التجارية والنمو والجمهور والاستراتيجية'),
  ('hospitality_tourism', 'E', 'Hospitality, Tourism & Events', 'الضيافة والسياحة والفعاليات', '🏖️',
   'Hotels, destinations, and experiences across the Kingdom.',
   'الفنادق والوجهات والتجارب في جميع أنحاء المملكة'),

  -- C — Conventional
  ('finance_banking', 'C', 'Finance & Banking', 'التمويل والبنوك', '🏦',
   'Capital, investment, risk, and financial markets.',
   'رأس المال والاستثمار والمخاطر والأسواق المالية'),
  ('accounting_auditing', 'C', 'Accounting & Auditing', 'المحاسبة والتدقيق', '📊',
   'Financial reporting, compliance, and assurance.',
   'التقارير المالية والامتثال والتدقيق'),
  ('operations_supply_chain', 'C', 'Operations & Supply Chain', 'العمليات وسلاسل الإمداد', '📦',
   'Logistics, procurement, and large-scale operations.',
   'اللوجستيات والمشتريات والعمليات واسعة النطاق')

on conflict (slug) do update
  set riasec_code     = excluded.riasec_code,
      title           = excluded.title,
      title_ar        = excluded.title_ar,
      icon            = excluded.icon,
      description     = excluded.description,
      description_ar  = excluded.description_ar;
