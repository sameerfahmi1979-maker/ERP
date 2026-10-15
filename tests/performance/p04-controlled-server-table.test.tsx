// @vitest-environment jsdom
import "../remediation/f05/setup";
import React,{useState,type ReactNode} from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {FluentProvider,webLightTheme} from "@fluentui/react-components";
import type {ColumnDef,ColumnFiltersState,PaginationState,SortingState} from "@tanstack/react-table";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ERPExportMenuProps} from "@/components/erp/export/erp-export-menu";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
type Row={id:number;name:string;amount:number};
const mocks=vi.hoisted(()=>({exportProps:null as unknown,load:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/synthetic/server-table"}));
vi.mock("@/components/erp/export/erp-export-menu",()=>({ERPExportMenu:(props:unknown)=>{mocks.exportProps=props;return <span>Mocked output control</span>;}}));
const rows:Row[]=[{id:2,name:"Zulu",amount:100},{id:1,name:"Alpha",amount:10}];
const columns:ColumnDef<Row>[]=[{accessorKey:"name",header:"Name"},{accessorKey:"amount",header:"Amount"}];
function Wrap({children}:{children:ReactNode}){return <FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></FluentProvider>;}
function Driver({totalCount=1108,data=rows,loading=false,complete=true,selection=false}:{totalCount?:number|null;data?:Row[];loading?:boolean;complete?:boolean;selection?:boolean}){
 const[pagination,onPaginationChange]=useState<PaginationState>({pageIndex:40,pageSize:25}),[sorting,onSortingChange]=useState<SortingState>([{id:"name",desc:false}]),[globalFilter,onGlobalFilterChange]=useState(""),[columnFilters,onColumnFiltersChange]=useState<ColumnFiltersState>([]);
 return <><output aria-label="Controlled read state">{JSON.stringify({pagination,sorting,globalFilter,columnFilters})}</output><ERPDataTable tableId="controlled" columns={columns} data={data} isLoading={loading} enableRowSelection={selection} exportConfig={{title:"Synthetic metadata",filename:"synthetic-only"}} serverRead={{pagination,onPaginationChange,sorting,onSortingChange,globalFilter,onGlobalFilterChange,columnFilters,onColumnFiltersChange,totalCount,filters:[{id:"amount",label:"Amount",type:"number"}],loadExportData:complete?mocks.load:undefined}}/></>;
}
function state(){return JSON.parse(screen.getByLabelText("Controlled read state").textContent!);}
function exportProps(){return mocks.exportProps as ERPExportMenuProps<Row>;}
beforeEach(()=>{mocks.exportProps=null;mocks.load.mockReset();mocks.load.mockResolvedValue(Array.from({length:1108},(_,i)=>({id:i+1,name:"Authorized synthetic "+i,amount:i})));});afterEach(cleanup);
it("uses the remote exact count/page state without sorting or paginating the loaded page again",()=>{
 render(<Wrap><Driver/></Wrap>);expect(screen.getByText("Page 41 of 45")).toBeDefined();expect(screen.getByText("Showing 2 of 1108 matching records (2 loaded)")).toBeDefined();
 const bodyRows=screen.getAllByRole("row").slice(1);expect(within(bodyRows[0]).getByText("Zulu")).toBeDefined();expect(within(bodyRows[1]).getByText("Alpha")).toBeDefined();
 fireEvent.click(screen.getByRole("button",{name:"Name"}));expect(state().sorting).toEqual([{id:"name",desc:true}]);expect(state().pagination.pageIndex).toBe(0);expect(within(screen.getAllByRole("row")[1]).getByText("Zulu")).toBeDefined();
});
it("delegates search to the consumer and resets the page without a false local-filter result",()=>{
 render(<Wrap><Driver/></Wrap>);fireEvent.change(screen.getByRole("textbox",{name:"Search..."}),{target:{value:"النوع الأخير"}});expect(state().globalFilter).toBe("النوع الأخير");expect(state().pagination.pageIndex).toBe(0);expect(screen.getByText("Zulu")).toBeDefined();expect(screen.queryByText(/No records match/)).toBeNull();
});
it("delegates explicit column filters over the complete result and retains the existing filter controls",()=>{
 render(<Wrap><Driver/></Wrap>);fireEvent.click(screen.getByRole("button",{name:"Edit filters"}));expect(screen.getByText(/complete permitted result before paging/)).toBeDefined();fireEvent.change(screen.getByLabelText("Amount"),{target:{value:"10"}});fireEvent.click(screen.getByRole("button",{name:"Apply"}));expect(state().columnFilters).toEqual([{id:"amount",value:"10"}]);expect(state().pagination.pageIndex).toBe(0);expect(screen.getByText("Zulu")).toBeDefined();fireEvent.click(screen.getByRole("button",{name:"Clear search and filters"}));expect(state().columnFilters).toEqual([]);
});
it("delegates next-page and page-size controls while preserving the remote total",()=>{
 render(<Wrap><Driver/></Wrap>);fireEvent.click(screen.getByRole("button",{name:"Next"}));expect(state().pagination.pageIndex).toBe(41);expect(screen.getByText("Page 42 of 45")).toBeDefined();fireEvent.change(screen.getByLabelText("Rows per page"),{target:{value:"50"}});expect(state().pagination.pageSize).toBe(50);expect(screen.getByText(/of 1108 matching records/)).toBeDefined();
});
it("preserves column controls and supplies a complete on-demand export instead of just the current page",async()=>{
 render(<Wrap><Driver/></Wrap>);fireEvent.click(screen.getByRole("button",{name:"Edit columns"}));fireEvent.click(screen.getByRole("checkbox",{name:"Amount"}));fireEvent.click(screen.getByRole("button",{name:"Apply"}));expect(screen.queryByRole("columnheader",{name:/Amount/})).toBeNull();
 const p=exportProps();expect(p.subtitle).toContain("all 1108 matching authorized records");expect(p.columns.map(c=>c.header)).toEqual(["Name"]);expect(mocks.load).not.toHaveBeenCalled();expect((await p.loadData!()).length).toBe(1108);expect(p.data.length).toBe(2);
});
it("explicit selected-row exports remain selected loaded records rather than silently expanding to all matches",()=>{
 render(<Wrap><Driver selection/></Wrap>);fireEvent.click(screen.getAllByRole("checkbox",{name:"Select row"})[0]);const p=exportProps();expect(p.data).toEqual([rows[0]]);expect(p.loadData).toBeUndefined();expect(p.subtitle).toContain("1 selected record from the current loaded page only");expect(mocks.load).not.toHaveBeenCalled();
});
it("unknown totals mask stale rows and block pagination/export without claiming an empty successful result",()=>{
 render(<Wrap><Driver totalCount={null}/></Wrap>);expect(screen.queryByText("Zulu")).toBeNull();expect(screen.queryByText("Alpha")).toBeNull();expect(screen.getByText("Matching total is not yet available")).toBeDefined();expect(screen.getByText(/Records could not yet be verified/)).toBeDefined();expect(screen.queryByText(/No records match/)).toBeNull();expect(screen.getByRole("button",{name:"Next"}).hasAttribute("disabled")).toBe(true);expect(screen.getByRole("button",{name:"Previous"}).hasAttribute("disabled")).toBe(true);expect(exportProps().disabled).toBe(true);
});
it("refreshing or absent complete-export collectors block output instead of substituting a current-page export",()=>{
 const h=render(<Wrap><Driver loading/></Wrap>);expect(exportProps().disabled).toBe(true);expect(screen.getByRole("button",{name:"Next"}).hasAttribute("disabled")).toBe(true);h.rerender(<Wrap><Driver complete={false}/></Wrap>);expect(exportProps().loadData).toBeUndefined();expect(exportProps().disabled).toBe(true);expect(exportProps().subtitle).toContain("Complete export is unavailable");expect(exportProps().subtitle).not.toContain("all 1108");
});
it.each([NaN,-1,1.5])("rejects an invalid exact total %s without leaking stale rows or presenting a false count",totalCount=>{
 render(<Wrap><Driver totalCount={totalCount}/></Wrap>);expect(screen.queryByText("Zulu")).toBeNull();expect(screen.getByText("Matching total is not yet available")).toBeDefined();expect(exportProps().disabled).toBe(true);expect(exportProps().subtitle).toBe("Matching total is not yet available");
});
