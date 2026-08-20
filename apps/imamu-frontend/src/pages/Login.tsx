import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Compass,
  Target,
  FileText,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  User,
  GraduationCap,
  Briefcase,
  Building2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Globe,
  MapPin,
  Calendar,
  Hash,
  Clock,
  Layers,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useAuth, type Role } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/context";
import { cn } from "@/lib/utils";
import {
  SignInSchema,
  SignUpBasicSchema,
  flattenErrors,
  type FieldErrors,
} from "@/lib/validation";
import { FieldError } from "@/components/ui/FieldError";
import TamkeenLogo from "@/components/TamkeenLogo";

/* ── Role definitions ─────────────────────────────────────── */
// Retiree + Employee are HIDDEN from the Tamkeen UI but kept as valid Role
// values for future re-enable; they are intentionally not in this displayed list.
const roleOptions: {
  role: Role;
  icon: typeof GraduationCap;
  color: string;
  bg: string;
  border: string;
  activeBg: string;
}[] = [
  {
    role: "student",
    icon: GraduationCap,
    color: "text-teal",
    bg: "bg-teal/10",
    border: "border-teal/30",
    activeBg: "bg-teal",
  },
  {
    role: "company",
    icon: Building2,
    color: "text-teal-dark",
    bg: "bg-teal-dark/10",
    border: "border-teal-dark/30",
    activeBg: "bg-teal-dark",
  },
  {
    role: "university",
    icon: BookOpen,
    color: "text-imamu-gold-deep",
    bg: "bg-imamu-gold/10",
    border: "border-imamu-gold/40",
    activeBg: "bg-imamu-gold",
  },
  {
    role: "provider",
    icon: User,
    color: "text-info",
    bg: "bg-info/10",
    border: "border-info/30",
    activeBg: "bg-info",
  },
];

const roleLabels: Record<
  Role,
  { en: string; ar: string; descEn: string; descAr: string }
> = {
  student: {
    en: "Student",
    ar: "طالب",
    descEn: "Looking for opportunities & career guidance",
    descAr: "أبحث عن فرص وتوجيه مهني",
  },
  // Hidden roles — kept in the map so Role union remains valid; never rendered.
  retiree: {
    en: "Retiree",
    ar: "متقاعد",
    descEn: "Share expertise through consulting & mentoring",
    descAr: "مشاركة الخبرة من خلال الاستشارات والتوجيه",
  },
  employee: {
    en: "Employee",
    ar: "موظف",
    descEn: "Grow your career, track goals & upskill",
    descAr: "طوّر مسيرتك المهنية وتابع أهدافك ومهاراتك",
  },
  company: {
    en: "Employer",
    ar: "جهة توظيف",
    descEn: "Post jobs & find qualified talent",
    descAr: "نشر الوظائف وإيجاد الكفاءات",
  },
  university: {
    en: "University",
    ar: "جامعة",
    descEn: "Track student readiness & co-op partnerships",
    descAr: "تتبع جاهزية الطلاب وشراكات التدريب",
  },
  provider: {
    en: "Training Provider",
    ar: "جهة تدريبية",
    descEn: "List courses & track enrollments",
    descAr: "إدراج الدورات ومتابعة التسجيلات",
  },
};

/* ── Demo accounts ────────────────────────────────────────── */
// Retiree + Employee demo accounts are hidden in the Tamkeen UI quick-fill but
// the seeded users still exist in Supabase, so admins can sign in manually.
// Quick-fill buttons show the ROLE only — never company/person names. The
// specific display names appear inside the app after login.
const demoAccounts: {
  role: Role;
  name: string;
  nameAr: string;
  email: string;
}[] = [
  {
    role: "student",
    name: "Student",
    nameAr: "طالب",
    email: "ahmed@demo.tamkeen.sa",
  },
  {
    role: "company",
    name: "Employer",
    nameAr: "جهة توظيف",
    email: "sdaia@demo.tamkeen.sa",
  },
  {
    role: "university",
    name: "University",
    nameAr: "الجامعة",
    email: "imsiu@demo.tamkeen.sa",
  },
  {
    role: "provider",
    name: "Training provider",
    nameAr: "جهة تدريب",
    email: "zaka@demo.tamkeen.sa",
  },
];

