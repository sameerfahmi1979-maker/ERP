import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createPrivateKey, generateKeyPairSync, randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const { findSecrets } = require('../../../tooling/security/scan-secrets.cjs') as {
  findSecrets: (text:string, exact?:Array<{name:string;value:string}>)=>Array<{line:number;category:string}>;
};

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
const ed25519 = generateKeyPairSync('ed25519').privateKey;
const pem = (key: typeof rsa, type: 'pkcs1' | 'sec1' | 'pkcs8') =>
  key.export({ format: 'pem', type }).toString();
const uint32 = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};
const sshString = (value: Buffer | string) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([uint32(bytes.length), bytes]);
};

// OpenSSH's unencrypted container, built only from this process's ephemeral key.
// https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.key
function opensshPrivateKey() {
  const jwk = ed25519.export({ format: 'jwk' });
  const publicBytes = Buffer.from(jwk.x!, 'base64url');
  const privateBytes = Buffer.concat([Buffer.from(jwk.d!, 'base64url'), publicBytes]);
  const publicKey = Buffer.concat([sshString('ssh-ed25519'), sshString(publicBytes)]);
  const check = randomBytes(4);
  const privateKey = Buffer.concat([
    check, check, publicKey, sshString(privateBytes), sshString('ephemeral-unit-test'),
  ]);
  const padding = Buffer.from(Array.from({ length: 8 - privateKey.length % 8 }, (_, i) => i + 1));
  const body = Buffer.concat([
    Buffer.from('openssh-key-v1\0'), sshString('none'), sshString('none'), sshString(''),
    uint32(1), sshString(publicKey), sshString(Buffer.concat([privateKey, padding])),
  ]).toString('base64').match(/.{1,70}/g)!.join('\n');
  return ['-----BEGIN OPENSSH PRIVATE KEY-----', body, '-----END OPENSSH PRIVATE KEY-----'].join('\n');
}

const privateKeys = [
  ['RSA PKCS1', pem(rsa, 'pkcs1')],
  ['EC SEC1', pem(ec, 'sec1')],
  ['PKCS8', pem(ed25519, 'pkcs8')],
  ['OpenSSH', opensshPrivateKey()],
  ['encrypted PKCS8', rsa.export({
    format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase: randomBytes(24),
  }).toString()],
  ['legacy encrypted RSA', rsa.export({
    format: 'pem', type: 'pkcs1', cipher: 'aes-256-cbc', passphrase: randomBytes(24),
  }).toString()],
];

