export const formatVND = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n || 0);

export const palette = [
  "#bfdbfe", "#bae6fd", "#a7f3d0", "#fde68a", "#fbcfe8",
  "#ddd6fe", "#fecaca", "#c7d2fe", "#bbf7d0", "#fed7aa",
];

export const randomColor = () => palette[Math.floor(Math.random() * palette.length)];

/** Build dynamic VietQR image URL with amount + content */
export const vietQRUrl = (
  bank: string | null | undefined,
  account: string | null | undefined,
  holder: string | null | undefined,
  amount: number,
  content: string
) => {
  if (!bank || !account) return null;
  const safeContent = content.replace(/\s+/g, "");
  return `https://img.vietqr.io/image/${encodeURIComponent(bank)}-${encodeURIComponent(
    account
  )}-compact2.png?amount=${Math.round(amount)}&addInfo=${encodeURIComponent(
    safeContent
  )}&accountName=${encodeURIComponent(holder || "")}`;
};

/** Compute monthly billing cycles from a start date up to today (inclusive of current cycle) */
export function computeMonthlyCycles(startISO: string, until = new Date()) {
  const start = new Date(startISO);
  const cycles: { start: Date; end: Date; label: string }[] = [];
  let cur = new Date(start);
  while (cur <= until) {
    const next = new Date(cur);
    next.setMonth(next.getMonth() + 1);
    const label = `Thang${cur.getMonth() + 1}_${cur.getFullYear()}`;
    cycles.push({ start: new Date(cur), end: new Date(next), label });
    cur = next;
  }
  return cycles;
}

export const fmtDate = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("vi-VN");
};

export function getMonthKey(value: Date | string) {
  const dt = typeof value === "string" ? new Date(value) : value;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthlyCycleLabel(studentName: string | null | undefined, value: Date | string) {
  const dt = typeof value === "string" ? new Date(value) : value;
  const safeName = (studentName || "student").replace(/\s+/g, "");
  return `${safeName}_Thang${dt.getMonth() + 1}_${dt.getFullYear()}`;
}

export function isAttendanceCoveredByPayment(attendanceDate: Date | string, payment: any, studentName?: string | null) {
  if (!payment) return false;
  const d = typeof attendanceDate === "string" ? attendanceDate : attendanceDate.toISOString().slice(0, 10);
  if (payment.cycle_type === "session") {
    return Boolean(payment.period_start && payment.period_end && d >= payment.period_start && d <= payment.period_end);
  }
  if (payment.cycle_type === "monthly") {
    const monthKey = getMonthKey(d);
    const expected = buildMonthlyCycleLabel(studentName, d);
    const short = `Thang${new Date(d).getMonth() + 1}_${new Date(d).getFullYear()}`;
    const labelOk = payment.cycle_label === expected || payment.cycle_label === monthKey || payment.cycle_label === short;
    const dateOk = Boolean(payment.period_start && payment.period_end && d >= payment.period_start && d <= payment.period_end);
    return labelOk || dateOk;
  }
  return false;
}