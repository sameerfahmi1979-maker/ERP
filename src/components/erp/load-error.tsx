/** A failed query is not an empty dataset. Never expose raw provider errors here. */
export function LoadError({ title, retryHref }: { title: string; retryHref: string }) {
  return <div role="alert" className="rounded-sm border border-destructive/50 bg-card p-5 space-y-2">
    <h2 className="font-semibold">{title} could not be loaded</h2>
    <p className="text-sm text-muted-foreground">Try again. If the problem continues, ask your administrator to check your access and the service.</p>
    <a href={retryHref} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Try loading again</a>
  </div>;
}
