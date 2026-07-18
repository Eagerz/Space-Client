const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getSecret() {
  return (
    process.env.PROGRESSION_JWT_SECRET ||
    process.env.STRIPE_SECRET_KEY ||
    "dev-progression-secret-change-me"
  );
}

function signProgressionJwt(payload, expiresInSec = 300) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const headerPart = base64url(JSON.stringify(header));
  const bodyPart = base64url(JSON.stringify(body));
  const data = `${headerPart}.${bodyPart}`;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

module.exports = { signProgressionJwt, getSecret };
