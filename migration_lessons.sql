-- ============================================================
-- EnglishUp · Migration: Lịch học & Buổi học (lessons)
-- Chạy trong: Supabase Dashboard > SQL Editor > New query > Run
-- An toàn để chạy lại nhiều lần (idempotent).
--
-- Phụ thuộc: chạy SAU migration_accounts.sql
--   (đã có cột role trên user_profiles + hàm is_admin(), is_teacher()).
--
-- Quy trình nghiệp vụ:
--   GV tạo buổi học (draft) → upload ghi âm mẫu → gửi duyệt (pending)
--   → Admin nghe + duyệt (approved) hoặc từ chối (rejected)
--   → sau buổi: GV chấm điểm + nhận xét, HV upload ghi âm kết quả
--   → GV đánh dấu hoàn thành (completed). Tất cả lưu vết.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 0) AN TOÀN: nếu chạy độc lập, đảm bảo các hàm phân quyền tồn tại
--    (no-op nếu migration_accounts.sql đã tạo).
-- ════════════════════════════════════════════════════════════
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_teacher()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.user_profiles
                 where id = auth.uid() and role in ('teacher','admin'));
$$;

-- ════════════════════════════════════════════════════════════
-- 1) BẢNG lessons — mỗi dòng = 1 buổi học do GV lên lịch
-- ════════════════════════════════════════════════════════════
create table if not exists public.lessons (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  content          text,                         -- nội dung buổi học
  topic_id         uuid references public.topics(id) on delete set null,
  word_ids         uuid[] default '{}',          -- từ vựng GV chọn
  scheduled_date   date not null,
  start_time       time not null default '19:00',
  duration_minutes integer not null default 120, -- mặc định 120 phút
  teacher_id       uuid not null references auth.users(id) on delete cascade,
  teacher_name     text,
  -- draft | pending | approved | rejected | completed
  status           text not null default 'draft',
  sample_audio_url text,                          -- ghi âm mẫu của GV
  admin_note       text,                          -- ghi chú khi Admin duyệt/từ chối
  approved_by      uuid references auth.users(id),
  approved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_lessons_date    on public.lessons(scheduled_date);
create index if not exists idx_lessons_teacher on public.lessons(teacher_id);
create index if not exists idx_lessons_status  on public.lessons(status);

do $$ begin
  alter table public.lessons add constraint lessons_status_chk
    check (status in ('draft','pending','approved','rejected','completed'));
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════
-- 2) BẢNG lesson_students — học viên trong buổi + kết quả + đánh giá
--    1 dòng = 1 học viên tham gia 1 buổi học.
-- ════════════════════════════════════════════════════════════
create table if not exists public.lesson_students (
  id                 uuid primary key default gen_random_uuid(),
  lesson_id          uuid not null references public.lessons(id) on delete cascade,
  student_id         uuid not null references auth.users(id) on delete cascade,
  student_name       text,
  student_email      text,
  -- HV gửi ghi âm kết quả luyện đọc tại buổi học này
  result_audio_url   text,
  result_submitted_at timestamptz,
  attended           boolean,
  -- Đánh giá của GV: thang điểm 1..10 cho từng tiêu chí + nhận xét
  eval_pronunciation integer,   -- phát âm
  eval_fluency       integer,   -- trôi chảy
  eval_vocabulary    integer,   -- từ vựng
  eval_confidence    integer,   -- tự tin
  eval_comment       text,
  evaluated_at       timestamptz,
  evaluated_by       uuid references auth.users(id),
  created_at         timestamptz default now(),
  unique (lesson_id, student_id)
);
create index if not exists idx_lstu_lesson  on public.lesson_students(lesson_id);
create index if not exists idx_lstu_student on public.lesson_students(student_id);

do $$ begin
  alter table public.lesson_students add constraint lstu_score_chk check (
    (eval_pronunciation is null or eval_pronunciation between 0 and 10) and
    (eval_fluency       is null or eval_fluency       between 0 and 10) and
    (eval_vocabulary    is null or eval_vocabulary    between 0 and 10) and
    (eval_confidence    is null or eval_confidence    between 0 and 10)
  );
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════
-- 3) HÀM HỖ TRỢ: học viên có thuộc buổi học này không?
--    (security definer để né đệ quy RLS giữa 2 bảng)
-- ════════════════════════════════════════════════════════════
create or replace function public.is_lesson_student(lid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.lesson_students
    where lesson_id = lid and student_id = auth.uid()
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 4) RLS cho lessons
-- ════════════════════════════════════════════════════════════
alter table public.lessons enable row level security;

drop policy if exists "lessons read"   on public.lessons;
drop policy if exists "lessons insert" on public.lessons;
drop policy if exists "lessons update" on public.lessons;
drop policy if exists "lessons delete" on public.lessons;

