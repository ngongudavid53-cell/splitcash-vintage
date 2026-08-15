import type { SVGProps } from "react";

/**
 * A small set of hand-drawn, sketch-style icons — single weight, slightly
 * wobbly strokes, round caps. Deliberately not a generic icon pack.
 */
function Base({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4.6 10.4c.5-2.7 3.6-4.4 7.4-4.4s6.9 1.7 7.4 4.4" />
      <path d="M4.6 10.4c0 4.2 3.4 7.5 7.4 7.5s7.4-3.3 7.4-7.5" />
      <path d="M2.9 10.4h18.2" />
      <circle cx="8.1" cy="14.6" r="0.45" fill="currentColor" />
      <circle cx="12" cy="15.7" r="0.45" fill="currentColor" />
      <circle cx="15.9" cy="14.6" r="0.45" fill="currentColor" />
    </Base>
  );
}

export function PeopleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8.1" r="3.1" />
      <path d="M3.8 18.9c.5-3.3 2.6-5.1 5.2-5.1s4.7 1.8 5.2 5.1" />
      <circle cx="16.3" cy="9.9" r="2.3" />
      <path d="M15.7 13.9c2.4-.3 4.3 1.4 4.7 4.3" />
    </Base>
  );
}

export function ReceiptIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M7.3 3.8h9.4v16.6l-1.6-1.3-1.6 1.3-1.6-1.3-1.6 1.3-1.5-1.3-1.5 1.3z" />
      <path d="M9.2 8.2h5.6" />
      <path d="M9.2 11.2h3.6" />
      <path d="M9.2 14.2h4.4" />
    </Base>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12.3 4.9v14.2" />
      <path d="M5.2 12.3h14.2" />
    </Base>
  );
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="8.4" y="8.4" width="10.2" height="10.2" rx="1.2" />
      <path d="M15.6 8.4V6.1H4.6v10.9h2.3" />
    </Base>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4.6 12.9l4.5 4.3 10.3-11.4" />
    </Base>
  );
}

/** A transfer arrow for settle-up rows. */
export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4.4 12.2h13.6" />
      <path d="M13.4 6.9l5.4 5.3-5.4 5.3" />
    </Base>
  );
}

/** Tally marks — five strokes, bookkeeping made visible. */
export function TallyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M6 5.6v12" />
      <path d="M10 5.6v12" />
      <path d="M14 5.6v12" />
      <path d="M18 5.6v12" />
      <path d="M18 7.2l-12 6.4" />
    </Base>
  );
}

export function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4.2 7.6h13.4a2 2 0 0 1 2 2v7H5.6a2 2 0 0 1-2-2z" />
      <path d="M5.6 17.6V6.4a1.2 1.2 0 0 1 1.2-1.2H16.8" />
      <circle cx="16.1" cy="12.6" r="0.6" fill="currentColor" />
    </Base>
  );
}

export function PenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4.6 19.4l1-4.1L17.1 3.8a2 2 0 0 1 2.8 2.9L8.6 18 4.6 19.4z" />
      <path d="M15.2 5.8l3 3" />
    </Base>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M6.4 6.4l11.2 11.2" />
      <path d="M17.6 6.4L6.4 17.6" />
    </Base>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M13.8 4.8H6.2a1.4 1.4 0 0 0-1.4 1.4v11.6a1.4 1.4 0 0 0 1.4 1.4h7.6" />
      <path d="M16.8 8.2l4 3.8-4 3.8" />
      <path d="M10.6 12h10.2" />
    </Base>
  );
}

/** A sticky-note, for marginalia. */
export function NoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M5 4h11.4l3.6 3.6V20H5z" />
      <path d="M16.4 4v3.6H20" />
      <path d="M8.4 10.4h7.2" />
      <path d="M8.4 13.6h7.2" />
    </Base>
  );
}

/** A little asterisk flourish, for stamps and footnotes. */
export function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3.6v16.8" />
      <path d="M3.8 12h16.4" />
      <path d="M6.1 6.1l11.8 11.8" />
      <path d="M17.9 6.1L6.1 17.9" />
    </Base>
  );
}
