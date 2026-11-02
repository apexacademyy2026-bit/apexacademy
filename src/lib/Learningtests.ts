// Nhiều bài kiểm tra trong một buổi học.
//
// Vẫn lưu ở 2 cột cũ của bảng attendance (tên bài, điểm) nên không cần đổi cấu trúc bảng.
// Mỗi bài là một dòng; hai cột khớp nhau theo thứ tự dòng.
// Ví dụ: tên "Giữa kỳ\nChương 2" đi với điểm "8\n9". Dữ liệu cũ (chỉ 1 bài) vẫn đọc đúng.
//
// Trang Nhật ký học tập và trang Hóa đơn cùng dùng file này, nên hai trang luôn đọc/ghi giống nhau.
// Đặt file này ở src/lib/learningTests.ts

export const TEST_SEP = "\n";

export type TestItem = { name: string; score: string };

export const EMPTY_TEST: TestItem = { name: "", score: "" };

export const isBlankTest = (t: TestItem) => !t.name.trim() && !t.score.trim();

// Bỏ dòng trống và cắt khoảng trắng thừa
export const cleanTests = (items: TestItem[]): TestItem[] =>
  items.filter((t) => !isBlankTest(t)).map((t) => ({ name: t.name.trim(), score: t.score.trim() }));

// Đọc danh sách bài kiểm tra từ giá trị 2 cột (tên, điểm) của một buổi học
export const parseTests = (nameCol: unknown, scoreCol: unknown): TestItem[] => {
  const names = String(nameCol ?? "").split(TEST_SEP);
  const scores = String(scoreCol ?? "").split(TEST_SEP);
  const n = Math.max(names.length, scores.length);
  return cleanTests(Array.from({ length: n }, (_, i) => ({ name: names[i] ?? "", score: scores[i] ?? "" })));
};

// Gộp các giá trị thành 1 chuỗi, bỏ phần rỗng ở cuối cho gọn
const joinCol = (vals: string[]) => {
  const v = [...vals];
  while (v.length && v[v.length - 1] === "") v.pop();
  return v.join(TEST_SEP);
};

// Chuyển danh sách thành giá trị 2 cột để lưu. Chuỗi rỗng nghĩa là nên lưu null.
export const serializeTests = (items: TestItem[]) => {
  const filled = cleanTests(items);
  return {
    filled,
    name: joinCol(filled.map((t) => t.name)),
    score: joinCol(filled.map((t) => t.score)),
  };
};

// Luôn có ít nhất 1 dòng để nhập
export const withSpare = (items: TestItem[]): TestItem[] => (items.length ? items : [EMPTY_TEST]);