-- Đọc: GV/Admin xem tất cả; HV chỉ xem buổi mình tham gia & đã gửi duyệt trở đi
-- (không thấy 'draft' và 'rejected').
create policy "lessons read" on public.lessons
  for select using (
    public.is_teacher()
    or (status in ('pending','approved','completed') and public.is_lesson_student(id))
  );

-- Tạo / sửa / xóa: chỉ GV/Admin
create policy "lessons insert" on public.lessons
  for insert with check (public.is_teacher());
create policy "lessons update" on public.lessons
  for update using (public.is_teacher()) with check (public.is_teacher());
create policy "lessons delete" on public.lessons
  for delete using (public.is_teacher());

-- Cổng DUYỆT: chỉ Admin được đặt status = approved/rejected.
-- GV cố đặt → hoàn nguyên. Admin đặt → tự đóng dấu người & thời điểm duyệt.
create or replace function public.guard_lesson_approval()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.status is distinct from old.status)
     and new.status in ('approved','rejected') then
    if not public.is_admin() then
      new.status      := old.status;       -- chặn GV tự duyệt
      new.admin_note  := old.admin_note;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    else
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_lesson_approval on public.lessons;
create trigger trg_guard_lesson_approval
  before update on public.lessons
  for each row execute function public.guard_lesson_approval();

-- ════════════════════════════════════════════════════════════
-- 5) RLS cho lesson_students
-- ════════════════════════════════════════════════════════════
alter table public.lesson_students enable row level security;

drop policy if exists "lstu read"   on public.lesson_students;
drop policy if exists "lstu insert" on public.lesson_students;
drop policy if exists "lstu update" on public.lesson_students;
drop policy if exists "lstu delete" on public.lesson_students;

-- Đọc: GV/Admin xem tất cả; HV chỉ xem dòng của mình
create policy "lstu read" on public.lesson_students
  for select using (public.is_teacher() or student_id = auth.uid());

-- Ghi danh (insert) / gỡ (delete): chỉ GV/Admin
create policy "lstu insert" on public.lesson_students
  for insert with check (public.is_teacher());
create policy "lstu delete" on public.lesson_students
  for delete using (public.is_teacher());

-- Cập nhật: GV/Admin (chấm điểm) HOẶC chính HV của dòng đó (gửi ghi âm kết quả)
create policy "lstu update" on public.lesson_students
  for update using (public.is_teacher() or student_id = auth.uid())
  with check (public.is_teacher() or student_id = auth.uid());

-- Chặn leo thang: HV chỉ được đổi result_audio_url / result_submitted_at.
-- Mọi trường điểm/định danh do HV cố sửa → hoàn nguyên. GV chấm điểm → đóng dấu.
create or replace function public.guard_lesson_student()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_teacher() then
    -- ngữ cảnh học viên: khoá toàn bộ trường đánh giá & định danh
    new.lesson_id          := old.lesson_id;
    new.student_id         := old.student_id;
    new.student_name       := old.student_name;
    new.student_email      := old.student_email;
    new.attended           := old.attended;
    new.eval_pronunciation := old.eval_pronunciation;
    new.eval_fluency       := old.eval_fluency;
    new.eval_vocabulary    := old.eval_vocabulary;
    new.eval_confidence    := old.eval_confidence;
    new.eval_comment       := old.eval_comment;
    new.evaluated_at       := old.evaluated_at;
    new.evaluated_by       := old.evaluated_by;
  else
    -- GV chấm điểm: nếu có thay đổi tiêu chí thì đóng dấu người & thời điểm
    if (new.eval_pronunciation is distinct from old.eval_pronunciation)
       or (new.eval_fluency    is distinct from old.eval_fluency)
       or (new.eval_vocabulary is distinct from old.eval_vocabulary)
       or (new.eval_confidence is distinct from old.eval_confidence)
       or (new.eval_comment    is distinct from old.eval_comment) then
      new.evaluated_by := auth.uid();
      new.evaluated_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_lesson_student on public.lesson_students;
create trigger trg_guard_lesson_student
  before update on public.lesson_students
  for each row execute function public.guard_lesson_student();

-- ════════════════════════════════════════════════════════════
-- 6) GHI ÂM: tái dùng bucket 'englishup' (đã public + có policy).
--    File mẫu  : lessons/sample/<lessonId>-<ts>.<ext>
--    File kết quả: lessons/result/<lessonId>-<studentId>-<ts>.<ext>
--    Không cần policy mới nếu migration_storage đã chạy.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- KIỂM TRA NHANH
-- ════════════════════════════════════════════════════════════
-- select tablename, rowsecurity from pg_tables
--   where tablename in ('lessons','lesson_students');
-- select id, title, status, scheduled_date from public.lessons order by scheduled_date;
