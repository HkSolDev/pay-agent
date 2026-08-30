import "dotenv/config";
import { prisma } from "@perflo-ap-agent/db";
import { encryptPaymentMethod, hashPaymentMethod, toPrismaBytes } from "./payee-crypto.js";
import { normalizePaymentMethod, type PaymentMethod } from "./payment-method-validation.js";

/**
 * Local-only demo payees, pairing with worker/src/demo-inbox.ts's fixture
 * emails: "changed-upi" and "unknown-sender" resolve against Riya's UPI rail
 * here, "changed-bank" resolves against Acme's original (pre-change) bank
 * rail, "multiple-rails" against Vendor7's two active rails, and
 * "conflicting-sender-rail" against Conflict Payee's rail. Nothing here calls
 * Perflo or moves money — payeeId/recipientNickname are local values only.
 *
 * Rail specs are plain (kind + fields), encrypted inside seedDemoPayees()
 * itself rather than at module load: PAYEE_ENCRYPTION_KEY is often set by a
 * caller (a test's beforeEach, this file's own CLI entrypoint) *after* this
 * module is imported — ES module imports execute before the importing file's
 * own top-level statements, so encrypting at module-load time would silently
 * use whatever key happened to be set first, not the one the caller intends.
 */
export const DEMO_PAYEE_PREFIX = "demo-payee-";

interface DemoRailSpec {
  method: PaymentMethod;
  revoked?: boolean;
}

interface DemoPayeeSpec {
  id: string;
  name: string;
  senderAddrs: string[];
  rails: DemoRailSpec[];
}

const specs: DemoPayeeSpec[] = [
  {
    id: `${DEMO_PAYEE_PREFIX}riya`,
    name: "Riya Sharma — normal UPI payee",
    senderAddrs: ["riya@vendor.example"],
    rails: [{ method: { kind: "upi", vpa: "riya@okaxis" } }],
  },
  {
    id: `${DEMO_PAYEE_PREFIX}acme`,
    name: "Acme Billing — bank/NEFT payee (pre-change account)",
    senderAddrs: ["billing@acme.example"],
    rails: [{ method: { kind: "bank_neft", accountNumber: "999999999999", ifsc: "HDFC0009999" } }],
  },
  {
    id: `${DEMO_PAYEE_PREFIX}vendor7`,
    name: "Vendor7 — multiple rails",
    senderAddrs: ["vendor7@vendor.example"],
    rails: [
      { method: { kind: "upi", vpa: "vendor7@okaxis" } },
      // Deliberately NOT the same account/IFSC as demo-inbox.ts's "changed-bank"
      // fixture (123456789012 / HDFC0001234) — that number belongs to Acme's
      // *new* bank details there; reusing it here would make "changed-bank"
      // collide with Vendor7's approved rail instead of Acme's own identity.
      { method: { kind: "bank_neft", accountNumber: "555555555555", ifsc: "SBIN0005555" } },
    ],
  },
  {
    id: `${DEMO_PAYEE_PREFIX}conflict`,
    name: "Conflict Payee — rail claimed by a different sender's email",
    senderAddrs: ["conflict-owner@vendor.example"],
    rails: [{ method: { kind: "upi", vpa: "conflict@okaxis" } }],
  },
  {
    id: `${DEMO_PAYEE_PREFIX}revoked`,
    name: "Revoked Vendor — rail revoked, can no longer resolve invoices",
    senderAddrs: ["revoked@vendor.example"],
    rails: [{ method: { kind: "upi", vpa: "revoked@okaxis" }, revoked: true }],
  },
  {
    id: `${DEMO_PAYEE_PREFIX}duplicates`,
    name: "Duplicate Fixtures — two sender addresses for duplicate detection",
    senderAddrs: ["vendor9@vendor.example", "vendor10@vendor.example"],
    rails: [
      { method: { kind: "upi", vpa: "vendor9@okaxis" } },
      { method: { kind: "upi", vpa: "vendor10@okaxis" } },
    ],
  },
];

function encryptedRailData(spec: DemoRailSpec) {
  const normalized = normalizePaymentMethod(spec.method);
  if (!normalized) throw new Error(`Invalid demo payment method: ${JSON.stringify(spec.method)}`);
  const canonical = normalized.kind === "upi"
    ? `upi:${normalized.vpa}`
    : `bank_neft:${normalized.accountNumber}:${normalized.ifsc}`;
  return {
    rail: normalized.kind,
    encryptedPayload: toPrismaBytes(encryptPaymentMethod(canonical)),
    lookupHash: hashPaymentMethod(canonical),
    ...(spec.revoked ? { status: "revoked", revokedAt: new Date() } : {}),
  };
}

export async function resetDemoPayees(): Promise<number> {
  const ids = specs.map((s) => s.id);
  await prisma.payeePaymentMethod.deleteMany({ where: { payeeId: { in: ids } } });
  await prisma.payeeIdentity.deleteMany({ where: { payeeId: { in: ids } } });
  const result = await prisma.payee.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

export async function seedDemoPayees(): Promise<number> {
  let count = 0;
  for (const spec of specs) {
    await prisma.payee.create({
      data: {
        id: spec.id,
        name: spec.name,
        recipientNickname: `${spec.id}-perflo`,
        grantApproved: true,
        status: "approved",
        approvedAt: new Date(),
        grantPerPaymentCapInr: "5000.00",
        grantTotalCapInr: "50000.00",
        grantMaxPayments: 20,
        grantExpiresAt: new Date("2027-12-31"),
        identities: { create: spec.senderAddrs.map((senderAddr) => ({ senderAddr })) },
        paymentMethods: { create: spec.rails.map(encryptedRailData) },
      },
    });
    count += 1;
  }
  return count;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--reset")) {
    console.log(`[demo-payees] reset ${await resetDemoPayees()} demo payees`);
    if (!args.includes("--reseed")) return;
  }
  console.log(`[demo-payees] seeded ${await seedDemoPayees()} demo payees`);
}

if (process.argv[1]?.endsWith("demo-payees.ts")) void main().finally(() => prisma.$disconnect());
