# EnglishUp · Map NGSL 2.801 từ vào DB

> Bộ dữ liệu + migration + thứ tự dạy, phân tầng cho người học **hỗn hợp nhiều lứa tuổi**.

---

## 1. Có gì trong bộ này

| File | Nội dung |
|---|---|
| `ngsl_master.csv` | **2.801 headword** — rank, band, IPA, nghĩa Việt, từ loại, level, track, word family |
| `00_check_db.py` | **Chạy TRƯỚC.** Đối chiếu DB hiện tại ↔ NGSL, phát hiện term trùng, xuất `ngsl_missing.csv` |
| `01_migration.sql` | Thêm 7 cột + 4 index vào bảng `words` |
| `02_seed_ngsl.sql` | Upsert 2.801 từ. **Không ghi đè** nội dung đã biên tập tay |
| `NGSL_A1_500tu.xlsx` … `NGSL_B2_1001tu.xlsx` | 4 file Excel đúng format importer `admin.html` (đường vòng) |
| `03_refresh_definitions.sql` | **Chỉ dùng nếu đã seed bản cũ.** Ghi đè nghĩa + từ loại bằng bản clean-room |
| `04_morphemes.sql` | Lớp morphology — 107 hình vị + 707 liên kết đã duyệt tay + view `morpheme_tree` |
| `morphemes.tsv` · `morph_links.tsv` | Dữ liệu nguồn của lớp morphology |
| `srs.html` | Engine ôn tập — recall chủ động, lịch giãn cách cố định. Thả vào thư mục project là chạy |
| `defs/` | Input + output thô của khâu viết nghĩa (8 nhóm) |
| `ngsl_master_fvdp_backup.csv` | Bản cũ dùng nghĩa FVDP — giữ để đối chiếu, **không dùng cho sản phẩm** |
| `build_ngsl.py` · `arpa2ipa.py` · `gen_outputs.py` | Script tái tạo — sửa quy tắc rồi chạy lại là ra bộ mới |

---

## 2. Con số cốt lõi

```
2.801 headword  →  8.481 dạng từ thực tế   (hệ số 3,03×)
```

**Đòn bẩy morphology hiện ra bằng số:** học viên học 2.801 mục, nhưng nhận diện được 8.481 dạng khi đọc — vì cột `word_family` đã gắn sẵn (`be` → am/is/are/was/were/being/been…, 18 dạng).

NGSL 2.801 từ phủ **90,34%** văn bản tiếng Anh thông thường (corpus 273 triệu từ, Browne 2013).

---

## 3. Mapping vào schema `words`

Schema hiện tại **giữ nguyên**, chỉ thêm cột:

| Cột mới | Kiểu | Ý nghĩa |
|---|---|---|
| `ngsl_rank` | `INTEGER` | Hạng tần suất 1–2801. `NULL` = từ ngoài NGSL |
| `ngsl_band` | `SMALLINT` | 1000 / 2000 / 3000 |
| `track` | `TEXT` | `Kids` / `Teen` / `Adult` / `Grammar` |
| `is_function_word` | `BOOLEAN` | `TRUE` → **không đưa vào flashcard** |
| `word_family` | `JSONB` | `["runs","ran","running"]` |
| `family_size` | `SMALLINT` | Số dạng, kể cả headword |
| `needs_review` | `BOOLEAN` | Từ có 2 nhánh nghĩa lớn (285 từ) — nên có người soi |

Cột có sẵn được ánh xạ: `term` ← headword · `phonetic` ← IPA (CMUdict) · `definition_vi` ← nghĩa · `part_of_speech` ← từ loại · `level` ← suy từ rank · `topic` ← `NGSL-<band>-<track>`.

Thêm **unique index trên `lower(term)`** — bắt buộc để upsert an toàn và chặn trùng về sau.

---

## 4. Phân tầng cho hỗn hợp lứa tuổi

Hai trục độc lập, đừng trộn:

**Trục 1 — `level` (độ khó, suy từ tần suất):**

| Level | Rank | Số từ |
|---|---|---|
| A1 | 1–500 | 500 |
| A2 | 501–1000 | 500 |
| B1 | 1001–1800 | 800 |
| B2 | 1801–2801 | 1.001 |

**Trục 2 — `track` (ai học cái gì):**

