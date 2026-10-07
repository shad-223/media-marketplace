import clsx from "clsx";

/** Uploaded photo, or initials on a brand tint. Size via className (default h-10 w-10). */
export function Avatar({ username, src, className }: { username: string; src?: string | null; className?: string }) {
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`@${username}`} className={clsx("shrink-0 rounded-full object-cover", className || "h-10 w-10")} />;
  return (
    <span
      aria-label={`@${username}`}
      className={clsx("flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold uppercase text-brand-700", className || "h-10 w-10 text-sm")}
    >
      {username.slice(0, 2)}
    </span>
  );
}
