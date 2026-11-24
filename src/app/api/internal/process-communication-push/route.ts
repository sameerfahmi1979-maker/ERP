export const runtime = "nodejs";
// Legacy communication-only receiver is retired. Shared ERP secrets never
// authorize this scheduler; all current work uses the signed nonce receiver.
export async function POST(request:Request) {
  void request;
  return new Response(null,{status:410,headers:{"Cache-Control":"private, no-store"}});
}
