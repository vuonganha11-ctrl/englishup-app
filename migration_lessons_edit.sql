-- ============================================================
-- EnglishUp · Migration: Quyền SỬA NỘI DUNG buổi học
-- Admin: sửa nội dung ở MỌI trạng thái.
-- Giáo viên: chỉ sửa nội dung khi buổi đang 'draft' (Nháp) hoặc 'pending' (Chờ duyệt).
-- Khi buổi đã approved/rejected/completed → GV không đổi được nội dung
-- (vẫn cho phép chuyển trạng thái như gửi lại duyệt / đánh dấu hoàn thành).
-- Chạy trong: Supabase Dashboard > SQL Editor > New query > Run. Idempotent.
-- Phụ thuộc: migration_lessons.sql.
-- ============================================================

-- Mở rộng trigger guard sẵn có (BEFORE UPDATE) — giữ cổng DUYỆT, thêm khoá NỘI DUNG.
create or replace function public.guard_lesson_approval()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- (1) Cổng DUYỆT: chỉ Admin được đặt approved/rejected; tự đóng dấu người duyệt.
  if (new.status is distinct from old.status)
     and new.status in ('approved','rejected') then
    if not public.is_admin() then
      new.status      := old.status;
      new.admin_note  := old.admin_note;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
    else
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;

  -- (2) Quyền SỬA NỘI DUNG: GV (không phải admin) chỉ sửa khi Nháp/Chờ duyệt.
  --     Buổi đã ra khỏi draft/pending → hoàn nguyên mọi thay đổi nội dung.
  if not public.is_admin() and old.status not in ('draft','pending') then
    new.title            := old.title;
    new.content          := old.content;
    new.word_ids         := old.word_ids;
    new.topic_id         := old.topic_id;
    new.scheduled_date   := old.scheduled_date;
    new.start_time       := old.start_time;
    new.duration_minutes := old.duration_minutes;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Trigger trg_guard_lesson_approval đã tồn tại (migration_lessons.sql) và dùng hàm này
-- nên không cần tạo lại. Bảo đảm tồn tại (an toàn nếu chạy độc lập):
drop trigger if exists trg_guard_lesson_approval on public.lessons;
create trigger trg_guard_lesson_approval
  before update on public.lessons
  for each row execute function public.guard_lesson_approval();
