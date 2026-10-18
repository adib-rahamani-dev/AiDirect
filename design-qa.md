# AiDirect v2 design QA — 2026-10-18

final result: passed

## Source visual truth and normalization

User references are recorded in docs/design-v2.fa.md. They establish warm yellow, charcoal, bold type and human imagery; this is a product-specific adaptation, not a pixel clone of the original English agency/taxi UI.

Final generated implementation targets:

- Landing: C:/Users/EXO/.codex/generated_images/01a10864-9dea-7fe2-8088-191b0777098f/exec-42011caf-7486-4e13-9d95-d4e7ca6f9588.png, 1346×1168.
- Admin: C:/Users/EXO/.codex/generated_images/01a10864-9dea-7fe2-8088-191b0777098f/exec-f3cc5e8c-9853-41ce-bb4d-cd25a4752025.png, 1487×1058.

Sources were proportionally resized to 1440px width, then cropped x0/y0/1400×1000. Resulting local-evidence/landing-v2-target-normalized.png and admin-v2-target-normalized.png were opened together with their respective final rendered screenshots in the same comparison input. No CSS or asset conclusions were drawn from file paths alone.

Implementation: http://127.0.0.1:3100/, /admin, /connect/instagram; local production build with isolated aidirect_test DB, real manager login, sending disabled. Desktop CSS viewport 1440×1024, DPR 1. Final screenshots landing-v2-desktop-final.png and admin-v2-desktop-final.png are explicit 1400×1000 CSS-pixel clips (rightmost 40px omitted in both normalized source and capture due browser capture limit). The complete layout and width were separately inspected in-browser. No density upscaling.

Focused comparison: admin-v2-focused-target.png and admin-v2-focused-actual.png, x580/y155/570×260 from normalized desktop crops, opened together after typography fixes. Landing lower target at source y650 and final rendered landing-v2-lower.png at document y650 were also opened together; heights differ because real editable demo adds a row and status text. Full-view, hero text, button spacing, result copy and footer were inspected. A complete page raster is not used as UI.

## Comparison history and fixes

1. [P2 fixed] Initial admin main was vertically centered and header included a redundant eyebrow, moving the welcome region below the target. Main margin now 0 auto and eyebrow removed. Final admin hero begins near y158 versus target y149, within expected live-font metrics.
2. [P2 fixed] Banner raster right edge created a rectangular color seam. Right-edge alpha mask blends the original raster into the yellow surface. Final admin capture has no abrupt right edge.
3. [P2 fixed] Admin controls, summaries and helper copy were too small. Increased body scale, welcome title to 48px at desktop, action text to 17px/52px height, empty headings to 20px and panels to 24px. Final focused and full-view captures were compared after the fix.
4. [P2 fixed] Landing display scale was smaller than the mock. Hero now reaches 99px/1.3, story 82px/1.45 at desktop; supporting paragraph 20px. New final desktop and lower captures were compared with the source. Mobile/tablet have their own constrained scale.
5. [P1 fixed] Mobile sidebar brand stretched across the row and overlapped the absolute logout control. Brand now align-self:flex-start. Final 390px DOM bounds: brand x223.8,width131.2; logout x20,width67.3. Final mobile screenshot confirms separate visible controls.
6. [P2 fixed] Hidden mobile line breaks joined Persian words. Explicit spaces added in landing and owner headings. Narrow/mobile snapshot confirms readable separation. Invitation CTA is nowrap; mobile outline actions are at least 44px.
7. [P2 fixed] Unknown dashboard data could look like real zero counts. Unavailable data now shows em dashes and explicit unavailable states; zeros are shown only after authenticated data returns.

No actionable P0/P1/P2 issue remains in the inspected states. Remaining differences are expected product decisions: real editable comment/keyword inputs instead of mock chat avatar chrome; original portrait without fictitious logos; consistent supplied arrow wordmark; no invented date, fake metrics or trial badge; simplified honest beta copy. Banner art and portrait are original generated raster assets, not CSS drawings.

