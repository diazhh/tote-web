/**
 * Calculate how to split a bet amount between regular balance and bonus balance.
 * Regular balance is used FIRST, bonus only when regular is exhausted.
 *
 * @param {number} regularBalance - user.balance
 * @param {number} blockedBalance - user.blockedBalance
 * @param {number} bonusBalance - user.bonusBalance
 * @param {number} betAmount - amount to deduct
 * @returns {{ fromRegular: number, fromBonus: number }}
 * @throws {Error} if total balance insufficient
 */
export function calculateBetSplit(regularBalance, blockedBalance, bonusBalance, betAmount) {
  const availableRegular = regularBalance - blockedBalance;
  const totalAvailable = availableRegular + bonusBalance;

  if (totalAvailable < betAmount) {
    throw new Error(
      `Saldo insuficiente. Disponible: ${totalAvailable.toFixed(2)}, Requerido: ${betAmount.toFixed(2)}`
    );
  }

  let fromRegular, fromBonus;

  if (availableRegular >= betAmount) {
    fromRegular = betAmount;
    fromBonus = 0;
  } else {
    fromRegular = Math.max(0, availableRegular);
    fromBonus = betAmount - fromRegular;
  }

  return { fromRegular, fromBonus };
}
