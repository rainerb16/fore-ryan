-- Read-only inspection, run before any schema change. Nothing here writes.
-- One query, because the Supabase SQL editor only shows the last result set.
-- Run it, then use "Copy" (or export CSV) on the result.

select section, detail from (
  -- 1. The leaderboard view as the database actually has it.
  select 1 as ord, 'view: leaderboard' as section,
         pg_get_viewdef('public.leaderboard'::regclass, true) as detail

  -- 2. Row level security, per table.
  union all
  select 2, 'rls: ' || relname,
         'enabled=' || relrowsecurity || ' forced=' || relforcerowsecurity
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'

  -- 3. Policies. Expected: none.
  union all
  select 3, 'policy: ' || tablename || '.' || policyname,
         cmd || ' to ' || array_to_string(roles, ',') || ' using ' || coalesce(qual, '-') ||
         ' check ' || coalesce(with_check, '-')
  from pg_policies
  where schemaname = 'public'

  -- 4. What anon and authenticated may do. Expected: nothing.
  union all
  select 4, 'grant: ' || table_name || ' to ' || grantee,
         string_agg(privilege_type, ', ' order by privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name, grantee

  -- 5. Functions in public, including any RPCs.
  union all
  select 5, 'function: ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'language=' || l.lanname || ' security_definer=' || p.prosecdef
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.pronamespace = 'public'::regnamespace

  -- 6. Triggers on our tables, and event triggers.
  union all
  select 6, 'trigger: ' || event_object_table || '.' || trigger_name,
         action_timing || ' ' || event_manipulation
  from information_schema.triggers
  where trigger_schema = 'public'
  union all
  select 6, 'event trigger: ' || evtname, evtevent || ' -> ' || evtfoid::regproc::text
  from pg_event_trigger

  -- 7. Constraints and indexes.
  union all
  select 7, 'constraint: ' || conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
  from pg_constraint
  where connamespace = 'public'::regnamespace
  union all
  select 8, 'index: ' || tablename || '.' || indexname, indexdef
  from pg_indexes
  where schemaname = 'public'
) inspected
order by ord, section;
