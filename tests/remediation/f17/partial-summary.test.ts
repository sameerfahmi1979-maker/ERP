import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({risk:vi.fn(),compliance:vi.fn(),other:vi.fn()}));
vi.mock("@/lib/ai/common/dashboard/dashboard-collectors",()=>({collectRiskKpis:m.risk,collectComplianceKpis:m.compliance,collectDuplicateKpis:m.other,collectFieldSuggestionKpis:m.other,collectDmsProcessingKpis:m.other,collectAssistantKpis:m.other,collectSearchKpis:m.other,collectAiUsageKpis:m.other,collectFeatureFlagKpis:m.other}));
import {buildDailyDashboardSummary} from "@/lib/ai/common/dashboard/dashboard-summary";
const permissions={canViewRisk:true,canViewCompliance:true,canViewDuplicates:false,canViewFieldSuggestions:false,canViewDms:false,canViewAssistant:false,canViewSearch:false,canViewUsage:false,canViewFlags:false};
beforeEach(()=>{vi.resetAllMocks();m.risk.mockResolvedValue({kpis:[],alerts:[]});m.compliance.mockResolvedValue({kpis:[{label:"Open",value:0}],alerts:[]});});
it("keeps successful zero values when a different section fails, then clears the old warning",async()=>{
 m.risk.mockRejectedValueOnce(Error("PRIVATE_PROVIDER_PAYLOAD"));const failed=await buildDailyDashboardSummary("today",permissions,1);
 expect(failed.sections[0].state).toBe("failed");expect(failed.sections[1].kpis[0].value).toBe(0);expect(failed.sections[2].state).toBe("restricted");expect(m.other).not.toHaveBeenCalled();expect(JSON.stringify(failed)).not.toContain("PRIVATE_PROVIDER_PAYLOAD");
 const restored=await buildDailyDashboardSummary("today",permissions,1);expect(restored.sections[0].state).toBe("empty");expect(restored.warnings).toEqual([]);expect(restored.sections[0].asOf).toBeTruthy();
});
