-- ============================================================
-- EnglishUp · BÀI TẬP VỀ NHÀ (Toán / Lý / Hoá / ...)
-- Chạy 1 lần trong Supabase SQL Editor (role postgres).
-- An toàn chạy lại: mọi thứ đều có IF NOT EXISTS / OR REPLACE.
--
-- Ý tưởng bảo mật: ĐÁP ÁN KHÔNG BAO GIỜ RỜI SERVER.
--   - Bảng hw_assignments (chứa đáp án) chỉ ADMIN đọc được.
--   - Học viên lấy đề qua RPC hw_get_paper() -> đề ĐÃ BỎ đáp án.
--   - Nộp bài qua RPC hw_submit() -> chấm ngay trong DB.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) NGÂN HÀNG ĐỀ
-- ------------------------------------------------------------
create table if not exists public.hw_assignments (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subject       text not null default 'toan',   -- toan|ly|hoa|sinh|van|anh|su|dia|tin|khac
  grade         text,                           -- "Lớp 8", "Ôn thi"...
  description   text,
  questions     jsonb not null default '[]'::jsonb,
  total_points  numeric not null default 0,
  pass_score    numeric not null default 0,     -- ĐIỂM SÀN riêng cho từng bài
  time_limit_min int,                           -- null = không giới hạn giờ
  max_attempts  int not null default 0,         -- 0 = làm lại thoải mái
  allow_images  boolean not null default true,  -- cho nộp ảnh bài làm
  is_active     boolean not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists hw_assignments_subject_idx on public.hw_assignments(subject);

-- ------------------------------------------------------------
-- 2) CẤU HÌNH TỪNG HỌC VIÊN
--    Chỉ học viên có enabled = true mới dính tính năng này.
--    lock_pages: mảng tên file bị khoá khi còn bài chưa đạt.
-- ------------------------------------------------------------
create table if not exists public.hw_student_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  enabled     boolean not null default false,
  lock_pages  text[]  not null default '{}',
  note        text,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) GIAO BÀI (1 dòng = 1 bài giao cho 1 học viên)
-- ------------------------------------------------------------
create table if not exists public.hw_grants (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.hw_assignments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  due_at        timestamptz,
  gate          boolean not null default true,  -- bài này có dùng để khoá trang không
  status        text    not null default 'assigned', -- assigned|submitted|graded
  best_score    numeric,
  passed        boolean not null default false,
  attempts_used int     not null default 0,
  assigned_by   uuid,
  assigned_at   timestamptz not null default now(),
  unique (assignment_id, user_id)
);
create index if not exists hw_grants_user_idx on public.hw_grants(user_id);

-- ------------------------------------------------------------
-- 4) BÀI LÀM
-- ------------------------------------------------------------
create table if not exists public.hw_submissions (
  id             uuid primary key default gen_random_uuid(),
  grant_id       uuid not null references public.hw_grants(id) on delete cascade,
  user_id        uuid not null,
  attempt        int  not null default 1,
  answers        jsonb not null default '{}'::jsonb,
  images         text[] not null default '{}',
  per_question   jsonb not null default '{}'::jsonb, -- {qid:{earned,max,correct,type,comment}}
  auto_score     numeric not null default 0,
  manual_score   numeric not null default 0,
  total_score    numeric not null default 0,
  max_score      numeric not null default 0,
  needs_manual   boolean not null default false,
  passed         boolean not null default false,
  teacher_comment text,
  status         text not null default 'submitted',  -- submitted|graded
  submitted_at   timestamptz not null default now(),
  graded_at      timestamptz,
  graded_by      uuid
);
create index if not exists hw_submissions_grant_idx on public.hw_submissions(grant_id);
create index if not exists hw_submissions_status_idx on public.hw_submissions(status);

-- ============================================================
-- RLS
-- ============================================================
alter table public.hw_assignments      enable row level security;
alter table public.hw_student_settings enable row level security;
alter table public.hw_grants           enable row level security;
alter table public.hw_submissions      enable row level security;

-- Đề bài: CHỈ ADMIN. Học viên tuyệt đối không đọc thẳng (kẻo lộ đáp án).
drop policy if exists hw_asg_admin on public.hw_assignments;
create policy hw_asg_admin on public.hw_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- Cấu hình học viên: admin toàn quyền, học viên đọc của mình.
drop policy if exists hw_set_admin on public.hw_student_settings;
create policy hw_set_admin on public.hw_student_settings
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists hw_set_own on public.hw_student_settings;
create policy hw_set_own on public.hw_student_settings
  for select using (user_id = auth.uid());

