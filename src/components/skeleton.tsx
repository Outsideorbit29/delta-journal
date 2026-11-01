/** A loading screen in the shape of what is coming: a title, the heavy rule, then ruled rows. */
export function PageSkeleton({ label = "Loading…", rows = 6 }: { label?: string; rows?: number }) {
  return (
    <main id="main" className="container pt-10 pb-24" aria-busy="true">
      <p role="status" className="visually-hidden">
        {label}
      </p>
      <div aria-hidden="true">
        <div className="h-10 w-64 bg-paper-3" />
        <div className="mt-8 border-t-4 border-ink pt-6">
          <div className="h-6 w-48 bg-paper-2" />
          <div className="mt-6 divide-y divide-rule border-y border-rule-2">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-6 py-5">
                <div className="h-4 bg-paper-2" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
                <div className="h-6 w-24 bg-paper-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
