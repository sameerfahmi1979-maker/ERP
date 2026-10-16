'use strict';
// Explicit native integration command only; missing fixture fails closed.
// No fixture creation, issuance, email, mutation, worker or provider calls.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {loadFixture, actorNames, nativeRead, appRead, assertMetadata, columns, verifyActorSessions} = require('../../../../tooling/integration/f00-f06/schema/native-fixture.cjs');
const {guardedLab} = require('../../../../tooling/integration/f00-f06/schema/guarded-lab.cjs');
const fixture = loadFixture(process.env.ALGT_TEMPLATE_NATIVE_FIXTURE);
let lab;
before(async () => {
  lab = await guardedLab();
  await verifyActorSessions(fixture, query => JSON.parse(lab.sql(query, 45000)));
});
after(async () => { if (lab) await verifyActorSessions(fixture, query => JSON.parse(lab.sql(query, 45000))); });
const order = 'is_default.desc,template_name.asc,id.asc';
const nativeParams = extra => ({select: columns.join(','), template_code: `like.${fixture.prefix}*`, order, ...extra});

for (const name of actorNames) {
  for (const consumer of ['Report Center', 'Employee Letters']) {
    const issuableOnly = consumer === 'Employee Letters';
    test(`${consumer}: ${name} native exact count/page and actual application boundary`, async () => {
      const actor = fixture.actors[name], expected = actor[issuableOnly ? 'employeeLetterIds' : 'reportCenterIds'];
      const native = await nativeRead(fixture, actor, nativeParams({selectable: 'eq.true', ...(issuableOnly ? {governance_status: 'in.(approved,published)'} : {}), limit: '25', offset: '0'}));
      assert.equal(native.status, 200, 'Native selector must execute, not return the historical missing-view503');
      assert.equal(native.count, expected.length);
      assert.deepEqual(native.body.map(row => row.id), expected.slice(0, 25));
      assertMetadata(native.body);
      const app = await appRead(fixture, actor, {search: fixture.prefix, page: 1, pageSize: 25, issuableOnly});
      if (name === 'noRole') { assert.equal(app.status, 403); return; }
      assert.equal(app.status, 200);
      assert.equal(app.body.success, true);
      assert.equal(app.body.data.totalCount, expected.length);
      assert.deepEqual(app.body.data.rows.map(row => row.id), expected.slice(0, 25));
      assertMetadata(app.body.data.rows);
    });
  }
}

