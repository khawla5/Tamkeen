import { useLanguage } from "@/i18n/context";
import { SectionHeader } from "./shared";
import inuniLogo from "@/assets/partners-logos/academic-logos/partners-logos/inuni-white.png";
import ardenLogo from "@/assets/partners-logos/academic-logos/partners-logos/ARDEN.png";
import avLogo from "@/assets/partners-logos/academic-logos/partners-logos/AV.png";
import cctbLogo from "@/assets/partners-logos/academic-logos/partners-logos/CCTB.png";
import fcLogo from "@/assets/partners-logos/academic-logos/partners-logos/FC.png";
import fmuLogo from "@/assets/partners-logos/academic-logos/partners-logos/FMU.png";
import highqLogo from "@/assets/partners-logos/academic-logos/partners-logos/HIGHQ.png";
import hpLogo from "@/assets/partners-logos/academic-logos/partners-logos/HP.png";
import huLogo from "@/assets/partners-logos/academic-logos/partners-logos/HU.png";
import ibalLogo from "@/assets/partners-logos/academic-logos/partners-logos/IBAL.png";
import intLogo from "@/assets/partners-logos/academic-logos/partners-logos/INT.png";
import laLogo from "@/assets/partners-logos/academic-logos/partners-logos/LA.png";
import lbfLogo from "@/assets/partners-logos/academic-logos/partners-logos/LBF.png";
import lccaLogo from "@/assets/partners-logos/academic-logos/partners-logos/LCCA.png";
import lccmLogo from "@/assets/partners-logos/academic-logos/partners-logos/LCCM.png";
import lgLogo from "@/assets/partners-logos/academic-logos/partners-logos/LG.png";
import lgcLogo from "@/assets/partners-logos/academic-logos/partners-logos/LGC.png";
import lmLogo from "@/assets/partners-logos/academic-logos/partners-logos/LM.png";
import londonBusinessLogo from "@/assets/partners-logos/academic-logos/partners-logos/London-business.png";
import mcnyLogo from "@/assets/partners-logos/academic-logos/partners-logos/MCNY.png";
import muaLogo from "@/assets/partners-logos/academic-logos/partners-logos/MUA.png";
import pennStateLawLogo from "@/assets/partners-logos/academic-logos/partners-logos/PennState-Law.png";
import rpiLogo from "@/assets/partners-logos/academic-logos/partners-logos/RPI.png";
import sabaLogo from "@/assets/partners-logos/academic-logos/partners-logos/SABA.png";
import sdsuLogo from "@/assets/partners-logos/academic-logos/partners-logos/SDSU.png";
import tsmLogo from "@/assets/partners-logos/academic-logos/partners-logos/TSM.png";
import uaLogo from "@/assets/partners-logos/academic-logos/partners-logos/UA.png";
import uaseLogo from "@/assets/partners-logos/academic-logos/partners-logos/UASE.png";
import ucwLogo from "@/assets/partners-logos/academic-logos/partners-logos/UCW.png";
import ueDxbLogo from "@/assets/partners-logos/academic-logos/partners-logos/UE-DXB.png";
import ueLogo from "@/assets/partners-logos/academic-logos/partners-logos/UE.png";
import ulLogo from "@/assets/partners-logos/academic-logos/partners-logos/UL.png";
import unfcLogo from "@/assets/partners-logos/academic-logos/partners-logos/UNFC.png";
import upesLogo from "@/assets/partners-logos/academic-logos/partners-logos/UPES.png";
import berlinBusinessLogo from "@/assets/partners-logos/academic-logos/partners-logos/berlin-business.png";
import futureLearnLogo from "@/assets/partners-logos/academic-logos/partners-logos/future-learn.png";
import gismaLogo from "@/assets/partners-logos/academic-logos/partners-logos/gisma.png";
import htkLogo from "@/assets/partners-logos/academic-logos/partners-logos/htk.png";
import pearlLogo from "@/assets/partners-logos/academic-logos/partners-logos/pearl.png";
import stMatLogo from "@/assets/partners-logos/academic-logos/partners-logos/st-mat.png";
import trebasLogo from "@/assets/partners-logos/academic-logos/partners-logos/trebas.png";
import classpertsLogo from "@/assets/partners-logos/tech-logos/classperts.png";
import beTrainingLogo from "@/assets/partners-logos/training-logos/be-training.png";