-- Giao bài: admin toàn quyền, học viên đọc của mình.
drop policy if exists hw_grant_admin on public.hw_grants;
create policy hw_grant_admin on public.hw_grants
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists hw_grant_own on public.hw_grants;
create policy hw_grant_own on public.hw_grants
  for select using (user_id = auth.uid());

-- Bài làm: admin toàn quyền, học viên đọc của mình (ghi qua RPC).
drop policy if exists hw_sub_admin on public.hw_submissions;
create policy hw_sub_admin on public.hw_submissions
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists hw_sub_own on public.hw_submissions;
create policy hw_sub_own on public.hw_submissions
  for select using (user_id = auth.uid());

-- ============================================================
-- HÀM PHỤ
-- ============================================================

-- Chuẩn hoá đáp án ngắn: bỏ dấu cách, thường hoá, dấu phẩy -> dấu chấm
create or replace function public.hw_norm(t text)
returns text language sql immutable as $$
  select regexp_replace(lower(translate(coalesce(t,''), ',', '.')), '\s+', '', 'g')
$$;

-- Bỏ đáp án khỏi 1 câu hỏi trước khi gửi cho học viên
create or replace function public.hw_strip(q jsonb)
returns jsonb language sql immutable as $$
  select (q - 'answer' - 'accept' - 'explain')
$$;

-- Tính lại tổng điểm của đề từ mảng questions
create or replace function public.hw_calc_total(qs jsonb)
returns numeric language sql immutable as $$
  select coalesce(sum(coalesce((e->>'points')::numeric, 1)), 0)
  from jsonb_array_elements(coalesce(qs,'[]'::jsonb)) e
$$;

-- Tự cập nhật total_points + updated_at mỗi khi sửa đề
create or replace function public.hw_asg_before()
returns trigger language plpgsql as $$
begin
  new.total_points := public.hw_calc_total(new.questions);
  new.updated_at   := now();
  return new;
end $$;
drop trigger if exists trg_hw_asg_before on public.hw_assignments;
create trigger trg_hw_asg_before before insert or update on public.hw_assignments
  for each row execute function public.hw_asg_before();

-- ============================================================
-- RPC CHO HỌC VIÊN
-- ============================================================

-- Danh sách bài được giao (không kèm câu hỏi)
create or replace function public.hw_my_tasks()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'due_at' nulls last), '[]'::jsonb) from (
    select jsonb_build_object(
      'grant_id',  g.id,
      'title',     a.title,
      'subject',   a.subject,
      'grade',     a.grade,
      'description', a.description,
      'total_points', a.total_points,
      'pass_score', a.pass_score,
      'time_limit_min', a.time_limit_min,
      'max_attempts', a.max_attempts,
      'n_questions', jsonb_array_length(a.questions),
      'due_at',    g.due_at,
      'gate',      g.gate,
      'status',    g.status,
      'passed',    g.passed,
      'best_score', g.best_score,
      'attempts_used', g.attempts_used,
      'assigned_at', g.assigned_at
    ) as x
    from hw_grants g join hw_assignments a on a.id = g.assignment_id
    where g.user_id = auth.uid() and a.is_active
  ) t
$$;

-- Lấy đề để làm — ĐÃ BỎ đáp án
create or replace function public.hw_get_paper(p_grant uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare g hw_grants; a hw_assignments; qs jsonb;
begin
  select * into g from hw_grants where id = p_grant and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'khong_co_bai'); end if;
  select * into a from hw_assignments where id = g.assignment_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'de_da_an'); end if;
  -- KHÔNG chặn theo số lượt ở đây: học viên hết lượt vẫn cần mở lại đề để XEM kết quả.
  -- Việc chặn nộp thêm nằm ở hw_submit().

  select coalesce(jsonb_agg(public.hw_strip(e) order by ord), '[]'::jsonb)
    into qs from jsonb_array_elements(a.questions) with ordinality x(e, ord);

  return jsonb_build_object(
    'ok', true,
    'grant_id', g.id,
    'title', a.title, 'subject', a.subject, 'grade', a.grade,
    'description', a.description,
    'total_points', a.total_points, 'pass_score', a.pass_score,
    'time_limit_min', a.time_limit_min,
    'max_attempts', a.max_attempts, 'attempts_used', g.attempts_used,
    'allow_images', a.allow_images,
    'due_at', g.due_at,
    'questions', qs
  );
end $$;

