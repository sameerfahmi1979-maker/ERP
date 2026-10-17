import styles from "./dms-bilingual-text.module.css";

/** Safe text, not HTML: every line establishes its own Arabic/English direction. */
export function textLanguage(text: string): "ar" | "en" {
  const firstLetter = text.match(/\p{L}/u)?.[0];
  return firstLetter && /\p{Script=Arabic}/u.test(firstLetter) ? "ar" : "en";
}

export function DmsBilingualText({ text, label }: { text: string; label: string }) {
  return <div role="region" aria-label={label} tabIndex={0}
    className="min-h-[300px] max-h-[65vh] overflow-auto rounded-md border border-border bg-background p-4 text-sm leading-loose text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    style={{ fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif', overflowWrap: "anywhere" }}>
    {text.split(/\r?\n/).map((line, index) => <p key={index} dir="auto" lang={textLanguage(line)}
      className={`m-0 min-h-[1.9em] whitespace-pre-wrap text-start ${textLanguage(line) === "ar" ? styles.arabic : ""}`} style={{ unicodeBidi: "plaintext" }}>
      {line || <br />}
    </p>)}
  </div>;
}
