# Landing design QA — 2026-10-18

final result: passed

## Target and evidence

The user selected the third displayed concept and requested refinement. Revised visual truth: C:/Users/EXO/.codex/generated_images/01a10864-9dea-7fe2-8088-191b0777098f/exec-1042f825-e935-4676-a030-d317f088eec5.png (1422×1106). Normalized proportionally to 1440×1120 in local-evidence/landing-target-normalized.png for comparison with the local production build at http://127.0.0.1:3100/.

- Desktop: local-evidence/landing-desktop.png, 1440×1120 CSS and capture pixels, DPR 1, page top, initial matched state.
- Final crisp handoff crop: local-evidence/landing-final.png, x0/y0/1400×1040 from the same desktop viewport. Public-domain visual capture was blocked by the browser URL safety gate; no alternate browser workaround was attempted. Canonical HTTPS smoke checks passed separately.
- Focused workbench: local-evidence/landing-target-workbench.png and local-evidence/landing-workbench.png, same x55/y610/1325×270 crop. Opened together in one comparison input. Full-view source and implementation were also opened together.
- Mobile: local-evidence/landing-mobile.png, 390×844 CSS viewport; capture 375×812, proportionally scaled by browser surface (~0.962). No mobile visual target was supplied.
- Tablet: local-evidence/landing-tablet.png, 834×1194 CSS viewport.
- Narrow: local-evidence/landing-narrow.png, 320×780 CSS viewport, capture 305×743 (~0.953 surface scale). After correction, login measured 105×44 CSS px with nowrap.

These are local browser screenshots, not production browser verification. Full-view screenshots are compressed by the browser surface; focused captures and read-only DOM measurements supplement small-label and color inspection.

## Comparison history

1. [P2, fixed] Excess headline line-height/width pushed the workbench ~60px down and hid the footer. Reduced headline to 102px/1.3, header to 92px, removed Persian letter spacing, tightened steps. Final hero bottom 577.8px, footer bottom 1115px within 1120px viewport.
2. [P2, fixed] Wordmark arrow was on the opposite side. Corrected flex direction; final capture matches arrow-left wordmark order.
3. [P2, fixed] Navigation wrapped at 320px. Added nowrap and compact brand below 360px; final DOM measurement shows a single-line 44px-high control, no horizontal overflow.
4. [P1, fixed] Focused comparison exposed global paragraph styling causing grey text on yellow. Explicit scoped colors fixed it. Post-fix focused capture shows dark text; computed foreground rgb(22,23,15), background rgb(255,243,181). Hero copy and empty-state paragraphs also have explicit colors.

Final full-view and focused comparisons found no remaining actionable P0/P1/P2 issue. Source progress shows an intermediate frame; implementation at rest shows completed progress, intentionally. Additional result description and roadmap note are intentional honesty/accessibility improvements.

## Required fidelity surfaces

- Typography: locally served Estedad Variable 5.3.0, real weights 100–900, headline 900. Computed family is Estedad Variable; Arabic and Latin WOFF2 URLs return 200. No stretched Persian letter spacing. Selectable semantic text; deliberate two-line headline, adjusted mobile first-line scale.
- Layout: asymmetrical headline, negative space, single action, three-column workbench and flat steps. No horizontal overflow at 1440, 834, 390 or 320 CSS px. Mobile stacks input, trigger and result in reading order. Primary CTA fits near page top.
- Colors: #10110f / #f5f2e8 / #f4df59, reply #fff3b5; explicit dark reply text, subtle dividers, no gradients or glass surfaces.
- Assets: source contains live UI and supplied wordmark; no photo, illustration or avatar to recreate. New icons use Phosphor, no handcrafted SVG substitutes. Mock is not used as rasterized page background.
- Copy: selected headline and human voice; no customer metrics, testimonials or invented login methods. Demo explicitly browser-only without sending. Roadmap distinguishes connection testing from unfinished automation.

## Behavior and accessibility

- Non-match hides reply; match shows predefined reply. Arabic ي/ك and excess spaces match Persian ی/ک; whole-word matching rejects قیمتش for قیمت.
- Blank trigger disables preview/replay. Input changes clear stale success. Busy state locks concurrent runs. Replay and Enter submission work.
- CTA opens existing /sendbox login; brand returns to landing. No Instagram login or real sending performed.
- Labels, headings, status announcements, keyboard focus, 44px action controls and skip link inspected. No console warnings/errors in local browser.
- Finite headline entrance, progress and reply reveal. Reduced-motion CSS and zero-delay branch reviewed; OS-level preference emulation was unavailable through selected browser API, so it was not browser-emulated.
- Static RSC page plus one client demo; timer cleanup and direct icon imports reviewed with Vercel React Best Practices. Demo has no fetch, storage, API calls or server writes.

## Follow-up polish / limits

P3: optical type refinements can follow user feedback. No claim of exhaustive screen-reader, OS preference or real Instagram testing. Evidence is gitignored and excluded from deployment. Release checks are in STATUS.md.

## Implementation checklist

- [x] Compare selected refined concept and all five fidelity surfaces.
- [x] Fix P1/P2 issues and compare new browser evidence.
- [x] Exercise interaction and existing login navigation.
- [x] Check desktop/tablet/mobile/narrow layouts; reset viewport.
- [x] Preserve simulation/real-API boundary.
