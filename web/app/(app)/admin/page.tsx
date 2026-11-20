import type { Metadata } from "next";
import { PageHead } from "@/components/ui";
import Admin from "@/components/Admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <section className="page">
      <PageHead eyebrow="ADMIN" title="Keys to the Stoa">Owner and guardian actions. The contracts check every permission; anyone else&apos;s calls revert.</PageHead>
      <Admin />
    </section>
  );
}
