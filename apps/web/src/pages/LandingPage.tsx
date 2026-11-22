import { EffectShowcase } from "../components/landing/EffectShowcase.tsx";
import { Hero } from "../components/landing/Hero.tsx";
import { MotionProvider } from "../components/landing/motion.tsx";
import { Navbar } from "../components/landing/Navbar.tsx";
import { ComingNext, Faq, FeatureGrid, Steps } from "../components/landing/Sections.tsx";
import { SiteFooter } from "../components/landing/SiteFooter.tsx";
import { TemplateShowcase } from "../components/landing/TemplateShowcase.tsx";
import { ToolTabs } from "../components/landing/ToolTabs.tsx";

/**
 * The public front page: what Lumacut is, shown with the real templates and effects. Sections
 * reveal as they scroll in (Motion); loaded lazily so signed-in users never download it.
 */
export function LandingPage() {
  return (
    <MotionProvider>
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
        </main>
        <SiteFooter />
      </div>
    </MotionProvider>
  );
}
