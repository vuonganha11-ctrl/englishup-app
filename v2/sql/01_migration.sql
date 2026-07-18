-- ═══════════════════════════════════════════════════════════
-- EnglishUp · Migration 01 · Map NGSL vào bảng words
-- Chạy trong: Supabase → SQL Editor (project fyglubimflzsetcovgqx)
-- ═══════════════════════════════════════════════════════════

-- B1. KIỂM TRA trùng term trước (unique index sẽ fail nếu có trùng)
--     Chạy riêng câu này TRƯỚC. Nếu ra dòng nào -> phải gộp/xoá thủ công.
-- SELECT lower(term) AS t, count(*), array_agg(id) FROM words
-- GROUP BY 1 HAVING count(*) > 1;

-- B2. Thêm cột
ALTER TABLE words
  ADD COLUMN IF NOT EXISTS ngsl_rank        INTEGER,
  ADD COLUMN IF NOT EXISTS ngsl_band        SMALLINT,
  ADD COLUMN IF NOT EXISTS track            TEXT,
  ADD COLUMN IF NOT EXISTS is_function_word BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS word_family      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS family_size      SMALLINT,
  ADD COLUMN IF NOT EXISTS needs_review     BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN words.ngsl_rank        IS 'Hạng tần suất NGSL 1..2801 (1 = phổ biến nhất). NULL = ngoài NGSL.';
COMMENT ON COLUMN words.ngsl_band        IS 'Dải NGSL: 1000 / 2000 / 3000';
COMMENT ON COLUMN words.track            IS 'Kids | Teen | Adult | Grammar — tuyến học theo lứa tuổi';
COMMENT ON COLUMN words.is_function_word IS 'TRUE = từ chức năng (giới từ, mạo từ...) — dạy trong ngữ pháp, KHÔNG đưa vào flashcard';
COMMENT ON COLUMN words.word_family      IS 'Các dạng cùng họ (Bauer & Nation): ["runs","ran","running"]';
COMMENT ON COLUMN words.needs_review     IS 'TRUE = phiên âm/nghĩa máy sinh, cần người duyệt';

-- B3. Index
CREATE UNIQUE INDEX IF NOT EXISTS words_term_lower_uniq ON words (lower(term));
CREATE INDEX IF NOT EXISTS words_ngsl_rank_idx   ON words (ngsl_rank) WHERE ngsl_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS words_level_track_idx ON words (level, track);
CREATE INDEX IF NOT EXISTS words_review_idx      ON words (needs_review) WHERE needs_review;

-- B4. RLS (schema hiện tại đang tắt cho bảng words)
ALTER TABLE words DISABLE ROW LEVEL SECURITY;
