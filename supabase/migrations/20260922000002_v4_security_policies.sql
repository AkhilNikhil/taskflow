-- V4 Security Layer: Row Level Security & Access Control Policies
-- Standard Supabase Migration: 20260922000002_v4_security_policies.sql
-- Targets: Supabase PostgreSQL (Managed by Supabase CLI / migrations)

-- =============================================================================
-- 0. Non-API Private Schema & Helper Functions
-- =============================================================================

-- Create dedicated private schema for internal authorization routines.
-- PostgREST exposes only the public schema; functions in "internal" are NEVER
-- callable via the client RPC API, preventing any task/conversation metadata leakage.
CREATE SCHEMA IF NOT EXISTS internal;

-- -----------------------------------------------------------------------------
-- 0.1 Public Authorization Lookup Helpers (SECURITY DEFINER to optimize lookups)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_system_role()
RETURNS VARCHAR(20)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT system_role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_account_status()
RETURNS VARCHAR(20)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_status FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS VARCHAR(255)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_architect()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND system_role = 'ARCHITECT'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_architect()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND system_role IN ('ARCHITECT', 'ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = check_team_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_leader(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = check_team_id AND user_id = auth.uid() AND team_role = 'LEADER'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_in_team(check_user_id UUID, check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = check_team_id AND user_id = check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_member(check_conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = check_conv_id AND user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 0.2 Private Internal Invariant Helpers (Non-API, bypasses RLS without recursion)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION internal.get_task_team_id(check_task_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_team_id FROM public.tasks WHERE id = check_task_id;
$$;

CREATE OR REPLACE FUNCTION internal.get_task_created_by(check_task_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT created_by FROM public.tasks WHERE id = check_task_id;
$$;

CREATE OR REPLACE FUNCTION internal.get_task_assigned_user_id(check_task_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT assigned_user_id FROM public.tasks WHERE id = check_task_id;
$$;

CREATE OR REPLACE FUNCTION internal.get_task_owner_user_id(check_task_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_user_id FROM public.tasks WHERE id = check_task_id;
$$;

-- Clean up any legacy helper functions from public schema to eliminate RPC exposure
DROP FUNCTION IF EXISTS public.get_task_team_id(UUID);
DROP FUNCTION IF EXISTS public.get_task_created_by(UUID);
DROP FUNCTION IF EXISTS public.get_task_assigned_user_id(UUID);
DROP FUNCTION IF EXISTS public.get_task_owner_user_id(UUID);
DROP FUNCTION IF EXISTS public.conversation_member_count(UUID);
DROP FUNCTION IF EXISTS public.direct_conversation_has_other_member(UUID, UUID);

-- -----------------------------------------------------------------------------
-- 0.3 Concurrency-Safe Trigger Function for Direct Conversations
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION internal.enforce_direct_conversation_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conv_type VARCHAR(20);
    v_member_count INT;
BEGIN
    -- Acquire exclusive row-level lock on parent conversation to serialize concurrent additions
    SELECT conversation_type INTO v_conv_type
    FROM public.conversations
    WHERE id = NEW.conversation_id
    FOR UPDATE;

    IF v_conv_type = 'DIRECT' THEN
        SELECT COUNT(*) INTO v_member_count
        FROM public.conversation_members
        WHERE conversation_id = NEW.conversation_id
          AND (TG_OP = 'INSERT' OR id <> NEW.id);

        IF v_member_count >= 2 THEN
            RAISE EXCEPTION 'A DIRECT conversation cannot have more than 2 members'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 0.4 Helper Permissions Configuration
-- -----------------------------------------------------------------------------

-- Revoke all permissions from PUBLIC by default
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA internal FROM PUBLIC;

REVOKE ALL ON FUNCTION public.current_user_system_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_account_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_architect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_or_architect() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_leader(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_in_team(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_conversation_member(UUID) FROM PUBLIC;

-- Grant USAGE and EXECUTE on private internal helpers to authenticated for RLS usage only.
-- (Non-public schema guarantees PostgREST does NOT expose these via the RPC API)
GRANT USAGE ON SCHEMA internal TO authenticated;
GRANT EXECUTE ON FUNCTION internal.get_task_team_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.get_task_created_by(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.get_task_assigned_user_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.get_task_owner_user_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.enforce_direct_conversation_member_limit() TO authenticated;

-- Grant EXECUTE on public role lookup helpers
GRANT EXECUTE ON FUNCTION public.current_user_system_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_account_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_architect() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_architect() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_leader(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_in_team(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated;

-- =============================================================================
-- 1. Enable Row Level Security on All 10 V4 Tables
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Table: public.users Policies
-- =============================================================================

-- Authenticated users can view user profiles (discovery, assignment, messaging)
CREATE POLICY "users_select_authenticated"
ON public.users
FOR SELECT
TO authenticated
USING (true);

-- Users can insert their initial profile as USER; Architect can create any user
CREATE POLICY "users_insert_policy"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  (id = auth.uid() AND system_role = 'USER' AND account_status = 'ACTIVE')
  OR public.is_architect()
);

-- Users can only modify allowed profile fields (e.g. display_name).
-- Normal users CANNOT change system_role, account_status, email, or id.
-- Architect retains system-wide role, status, and account authority.
CREATE POLICY "users_update_policy"
ON public.users
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR public.is_architect()
)
WITH CHECK (
  public.is_architect()
  OR (
    id = auth.uid()
    AND system_role = public.current_user_system_role()
    AND account_status = public.current_user_account_status()
    AND email = public.current_user_email()
  )
);

-- Only Architect can delete user profiles
CREATE POLICY "users_delete_architect"
ON public.users
FOR DELETE
TO authenticated
USING (public.is_architect());

-- =============================================================================
-- 3. Table: public.teams Policies
-- =============================================================================

-- Admins/Architect can view all teams; Users can view teams they belong to
CREATE POLICY "teams_select_policy"
ON public.teams
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_architect()
  OR public.is_team_member(id)
);

-- Only Admins and Architect can create new teams
CREATE POLICY "teams_insert_admin_architect"
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_architect());

-- Admins, Architect, or designated Team Leaders can update team metadata
CREATE POLICY "teams_update_policy"
ON public.teams
FOR UPDATE
TO authenticated
USING (
  public.is_admin_or_architect()
  OR public.is_team_leader(id)
);

-- Only Admins and Architect can delete teams
CREATE POLICY "teams_delete_admin_architect"
ON public.teams
FOR DELETE
TO authenticated
USING (public.is_admin_or_architect());

-- =============================================================================
-- 4. Table: public.team_members Policies
-- =============================================================================

-- Admins/Architect can view all memberships; Users can view rosters of their teams
CREATE POLICY "team_members_select_policy"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_architect()
  OR public.is_team_member(team_id)
);

-- Admins/Architect can add members with any role.
-- Team Leaders can add members to their team, but ONLY as MEMBER (cannot promote to LEADER).
CREATE POLICY "team_members_insert_policy"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_architect()
  OR (public.is_team_leader(team_id) AND team_role = 'MEMBER')
);

-- Team role changes are strictly restricted to Admin/Architect authority
CREATE POLICY "team_members_update_admin_architect"
ON public.team_members
FOR UPDATE
TO authenticated
USING (public.is_admin_or_architect())
WITH CHECK (public.is_admin_or_architect());

-- Admins, Architect, Team Leaders, or members themselves leaving a team
CREATE POLICY "team_members_delete_policy"
ON public.team_members
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_architect()
  OR public.is_team_leader(team_id)
  OR user_id = auth.uid()
);

-- =============================================================================
-- 5. Table: public.tasks Policies
-- =============================================================================

-- Admins/Architect can view all tasks.
-- Personal tasks: creator, assignee, or owner.
-- Team tasks: members of assigned_team_id.
CREATE POLICY "tasks_select_policy"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_architect()
  OR created_by = auth.uid()
  OR assigned_user_id = auth.uid()
  OR owner_user_id = auth.uid()
  OR (assigned_team_id IS NOT NULL AND public.is_team_member(assigned_team_id))
);

-- Admins/Architect can create any task.
-- Normal users can create personal tasks or team tasks for teams they belong to.
CREATE POLICY "tasks_insert_policy"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_architect()
  OR (
    created_by = auth.uid()
    AND (
      -- Personal task: creator creates for themselves
      (
        assigned_team_id IS NULL
        AND (assigned_user_id IS NULL OR assigned_user_id = auth.uid())
        AND (owner_user_id IS NULL OR owner_user_id = auth.uid())
      )
      OR
      -- Team task: member creates for their team (pool task or self-owned)
      (
        assigned_team_id IS NOT NULL
        AND public.is_team_member(assigned_team_id)
        AND (owner_user_id IS NULL OR owner_user_id = auth.uid() OR public.is_team_leader(assigned_team_id))
      )
    )
  )
);

