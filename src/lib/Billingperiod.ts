/**
 * Kỳ học phí theo ngày thu của từng học sinh.
 *
 * Ngày thu 25: kỳ chạy từ ngày 25 tháng này đến ngày 24 tháng sau
 * (thu vào 25/8 thì tính các buổi từ 25/7 đến 24/8).
 * Tháng ngắn hơn ngày thu (ví dụ ngày thu 31 vào tháng 2) thì lấy ngày cuối tháng.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "2026-10-24" -> "24/10"
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Ngày thu thực tế của một tháng (month 0–11, cho phép tràn sang năm trước/sau)
const billingDateIn = (year: number, month: number, billingDay: number) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(billingDay, lastDay));
};

export type BillingPeriod = { start: string; end: string };

// Kỳ đang chạy (chứa ngày `today`): từ ngày thu gần nhất đến một ngày trước ngày thu kế tiếp
export function getBillingPeriod(billingDay: number, today: Date = new Date()): BillingPeriod {
  const day = Math.min(31, Math.max(1, Math.floor(billingDay)));
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start = billingDateIn(todayOnly.getFullYear(), todayOnly.getMonth(), day);
  if (start > todayOnly) start = billingDateIn(todayOnly.getFullYear(), todayOnly.getMonth() - 1, day);
  const next = billingDateIn(start.getFullYear(), start.getMonth() + 1, day);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
  return { start: toISODate(start), end: toISODate(end) };
}

// Các kỳ đã qua (trước kỳ hiện tại), kỳ gần nhất đứng trước.
// Dừng khi kỳ kết thúc trước `notBefore` (YYYY-MM-DD, thường là ngày học sinh bắt đầu học) hoặc đủ `maxCount` kỳ.
export function getPastBillingPeriods(
  billingDay: number,
  today: Date = new Date(),
  notBefore?: string | null,
  maxCount = 12,
): BillingPeriod[] {
  const periods: BillingPeriod[] = [];
  let current = getBillingPeriod(billingDay, today);
  for (let i = 0; i < maxCount; i++) {
    const dayBefore = new Date(`${current.start}T00:00:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const previous = getBillingPeriod(billingDay, dayBefore);
    if (notBefore && previous.end < notBefore) break;
    periods.push(previous);
    current = previous;
  }
  return periods;
}