## UI Pro Max Stack Guidelines
**Stack:** html-tailwind | **Query:** long text wrapping
**Source:** stacks/html-tailwind.csv | **Found:** 3 results

### Result 1
- **Category:** Typography
- **Guideline:** Balanced heading wrapping
- **Description:** Polish short multi-line headings without fixing exact line breaks
- **Do:** Use text-balance with a readable max-width and natural wrapping fallback
- **Don't:** Insert hardcoded br tags or blanket nonbreaking spaces
- **Code Good:** max-w-xl text-balance
- **Code Bad:** whitespace-nowrap with manual br
- **Severity:** Medium
- **Docs URL:** https://tailwindcss.com/docs/text-wrap
- **Applies To:** html-tailwind 4.3
- **Status:** active
- **Verified At:** 2026-08-13

### Result 2
- **Category:** Typography
- **Guideline:** Text truncation
- **Description:** Handle long text gracefully
- **Do:** truncate or line-clamp-*
- **Don't:** Overflow breaking layout
- **Code Good:** line-clamp-2
- **Code Bad:** No overflow handling
- **Severity:** Medium
- **Docs URL:** https://tailwindcss.com/docs/text-overflow
- **Applies To:** html-tailwind 4.3
- **Status:** active
- **Verified At:** 2026-08-13

### Result 3
- **Category:** Typography
- **Guideline:** Long token resilience
- **Description:** Allow URLs identifiers and user content to break without widening flex layouts
- **Do:** Use wrap-anywhere on unpredictable text and min-w-0 on its flexible parent
- **Don't:** Use break-all globally or keep the flex child at its intrinsic minimum
- **Code Good:** flex min-w-0 with wrap-anywhere
- **Code Bad:** flex with whitespace-nowrap
- **Severity:** High
- **Docs URL:** https://tailwindcss.com/docs/overflow-wrap
- **Applies To:** html-tailwind 4.3
- **Status:** active
- **Verified At:** 2026-08-13

