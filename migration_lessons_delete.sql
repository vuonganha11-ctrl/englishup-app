-- ============================================================
-- EnglishUp · Migration: Quyền XÓA buổi học
-- Buổi ĐÃ DUYỆT / HOÀN THÀNH → chỉ Admin được xóa.
-- Buổi nháp / chờ duyệt / bị từ chối → giáo viên xóa được buổi của mình.
-- Chạy trong: Supabase Dashboard > SQL Editor > New query > Run. Idempotent.
-- Phụ thuộc: migration_lessons.sql (bảng lessons + hàm is_admin()).
-- ============================================================

drop policy if exists "lessons delete" on public.lessons;
create policy "lessons delete" on public.lessons
  for delete using (
    public.is_admin()
    or (teacher_id = auth.uid()
        and status in ('draft','pending','rejected'))
  );

-- KIỂM TRA:
-- select policyname, cmd, qual from pg_policies
--   where tablename = 'lessons' and cmd = 'DELETE';