/* ── Feature items for left panel ─────────────────────────── */
const features = [
  { icon: Target, key: "featureMatching" as const },
  { icon: FileText, key: "featureCVBuilder" as const },
  { icon: ShieldCheck, key: "featureOpps" as const },
];

/* ── Geometric Pattern SVG ────────────────────────────────── */
function GeometricPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.06]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="geo"
          x="0"
          y="0"
          width="80"
          height="80"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M40 0L80 40L40 80L0 40Z"
            fill="none"
            stroke="white"
            strokeWidth="0.5"
          />
          <circle
            cx="40"
            cy="40"
            r="12"
            fill="none"
            stroke="white"
            strokeWidth="0.5"
          />
          <path
            d="M20 20L60 20L60 60L20 60Z"
            fill="none"
            stroke="white"
            strokeWidth="0.3"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#geo)" />
    </svg>
  );
}

/* ── Step Progress Bar ────────────────────────────────────── */
function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-100"
        >
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-200"
            style={{ width: i < current ? "100%" : i === current ? "50%" : "0%" }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────── */
export default function Login() {
  const { signIn, signUp } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function clearField(name: string) {
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _omit, ...rest } = prev;
      void _omit;
      return rest;
    });
  }
  const { t, lang, setLang, isArabic } = useLanguage();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isSignupRoute = location.pathname === "/signup";
  const derivedMode = isSignupRoute ? "signup" : "signin";
  const [modeOverride, setModeOverride] = useState<"signin" | "signup" | null>(
    null,
  );
  const mode = modeOverride ?? derivedMode;

  // Check for pre-selected role from URL query param (e.g. /signup?role=student)
  // Public-facing role list excludes hidden roles (retiree/employee) so a
  // direct ?role=retiree URL doesn't preselect a hidden option.
  const validRoles: Role[] = ["student", "company", "university", "provider"];
  const roleParam = searchParams.get("role") as Role | null;
  const preselectedRole =
    roleParam && validRoles.includes(roleParam) ? roleParam : null;

  // Shared state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullNameEn, setFullNameEn] = useState("");
  const [fullNameAr, setFullNameAr] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role | null>(
    preselectedRole,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Multi-step signup state
  const [signupStep, setSignupStep] = useState(0); // 0=role, 1=basic, 2=role-specific

  // Role-specific fields
  const [roleFields, setRoleFields] = useState<Record<string, string>>({});

  function updateRoleField(key: string, value: string) {
    setRoleFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = SignInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(flattenErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const { error: signInError } = await signIn(
      parsed.data.email.trim(),
      parsed.data.password,
    );
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
    }
  }

  async function handleSignupSubmit() {
    setError("");
    if (!selectedRole) {
      setError(t("validation.roleRequired"));
      setSignupStep(0);
      return;
    }
    const parsed = SignUpBasicSchema.safeParse({
      email,
      password,
      fullNameEn,
      fullNameAr,
    });
    if (!parsed.success) {
      setFieldErrors(flattenErrors(parsed.error));
      setSignupStep(1);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const { error: signUpError } = await signUp({
      email: parsed.data.email.trim(),
      password: parsed.data.password,
      role: selectedRole,
      name: parsed.data.fullNameEn,
      nameAr: parsed.data.fullNameAr,
      roleFields,
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
    }
  }

  function quickFill(account: (typeof demoAccounts)[0]) {
    setEmail(account.email);
    setPassword("Demo1234!");
    setError("");
  }

  function switchMode(newMode: "signin" | "signup") {
    setModeOverride(newMode);
    setError("");
    setSignupStep(0);
  }

  function nextStep() {
    if (signupStep === 0 && !selectedRole) return;
    if (signupStep === 1) {
      const parsed = SignUpBasicSchema.safeParse({
        email,
        password,
        fullNameEn,
        fullNameAr,
      });
      if (!parsed.success) {
        setFieldErrors(flattenErrors(parsed.error));
        return;
      }
      setFieldErrors({});
    }
    if (signupStep < 2) setSignupStep((s) => s + 1);
    else handleSignupSubmit();
  }

  function prevStep() {
    if (signupStep > 0) setSignupStep((s) => s - 1);
  }

  /* ── Mount fade (de-AI: single short opacity fade, no stagger/slide) ── */
  const containerVariants = {
    hidden: {},
    visible: {},
  };
  const itemVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.18 } },
  };

  /* ── Role-specific fields renderer ──────────────────────── */
  function renderRoleFields() {
    if (!selectedRole) return null;

    const fields: {
      key: string;
      label: string;
      placeholder: string;
      icon: React.ReactNode;
      type?: string;
      options?: { value: string; label: string }[];
    }[] = (() => {
      switch (selectedRole) {
        case "student":
          return [
            {
              key: "university",
              label: t("login.university"),
              placeholder: t("login.universityPlaceholder"),
              icon: <GraduationCap className="w-4 h-4" />,
            },
            {
              key: "major",
              label: t("login.major"),
              placeholder: t("login.majorPlaceholder"),
              icon: <BookOpen className="w-4 h-4" />,
            },
            {
              key: "graduationYear",
              label: t("login.graduationYear"),
              placeholder: "2026",
              icon: <Calendar className="w-4 h-4" />,
              type: "number",
            },
            {
              key: "gpa",
              label: t("login.gpa"),
              placeholder: t("login.gpaPlaceholder"),
              icon: <Hash className="w-4 h-4" />,
            },
          ];
        case "retiree":
          return [
            {
              key: "industry",
              label: t("login.industry"),
              placeholder: t("login.industryPlaceholder"),
              icon: <Briefcase className="w-4 h-4" />,
            },
            {
              key: "yearsExperience",
              label: t("login.yearsExperience"),
              placeholder: "32",
              icon: <Clock className="w-4 h-4" />,
              type: "number",
            },
            {
              key: "expertise",
              label: t("login.expertise"),
              placeholder: t("login.expertisePlaceholder"),
              icon: <Layers className="w-4 h-4" />,
            },
            {
              key: "availability",
              label: t("login.availability"),
              placeholder: "",
              icon: <Clock className="w-4 h-4" />,
              options: [
                { value: "full-time", label: t("login.availabilityFullTime") },
                { value: "part-time", label: t("login.availabilityPartTime") },
                { value: "flexible", label: t("login.availabilityFlexible") },
              ],
            },
          ];
        case "employee":
          return [
            {
              key: "companyName",
              label: t("login.companyName"),
              placeholder: t("login.companyNamePlaceholder"),
              icon: <Building2 className="w-4 h-4" />,
            },
            {
              key: "jobTitle",
              label: isArabic ? "المسمى الوظيفي" : "Job Title",
              placeholder: isArabic
                ? "مثال: مهندس برمجيات"
                : "e.g. Software Engineer",
              icon: <Briefcase className="w-4 h-4" />,
            },
            {
              key: "department",
              label: isArabic ? "القسم" : "Department",
              placeholder: isArabic ? "مثال: الهندسة" : "e.g. Engineering",
              icon: <Layers className="w-4 h-4" />,
            },
            {
              key: "yearsExperience",
              label: t("login.yearsExperience"),
              placeholder: "3",
              icon: <Clock className="w-4 h-4" />,
              type: "number",
            },
          ];
        case "company":
          return [
            {
              key: "companyName",
              label: t("login.companyName"),
              placeholder: t("login.companyNamePlaceholder"),
              icon: <Building2 className="w-4 h-4" />,
            },
            {
              key: "companyIndustry",
              label: t("login.companyIndustry"),
              placeholder: t("login.companyIndustryPlaceholder"),
              icon: <Briefcase className="w-4 h-4" />,
            },
            {
              key: "companySize",
              label: t("login.companySize"),
              placeholder: "",
              icon: <User className="w-4 h-4" />,
              options: [
                { value: "1-10", label: "1–10" },
                { value: "11-50", label: "11–50" },
                { value: "51-200", label: "51–200" },
                { value: "201-500", label: "201–500" },
                { value: "500+", label: "500+" },
              ],
            },
            {
              key: "companyLocation",
              label: t("login.companyLocation"),
              placeholder: t("login.companyLocationPlaceholder"),
              icon: <MapPin className="w-4 h-4" />,
            },
          ];
        case "university":
          return [
            {
              key: "universityName",
              label: t("login.universityName"),
              placeholder: t("login.universityNamePlaceholder"),
              icon: <GraduationCap className="w-4 h-4" />,
            },
            {
              key: "universityLocation",
              label: t("login.universityLocation"),
              placeholder: t("login.universityLocationPlaceholder"),
              icon: <MapPin className="w-4 h-4" />,
            },
            {
              key: "totalStudents",
              label: t("login.totalStudents"),
              placeholder: t("login.totalStudentsPlaceholder"),
              icon: <User className="w-4 h-4" />,
              type: "number",
            },
          ];
        case "provider":
          return [
            {
              key: "academyName",
              label: t("login.academyName"),
              placeholder: t("login.academyNamePlaceholder"),
              icon: <BookOpen className="w-4 h-4" />,
            },
            {
              key: "totalCourses",
              label: t("login.totalCourses"),
              placeholder: t("login.totalCoursesPlaceholder"),
              icon: <Layers className="w-4 h-4" />,
              type: "number",
            },
            {
              key: "focusArea",
              label: t("login.focusArea"),
              placeholder: t("login.focusAreaPlaceholder"),
              icon: <Compass className="w-4 h-4" />,
            },
          ];
      }
    })();

    return (
      <div className="space-y-4">
        {fields.map((field) => (
          <motion.div key={field.key} variants={itemVariants}>
            {field.options ? (
              <div>
                <label className="block text-xs font-semibold text-teal-dark/60 mb-1.5 uppercase tracking-wider">
                  {field.label}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {field.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateRoleField(field.key, opt.value)}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-sm font-semibold border-[1.5px] transition duration-200",
                        roleFields[field.key] === opt.value
                          ? "bg-teal/10 border-teal/30 text-teal-dark"
                          : "bg-white border-gray-200/80 text-gray-400 hover:border-gray-300",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <InputField
                id={`signup-${field.key}`}
                icon={field.icon}
                label={field.label}
                value={roleFields[field.key] ?? ""}
                onChange={(v) => updateRoleField(field.key, v)}
                placeholder={field.placeholder}
                type={field.type}
              />
            )}
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Geist Variable', 'IBM Plex Sans Arabic', sans-serif" }}
    >
      {/* ══════════════════════ LEFT PANEL ══════════════════════ */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden bg-teal-dark flex-col items-center justify-start pt-[12vh] p-10 xl:px-14">
        <GeometricPattern />

        <motion.div
          className="relative z-10 max-w-sm"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <Link to="/" className="inline-block">
              <TamkeenLogo variant="full" size="lg" darkBg />
            </Link>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-white text-3xl xl:text-4xl font-bold leading-tight tracking-tight mb-3"
          >
            {mode === "signin"
              ? t("login.welcomeBack")
              : t("login.startYourJourney")}
          </motion.h1>
          <motion.p
            variants={itemVariants}
            className="text-teal-50/60 text-base mb-8 leading-relaxed"
          >
            {mode === "signin"
              ? t("login.signInDesc")
              : t("login.registerDesc")}
          </motion.p>

          <div className="space-y-3.5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.key}
                  variants={itemVariants}
                  className="flex items-center gap-3.5 group"
                >
                  {/* Feature pills in gold — these are the "what you get" promises;
                      reads as the heritage offering on the navy hero. */}
                  <div className="w-10 h-10 rounded-xl bg-imamu-gold/15 flex items-center justify-center border border-imamu-gold/30 group-hover:bg-imamu-gold/25 transition-colors duration-200">
                    <Icon className="w-[18px] h-[18px] text-imamu-warm-gold" />
                  </div>
                  <span className="text-white/85 text-sm font-medium">
                    {t(`login.${f.key}`)}
                  </span>
                </motion.div>
              );
            })}
          </div>

          <motion.p
            variants={itemVariants}
            className="text-white/30 text-sm font-arabic mt-10"
            dir="rtl"
          >
            {t("login.arabicTagline")}
          </motion.p>
        </motion.div>
      </div>

      {/* ══════════════════════ RIGHT PANEL ═════════════════════ */}
      <div className="flex-1 flex flex-col bg-[#fafbfc] relative overflow-y-auto">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Language toggle */}
        <div className="flex justify-end px-6 pt-5">
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-teal-dark/60 hover:text-teal-dark bg-teal-50 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {isArabic
              ? t("common.switchToEnglish")
              : t("common.switchToArabic")}
          </button>
        </div>

        {/* Mobile logo bar */}
        <div className="lg:hidden flex items-center justify-between px-6 pt-4">
          <Link to="/">
            {isArabic ? (
              <ChevronRight className="w-5 h-5 text-teal-dark/60" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-teal-dark/60" />
            )}
          </Link>
          <Link to="/" className="flex items-baseline gap-2">
            <span
              className="font-arabic text-2xl font-extrabold text-teal-dark"
              dir="rtl"
            >
              تمكين
            </span>
            <span className="font-display text-sm font-semibold text-teal-dark/80 tracking-wide" dir="ltr">
              Tamkeen
            </span>
          </Link>
          <div className="w-5" />
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:py-16">
          <motion.div
            className="w-full max-w-[420px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {/* ── Mode Toggle ─────────────────────────────────── */}
            <div className="flex bg-imamu-ice/60 rounded-2xl p-1.5 mb-8 relative border border-imamu-gold/15">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`relative z-10 flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200 ${mode === m ? "text-imamu-gold-deep" : "text-gray-400 hover:text-gray-600"}`}
                >
                  {m === "signin"
                    ? t("login.signIn")
                    : t("login.createAccount")}
                </button>
              ))}
              <div
                className="absolute top-1.5 bottom-1.5 z-0 w-[calc(50%-6px)] bg-white rounded-xl shadow-sm ring-1 ring-imamu-gold/30 transition-[left] duration-200"
                style={{
                  left:
                    (mode === "signin") !== isArabic
                      ? "6px"
                      : "calc(50% + 3px)",
                }}
              />
            </div>

            <AnimatePresence mode="wait">
              {mode === "signin" ? (
                /* ══════════════════ SIGN IN ══════════════════ */
                <motion.div
                  key="signin"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <h1 className="text-teal-dark text-2xl font-bold tracking-tight mb-1.5">
                    {t("login.signIn")}
                  </h1>
                  <p className="text-gray-400 text-sm mb-7">
                    {t("login.enterCredentials")}
                  </p>

                  <form onSubmit={handleSubmit}>
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="space-y-4"
                    >
                      <motion.div variants={itemVariants}>
                        <InputField
                          id="login-email"
                          icon={<Mail className="w-4 h-4" />}
                          label={t("login.emailAddress")}
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(v) => {
                            setEmail(v);
                            setError("");
                            clearField("email");
                          }}
                          placeholder="you@tamkeen.imamu.edu.sa"
                          error={fieldErrors.email}
                        />
                      </motion.div>

                      <motion.div variants={itemVariants}>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label
                              htmlFor="login-password"
                              className="block text-xs font-semibold text-teal-dark/60 uppercase tracking-wider"
                            >
                              {t("login.password")}
                            </label>
                            <Link
                              to="/forgot-password"
                              className="text-[11px] font-semibold text-imamu-gold-deep hover:text-imamu-gold transition-colors"
                            >
                              {isArabic
                                ? "نسيت كلمة المرور؟"
                                : "Forgot password?"}
                            </Link>
                          </div>
                          <div
                            className={cn(
                              "flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-4 py-3 transition duration-200",
                              fieldErrors.password
                                ? "border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
                                : "border-gray-200/80 focus-within:border-teal focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.08)]",
                            )}
                          >
                            <Lock
                              className={cn(
                                "w-4 h-4 shrink-0",
                                fieldErrors.password
                                  ? "text-red-300"
                                  : "text-gray-300",
                              )}
                            />
                            <input
                              id="login-password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                clearField("password");
                              }}
                              placeholder="••••••••"
                              className="flex-1 bg-transparent text-sm text-teal-dark placeholder:text-gray-300 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              aria-label={
                                showPassword
                                  ? isArabic
                                    ? "إخفاء كلمة المرور"
                                    : "Hide password"
                                  : isArabic
                                    ? "إظهار كلمة المرور"
                                    : "Show password"
                              }
                              aria-pressed={showPassword}
                              className="text-gray-300 hover:text-teal-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded"
                            >
                              {showPassword ? (
                                <EyeOff
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Eye className="w-4 h-4" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                          <FieldError message={fieldErrors.password} />
                        </div>
                      </motion.div>

                      <AnimatePresence>
                        {error && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                            role="alert"
                            aria-live="assertive"
                          >
                            <div className="flex items-center gap-2 text-sm text-danger bg-danger/8 border border-danger/15 rounded-xl px-4 py-2.5">
                              <AlertCircle
                                className="w-4 h-4 shrink-0"
                                aria-hidden="true"
                              />
                              {error}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <motion.div variants={itemVariants}>
                        <button
                          type="submit"
                          disabled={submitting}
                          aria-busy={submitting}
                          className="group w-full bg-teal text-white font-semibold text-[15px] py-3.5 rounded-xl hover:bg-teal-deep transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-80 disabled:cursor-not-allowed"
                        >
                          {submitting ? (
                            <>
                              <Loader2
                                className="w-4 h-4 animate-spin"
                                aria-hidden="true"
                              />
                              {isArabic ? "جارٍ تسجيل الدخول…" : "Signing in…"}
                            </>
                          ) : (
                            <>
                              {t("login.signInBtn")}
                              {isArabic ? (
                                <ArrowLeft
                                  className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ArrowRight
                                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                                  aria-hidden="true"
                                />
                              )}
                            </>
                          )}
                        </button>
                      </motion.div>

                      <motion.p
                        variants={itemVariants}
                        className="text-center text-sm text-gray-400 pt-1"
                      >
                        {t("login.dontHaveAccount")}{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signup")}
                          className="text-imamu-gold-deep font-bold hover:text-imamu-gold underline-offset-2 hover:underline transition-colors"
                        >
                          {t("login.createFreeAccount")}
                        </button>
                      </motion.p>
                    </motion.div>
                  </form>
                </motion.div>
              ) : (
                /* ══════════════════ SIGN UP (Multi-Step) ══════════════════ */
                <motion.div
                  key="signup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <StepProgress current={signupStep} total={3} />

                  <AnimatePresence mode="wait">
                    {signupStep === 0 && (
                      /* ── Step 1: Role Selection ── */
                      <motion.div
                        key="step0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <h1 className="text-teal-dark text-2xl font-bold tracking-tight mb-1.5">
                          {t("login.selectYourRole")}
                        </h1>
                        <p className="text-gray-400 text-sm mb-6">
                          {t("login.selectRoleDesc")}
                        </p>

                        <div className="space-y-2.5">
                          {roleOptions.map((r) => {
                            const Icon = r.icon;
                            const isSelected = selectedRole === r.role;
                            return (
                              <button
                                key={r.role}
                                type="button"
                                onClick={() => setSelectedRole(r.role)}
                                className={cn(
                                  "w-full flex items-center gap-4 p-4 rounded-xl border-[1.5px] transition duration-200 text-start",
                                  isSelected
                                    ? `${r.bg} ${r.border} shadow-sm`
                                    : "bg-white border-gray-100 hover:border-gray-200",
                                )}
                              >
                                <div
                                  className={cn(
                                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                                    isSelected
                                      ? `${r.activeBg} text-white`
                                      : "bg-gray-50 text-gray-400",
                                  )}
                                >
                                  <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={cn(
                                      "text-sm font-bold",
                                      isSelected ? r.color : "text-gray-600",
                                    )}
                                  >
                                    {isArabic
                                      ? roleLabels[r.role].ar
                                      : roleLabels[r.role].en}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {isArabic
                                      ? roleLabels[r.role].descAr
                                      : roleLabels[r.role].descEn}
                                  </p>
                                </div>
                                {isSelected && (
                                  <CheckCircle2
                                    className={cn("w-5 h-5 shrink-0", r.color)}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {signupStep === 1 && (
                      /* ── Step 2: Basic Info ── */
                      <motion.div
                        key="step1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <h1 className="text-teal-dark text-2xl font-bold tracking-tight mb-1.5">
                          {t("login.basicInfo")}
                        </h1>
                        <p className="text-gray-400 text-sm mb-6">
                          {t("login.basicInfoDesc")}
                        </p>

                        <motion.div
                          variants={containerVariants}
                          initial="hidden"
                          animate="visible"
                          className="space-y-4"
                        >
                          <motion.div
                            variants={itemVariants}
                            className="grid grid-cols-2 gap-3"
                          >
                            <InputField
                              id="fullname-en"
                              icon={<User className="w-4 h-4" />}
                              label={t("login.fullNameEn")}
                              value={fullNameEn}
                              onChange={(v) => {
                                setFullNameEn(v);
                                clearField("fullNameEn");
                              }}
                              placeholder="John Doe"
                              error={fieldErrors.fullNameEn}
                            />
                            <InputField
                              id="fullname-ar"
                              icon={<User className="w-4 h-4" />}
                              label={t("login.fullNameAr")}
                              value={fullNameAr}
                              onChange={(v) => {
                                setFullNameAr(v);
                                clearField("fullNameAr");
                              }}
                              placeholder="محمد أحمد"
                              dir="rtl"
                              error={fieldErrors.fullNameAr}
                            />
                          </motion.div>

                          <motion.div variants={itemVariants}>
                            <InputField
                              id="signup-email"
                              icon={<Mail className="w-4 h-4" />}
                              label={t("login.emailAddress")}
                              type="email"
                              value={email}
                              onChange={(v) => {
                                setEmail(v);
                                clearField("email");
                              }}
                              placeholder="you@tamkeen.imamu.edu.sa"
                              error={fieldErrors.email}
                            />
                          </motion.div>

                          <motion.div variants={itemVariants}>
                            <div>
                              <label
                                htmlFor="signup-password"
                                className="block text-xs font-semibold text-teal-dark/60 mb-1.5 uppercase tracking-wider"
                              >
                                {t("login.password")}
                              </label>
                              <div
                                className={cn(
                                  "flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-4 py-3 transition duration-200",
                                  fieldErrors.password
                                    ? "border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
                                    : "border-gray-200/80 focus-within:border-teal focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.08)]",
                                )}
                              >
                                <Lock
                                  className={cn(
                                    "w-4 h-4 shrink-0",
                                    fieldErrors.password
                                      ? "text-red-300"
                                      : "text-gray-300",
                                  )}
                                />
                                <input
                                  id="signup-password"
                                  type={showPassword ? "text" : "password"}
                                  autoComplete="new-password"
                                  value={password}
                                  onChange={(e) => {
                                    setPassword(e.target.value);
                                    clearField("password");
                                  }}
                                  placeholder="••••••••"
                                  className="flex-1 bg-transparent text-sm text-teal-dark placeholder:text-gray-300 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="text-gray-300 hover:text-teal-dark transition-colors"
                                  tabIndex={-1}
                                >
                                  {showPassword ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                              <FieldError message={fieldErrors.password} />
                              {!fieldErrors.password && (
                                <p className="mt-1.5 text-xs text-gray-400">
                                  {t("validation.passwordHint")}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        </motion.div>
                      </motion.div>
                    )}

                    {signupStep === 2 && (
                      /* ── Step 3: Role-Specific Fields ── */
                      <motion.div
                        key="step2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        <h1 className="text-teal-dark text-2xl font-bold tracking-tight mb-1.5">
                          {t("login.roleDetails")}
                        </h1>
                        <p className="text-gray-400 text-sm mb-6">
                          {t("login.roleDetailsDesc")}
                        </p>

                        <motion.div
                          variants={containerVariants}
                          initial="hidden"
                          animate="visible"
                        >
                          {renderRoleFields()}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Error banner */}
                  {error && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600"
                    >
                      <AlertCircle
                        className="w-4 h-4 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Navigation buttons */}
                  <div className="flex gap-3 mt-8">
                    {signupStep > 0 && (
                      <button
                        type="button"
                        onClick={prevStep}
                        className="px-5 py-3.5 rounded-xl border-[1.5px] border-gray-200 text-sm font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition"
                      >
                        {t("login.previousStep")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={nextStep}
                      disabled={
                        (signupStep === 0 && !selectedRole) || submitting
                      }
                      className={cn(
                        "group flex-1 font-semibold text-[15px] py-3.5 rounded-xl flex items-center justify-center gap-2 transition duration-200",
                        (signupStep === 0 && !selectedRole) || submitting
                          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                          : "bg-teal text-white hover:bg-teal-deep",
                      )}
                    >
                      {submitting ? (
                        <>
                          <Loader2
                            className="w-4 h-4 animate-spin"
                            aria-hidden="true"
                          />
                          {isArabic
                            ? "جارٍ إنشاء الحساب…"
                            : "Creating account…"}
                        </>
                      ) : (
                        <>
                          {signupStep === 2
                            ? t("login.completeSignup")
                            : t("login.nextStep")}
                          {isArabic ? (
                            <ArrowLeft
                              className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowRight
                              className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                              aria-hidden="true"
                            />
                          )}
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-center text-sm text-gray-400 mt-5">
                    {t("login.alreadyHaveAccount")}{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="text-imamu-gold-deep font-bold hover:text-imamu-gold underline-offset-2 hover:underline transition-colors"
                    >
                      {t("login.signInInstead")}
                    </button>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Other role quick-fill ───────────────────────── */}
            {mode === "signin" && (
              <motion.div
                className="mt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <p className="text-[10px] text-gray-400 text-center mb-3 uppercase tracking-widest font-medium">
                  {t("login.quickAccess")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {demoAccounts.map((acc) => {
                    const RoleIcon =
                      roleOptions.find((r) => r.role === acc.role)?.icon ?? User;
                    return (
                      <button
                        key={acc.role}
                        onClick={() => quickFill(acc)}
                        className="group flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-200/60 text-xs font-semibold text-gray-500 hover:border-teal/30 hover:text-teal-dark transition-colors duration-200"
                      >
                        <RoleIcon className="w-3.5 h-3.5 text-gray-400 group-hover:text-teal" />
                        <span>{isArabic ? acc.nameAr : acc.name}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Shared demo password — every demo account uses the same one
                    so visitors only need to remember it once. The `select-all`
                    class lets reviewers copy it with a single click. */}
                <p className="mt-3 text-center text-[11px] text-gray-400">
                  {isArabic
                    ? "كلمة المرور للحسابات التجريبية: "
                    : "Demo password: "}
                  <code className="font-mono font-bold text-teal-dark bg-teal/5 border border-teal/15 rounded px-1.5 py-0.5 select-all">
                    Demo1234!
                  </code>
                </p>
              </motion.div>
            )}

            {/* ── Back to home ─────────────────────────────────── */}
            <div className="text-center mt-6">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-teal transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t("login.backToHome")}
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable Input Field ─────────────────────────────────── */
function InputField({
  id,
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  dir,
  error,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  dir?: string;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-teal-dark/60 mb-1.5 uppercase tracking-wider"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2.5 bg-white border-[1.5px] rounded-xl px-4 py-3 transition duration-200",
          error
            ? "border-red-300 focus-within:border-red-400 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
            : "border-gray-200/80 focus-within:border-teal focus-within:shadow-[0_0_0_3px_rgba(4,93,132,0.08)]",
        )}
      >
        <span
          className={cn("shrink-0", error ? "text-red-300" : "text-gray-300")}
        >
          {icon}
        </span>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          className="flex-1 bg-transparent text-sm text-teal-dark placeholder:text-gray-300 focus:outline-none"
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}
