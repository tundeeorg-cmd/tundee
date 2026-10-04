#!/usr/bin/env node
/**
 * Spike step 1 — can a standard OIDC client verify LINE's ID tokens?
 *
 * Supabase's custom OIDC providers resolve endpoints and signing keys from the
 * issuer's discovery document. The open question for LINE is the signing
 * algorithm: LINE Login (web) has historically signed ID tokens HS256 with the
 * channel secret, while its JWKS publishes ES256 keys. A verifier that only
 * trusts the JWKS would reject an HS256 token.
 *
 * This prints what LINE advertises. It cannot see what a real token is signed
 * with — pass one as LINE_ID_TOKEN to decode its header (header only; nothing is
 * verified or sent anywhere).
 *
 *   node scripts/spike/line-oidc/check-line.mjs
 *   LINE_ID_TOKEN=eyJ... node scripts/spike/line-oidc/check-line.mjs
 */

const ISSUER = 'https://access.line.me';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const discovery = await getJson(`${ISSUER}/.well-known/openid-configuration`);
console.log('issuer                     ', discovery.issuer);
console.log('authorization_endpoint     ', discovery.authorization_endpoint);
console.log('token_endpoint             ', discovery.token_endpoint);
console.log('jwks_uri                   ', discovery.jwks_uri);
console.log('id_token_signing_alg_values', discovery.id_token_signing_alg_values_supported);

if (discovery.issuer !== ISSUER) {
  console.warn(`! issuer in the document (${discovery.issuer}) differs from ${ISSUER}; configure Supabase with the document's value`);
}

const jwks = await getJson(discovery.jwks_uri);
console.log('\nJWKS keys:');
for (const k of jwks.keys ?? []) console.log(`  kid=${k.kid} kty=${k.kty} alg=${k.alg ?? '-'} crv=${k.crv ?? '-'}`);

const advertised = discovery.id_token_signing_alg_values_supported ?? [];
const hasHs = advertised.some(a => a.startsWith('HS'));
console.log(`\nHS* advertised in discovery: ${hasHs ? 'yes' : 'no'}`);

const token = process.env.LINE_ID_TOKEN;
if (token) {
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  console.log('\nSupplied token header:', header);
  if (header.alg?.startsWith('HS')) {
    console.log('→ HS-signed. A JWKS-only verifier cannot check this; the Supabase test decides whether it copes.');
  } else {
    console.log('→ Asymmetric. Verifiable against the JWKS above.');
  }
}