-- 1. Admin/Architect: system-wide task management
CREATE POLICY "tasks_update_admin_architect"
ON public.tasks
FOR UPDATE
TO authenticated
USING (public.is_admin_or_architect())
WITH CHECK (public.is_admin_or_architect());

-- 2. Team Leader: manage own-team tasks, assign/reassign assigned_user_id to NULL or to a user who
-- belongs to that same assigned_team_id, keep ownership within the same team, keep assigned_team_id
-- and created_by unchanged, and update permitted normal task fields.
-- Compares existing row via internal SECURITY DEFINER helpers to avoid RLS self-recursion.
-- Cannot assign outside their team, cannot move task to another team, never gain system-wide control.
CREATE POLICY "tasks_update_team_leader"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assigned_team_id IS NOT NULL
  AND public.is_team_leader(assigned_team_id)
)
WITH CHECK (
  assigned_team_id IS NOT NULL
  AND public.is_team_leader(assigned_team_id)
  AND assigned_team_id = internal.get_task_team_id(id)
  AND (created_by IS NOT DISTINCT FROM internal.get_task_created_by(id))
  AND (assigned_user_id IS NULL OR public.is_user_in_team(assigned_user_id, assigned_team_id))
  AND (owner_user_id IS NULL OR public.is_user_in_team(owner_user_id, assigned_team_id))
);

