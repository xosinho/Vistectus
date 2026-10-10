-- !! Since admin/sql/access.sql (chronicles and their members), this file's
-- !! rules are replaced there. If you ever run this file again, run
-- !! admin/sql/access.sql again straight after it.
-- =====================================================================
-- RICO Case board: who may save and delete
-- ---------------------------------------------------------------------
-- Run once in Supabase: SQL Editor -> New query. Needs the character
-- sheet setup (assets/sheets/sql/setup.sql), whose sheet_owners table
-- says which account plays which hunter.
--
-- After this, saving a case file, deleting one, and uploading its
-- photos are limited to the players of Vivienne and Ezekiel, and the
-- Storyteller. Reading is unchanged: anyone can still open the board.
--
-- To change who may edit, change the list in case_board_editor() below
-- and run this file again.
-- =====================================================================

-- The one rule: is the signed-in account one of the board's editors?
-- The page asks it too, to decide whether to offer Save and Delete.
create or replace function public.case_board_editor() returns boolean
language sql stable security definer set search_path = public
as $$ select owns_sheet('vivienne') or owns_sheet('ezekiel') or is_storyteller() $$;

drop policy if exists "Signed-in players save case files" on public.case_files;
drop policy if exists "Signed-in players delete case files" on public.case_files;
drop policy if exists "Signed-in players add case photos" on storage.objects;
-- ...and this file's own, so it can be run again safely.
drop policy if exists "Case board editors save case files" on public.case_files;
drop policy if exists "Case board editors delete case files" on public.case_files;
drop policy if exists "Case board editors add case photos" on storage.objects;

create policy "Case board editors save case files"
  on public.case_files for insert to authenticated
  with check (saved_by = (select auth.uid()) and public.case_board_editor());

create policy "Case board editors delete case files"
  on public.case_files for delete to authenticated
  using (public.case_board_editor());

create policy "Case board editors add case photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'case-photos' and public.case_board_editor());
