/** A deny-only signal that distinct passport and Emirates ID originals are needed. */
export function containsMixedIdentityCredentials(pages: readonly { text: string }[]) {
  const passport = pages.some(page => /(?:^|\n)\s*P<[A-Z<]{3}[A-Z<]{12,}/u.test(page.text));
  return passport && pages.some(page => /(?:emirates\s+id|الهوية\s+الإماراتية)/iu.test(page.text)
    && /\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/u.test(
      page.text.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 0x0f)),
    ));
}
