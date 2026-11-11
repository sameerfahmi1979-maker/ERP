// AI-MOD-01: reproducible static inventory. Never connects to a DB or provider.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, relative, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const digest = text => createHash("sha256").update(text).digest("hex");
const slash = value => value.replaceAll("\\", "/");
export const INVENTORY_VERSION = "ai-mod01-inventory/1";

export function inventorySource(root) {
  const files = [], consumers = [], queries = [], fields = [], formBindings = [];
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const file = join(dir, item.name);
      if (item.isDirectory()) { if (!item.name.startsWith("__tests__")) walk(file); }
      else if (/\.(?:tsx?|mts)$/.test(item.name) && !/\.(?:test|spec|d)\./.test(item.name)) files.push(file);
    }
  }
  walk(join(root, "src"));
  const sources = files.map(file => {
    const path = slash(relative(root, file)), text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const constants = new Map(), seen = new Set();
    const seenBindings = new Set();
    function literal(node) {
      if (!node) return null;
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
      return null;
    }
    for (const statement of sf.statements) if (ts.isVariableStatement(statement)) for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) constants.set(decl.name.text, literal(decl.initializer));
    }
    const moduleGroup = path.startsWith("src/features/") ? path.split("/")[2] : path.includes("/dms/") ? "dms" : path.includes("/hr/") ? "hr" : path.includes("/ai/") ? "ai" : path.includes("/report") ? "reports" : path.includes("/master") ? "master_data" : "shared_or_domain_owned";
    function owner(node) {
      for (let p = node; p; p = p.parent) {
        if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
        if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      }
      return "module";
    }
    function add(kind, symbol, node, detail = {}) {
      const anchor = `${path}:${owner(node)}:${kind}:${symbol}`;
      if (seen.has(anchor)) return;
      seen.add(anchor);
      const disposition = kind === "upload" || kind === "review" ? "stage04_adoption_pending" : kind === "form" ? "stage03_field_eligibility_pending" : kind === "screen" ? "inventoried_existing_screen" : kind === "ai_consumer" ? "existing_adapter_review_stage02_or03" : "stage02_matching_or_domain_local_review";
      consumers.push({ id: `AI-C-${digest(anchor).slice(0, 16)}`, path, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, owner: owner(node), kind, symbol, module: moduleGroup, disposition, ...detail });
    }
    function addBinding(kind, field, node) {
      const key = `${path}:${owner(node)}:${kind}:${field}`;
      if (seenBindings.has(key)) return;
      seenBindings.add(key);
      formBindings.push({ id: `AI-B-${digest(key).slice(0,16)}`, path, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, owner: owner(node), kind, field, aiEligibility: "not_granted_by_inventory", disposition: field === "<computed>" ? "computed_binding_held_for_owning_adapter" : "domain_field_inventory_preserve_validation_and_apply_authority" });
    }
    if (/\/page\.tsx$/.test(path)) add("screen", "page", sf, { route: "/" + path.replace(/^src\/app\//, "").replace(/\([^/]+\)\//g, "").replace(/(?:^|\/)page\.tsx$/, "") });
    function fromTable(node) {
      for (let at = node; at && ts.isCallExpression(at) && ts.isPropertyAccessExpression(at.expression); at = at.expression.expression) if (at.expression.name.text === "from") return literal(at.arguments[0]);
      return null;
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const target = literal(node.moduleSpecifier);
        if (target?.includes("/ai/") || target?.includes("/assistant")) add("ai_consumer", target, node);
      }
      if (ts.isCallExpression(node)) {
        const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : "";
        if (["from", "rpc"].includes(method)) queries.push({ path, owner: owner(node), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind: method === "from" && ts.isPropertyAccessExpression(node.expression) && /\.storage$/.test(node.expression.expression.getText(sf)) ? "storage_bucket" : method, target: literal(node.arguments[0]), computed: literal(node.arguments[0]) === null });
        if (method === "select") queries.push({ path, owner: owner(node), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind: "select", target: fromTable(node), fields: literal(node.arguments[0]), computed: literal(node.arguments[0]) === null });
        if (/search|lookup|\.textsearch/i.test(method) || ["ilike", "textSearch"].includes(method)) add("search", method, node);
        if (/upload|admission|attach.*file/i.test(method)) add("upload", method, node);
        if (/review|approve.*intake|reextract/i.test(method)) add("review", method, node);
        if (method === "useForm") add("form", method, node);
        if (method === "register") addBinding("registered_field", literal(node.arguments[0]) ?? "<computed>", node);
        if (method === "object" || method === "strictObject") {
          const shape = node.arguments[0];
          if (shape && ts.isObjectLiteralExpression(shape)) for (const prop of shape.properties) if (ts.isPropertyAssignment(prop)) addBinding("schema_field", prop.name.getText(sf).replaceAll('"', ""), prop);
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sf);
        if (/form|recorddialog/i.test(tag)) add("form", tag, node);
        if (/upload|dropzone|fileinput/i.test(tag)) add("upload", tag, node);
        if (/review|intake/i.test(tag)) add("review", tag, node);
        if (/search|lookup|picker|selector|combobox|\bselect$/i.test(tag)) add("selector", tag, node);
      }
      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sf), value = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : "";
        if (name === "name") addBinding("named_control", value || "<computed>", node);
        if (["value", "checked"].includes(name) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isPropertyAccessExpression(node.initializer.expression)) addBinding("controlled_state", node.initializer.expression.getText(sf).slice(0,200), node);
        if (name === "type" && value === "file") add("upload", "file_input", node);
        if (name === "type" && value === "search" || /placeholder|aria-label/.test(name) && /search|find/i.test(value)) add("search_control", `${name}:${value}`, node);
      }
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(sf).replaceAll('"', ""), p.initializer]));
        if (props.has("targetField") && props.has("isAiEligible")) fields.push({ id: `AI-F-${digest(path + ":" + literal(props.get("targetTable")) + ":" + literal(props.get("targetField"))).slice(0,16)}`, path, table: literal(props.get("targetTable")), field: literal(props.get("targetField")), entity: literal(props.get("entityType")), safety: literal(props.get("safetyClassification")), disposition: /branch-registry|site-registry/.test(path) ? "registered_stub_not_activated" : "existing_registration_domain_apply_rules_preserved" });
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    return { path, sha256: digest(text), module: moduleGroup, disposition: seen.size ? "inventoried_consumers" : "inspected_no_matching_surface" };
  });
  consumers.sort((a,b) => a.id.localeCompare(b.id, "en"));
  const queryOccurrences = new Map();
  for(const query of queries) {
    const anchor=JSON.stringify([query.path,query.owner,query.kind,query.target,query.fields??null]);
    const occurrence=queryOccurrences.get(anchor)??0;queryOccurrences.set(anchor,occurrence+1);
    query.id=`AI-S-${digest(anchor+":"+occurrence).slice(0,16)}`;
    query.disposition=query.computed?"computed_source_held_for_owning_adapter":query.kind==="storage_bucket"?"existing_storage_contract_not_public_table":"existing_domain_source_not_new_AI_access";
    query.authorityOwner=query.path+":"+query.owner;
  }
  const groupCounts = items => Object.fromEntries([...new Set(items.map(x => x.kind))].sort().map(kind => [kind, items.filter(x => x.kind === kind).length]));
  return { inventoryVersion: INVENTORY_VERSION, sources, consumers, fields, formBindings, queries, summary: { sourceFiles: sources.length, consumers: consumers.length, fields: fields.length, formBindings: formBindings.length, queries: queries.length, consumerKinds: groupCounts(consumers), computedQueriesHeld: queries.filter(q => q.computed).length }, limits: ["Static source inventory is not completed runtime adoption or field/business approval.", "Computed queries remain explicitly held for their owning domain adapter; no table or field is guessed.", "Server RLS/authorization, exact counts and provider quality require their own tests.", "English labels detect controls; owning service/import/call inventory also covers custom controls and secondary dialogs.", "No new current-module adapter or shared search API is implemented by this scanner."] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const output = resolve(process.argv[2] ?? join(root, "CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_01_20261030"));
  if (!output.startsWith(root + "/") && !output.startsWith(root + "\\")) throw new Error("Evidence output must remain inside the ERP workspace");
  mkdirSync(output, { recursive: true });
  const result = inventorySource(root);
  for (const [file, data] of [["SOURCE_INVENTORY.json", result], ["FIELD_REGISTER.json", result.fields], ["FORM_FIELD_INVENTORY.json", result.formBindings], ["SOURCE_AUTHORITY_MAP.json", result.queries]]) writeFileSync(join(output, file), JSON.stringify(data, null, 2) + "\n");
  const tables = [...new Set(result.queries.filter(q => q.kind === "from" && q.target).map(q => q.target))].sort();
  const schemaPath = join(output, "HOSTED_SCHEMA_BASELINE.json");
  const fullIndex = join(output, "HOSTED_SCHEMA_INDEX.json");
  const known = existsSync(fullIndex) ? new Set(JSON.parse(readFileSync(fullIndex,"utf8")).rows[0].jsonb_build_object.columns.map(c => c.table)) : existsSync(schemaPath) ? new Set(JSON.parse(readFileSync(schemaPath, "utf8")).rows[0].jsonb_build_object.columns.map(c => c.table_name)) : new Set();
  writeFileSync(join(output, "TABLE_RECONCILIATION.json"), JSON.stringify(tables.map(table => ({ table, schemaCaptured: known.has(table), consumers: result.queries.filter(q => q.target === table).length, disposition: known.has(table) ? "schema_captured_domain_permission_contract_still_required" : "missing_or_view_or_storage_source_requires_owning_adapter_review" })), null, 2) + "\n");
  const modules = [...new Set(result.sources.map(s => s.module))].sort();
  writeFileSync(join(output,"MODULE_COVERAGE.json"),JSON.stringify(modules.map(module => ({ module, sourceFiles: result.sources.filter(s=>s.module===module).length, consumerIds: result.consumers.filter(c=>c.module===module).map(c=>c.id), disposition: "inventoried_not_new_AI_adoption; use owning domain authority; business/unsupported fields remain held" })),null,2)+"\n");
  console.log(JSON.stringify(result.summary));
}
