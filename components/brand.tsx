import Link from "next/link";
import Image from "next/image";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function Brand({
  compact = false,
  href = "/",
  onDark = false,
}: {
  compact?: boolean;
  href?: string;
  onDark?: boolean;
}) {
  return (
    <Link
      className={`brand${compact ? " brand-compact" : ""}`}
      href={href}
      aria-label={
        href === "/admin"
          ? "Eastern Risen admin dashboard"
          : href === "/driver"
            ? "Eastern Risen driver dashboard"
            : "Eastern Risen home"
      }
    >
      <Image
        className="brand-logo"
        src={`${basePath}/${onDark ? "eastern-risen-logo-white.png" : "eastern-risen-logo.png"}`}
        width="922"
        height="271"
        alt=""
        aria-hidden="true"
        unoptimized
        priority
      />
    </Link>
  );
}
