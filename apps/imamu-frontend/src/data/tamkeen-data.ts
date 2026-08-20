// Tamkeen-specific frontend dummy data. Lives in its own file so we don't
// have to thread changes through the very large dummy-data.ts; both modules
// re-export from here via the data barrel.

export type TrainingMilestoneType = 'course' | 'cert' | 'activity' | 'workshop' | 'coop'
export type TrainingMilestoneStatus = 'completed' | 'in_progress' | 'upcoming'

export interface TrainingMilestone {
  id: string
  title: string
  titleAr: string
  type: TrainingMilestoneType
  status: TrainingMilestoneStatus
  duration: string
  completedAt?: string
  autoTracked: boolean
}

// Keyed by career-path slug. The student's recommended path drives which
// milestone list shows up on /training-path. A `default` fallback covers
// students who haven't taken the assessment yet.
export const trainingPathMilestones: Record<string, TrainingMilestone[]> = {
  'software-engineer': [
    { id: 'sw-1', title: 'Problem Solving Workshop', titleAr: 'دورة حل المشكلات', type: 'workshop', status: 'completed', duration: '8 hours', completedAt: '2025-09-12', autoTracked: true },
    { id: 'sw-2', title: 'Programming Foundations (Python)', titleAr: 'أساسيات البرمجة (بايثون)', type: 'course', status: 'completed', duration: '6 weeks', completedAt: '2025-11-04', autoTracked: true },
    { id: 'sw-3', title: 'Web Development Bootcamp', titleAr: 'معسكر تطوير الويب', type: 'course', status: 'in_progress', duration: '10 weeks', autoTracked: true },
    { id: 'sw-4', title: 'IELTS — Academic 6.5+', titleAr: 'شهادة IELTS — أكاديمي 6.5+', type: 'cert', status: 'upcoming', duration: '4 weeks prep', autoTracked: false },
    { id: 'sw-5', title: 'AWS Cloud Practitioner', titleAr: 'شهادة AWS Cloud Practitioner', type: 'cert', status: 'upcoming', duration: '3 weeks', autoTracked: false },
    { id: 'sw-6', title: 'University Hackathon Participation', titleAr: 'المشاركة في هاكاثون الجامعة', type: 'activity', status: 'upcoming', duration: '48 hours', autoTracked: false },
    { id: 'sw-7', title: 'Co-op Training Placement', titleAr: 'تدريب تعاوني', type: 'coop', status: 'upcoming', duration: '6 months', autoTracked: false },
  ],
  'data-scientist': [
    { id: 'ds-1', title: 'Statistics Fundamentals', titleAr: 'أساسيات الإحصاء', type: 'course', status: 'completed', duration: '4 weeks', completedAt: '2025-10-02', autoTracked: true },
    { id: 'ds-2', title: 'SQL for Analytics', titleAr: 'SQL للتحليلات', type: 'course', status: 'completed', duration: '3 weeks', completedAt: '2025-12-18', autoTracked: true },
    { id: 'ds-3', title: 'Python for Data Science', titleAr: 'بايثون لعلم البيانات', type: 'course', status: 'in_progress', duration: '6 weeks', autoTracked: true },
    { id: 'ds-4', title: 'Machine Learning with Scikit-learn', titleAr: 'تعلم الآلة باستخدام Scikit-learn', type: 'course', status: 'upcoming', duration: '8 weeks', autoTracked: false },
    { id: 'ds-5', title: 'SDAIA T5 Bootcamp', titleAr: 'معسكر سدايا T5', type: 'cert', status: 'upcoming', duration: '12 weeks', autoTracked: false },
    { id: 'ds-6', title: 'Kaggle Competition Entry', titleAr: 'المشاركة في مسابقة Kaggle', type: 'activity', status: 'upcoming', duration: '4 weeks', autoTracked: false },
    { id: 'ds-7', title: 'Data Co-op at Saudi Aramco', titleAr: 'تدريب تعاوني في بيانات أرامكو', type: 'coop', status: 'upcoming', duration: '6 months', autoTracked: false },
  ],
  'project-manager': [
    { id: 'pm-1', title: 'Agile Foundations Workshop', titleAr: 'ورشة أساسيات Agile', type: 'workshop', status: 'completed', duration: '6 hours', completedAt: '2025-09-22', autoTracked: true },
    { id: 'pm-2', title: 'Communication & Leadership', titleAr: 'التواصل والقيادة', type: 'course', status: 'completed', duration: '4 weeks', completedAt: '2025-11-15', autoTracked: true },
    { id: 'pm-3', title: 'PMP Exam Prep', titleAr: 'الإعداد لشهادة PMP', type: 'course', status: 'in_progress', duration: '8 weeks', autoTracked: true },
    { id: 'pm-4', title: 'PMP Certification', titleAr: 'شهادة PMP', type: 'cert', status: 'upcoming', duration: 'exam', autoTracked: false },
    { id: 'pm-5', title: 'Scrum Master Certificate', titleAr: 'شهادة Scrum Master', type: 'cert', status: 'upcoming', duration: '2 weeks', autoTracked: false },
    { id: 'pm-6', title: 'Student Council Leadership', titleAr: 'قيادة المجلس الطلابي', type: 'activity', status: 'upcoming', duration: '1 academic year', autoTracked: false },
    { id: 'pm-7', title: 'Project Co-op at Elm', titleAr: 'تدريب تعاوني في علم', type: 'coop', status: 'upcoming', duration: '6 months', autoTracked: false },
  ],

  // ─── RIASEC catalog slugs (the actual ids the assessment writes) ───
  // The riasec catalog uses slugs like `software_engineering`, so when
  // savedAnalysis.top_match arrives it lands on these entries directly.

  software_engineering: [
    { id: 'cs-1', title: 'Problem Solving Foundations', titleAr: 'أساسيات حل المشكلات', type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-09-15', autoTracked: true  },
    { id: 'cs-2', title: 'Python Programming',          titleAr: 'برمجة بايثون',           type: 'cert',     status: 'completed',   duration: '6 weeks',  completedAt: '2025-11-08', autoTracked: true  },
    { id: 'cs-3', title: 'Web Development Bootcamp',    titleAr: 'معسكر تطوير الويب',      type: 'course',   status: 'in_progress', duration: '10 weeks',                            autoTracked: true  },
    { id: 'cs-4', title: 'IELTS — Academic English',    titleAr: 'اختبار IELTS الأكاديمي', type: 'cert',     status: 'upcoming',    duration: '3 months',                            autoTracked: false },
    { id: 'cs-5', title: 'CompTIA A+ Certification',    titleAr: 'شهادة CompTIA A+',       type: 'cert',     status: 'upcoming',    duration: '2 months',                            autoTracked: false },
    { id: 'cs-6', title: 'Hackathon Participation',     titleAr: 'المشاركة في هاكاثون',    type: 'activity', status: 'upcoming',    duration: '1 weekend',                           autoTracked: true  },
    { id: 'cs-7', title: 'Co-op Training Placement',    titleAr: 'التدريب التعاوني',        type: 'coop',     status: 'upcoming',    duration: '6 months',                            autoTracked: false },
    { id: 'cs-8', title: 'AWS Cloud Practitioner',      titleAr: 'شهادة AWS Cloud Practitioner', type: 'cert', status: 'upcoming',  duration: '6 weeks',                             autoTracked: false },
  ],

  data_science_ai: [
    { id: 'ds-1', title: 'Statistics Fundamentals',                  titleAr: 'أساسيات الإحصاء',                              type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-10-02', autoTracked: true  },
    { id: 'ds-2', title: 'SQL for Analytics',                        titleAr: 'SQL للتحليلات',                                type: 'course',   status: 'completed',   duration: '3 weeks',  completedAt: '2025-12-18', autoTracked: true  },
    { id: 'ds-3', title: 'Python for Data Science',                  titleAr: 'بايثون لعلم البيانات',                          type: 'course',   status: 'in_progress', duration: '6 weeks',                            autoTracked: true  },
    { id: 'ds-4', title: 'Machine Learning with Scikit-learn',       titleAr: 'تعلم الآلة باستخدام Scikit-learn',              type: 'course',   status: 'upcoming',    duration: '8 weeks',                            autoTracked: false },
    { id: 'ds-5', title: 'SDAIA T5 Bootcamp',                        titleAr: 'معسكر سدايا T5',                                type: 'cert',     status: 'upcoming',    duration: '12 weeks',                           autoTracked: false },
    { id: 'ds-6', title: 'Arabic NLP Workshop',                      titleAr: 'ورشة معالجة اللغة العربية',                      type: 'workshop', status: 'upcoming',    duration: '2 weekends',                         autoTracked: true  },
    { id: 'ds-7', title: 'Kaggle Competition Entry',                 titleAr: 'المشاركة في مسابقة Kaggle',                     type: 'activity', status: 'upcoming',    duration: '4 weeks',                            autoTracked: false },
    { id: 'ds-8', title: 'Data Co-op at SDAIA',                      titleAr: 'تدريب تعاوني في سدايا',                          type: 'coop',     status: 'upcoming',    duration: '6 months',                           autoTracked: false },
  ],

  business_entrepreneurship: [
    { id: 'ba-1', title: 'Business Communication Skills',            titleAr: 'مهارات التواصل التجاري',                        type: 'course',   status: 'completed',   duration: '3 weeks',  completedAt: '2025-09-20', autoTracked: true  },
    { id: 'ba-2', title: 'Excel & Data Analysis',                    titleAr: 'Excel وتحليل البيانات',                         type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-11-12', autoTracked: true  },
    { id: 'ba-3', title: 'IELTS / TOEFL',                            titleAr: 'IELTS / TOEFL',                                  type: 'cert',     status: 'in_progress', duration: '3 months',                           autoTracked: false },
    { id: 'ba-4', title: 'Project Management Fundamentals (PMF)',    titleAr: 'أساسيات إدارة المشاريع',                        type: 'cert',     status: 'upcoming',    duration: '5 weeks',                            autoTracked: false },
    { id: 'ba-5', title: 'Student Club Leadership Role',             titleAr: 'دور قيادي في نادٍ طلابي',                       type: 'activity', status: 'upcoming',    duration: '1 semester',                         autoTracked: true  },
    { id: 'ba-6', title: 'Co-op at Saudi National Bank',             titleAr: 'تدريب تعاوني في البنك الأهلي السعودي',          type: 'coop',     status: 'upcoming',    duration: '6 months',                           autoTracked: false },
    { id: 'ba-7', title: 'PMP Certification Track',                  titleAr: 'مسار شهادة PMP',                                 type: 'cert',     status: 'upcoming',    duration: '3 months',                           autoTracked: false },
    { id: 'ba-8', title: 'Misk Future Foundation Programme',         titleAr: 'برنامج مؤسسة مسك للمستقبل',                     type: 'activity', status: 'upcoming',    duration: '6 months',                           autoTracked: false },
  ],

  mechanical_engineering: [
    { id: 'eng-1', title: 'AutoCAD Fundamentals',                    titleAr: 'أساسيات AutoCAD',                                type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-09-25', autoTracked: true  },
    { id: 'eng-2', title: 'Engineering Problem Solving',             titleAr: 'حل المشكلات الهندسية',                          type: 'course',   status: 'completed',   duration: '3 weeks',  completedAt: '2025-11-05', autoTracked: true  },
    { id: 'eng-3', title: 'IELTS Academic',                          titleAr: 'IELTS الأكاديمي',                                type: 'cert',     status: 'in_progress', duration: '3 months',                           autoTracked: false },
    { id: 'eng-4', title: 'SOLIDWORKS Certification',                titleAr: 'شهادة SOLIDWORKS',                               type: 'cert',     status: 'upcoming',    duration: '6 weeks',                            autoTracked: false },
    { id: 'eng-5', title: 'MATLAB / Simulink Workshop',              titleAr: 'ورشة MATLAB / Simulink',                         type: 'workshop', status: 'upcoming',    duration: '2 weeks',                            autoTracked: true  },
    { id: 'eng-6', title: 'Innovation Lab Project',                  titleAr: 'مشروع في مختبر الابتكار',                        type: 'activity', status: 'upcoming',    duration: '1 semester',                         autoTracked: true  },
    { id: 'eng-7', title: 'Co-op Training at SABIC',                 titleAr: 'تدريب تعاوني في سابك',                            type: 'coop',     status: 'upcoming',    duration: '6 months',                           autoTracked: false },
    { id: 'eng-8', title: 'Saudi Council of Engineers Membership',   titleAr: 'عضوية الهيئة السعودية للمهندسين',                type: 'cert',     status: 'upcoming',    duration: 'post-grad',                          autoTracked: false },
  ],

  healthcare_medicine: [
    { id: 'med-1', title: 'Anatomy & Physiology',                    titleAr: 'علم التشريح ووظائف الأعضاء',                    type: 'course',   status: 'completed',   duration: '8 weeks',  completedAt: '2025-09-30', autoTracked: true  },
    { id: 'med-2', title: 'Medical Terminology',                     titleAr: 'المصطلحات الطبية',                               type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-11-18', autoTracked: true  },
    { id: 'med-3', title: 'Basic Life Support (BLS) Certification',  titleAr: 'شهادة دعم الحياة الأساسي',                      type: 'cert',     status: 'in_progress', duration: '1 weekend',                          autoTracked: true  },
    { id: 'med-4', title: 'IELTS Academic / OET Medicine',           titleAr: 'IELTS الأكاديمي / OET للطب',                    type: 'cert',     status: 'upcoming',    duration: '3 months',                           autoTracked: false },
    { id: 'med-5', title: 'Clinical Rotation — Year 1',              titleAr: 'التدوير السريري — السنة الأولى',                type: 'activity', status: 'upcoming',    duration: '1 semester',                         autoTracked: false },
    { id: 'med-6', title: 'SMLE Step 1 Preparation',                 titleAr: 'الإعداد للهيئة السعودية الخطوة 1',              type: 'course',   status: 'upcoming',    duration: '6 months',                           autoTracked: false },
    { id: 'med-7', title: 'Hospital Internship',                     titleAr: 'تدريب المستشفى',                                  type: 'coop',     status: 'upcoming',    duration: '12 months',                          autoTracked: false },
    { id: 'med-8', title: 'Saudi Medical Licence (SCFHS)',           titleAr: 'الترخيص الطبي السعودي (الهيئة الصحية)',         type: 'cert',     status: 'upcoming',    duration: 'post-grad',                          autoTracked: false },
  ],

  education_teaching: [
    { id: 'ed-1', title: 'Foundations of Teaching',                  titleAr: 'أسس التدريس',                                    type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-09-28', autoTracked: true  },
    { id: 'ed-2', title: 'Classroom Management',                     titleAr: 'إدارة الفصل',                                    type: 'course',   status: 'completed',   duration: '3 weeks',  completedAt: '2025-11-10', autoTracked: true  },
    { id: 'ed-3', title: 'Educational Psychology',                   titleAr: 'علم النفس التربوي',                              type: 'course',   status: 'in_progress', duration: '6 weeks',                            autoTracked: true  },
    { id: 'ed-4', title: 'CELTA / TESOL Certification',              titleAr: 'شهادة CELTA / TESOL',                            type: 'cert',     status: 'upcoming',    duration: '4 weeks',                            autoTracked: false },
    { id: 'ed-5', title: 'Microteaching Workshop',                   titleAr: 'ورشة التدريس المصغّر',                            type: 'workshop', status: 'upcoming',    duration: '2 weekends',                         autoTracked: true  },
    { id: 'ed-6', title: 'School Practicum (Field Training)',        titleAr: 'التدريب الميداني المدرسي',                       type: 'coop',     status: 'upcoming',    duration: '1 semester',                         autoTracked: false },
    { id: 'ed-7', title: 'Hifz / Tarbawi Certification',             titleAr: 'شهادة الحفظ / التربوي',                          type: 'cert',     status: 'upcoming',    duration: 'flexible',                           autoTracked: false },
    { id: 'ed-8', title: 'Teacher Licensing (Hayat / ETEC)',         titleAr: 'رخصة المعلم (هيئة تقويم التعليم)',               type: 'cert',     status: 'upcoming',    duration: 'post-grad',                          autoTracked: false },
  ],

  film_media_gaming: [
    { id: 'med-1m', title: 'Adobe Creative Suite Fundamentals',      titleAr: 'أساسيات Adobe Creative Suite',                    type: 'course',   status: 'completed',   duration: '6 weeks',  completedAt: '2025-10-01', autoTracked: true  },
    { id: 'med-2m', title: 'Digital Storytelling',                   titleAr: 'السرد الرقمي',                                    type: 'course',   status: 'completed',   duration: '4 weeks',  completedAt: '2025-11-22', autoTracked: true  },
    { id: 'med-3m', title: 'Video Production Workshop',              titleAr: 'ورشة الإنتاج المرئي',                             type: 'workshop', status: 'in_progress', duration: '3 weeks',                            autoTracked: true  },
    { id: 'med-4m', title: 'Build a Public Portfolio',               titleAr: 'بناء معرض أعمال علني',                            type: 'activity', status: 'upcoming',    duration: '1 semester',                         autoTracked: true  },
    { id: 'med-5m', title: 'Adobe Certified Professional',           titleAr: 'شهادة Adobe Certified Professional',              type: 'cert',     status: 'upcoming',    duration: '6 weeks',                            autoTracked: false },
    { id: 'med-6m', title: 'Co-op at MBC Group',                     titleAr: 'تدريب تعاوني في مجموعة MBC',                     type: 'coop',     status: 'upcoming',    duration: '4 months',                           autoTracked: false },
    { id: 'med-7m', title: 'Film Festival Submission',               titleAr: 'تقديم فيلم لمهرجان',                              type: 'activity', status: 'upcoming',    duration: 'flexible',                           autoTracked: false },
    { id: 'med-8m', title: 'Saudi Media Council Membership',         titleAr: 'عضوية هيئة الإعلام',                              type: 'cert',     status: 'upcoming',    duration: 'post-grad',                          autoTracked: false },
  ],

  finance_banking: [
    { id: 'fin-1', title: 'Financial Accounting Foundations',        titleAr: 'أساسيات المحاسبة المالية',                       type: 'course',   status: 'completed',   duration: '5 weeks',  completedAt: '2025-09-18', autoTracked: true  },
    { id: 'fin-2', title: 'Excel for Finance',                       titleAr: 'Excel للمالية',                                  type: 'course',   status: 'completed',   duration: '3 weeks',  completedAt: '2025-11-02', autoTracked: true  },
    { id: 'fin-3', title: 'Bloomberg Market Concepts',               titleAr: 'مفاهيم السوق من Bloomberg',                      type: 'cert',     status: 'in_progress', duration: '8 hours',                            autoTracked: true  },
    { id: 'fin-4', title: 'CFA Level 1 Preparation',                 titleAr: 'الإعداد لـ CFA المستوى الأول',                   type: 'course',   status: 'upcoming',    duration: '6 months',                           autoTracked: false },
    { id: 'fin-5', title: 'IELTS Academic',                          titleAr: 'IELTS الأكاديمي',                                 type: 'cert',     status: 'upcoming',    duration: '3 months',                           autoTracked: false },
    { id: 'fin-6', title: 'Investment Club Activity',                titleAr: 'نشاط نادي الاستثمار',                             type: 'activity', status: 'upcoming',    duration: '1 semester',                         autoTracked: true  },
    { id: 'fin-7', title: 'Co-op at Saudi National Bank',            titleAr: 'تدريب تعاوني في البنك الأهلي',                   type: 'coop',     status: 'upcoming',    duration: '6 months',                           autoTracked: false },
    { id: 'fin-8', title: 'CME-1 (Saudi Capital Market) Licence',    titleAr: 'رخصة سوق المال السعودي CME-1',                   type: 'cert',     status: 'upcoming',    duration: 'post-grad',                          autoTracked: false },
  ],

  default: [
    { id: 'def-1', title: 'Career Discovery Workshop', titleAr: 'ورشة اكتشاف المسار المهني', type: 'workshop', status: 'completed', duration: '4 hours', completedAt: '2025-10-01', autoTracked: true },
    { id: 'def-2', title: 'Communication Skills Course', titleAr: 'دورة مهارات التواصل', type: 'course', status: 'in_progress', duration: '4 weeks', autoTracked: true },
    { id: 'def-3', title: 'IELTS Preparation', titleAr: 'الإعداد لـ IELTS', type: 'cert', status: 'upcoming', duration: '6 weeks', autoTracked: false },
    { id: 'def-4', title: 'University Innovation Activity', titleAr: 'نشاط الابتكار الجامعي', type: 'activity', status: 'upcoming', duration: '1 month', autoTracked: false },
    { id: 'def-5', title: 'Career Fair Attendance', titleAr: 'حضور معرض الوظائف', type: 'activity', status: 'upcoming', duration: '2 days', autoTracked: false },
    { id: 'def-6', title: 'Co-op Training Placement', titleAr: 'تدريب تعاوني', type: 'coop', status: 'upcoming', duration: '6 months', autoTracked: false },
  ],
}

export interface AlumniProfile {
  id: string
  name: string
  nameAr: string
  graduationYear: number
  currentEmployer: string
  currentEmployerAr?: string
  currentPosition: string
  currentPositionAr?: string
  isEmployed: boolean
  careerPath: string
  careerPathAr?: string
  avatarEmoji: string
}

export const alumni: AlumniProfile[] = [
  { id: 'al-1', name: 'Khalid Al-Mansour', nameAr: 'خالد المنصور', graduationYear: 2023, currentEmployer: 'Saudi Aramco', currentEmployerAr: 'أرامكو السعودية', currentPosition: 'Software Engineer', currentPositionAr: 'مهندس برمجيات', isEmployed: true, careerPath: 'Software Engineering', careerPathAr: 'هندسة البرمجيات', avatarEmoji: '' },
  { id: 'al-2', name: 'Sara Al-Otaibi', nameAr: 'سارة العتيبي', graduationYear: 2022, currentEmployer: 'STC', currentEmployerAr: 'الاتصالات السعودية', currentPosition: 'Data Scientist', currentPositionAr: 'عالمة بيانات', isEmployed: true, careerPath: 'Data Science', careerPathAr: 'علم البيانات', avatarEmoji: '' },
  { id: 'al-3', name: 'Abdulaziz Al-Harbi', nameAr: 'عبدالعزيز الحربي', graduationYear: 2024, currentEmployer: 'Elm', currentEmployerAr: 'علم', currentPosition: 'Product Manager', currentPositionAr: 'مدير منتج', isEmployed: true, careerPath: 'Product Management', careerPathAr: 'إدارة المنتجات', avatarEmoji: '' },
  { id: 'al-4', name: 'Noura Al-Qahtani', nameAr: 'نورة القحطاني', graduationYear: 2023, currentEmployer: 'NEOM', currentEmployerAr: 'نيوم', currentPosition: 'UX Designer', currentPositionAr: 'مصممة تجربة مستخدم', isEmployed: true, careerPath: 'UX Design', careerPathAr: 'تصميم تجربة المستخدم', avatarEmoji: '' },
  { id: 'al-5', name: 'Mohammed Al-Ghamdi', nameAr: 'محمد الغامدي', graduationYear: 2024, currentEmployer: 'Job seeking', currentEmployerAr: 'يبحث عن عمل', currentPosition: 'Recent Graduate', currentPositionAr: 'خريج حديث', isEmployed: false, careerPath: 'Cybersecurity', careerPathAr: 'الأمن السيبراني', avatarEmoji: '' },
  { id: 'al-6', name: 'Lina Al-Saleh', nameAr: 'لينا الصالح', graduationYear: 2022, currentEmployer: 'SABIC', currentEmployerAr: 'سابك', currentPosition: 'Process Engineer', currentPositionAr: 'مهندسة عمليات', isEmployed: true, careerPath: 'Engineering', careerPathAr: 'الهندسة', avatarEmoji: '' },
  { id: 'al-7', name: 'Faisal Al-Dossari', nameAr: 'فيصل الدوسري', graduationYear: 2023, currentEmployer: 'Banque Saudi Fransi', currentEmployerAr: 'البنك السعودي الفرنسي', currentPosition: 'Financial Analyst', currentPositionAr: 'محلل مالي', isEmployed: true, careerPath: 'Finance', careerPathAr: 'المالية', avatarEmoji: '' },
  { id: 'al-8', name: 'Reem Al-Zahrani', nameAr: 'ريم الزهراني', graduationYear: 2024, currentEmployer: 'SDAIA', currentEmployerAr: 'سدايا', currentPosition: 'AI Research Associate', currentPositionAr: 'باحثة ذكاء اصطناعي', isEmployed: true, careerPath: 'AI Research', careerPathAr: 'أبحاث الذكاء الاصطناعي', avatarEmoji: '' },
]

export interface AlumniAnnouncement {
  id: string
  title: string
  titleAr: string
  body: string
  bodyAr: string
  date: string
}

export const alumniAnnouncements: AlumniAnnouncement[] = [
  {
    id: 'ann-1',
    title: 'Annual Alumni Career Forum 2026',
    titleAr: 'منتدى الخريجين المهني السنوي 2026',
    body: 'Join us on May 15 for the annual gathering featuring 30+ employers, panels with senior alumni, and on-the-spot interviews.',
    bodyAr: 'انضم إلينا في 15 مايو لحضور التجمع السنوي الذي يضم أكثر من 30 جهة توظيف، وجلسات مع خريجين بارزين، ومقابلات فورية.',
    date: '2026-05-15',
  },
  {
    id: 'ann-2',
    title: 'New Mentorship Program Launch',
    titleAr: 'إطلاق برنامج الإرشاد الجديد',
    body: 'Senior alumni can now sign up to mentor current students through structured 6-month programs covering CV reviews, mock interviews, and career advice.',
    bodyAr: 'يمكن للخريجين البارزين الآن التسجيل لإرشاد الطلاب الحاليين عبر برامج منظمة لمدة 6 أشهر تشمل مراجعة السير الذاتية، والمقابلات التجريبية، والاستشارات المهنية.',
    date: '2026-04-12',
  },
  {
    id: 'ann-3',
    title: 'Alumni Employment Survey',
    titleAr: 'استبيان توظيف الخريجين',
    body: 'Help us improve career services. Share your post-graduation employment status — takes only 3 minutes.',
    bodyAr: 'ساعدنا في تحسين خدمات التوظيف. شاركنا حالتك المهنية بعد التخرج — يستغرق 3 دقائق فقط.',
    date: '2026-03-28',
  },
]

// Auto-tracked achievements aggregate — surfaced on the Skills Record banner
// and the Student Dashboard's "auto-tracked achievements" card.
export const autoTrackedAchievements = {
  courses: 4,
  certifications: 2,
  activities: 3,
  total: 9,
}
