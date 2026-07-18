-- ═══════════════════════════════════════════════════════════
-- EnglishUp · 05 · Gia đình: hồ sơ, sổ từ, video shadowing
-- CHẠY SAU 01_migration.sql + 02_seed_ngsl.sql
-- ═══════════════════════════════════════════════════════════

-- ─── Hồ sơ: KHÔNG mật khẩu, chỉ để tách dữ liệu từng người ───
CREATE TABLE IF NOT EXISTS profiles (
  id       SMALLSERIAL PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  emoji    TEXT NOT NULL,
  is_child BOOLEAN NOT NULL DEFAULT FALSE,
  ord      SMALLINT
);
COMMENT ON TABLE profiles IS
  'Chọn kiểu Netflix, không auth. Chỉ để sổ từ của bố không lẫn sổ của bé.';

INSERT INTO profiles (name, emoji, is_child, ord) VALUES
  ('Bố','👨',FALSE,1), ('Mẹ','👩',FALSE,2), ('Anh','👦',TRUE,3), ('Em','👧',TRUE,4)
ON CONFLICT (name) DO NOTHING;

-- ─── Sổ từ: từ do CHÍNH người học bấm tra ───
-- Đây mới là chương trình học thật. NGSL chỉ là cuốn từ điển được tra.
CREATE TABLE IF NOT EXISTS saved_words (
  id          BIGSERIAL PRIMARY KEY,
  profile_id  SMALLINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  term        TEXT NOT NULL,
  phonetic    TEXT,
  definition_vi TEXT,
  topic       TEXT,
  source      TEXT,                      -- gặp ở đâu: 'nghe:<video>' | 'noi' | 'game'
  context     TEXT,                      -- câu chứa từ lúc bấm tra
  word_id     BIGINT REFERENCES words(id) ON DELETE SET NULL,
  -- SRS: bậc thang cố định 1·3·7·14·30·60·120 (Kim & Webb 2022: equal ≈ expanding)
  step        SMALLINT NOT NULL DEFAULT -1,
  due         DATE     NOT NULL DEFAULT CURRENT_DATE,
  reps        SMALLINT NOT NULL DEFAULT 0,
  lapses      SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, term)
);
CREATE INDEX IF NOT EXISTS sw_due_idx   ON saved_words (profile_id, due);
CREATE INDEX IF NOT EXISTS sw_topic_idx ON saved_words (profile_id, topic);

-- ─── Video shadowing ───
CREATE TABLE IF NOT EXISTS videos (
  id         BIGSERIAL PRIMARY KEY,
  youtube_id TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  level      TEXT,
  for_child  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mốc thời gian PHẢI nhập tay — YouTube API không trả transcript.
-- Dùng công cụ bấm mốc trong nghe.html.
CREATE TABLE IF NOT EXISTS video_lines (
  id        BIGSERIAL PRIMARY KEY,
  video_id  BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  ord       SMALLINT NOT NULL,
  text      TEXT NOT NULL,
  text_vi   TEXT,
  start_sec NUMERIC(8,2) NOT NULL,
  end_sec   NUMERIC(8,2) NOT NULL,
  UNIQUE (video_id, ord),
  CHECK (end_sec > start_sec)
);
CREATE INDEX IF NOT EXISTS vl_video_idx ON video_lines (video_id, ord);
COMMENT ON TABLE video_lines IS
  'Câu + mốc thời gian. YouTube IFrame API chỉ cho fontSize/reload cho phụ đề — không lấy transcript được, phải tự bấm mốc.';

ALTER TABLE profiles    DISABLE ROW LEVEL SECURITY;
ALTER TABLE saved_words DISABLE ROW LEVEL SECURITY;
ALTER TABLE videos      DISABLE ROW LEVEL SECURITY;
ALTER TABLE video_lines DISABLE ROW LEVEL SECURITY;

-- ─── View: sổ từ đến hạn ôn ───
CREATE OR REPLACE VIEW words_due AS
SELECT s.*, p.name AS profile_name
FROM saved_words s JOIN profiles p ON p.id = s.profile_id
WHERE s.due <= CURRENT_DATE;

-- Kiểm tra:
-- SELECT * FROM profiles ORDER BY ord;
-- SELECT profile_name, count(*) FROM words_due GROUP BY 1;
