#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EnglishUp · Đối chiếu DB hiện tại với NGSL — CHẠY TRƯỚC KHI SEED.

Trả lời: DB đang có bao nhiêu từ? Bao nhiêu nằm trong NGSL? Bao nhiêu
từ đang có là "từ hiếm" (ngoài NGSL)? Có term trùng không?

Chạy:  py 00_check_db.py          (cần: pip install requests)
"""
import csv, sys, collections

try:
    import requests
except ImportError:
    sys.exit('Thiếu thư viện: chạy  pip install requests')

URL = 'https://fyglubimflzsetcovgqx.supabase.co/rest/v1/words'
KEY = 'sb_publishable_3h3EQvxWr0kba8Tyq5RNbQ_driFn_G_'
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

# ── 1. Kéo toàn bộ term trong DB (phân trang 1000/lần) ──
db, offset = [], 0
while True:
    r = requests.get(URL, headers={**H, 'Range': f'{offset}-{offset+999}'},
                     params={'select': 'id,term,level,topic,definition_vi', 'order': 'id'})
    r.raise_for_status()
    page = r.json()
    db += page
    if len(page) < 1000:
        break
    offset += 1000
print(f'DB hiện có: {len(db)} từ')

# ── 2. Đọc NGSL master ──
ngsl = list(csv.DictReader(open('ngsl_master.csv', encoding='utf-8-sig')))
ngsl_set = {r['term'].lower(): r for r in ngsl}

db_terms = [(w.get('term') or '').strip().lower() for w in db]
dup = {t: c for t, c in collections.Counter(db_terms).items() if c > 1 and t}

have = [t for t in db_terms if t in ngsl_set]
extra = [t for t in db_terms if t and t not in ngsl_set]
missing = [t for t in ngsl_set if t not in set(db_terms)]

# ── 3. Báo cáo ──
print(f'''
┌─ ĐỐI CHIẾU NGSL ────────────────────────────────
│ Nằm trong NGSL (giữ nguyên, chỉ gắn metadata) : {len(have)}
│ Ngoài NGSL (từ hiếm — cân nhắc hạ ưu tiên)    : {len(set(extra))}
│ NGSL còn thiếu (sẽ được seed thêm)            : {len(missing)}
│ Term bị TRÙNG trong DB                        : {len(dup)}
└─────────────────────────────────────────────────''')

if dup:
    print('\n⚠ PHẢI XỬ LÝ TRÙNG trước khi chạy 01_migration.sql')
    print('  (unique index trên lower(term) sẽ fail)')
    for t, c in list(dup.items())[:20]:
        print(f'   {t} × {c}')

if extra:
    ex = sorted(set(extra))
    print(f'\nMẫu từ ngoài NGSL ({len(ex)}): {ex[:25]}')

cov = len(set(have)) / 2801 * 100
print(f'\nĐộ phủ NGSL hiện tại: {cov:.1f}%  ({len(set(have))}/2801)')

# ── 4. Xuất danh sách cần bổ sung, theo thứ tự tần suất ──
if missing:
    out = [ngsl_set[t] for t in missing]
    out.sort(key=lambda r: int(r['ngsl_rank']))
    with open('ngsl_missing.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f'→ Đã ghi ngsl_missing.csv ({len(out)} từ, xếp theo tần suất)')
    print(f'  Top 10 nên làm trước: {[r["term"] for r in out[:10]]}')
