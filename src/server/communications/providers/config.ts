import 'server-only';

export const communicationFeatures = [
  'chat', 'realtime', 'media_upload', 'media_download', 'export', 'push', 'ptt_live', 'ptt_replay', 'sos',
] as const;

export type CommunicationFeature = (typeof communicationFeatures)[number];

export function communicationFeatureEnabled(feature: CommunicationFeature, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return communicationFeatures.includes(feature) && env[`ERP_COMM_${feature.toUpperCase()}_ENABLED`] === 'true';
}
