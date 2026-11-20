export default function Backdrop({ plain = false }: { plain?: boolean }) {
  return <div className={`backdrop${plain ? " plain" : ""}`} aria-hidden="true">{!plain && <img src="/backdrop.jpg" alt="" />}</div>;
}
