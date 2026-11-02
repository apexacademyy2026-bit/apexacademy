/* Dùng chung cho trang Nhật ký học tập và hoá đơn thanh toán */

// Tên cột trong bảng attendance cho từng mục của nhật ký (xem file SQL kèm theo)
export const LOG = {
  content: "lesson_content", // nội dung buổi học
  homework: "homework_note", // bài tập về nhà (BTVN), dạng văn bản
  testName: "test_name", // tên bài kiểm tra
  testScore: "test_score", // điểm kiểm tra
  note: "note", // ghi chú
} as const;

export type LogCol = (typeof LOG)[keyof typeof LOG];

// Giá trị gốc của một ô (chuỗi rỗng nếu chưa có hoặc bảng chưa có cột đó)
export const rawVal = (a: any, col: string): string => (a?.[col] == null ? "" : String(a[col]));
export const logVal = (a: any, col: string): string => rawVal(a, col).trim();

// Buổi này có bài kiểm tra (có tên hoặc có điểm)
export const hasTest = (a: any): boolean => !!(logVal(a, LOG.testName) || logVal(a, LOG.testScore));

export const parseYmd = (s?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

// "Thứ 4", "Chủ nhật"
export const weekdayLabel = (s?: string | null) => {
  const p = parseYmd(s);
  if (!p) return "";
  const wd = new Date(p.y, p.m - 1, p.d).getDay();
  return wd === 0 ? "Chủ nhật" : `Thứ ${wd + 1}`;
};

// "Thứ 4", "CN" (bản ngắn cho ô ngày nhỏ)
export const weekdayShort = (s?: string | null) => {
  const p = parseYmd(s);
  if (!p) return "";
  const wd = new Date(p.y, p.m - 1, p.d).getDay();
  return wd === 0 ? "CN" : `Thứ ${wd + 1}`;
};

// "02/09"
export const dayMonth = (s?: string | null) => {
  const p = parseYmd(s);
  return p ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}` : "";
};

// "07:30 - 09:30". Buổi thêm tay (00:00 - 01:00) không có giờ thật nên bỏ trống.
export const timeRange = (ev: any) => {
  const s = String(ev?.start_time || "").slice(0, 5);
  const e = String(ev?.end_time || "").slice(0, 5);
  if (!s || !e || (s === "00:00" && e === "01:00")) return "";
  return `${s} - ${e}`;
};

// "THÁNG 9/2026" (hoặc "THÁNG 9–10/2026" nếu hoá đơn gồm nhiều tháng)
export const monthLabel = (dates: string[]) => {
  const ps = dates.map(parseYmd).filter(Boolean) as { y: number; m: number; d: number }[];
  if (!ps.length) return "";
  const sorted = [...ps].sort((a, b) => a.y - b.y || a.m - b.m);
  const f = sorted[0];
  const l = sorted[sorted.length - 1];
  if (f.y === l.y && f.m === l.m) return `THÁNG ${f.m}/${f.y}`;
  if (f.y === l.y) return `THÁNG ${f.m}–${l.m}/${f.y}`;
  return `THÁNG ${f.m}/${f.y} – ${l.m}/${l.y}`;
};

// "2026-09" -> "Tháng 9/2026"
export const monthKeyLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `Tháng ${Number(m)}/${y}`;
};

// Sắp xếp các buổi theo ngày rồi đến giờ bắt đầu (cho các bản ghi điểm danh kèm schedule_events)
export const sessionSort = (a: any, b: any) => {
  const ka = `${a?.schedule_events?.event_date || ""} ${String(a?.schedule_events?.start_time || "").slice(0, 5)}`;
  const kb = `${b?.schedule_events?.event_date || ""} ${String(b?.schedule_events?.start_time || "").slice(0, 5)}`;
  return ka.localeCompare(kb);
};