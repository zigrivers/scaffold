---
name: browser-extension-store-submission
description: Chrome Web Store review process, AMO submission, screenshot and promotional image requirements, listing optimization, and managing version updates
topics: [browser-extension, store-submission, chrome-web-store, amo, listing-optimization, review-process, screenshots]
---

Store submission is the deployment step for browser extensions. Unlike web applications where you push to a server, extensions must pass store review before reaching users. Review timelines, policy requirements, and listing quality directly affect user acquisition and approval success. Understanding the process before writing the first line of code prevents costly late-stage pivots.

## Summary

Chrome Web Store review takes 1–3 days for automated review, up to 2 weeks for manual review triggered by sensitive permissions. AMO (Mozilla Add-ons) requires source code submission alongside minified builds and enforces a no-obfuscation policy. Store listing quality (screenshots, descriptions, icon) significantly affects organic search and conversion. Version updates that add or change permissions trigger re-review. Prepare all store assets before the first submission to avoid resubmission delays.

## Deep Guidance

### Chrome Web Store Review Process

The Chrome Web Store has a two-tier review system:

**Automated review (most extensions):**
- Triggered for extensions without sensitive permissions.
- Typically completes in 1–3 business days.
- Checks for policy violations: remote code execution, deceptive behavior, malware patterns.
- An extension that passes automated review is published automatically.

**Manual review (sensitive permissions or policy concerns):**
- Triggered by: `webRequest`, `nativeMessaging`, `history`, `cookies`, `unlimitedStorage`, `<all_urls>` or very broad host patterns, and any permission not commonly seen.
- Also triggered by: policy violation flags, user reports, or random sampling of extensions.
- Takes 1–4 weeks. During this period, your extension is "pending review" and not publicly accessible.
- Reviewers may request additional justification via email. Respond within 5 business days or the review is cancelled.

**New developer accounts** face stricter scrutiny. New accounts submitting extensions with sensitive permissions often go to manual review regardless of the permissions requested. Plan for a 2-week review window for a new developer account's first submission.

**Preparing for review:**
- Write a detailed "Single Purpose" description in the "Developer Notes" field in the developer console. Explain exactly what each permission is used for.
- Every permission must be clearly mentioned in the public store description.
- The extension must work as described. Reviewers install and test extensions.
- If the extension requires authentication or a specific URL to function, provide test credentials in the Developer Notes.

### AMO (Mozilla Add-ons) Submission

AMO review differs significantly from Chrome's process:

**Source code submission:**
- When submitting a minified/bundled extension, AMO requires the corresponding source code so reviewers can audit the logic.
- Submit a ZIP of your source code alongside the extension ZIP.
- Include a `build.md` with exact instructions to reproduce the submitted build from source.
- Reviewers execute your build instructions and compare the output to the submitted artifacts. If the build does not reproduce, the submission is rejected.

**No obfuscation policy:**
- Minification (whitespace removal, variable shortening) is acceptable.
- Obfuscation (intentionally making code unreadable with tools like obfuscator.io) is grounds for rejection.
- Webpack/Vite production builds are acceptable — their output is minified but not obfuscated.

**Review timeline:**
- New extensions: 1–2 weeks for full review.
- Updates to reviewed extensions: Can be faster if no new permissions are added.
- Extensions with high install counts receive priority review for security updates.

**Listing vs. self-distribution:**
- AMO-listed extensions are reviewed, signed, and discoverable in the Firefox add-ons store.
- Self-distributed extensions are signed by Mozilla (required for permanent install in Firefox) but not reviewed or listed.
- Choose "Listed" for all consumer-facing extensions. "Self-distributed" is for enterprise or internal extensions.

### Extension Icon Requirements

Store icons must meet specific requirements to avoid rejection or poor presentation:

**Manifest icons (required):**
- 16×16 — Toolbar button (the most important size — must be recognizable at this scale).
- 32×32 — Windows HiDPI toolbar; extension management page.
- 48×48 — Extension management page (`chrome://extensions`).
- 128×128 — Chrome Web Store listing page.

