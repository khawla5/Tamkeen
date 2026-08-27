/* Dev-data: fill student@ministry.gov.example's CV with plausible English
   dummy content (D-050: the CV body is English; proper nouns pass through). */

const API = 'http://localhost:4000';
const ORIGIN = 'http://localhost:3000';
const EMAIL = 'student@ministry.gov.example';
const PASSWORD = 'Student_Tamkeen_2026!';

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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
const current = await call('GET', '/cv');

const profile = {
  ...current.profile,
  jobTitle: 'Administrative Officer',
  phone: '+966 55 123 4567',
  summary:
    'Administrative officer with six years of experience in government operations, records management, and internal communication. Currently developing skills in digital content and institutional communication through the ministry training platform. Known for accuracy, follow-through, and clear reporting.',
  experience: [
    {
      id: 'exp-1',
      role: 'Administrative Officer',
      organization: 'Ministry of Interior — General Directorate of Training',
      startDate: '2022-03',
      endDate: null,
      description:
        'Coordinate training logistics for 300+ employees per quarter, maintain departmental records, and prepare weekly status reports for the directorate.',
    },
    {
      id: 'exp-2',
      role: 'Records Clerk',
      organization: 'Ministry of Interior — Civil Affairs',
      startDate: '2019-06',
      endDate: '2022-02',
      description:
        'Digitised and indexed over 12,000 paper records, cutting average retrieval time from days to minutes; trained two new clerks on the archiving system.',
    },
  ],
  education: [
    {
      id: 'edu-1',
      qualification: 'Bachelor of Public Administration',
      institution: 'King Saud University',
      startYear: 2014,
      endYear: 2018,
    },
    {
      id: 'edu-2',
      qualification: 'Diploma in Office Management',
      institution: 'Technical and Vocational Training Corporation',
      startYear: 2018,
      endYear: 2019,
    },
  ],
  skills: [
    'Records management',
    'Report writing',
    'Microsoft Office',
    'Internal communication',
    'Scheduling and logistics',
    'Arabic-English correspondence',
  ],
  externalCertifications: [
    {
      id: 'cert-1',
      title: 'ICDL — International Computer Driving Licence',
      issuer: 'ICDL Arabia',
      issuedOn: '2020-11',
    },
    {
      id: 'cert-2',
      title: 'Effective Business Writing',
      issuer: 'Institute of Public Administration',
      issuedOn: '2023-05',
    },
  ],
  showCareerProfile: true,
};

const saved = await call('PUT', '/cv', profile);
console.log('saved CV for', saved.profile.fullName || EMAIL);
console.log(
  `experience ${saved.profile.experience.length} · education ${saved.profile.education.length} · skills ${saved.profile.skills.length} · external certs ${saved.profile.externalCertifications.length} · platform certs ${saved.platformCertifications.length}`,
);
