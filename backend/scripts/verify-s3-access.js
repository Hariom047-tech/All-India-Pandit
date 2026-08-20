#!/usr/bin/env node
/**
 * Runtime IAM check — run this ON THE ACTUAL EC2 INSTANCE (or anywhere the
 * real credential chain resolves) to confirm the attached role can actually
 * do what mediaStorage.js needs, before trusting it with real traffic.
 *
 * Cannot be run from a sandbox/dev machine with no AWS credentials — there
 * is nothing to verify there. This is deliberately NOT part of the test
 * suite for that reason.
 *
 * Writes and immediately deletes ONE tiny throwaway object under
 * `_healthcheck/` — never touches real media — so this is safe to run
 * against the live production bucket.
 *
 * Usage (on the EC2 instance, with AWS_REGION / AWS_S3_MEDIA_BUCKET set):
 *   node scripts/verify-s3-access.js
 */
require('dotenv').config();
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } =
  require('@aws-sdk/client-s3');

const bucket = process.env.AWS_S3_MEDIA_BUCKET;
const region = process.env.AWS_REGION || 'ap-south-1';

if (!bucket) {
  console.error('AWS_S3_MEDIA_BUCKET is not set — nothing to verify.');
  process.exit(1);
}

const key = `_healthcheck/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
const body = Buffer.from(`panditsuggest s3 access check ${new Date().toISOString()}`);

const s3 = new S3Client({ region }); // no explicit credentials — must resolve via IAM role

const checks = [
  {
    name: 'PutObject',
    run: () => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' })),
  },
  { name: 'HeadObject', run: () => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })) },
  { name: 'GetObject', run: () => s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })) },
  { name: 'DeleteObject', run: () => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })) },
];

async function main() {
  console.log(`Bucket: ${bucket}   Region: ${region}   Test key: ${key}\n`);
  let allOk = true;

  for (const check of checks) {
    try {
      await check.run();
      console.log(`  [OK]   ${check.name}`);
    } catch (err) {
      allOk = false;
      const code = err.name || err.Code || 'Error';
      console.error(`  [FAIL] ${check.name}: ${code} — ${err.message}`);
      if (code === 'CredentialsProviderError' || /credential/i.test(err.message || '')) {
        console.error('         No credentials resolved at all — is this running on the EC2 instance with the IAM role attached?');
      }
      if (code === 'AccessDenied') {
        console.error(`         The attached role is missing s3:${check.name} on arn:aws:s3:::${bucket}/*`);
      }
    }
  }

  console.log(allOk
    ? '\nAll checks passed — the IAM role can PutObject/HeadObject/GetObject/DeleteObject on this bucket.'
    : '\nSome checks failed — see above for exactly which s3:* permission is missing.');
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('\nVerification script failed unexpectedly:', err.message);
  process.exit(1);
});
