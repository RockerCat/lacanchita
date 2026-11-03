-- Ilustraciones de torneo (proyecto real; todo dentro de una transacción con ROLLBACK, sin archivos reales).
begin;
create temp table r(name text, ok boolean);
grant all on r to public;
do $$
declare sa constant uuid := '95d77e57-b6cb-4359-bc86-e70b3b9f44dd'; nu constant uuid := '00000000-0000-0000-0000-000000000001';
  ev uuid; p1 text; p2 text; ok boolean; n int; hist int;
begin
  select id into ev from public.events where slug = 'qa-jugador';
  select count(*) into hist from public.matches;
  p1 := ev || '/' || gen_random_uuid() || '.png';
  p2 := ev || '/' || gen_random_uuid() || '.webp';
  insert into r values ('bucket público, 5 MB, solo png/jpeg/webp', exists (select 1 from storage.buckets where id='event-illustrations' and public and file_size_limit=5242880 and allowed_mime_types @> array['image/png','image/jpeg','image/webp'] and cardinality(allowed_mime_types)=3));

  -- usuario normal: no sube ni asocia ni quita
  perform set_config('request.jwt.claims', json_build_object('sub', nu, 'role', 'authenticated')::text, true);
  begin set local role authenticated; insert into storage.objects(bucket_id, name, owner) values ('event-illustrations', p1, nu); ok := false; exception when others then ok := true; end; reset role;
  insert into r values ('usuario normal no puede subir objetos', ok);
  begin set local role authenticated; perform public.control_set_event_illustration(ev, p1); ok := false; exception when others then ok := true; end; reset role;
  insert into r values ('usuario normal no puede asociar', ok);
  begin set local role anon; insert into storage.objects(bucket_id, name) values ('event-illustrations', p1); ok := false; exception when others then ok := true; end; reset role;
  insert into r values ('anon no puede subir', ok);

  -- superadministrador
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects(bucket_id, name, owner) values ('event-illustrations', p1, sa);
  reset role;
  insert into r values ('superadmin sube', exists (select 1 from storage.objects where bucket_id='event-illustrations' and name=p1));
  begin perform public.control_set_event_illustration(ev, 'otro/' || gen_random_uuid() || '.png'); ok := false; exception when others then ok := true; end;
  insert into r values ('ruta de otro torneo / objeto inexistente rechazados', ok);
  begin perform public.control_set_event_illustration(ev, ev || '/' || gen_random_uuid() || '.png'); ok := false; exception when others then ok := true; end;
  insert into r values ('objeto no subido rechazado', ok);
  begin perform public.control_set_event_illustration(ev, '../' || p1); ok := false; exception when others then ok := true; end;
  insert into r values ('ruta con .. rechazada', ok);
  perform public.control_set_event_illustration(ev, p1);
  insert into r values ('asociada y auditada', (select illustration_path = p1 from public.events where id = ev) and exists (select 1 from public.control_audit_log where action='event_illustration_changed' and event_id = ev));
  -- reemplazo
  set local role authenticated; insert into storage.objects(bucket_id, name, owner) values ('event-illustrations', p2, sa); reset role;
  perform public.control_set_event_illustration(ev, p2);
  -- (el borrado de objetos solo es posible por la API de Storage; la base lo prohíbe por SQL directo)
  insert into r values ('reemplazo: la referencia pasa a la nueva ruta', (select illustration_path = p2 from public.events where id = ev));
  -- lectura pública de la ruta
  update public.events set landing_visible = true where id = ev;
  set local role anon; select count(*) into n from public.get_landing_tournaments() where slug='qa-jugador' and illustration_path = p2; reset role;
  insert into r values ('la portada devuelve la ruta', n = 1);
  -- otros recursos protegidos: team-crests intacto para usuario normal
  perform set_config('request.jwt.claims', json_build_object('sub', nu, 'role', 'authenticated')::text, true);
  begin set local role authenticated; insert into storage.objects(bucket_id, name, owner) values ('team-crests', gen_random_uuid() || '/x.png', nu); ok := false; exception when others then ok := true; end; reset role;
  insert into r values ('usuario normal sigue sin escribir en otros buckets', ok);
  -- quitar
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.control_set_event_illustration(ev, null);
  insert into r values ('quitar deja la referencia en NULL', (select illustration_path is null from public.events where id = ev));
  insert into r values ('datos deportivos intactos', (select count(*) from public.matches) = hist);
end $$;
select count(*) filter (where ok) || '/' || count(*) as passed, string_agg(case when not ok then name end, ' | ') as fallos from r;
rollback;