-- 3. Member / User: normal task operations on allowed tasks
-- Can claim an unowned team task, update their own claimed/personal task, update title/description/status/priority.
-- Compares existing row via internal SECURITY DEFINER helpers to avoid RLS self-recursion.
-- Cannot assign task to another user, move to another team, change created_by, or take another's personal task.
CREATE POLICY "tasks_update_member_operations"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  -- Personal task: only the owner/creator/assignee
  (
    assigned_team_id IS NULL
    AND (
      owner_user_id = auth.uid()
      OR (owner_user_id IS NULL AND (created_by = auth.uid() OR assigned_user_id = auth.uid()))
    )
  )
  OR
  -- Team task: team member claiming an unowned task OR already owning the task
  (
    assigned_team_id IS NOT NULL
    AND public.is_team_member(assigned_team_id)
    AND (owner_user_id IS NULL OR owner_user_id = auth.uid())
  )
)
WITH CHECK (
  -- Personal task: cannot attach to a team, alter creator, or reassign to another user
  (
    assigned_team_id IS NULL
    AND internal.get_task_team_id(id) IS NULL
    AND (created_by IS NOT DISTINCT FROM internal.get_task_created_by(id))
    AND (assigned_user_id IS NOT DISTINCT FROM internal.get_task_assigned_user_id(id))
    AND (owner_user_id = auth.uid() OR (owner_user_id IS NULL AND internal.get_task_owner_user_id(id) IS NULL))
  )
  OR
  -- Team task: member claiming unowned task or updating their claimed task
  -- Cannot move to another team, alter creator, or assign to another user
  (
    assigned_team_id IS NOT NULL
    AND assigned_team_id = internal.get_task_team_id(id)
    AND public.is_team_member(assigned_team_id)
    AND (created_by IS NOT DISTINCT FROM internal.get_task_created_by(id))
    AND (assigned_user_id IS NOT DISTINCT FROM internal.get_task_assigned_user_id(id))
    AND owner_user_id = auth.uid()
  )
);

