import 'dotenv/config';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/crypto';
import { savePayee, getRawSettings, payeeHealth } from '../src/lib/settings';

/**
 * Staff logins and, once, the demo payee. A reseed never overwrites a payee the owner has
 * since configured — that would silently repoint real customer payments.
 *
 * No password is written into this file. A new account gets the one the operator names in the
 * environment beside its email, and an account with no password named for it is skipped with a line
 * saying which variable to set. An account that already exists keeps the hash it has, because reseeding
 * must not silently reset a login somebody is using.
 */
async function upsertUser(email: string, name: string, role: string, password: string | undefined, secretName: string) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { role, name } });
    return existing.id;
  }
  if (!password) {
    console.log(`No ${role.toLowerCase()} account created — set ${secretName} in .env, then run this again.`);
    return null;
  }
  const user = await db.user.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
  return user.id;
}

async function main() {
  const ownerId = await upsertUser(
    process.env.SEED_OWNER_EMAIL ?? 'owner@pay.local',
    'Owner',
    'OWNER',
    process.env.SEED_OWNER_PASSWORD,
    'SEED_OWNER_PASSWORD',
  );
  const managerId = await upsertUser(
    process.env.SEED_MANAGER_EMAIL ?? 'manager@pay.local',
    'Manager',
    'MANAGER',
    process.env.SEED_MANAGER_PASSWORD,
    'SEED_MANAGER_PASSWORD',
  );
  const cashierId = await upsertUser(
    process.env.SEED_CASHIER_EMAIL ?? 'cashier@pay.local',
    'Cashier',
    'CASHIER',
    process.env.SEED_CASHIER_PASSWORD,
    'SEED_CASHIER_PASSWORD',
  );
  const logins = [ownerId, managerId, cashierId].filter(Boolean).length;

  // The earlier build called the top role ADMIN; this service speaks OWNER.
  const demoted = await db.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'OWNER' } });
  if (demoted.count) console.log(`Promoted ${demoted.count} ADMIN account(s) to OWNER.`);

  const settings = await getRawSettings();
  const vpa = process.env.SEED_PAYEE_VPA;
  // The payee is filed under an account, so a seed that created none looks for one before it writes.
  const actorId = ownerId ?? (await db.user.findFirst({ where: { role: 'OWNER' }, select: { id: true } }))?.id ?? null;

  if (settings && (await payeeHealth()) === 'unreadable') {
    // The stored payee was sealed with a key this build cannot derive. Every intent froze the
    // same public VPA, so the newest one restores the identical value under the new key —
    // it cannot repoint a payee, because it never invents one.
    const frozen = await db.order.findFirst({
      where: { upiIdUsed: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { upiIdUsed: true },
    });
    if (frozen?.upiIdUsed && actorId) {
      await savePayee({
        vpa: frozen.upiIdUsed,
        payeeName: settings.upiPayeeName ?? settings.businessName,
        businessName: settings.businessName,
        actorId,
      });
      console.log(`Re-sealed the existing payee as ${frozen.upiIdUsed} under this build's key.`);
    } else {
      console.log('The stored payee was not restored — either no frozen copy exists or no owner account is here to file it under. Set it in Payment settings.');
    }
  } else if (!settings && vpa) {
    if (!actorId) {
      console.log('The payee was not recorded — this service keeps one only under an owner account. Name SEED_OWNER_PASSWORD in .env, seed again, then set it in Payment settings.');
    } else {
      await savePayee({ vpa, payeeName: 'Saffron & Smoke', businessName: 'Saffron & Smoke', actorId });
      console.log(`Payee UPI set to ${vpa} (masked in the UI).`);
    }
  } else if (settings) {
    console.log(`Payee already configured as ${settings.upiIdMasked} — left alone.`);
  } else {
    console.log('No SEED_PAYEE_VPA and no payee on record: set one in Payment settings before bills can be paid.');
  }

  console.log(
    logins
      ? `${logins} staff login(s) on this database. Their passwords came from your .env, so change them there before real use.`
      : 'No staff login exists on this database and none was created. Name a password beside each SEED_*_EMAIL in .env, then run npm run db:seed.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
