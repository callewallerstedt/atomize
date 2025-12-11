"use client";

export default function SentPicturesPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Sent pictures</h1>
          <p className="text-sm text-[var(--foreground)]/70">
            Your pictures have been sent successfully.
          </p>
        </div>
      </div>
    </div>
  );
}












