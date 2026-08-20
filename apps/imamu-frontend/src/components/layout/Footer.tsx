import { Link } from "react-router-dom";
import { useLanguage } from "@/i18n/context";
import TamkeenLogo from "@/components/TamkeenLogo";

export default function Footer() {
  const { t } = useLanguage();

  const platformLinks = [
    { label: t("common.opportunities"), to: "/opportunities" },
    { label: t("common.skillsRecord"), to: "/skills-record" },
    { label: t("common.careerAssessment"), to: "/assessment" },
    { label: t("common.signIn"), to: "/login" },
  ];

  // Retiree dashboard hidden in Tamkeen — kept out of the visible footer.
  const dashboardLinks = [
    { label: t("common.student"), to: "/dashboard/student" },
    { label: t("common.employer"), to: "/dashboard/company" },
    { label: t("common.university"), to: "/dashboard/university" },
    { label: t("common.trainingProvider"), to: "/dashboard/provider" },
  ];

  const companyLinks = [
    { label: t("common.aboutUs"), to: "#" },
    { label: t("common.contact"), to: "#" },
    { label: t("common.privacyPolicy"), to: "#" },
    { label: t("common.termsOfService"), to: "#" },
  ];

  // Footer continues the FinalCTA's deep heritage gold downward — its top
  // edge picks up exactly where FinalCTA's bottom ends (#1a1409) and
  // fades darker into the page floor. The whole closing arc reads as
  // one unbroken gold envelope from the CTA through the footer.
  return (
    <footer className="relative bg-imamu-dark text-imamu-gold-50/70 overflow-hidden border-t-2 border-imamu-gold/40">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <Link to="/" className="inline-block group transition-transform duration-200 group-hover:scale-[1.03]">
              <TamkeenLogo variant="full" size="sm" darkBg />
            </Link>
            <p className="text-sm text-imamu-gold-50/65 mb-4 mt-3 leading-relaxed">
              {t("common.footerTagline")}
            </p>
            <p className="text-xs text-imamu-gold-50/35">
              {t("common.commercialRegister")}
            </p>

            {/* Academic partner — IMSIU on a light plate so the blue crest stays
                legible against the dark footer. */}
            <div className="mt-6 flex items-center gap-4">
              <img
                src="/brand/imsiu_emblem.jpg"
                alt={t("common.imsiuPartnership")}
                className="h-28 w-auto rounded-lg bg-white p-1.5 shadow-sm shrink-0"
              />
              <p className="text-xs text-imamu-gold-50/60 leading-relaxed max-w-[12rem]">
                {t("common.imsiuPartnership")}
              </p>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="font-display font-bold text-imamu-warm-gold text-sm uppercase tracking-wider mb-5">
              {t("common.platform")}
            </h3>
            <ul className="space-y-3">
              {platformLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-imamu-gold-50/60 hover:text-imamu-warm-gold transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Dashboards */}
          <div>
            <h3 className="font-display font-bold text-imamu-warm-gold text-sm uppercase tracking-wider mb-5">
              {t("common.dashboards")}
            </h3>
            <ul className="space-y-3">
              {dashboardLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-imamu-gold-50/60 hover:text-imamu-warm-gold transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-display font-bold text-imamu-warm-gold text-sm uppercase tracking-wider mb-5">
              {t("common.companyLabel")}
            </h3>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-imamu-gold-50/60 hover:text-imamu-warm-gold transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar — gold hairline now reads as the brass edge of the
            heritage envelope, not just a brand accent on a navy footer. */}
        <div className="mt-12 pt-6 border-t border-imamu-gold/30">
          <p className="text-sm text-imamu-gold-50/50 text-center">{t("common.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