const academicSubUnits: { name: string; logo: string }[] = [
  { name: "Arden University", logo: ardenLogo },
  { name: "AV", logo: avLogo },
  { name: "CCTB", logo: cctbLogo },
  { name: "FC", logo: fcLogo },
  { name: "FMU", logo: fmuLogo },
  { name: "HIGHQ", logo: highqLogo },
  { name: "HP", logo: hpLogo },
  { name: "HU", logo: huLogo },
  { name: "IBAL", logo: ibalLogo },
  { name: "INT", logo: intLogo },
  { name: "LA", logo: laLogo },
  { name: "LBF", logo: lbfLogo },
  { name: "LCCA", logo: lccaLogo },
  { name: "LCCM", logo: lccmLogo },
  { name: "LG", logo: lgLogo },
  { name: "LGC", logo: lgcLogo },
  { name: "LM", logo: lmLogo },
  { name: "London School of Business", logo: londonBusinessLogo },
  { name: "MCNY", logo: mcnyLogo },
  { name: "MUA", logo: muaLogo },
  { name: "PennState Law", logo: pennStateLawLogo },
  { name: "RPI", logo: rpiLogo },
  { name: "SABA", logo: sabaLogo },
  { name: "SDSU", logo: sdsuLogo },
  { name: "TSM", logo: tsmLogo },
  { name: "UA", logo: uaLogo },
  { name: "UASE", logo: uaseLogo },
  { name: "UCW", logo: ucwLogo },
  { name: "UE Dubai", logo: ueDxbLogo },
  { name: "UE", logo: ueLogo },
  { name: "UL", logo: ulLogo },
  { name: "UNFC", logo: unfcLogo },
  { name: "UPES", logo: upesLogo },
  { name: "Berlin School of Business", logo: berlinBusinessLogo },
  { name: "FutureLearn", logo: futureLearnLogo },
  { name: "GISMA", logo: gismaLogo },
  { name: "HTK", logo: htkLogo },
  { name: "Pearl", logo: pearlLogo },
  { name: "St. Mary", logo: stMatLogo },
  { name: "Trebas", logo: trebasLogo },
];

export function PartnershipsSection() {
  const { isArabic } = useLanguage();

  return (
    <section
      id="partnerships"
      className="relative bg-white py-20 lg:py-28 scroll-mt-16 overflow-hidden"
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          tag={isArabic ? "شركاؤنا" : "Our Partners"}
          title={isArabic ? "شراكات موثوقة" : "Trusted Partnerships"}
        />

        {/* ── Academic Partner ── */}
        <div className="mb-14">
          <div className="relative bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Main academic partner header — solid gold band for the white logo */}
            <div className="relative flex flex-col items-center gap-4 px-6 py-10 lg:py-12 border-b border-imamu-gold-deep/20 bg-imamu-gold-deep overflow-hidden">
              {/* Subtle geometric texture */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
                  backgroundSize: "60px 60px",
                }}
              />

              <img
                src={inuniLogo}
                alt={isArabic ? "الشريك الأكاديمي" : "Academic Partner"}
                className="relative h-20 lg:h-24 w-auto object-contain"
              />
              <h3 className="relative font-display font-bold text-white text-lg lg:text-xl text-center">
                {isArabic ? "الشريك الأكاديمي" : "Academic Partner"}
              </h3>
            </div>

            {/* Sub-universities — slow auto-scrolling marquee (pauses on hover). */}
            <div className="relative">
              <div className="px-6 lg:px-8 pt-5 pb-3">
                <p className="text-xs uppercase tracking-wider text-muted font-semibold">
                  {isArabic
                    ? "الجامعات المشاركة"
                    : "Participating Universities"}
                </p>
              </div>

              <div className="group relative overflow-hidden py-4" dir="ltr">
                {/* Duplicate the list so the translate loop is seamless. */}
                <div
                  className="flex gap-6 w-max animate-marquee-x group-hover:[animation-play-state:paused]"
                  style={{ animationDuration: '90s' }}
                >
                  {[...academicSubUnits, ...academicSubUnits].map((uni, i) => (
                    <div
                      key={i}
                      aria-hidden={i >= academicSubUnits.length}
                      className="shrink-0 flex items-center justify-center w-[160px] h-[90px] bg-white border border-neutral-200 hover:border-teal/30 rounded-xl px-4 py-3 transition-colors duration-200"
                      title={uni.name}
                    >
                      <img
                        src={uni.logo}
                        alt={uni.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tech + Training Partners ── */}
        <div className="grid lg:grid-cols-2 gap-10">
          {/* Tech Partner */}
          <div className="group relative bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden h-full transition-colors duration-200 hover:border-teal/40">
            {/* Geometric triangle pattern — dark strokes for light background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='%230B353B' stroke-width='0.8'/%3E%3C/svg%3E")`,
                backgroundSize: "60px 60px",
              }}
            />
            <div className="relative flex flex-col items-center justify-center gap-5 px-6 py-10 lg:py-12">
              <img
                src={classpertsLogo}
                alt="Classperts"
                className="h-20 lg:h-24 w-auto object-contain"
              />
              <h3 className="font-display font-bold text-teal-dark text-lg lg:text-xl text-center">
                {isArabic ? "الشريك التقني" : "Technology Partner"}
              </h3>
            </div>
          </div>

          {/* Training Partner */}
          <div className="group relative bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden h-full transition-colors duration-200 hover:border-teal/40">
            {/* Geometric triangle pattern — dark strokes for light background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z' fill='none' stroke='%230B353B' stroke-width='0.8'/%3E%3C/svg%3E")`,
                backgroundSize: "60px 60px",
              }}
            />
            <div className="relative flex flex-col items-center justify-center gap-5 px-6 py-10 lg:py-12">
              <img
                src={beTrainingLogo}
                alt="Be Training"
                className="h-20 lg:h-24 w-auto object-contain"
              />
              <h3 className="font-display font-bold text-teal-dark text-lg lg:text-xl text-center">
                {isArabic ? "الشريك التدريبي" : "Training Partner"}
              </h3>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