| Track | Số từ | Dành cho |
|---|---|---|
| `Grammar` | 124 | **Mọi lứa tuổi** — từ chức năng (the, of, to, would…). Dạy trong bài ngữ pháp, **không flashcard** |
| `Kids` | 891 | Tiểu học + Teen + Adult (A1–A2) |
| `Teen` | 788 | Cấp 2–3 + Adult (B1) |
| `Adult` | 998 | Người lớn / luyện thi (B2) |

Lộ trình theo lứa tuổi = lọc `track`:

```sql
-- Tiểu học
WHERE track = 'Kids'                      -- 891 từ
-- Cấp 2–3
WHERE track IN ('Kids','Teen')            -- 1.679 từ
-- Người lớn / luyện thi
WHERE track IN ('Kids','Teen','Adult')    -- 2.677 từ
-- Ngữ pháp (mọi tuyến, vào bài học chứ không vào flashcard)
WHERE track = 'Grammar'                   -- 124 từ
```

**Vì sao tách `Grammar` ra:** NGSL xếp theo tần suất corpus, nên top đầu toàn `the`, `of`, `to`, `would`. Đây là **lớp đóng** (closed class) — người học nạp qua cấu trúc câu, không qua thẻ từ vựng. Nhồi `the` vào flashcard là đốt lượt ôn tập vô ích. Đây là cái bẫy lớn nhất khi dùng list tần suất thô.

---

## 5. Thứ tự chạy

```
0.  py 00_check_db.py            ← xem DB đang có gì, có trùng term không
      ↓ nếu báo trùng → gộp/xoá thủ công rồi chạy lại
1.  Supabase SQL Editor → dán 01_migration.sql → Run
2.  Supabase SQL Editor → dán 02_seed_ngsl.sql → Run   (8 batch, vài giây)
2b. CHỈ nếu bạn đã seed bằng bản trước đó (nghĩa FVDP):
      dán 03_refresh_definitions.sql → Run   ← ghi đè nghĩa cũ bằng bản clean-room
2c. Supabase SQL Editor → dán 04_morphemes.sql → Run   (lớp morphology)
3.  Kiểm tra:
      SELECT count(*) FROM words WHERE ngsl_rank IS NOT NULL;  -- kỳ vọng 2801
      SELECT level, track, count(*) FROM words
        WHERE ngsl_rank IS NOT NULL GROUP BY 1,2 ORDER BY 1,2;
```

**Đường vòng (không dùng SQL):** import lần lượt 4 file `NGSL_*.xlsx` qua `admin.html` → Import CSV → tab "File đầy đủ (Excel)". Chậm hơn và **không có bảo vệ chống ghi đè** — nên ưu tiên đường SQL.

### An toàn khi seed

`02_seed_ngsl.sql` dùng `ON CONFLICT (lower(term)) DO UPDATE` với:

```sql
definition_vi = COALESCE(NULLIF(words.definition_vi, ''), EXCLUDED.definition_vi)
```

→ Từ **đã có trong DB** chỉ được **gắn thêm** metadata NGSL. Phiên âm, nghĩa, level bạn đã biên tập **giữ nguyên**.

**Đã test trên PostgreSQL thật** (không phải chỉ đọc code):

| Tình huống test | Kết quả |
|---|---|
| `run` có nghĩa biên tập tay | Giữ nguyên nghĩa cũ, nhận thêm `ngsl_rank = 192` ✅ |
| `The` viết hoa trong DB | Khớp case-insensitive với `the`, giữ nghĩa cũ, nhận `rank = 1` ✅ |
| `zebra` (ngoài NGSL) | Không bị đụng tới, `ngsl_rank IS NULL` ✅ |
| Insert lại `RUN` | Bị chặn bởi unique index — `INSERT 0 0` ✅ |
| Tổng sau seed | 2.802 dòng · 2.801 có rank · 8.481 dạng từ ✅ |

---

## 6. Chất lượng dữ liệu — đọc kỹ phần này

| Trường | Nguồn | Độ tin cậy |
|---|---|---|
| `term`, `ngsl_rank`, `ngsl_band`, `word_family` | NGSL 1.2 | ✅ Cao — dữ liệu gốc |
| `phonetic` | **CMUdict** (Carnegie Mellon) → IPA | ✅ Cao — 2801/2801, không thiếu mục nào |
| `definition_vi` | **Viết mới clean-room** — không dùng từ điển nào | ⚠️ Trung bình — máy viết, chưa có người duyệt |
| `part_of_speech` | **Viết mới clean-room** | ✅ Khá — đã sửa 757 lỗi của bản heuristic |
| `level`, `track` | Suy từ rank theo quy tắc mục 4 | ⚠️ Quy ước, chỉnh được |

