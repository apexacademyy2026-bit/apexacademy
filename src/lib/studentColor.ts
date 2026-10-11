// Bảng màu đậm, khác tông rõ rệt (chữ trắng đều đọc được) để dễ phân biệt học sinh.
export const PALETTE = [
  "#2563EB", // xanh dương
  "#7C3AED", // tím
  "#DB2777", // hồng
  "#C2410C", // cam
  "#047857", // xanh lá
  "#0E7490", // xanh ngọc
  "#B45309", // hổ phách
  "#DC2626", // đỏ
  "#4D7C0F", // lục chanh
  "#A21CAF", // cánh sen
];

/** Dùng màu đã lưu của học sinh (hex, tên màu CSS hoặc gradient); nếu chưa có thì chọn ổn định theo id. */
export function resolveStudentColor(color: unknown, seed: string | number): string {
  if (typeof color === "string" && color.trim()) {
    const c = color.trim();
    if (c.includes("gradient") || (typeof CSS !== "undefined" && CSS.supports("color", c))) return c;
  }
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}