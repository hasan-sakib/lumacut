import { EffectShowcase } from "../components/landing/EffectShowcase.tsx";
import { Hero } from "../components/landing/Hero.tsx";
import { Navbar } from "../components/landing/Navbar.tsx";
import {
  CallToAction,
  ComingNext,
  Faq,
  FeatureGrid,
  Footer,
  Steps,
} from "../components/landing/Sections.tsx";
import { TemplateShowcase } from "../components/landing/TemplateShowcase.tsx";
import { ToolTabs } from "../components/landing/ToolTabs.tsx";

/** The public front page: what Lumacut is, shown with the real templates and effects. */
export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main id="main">
        <Hero />
        <ToolTabs />
        <TemplateShowcase />
        <EffectShowcase />
        <Steps />
        <FeatureGrid />
        <ComingNext />
        <Faq />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