### Đã phát hiện và sửa ở khâu dựng dữ liệu

- **Phiên âm FVDP hỏng nặng → bỏ hẳn, thay bằng CMUdict.** FVDP mất ký tự IPA ở rất nhiều mục (`with` → `/wi/`, `which` → `/wit/`, `up` → `/p/`, `what` → `/w t/`) và có 123 mục "phiên âm" chỉ là chép lại chính từ đó (`producer` → `/producer/`). Đã viết bộ chuyển ARPAbet → IPA từ CMUdict, có xử lý dấu trọng âm theo maximal onset principle (`meanwhile` → `/ˈmiːnˌwaɪl/` chứ không phải `/ˈmiːˌnwaɪl/`). Kết quả: **2801/2801 từ có phiên âm chuẩn**, `ruler` → `/ˈruːlər/`.
- Nguồn NGSL.json xếp nhầm `the` xuống cuối band 1000 → đã đưa về rank 1.
- FVDP luôn liệt kê "danh từ" trước → `a`, `in`, `to` bị gán nhầm thành Noun. Đã khai báo tay toàn bộ lớp đóng đè lên.
- FVDP dùng chính tả Anh-Anh → đã map `behavior→behaviour`, `dialog→dialogue`, `percent→per cent`…
- FVDP có mục tham chiếu (`- xem aware`) → đã giải chiếu.
- FVDP lẫn thành ngữ tiếng Anh vào dòng nghĩa (`say` → "that is to say tức là…") → đã lọc, 4 mục còn lại vá tay.

### Viết lại toàn bộ nghĩa Việt + từ loại (clean-room)

Bản đầu lấy nghĩa từ FVDP — vừa dính GPL, vừa chọn sai nghĩa chính ở nhiều từ. Đã **viết lại toàn bộ 2.801 nghĩa** theo quy trình clean-room: chỉ dựa vào kiến thức về từ đó, **không tra cứu hay copy bất kỳ từ điển nào**. Chia 8 nhóm chạy song song, mỗi nhóm ~350 từ.

Kết quả:

| Chỉ số | Số liệu |
|---|---|
| Nghĩa viết lại | **2.791 / 2.801** (10 từ trùng khớp ngẫu nhiên với bản cũ) |
| **Từ loại sửa sai** | **757 / 2.801 — 27%** |
| Từ đổi track do sửa từ loại | 15 |
| Còn `needs_review` | **285** (giảm từ 1.421) |

**757 từ sai từ loại là lỗi của tôi, không phải của FVDP.** Bộ suy luận hình vị tôi viết ở bước trước gán nhầm hàng loạt: danh từ thành `Verb` (`time`, `people`, `place`, `market`), tính từ thành `Noun` (`great`, `clear`, `social`, `free`). Phân bố sau khi sửa hợp lý hơn hẳn:

```
Trước (heuristic):  Verb 1253 · Noun  958 · Adjective 291 · Adverb 158
Sau  (đã duyệt):    Noun 1394 · Verb  654 · Adjective 441 · Adverb 183
```

Đây là lý do cột `part_of_speech` được nâng từ ⚠️ lên ✅ trong bảng trên.

**`needs_review = TRUE` giờ chỉ còn 285 từ** — là các từ được viết nghĩa tách 2 nhánh lớn bằng dấu `;` (`spring` → "mùa xuân; lò xo, suối nước", `drug` → "thuốc; ma túy", `depression` → "chứng trầm cảm; suy thoái kinh tế"). Đây là nhóm đáng để người soi lại xem có nên tách thành 2 thẻ riêng không.

```sql
SELECT ngsl_rank, term, part_of_speech, definition_vi
FROM words WHERE needs_review ORDER BY ngsl_rank;
```

**Giới hạn cần biết:** nghĩa do máy viết, **chưa có người bản ngữ duyệt**. Đã kiểm tra tự động toàn bộ 2.801 dòng (đủ số lượng, khớp term với master, từ loại hợp lệ, độ dài 10–90 ký tự, không lẫn tiếng Anh, không lặp lại chính từ đó trong nghĩa) — nhưng kiểm tra tự động không thay được mắt người. Nếu duyệt tay, ưu tiên top 500.

Sheet "Câu mẫu" trong 4 file Excel **để trống có chủ ý** — dùng tính năng sinh 5 câu mẫu AI sẵn có trong `admin.html`, chạy theo batch từ rank 1 đi lên.

