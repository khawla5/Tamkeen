import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GraduationCap,
  TrendingUp,
  Handshake,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Crown,
  Check,
  Building2,
  ClipboardCheck,
  FileCheck,
  Network,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  fetchUniversityDashboard,
  groupNumber,
  type UniversityDashboardData,
} from "@/lib/university-dashboard";
import DashboardCard from "@/components/shared/DashboardCard";
import StatCard from "@/components/shared/StatCard";
import NextStepCard from "@/components/shared/NextStepCard";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import { useAuth } from "@/context/AuthContext";

// Calm institutional motion: a single short opacity fade on mount, no stagger.
const fade = (_delay = 0) => ({
  initial: { opacity: 0 } as const,
  animate: { opacity: 1 } as const,
  transition: { duration: 0.18 },
});

const partnerStatusColors: Record<string, string> = {
  active: "bg-green-50 text-green-700 border border-green-200",
  pending: "bg-imamu-gold-50 text-imamu-gold-deep border border-imamu-gold-100",
  new: "bg-imamu-navy-50 text-imamu-navy border border-imamu-navy-100",
};

// Pie palette: navy primary + gold/sky/blue spread (IMSIU brand).
const OUTCOME_COLORS = ["#045d84", "#80bace", "#b3ddf5", "#99823f", "#b7a362"];

// Connected national systems — institutional credibility row. No emojis.
const CONNECTED_SYSTEMS: { en: string; ar: string; status: "connected" | "pending" }[] = [
  { en: "Ministry of Education", ar: "وزارة التعليم", status: "connected" },
  { en: "ETEC", ar: "هيئة تقويم التعليم والتدريب", status: "connected" },
  { en: "HRDF (Hadaf)", ar: "هدف", status: "connected" },
  { en: "SDAIA", ar: "سدايا", status: "pending" },
  { en: "National Labor Observatory", ar: "المرصد الوطني للعمل", status: "pending" },
];

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-imamu-navy-50/70", className)} />;
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-10 space-y-6">
      <SkeletonBlock className="h-28 w-full" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
    </div>
  );
}

