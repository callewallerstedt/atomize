# Paused Features

These features are intentionally hidden from the MVP UI. The code remains in the repo for later reactivation.

## CoSolve
- Routes: `/cosolve`, `/cosolve/share/[shareId]`
- Primary code: `src/app/cosolve`, `src/app/api/cosolve`, `src/components/CoSolve.tsx`
- Why paused: Laggy and too complex for launch
- Re-enable when: Performance is stable and collaboration UX is production-ready

## Quick Learn
- Routes: `/quicklearn`
- Primary code: `src/app/quicklearn`, quick-learn state in `src/app/page.tsx`
- Why paused: Competes with the main course-based product story
- Re-enable when: The core upload -> lesson -> practice flow is stable and focused

## Lab Assist
- Routes: `/lab-assist`, `/lab-assist/[labId]`
- Primary code: `src/app/lab-assist`, `src/app/api/lab-assist`
- Why paused: Separate product surface from the MVP learning workflow
- Re-enable when: Lab workflows become a deliberate product module

## Read Assist
- Routes: `/readassist`
- Primary code: `src/app/readassist`, `src/app/api/extract-pdf`, `src/app/api/quick-explain`
- Why paused: Useful utility, but not part of the launch path
- Re-enable when: PDF reading becomes a supported study mode inside the main course flow

## Course Sharing
- Routes: `/share/[shareId]`
- Primary code: `src/app/share`, `src/app/api/courses/share`
- Why paused: Growth loop is not essential for MVP validation
- Re-enable when: The core learning workflow is stable enough to share confidently

## QR Capture
- Routes: `/qr-camera/[sessionId]`, `/qr-camera/[sessionId]/sent`
- Primary code: `src/app/qr-camera`, `src/app/api/qr-session`
- Why paused: Cool future workflow, but not necessary for launch
- Re-enable when: Attachment upload and mobile handoff are prioritized again

## Lesson TTS
- Routes: hidden lesson-page controls only
- Primary code: `src/app/subjects/[slug]/node/[name]/page.tsx`, `src/app/api/text-to-speech`
- Why paused: Adds UI complexity without being core to the launch story
- Re-enable when: Playback UX is polished and accessibility support is a launch priority

## Lesson PDF Export
- Routes: hidden lesson-page controls only
- Primary code: `src/app/subjects/[slug]/node/[name]/page.tsx`, `src/app/api/export-pdf`
- Why paused: Non-core utility for MVP
- Re-enable when: Export demand is validated

## Lars Explain
- Routes: hidden lesson-page controls only
- Primary code: `src/components/LarsCoach.tsx`, `src/app/api/lars/stream`
- Why paused: Overlaps with the core lesson and highlight flows
- Re-enable when: It has a unique role with strong quality and UX

## Inline Lesson Practice Problems
- Routes: hidden lesson-page controls only
- Primary code: `src/app/subjects/[slug]/node/[name]/page.tsx`, `src/app/api/generate-practice-problems`
- Why paused: Practice is being consolidated into the dedicated Practice page
- Re-enable when: Lesson-level practice adds clear value without duplicating the Practice mode