## Required fidelity surfaces

- Typography: local Estedad Variable with Vazirmatn fallback; loaded font confirmed via DOM and browser font status. Persian display weights 850/900, normal letter spacing, deliberate line breaks. Smaller functional labels remain optically lighter than display copy; mobile has separate sizes and no truncation hiding primary actions.
- Spacing/layout: yellow rounded hero, portrait left/copy right, asymmetrical story/workbench, flat steps, right admin sidebar and paired panels. Desktop compositions match the target hierarchy. No horizontal overflow at 1440, 834, 390, 320 CSS px. Mobile navigation becomes four compact items, panels stack; invitation title may wrap at 320 without hiding actions.
- Color/tokens: warm #ffd315, charcoal #111712/#202523, cream #f5f2e8; dark yellow-surface text and subdued separators. Source glow/texture is intentionally not reproduced as CSS illustration. Semantic unavailable/error messages remain explicit.
- Image quality: original 1000×750 alpha portrait and 600×540 banner WebP, correctly loaded via next/image. Crop keeps face/head visible; no stretch, generic placeholder or screenshot background. Hair-edge warmth blends into yellow. Phosphor supplies ordinary UI icons.
- Copy: Persian live text and actual server counts; preview is labeled browser-only. Sendbox intermediary, limited invitation and disabled sending are disclosed. No claim of live Instagram delivery or multi-tenant SaaS.

## Responsive evidence and interactions

Gitignored evidence under C:/laragon/www/AiDirect/local-evidence/:

- landing-v2-mobile.png, admin-v2-mobile.png, owner-v2-mobile.png: CSS 390×844, final explicit clips 375×820 at DPR 1 (not proportional scaling).
- landing-v2-tablet.png: CSS 834×1194; browser full-viewport surface capture. Admin tablet width also checked by DOM.
- landing-v2-narrow.png, admin-v2-narrow.png: CSS 320×800; no overflow. Narrow admin capture precedes final typography enlargement, which only affects desktop and preserved mobile overrides; no-overflow rechecked afterward.
- login-v2-mobile.png: CSS 390×844, submit bottom 645.8px. Owner desktop invitation acceptance in owner-v2-desktop.png.

Tested browser paths: landing CTA → real manager login → admin data; logout → login; one-use test invitation acceptance → connection-ready link; owner → /admin still renders login; main-site navigation, invitation/event anchors, local matching and nonmatching demo including Arabic ي/ك normalization. Token fragment is removed immediately. No provider login or Instagram permission consent performed. HTTP smoke adds replay, revocation and manager/guest isolation coverage; its local invite creation is a fixture, not a provider success.

Console warning/error log empty on final local landing and owner views. Admin initial-load, populated test invite list, genuine empty and loading states inspected. Finite entrance/reply animation and reduced-motion CSS reviewed; OS preference emulation was unavailable, so not claimed. Focus outlines, labels, heading order, skip link and password autofill retained. Full screen-reader audit not performed.

## Verification limits

This is local visual QA. The previous canonical URL browser visit was denied by a URL gate; no alternate browser or low-level workaround used. Deployment HTTP and CI are separate evidence and recorded in STATUS.md. Real Instagram OAuth, signed actual comment and private reply remain unproven. Unchanged provider processing is disabled. Exact error/loading pixel mocks were not supplied.

## Checklist

- [x] Full-view and focused source/implementation comparison in the same input.
- [x] All five required fidelity surfaces inspected.
- [x] P1/P2 fixes applied, rebuilt, recaptured and compared.
- [x] Desktop/tablet/mobile/narrow and core interactions checked.
- [x] Viewport reset and local preview retained.
- [x] Simulation boundary and pending integration stated.

P3 follow-up: further optical type adjustments may follow user feedback; no additional visual-polish loop blocks this release.
