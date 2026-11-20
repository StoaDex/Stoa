import type { Metadata } from "next";
import { PageHead } from "@/components/ui";
import LaunchPanel from "@/components/LaunchPanel";

export const metadata: Metadata = { title: "Launch panel", robots: { index: false, follow: false } };

export default function LaunchPage() {
  return (
    <section className="page">
      <PageHead eyebrow="LAUNCH PANEL · MON 23 NOV 2026" title="Spotlight week 1 and Points season 1">
        Everything that matters on launch day, live on one screen.
      </PageHead>
      <LaunchPanel />
    </section>
  );
}
