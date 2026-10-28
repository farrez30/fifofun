/** Rupiah tanpa desimal untuk tampilan, dari nilai sen (bilangan bulat). */
export function rupiah(sen: number): string {
  if (!Number.isSafeInteger(sen)) throw new Error("nilai sen harus bilangan bulat");
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(sen / 100);
}
