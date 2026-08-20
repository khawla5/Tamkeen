import { common as commonEn } from './en/common'
import { landing as landingEn } from './en/landing'
import { login as loginEn } from './en/login'
import { opportunities as opportunitiesEn } from './en/opportunities'
import { cvBuilder as cvBuilderEn } from './en/cvBuilder'
import { assessment as assessmentEn } from './en/assessment'
import { dashboard as dashboardEn } from './en/dashboard'
import { student as studentEn } from './en/student'
import { retiree as retireeEn } from './en/retiree'
import { company as companyEn } from './en/company'
import { university as universityEn } from './en/university'
import { provider as providerEn } from './en/provider'
import { validation as validationEn } from './en/validation'
import { onboarding as onboardingEn } from './en/onboarding'
import { applications as applicationsEn } from './en/applications'
import { guide as guideEn } from './en/guide'

import { common as commonAr } from './ar/common'
import { landing as landingAr } from './ar/landing'
import { login as loginAr } from './ar/login'
import { opportunities as opportunitiesAr } from './ar/opportunities'
import { cvBuilder as cvBuilderAr } from './ar/cvBuilder'
import { assessment as assessmentAr } from './ar/assessment'
import { dashboard as dashboardAr } from './ar/dashboard'
import { student as studentAr } from './ar/student'
import { retiree as retireeAr } from './ar/retiree'
import { company as companyAr } from './ar/company'
import { university as universityAr } from './ar/university'
import { provider as providerAr } from './ar/provider'
import { validation as validationAr } from './ar/validation'
import { onboarding as onboardingAr } from './ar/onboarding'
import { applications as applicationsAr } from './ar/applications'
import { guide as guideAr } from './ar/guide'

export const translations: Record<string, Record<string, Record<string, string>>> = {
  en: {
    common: commonEn,
    landing: landingEn,
    login: loginEn,
    opportunities: opportunitiesEn,
    cvBuilder: cvBuilderEn,
    assessment: assessmentEn,
    dashboard: dashboardEn,
    student: studentEn,
    retiree: retireeEn,
    company: companyEn,
    university: universityEn,
    provider: providerEn,
    validation: validationEn,
    onboarding: onboardingEn,
    applications: applicationsEn,
    guide: guideEn,
  },
  ar: {
    common: commonAr,
    landing: landingAr,
    login: loginAr,
    opportunities: opportunitiesAr,
    cvBuilder: cvBuilderAr,
    assessment: assessmentAr,
    dashboard: dashboardAr,
    student: studentAr,
    retiree: retireeAr,
    company: companyAr,
    university: universityAr,
    provider: providerAr,
    validation: validationAr,
    onboarding: onboardingAr,
    applications: applicationsAr,
    guide: guideAr,
  },
}
