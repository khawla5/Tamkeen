import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  Search,
  PlusCircle,
  Globe,
  LogOut,
  X,
  Compass,
  UserCircle2,
  MessageSquare,
  ClipboardList,
  Route,
  GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, type Role } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/context";
import { cn } from "@/lib/utils";
import UserAvatar from "@/components/shared/UserAvatar";
import TamkeenLogo from "@/components/TamkeenLogo";

interface NavItem {
  icon: LucideIcon;
  label: string;
  route: string;
  scrollTo?: string;
  badge?: string;
}

function getRoleNav(role: Role, t: (k: string) => string, isArabic: boolean): NavItem[] {
  const profileItem: NavItem = {
    icon: UserCircle2,
    label: isArabic ? "الملف الشخصي" : "Profile",
    route: "/profile",
  };

  const applicationsItem: NavItem = {
    icon: ClipboardList,
    label: t("applications.title"),
    route: "/applications",
  };

  switch (role) {
    case "student":
      return [
        { icon: LayoutDashboard, label: t("dashboard.dashboard"),                        route: "/dashboard/student" },
        { icon: Compass,         label: isArabic ? "التقييم المهني" : "Career Assessment", route: "/careers" },
        { icon: Route,           label: isArabic ? "المسار التدريبي" : "Training Path",   route: "/training-path" },
        { icon: FileText,        label: isArabic ? "السجل المهاري" : "Skills Record",     route: "/skills-record" },
        { icon: Search,          label: t("common.opportunities"),                        route: "/opportunities" },
        applicationsItem,
        { icon: MessageSquare,   label: t("common.interviewPrep"),
          route: "/interview-prep",
          badge: isArabic ? "قريباً" : "soon" },
        { icon: GraduationCap,   label: isArabic ? "الخريجين" : "Alumni",                 route: "/alumni" },
        profileItem,
      ];
    // Hidden in Tamkeen UI — kept for future re-enable. Falls through to a minimal nav
    // so any direct visit doesn't crash; the dashboards themselves are unrouted.
    case "retiree":
    case "employee":
      return [
        applicationsItem,
        profileItem,
      ];
    case "company":
      return [
        { icon: ClipboardList,   label: isArabic ? "إعلاناتي" : "My Postings",            route: "/dashboard/company" },
        { icon: PlusCircle,      label: t("dashboard.postOpportunity"),                   route: "/post-opportunity" },
        profileItem,
      ];
    case "university":
      return [
        { icon: LayoutDashboard, label: t("dashboard.dashboard"),                         route: "/dashboard/university" },
        profileItem,
      ];
    case "provider":
      return [
        { icon: LayoutDashboard, label: t("dashboard.dashboard"),                         route: "/dashboard/provider" },
        { icon: PlusCircle,      label: isArabic ? "نشر دورة" : "Post Course",            route: "/post-opportunity" },
        profileItem,
      ];
  }
}

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, role, signOut } = useAuth();
  const { t, lang, setLang, isArabic } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  // Esc to close + lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!user || !role) return null;

  const navItems = getRoleNav(role, t, isArabic);

  function handleNavClick(item: NavItem) {
    onClose();
    if (item.scrollTo && location.pathname === item.route) {
      document.getElementById(item.scrollTo)?.scrollIntoView({ behavior: "smooth" });
    } else if (item.scrollTo) {
      navigate(item.route);
      setTimeout(() => {
        document.getElementById(item.scrollTo!)?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    } else {
      navigate(item.route);
    }
  }

  function isActive(item: NavItem) {
    if (item.scrollTo) return false;
    return location.pathname === item.route;
  }

  const drawerWidth = 320;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sidebar-backdrop"
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            key="sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={isArabic ? "القائمة" : "Menu"}
            className="fixed inset-y-0 start-0 w-80 bg-imamu-dark z-50 shadow-2xl shadow-black/30 flex flex-col"
            initial={{ x: isArabic ? drawerWidth : -drawerWidth }}
            animate={{ x: 0 }}
            exit={{ x: isArabic ? drawerWidth : -drawerWidth }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center justify-between">
              <Link
                to="/"
                onClick={onClose}
                className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded-lg transition-transform duration-200 group-hover:scale-[1.03]"
              >
                <TamkeenLogo variant="full" size="md" darkBg />
              </Link>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
                aria-label={isArabic ? "إغلاق القائمة" : "Close menu"}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Divider */}
            <div className="mx-4 h-px bg-white/[0.06]" />

            {/* Navigation */}
            <nav className="flex-1 py-4 px-3 overflow-y-auto">
              <div className="space-y-0.5">
                {navItems.map((item) => {
                  const active = isActive(item);
                  return (
                    <button
                      key={item.label + (item.scrollTo ?? "")}
                      onClick={() => handleNavClick(item)}
                      className={cn(
                        "relative flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-colors text-start group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra/40",
                        active
                          ? "bg-terra/15 text-terra-light font-semibold"
                          : "text-white/40 hover:bg-white/[0.04] hover:text-white/70",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-terra"
                          transition={{ type: "spring", stiffness: 350, damping: 30 }}
                        />
                      )}
                      <item.icon
                        className={cn(
                          "w-[18px] h-[18px] shrink-0 transition-colors",
                          active ? "text-terra-light" : "text-white/30 group-hover:text-white/70",
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md min-w-[22px] text-center bg-terra/15 text-terra-light">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Language */}
            <div className="mx-4 h-px bg-white/[0.06]" />
            <div className="px-3 py-2">
              <button
                onClick={() => setLang(lang === "en" ? "ar" : "en")}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-white/30 hover:bg-white/[0.04] hover:text-white/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              >
                <Globe className="w-[18px] h-[18px]" aria-hidden="true" />
                {isArabic ? t("common.switchToEnglish") : t("common.switchToArabic")}
              </button>
            </div>

            {/* User */}
            <div className="mx-4 h-px bg-white/[0.06]" />
            <div className="p-3">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                <UserAvatar avatar={user.avatar} size="md" alt={isArabic ? user.nameAr : user.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white/85 truncate">
                    {isArabic ? user.nameAr : user.name}
                  </p>
                  <p className="text-[11px] text-white/30 truncate">
                    {t(`common.${role}`)}
                  </p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="w-full mt-1.5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-terra hover:bg-terra/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
              >
                <LogOut className="w-[18px] h-[18px] rtl:scale-x-[-1]" aria-hidden="true" />
                {t("login.signOut")}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
