import { Link } from "react-router-dom"

type BrandLogoProps = {
  compact?: boolean
  centered?: boolean
  to?: string
}

export function BrandLogo({ compact = false, centered = false, to = "/" }: BrandLogoProps) {
  const content = (
    <>
      <img src="/logo/android-chrome-192x192.png" alt="EduBuilder" className="brand-logo-img" />
      <span className="brand-logo-text">
        <strong>EduBuilder</strong>
        {!compact && <small>Bina item dan set soalan Sains</small>}
      </span>
    </>
  )

  return (
    <Link to={to} className={`brand-logo ${compact ? "compact" : ""} ${centered ? "centered" : ""}`}>
      {content}
    </Link>
  )
}
