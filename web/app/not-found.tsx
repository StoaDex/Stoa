import Link from "next/link";
import Backdrop from "@/components/Backdrop";
import Header from "@/components/Header";
export default function NotFound() {
  return (
    <>
      <Backdrop /><Header />
      <main id="app"><section className="page"><div className="panel empty"><img src="/logo.png" alt="" style={{ width: 64, height: 64 }} /><h3>This column isn&apos;t here</h3><p>The page you are looking for does not exist.</p><Link className="cta" href="/">Back to the Stoa</Link></div></section></main>
    </>
  );
}
