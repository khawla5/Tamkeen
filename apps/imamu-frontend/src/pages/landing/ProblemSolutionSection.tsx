import {
  Award,
  Briefcase,
  GraduationCap,
  Compass,
  ChevronRight,
  ScrollText,
  ClipboardCheck,
  Search,
  Building2,
  Layers,
} from "lucide-react";
import { useLanguage } from "@/i18n/context";
import { SectionHeader } from "./shared";

interface ChallengeCardData {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  items: string[];
}

function ChallengeCard({ card }: { card: ChallengeCardData }) {
  return (
    <div className="group relative bg-white rounded-2xl border border-neutral-200 shadow-sm hover:border-teal/30 transition-colors duration-200 overflow-hidden">
      <div className="p-7">
        <div className="flex items-center gap-4 mb-5">
          <div
            className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}
          >
            {card.icon}
          </div>
          <h3 className="font-display font-bold text-teal-dark text-lg">
            {card.title}
          </h3>
        </div>
        <ul className="space-y-3">
          {card.items.map((item, j) => (
            <li key={j} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-md bg-gray-50 text-teal-dark/40 flex items-center justify-center mt-0.5">
                <ChevronRight className="w-3 h-3" />
              </span>
              <span className="text-sm text-teal-dark/60 leading-relaxed">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProblemSolutionSection() {
  const { t } = useLanguage();

  const challengeCards: ChallengeCardData[] = [
    {
      icon: <GraduationCap className="w-6 h-6 text-teal-light" />,
      iconBg: "bg-teal-light/10",
      title: t("landing.studentChallenges"),
      items: [
        t("landing.studentProblem1"),
        t("landing.studentProblem2"),
        t("landing.studentProblem3"),
      ],
    },
    {
      icon: <Briefcase className="w-6 h-6 text-teal" />,
      iconBg: "bg-teal/10",
      title: t("landing.employeeChallenges"),
      items: [
        t("landing.employeeProblem1"),
        t("landing.employeeProblem2"),
        t("landing.employeeProblem3"),
      ],
    },
    {
      icon: <Award className="w-6 h-6 text-teal-dark" />,
      iconBg: "bg-teal-dark/10",
      title: t("landing.expertChallenges"),
      items: [
        t("landing.expertProblem1"),
        t("landing.expertProblem2"),
        t("landing.expertProblem3"),
      ],
    },
    {
      icon: <Building2 className="w-6 h-6 text-terra" />,
      iconBg: "bg-terra/10",
      title: t("landing.orgChallenges"),
      items: [
        t("landing.orgProblem1"),
        t("landing.orgProblem2"),
        t("landing.orgProblem3"),
      ],
    },
  ];

  const solutionItems = [
    { icon: <ScrollText className="w-5 h-5" />, text: t("landing.solution1") },
    { icon: <Compass className="w-5 h-5" />, text: t("landing.solution2") },
    { icon: <Search className="w-5 h-5" />, text: t("landing.solution3") },
    { icon: <Layers className="w-5 h-5" />, text: t("landing.solution4") },
    {
      icon: <ClipboardCheck className="w-5 h-5" />,
      text: t("landing.solution5"),
    },
  ];

  // Solid ice canvas frames the problem statement calmly and gives the eye a
  // clean rest after the dark hero.
  return (
    <section id="challenges" className="relative bg-imamu-ice scroll-mt-16">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <SectionHeader
          tag={t("landing.challengeTag")}
          title={t("landing.challengeTitle")}
          subtitle={t("landing.challengeSubtitle")}
        />

        {/* 2×2 Challenge Cards Grid */}
        <div className="grid sm:grid-cols-2 gap-5 mb-4">
          {challengeCards.map((card, i) => (
            <ChallengeCard key={i} card={card} />
          ))}
        </div>

        {/* Wide Solution Card — solid navy, flat */}
        <div className="relative bg-imamu-dark rounded-2xl border border-white/10 shadow-sm overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0L40 20L20 40L0 20Z' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative p-8 lg:p-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-teal/20 flex items-center justify-center">
                <Compass className="w-6 h-6 text-teal-light" />
              </div>
              <h3 className="font-display font-bold text-white text-xl">
                {t("landing.fursatiSolution")}
              </h3>
            </div>

            {/* Desktop: static curved journey path (RTL — flows right to left) */}
            <div
              className="hidden md:block relative"
              style={{ aspectRatio: "1000 / 340" }}
            >
              <svg
                viewBox="0 0 1000 340"
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {/* Curved journey path — physically drawn right → left for RTL flow.
                    Anchor points (in viewBox order): (900,180) (710,80) (500,200) (290,80) (100,180) */}
                <path
                  d="M 900 180 C 850 180, 760 80, 710 80 C 660 80, 550 200, 500 200 C 450 200, 380 80, 290 80 C 200 80, 150 180, 100 180"
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="1 6"
                />
              </svg>

              {/* Nodes positioned along the curve — flipped so step 1 sits on the right (RTL flow) */}
              {/* Each position matches exactly an anchor point of the path: (100,180) (290,80) (500,200) (710,80) (900,180) */}
              {/* Mirror x: 100% - original_x. y stays the same. */}
              {solutionItems.map((item, i) => {
                const positions = [
                  { x: 90, y: 52.9 },
                  { x: 71, y: 23.5 },
                  { x: 50, y: 58.8 },
                  { x: 29, y: 19.5 },
                  { x: 10, y: 52.9 },
                ];
                const pos = positions[i];
                return (
                  <div
                    key={i}
                    className="group absolute flex flex-col items-center"
                    // Anchor the CIRCLE's center on the coordinate:
                    // • translate(-50%, 0) horizontally centers the column.
                    // • marginTop: -32px shifts the whole column up by half the circle height (64 / 2),
                    //   so the circle's center sits exactly on `top: pos.y%`, and the label flows below it.
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      transform: "translate(-50%, 0)",
                      marginTop: -32,
                    }}
                  >
                    {/* Node circle — solid navy, gold ring, flat */}
                    <div className="relative w-16 h-16 rounded-full bg-imamu-navy border-2 border-imamu-gold/40 flex items-center justify-center">
                      <span className="text-teal-light [&>svg]:w-6 [&>svg]:h-6">
                        {item.icon}
                      </span>
                    </div>
                    {/* Label */}
                    <div className="mt-3 max-w-[160px] text-center">
                      <p className="text-[12px] text-white/75 leading-snug font-medium">
                        {item.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile fallback: simple vertical list */}
            <div className="md:hidden space-y-3">
              {solutionItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3.5 border border-white/10"
                >
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-teal/15 text-teal-light flex items-center justify-center mt-0.5">
                    {item.icon}
                  </span>
                  <span className="text-sm text-white/70 leading-relaxed">
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
