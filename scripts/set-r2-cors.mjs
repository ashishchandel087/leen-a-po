// One-off: apply the CORS policy to the R2 bucket configured in .env.
// Run from project root with:
//   node --env-file=.env scripts/set-r2-cors.mjs
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
} = process.env;

const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
  .filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  console.error("Run with: node --env-file=.env scripts/set-r2-cors.mjs");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Extra origins can be added without editing this file, e.g.:
//   R2_CORS_ORIGINS="http://192.168.1.8:3000,https://abcd.ngrok-free.app"
const extraOrigins = (process.env.R2_CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const policy = {
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: [
          "https://leen-a-po.vercel.app",
          "http://localhost:3000",
          "http://192.168.1.5:3000",
          // ngrok tunnels rotate per session — wildcard so we don't re-run this
          // every time the dev tunnel URL changes.
          "https://*.ngrok-free.app",
          "https://*.ngrok.app",
          ...extraOrigins,
        ],
        AllowedMethods: ["GET", "PUT"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
  },
};

try {
  await s3.send(new PutBucketCorsCommand(policy));
  console.log(`✓ CORS applied to bucket "${R2_BUCKET}"`);
  // Verify
  const got = await s3.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
  console.log("Active CORS rules:");
  console.log(JSON.stringify(got.CORSRules, null, 2));
} catch (err) {
  console.error("Failed:", err?.message ?? err);
  if (err?.$response?.statusCode) console.error("HTTP", err.$response.statusCode);
  process.exit(1);
}