**Chrome Web Store store icon:**
- 128×128 PNG — Separate from the manifest icon, uploaded in the developer console.
- Must not have rounded corners (Chrome applies rounding in the store UI).
- Must not contain text if the text is too small to read at 128×128.

**Firefox icon:**
- AMO accepts PNG or SVG for the store icon.
- Recommended: submit SVG for the store icon; PNG for manifest icons.

**Design for legibility at 16×16:** The toolbar icon at 16×16 is the primary user-facing brand element of your extension. A complex illustration or thin text will be unrecognizable. Use simple, bold shapes and high contrast. Test actual rendering at 16×16 before finalizing.

### Screenshots and Promotional Assets

Screenshots are the single biggest factor in store listing conversion rates — they are the first thing users see when evaluating your extension.

**Chrome Web Store requirements:**
- 1280×800 or 640×400 PNG or JPEG screenshots.
- Minimum 1 screenshot, maximum 5.
- Screenshots must accurately represent the extension's UI and behavior. Staged screenshots are fine; misleading screenshots are grounds for removal.

**Promotional tile (Chrome Web Store):**
- Small tile: 440×280 PNG — Required for "Featured" promotion.
- Large tile: 920×680 PNG — Optional.
- Marquee banner: 1400×560 PNG — Optional, for featured placement.

**AMO screenshot requirements:**
- Any resolution PNG or JPEG.
- Recommended: 1280×800.
- Up to 10 screenshots.

**Screenshot best practices:**
- Show the extension's core value proposition in the first screenshot.
- Use real content, not placeholder text.
- Include captions (add them in the developer console, not in the image) explaining what is shown.
- Show both the extension UI and the page it is enhancing — side by side or with the popup visible over the page.
- Provide dark mode screenshots if the extension supports dark mode.

### Store Listing Optimization

**Title:**
- Chrome: 45 characters max.
- Include the primary keyword users would search for. "Ad Blocker for Chrome" ranks for "ad blocker".
- Do not use competitor brand names in the title.

**Short description (Chrome / AMO summary):**
- Chrome: 132 characters. This appears in search results.
- Lead with the primary benefit: "Block ads, trackers, and popups on every website."
- Avoid generic phrasing: "A great extension for better browsing" is not helpful.

**Full description:**
- Explain every permission in plain language.
- List key features as bullet points — users scan, not read.
- Include keywords that describe the use case naturally. Do not keyword-stuff.
- Link to privacy policy, support page, and source code repository.

**Privacy Policy:**
- Required for any extension that collects, processes, or transmits user data.
- Even if the extension stores data only locally, provide a privacy policy that states this.
- Host the privacy policy at a stable URL (not a GitHub README — it can be moved; use a dedicated page).

### Managing Version Updates

**Version number requirements:**
- Each update must have a strictly higher version number than the previous published version.
- Chrome uses the four-part format: `MAJOR.MINOR.PATCH.BUILD` (e.g., `1.2.3.0`).
- Once a version number is used, it cannot be reused even if the submission was rejected.

**Permission changes in updates:**
- Adding new permissions to an existing extension triggers re-review.
- Users with the extension installed are shown a permission update prompt — they must re-approve before the extension updates.
- This is a significant UX disruption. Batch permission additions into major version updates and communicate the changes clearly.
- Never remove permissions without considering whether existing features depend on them — silent feature breakage is worse than a permission prompt.

**Update rollout:**
- Chrome supports staged rollouts: publish to a percentage of users and increase over time.
- Configure this in the developer console under "Distribution" after submitting the update.
- Use staged rollout for major updates or updates with new permissions to catch issues before full release.

**Expedited review:**
- The Chrome Web Store provides an "expedite review" option in the developer console for critical security fixes.
- Use sparingly — you are granted approximately two expedited reviews per year per developer account.
- Include a detailed explanation of the security issue and urgency in the expedite request.
