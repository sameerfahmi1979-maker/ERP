import {createHash} from "node:crypto";

const script = `(() => {
  const token = window.location.hash.slice(1);
  const link = document.getElementById("open");
  if (!window.location.search && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token)) {
    link.href = "algt-erp://dms/share/" + token;
    link.hidden = false;
  }
})();`;
const policy = "default-src 'none'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'sha256-"+createHash("sha256").update(script).digest("base64")+"'";
export function GET() {
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALGT ERP System</title><main><h1>ALGT ERP System</h1><p>Open this shared document in ALGT ERP System and sign in with your nominated ERP account.</p><a id="open" hidden>Open in ALGT ERP System</a></main><script>${script}</script></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":policy,"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Cache-Control":"no-store"}});
}
