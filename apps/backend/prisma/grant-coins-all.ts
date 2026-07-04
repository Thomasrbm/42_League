/**
 * Crédite des League Coins en masse :
 *   - tous les joueurs : +300
 *   - les superadmins  : +100 000 (au lieu de +300)
 *
 * Superadmin = role SUPERADMIN OU login hardcodé (abidaux, throbert).
 *
 * ⚠️ NON idempotent : chaque exécution ajoute de nouveau les montants.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPERADMINS = new Set(['abidaux', 'throbert']);
const USER_BONUS = 300;
const SUPERADMIN_BONUS = 100_000;

async function main() {
  const users = await prisma.user.findMany({ select: { login: true, role: true } });
  console.log(`💰 Crédit de ${users.length} joueurs…`);

  let admins = 0;
  await prisma.$transaction(
    users.map((u) => {
      const isSuper = u.role === 'SUPERADMIN' || SUPERADMINS.has(u.login.toLowerCase());
      if (isSuper) admins++;
      const amount = isSuper ? SUPERADMIN_BONUS : USER_BONUS;
      return prisma.user.update({
        where: { login: u.login },
        data: { leagueCoins: { increment: amount } },
        select: { login: true },
      });
    }),
  );

  console.log(`   ✓ ${admins} superadmin(s) crédité(s) de ${SUPERADMIN_BONUS}`);
  console.log(`   ✓ ${users.length - admins} joueur(s) crédité(s) de ${USER_BONUS}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
