import type { CSSProperties, ReactNode } from "react";

type BlockProps = {
  className?: string;
  style?: CSSProperties;
};

function GhostBlock({ className = "", style }: BlockProps) {
  return <div className={["ghost-block", className].filter(Boolean).join(" ")} style={style} />;
}

function GhostCard({
  className = "",
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <div className={["ghost-card", className].filter(Boolean).join(" ")}>{children}</div>;
}

function GhostLines({
  lines,
  widths,
  className = "",
}: {
  lines: number;
  widths?: string[];
  className?: string;
}) {
  return (
    <div className={["space-y-3", className].filter(Boolean).join(" ")}>
      {Array.from({ length: lines }).map((_, index) => (
        <GhostBlock
          key={`ghost-line-${index}`}
          className="h-3 rounded-full"
          style={{ width: widths?.[index] || "100%" }}
        />
      ))}
    </div>
  );
}

function AppBackdrop() {
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url(/spinner.png)",
          backgroundSize: "800px 800px",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          opacity: 0.06,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, rgba(0,229,255,0.08), transparent 28%), radial-gradient(circle at 82% 18%, rgba(255,45,150,0.08), transparent 24%), radial-gradient(circle at 50% 100%, rgba(255,255,255,0.03), transparent 35%)",
        }}
      />
    </>
  );
}

