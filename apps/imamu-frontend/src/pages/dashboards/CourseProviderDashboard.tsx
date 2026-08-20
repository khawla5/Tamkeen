import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Users,
  CheckCircle,
  Star,
  DollarSign,
  PlusCircle,
} from "lucide-react";
import { courseProviderProfile as courseProviderProfileFallback } from "@/data/dummy-data";
import { fetchProviderProfile, type ProviderCourse } from "@/lib/profiles";
import type { CourseProviderProfile } from "@/types";
import DashboardCard from "@/components/shared/DashboardCard";
import StatCard from "@/components/shared/StatCard";
import NextStepCard from "@/components/shared/NextStepCard";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import { useAuth } from "@/context/AuthContext";

// Calm institutional motion: a single short opacity fade on mount, no stagger,
// no drift, no scroll-triggered reveal. The `delay` arg is accepted for
// call-site compatibility but intentionally ignored.
const fade = (_delay = 0) => ({
  initial: { opacity: 0 } as const,
  animate: { opacity: 1 } as const,
  transition: { duration: 0.18 },
});

export default function CourseProviderDashboard() {
  const { t, isArabic } = useLanguage();
  const { user } = useAuth();

  const [courseProviderProfile, setCourseProviderProfile] = useState<CourseProviderProfile>(courseProviderProfileFallback);
  const [courses, setCourses] = useState<ProviderCourse[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchProviderProfile(user.id)
      .then((real) => {
        if (cancelled || !real) return;
        setCourseProviderProfile((prev) => ({
          ...prev,
          name:              real.name             ?? prev.name,
          nameAr:            real.nameAr           ?? prev.nameAr,
          logo:              real.logoUrl          ?? prev.logo,
          rating:            real.rating           || prev.rating,
          totalCourses:      real.totalCourses     || prev.totalCourses,
          activeEnrollments: real.totalEnrollments || prev.activeEnrollments,
        }));
        setCourses(real.courses);
      })
      .catch(() => { /* fallback already in state */ });
    return () => { cancelled = true; };
  }, [user]);

  const totalEnrolled = courses.reduce((sum, c) => sum + c.enrollmentCount, 0);
  const avgCompletion = courseProviderProfile.completionRate;
  const draftCourses = courses.filter((c) => !c.isActive).length;
  const activeCourses = courses.filter((c) => c.isActive).length;
  const avgRating = courseProviderProfile.rating.toFixed(1);

  return (
    <div className="min-h-screen bg-imamu-ice text-imamu-dark">
      {/* Welcome banner removed — TopBar greets the user already and the
          NextStepCard below is the welcome-plus-action prompt. */}
      <NextStepCard
        variant="light"
        icon={<BookOpen className="w-7 h-7" />}
        label={isArabic ? "خطوتك التالية" : "Your Next Step"}
        heading={
          draftCourses > 0
            ? isArabic
              ? `انشر ${draftCourses} دورة في وضع المسودة`
              : `Publish ${draftCourses} draft course${draftCourses > 1 ? "s" : ""}`
            : isArabic
              ? "أضف دورة جديدة لتوسيع كتالوجك"
              : "Add a new course to expand your catalog"
        }
        bullets={[
          isArabic
            ? `${totalEnrolled.toLocaleString('en-US')} طالب مسجّل في دوراتك`
            : `${totalEnrolled.toLocaleString('en-US')} students enrolled in your courses`,
          isArabic
            ? `متوسط التقييم: ${avgRating}/5.0`
            : `Average rating: ${avgRating}/5.0`,
          isArabic
            ? `${activeCourses} دورات نشطة`
            : `${activeCourses} active courses`,
        ]}
        ctaHref="/post-opportunity"
        ctaLabel={isArabic ? "إنشاء دورة" : "Create Course"}
        ctaIcon={<PlusCircle className="w-4 h-4" />}
      />

      {/* Consolidated stat tiles — light variant. Combines the metrics that
          previously lived in QuickStatsGrid (revenue) with the four-up grid
          (courses / enrollments / completion / rating). */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 mt-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            variant="light"
            icon={<BookOpen className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={String(courseProviderProfile.totalCourses)}
            label={t("dashboard.activeCoursesStat")}
            helper={isArabic ? `${activeCourses} نشطة، ${draftCourses} مسودة` : `${activeCourses} live, ${draftCourses} draft`}
            index={0}
          />
          <StatCard
            variant="light"
            icon={<Users className="w-5 h-5 text-imamu-navy" />}
            iconBg="bg-imamu-navy-50 ring-1 ring-imamu-navy-100"
            value={courseProviderProfile.activeEnrollments.toLocaleString('en-US')}
            label={t("dashboard.activeEnrollments")}
            helper={isArabic ? "طلاب يدرسون الآن" : "Students currently enrolled"}
            index={1}
          />
          <StatCard
            variant="light"
            attention
            icon={<DollarSign className="w-5 h-5 text-imamu-gold-deep" />}
            iconBg="bg-imamu-gold-50 ring-1 ring-imamu-gold-100"
            value={`${courseProviderProfile.revenue.toLocaleString('en-US')} ﷼`}
            label={isArabic ? "الإيرادات" : "Revenue"}
            helper={isArabic ? "إجمالي الإيرادات الحالية" : "Total platform revenue to date"}
            index={2}
          />
          <StatCard
            variant="light"
            icon={<Star className="w-5 h-5 text-imamu-gold-deep" />}
            iconBg="bg-imamu-gold-50 ring-1 ring-imamu-gold-100"
            value={avgRating}
            valueSuffix=" / 5"
            label={t("dashboard.avgRating")}
            helper={isArabic ? `معدل إكمال ${avgCompletion}%` : `${avgCompletion}% completion rate`}
            progress={avgCompletion}
            progressColor="bg-green-600"
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
                id="courses"
                title={t("dashboard.courseListings")}
                icon={<BookOpen className="w-[18px] h-[18px] text-imamu-navy" />}
                action={{ label: t("dashboard.addNewCourse"), href: "/post-opportunity" }}
              >
                {courses.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="w-9 h-9 text-imamu-navy-100 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-imamu-dark/60 mb-3">
                      {isArabic ? "لم تنشر أي دورة بعد" : "No courses published yet"}
                    </p>
                    <a
                      href="/post-opportunity"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-imamu-navy hover:text-imamu-navy-deep transition"
                    >
                      {isArabic ? "أنشئ دورتك الأولى" : "Create your first course"}
                      <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {courses.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 p-4 rounded-xl border border-imamu-navy-50 bg-imamu-navy-50/45 hover:bg-imamu-navy-50/75 hover:border-imamu-navy-100 transition duration-200"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-imamu-dark">
                            {isArabic ? (c.nameAr ?? c.name) : c.name}
                          </span>
                          <div className="flex flex-wrap gap-4 mt-1 text-xs text-imamu-blue">
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {c.enrollmentCount} {isArabic ? "مسجّل" : "enrolled"}
                            </span>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full text-[10px] font-bold px-2.5 py-1 shrink-0 border",
                            c.isActive
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-imamu-gold-50 text-imamu-gold-deep border-imamu-gold-100",
                          )}
                        >
                          {c.isActive
                            ? (isArabic ? "نشط" : "Active")
                            : (isArabic ? "مسودة" : "Draft")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </motion.div>

            {/* Tamkeen Training Provider scope: enrollment-trend chart,
                revenue summary, course performance, and partnership cards
                were removed. Providers see only their courses + an "Add
                course" affordance. */}
          </div>

          <div className="space-y-6">
            {/* Quick guidance panel — gold-tinted "smart insight" card matching
                the Tamkeen pattern used elsewhere. */}
            <motion.div {...fade(0.1)}>
              <DashboardCard
                variant="light"
                id="provider-tips"
                title={isArabic ? "نصائح لزيادة التسجيلات" : "Boost your enrollments"}
                icon={<Star className="w-[18px] h-[18px] text-imamu-gold-deep" />}
              >
                <ul className="space-y-3">
                  {[
                    {
                      en: "Keep course descriptions detailed and outcome-focused.",
                      ar: "اكتب أوصاف الدورة بوضوح مع التركيز على المخرجات.",
                    },
                    {
                      en: "Refresh thumbnails and titles every 90 days.",
                      ar: "حدّث صور الغلاف والعناوين كل 90 يوماً.",
                    },
                    {
                      en: "Reply to learner reviews to boost discoverability.",
                      ar: "تفاعل مع تقييمات الطلاب لتحسين الظهور.",
                    },
                    {
                      en: "Bundle related courses into learning paths.",
                      ar: "اجمع الدورات المترابطة في مسارات تعلّم.",
                    },
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-imamu-dark/75 leading-snug">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-imamu-gold shrink-0" aria-hidden="true" />
                      <span>{isArabic ? tip.ar : tip.en}</span>
                    </li>
                  ))}
                </ul>
              </DashboardCard>
            </motion.div>

            {/* Provider summary — small bordered panel echoing the profile. */}
            <motion.div {...fade(0.15)}>
              <DashboardCard
                variant="light"
                id="provider-summary"
                title={isArabic ? "ملخص حسابك" : "Account summary"}
                icon={<CheckCircle className="w-[18px] h-[18px] text-imamu-navy" />}
              >
                <div className="space-y-3">
                  <SummaryRow
                    label={isArabic ? "اسم الجهة" : "Provider name"}
                    value={isArabic ? courseProviderProfile.nameAr ?? courseProviderProfile.name : courseProviderProfile.name}
                  />
                  <SummaryRow
                    label={isArabic ? "الدورات الإجمالية" : "Total courses"}
                    value={String(courseProviderProfile.totalCourses)}
                  />
                  <SummaryRow
                    label={isArabic ? "إجمالي المسجّلين" : "Total enrolments"}
                    value={courseProviderProfile.activeEnrollments.toLocaleString('en-US')}
                  />
                  <SummaryRow
                    label={isArabic ? "متوسط الإكمال" : "Avg. completion"}
                    value={`${avgCompletion}%`}
                    accent
                  />
                </div>
              </DashboardCard>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-imamu-blue">{label}</span>
      <span className={cn("font-bold truncate", accent ? "text-imamu-gold-deep" : "text-imamu-dark")}>{value}</span>
    </div>
  );
}