export default function UniversityDashboard() {
  const { t, isArabic } = useLanguage();
  const { user } = useAuth();

  const [data, setData] = useState<UniversityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    fetchUniversityDashboard(user.id)
      .then((real) => {
        if (cancelled) return;
        setData(real);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // While loading or if the query failed, show quiet skeletons — never fake numbers.
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-imamu-ice via-imamu-navy-50 to-white text-imamu-dark">
        <DashboardSkeleton />
      </div>
    );
  }

  const { headline, readinessByCollege, coopPartners, employmentOutcomes, engagement, recentActivity } = data;

  const placementData = employmentOutcomes.map((o, i) => ({
    name: isArabic ? o.labelAr : o.label,
    value: o.value,
    color: OUTCOME_COLORS[i % OUTCOME_COLORS.length],
  }));
  const employedPct = employmentOutcomes.find((o) => o.key === "employed")?.value ?? 0;

  const lowestCollege = readinessByCollege.length
    ? readinessByCollege.reduce((a, b) => (a.readiness < b.readiness ? a : b))
    : { college: "", collegeAr: "", readiness: 0 };
  const pendingPartners = coopPartners.filter((p) => p.status === "pending" || p.status === "new").length;
  const adoptionRate = headline.totalStudents
    ? Math.round((headline.studentsOnPlatform / headline.totalStudents) * 100)
    : 0;

  const tooltipStyle = {
    background: "#ffffff",
    border: "1px solid var(--color-imamu-navy-50)",
    borderRadius: 12,
    fontSize: 12,
    color: "var(--color-imamu-dark)",
    boxShadow: "0 8px 32px rgba(4,93,132,0.18)",
  } as const;

  const kpis = [
    { label: t("university.studentsAssessed"), value: groupNumber(headline.assessmentsCompleted), icon: ClipboardCheck, change: "+12%" },
    { label: t("university.skillsRecordsComplete"), value: groupNumber(headline.skillsRecords), icon: FileCheck, change: "+8%" },
    { label: t("university.coopPlacements"), value: groupNumber(headline.activeCoop), icon: Building2, change: "+23%" },
    { label: t("university.employmentRate"), value: `${headline.employment6m}%`, icon: TrendingUp, change: "+5%" },
  ];

  const planFeatures = [
    t("dashboard.studentTracking"),
    t("dashboard.placementAnalytics"),
    t("dashboard.coopManagement"),
    t("dashboard.customReports"),
  ];

  return (
    <div className="min-h-screen bg-imamu-ice text-imamu-dark">
      {/* IMSIU identity band — this is the president's own screen, so it leads
          with the university mark next to the institution name. */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pt-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <img
            src="/brand/imsiu_emblem.jpg"
            alt={isArabic ? "جامعة الإمام محمد بن سعود الإسلامية" : "Imam Mohammad Ibn Saud Islamic University"}
            className="h-24 sm:h-28 w-auto rounded-xl bg-white ring-1 ring-imamu-navy-100 p-1.5 shadow-sm shrink-0"
          />
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-2xl font-bold text-imamu-navy leading-tight truncate">
              {isArabic ? data.nameAr : data.name}
            </h1>
            <p className="text-xs sm:text-sm text-imamu-blue mt-0.5">
              {isArabic ? "لوحة الجامعة · منصة تمكين" : "University dashboard · Tamkeen"}
            </p>
          </div>
        </div>
      </div>

      {/* Welcome banner removed — TopBar greets the user, NextStepCard is the
          welcome-plus-action prompt. Same simplification we applied to the
          Company and Provider dashboards. */}
      <NextStepCard
        variant="light"
        icon={<Target className="w-7 h-7" />}
        label={isArabic ? "خطوتك التالية" : "Your Next Step"}
        heading={
          isArabic
            ? `عزّز جاهزية كلية ${lowestCollege.collegeAr}`
            : `Boost readiness in ${lowestCollege.college}`
        }
        bullets={[
          isArabic
            ? `${lowestCollege.readiness}% جاهزية — الأقل بين الكليات`
            : `${lowestCollege.readiness}% readiness — lowest college`,
          isArabic
            ? `${adoptionRate}% نسبة تبني الطلاب للمنصة`
            : `${adoptionRate}% platform adoption across students`,
          isArabic
            ? `${pendingPartners} شراكات بانتظار التفعيل`
            : `${pendingPartners} partnerships awaiting activation`,
        ]}
        ctaHref="/dashboard/university"
        ctaLabel={isArabic ? "عرض التقارير" : "View Reports"}
      />

      {/* Headline KPIs */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 mt-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <motion.div
              key={kpi.label}
              className="relative rounded-2xl bg-white border border-imamu-gold-100 p-4 shadow-sm overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-imamu-gold-50 ring-1 ring-imamu-gold-100 flex items-center justify-center shrink-0">
                  <kpi.icon className="w-5 h-5 text-imamu-gold-deep" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-extrabold text-imamu-gold-deep">{kpi.value}</p>
                  <p className="text-[11px] text-imamu-blue truncate">{kpi.label}</p>
                </div>
              </div>
              <p className="text-[11px] text-green-700 font-semibold mt-2">
                {kpi.change} {t("university.thisSemester")}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Connected national systems */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 mt-6">
        <motion.div
          className="rounded-2xl bg-white border border-imamu-navy-50 p-5 shadow-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg bg-imamu-navy-50 ring-1 ring-imamu-navy-100 flex items-center justify-center">
              <Network className="w-4 h-4 text-imamu-navy" />
            </span>
            <h3 className="font-display text-base font-bold text-imamu-dark">
              {t("university.connectedSystems")}
            </h3>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {CONNECTED_SYSTEMS.map((sys) => (
              <div
                key={sys.en}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 shrink-0"
              >
                <div>
                  <p className="text-sm font-semibold text-imamu-dark whitespace-nowrap">
                    {isArabic ? sys.ar : sys.en}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        sys.status === "connected" ? "bg-green-600" : "bg-imamu-gold",
                      )}
                    />
                    <span className="text-[11px] text-imamu-blue">
                      {sys.status === "connected" ? t("university.connected") : t("university.pending")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Operational stat tiles */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 mt-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            variant="light"
            icon={<GraduationCap className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={groupNumber(headline.studentsOnPlatform)}
            label={t("dashboard.registeredStudents")}
            helper={isArabic ? `من أصل ${groupNumber(headline.totalStudents)} طالب` : `Out of ${groupNumber(headline.totalStudents)} total students`}
            index={0}
          />
          <StatCard
            variant="light"
            icon={<TrendingUp className="w-5 h-5 text-green-700" />}
            iconBg="bg-green-50 ring-1 ring-green-200"
            value={`${headline.employment6m}%`}
            label={t("dashboard.placementRate")}
            helper={isArabic ? "التوظيف خلال 6 أشهر من التخرج" : "Employment within 6 months"}
            progress={headline.employment6m}
            progressColor="bg-green-600"
            index={1}
          />
          <StatCard
            variant="light"
            icon={<Handshake className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={String(headline.partnerships)}
            label={t("dashboard.activePartnerships")}
            helper={isArabic ? `${pendingPartners} في انتظار التفعيل` : `${pendingPartners} awaiting activation`}
            index={2}
          />
          <StatCard
            variant="light"
            attention
            icon={<Target className="w-5 h-5 text-imamu-gold-deep" />}
            iconBg="bg-imamu-gold-50 ring-1 ring-imamu-gold-100"
            value={`${headline.avgReadiness}%`}
            label={t("dashboard.avgReadiness")}
            helper={isArabic ? "متوسط الجاهزية المهنية" : "Average career readiness"}
            progress={headline.avgReadiness}
            progressColor="bg-imamu-gold"
            index={3}
          />
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 pb-12">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="space-y-6">
            <motion.div {...fade(0)}>
              <DashboardCard
                variant="light"
                id="readiness"
                title={t("dashboard.studentReadiness")}
                icon={<BarChart3 className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={readinessByCollege.map((d) => ({
                        dept: isArabic ? d.collegeAr : d.college,
                        readiness: d.readiness,
                      }))}
                      layout="vertical"
                      barSize={16}
                    >
                      <CartesianGrid stroke="rgba(4,93,132,0.08)" horizontal={false} />
                      <YAxis
                        dataKey="dept"
                        type="category"
                        width={170}
                        tick={{ fontSize: 12, fontWeight: 700, fill: "var(--color-imamu-gold-deep)" }}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={12}
                        orientation="left"
                      />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: "var(--color-imamu-dark)", opacity: 0.55 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => [`${value}%`, isArabic ? "الجاهزية" : "Readiness"]}
                        cursor={{ fill: "rgba(4,93,132,0.06)" }}
                      />
                      <Bar dataKey="readiness" fill="var(--color-imamu-navy)" radius={[0, 6, 6, 0]} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.1)}>
              <DashboardCard
                variant="light"
                id="placements"
                title={t("dashboard.placementOutcomes")}
                icon={<PieChartIcon className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div className="relative" dir="ltr">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={placementData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        animationDuration={1000}
                      >
                        {placementData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <motion.div
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.18 }}
                  >
                    <span className="font-display text-[22px] font-bold text-imamu-dark">{employedPct}%</span>
                    <span className="text-xs text-imamu-blue">{t("dashboard.employed")}</span>
                  </motion.div>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
                  {placementData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-imamu-dark/65">
                        {d.name} ({d.value}%)
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div {...fade(0.05)}>
              <DashboardCard
                variant="light"
                id="partnerships"
                title={t("dashboard.coopPartnerships")}
                icon={<Handshake className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div className="space-y-2.5">
                  {coopPartners.map((p) => (
                    <div
                      key={p.company}
                      className="flex items-center gap-3 p-4 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 hover:bg-imamu-navy-50/75 hover:border-imamu-navy-100 transition duration-200"
                    >
                      {p.logo ? (
                        <img
                          src={p.logo}
                          alt={p.company}
                          className="w-9 h-9 rounded-lg shrink-0 object-contain bg-white p-1 border border-imamu-navy-50"
                        />
                      ) : (
                        <span className="w-9 h-9 rounded-lg shrink-0 bg-white border border-imamu-navy-50 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-imamu-navy" />
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-imamu-dark">{isArabic ? p.companyAr : p.company}</p>
                        <p className="text-xs text-imamu-blue">
                          {p.placed} {t("dashboard.studentsPlaced")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full text-[10px] font-bold px-2.5 py-1 shrink-0",
                          partnerStatusColors[p.status],
                        )}
                      >
                        {t(`common.${p.status}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.15)}>
              <DashboardCard
                variant="light"
                id="engagement"
                title={t("dashboard.platformEngagement")}
                icon={<Activity className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div className="space-y-4">
                  {engagement.map((m) => (
                    <div key={m.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-imamu-dark/75">{isArabic ? m.labelAr : m.label}</span>
                        <span className="text-sm font-bold text-imamu-dark">{groupNumber(m.value)}</span>
                      </div>
                      <div className="h-1.5 bg-imamu-navy-50 rounded-full overflow-hidden">
                        <div className="h-full bg-imamu-navy rounded-full" style={{ width: `${m.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.2)}>
              <DashboardCard
                variant="light"
                id="activity"
                title={isArabic ? "أحدث النشاط" : "Recent Activity"}
                icon={<Activity className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div className="space-y-3">
                  {recentActivity.map((a) => (
                    <div key={a.label} className="flex items-start gap-3">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-imamu-gold shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-imamu-dark/80">{isArabic ? a.labelAr : a.label}</p>
                        <p className="text-[11px] text-imamu-blue">
                          {a.days === 0
                            ? isArabic ? "اليوم" : "Today"
                            : isArabic ? `قبل ${a.days} يوم` : `${a.days} days ago`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.25)}>
              <DashboardCard
                variant="light"
                id="subscription"
                title={t("dashboard.subscriptionLabel")}
                icon={<Crown className="w-[18px] h-[18px] text-imamu-gold-deep" />}
              >
                <div className="relative p-5 rounded-xl bg-imamu-gold-50 border border-imamu-gold-100 overflow-hidden">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-imamu-gold" aria-hidden="true" />
                  <p className="font-display text-base font-bold text-imamu-dark mb-4">
                    {t("dashboard.institutionalPlan")}
                  </p>
                  <ul className="space-y-2.5">
                    {planFeatures.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-imamu-dark/75">
                        <span className="w-5 h-5 rounded-full bg-imamu-gold-50 border border-imamu-gold-100 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-imamu-gold-deep" />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-imamu-dark/55 mt-4">{t("dashboard.annualRenewal")}</p>
                  <button className="mt-3 w-full py-2.5 text-center border border-imamu-navy-100 bg-white rounded-xl text-sm font-bold text-imamu-navy hover:bg-imamu-navy-50 hover:border-imamu-navy transition duration-200">
                    {t("dashboard.manageSubscription")}
                  </button>
                </div>
              </DashboardCard>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
