import { cn } from "@/lib/cn";

/**
 * Four small dots converge into one accent dot — visualizes the 4-signal-agents
 * folding into 1 decision verdict that defines the product.
 */
export function LogoMark({ className }: { className?: string }) {
  const inputs = [9, 16.5, 23.5, 31];
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("block", className)}
    >
      {inputs.map((y) => (
        <line
          key={`l-${y}`}
          x1="11.5"
          y1={y}
          x2="29"
          y2="20"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ))}
      {inputs.map((y) => (
        <circle
          key={`d-${y}`}
          cx="11"
          cy={y}
          r="2.1"
          fill="currentColor"
        />
      ))}
      <circle cx="29" cy="20" r="5" className="fill-accent" />
    </svg>
  );
}

interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showWordmark?: boolean;
}

const sizes = {
  sm: { box: "h-7 w-7 rounded-[8px]", mark: "h-5 w-5", text: "text-[14px]" },
  md: { box: "h-9 w-9 rounded-[10px]", mark: "h-6 w-6", text: "text-[17px]" },
  lg: { box: "h-10 w-10 rounded-[10px]", mark: "h-7 w-7", text: "text-[20px]" },
} as const;

export function Logo({ size = "md", className, showWordmark = true }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center gap-3 text-ink", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center border border-line bg-alabaster-grey/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,50,73,0.08)]",
          s.box,
        )}
      >
        <LogoMark className={s.mark} />
      </span>
      {showWordmark && (
        <span className={cn("font-display font-normal tracking-tight leading-none", s.text)}>
          Thundrly
        </span>
      )}
    </span>
  );
}
