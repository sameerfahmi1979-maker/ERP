import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const auditPort = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: auditPort.from }) }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 11, must_change_password: false }, isAccountActive: true }),
}));
vi.mock("@/lib/ai/common/assistant/entity-access", () => ({
  readAuthorizedAssistantEntity: async () => ({ reference: { entityType: "employee", entityId: 123 } }),
}));

import { collectAiEventTimeline, collectAuditLogEntries, collectDmsEventTimeline } from "@/lib/ai/common/audit-explainer/audit-collectors";

const generated = readFileSync("src/types/database.ts", "utf8").replace(/\r\n/g, "\n");

function tableDefinition(table: string) {
  const start = generated.indexOf(`      ${table}: {\n        Row: {`);
  expect(start, table).toBeGreaterThan(0);
  return generated.slice(start, generated.indexOf("\n      }", start));
}

function fields(table: string) {
  const definition = tableDefinition(table);
  const row = definition.slice(0, definition.indexOf("        Insert:"));
  return new Set([...row.matchAll(/^          ([a-z_][a-z0-9_]*):/gm)].map(match => match[1]));
}

function splitColumns(value: string) {
  return value.split(",").map(column => column.trim());
}

it("dashboard collectors use generated native columns rather than stale prototype fields", () => {
  const file = "src/lib/ai/common/dashboard/dashboard-collectors.ts";
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let checked = 0;
  function from(node: ts.Node): string | null {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
    const [argument] = node.arguments;
    if (node.expression.name.text === "from" && argument && ts.isStringLiteral(argument)) return argument.text;
    return from(node.expression.expression);
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const [argument] = node.arguments;
      if (["select", "order", "eq", "is", "lt", "gte", "in", "not"].includes(method) && argument && ts.isStringLiteral(argument)) {
        const table = from(node.expression.expression);
        if (table) {
          const native = fields(table);
          const columns = method === "select" ? splitColumns(argument.text).map(column => column.split(":").at(-1)!) : [argument.text];
          for (const column of columns) {
            expect(native.has(column), `${table}.${column}`).toBe(true);
            checked++;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(checked).toBeGreaterThan(30);
});

const nativeEventSources = {
  erp_ai_risk_score_events: {
    parent: "erp_ai_risk_scores",
    foreignKey: "risk_score_id",
    eventColumns: ["id", "event_type", "created_at", "actor_id", "prior_risk_level", "new_risk_level"],
    subjectColumns: ["entity_type", "entity_id"],
  },
  erp_ai_compliance_finding_events: {
    parent: "erp_ai_compliance_findings",
    foreignKey: "finding_id",
    eventColumns: ["id", "event_type", "created_at", "actor_user_id"],
    subjectColumns: ["entity_type", "entity_id", "document_id"],
  },
  erp_ai_duplicate_candidate_events: {
    parent: "erp_ai_duplicate_candidates",
    foreignKey: "candidate_id",
    eventColumns: ["id", "event_type", "created_at", "actor_user_id"],
    subjectColumns: ["entity_type_a", "entity_id_a", "entity_type_b", "entity_id_b", "source_document_id"],
  },
  erp_ai_field_suggestion_events: {
    parent: "erp_ai_field_suggestions",
    foreignKey: "suggestion_id",
    eventColumns: ["id", "event_type", "created_at", "actor_user_id"],
    subjectColumns: ["entity_type", "entity_id"],
  },
};

it("audit collectors project generated event fields and join the canonical subject through its foreign key", async () => {
  const requests = new Map<string, {
    projection: string;
    fields: string[];
    relatedFilters: { filter: string; table: string }[];
  }>();
  auditPort.from.mockImplementation((table: string) => {
    expect(requests.has(table), table).toBe(false);
    const request = { projection: "", fields: [] as string[], relatedFilters: [] as { filter: string; table: string }[] };
    requests.set(table, request);
    const query = {
      select(projection: string) { request.projection = projection; return query; },
      gte(field: string) { request.fields.push(field); return query; },
      order(field: string) { request.fields.push(field); return query; },
      in(field: string) { request.fields.push(field); return query; },
      eq(field: string) { request.fields.push(field); return query; },
      or(filter: string, options: { referencedTable: string }) {
        request.relatedFilters.push({ filter, table: options.referencedTable });
        return query;
      },
      limit() { return query; },
      then: (resolve: (value: { data: unknown[]; count: number; error: null }) => unknown) =>
        Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
    };
    return query;
  });

  await collectAuditLogEntries("last_30_days", "employee", 123);
  expect(await collectAiEventTimeline("last_30_days", "employee", 123)).toEqual({ items: [], unavailableSources: [] });
  await collectDmsEventTimeline("last_30_days", 123);

  const directlyRead = {
    audit_logs: ["id", "actor_user_profile_id", "module_code", "entity_name", "entity_id", "entity_reference", "action", "old_values", "new_values", "created_at"],
    dms_document_events: ["id", "document_id", "event_type", "description", "performed_by", "performed_at"],
  };
  const checked = new Set<string>();
  function checkFields(table: string, columns: string[]) {
    const native = fields(table);
    for (const column of columns) {
      expect(native.has(column), `${table}.${column}`).toBe(true);
      checked.add(`${table}.${column}`);
    }
  }

  expect([...requests.keys()].sort()).toEqual([...Object.keys(directlyRead), ...Object.keys(nativeEventSources)].sort());
  for (const [table, columns] of Object.entries(directlyRead)) {
    const request = requests.get(table)!;
    expect(splitColumns(request.projection).sort()).toEqual([...columns].sort());
    checkFields(table, [...columns, ...request.fields]);
  }
  for (const [table, { parent, foreignKey, eventColumns, subjectColumns }] of Object.entries(nativeEventSources)) {
    const request = requests.get(table)!;
    const match = /^(.+),\s*subject:([a-z_]+)!inner\(([^)]+)\)$/.exec(request.projection);
    expect(match, table).not.toBeNull();
    const [, eventProjection, relation, subjectProjection] = match!;
    expect(relation).toBe(parent);
    expect(splitColumns(eventProjection).sort()).toEqual([...eventColumns].sort());
    expect(splitColumns(subjectProjection).sort()).toEqual([...subjectColumns].sort());
    checkFields(table, [...eventColumns, foreignKey, ...request.fields.filter(field => !field.startsWith("subject."))]);
    checkFields(parent, [...subjectColumns, "id", ...request.fields.filter(field => field.startsWith("subject.")).map(field => field.slice(8))]);

    const relationships = tableDefinition(table).split("        Relationships:")[1].match(/\{[^{}]+\}/g) ?? [];
    expect(relationships.some(block =>
      block.includes(`columns: ["${foreignKey}"]`) &&
      block.includes(`referencedRelation: "${parent}"`) &&
      block.includes('referencedColumns: ["id"]')
    ), `${table}.${foreignKey} references ${parent}.id`).toBe(true);

    if (table === "erp_ai_duplicate_candidate_events") {
      expect(request.relatedFilters).toEqual([{
        table: "subject",
        filter: "and(entity_type_a.in.(employee,employees),entity_id_a.eq.123),and(entity_type_b.in.(employee,employees),entity_id_b.eq.123)",
      }]);
    } else {
      expect(request.fields).toEqual(expect.arrayContaining(["subject.entity_type", "subject.entity_id"]));
    }
  }
  expect(checked.size).toBeGreaterThanOrEqual(46);
});