-- Nộp bài + chấm tự động
create or replace function public.hw_submit(p_grant uuid, p_answers jsonb, p_images text[] default '{}')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g hw_grants; a hw_assignments;
  q jsonb; qid text; qtype text; pts numeric; earned numeric;
  ua text; ok boolean; acc jsonb;
  per jsonb := '{}'::jsonb;
  auto numeric := 0; maxs numeric := 0; manual_pending boolean := false;
  sub_id uuid; n int;
begin
  select * into g from hw_grants where id = p_grant and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'khong_co_bai'); end if;
  select * into a from hw_assignments where id = g.assignment_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'reason', 'de_da_an'); end if;
  if a.max_attempts > 0 and g.attempts_used >= a.max_attempts and not g.passed then
    return jsonb_build_object('ok', false, 'reason', 'het_luot');
  end if;

  for q in select e from jsonb_array_elements(a.questions) e loop
    qid   := coalesce(q->>'id', '');
    qtype := coalesce(q->>'type', 'mc');
    pts   := coalesce((q->>'points')::numeric, 1);
    maxs  := maxs + pts;
    earned := 0; ok := false;
    ua := coalesce(p_answers->>qid, '');

    if qtype = 'mc' then
      ok := (ua <> '' and ua = coalesce(q->>'answer',''));
      if ok then earned := pts; end if;

    elsif qtype = 'multi' then
      -- nhiều đáp án đúng: so khớp tập hợp (chuỗi các chỉ số nối bằng dấu phẩy, đã sắp xếp ở client)
      ok := (ua <> '' and public.hw_norm(ua) = public.hw_norm(coalesce(q->>'answer','')));
      if ok then earned := pts; end if;

    elsif qtype = 'short' then
      if ua <> '' then
        if public.hw_norm(ua) = public.hw_norm(coalesce(q->>'answer','')) then ok := true; end if;
        if not ok then
          acc := coalesce(q->'accept', '[]'::jsonb);
          if jsonb_typeof(acc) = 'array' then
            select bool_or(public.hw_norm(v #>> '{}') = public.hw_norm(ua))
              into ok from jsonb_array_elements(acc) v;
            ok := coalesce(ok, false);
          end if;
        end if;
      end if;
      if ok then earned := pts; end if;

    else -- essay: chờ giáo viên chấm
      manual_pending := true;
    end if;

    if qtype in ('mc','multi','short') then auto := auto + earned; end if;

    per := per || jsonb_build_object(qid, jsonb_build_object(
      'earned', case when qtype='essay' then null else earned end,
      'max', pts, 'type', qtype,
      'correct', case when qtype='essay' then null else ok end,
      'comment', null));
  end loop;

  n := g.attempts_used + 1;

  insert into hw_submissions(grant_id, user_id, attempt, answers, images, per_question,
                             auto_score, manual_score, total_score, max_score,
                             needs_manual, passed, status)
  values (g.id, auth.uid(), n, coalesce(p_answers,'{}'::jsonb), coalesce(p_images,'{}'),
          per, auto, 0, auto, maxs,
          manual_pending,
          (not manual_pending) and auto >= a.pass_score,
          case when manual_pending then 'submitted' else 'graded' end)
  returning id into sub_id;

  update hw_grants set
    attempts_used = n,
    status = case when manual_pending then 'submitted' else 'graded' end,
    best_score = greatest(coalesce(best_score, 0), case when manual_pending then 0 else auto end),
    passed = passed or ((not manual_pending) and auto >= a.pass_score)
  where id = g.id;

  return jsonb_build_object(
    'ok', true, 'submission_id', sub_id,
    'needs_manual', manual_pending,
    'auto_score', auto, 'max_score', maxs, 'pass_score', a.pass_score,
    'passed', (not manual_pending) and auto >= a.pass_score,
    'per_question', case when manual_pending then '{}'::jsonb else per end
  );
end $$;

-- Xem lại bài đã làm (kèm kết quả từng câu + nhận xét)
create or replace function public.hw_my_result(p_grant uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'attempt', s.attempt, 'answers', s.answers, 'images', s.images,
      'per_question', s.per_question, 'auto_score', s.auto_score,
      'manual_score', s.manual_score, 'total_score', s.total_score,
      'max_score', s.max_score, 'needs_manual', s.needs_manual, 'passed', s.passed,
      'teacher_comment', s.teacher_comment, 'status', s.status,
      'submitted_at', s.submitted_at, 'graded_at', s.graded_at) order by s.attempt desc), '[]'::jsonb)
    into r
  from hw_submissions s join hw_grants g on g.id = s.grant_id
  where s.grant_id = p_grant and g.user_id = auth.uid();
  return coalesce(r, '[]'::jsonb);
end $$;

