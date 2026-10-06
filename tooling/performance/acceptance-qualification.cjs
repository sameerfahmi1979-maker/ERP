'use strict';
// Inventory discovery cannot silently remove a separately recorded acceptance hold.
function preservedAcceptanceQualification(previous) {
  if (!previous || !Object.prototype.hasOwnProperty.call(previous, 'currentAcceptanceQualification')) return undefined;
  const qualification = previous.currentAcceptanceQualification;
  if (!qualification || typeof qualification !== 'object' || Array.isArray(qualification)) throw Error('Existing acceptance qualification must be reviewed, not discarded');
  for (const field of ['recordedAt', 'status', 'note']) {
    if (typeof qualification[field] !== 'string' || !qualification[field].trim()) throw Error('Incomplete existing acceptance qualification: '+field);
  }
  if (!Number.isFinite(Date.parse(qualification.recordedAt))) throw Error('Invalid acceptance qualification date');
  return JSON.parse(JSON.stringify(qualification));
}
function qualificationMarkdown(qualification) {
  if (!qualification) return '';
  const text = value => String(value).replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>#|]/g, '\\$&');
  return '## Current acceptance qualification\n\n'+text(qualification.status)+' — recorded '+text(qualification.recordedAt)+'.\n\n'+text(qualification.note)+'\n\n';
}
module.exports = {preservedAcceptanceQualification, qualificationMarkdown};
