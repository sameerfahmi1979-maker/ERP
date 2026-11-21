import { handoffPolicy, handoffScript } from "./handoff.mjs";

export function GET() {
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALGT ERP System</title><main><h1>ALGT ERP System</h1><p>Open this shared document in ALGT ERP System and sign in with your nominated ERP account.</p><a id="open" hidden>Open in ALGT ERP System</a></main><script>${handoffScript}</script></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":handoffPolicy,"Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Cache-Control":"no-store"}});
}