-- Deletion: Admin/Architect, personal task creators, or Team Leaders for team tasks
CREATE POLICY "tasks_delete_policy"
ON public.tasks
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_architect()
  OR (created_by = auth.uid() AND assigned_team_id IS NULL)
  OR (assigned_team_id IS NOT NULL AND public.is_team_leader(assigned_team_id))
);

-- =============================================================================
-- 6. Table: public.conversations Policies
-- =============================================================================

-- Team conversations: viewable by team members, Admins, and Architect.
-- Direct User-to-User conversations: viewable ONLY by participants OR the Architect.
-- ADMINS ARE STRICTLY EXCLUDED FROM DIRECT CONVERSATIONS.
CREATE POLICY "conversations_select_policy"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  (conversation_type = 'DIRECT' AND (public.is_conversation_member(id) OR public.is_architect()))
  OR
  (conversation_type = 'TEAM' AND (public.is_admin_or_architect() OR public.is_team_member(team_id)))
);

-- Direct conversations created by participants; Team conversations created by Admins/Architect/Team Leaders.
CREATE POLICY "conversations_insert_policy"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    (conversation_type = 'DIRECT' AND team_id IS NULL)
    OR
    (conversation_type = 'TEAM' AND (public.is_admin_or_architect() OR public.is_team_leader(team_id)))
  )
);

-- Updating conversations: Direct (participants/Architect), Team (Admins/Architect/Team Leaders).
CREATE POLICY "conversations_update_policy"
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  (conversation_type = 'DIRECT' AND (public.is_conversation_member(id) OR public.is_architect()))
  OR
  (conversation_type = 'TEAM' AND (public.is_admin_or_architect() OR public.is_team_leader(team_id)))
);

-- Deletion: Direct (Architect only), Team (Admins/Architect/Team Leaders).
CREATE POLICY "conversations_delete_policy"
ON public.conversations
FOR DELETE
TO authenticated
USING (
  (conversation_type = 'DIRECT' AND public.is_architect())
  OR
  (conversation_type = 'TEAM' AND (public.is_admin_or_architect() OR public.is_team_leader(team_id)))
);

-- =============================================================================
-- 7. Table: public.conversation_members Policies & Concurrency Invariant
-- =============================================================================

-- Participants and Architect can view membership.
-- Admins can only view memberships for TEAM conversations.
CREATE POLICY "conv_members_select_policy"
ON public.conversation_members
FOR SELECT
TO authenticated
USING (
  public.is_architect()
  OR user_id = auth.uid()
  OR (
    public.is_conversation_member(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (c.conversation_type = 'DIRECT' OR public.is_team_member(c.team_id) OR public.is_admin_or_architect())
    )
  )
  OR (
    public.is_admin_or_architect()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.conversation_type = 'TEAM'
    )
  )
);

-- Strict insertion:
-- 1. DIRECT conversation: strictly User-to-User.
-- Creator can add only self and the single intended other participant.
-- Architect retains read/governance access via SELECT policies, but CANNOT turn a DIRECT
-- conversation into a multi-user channel.
-- Admin is strictly excluded from DIRECT conversations.
-- 2. TEAM conversation: Admins, Team Leaders, or eligible team members joining their own team's conversation.
CREATE POLICY "conv_members_insert_policy"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- 1. DIRECT conversation: strictly User-to-User
  (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.conversation_type = 'DIRECT'
        AND (c.created_by = auth.uid() OR public.is_architect())
    )
    AND (
      user_id = auth.uid()
      OR (
        user_id <> auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversation_members.conversation_id
            AND cm.user_id <> auth.uid()
        )
      )
    )
  )
  OR
  -- 2. TEAM conversation: Admins, Team Leaders, or members of that specific team
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.conversation_type = 'TEAM'
      AND (
        public.is_admin_or_architect()
        OR public.is_team_leader(c.team_id)
        OR (user_id = auth.uid() AND public.is_team_member(c.team_id))
      )
  )
);

