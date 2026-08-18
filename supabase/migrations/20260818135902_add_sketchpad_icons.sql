-- Supabase Management API applied this version to production while the
-- original migration remained unapplied there. Keep both versions idempotent
-- so production, existing development databases, and fresh databases converge.
alter table public.sketchpads
  add column if not exists icon text default 'cover';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sketchpads'::regclass
      and conname = 'sketchpads_icon_check'
  ) then
    alter table public.sketchpads
      add constraint sketchpads_icon_check
      check (
        icon is null or icon in (
          'cover', 'book', 'star', 'heart', 'palette', 'camera', 'paw', 'rocket'
        )
      );
  end if;
end;
$$;

update public.sketchpads
set icon = 'cover'
where icon is null;