export function HomePageSkeleton() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 pb-8 pt-10 text-[var(--foreground)]">
      <AppBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-5xl space-y-8">
        <div className="mx-auto mb-6 w-full max-w-3xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <GhostBlock className="h-3 w-12 rounded-full" />
            <GhostBlock className="h-3 w-16 rounded-full" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-start">
              <GhostCard className="w-[72%] px-4 py-4">
                <GhostLines lines={2} widths={["80%", "58%"]} />
              </GhostCard>
            </div>
            <GhostCard className="mx-auto w-[80%] px-4 py-4">
              <div className="flex items-center gap-3">
                <GhostBlock className="h-8 w-8 rounded-full" />
                <GhostBlock className="h-4 flex-1 rounded-full" />
                <GhostBlock className="h-8 w-8 rounded-full" />
              </div>
            </GhostCard>
            <div className="mx-auto flex w-[80%] flex-wrap justify-center gap-2">
              <GhostBlock className="h-8 w-28 rounded-full" />
              <GhostBlock className="h-8 w-28 rounded-full" />
              <GhostBlock className="h-8 w-20 rounded-full" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <GhostBlock className="h-6 w-40 rounded-full" />
          <GhostBlock className="h-4 w-24 rounded-full" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <GhostCard key={`home-card-${index}`} className="min-h-[190px] p-5">
              <div className="flex h-full flex-col">
                <div className="space-y-3">
                  <GhostBlock className="h-5 w-[72%] rounded-full" />
                  <GhostBlock className="h-6 w-24 rounded-full" />
                  <GhostLines lines={2} widths={["88%", "56%"]} />
                </div>
                <div className="mt-auto flex items-center gap-2 pt-6">
                  <GhostBlock className="h-8 w-20 rounded-full" />
                  <GhostBlock className="h-8 w-24 rounded-full" />
                </div>
              </div>
            </GhostCard>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SubjectPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <GhostBlock className="h-9 w-72 rounded-full" />
          <GhostBlock className="h-10 w-28 rounded-xl" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-4">
            <GhostCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <GhostBlock className="h-5 w-20 rounded-full" />
                <div className="flex items-center gap-2">
                  <GhostBlock className="h-8 w-8 rounded-full" />
                  <GhostBlock className="h-8 w-20 rounded-full" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <GhostBlock className="h-8 w-24 rounded-full" />
                <GhostBlock className="h-8 w-24 rounded-full" />
              </div>
              <div className="mt-3 space-y-2 rounded-xl border border-[var(--foreground)]/10 p-2">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={`topic-skeleton-${index}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2">
                    <GhostBlock className="h-4 w-[65%] rounded-full" />
                    <GhostBlock className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            </GhostCard>
          </aside>

          <main className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <GhostCard key={`subject-top-card-${index}`} className="min-h-[250px] p-5">
                  <GhostBlock className="h-4 w-20 rounded-full" />
                  <GhostBlock className="mt-3 h-7 w-[68%] rounded-full" />
                  <GhostLines lines={3} widths={["95%", "86%", "64%"]} className="mt-4" />
                  <div className="mt-6 flex flex-wrap gap-2">
                    <GhostBlock className="h-8 w-24 rounded-full" />
                    <GhostBlock className="h-8 w-20 rounded-full" />
                    <GhostBlock className="h-8 w-28 rounded-full" />
                  </div>
                </GhostCard>
              ))}
            </div>

            <GhostCard className="p-5">
              <div className="flex items-center justify-between gap-3">
                <GhostBlock className="h-5 w-40 rounded-full" />
                <GhostBlock className="h-4 w-16 rounded-full" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <GhostCard key={`exam-card-${index}`} className="p-4">
                    <GhostBlock className="h-5 w-[62%] rounded-full" />
                    <GhostLines lines={3} widths={["92%", "84%", "55%"]} className="mt-3" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <GhostBlock className="h-6 w-20 rounded-full" />
                      <GhostBlock className="h-6 w-24 rounded-full" />
                    </div>
                  </GhostCard>
                ))}
              </div>
            </GhostCard>
          </main>
        </div>
      </div>
    </div>
  );
}

export function LessonPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <GhostBlock className="h-8 w-[58%] rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <GhostBlock className="h-7 w-24 rounded-full" />
            <GhostBlock className="h-7 w-20 rounded-full" />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <GhostBlock className="h-9 w-24 rounded-full" />
          <GhostBlock className="h-9 w-24 rounded-full" />
          <GhostBlock className="h-9 w-32 rounded-full" />
          <GhostBlock className="h-9 w-24 rounded-full" />
        </div>

        <GhostCard className="p-6">
          <GhostBlock className="h-4 w-28 rounded-full" />
          <GhostBlock className="mt-4 h-7 w-[42%] rounded-full" />
          <GhostLines
            lines={10}
            widths={["100%", "96%", "88%", "92%", "97%", "83%", "95%", "90%", "78%", "58%"]}
            className="mt-6"
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <GhostCard className="p-4">
              <GhostBlock className="h-5 w-28 rounded-full" />
              <GhostLines lines={3} widths={["90%", "76%", "55%"]} className="mt-3" />
            </GhostCard>
            <GhostCard className="p-4">
              <GhostBlock className="h-5 w-24 rounded-full" />
              <GhostLines lines={3} widths={["94%", "84%", "60%"]} className="mt-3" />
            </GhostCard>
          </div>
        </GhostCard>
      </div>
    </div>
  );
}

export function PracticePageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="border-b border-[var(--foreground)]/10 bg-[var(--background)]/90">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
          <div className="min-w-0 flex-1">
            <GhostBlock className="h-3 w-24 rounded-full" />
            <GhostBlock className="mt-2 h-5 w-52 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <GhostBlock className="h-8 w-24 rounded-full" />
            <GhostBlock className="h-8 w-20 rounded-full" />
            <GhostBlock className="h-8 w-20 rounded-full" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-6">
        <div className="flex-1 space-y-4">
          <div className="flex justify-start">
            <GhostCard className="w-[72%] px-4 py-4">
              <GhostLines lines={4} widths={["90%", "97%", "74%", "52%"]} />
            </GhostCard>
          </div>
          <div className="flex justify-end">
            <GhostCard className="w-[54%] px-4 py-4">
              <GhostLines lines={2} widths={["80%", "58%"]} />
            </GhostCard>
          </div>
          <div className="flex justify-start">
            <GhostCard className="w-[78%] px-4 py-4">
              <GhostLines lines={5} widths={["96%", "88%", "94%", "76%", "48%"]} />
            </GhostCard>
          </div>
        </div>

        <GhostCard className="mt-6 px-4 py-4">
          <div className="flex items-center gap-3">
            <GhostBlock className="h-9 w-9 rounded-full" />
            <GhostBlock className="h-4 flex-1 rounded-full" />
            <GhostBlock className="h-9 w-24 rounded-full" />
          </div>
        </GhostCard>
      </div>
    </div>
  );
}

export function SurgePageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <GhostBlock className="h-3 w-24 rounded-full" />
            <GhostBlock className="mt-3 h-8 w-64 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <GhostBlock className="h-9 w-24 rounded-full" />
            <GhostBlock className="h-9 w-24 rounded-full" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <GhostCard className="p-6">
            <GhostBlock className="h-5 w-28 rounded-full" />
            <GhostBlock className="mt-4 h-8 w-[54%] rounded-full" />
            <GhostLines
              lines={9}
              widths={["100%", "95%", "90%", "96%", "84%", "94%", "88%", "80%", "56%"]}
              className="mt-6"
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <GhostBlock className="h-9 w-24 rounded-full" />
              <GhostBlock className="h-9 w-32 rounded-full" />
              <GhostBlock className="h-9 w-20 rounded-full" />
            </div>
          </GhostCard>

          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <GhostCard key={`surge-side-${index}`} className="p-4">
                <GhostBlock className="h-4 w-20 rounded-full" />
                <GhostLines lines={3} widths={["94%", "78%", "60%"]} className="mt-3" />
              </GhostCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExamSnipePageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <GhostBlock className="h-3 w-28 rounded-full" />
            <GhostBlock className="mt-3 h-9 w-72 rounded-full" />
            <GhostLines lines={2} widths={["72%", "46%"]} className="mt-4" />
          </div>
          <GhostBlock className="h-10 w-28 rounded-full" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <GhostCard className="min-h-[280px] p-6">
              <GhostBlock className="h-5 w-36 rounded-full" />
              <GhostBlock className="mt-4 h-[160px] w-full rounded-[24px]" />
              <div className="mt-4 flex gap-2">
                <GhostBlock className="h-9 w-32 rounded-full" />
                <GhostBlock className="h-9 w-28 rounded-full" />
              </div>
            </GhostCard>

            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <GhostCard key={`exam-result-${index}`} className="p-5">
                  <GhostBlock className="h-5 w-[56%] rounded-full" />
                  <GhostLines lines={4} widths={["96%", "90%", "70%", "46%"]} className="mt-4" />
                </GhostCard>
              ))}
            </div>
          </div>

          <GhostCard className="p-5">
            <GhostBlock className="h-5 w-28 rounded-full" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <GhostCard key={`history-${index}`} className="p-4">
                  <GhostBlock className="h-4 w-[64%] rounded-full" />
                  <GhostLines lines={2} widths={["74%", "52%"]} className="mt-3" />
                </GhostCard>
              ))}
            </div>
          </GhostCard>
        </div>
      </div>
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <GhostBlock className="h-8 w-64 rounded-full" />
          <GhostBlock className="h-10 w-24 rounded-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <GhostCard key={`generic-card-${index}`} className="p-5">
              <GhostBlock className="h-5 w-28 rounded-full" />
              <GhostLines lines={4} widths={["96%", "88%", "74%", "52%"]} className="mt-4" />
            </GhostCard>
          ))}
        </div>
      </div>
    </div>
  );
}
