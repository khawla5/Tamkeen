import { HeroSection } from './landing/HeroSection'
import { ProblemSolutionSection } from './landing/ProblemSolutionSection'
import { CoreFeaturesSection } from './landing/CoreFeaturesSection'
import { UserJourneysSection } from './landing/UserJourneysSection'
import { StakeholderSection } from './landing/StakeholderSection'
import { PartnershipsSection } from './landing/PartnershipsSection'
import { FinalCTASection } from './landing/FinalCTASection'

export default function Landing() {
  return (
    <>
      <HeroSection />
      <ProblemSolutionSection />
      <CoreFeaturesSection />
      <UserJourneysSection />
      <StakeholderSection />
      <PartnershipsSection />
      <FinalCTASection />
    </>
  )
}
