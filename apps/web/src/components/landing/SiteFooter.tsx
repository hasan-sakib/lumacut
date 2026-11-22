import { Link } from "react-router";
import { Logo } from "../Logo.tsx";
import {
  DoodleCrewFooter,
  type FooterAnchorProps,
  type FooterColumn,
} from "../ui/doodle-crew-footer.tsx";
import { SECTIONS, TOOLS } from "./content.ts";
import { DOODLE_PALETTE, DOODLE_SANS } from "./LumacutScene.tsx";

/** App routes go through the router (no page reload); anchors and other links stay plain. */
function RouterAnchor({ href, className, style, onClick, children }: FooterAnchorProps) {
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={className} style={style} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} style={style} onClick={onClick}>
      {children}
    </a>
  );
}

const COLUMNS: FooterColumn[] = [
  { title: "Product", links: SECTIONS.map((s) => ({ label: s.label, href: `#${s.id}` })) },
  { title: "Tools", links: TOOLS.map((t) => ({ label: t.label, href: "#features" })) },
  {
    title: "Account",
    links: [
      { label: "Get started", href: "/register" },
      { label: "Log in", href: "/login" },
    ],
  },
];

/**
 * The landing page's footer, in the doodle style: logo, blurb, link columns and the bottom bar
 * (the doodle LUMACUT itself lives at the top of the page).
 */
export function SiteFooter() {
  return (
    <DoodleCrewFooter
      scene={false}
      logo={<Logo />}
      blurb="Video editing, motion graphics and photo editing in one studio that runs in your browser."
      columns={COLUMNS}
      copyright="© Lumacut"
      palette={DOODLE_PALETTE}
      fontFamily={DOODLE_SANS}
      serifFamily={DOODLE_SANS}
      height="auto"
      linkAs={RouterAnchor}
    />
  );
}
