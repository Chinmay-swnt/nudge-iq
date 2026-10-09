-- ==========================================================
-- NudgeIQ Phase 1 Migration: Enable RLS & Team Isolation Policies
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> Run)
-- ==========================================================

-- 1. Enable RLS on all primary tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 2. Clean up any existing overly-permissive or duplicate policies
DROP POLICY IF EXISTS "Public teams access" ON public.teams;
DROP POLICY IF EXISTS "Public meetings access" ON public.meetings;
DROP POLICY IF EXISTS "Allow all users to select meetings" ON public.meetings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.teams;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.action_items;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tasks;
DROP POLICY IF EXISTS "Team members can view their team meetings" ON public.meetings;
DROP POLICY IF EXISTS "Team members can insert meetings" ON public.meetings;
DROP POLICY IF EXISTS "Team members can update meetings" ON public.meetings;
DROP POLICY IF EXISTS "Team members can view their teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view team membership" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view transcripts" ON public.transcripts;
DROP POLICY IF EXISTS "Team members can view action items" ON public.action_items;
DROP POLICY IF EXISTS "Team members can view tasks" ON public.tasks;

-- 3. Helper function for RLS checks (prevents recursive RLS evaluation)
CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = check_team_id AND user_id = auth.uid()
  );
$$;

-- 4. Teams Table Policies
CREATE POLICY "Team members can view their teams"
  ON public.teams FOR SELECT
  TO authenticated
  USING (public.is_team_member(id));

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. Team Members Table Policies
CREATE POLICY "Team members can view team membership"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id) OR user_id = auth.uid());

CREATE POLICY "Users can create membership when creating team"
  ON public.team_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(team_id));

-- 6. Meetings Table Policies (CORE ACCEPTANCE CRITERIA)
-- Only members of the meeting's team can view meetings
CREATE POLICY "Team members can view their team meetings"
  ON public.meetings FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id));

CREATE POLICY "Team members can insert meetings"
  ON public.meetings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_member(team_id));

CREATE POLICY "Team members can update meetings"
  ON public.meetings FOR UPDATE
  TO authenticated
  USING (public.is_team_member(team_id));

-- 7. Transcripts Table Policies
CREATE POLICY "Team members can view transcripts"
  ON public.transcripts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id AND public.is_team_member(m.team_id)
    )
  );

CREATE POLICY "Team members can insert transcripts"
  ON public.transcripts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id AND public.is_team_member(m.team_id)
    )
  );

-- 8. Action Items Table Policies
CREATE POLICY "Team members can view action items"
  ON public.action_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id AND public.is_team_member(m.team_id)
    )
  );

CREATE POLICY "Team members can insert action items"
  ON public.action_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id AND public.is_team_member(m.team_id)
    )
  );

-- 9. Tasks Table Policies
CREATE POLICY "Team members can view tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.action_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = action_item_id AND public.is_team_member(m.team_id)
    )
  );

CREATE POLICY "Team members can update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.action_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = action_item_id AND public.is_team_member(m.team_id)
    )
  );
