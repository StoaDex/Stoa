import type { Metadata } from "next";
import Journey from "@/components/Journey";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export default function Home() {
  return <Journey />;
}