for (const consumer of ['Report Center', 'Employee Letters']) {
  const issuableOnly = consumer === 'Employee Letters';
  test(`${consumer}: scoped tail beyond1000 and point selection outside current page`, async () => {
    const actor = fixture.actors.scoped, expected = actor[issuableOnly ? 'employeeLetterIds' : 'reportCenterIds'];
    const tail = await appRead(fixture, actor, {search: fixture.prefix, page: 41, pageSize: 25, issuableOnly, selectedId: fixture.ids.tailId});
    assert.equal(tail.status, 200); assert.equal(tail.body.success, true);
    assert.deepEqual(tail.body.data.rows.map(row => row.id), expected.slice(1000, 1025));
    assert.equal(tail.body.data.totalCount, expected.length);
    assert.equal(tail.body.data.selected.id, fixture.ids.tailId);
    const first = await appRead(fixture, actor, {search: fixture.prefix, page: 1, pageSize: 25, issuableOnly, selectedId: fixture.ids.tailId});
    assert.equal(first.status, 200); assert.equal(first.body.data.selected.id, fixture.ids.tailId);
    assert.equal(first.body.data.selected.selectable, true);
    assert.ok(!first.body.data.rows.some(row => row.id === fixture.ids.tailId));
    const exhausted = await appRead(fixture, actor, {search: fixture.prefix, page: 1000, pageSize: 25, issuableOnly});
    assert.equal(exhausted.status, 200); assert.equal(exhausted.body.data.totalCount, expected.length);
    assert.deepEqual(exhausted.body.data.rows, []);
  });
  test(`${consumer}: independently authorized historical selection is retained but never issuable`, async () => {
    for (const id of [fixture.ids.inactiveId, fixture.ids.inactiveBrandingId]) {
      const result = await appRead(fixture, fixture.actors.scoped, {search: fixture.prefix, issuableOnly, selectedId: id});
      assert.equal(result.status, 200); assert.equal(result.body.data.selected.id, id);
      assert.equal(result.body.data.selected.selectable, false);
      assert.ok(!result.body.data.rows.some(row => row.id === id));
    }
  });
  test(`${consumer}: deleted and unauthorized selections do not disclose metadata`, async () => {
    for (const id of [fixture.ids.deletedId, fixture.ids.foreignId, fixture.ids.unbrandedId, fixture.ids.globalBrandingId, fixture.ids.deletedBrandingId]) {
      const result = await appRead(fixture, fixture.actors.scoped, {search: fixture.prefix, issuableOnly, selectedId: id});
      assert.equal(result.status, 200); assert.equal(result.body.data.selected, null);
    }
  });
  test(`${consumer}: supplied company criteria restrict but never widen authority`, async () => {
    const result = await appRead(fixture, fixture.actors.scoped, {search: fixture.prefix, issuableOnly, ownerCompanyIds: [fixture.foreignCompanyId], selectedId: fixture.ids.foreignId});
    assert.equal(result.status, 200); assert.equal(result.body.data.selected, null);
    assert.equal(result.body.data.totalCount, 0); assert.deepEqual(result.body.data.rows, []);
  });
}

test('Draft metadata is selectable in Report Center but cannot become an Employee Letters official choice', async () => {
  for (const issuableOnly of [false, true]) {
    const result = await appRead(fixture, fixture.actors.scoped, {search: fixture.prefix, issuableOnly, selectedId: fixture.ids.draftId});
    assert.equal(result.status, 200); assert.equal(result.body.data.selected.id, fixture.ids.draftId);
    assert.equal(result.body.data.selected.selectable, !issuableOnly);
    if (issuableOnly) assert.ok(!result.body.data.rows.some(row => row.id === fixture.ids.draftId));
  }
});
test('Explicit global authority admits unbranded/global-branding metadata without broadening scoped actors', async () => {
  for (const id of [fixture.ids.unbrandedId, fixture.ids.globalBrandingId]) {
    const result = await appRead(fixture, fixture.actors.global, {search: fixture.prefix, selectedId: id});
    assert.equal(result.status, 200); assert.equal(result.body.data.selected.id, id);
    assert.equal(result.body.data.selected.owner_company_id, null);
  }
});
test('Anonymous selector access is denied and raw branding remains unavailable even to a permitted scoped reader', async () => {
  const anon = await nativeRead(fixture, null, nativeParams({limit: '1'}));
  assert.ok([401, 403].includes(anon.status));
  const raw = await nativeRead(fixture, fixture.actors.scoped, {select: 'id', limit: '1'}, 'erp_report_branding_profiles');
  assert.ok([401, 403].includes(raw.status));
});
for (const name of ['branchOnly','noRole','combined']) {
  test(`${name}: direct native point probes cannot borrow unrelated role scope`, async () => {
    const actor = fixture.actors[name];
    const deniedIds = [fixture.ids.foreignId,fixture.ids.unbrandedId,fixture.ids.globalBrandingId,
      ...(name === 'combined' ? [] : [fixture.ids.tailId])];
    for (const id of deniedIds) {
      const native = await nativeRead(fixture, actor, {select:columns.join(','), id:`eq.${id}`});
      assert.equal(native.status,200); assert.equal(native.count,0); assert.deepEqual(native.body,[]);
      const app = await appRead(fixture, actor, {selectedId:id});
      if (name === 'noRole') assert.equal(app.status,403);
      else { assert.equal(app.status,200); assert.equal(app.body.data.selected,null); }
    }
  });
}