-- Trạng thái khoá trang cho học viên hiện tại
create or replace function public.hw_gate()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare st hw_student_settings; pend jsonb; cnt int; adm boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('enabled', false, 'blocked', false, 'lock_pages', '[]'::jsonb, 'pending', '[]'::jsonb);
  end if;
  select (role = 'admin' or role = 'teacher') into adm from user_profiles where id = auth.uid();
  select * into st from hw_student_settings where user_id = auth.uid();
  if not found or not st.enabled or coalesce(adm,false) then
    return jsonb_build_object('enabled', false, 'blocked', false, 'lock_pages', '[]'::jsonb, 'pending', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'grant_id', g.id, 'title', a.title, 'subject', a.subject,
           'due_at', g.due_at, 'status', g.status,
           'pass_score', a.pass_score, 'best_score', g.best_score)), '[]'::jsonb),
         count(*)
    into pend, cnt
  from hw_grants g join hw_assignments a on a.id = g.assignment_id
  where g.user_id = auth.uid() and g.gate and a.is_active and not g.passed;

  return jsonb_build_object(
    'enabled', true,
    'blocked', cnt > 0,
    'lock_pages', to_jsonb(st.lock_pages),
    'pending', pend);
end $$;

-- ============================================================
-- RPC CHO ADMIN
-- ============================================================

-- Danh sách học viên + cấu hình + số bài đang nợ
create or replace function public.hw_admin_students()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.id, 'email', p.email, 'full_name', p.full_name,
      'role', p.role, 'plan', p.plan,
      'enabled', coalesce(s.enabled,false),
      'lock_pages', coalesce(to_jsonb(s.lock_pages), '[]'::jsonb),
      'note', s.note,
      'n_assigned', (select count(*) from hw_grants g where g.user_id = p.id),
      'n_pending',  (select count(*) from hw_grants g where g.user_id = p.id and not g.passed)
    ) order by coalesce(s.enabled,false) desc, p.email), '[]'::jsonb)
  into r from user_profiles p left join hw_student_settings s on s.user_id = p.id;
  return jsonb_build_object('ok', true, 'rows', r);
end $$;

-- Bật/tắt tính năng + chọn trang bị khoá cho 1 học viên
create or replace function public.hw_admin_set_student(p_user uuid, p_enabled boolean, p_pages text[], p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  insert into hw_student_settings(user_id, enabled, lock_pages, note, updated_at)
  values (p_user, coalesce(p_enabled,false), coalesce(p_pages,'{}'), p_note, now())
  on conflict (user_id) do update set
    enabled = excluded.enabled, lock_pages = excluded.lock_pages,
    note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Giao 1 đề cho nhiều học viên
create or replace function public.hw_admin_assign(p_assignment uuid, p_users uuid[], p_due timestamptz default null, p_gate boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  foreach u in array coalesce(p_users, '{}') loop
    insert into hw_grants(assignment_id, user_id, due_at, gate, assigned_by)
    values (p_assignment, u, p_due, coalesce(p_gate,true), auth.uid())
    on conflict (assignment_id, user_id) do update set due_at = excluded.due_at, gate = excluded.gate;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'n', n);
end $$;

-- Danh sách bài đã giao / bài nộp cho admin
create or replace function public.hw_admin_grants(p_only_pending boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'grant_id', g.id, 'assignment_id', a.id, 'title', a.title, 'subject', a.subject,
      'pass_score', a.pass_score, 'total_points', a.total_points,
      'user_id', g.user_id, 'email', p.email, 'full_name', p.full_name,
      'due_at', g.due_at, 'gate', g.gate, 'status', g.status,
      'passed', g.passed, 'best_score', g.best_score, 'attempts_used', g.attempts_used,
      'last_sub', (select jsonb_build_object('id', s.id, 'attempt', s.attempt,
                     'needs_manual', s.needs_manual, 'status', s.status,
                     'total_score', s.total_score, 'submitted_at', s.submitted_at)
                   from hw_submissions s where s.grant_id = g.id
                   order by s.attempt desc limit 1)
    ) order by g.assigned_at desc), '[]'::jsonb)
  into r
  from hw_grants g
  join hw_assignments a on a.id = g.assignment_id
  left join user_profiles p on p.id = g.user_id
  where (not p_only_pending) or exists (
    select 1 from hw_submissions s where s.grant_id = g.id and s.status = 'submitted');
  return jsonb_build_object('ok', true, 'rows', r);
end $$;