---

## 7. Bản quyền — đã gỡ xong

| Nguồn | License | Trạng thái |
|---|---|---|
| NGSL 1.2 (`term`, `ngsl_rank`, `ngsl_band`) | Tự do cho giáo dục, **yêu cầu trích nguồn** | ✅ Ghi credit trong app |
| Word family JSON | CC0-1.0 | ✅ Tự do |
| CMUdict (`phonetic`) | BSD-2 (Carnegie Mellon) | ✅ Tự do, kể cả thương mại |
| `definition_vi`, `part_of_speech` | **Tự viết** | ✅ Không dính license bên thứ ba |
| ~~FVDP~~ | ~~GPL~~ | ✅ **Đã loại khỏi sản phẩm hoàn toàn** |

Hai bước gỡ: chuyển phiên âm sang CMUdict, rồi viết lại nghĩa clean-room. **Bộ dữ liệu hiện tại không còn nội dung nào lấy từ nguồn GPL** → dùng thương mại được.

File `ngsl_master_fvdp_backup.csv` vẫn chứa nghĩa FVDP — giữ để đối chiếu nội bộ, **đừng đưa vào sản phẩm hay repo công khai**.

Credit nên đặt trong app:
> Từ vựng dựa trên New General Service List (Browne, Culligan & Phillips, 2013).
> Phiên âm từ CMU Pronouncing Dictionary © 1993-2015 Carnegie Mellon University.

---

## 8. Engine ôn tập — `srs.html`

Đã build, chạy độc lập. Copy vào thư mục project (cạnh `vocab.html`) rồi mở `http://localhost:8080/srs.html`.

**Ba quyết định thiết kế, đều bám vào bằng chứng:**

1. **Recall, không phải recognition.** Không có kiểu chọn 1 trong 4 đáp án. Chế độ Anh→Việt bắt nhớ lại trong đầu rồi mới mở đáp án; chế độ Việt→Anh bắt **gõ đúng từ** — gõ sai là reset, không cho tự chấm điểm. Đây là chỗ đa số app từ vựng làm sai: nhận diện được đáp án trong 4 lựa chọn ≠ nhớ được từ.

2. **Lịch giãn cách CỐ ĐỊNH: 1 · 3 · 7 · 14 · 30 · 60 · 120 ngày.** Không dùng SM-2/FSRS. Kim & Webb (2022, meta-analysis 48 thí nghiệm): equal spacing ≈ expanding spacing, **không khác biệt thống kê**. Thuật toán phức tạp không mua thêm được gì, chỉ thêm chỗ để hỏng. Đã test 15 ca (nới bậc, reset khi quên, "Khó" giữ nguyên bậc, "Dễ" nhảy 2 bậc, chặn trần) — pass hết.

3. **Từ chức năng bị loại khỏi hàng đợi** (`is_function_word=eq.false`) — đúng thiết kế ở mục 4.

Mặt đáp án hiện **word family** — thấy `run` là thấy luôn runs/ran/running. Đòn bẩy morphology đưa thẳng vào lúc ôn.

**Giới hạn hiện tại:** trạng thái thẻ lưu trong `localStorage`, tức là **theo từng máy, không đồng bộ**. Bảng `srs_cards` trong DB đã sẵn sàng nhưng chưa nối vì cần luồng đăng nhập. Muốn đồng bộ nhiều thiết bị thì đổi 2 hàm `load`/`saveCards` trong `srs.html` sang gọi `srs_cards` — chỗ nối đã tách riêng sẵn.

---

## 9. Lớp Morphology — `04_morphemes.sql`

Đây là tầng đòn bẩy đã nói từ đầu: **học 1 hình vị → mở khoá cả cụm từ**.

**Hai bảng mới:**

```sql
morphemes       -- 107 hình vị: 24 prefix + 23 suffix + 60 gốc Latin/Greek
word_morphemes  -- 707 liên kết từ ↔ hình vị (FK, cascade)
morpheme_tree   -- view: hình vị → danh sách từ nó mở khoá
```

Bộ prefix bám theo White, Sowell & Yanagihara: 4 tiền tố đầu (`un- re- in- dis-`) phủ 58%, 20 tiền tố đầu phủ 97% mọi từ có tiền tố.

**Kết quả:**