describe('publication secret scanner', () => {
  describe('private PEM material', () => {
    it.each([
      ['PowerShell escaped newlines', (lines: string[]) => '$key = "' + lines.join('`n') + '`n"'],
      ['concatenated quoted PEM lines', (lines: string[]) => lines.map(line => JSON.stringify(line + '\n')).join(' + ')],
      ['array of quoted PEM lines', (lines: string[]) => '[' + lines.map(line => JSON.stringify(line)).join(',') + '].join("\\n")'],
      ['raw array of quoted PEM lines', (lines: string[]) => '[' + lines.map(line => JSON.stringify(line)).join(',') + ']'],
      ['array with a trailing empty line', (lines: string[]) => '[' + [...lines, ''].map(line => JSON.stringify(line)).join(',') + '].join("\\n")'],
      ['whitespace within a PEM body', (lines: string[]) => [lines[0], lines[1].match(/.{1,16}/g)!.join(' '), lines[2]].join('\n')],
      ['tabs within a PEM body', (lines: string[]) => [lines[0], lines[1].match(/.{1,16}/g)!.join('\t'), lines[2]].join('\n')],
    ] as const)('detects importable generated PKCS8 with %s', (_format, source) => {
      const value = pem(ed25519, 'pkcs8');
      // Prove these are actual private-key bytes without evaluating source.
      expect(createPrivateKey(value).asymmetricKeyType).toBe('ed25519');
      expect(findSecrets(source(value.trimEnd().split('\n')))).toEqual([{ line: 1, category: 'PRIVATE_KEY' }]);
    });

    it.each([' ', '\t'])('detects importable PEM with ASCII body whitespace %#', (separator) => {
      const lines = pem(ed25519, 'pkcs8').trimEnd().split('\n');
      const value = [lines[0], lines[1].match(/.{1,16}/g)!.join(separator), lines[2]].join('\n');
      expect(createPrivateKey(value).asymmetricKeyType).toBe('ed25519');
      expect(findSecrets(value)).toEqual([{ line: 1, category: 'PRIVATE_KEY' }]);
    });

    it.each([
      '"-----BEGIN PRIVATE KEY-----"; const unrelated = "' + 'a'.repeat(64) + '"; const end = "-----END PRIVATE KEY-----";',
      JSON.stringify({ begin: '-----BEGIN PRIVATE KEY-----', unrelated: 'a'.repeat(64), end: '-----END PRIVATE KEY-----' }),
      '"-----BEGIN PRIVATE KEY-----" + loadValue() + "-----END PRIVATE KEY-----"',
    ])('does not cross unrelated statements, fields, or executable expressions %#', (source) => {
      expect(findSecrets(source)).toEqual([]);
    });

    it.each([
      '!key?.startsWith("-----BEGIN PRIVATE KEY-----") || !key.trimEnd().endsWith("-----END PRIVATE KEY-----")',
      '-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----',
      JSON.stringify({ begin: '-----BEGIN PRIVATE KEY-----', end: '-----END PRIVATE KEY-----' }),
      '"-----BEGIN PRIVATE KEY-----"; const unrelated = "' + 'a'.repeat(64) + '";',
      '-----BEGIN PRIVATE KEY-----\nThis is a description of the expected key format.',
    ])('allows marker-only format validation %#', (source) => {
      expect(findSecrets(source)).toEqual([]);
    });

    for (const [label, value] of privateKeys) {
      it.each([
        ['LF', value],
        ['CRLF', value.replace(/\n/g, '\r\n')],
        ['JSON escaped LF', JSON.stringify({ private_key: value })],
        ['JSON escaped CRLF', JSON.stringify({ private_key: value.replace(/\n/g, '\r\n') })],
        ['twice JSON escaped', JSON.stringify(JSON.stringify(value))],
        ['quoted line concatenation', value.trimEnd().split('\n').map(line => JSON.stringify(line + '\n')).join(' +\n')],
        ['raw array of lines', '[' + value.trimEnd().split('\n').map(line => JSON.stringify(line)).join(',\n') + ']'],
      ])(`detects generated ${label} with %s without exposing it`, (_encoding, source) => {
        const hits = findSecrets('prefix\n' + source);
        expect(hits).toEqual([{ line: 2, category: 'PRIVATE_KEY' }]);
        expect(JSON.stringify(hits)).not.toContain(value);
      });
    }

    it.each(['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'OPENSSH PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'DSA PRIVATE KEY'])
      ('detects unterminated %s material, including short wrapped lines', (label) => {
        const body = pem(ed25519, 'pkcs8').split('\n')[1].slice(0, 32);
        const header = '-----BEGIN ' + label + '-----';
        const partial = header + '\n' + body.slice(0, 16) + '\n' + body.slice(16);
        for (const source of [header + '\n' + body, partial, JSON.stringify(partial), JSON.stringify(partial.replace(/\n/g, '\r\n'))]) {
          expect(findSecrets(source)).toEqual([{ line: 1, category: 'PRIVATE_KEY' }]);
        }
      });

    it('requires at least 32 non-padding base64 characters and does not join prose words', () => {
      const header = '-----BEGIN PRIVATE KEY-----\n';
      expect(findSecrets(header + 'a'.repeat(31) + '=')).toEqual([]);
      expect(findSecrets(header + Array.from({ length: 16 }, () => 'word').join(' '))).toEqual([]);
      expect(findSecrets(header + 'a'.repeat(32))).toEqual([{ line: 1, category: 'PRIVATE_KEY' }]);
    });

    it('continues after bare markers and reports the physical line of a later real key', () => {
      expect(findSecrets('"-----BEGIN PRIVATE KEY-----"\n\n' + pem(ed25519, 'pkcs8')))
        .toEqual([{ line: 3, category: 'PRIVATE_KEY' }]);
    });
  });

  it.each([
    ['PROVIDER_KEY', ['sk', 'a'.repeat(32)].join('-')],
    ['PROVIDER_KEY', ['sk', 'proj', 'a'.repeat(32)].join('-')],
    ['PROVIDER_KEY', ['sk', 'svcacct', 'a'.repeat(32)].join('-')],
    ['GITHUB_TOKEN', ['ghp', 'a'.repeat(32)].join('_')],
    ['GITHUB_TOKEN', ['github', 'pat', 'a'.repeat(32)].join('_')],
    ['SUPABASE_SECRET', ['sb', 'secret', 'a'.repeat(24)].join('_')],
  ])('preserves %s detection', (category, value) => {
    expect(findSecrets(value)).toEqual([{ line: 1, category }]);
  });

  it('preserves service-role JWT detection without flagging ordinary JWTs', () => {
    const jwt = (role: string) => [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ role })).toString('base64url'),
      randomBytes(32).toString('base64url'),
    ].join('.');
    expect(findSecrets(jwt('service_role'))).toEqual([{ line: 1, category: 'SERVICE_ROLE_JWT' }]);
    expect(findSecrets(jwt('authenticated'))).toEqual([]);
  });
  it.each(['INTERNAL_API_SECRET', 'PDF_PRINT_TOKEN_SECRET', 'DMS_SCHEDULER_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'ZHIPU_API_KEY', '$ApiKey'])
    ('detects a nonstandard %s without exposing its value', (name) => {
      const value = ['not-a-real', 'credential-for-negative-test'].join('-');
      const hits = findSecrets(name+'="'+value+'"');
      expect(hits).toEqual([{line:1,category:'LITERAL_SHARED_SECRET'}]);
      expect(JSON.stringify(hits)).not.toContain(value);
    });
  it('detects the historical vendor key format', () => {
    expect(findSecrets('a'.repeat(32)+'.'+'b'.repeat(20))).toEqual([{line:1,category:'ZHIPU_KEY'}]);
  });
  it('allows environment references and clearly synthetic fixtures', () => {
    expect(findSecrets('INTERNAL_API_SECRET="synthetic-ci-only-key"')).toEqual([]);
    expect(findSecrets('const key = process.env.INTERNAL_API_SECRET;')).toEqual([]);
  });
  it('compares private local values without revealing them', () => {
    const value = ['made-up-exact', 'matching-value'].join('-');
    expect(findSecrets('line1\n'+value,[{name:'PRIVATE_LOCAL_VALUE',value}])).toEqual([{line:2,category:'PRIVATE_LOCAL_VALUE'}]);
  });
});
