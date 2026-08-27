/* Dev-data script: five Arabic courses published into both A-letter paths
   (المحتوى الرقمي والتصميم + الاتصال المؤسسي والتوعية), driven through the real
   entity API so ownership, LMS creation and the publish gate all run for real.
   Content is added afterwards by infra/moodle/moodle-demo-content.php. */

const API = 'http://localhost:4000';
const ORIGIN = 'http://localhost:3000';
const ENTITY_EMAIL = 'entity@authority.gov.example';
const ENTITY_PASSWORD = process.env.SEED_ENTITY_PASSWORD || 'AmJ5mUG_aqwDX2XFCxiRRV0L';

const PATH_IDS = [
  'b9aaafa4-2038-47d5-9f29-5ef921392288', // المحتوى الرقمي والتصميم (A)
  'a651c872-2c85-429a-93b8-642e300688b1', // الاتصال المؤسسي والتوعية (A)
];

const COURSES = [
  {
    title: 'أساسيات التصميم الجرافيكي للجهات الحكومية',
    summary:
      'مدخل عملي إلى مبادئ التصميم الجرافيكي — التكوين، الألوان، الخطوط العربية — وتطبيقها على مواد الوزارة المطبوعة والرقمية.',
    durationMinutes: 360,
    objectives: [
      'التعرف على مبادئ التكوين البصري والتسلسل الهرمي للمعلومة',
      'اختيار الألوان والخطوط بما يتوافق مع الهوية المؤسسية',
      'إنتاج تصميم إعلاني بسيط جاهز للنشر',
    ],
    prerequisites: null,
  },
  {
    title: 'كتابة المحتوى الرقمي للمنصات الحكومية',
    summary:
      'صياغة محتوى عربي واضح وموجز للمواقع والتطبيقات الحكومية: لغة المخاطبة الرسمية، البنية، وقابلية القراءة.',
    durationMinutes: 300,
    objectives: [
      'كتابة نصوص رقمية بلغة مؤسسية واضحة',
      'هيكلة الصفحة الرقمية حسب أولوية المعلومة',
      'مراجعة المحتوى وتدقيقه قبل النشر',
    ],
    prerequisites: null,
  },
  {
    title: 'إنتاج الفيديو التوعوي القصير',
    summary:
      'من الفكرة إلى النشر: كتابة السيناريو، التصوير بإمكانات بسيطة، والمونتاج الأساسي لإنتاج مقطع توعوي لا يتجاوز الدقيقتين.',
    durationMinutes: 420,
    objectives: [
      'كتابة سيناريو توعوي قصير ومحدد الرسالة',
      'تصوير لقطات صالحة للاستخدام بأدوات متاحة',
      'إخراج مقطع نهائي بمونتاج أساسي',
    ],
    prerequisites: 'يفضَّل إتمام دورة أساسيات التصميم الجرافيكي أو خبرة مكافئة.',
  },
  {
    title: 'إدارة حسابات التواصل الاجتماعي المؤسسية',
    summary:
      'تشغيل الحسابات الرسمية: خطة النشر، صياغة المنشور المؤسسي، التعامل مع التفاعل، وقياس الأثر بمؤشرات بسيطة.',
    durationMinutes: 300,
    objectives: [
      'إعداد خطة نشر أسبوعية لحساب رسمي',
      'صياغة منشورات مؤسسية بحسب المنصة',
      'قراءة مؤشرات التفاعل والاستفادة منها',
    ],
    prerequisites: null,
  },
  {
    title: 'تصميم الحملات التوعوية والهوية البصرية',
    summary:
      'بناء حملة توعوية متكاملة: الرسالة، الجمهور، الهوية البصرية الموحدة عبر المواد، وجدولة الإطلاق والقياس.',
    durationMinutes: 480,
    objectives: [
      'تحديد رسالة الحملة وجمهورها المستهدف',
      'توحيد الهوية البصرية عبر مواد الحملة',
      'إعداد خطة إطلاق وقياس أثر الحملة',
    ],
    prerequisites: 'الإلمام بأساسيات التصميم الجرافيكي وكتابة المحتوى الرقمي.',
  },
];

// ── tiny cookie-jar fetch ────────────────────────────────────────────────────
const jar = new Map();
let csrf = null;

function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}

async function call(method, path, body) {
  if (!csrf && method !== 'GET') {
    const r = await fetch(`${API}/api/auth/csrf`, { headers: { Origin: ORIGIN } });
    storeCookies(r);
    csrf = (await r.json()).csrfToken;
  }
  const headers = {
    Origin: ORIGIN,
    Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
  };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  storeCookies(res);
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

// ── flow ─────────────────────────────────────────────────────────────────────
const phase = process.argv[2] || 'create';

if (phase === 'create') {
  await call('POST', '/auth/login', { email: ENTITY_EMAIL, password: ENTITY_PASSWORD });
  const created = [];
  for (const c of COURSES) {
    const course = await call('POST', '/entity/courses', {
      title: c.title,
      summary: c.summary,
      language: 'AR',
    });
    created.push({ id: course.id, moodleCourseId: course.moodleCourseId, title: c.title });
    console.log(`created ${course.moodleCourseId}  ${c.title}`);
  }
  console.log('IDS=' + JSON.stringify(created));
} else if (phase === 'publish') {
  await call('POST', '/auth/login', { email: ENTITY_EMAIL, password: ENTITY_PASSWORD });
  const created = JSON.parse(process.env.CREATED_IDS);
  for (const { id, title } of created) {
    const meta = COURSES.find((c) => c.title === title);
    await call('PATCH', `/entity/courses/${id}`, {
      pathIds: PATH_IDS,
      durationMinutes: meta.durationMinutes,
      objectives: meta.objectives,
      prerequisites: meta.prerequisites,
      language: 'AR',
    });
    const detail = await call('POST', `/entity/courses/${id}/publish`);
    console.log(`published ${title}: ${detail.publication} / ${detail.status}`);
  }
}
