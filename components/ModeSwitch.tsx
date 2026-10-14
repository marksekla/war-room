"use client";

/** Segmented switch between two views of a page (same look as the Waivers switch). */
export default function ModeSwitch<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-card p-0.5 text-xs font-medium sm:w-fit" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 sm:flex-none ${value === o.id ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
