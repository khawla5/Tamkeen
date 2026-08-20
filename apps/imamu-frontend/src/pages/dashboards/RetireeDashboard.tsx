import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  Award,
  Briefcase,
  Star,
  MapPin,
  Handshake,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
} from "lucide-react";
import { retireeProfile as retireeProfileFallback } from "@/data/dummy-data";
import DashboardCard from "@/components/shared/DashboardCard";
import MatchBadge from "@/components/shared/MatchBadge";
import SalaryText from "@/components/shared/SalaryText";
import OpportunityDetailModal from "@/components/shared/OpportunityDetailModal";
import CompanyLogo from "@/components/shared/CompanyLogo";
import StatCard from "@/components/shared/StatCard";
import DashboardWelcomeBanner from "@/components/shared/DashboardWelcomeBanner";
import NextStepCard from "@/components/shared/NextStepCard";
import QuickStatsGrid from "@/components/shared/QuickStatsGrid";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/context";
import { useLocalizedField } from "@/hooks/useLocalizedData";
import { useAuth } from "@/context/AuthContext";
import { fetchRetireeProfile } from "@/lib/profiles";
import { fetchActiveOpportunities } from "@/lib/opportunities";
import { applyMatchScores, fetchMatchContext } from "@/lib/match-score";
import { fetchMyApplications, type MyApplication } from "@/lib/applications";
import type { Opportunity, RetireeProfile } from "@/types";