-- Transaction-safe database trigger enforcing the strictly two-member invariant on DIRECT conversations.
-- Serializes concurrent membership additions by acquiring an exclusive row-level lock on the parent conversation.
DROP TRIGGER IF EXISTS trg_enforce_direct_conversation_member_limit ON public.conversation_members;
CREATE TRIGGER trg_enforce_direct_conversation_member_limit
BEFORE INSERT OR UPDATE ON public.conversation_members
FOR EACH ROW
EXECUTE FUNCTION internal.enforce_direct_conversation_member_limit();

-- Members can only update their own row (e.g. updating last_read_at)
CREATE POLICY "conv_members_update_own"
ON public.conversation_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Leaving a conversation or removal by leader/admin
CREATE POLICY "conv_members_delete_policy"
ON public.conversation_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_architect()
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.conversation_type = 'TEAM'
      AND (public.is_admin_or_architect() OR public.is_team_leader(c.team_id))
  )
);

-- =============================================================================
-- 8. Table: public.messages Policies
-- =============================================================================

-- Direct messages: readable ONLY by conversation participants OR the Architect.
-- ADMINS CANNOT READ DIRECT MESSAGES.
-- Team messages: readable by team members, Admins, and Architect.
CREATE POLICY "messages_select_policy"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND (
      (c.conversation_type = 'DIRECT' AND (public.is_conversation_member(c.id) OR public.is_architect()))
      OR
      (c.conversation_type = 'TEAM' AND (public.is_admin_or_architect() OR public.is_team_member(c.team_id)))
    )
  )
);

-- Sender can insert a message if they are an active member of the conversation
CREATE POLICY "messages_insert_member"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_member(conversation_id)
);

-- Authors can edit their own messages; Architect has governance edit rights
CREATE POLICY "messages_update_policy"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  sender_id = auth.uid()
  OR public.is_architect()
);

-- Authors or Architect can delete/soft-delete messages
CREATE POLICY "messages_delete_policy"
ON public.messages
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid()
  OR public.is_architect()
);

-- =============================================================================
-- 9. Table: public.approval_requests Policies
-- =============================================================================

-- Requesters, targets, team leaders, Admins, and Architect can view relevant approvals
CREATE POLICY "approvals_select_policy"
ON public.approval_requests
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_architect()
  OR requester_id = auth.uid()
  OR target_user_id = auth.uid()
  OR (target_team_id IS NOT NULL AND public.is_team_leader(target_team_id))
);

-- Requesters can submit a new approval request in PENDING state without self-approval
CREATE POLICY "approvals_insert_requester"
ON public.approval_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND status = 'PENDING'
  AND approved_by IS NULL
);

-- Admins / Architect can decide requests (enforcing no self-approval).
-- Requesters can cancel their own pending requests.
CREATE POLICY "approvals_update_policy"
ON public.approval_requests
FOR UPDATE
TO authenticated
USING (
  public.is_admin_or_architect()
  OR (requester_id = auth.uid() AND status = 'PENDING')
)
WITH CHECK (
  (requester_id = auth.uid() AND status = 'CANCELLED')
  OR (
    public.is_admin_or_architect()
    AND (approved_by IS NULL OR approved_by = auth.uid())
    AND (approved_by IS NULL OR approved_by <> requester_id)
  )
);

-- =============================================================================
-- 10. Table: public.notifications Policies
-- =============================================================================

-- Users can only see their own notifications
CREATE POLICY "notifications_select_own"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Notifications are generated exclusively via trusted backend / service-role logic.
-- No direct client INSERT policy is granted to authenticated users.

-- Users can mark their own notifications as read
CREATE POLICY "notifications_update_own"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can remove their own notifications
CREATE POLICY "notifications_delete_own"
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- =============================================================================
-- 11. Table: public.audit_logs Policies
-- =============================================================================

-- ONLY Admins and Architect can view audit logs. Normal users have NO read access.
CREATE POLICY "audit_logs_select_admin_architect"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_admin_or_architect());

-- Audit records are generated exclusively by trusted backend / service-role logic.
-- No direct client INSERT policy is granted to ordinary users to prevent event forgery.
-- NO UPDATE OR DELETE POLICIES: audit_logs is append-only by design.