| Chỉ số | Số liệu |
|---|---|
| Hình vị | 107 |
| Liên kết ứng viên máy sinh | 1.376 |
| **Bị loại khi duyệt tay** | **669 — 49%** |
| Liên kết còn lại | **707** |
| Từ NGSL được gắn ≥1 hình vị | 617 / 2.801 |

**49% ứng viên máy sinh là rác** — đây là lý do khâu duyệt không thể bỏ. Tách hình vị bằng luật sinh ra `really` = re+ally, `even` = ven, `woman` = man, `until` = un+til, `start` = sta. Nhóm hậu tố `-y` sai tới 97% (máy cắt chữ `y` cuối một cách cơ học: `they` → the+y, `already` → alread+y).

**Tiêu chí duyệt** không phải từ nguyên học mà là giá trị dạy học: *"người học biết nghĩa hình vị này thì có suy ra được nghĩa từ này không?"*. Nên `remain` + `re-` bị loại dù từ nguyên đúng (Latin re+manere) — vì "main" tiếng Anh nghĩa khác hẳn, dạy vào là dẫn người học đi sai.

**Ví dụ cây từ:**

```sql
SELECT * FROM morpheme_tree WHERE morpheme = 'port';
-- mang, chở | 10 từ | report, important, support, importance, transport,
--                     export, import, reporter, supporter, transportation
```

**8 hình vị đáng dạy trước nhất** (mở khoá nhiều từ nhất trong NGSL):

| Hình vị | Nghĩa | Số từ mở khoá |
|---|---|---|
| `-ly` | một cách… | 98 |
| `-al` | thuộc về | 50 |
| `-tion` | sự, việc, quá trình | 49 |
| **`-er`** | **người/vật làm việc gì** | **43** |
| `-ment` | sự, kết quả của việc | 33 |
| `re-` | lại, trở lại | 24 |
| `co-` | cùng, đồng | 23 |
| `sta` | đứng | 21 |

`-er` chính là cụm trong video ban đầu — nhưng ở đây nó mở khoá **43 từ có nghĩa suy ra được**, chứ không chỉ đọc trơn.

**Hình vị biến hình (`-s -ed -ing -est`) cố ý không có liên kết** — chúng đã nằm trong cột `word_family`, gắn thêm vào headword là thừa.

**25 hình vị chưa có liên kết nào** (`anti- auto- micro- semi- scope therm chron psych`…). Không phải lỗi: NGSL là từ vựng đời thường, các hình vị này sống ở tầng học thuật. Chúng sẽ sáng lên khi bạn thêm AWL/NAWL. Giữ nguyên trong bảng.

**Truy vấn phân tích từ:**

```sql
SELECT w.term, string_agg(m.morpheme || '=' || m.meaning_vi, ' + ') AS phan_tich
FROM words w
JOIN word_morphemes wm ON wm.word_id = w.id
JOIN morphemes m       ON m.id = wm.morpheme_id
GROUP BY w.id, w.term;
-- manufacturer -> man=tay + fac=làm, tạo + -er=người làm việc gì
-- reporter     -> re-=lại + port=mang + -er=người làm việc gì
```

**Giới hạn:** 617/2.801 từ có liên kết (22%). Phần còn lại là từ gốc đơn hình vị (`water`, `book`, `run`) — đúng bản chất, không phải thiếu sót. Liên kết do AI duyệt, chưa qua người bản ngữ; nhóm `co-` và `sta` là chỗ dễ tranh cãi nhất, đáng soi lại nếu có thời gian.

---

## Nguồn

- Browne, C. (2013). *A New General Service List: The Better Mousetrap We've Been Looking For?* — [vli-journal.org](http://vli-journal.org/issues/03.2/vli.v03.2.browne.pdf)
- [New General Service List Project](https://www.newgeneralservicelist.com/) — NGSL 1.2, 2.801 từ, 90,34% coverage
- Bauer, L. & Nation, P. (1993). *Word Families* — [lextutor.ca](https://www.lextutor.ca/morpho/fam_affix/bauer_nation_1993.pdf)
- [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) — phiên âm, BSD-2
- [lpmi-13/machine_readable_wordlists](https://github.com/lpmi-13/machine_readable_wordlists) — NGSL dạng JSON, CC0
- Kim, S. & Webb, S. (2022). *The Effects of Spaced Practice on Second Language Learning: A Meta-Analysis*, Language Learning — [Wiley](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479)
- ~~Free Vietnamese Dictionary Project (GPL)~~ — đã loại khỏi sản phẩm
