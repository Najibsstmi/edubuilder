const WHATSAPP_URL =
  "https://wa.me/60197909548?text=Edubuilder%20untuk%20akses%20premium"

export function PremiumContactCard({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`premium-contact-card ${compact ? "compact" : ""}`}>
      <div className="premium-contact-copy">
        <span className="premium-kicker">Akses Premium</span>
        <h2>Ingin membuka akses Premium EduBuilder?</h2>
        <p>
          Hubungi Developer: <strong>Cikgu Najib</strong> <span>019-7909548</span>
        </p>
        <p>
          WhatsApp untuk maklumat langganan akses penuh dan bantuan penggunaan sistem.
        </p>
      </div>

      <a
        className="premium-whatsapp-link"
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp Cikgu Najib untuk akses premium EduBuilder"
      >
        <span className="premium-wa-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" focusable="false">
            <path d="M16 3.2A12.7 12.7 0 0 0 5.2 22.6L4 29l6.6-1.7A12.8 12.8 0 1 0 16 3.2Zm0 23.4c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-3.9 1 1-3.8-.3-.4a10.6 10.6 0 1 1 9 4.9Zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-2.6-1.6 9.8 9.8 0 0 1-1.8-2.3c-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.5 0-.6s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.2-1.2 2.9 1.2 3.3 1.4 3.5c.2.2 2.4 3.7 5.9 5.2.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" />
          </svg>
        </span>
        <span>Klik di sini</span>
      </a>
    </section>
  )
}
