import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Backdrop from "@/components/Backdrop";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Backdrop plain />
      <Header />
      <main id="app">
        {children}
        <Footer />
      </main>
    </>
  );
}
