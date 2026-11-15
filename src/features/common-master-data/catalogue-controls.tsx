"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogueHref, CATALOGUE_PAGE_SIZE } from "@/lib/master-data/catalogue-page";

export function CatalogueControls({ base, page, search, total }: { base: string; page: number; search: string; total?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const searchInput = useRef<HTMLInputElement>(null);
  function go(nextPage: number, nextSearch = search) {
    start(() => router.push(catalogueHref(base, nextPage, nextSearch)));
  }
  const last = total === undefined ? 1 : Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));
  return <div className="space-y-2" aria-busy={pending}>
    <form role="search" className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); go(1, searchInput.current?.value.trim() ?? ""); }}>
      <label className="min-w-0 text-sm">Search catalogue<Input key={search} ref={searchInput} defaultValue={search} maxLength={200} /></label>
      <Button type="submit" size="sm">Search</Button>
    </form>
    <div className="flex flex-wrap items-center gap-2">
      <span role="status">{pending ? "Loading catalogue…" : total === undefined ? "" : `${total.toLocaleString()} results · Page ${page} of ${last}`}</span>
      {page > last && <Button size="sm" variant="outline" onClick={() => go(last)}>Last available page</Button>}
      {page > 1 && <Button size="sm" variant="outline" disabled={pending} onClick={() => go(page - 1)}>Previous</Button>}
      {page < last && <Button size="sm" variant="outline" disabled={pending} onClick={() => go(page + 1)}>Next</Button>}
    </div>
  </div>;
}