// Calm institutional motion: a single short opacity fade on mount, no stagger,
// no drift, no scroll-triggered reveal. The `delay` arg is accepted for
// call-site compatibility but intentionally ignored.
const fade = (_delay = 0) => ({
  initial: { opacity: 0 } as const,
  animate: { opacity: 1 } as const,
  transition: { duration: 0.18 },
});
const statusColors: Record<string, string> = {
  accepted: "bg-green-500/15 text-green-400",
  shortlisted: "bg-yellow-500/15 text-yellow-400",
  reviewed: "bg-blue-500/15 text-blue-400",
  submitted: "bg-white/10 text-white/50",
  rejected: "bg-red-500/15 text-red-400",
};
export default function RetireeDashboard() {
  const { t, isArabic } = useLanguage();
  const l = useLocalizedField();
  const { user } = useAuth();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [retireeOpps, setRetireeOpps] = useState<Opportunity[]>([]);
  const [myApplications, setMyApplications] = useState<MyApplication[]>([]);

  // Live profile, hydrated from DB on mount; falls back to the curated mock so
  // sections that rely on richer fields keep rendering until we add them.
  const [retireeProfile, setRetireeProfile] = useState<RetireeProfile>(retireeProfileFallback);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    fetchRetireeProfile(user.id)
      .then((real) => {
        if (cancelled || !real) return;
        setRetireeProfile((prev) => ({
          ...prev,
          name: real.name ?? prev.name,
          nameAr: real.nameAr ?? prev.nameAr,
          industry: real.industry ?? prev.industry,
          industryAr: real.industryAr ?? prev.industryAr,
          yearsExperience: real.yearsExperience ?? prev.yearsExperience,
          expertise: real.expertise.length > 0 ? real.expertise : prev.expertise,
          expertiseAr: real.expertiseAr.length > 0 ? real.expertiseAr : prev.expertiseAr,
          availability: real.availability ?? prev.availability,
          preferredWork: real.preferredWork.length > 0 ? real.preferredWork : prev.preferredWork,
          profileCompletion: real.profileCompletion || prev.profileCompletion,
          engagements: real.engagements.length > 0 ? real.engagements : prev.engagements,
        }));
      })
      .catch(() => { /* fallback already in state */ });

    // Consulting-focused opportunities for retirees, scored by their expertise signal.
    Promise.all([fetchActiveOpportunities(), fetchMatchContext(user.id, 'retiree')])
      .then(([opps, ctx]) => {
        if (cancelled) return;
        const consulting = opps.filter((o) => o.category === 'consulting');
        const scored = applyMatchScores(consulting, ctx);
        setRetireeOpps([...scored].sort((a, b) => b.matchScore - a.matchScore));
      })
      .catch(() => { /* card will show empty state */ });

    fetchMyApplications(user.id)
      .then((rows) => { if (!cancelled) setMyApplications(rows); })
      .catch(() => { /* ignore */ });

    return () => { cancelled = true; };
  }, [user]);

  const expertiseNames = retireeProfile.expertise.map((e) => e.toLowerCase());

  // Average engagement rating
  const avgRating =
    retireeProfile.engagements.length > 0
      ? (
          retireeProfile.engagements.reduce((s, e) => s + e.rating, 0) /
          retireeProfile.engagements.length
        ).toFixed(1)
      : "—";

  return (
    <>
      <DashboardWelcomeBanner
        storageKey="tamkeen-retiree-welcome-dismissed"
        gradient="from-imamu-dark to-imamu-navy"
        icon={<Handshake className="w-6 h-6 text-white" />}
        title={
          isArabic
            ? `مرحباً ${user?.nameAr ?? ""}`
            : `Welcome back, ${user?.name?.split(" ").slice(0, 2).join(" ") ?? ""}`
        }
        description={
          isArabic
            ? `لديك ${retireeOpps.length} فرص مطابقة لخبرتك في ${retireeProfile.industryAr}`
            : `You have ${retireeOpps.length} opportunities matched to your ${retireeProfile.industry} expertise`
        }
      />

      <NextStepCard
        icon={<Briefcase className="w-7 h-7 text-white" />}
        label={isArabic ? "خطوتك التالية" : "Your Next Step"}
        heading={
          isArabic
            ? `استكشف ${retireeOpps.length} فرص استشارية تناسبك`
            : `Explore ${retireeOpps.length} matched consulting opportunities`
        }
        bullets={[
          isArabic
            ? `فرص مطابقة لخبرتك في ${retireeProfile.industryAr}`
            : `Matched to your ${retireeProfile.industry} expertise`,
          isArabic
            ? `تناسب توفرك (${retireeProfile.availability})`
            : `Fits your availability (${retireeProfile.availability})`,
          isArabic
            ? "ابدأ مشاركة خبرتك اليوم"
            : "Start sharing your expertise today",
        ]}
        ctaHref="/opportunities"
        ctaLabel={isArabic ? "استكشف الفرص" : "Explore Opportunities"}
      />

      <QuickStatsGrid
        items={[
          {
            icon: <CalendarClock className="w-4 h-4 text-teal" />,
            iconBg: "bg-teal/15",
            label: isArabic ? "التوفر" : "Availability",
            value: retireeProfile.availability,
          },
          {
            icon: <Star className="w-4 h-4 text-yellow-400" />,
            iconBg: "bg-yellow-500/15",
            label: isArabic ? "التقييم" : "Avg. Rating",
            value: `${avgRating} / 5.0`,
          },
          {
            icon: <Clock className="w-4 h-4 text-blue-400" />,
            iconBg: "bg-blue-500/15",
            label: isArabic ? "الخبرة" : "Experience",
            value: `${retireeProfile.yearsExperience} ${isArabic ? "سنة" : "years"}`,
          },
          {
            icon: <Award className="w-4 h-4 text-green-400" />,
            iconBg: "bg-green-500/15",
            label: isArabic ? "القطاع" : "Industry",
            value: isArabic ? retireeProfile.industryAr : retireeProfile.industry,
          },
        ]}
      />

      <div className="mx-auto px-4 sm:px-6 mt-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Award className="w-5 h-5 text-teal" />}
            iconBg="bg-teal/15"
            value={`${retireeProfile.profileCompletion}%`}
            label={t("dashboard.profileComplete")}
            progress={retireeProfile.profileCompletion}
            progressColor="bg-teal"
            index={0}
          />
          <StatCard
            icon={<Briefcase className="w-5 h-5 text-blue-400" />}
            iconBg="bg-blue-500/15"
            value={String(myApplications.length)}
            label={t("dashboard.applications")}
            index={1}
          />
          <StatCard
            icon={<Star className="w-5 h-5 text-yellow-400" />}
            iconBg="bg-yellow-500/15"
            value={String(retireeProfile.engagements.length)}
            label={t("dashboard.pastEngagements")}
            index={2}
          />
          <StatCard
            icon={<Briefcase className="w-5 h-5 text-green-400" />}
            iconBg="bg-green-500/15"
            value={String(retireeOpps.length)}
            label={t("dashboard.matchedOpportunities")}
            index={3}
          />
        </div>
      </div>

      <div className="mx-auto px-4 sm:px-6 pb-12">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="space-y-6">
            <motion.div {...fade(0)}>
              <DashboardCard
                id="expertise"
                title={t("dashboard.areasOfExpertise")}
                icon={<Award className="w-[18px] h-[18px] text-teal" />}
              >
                <div className="flex flex-wrap gap-2">
                  {(isArabic && retireeProfile.expertiseAr
                    ? retireeProfile.expertiseAr
                    : retireeProfile.expertise
                  ).map((e) => (
                    <span
                      key={e}
                      className="px-4 py-2 rounded-full bg-teal/10 border border-teal/15 text-teal-light text-sm font-semibold"
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-white/50 font-semibold mb-3 mt-6">
                  {t("dashboard.preferredWorkTypes")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {retireeProfile.preferredWork.map((w) => (
                    <span
                      key={w}
                      className="px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/12 text-blue-400 text-sm font-semibold"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.1)}>
              <DashboardCard
                id="opportunities"
                title={t("dashboard.aiRecommendedOpps")}
                icon={<Briefcase className="w-[18px] h-[18px] text-teal" />}
                action={{ label: t("common.viewAll"), href: "/opportunities" }}
              >
                {retireeOpps.length === 0 ? (
                  <div className="text-center py-6">
                    <Briefcase className="w-8 h-8 text-white/15 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-white/60">
                      {isArabic ? 'لا توجد فرص استشارية متاحة الآن' : 'No consulting opportunities right now'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                  {retireeOpps.map((opp) => (
                    <div
                      key={opp.id}
                      className="glass-inner p-5 rounded-2xl transition duration-200 cursor-pointer hover:bg-white/[0.08]"
                      onClick={() => setSelectedOpp(opp)}
                    >
                      <div className="flex items-start gap-3">
                        <CompanyLogo logo={opp.companyLogo} name={opp.company} className="w-10 h-10 rounded-lg text-sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-white">
                            {l(opp, "title")}
                          </p>
                          <div className="flex flex-wrap gap-4 mt-1">
                            <span className="inline-flex items-center gap-1 text-xs text-white/40">
                              <MapPin className="w-3 h-3" />
                              {l(opp, "location")}
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-white/40">
                              <Clock className="w-3 h-3" />
                              {l(opp, "duration")}
                            </span>
                          </div>
                        </div>
                        <MatchBadge score={opp.matchScore} />
                      </div>
                      <p className="text-sm text-white/40 leading-relaxed my-3 line-clamp-2">
                        {l(opp, "description")}
                      </p>
                      <div className="flex items-center">
                        <SalaryText value={l(opp, 'salary')} className="font-display text-base font-bold text-teal" iconClassName="w-4 h-4" />
                        <span className="text-xs text-white/30 ms-4">
                          {opp.applicants} {t("common.applicants")}
                        </span>
                        <button
                          className="ms-auto px-5 py-2 bg-teal text-white rounded-lg text-sm font-bold hover:bg-teal-deep hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal/20 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOpp(opp);
                          }}
                        >
                          {t("common.viewDetails")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </DashboardCard>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div {...fade(0.05)}>
              <DashboardCard
                id="applications"
                title={t("dashboard.applicationTracker")}
                icon={<Briefcase className="w-[18px] h-[18px] text-teal" />}
                action={myApplications.length > 0 ? { label: t("common.viewAll"), href: "/applications" } : undefined}
              >
                {myApplications.length === 0 ? (
                  <div className="text-center py-6">
                    <Briefcase className="w-8 h-8 text-white/15 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-white/60">
                      {isArabic ? "لم تتقدم لأي فرصة بعد" : "No applications yet"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {myApplications.slice(0, 5).map((app) => (
                      <div
                        key={app.id}
                        className="glass-inner flex items-center justify-between p-4 rounded-xl transition duration-200"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {isArabic ? (app.roleAr ?? app.role) : app.role}
                          </p>
                          <p className="text-xs text-white/60 mt-0.5">
                            {isArabic ? (app.companyAr ?? app.company) : app.company}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full text-[11px] font-bold px-3 py-1 shrink-0 ms-3",
                            statusColors[app.status],
                          )}
                        >
                          {t(`common.${app.status}`)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </motion.div>

            <motion.div {...fade(0.15)}>
              <DashboardCard
                id="engagements"
                title={t("dashboard.pastEngagements")}
                icon={<Star className="w-[18px] h-[18px] text-teal" />}
              >
                <div className="space-y-2.5">
                  {retireeProfile.engagements.map((eng) => (
                    <div
                      key={eng.company + eng.role}
                      className="glass-inner flex items-center justify-between p-4 rounded-xl transition duration-200"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {eng.role}
                        </p>
                        <p className="text-xs text-white/60 mt-0.5">
                          {eng.company} · {eng.duration}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-yellow-400 shrink-0 ms-3">
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        {eng.rating}
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardCard>
            </motion.div>

            {/* Expertise Match */}
            <motion.div {...fade(0.25)}>
              <DashboardCard
                id="expertise-match"
                title={isArabic ? "تطابق الخبرة مع الفرص" : "Expertise Match"}
                icon={<CheckCircle2 className="w-[18px] h-[18px] text-teal" />}
              >
                <div className="space-y-3">
                  {retireeOpps.slice(0, 3).map((opp) => {
                    const matched = opp.skills.filter((s) =>
                      expertiseNames.some(
                        (e) =>
                          s.toLowerCase().includes(e) ||
                          e.includes(s.toLowerCase()),
                      ),
                    );
                    const missing = opp.skills.filter(
                      (s) =>
                        !expertiseNames.some(
                          (e) =>
                            s.toLowerCase().includes(e) ||
                            e.includes(s.toLowerCase()),
                        ),
                    );
                    return (
                      <div key={opp.id} className="glass-inner p-4 rounded-xl">
                        <div className="flex items-center gap-2 mb-2.5">
                          <CompanyLogo logo={opp.companyLogo} name={l(opp, "company")} className="w-6 h-6 rounded text-[10px]" />
                          <p className="text-sm font-semibold text-white truncate flex-1">
                            {l(opp, "company")}
                          </p>
                          <span className="text-[11px] font-bold text-teal">
                            {matched.length}/{opp.skills.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {matched.map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-green-500/10 text-green-400 px-2 py-1 rounded-md"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {s}
                            </span>
                          ))}
                          {missing.map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white/[0.04] text-white/40 px-2 py-1 rounded-md"
                            >
                              <AlertCircle className="w-3 h-3 text-amber-400/60" />
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DashboardCard>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Opportunity detail modal */}
      {selectedOpp && (
        <OpportunityDetailModal
          opportunity={selectedOpp}
          onClose={() => setSelectedOpp(null)}
        />
      )}
    </>
  );
}
