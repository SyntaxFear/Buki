alter table public.sketchpads
  add column icon text default 'cover'
  check (
    icon is null or icon in (
      'cover', 'book', 'star', 'heart', 'palette', 'camera', 'paw', 'rocket'
    )
  );

update public.sketchpads
set icon = 'cover'
where icon is null;
