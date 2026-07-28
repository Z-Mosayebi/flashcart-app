"use client";

import { useState } from "react";
import clsx from "clsx";

/**
 * Derives up to two initials from a display name, falling back to the email's
 * first character. Credentials accounts have no photo, and a name is optional,
 * so there is always some last-resort glyph to show.
 */
function initialsFrom(name?: string | null, email?: string | null): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.length >= 2 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0][0]];
    return letters.join("").toUpperCase();
  }
  return (email?.trim()[0] ?? "?").toUpperCase();
}

export default function UserAvatar({
  name,
  email,
  image,
  size = 32,
  className,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  // Google avatar URLs expire and can 404. Track that so a broken photo falls
  // back to initials rather than leaving a torn-image icon in the header.
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(image) && !broken;

  return (
    <span
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        !showImage && "bg-brand font-medium text-white",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {showImage ? (
        // Plain <img> rather than next/image: these are third-party URLs that
        // would each need allowlisting in next.config.js, and the avatar is
        // small enough that the optimiser buys nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image as string}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initialsFrom(name, email)
      )}
    </span>
  );
}
