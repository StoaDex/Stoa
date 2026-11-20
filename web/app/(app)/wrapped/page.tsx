import type { Metadata } from "next";
import { PageHead } from "@/components/ui";
import WrappedStart from "@/components/WrappedStart";

export const metadata: Metadata = {
  title: "Stoa Wrapped",
  description: "Your swaps through Stoa as a trading card: volume, favorite venue, top token, biggest swap and your $STOA edition.",
};

export default function Page() {
  return (
    <section className="page">
      <PageHead eyebrow="STOA WRAPPED" title="Your year on Stoa">Every swap you made through Stoa, as a card to share. Read from the chain.</PageHead>
      <WrappedStart />
    </section>
  );
}
