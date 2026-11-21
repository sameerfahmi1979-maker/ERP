import { createHash } from "node:crypto";

export const handoffScript = `(() => {
  const token = window.location.hash.slice(1);
  const link = document.getElementById("open");
  if (!window.location.search && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) {
    link.href = "algt-erp://dms/share/" + token;
    link.hidden = false;
  }
})();`;

const hash = createHash("sha256").update(handoffScript).digest("base64");
export const handoffPolicy = `default-src 'none'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'sha256-${hash}'`;
