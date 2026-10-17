// @vitest-environment jsdom
import React, {useState} from "react";
import {afterEach, expect, it} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {RecordReadActivity, useRecordReadActive} from "@/hooks/use-record-read-active";
import {useReadLifetime} from "@/hooks/use-read-lifetime";
afterEach(cleanup);
it("pausing retires captured callbacks across A-to-B-to-A without discarding drafts",()=>{
 const owners: ReturnType<typeof useReadLifetime>[]=[];
 function Probe(){const active=useRecordReadActive(),owner=useReadLifetime("same-subject");owners.push(owner);const [draft,setDraft]=useState("");return <input aria-label="draft" data-active={String(active)} value={draft} onChange={e=>setDraft(e.target.value)}/>;}
 const wrap=(active:boolean)=><RecordReadActivity active={active}><Probe/></RecordReadActivity>;
 const view=render(wrap(true));const first=owners.at(-1)!;expect(first.active).toBe(true);
 fireEvent.change(screen.getByLabelText("draft"),{target:{value:"keep"}});view.rerender(wrap(false));expect(first.active).toBe(false);expect(owners.at(-1)!.active).toBe(false);
 view.rerender(wrap(true));expect(first.active).toBe(false);expect(owners.at(-1)!.active).toBe(true);expect((screen.getByLabelText("draft")as HTMLInputElement).value).toBe("keep");
 view.unmount();expect(owners.every(o=>!o.active)).toBe(true);
});
it("a nested active section cannot reactivate its paused parent",()=>{
 function Probe(){return <span>{String(useRecordReadActive())}</span>;}
 render(<RecordReadActivity active={false}><RecordReadActivity active><Probe/></RecordReadActivity></RecordReadActivity>);expect(screen.getByText("false")).toBeTruthy();
});