-- Mở 1 bài nộp để chấm (kèm đề CÓ đáp án — chỉ admin)
create or replace function public.hw_admin_open_sub(p_sub uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare s hw_submissions; g hw_grants; a hw_assignments; prof record;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  select * into s from hw_submissions where id = p_sub;
  if not found then return jsonb_build_object('ok', false, 'reason', 'khong_thay'); end if;
  select * into g from hw_grants where id = s.grant_id;
  select * into a from hw_assignments where id = g.assignment_id;
  select email, full_name into prof from user_profiles where id = s.user_id;
  return jsonb_build_object('ok', true,
    'submission', to_jsonb(s), 'grant', to_jsonb(g),
    'assignment', to_jsonb(a),
    'student', jsonb_build_object('email', prof.email, 'full_name', prof.full_name));
end $$;

-- Admin chấm tay: p_scores = {qid: điểm}, kèm nhận xét từng câu {qid: "..."} và nhận xét chung
create or replace function public.hw_admin_grade(p_sub uuid, p_scores jsonb, p_comments jsonb default '{}'::jsonb, p_comment text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s hw_submissions; g hw_grants; a hw_assignments;
  per jsonb; k text; v jsonb; man numeric := 0; tot numeric; pass boolean;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  select * into s from hw_submissions where id = p_sub;
  if not found then return jsonb_build_object('ok', false, 'reason', 'khong_thay'); end if;
  select * into g from hw_grants where id = s.grant_id;
  select * into a from hw_assignments where id = g.assignment_id;

  per := s.per_question;
  for k, v in select * from jsonb_each(per) loop
    if (v->>'type') = 'essay' then
      per := jsonb_set(per, array[k,'earned'],
              to_jsonb(least(coalesce((p_scores->>k)::numeric, 0), coalesce((v->>'max')::numeric,0))));
      man := man + least(coalesce((p_scores->>k)::numeric, 0), coalesce((v->>'max')::numeric,0));
    end if;
    if p_comments ? k then
      per := jsonb_set(per, array[k,'comment'], to_jsonb(p_comments->>k));
    end if;
  end loop;

  tot  := s.auto_score + man;
  pass := tot >= a.pass_score;

  update hw_submissions set
    per_question = per, manual_score = man, total_score = tot,
    passed = pass, teacher_comment = coalesce(p_comment, teacher_comment),
    status = 'graded', needs_manual = false, graded_at = now(), graded_by = auth.uid()
  where id = p_sub;

  update hw_grants set
    status = 'graded',
    best_score = greatest(coalesce(best_score,0), tot),
    passed = passed or pass
  where id = g.id;

  return jsonb_build_object('ok', true, 'total_score', tot, 'passed', pass, 'pass_score', a.pass_score);
end $$;

-- Gỡ bài đã giao
create or replace function public.hw_admin_unassign(p_grant uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  delete from hw_grants where id = p_grant;
  return jsonb_build_object('ok', true);
end $$;

-- Mở khoá tay (bỏ qua điểm — dùng khi học viên đã nộp vở giấy)
create or replace function public.hw_admin_force_pass(p_grant uuid, p_passed boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'khong_phai_admin'); end if;
  update hw_grants set passed = coalesce(p_passed,true) where id = p_grant;
  return jsonb_build_object('ok', true);
end $$;

-- ============================================================
-- QUYỀN GỌI RPC
-- ============================================================
grant execute on function public.hw_my_tasks()                                     to anon, authenticated;
grant execute on function public.hw_get_paper(uuid)                                to anon, authenticated;
grant execute on function public.hw_submit(uuid, jsonb, text[])                    to anon, authenticated;
grant execute on function public.hw_my_result(uuid)                                to anon, authenticated;
grant execute on function public.hw_gate()                                         to anon, authenticated;
grant execute on function public.hw_admin_students()                               to anon, authenticated;
grant execute on function public.hw_admin_set_student(uuid, boolean, text[], text) to anon, authenticated;
grant execute on function public.hw_admin_assign(uuid, uuid[], timestamptz, boolean) to anon, authenticated;
grant execute on function public.hw_admin_grants(boolean)                          to anon, authenticated;
grant execute on function public.hw_admin_open_sub(uuid)                           to anon, authenticated;
grant execute on function public.hw_admin_grade(uuid, jsonb, jsonb, text)          to anon, authenticated;
grant execute on function public.hw_admin_unassign(uuid)                           to anon, authenticated;
grant execute on function public.hw_admin_force_pass(uuid, boolean)                to anon, authenticated;

-- ============================================================
-- KIỂM TRA NHANH
-- ============================================================
-- select public.hw_gate();
-- select public.hw_my_tasks();
