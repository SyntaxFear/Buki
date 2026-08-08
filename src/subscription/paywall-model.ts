export function annualSavingsPercent(monthlyPrice: number, yearlyPrice: number): number | null {
  if (monthlyPrice <= 0 || yearlyPrice <= 0) return null;
  const percent = Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
  return percent > 0 ? percent : null;
}
