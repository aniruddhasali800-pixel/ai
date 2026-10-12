import 'dotenv/config';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/crypto';
import { savePayee, getRawSettings, payeeHealth } from '../src/lib/settings';

/**
 * Staff logins and, once, the demo payee. A reseed never overwrites a payee the owner has
 * since configured — that would silently repoint real customer payments.
 */
async function upsertUser(email: string, name: string, role: string, password: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { role, name } });
    return existing.id;
  }
  const user = await db.user.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
  return user.id;
}

async function main() {
  const ownerId = await upsertUser(
    process.env.SEED_OWNER_EMAIL ?? 'owner@pay.local',
    'Owner',
    'OWNER',
    process.env.SEED_OWNER_PASSWORD ?? 'Owner#12345',
  );
  await upsertUser(
    process.env.SEED_MANAGER_EMAIL ?? 'manager@pay.local',
    'Manager',
    'MANAGER',
    process.env.SEED_MANAGER_PASSWORD ?? 'Manager#12345',
  );
  await upsertUser(
    process.env.SEED_CASHIER_EMAIL ?? 'cashier@pay.local',
    'Cashier',
    'CASHIER',
    process.env.SEED_CASHIER_PASSWORD ?? 'Cashier#12345',
  );

  // The earlier build called the top role ADMIN; this service speaks OWNER.
  const demoted = await db.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'OWNER' } });
  if (demoted.count) console.log(`Promoted ${demoted.count} ADMIN account(s) to OWNER.`);

  const settings = await getRawSettings();
  const vpa = process.env.SEED_PAYEE_VPA;

  if (settings && (await payeeHealth()) === 'unreadable') {
    // The stored payee was sealed with a key this build cannot derive. Every intent froze the
    // same public VPA, so the newest one restores the identical value under the new key —
    // it cannot repoint a payee, because it never invents one.
    const frozen = await db.order.findFirst({
      where: { upiIdUsed: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { upiIdUsed: true },
    });
    if (frozen?.upiIdUsed) {
      await savePayee({
        vpa: frozen.upiIdUsed,
        payeeName: settings.upiPayeeName ?? settings.businessName,
        businessName: settings.businessName,
        actorId: ownerId,
      });
      console.log(`Re-sealed the existing payee as ${frozen.upiIdUsed} under this build's key.`);
    } else {
      console.log('The stored payee cannot be decrypted and no frozen copy exists — set it in Payment settings.');
    }
  } else if (!settings && vpa) {
    await savePayee({ vpa, payeeName: 'Saffron & Smoke', businessName: 'Saffron & Smoke', actorId: ownerId });
    console.log(`Payee UPI set to ${vpa} (masked in the UI).`);
  } else if (settings) {
    console.log(`Payee already configured as ${settings.upiIdMasked} — left alone.`);
  } else {
    console.log('No SEED_PAYEE_VPA and no payee on record: set one in Payment settings before bills can be paid.');
  }

  console.log('Staff logins are ready. Change them before real use.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
