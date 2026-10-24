import {expect, it} from "vitest";
import {salaryAsOf, SalaryUnavailable, type SalaryComponent, type SalaryEffect} from "@/lib/hr/payroll/salary-as-of";
const components: SalaryComponent[] = [{id: 1, component_type_id: 1, amount: "1000.01", effective_from: "2026-01-01", effective_to: null, is_active: true, deleted_at: null, component_type: {component_kind: "earning", is_basic: true}}, {id: 2, component_type_id: 2, amount: "100.00", effective_from: "2026-01-01", effective_to: null, is_active: true, deleted_at: null, component_type: {component_kind: "earning", is_basic: false}}];
const effect: SalaryEffect = {id: 1, revision_id: 2, effective_date: "2026-10-23", new_basic: "1200.02", currency: "USD"};
it.each([["2026-10-22", "1000.01", "1100.01"], ["2026-10-23", "1200.02", "1300.02"], ["2026-10-24", "1200.02", "1300.02"]])("applied basic is dated on %s, without replacing other earnings", (asOf, basic, gross) => expect(salaryAsOf(components, asOf, "USD", [effect])).toMatchObject({basic, gross}));
it("does not mutate components or applied history", () => {const before=JSON.stringify({components,effect});salaryAsOf(components,"2026-10-23","USD",[effect]);expect(JSON.stringify({components,effect})).toBe(before);});
it("selects the latest effective applied row, not input/insertion order", () => {
  const later={...effect,id:2,revision_id:3,effective_date:"2026-10-24",new_basic:"1300.00"};
  expect(salaryAsOf(components,"2026-10-24","USD",[later,effect]).basic).toBe("1300.00");
  expect(salaryAsOf(components,"2026-10-23","USD",[later,effect]).basic).toBe("1200.02");
});
it("supports a backdated approved effect without rewriting a later applied interval", () => {
  const earlier={...effect,id:2,revision_id:3,effective_date:"2026-09-01",new_basic:"1100.00"};
  expect(salaryAsOf(components,"2026-10-01","USD",[effect,earlier]).basic).toBe("1100.00");
  expect(salaryAsOf(components,"2026-10-23","USD",[earlier,effect]).basic).toBe("1200.02");
});
it.each([[effect,effect], [effect,{...effect,id:2,revision_id:3}], [{...effect,id:0}], [{...effect,new_basic:"1.001"}], [{...effect,effective_date:"2026-02-30"}]].map(effects=>({effects})))("refuses ambiguous/malformed applied timelines", ({effects})=>expect(()=>salaryAsOf(components,"2026-10-23","USD",effects)).toThrow(SalaryUnavailable));
it("holds an applied currency mismatch instead of inventing FX",()=>expect(()=>salaryAsOf(components,"2026-10-23","AED",[effect])).toThrow("currency"));
it("an actually applied basic remains an explicit fact when no base rows exist",()=>expect(salaryAsOf([],"2026-10-23","USD",[effect])).toMatchObject({basic:"1200.02",gross:"1200.02",activeCount:1}));
