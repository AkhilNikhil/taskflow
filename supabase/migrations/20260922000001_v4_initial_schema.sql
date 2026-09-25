-- V4 Initial Database Schema
-- Standard Supabase Migration: 20260922000001_v4_initial_schema.sql
-- Targets: Supabase PostgreSQL (Managed by Supabase CLI / migrations)

-- Ensure standard cryptographic functions are available for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Table: public.users
-- Profiles table extending Supabase auth.users (1:1 relationship)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    system_role VARCHAR(20) NOT NULL DEFAULT 'USER',
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_system_role CHECK (system_role IN ('ARCHITECT', 'ADMIN', 'USER')),
    CONSTRAINT chk_user_account_status CHECK (account_status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_system_role ON public.users(system_role);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON public.users(account_status);

-- -----------------------------------------------------------------------------
-- 2. Table: public.teams
-- Organizational teams within the system
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_team_active_status CHECK (active_status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_teams_name ON public.teams(name);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON public.teams(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_active_status ON public.teams(active_status);

-- -----------------------------------------------------------------------------
-- 3. Table: public.team_members
-- Junction table associating users with teams and team-specific roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    team_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_team_member UNIQUE (team_id, user_id),
    CONSTRAINT chk_team_role CHECK (team_role IN ('LEADER', 'MEMBER'))
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members(team_id, team_role);

-- -----------------------------------------------------------------------------
-- 4. Table: public.tasks
-- Supports personal tasks, individual assignments, and team assignments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_task_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT chk_task_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_task_assignment_exclusivity CHECK (
        NOT (assigned_user_id IS NOT NULL AND assigned_team_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON public.tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_team ON public.tasks(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_user ON public.tasks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);

-- -----------------------------------------------------------------------------
-- 5. Table: public.conversations
-- Direct (1-on-1) and team communication channels
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_type VARCHAR(20) NOT NULL,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_conversation_type CHECK (conversation_type IN ('DIRECT', 'TEAM')),
    CONSTRAINT chk_conversation_team_binding CHECK (
        conversation_type = 'TEAM'
        OR (conversation_type = 'DIRECT' AND team_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON public.conversations(team_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON public.conversations(created_by);

-- -----------------------------------------------------------------------------
-- 6. Table: public.conversation_members
-- Associates users with conversations and tracks read position
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ,
    CONSTRAINT uq_conversation_member UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_conv_id ON public.conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_user_id ON public.conversation_members(user_id);

-- -----------------------------------------------------------------------------
-- 7. Table: public.messages
-- Individual messages within a conversation with edit/delete tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

-- -----------------------------------------------------------------------------
-- 8. Table: public.approval_requests
-- Explicit governance approval gates for sensitive operations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    reason TEXT,
    target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    target_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    target_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewer_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_approval_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT chk_no_self_approval CHECK (approved_by IS NULL OR approved_by <> requester_id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_requester ON public.approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approved_by ON public.approval_requests(approved_by);
CREATE INDEX IF NOT EXISTS idx_approvals_target_user ON public.approval_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_approvals_target_team ON public.approval_requests(target_team_id);
CREATE INDEX IF NOT EXISTS idx_approvals_target_task ON public.approval_requests(target_task_id);

-- -----------------------------------------------------------------------------
-- 9. Table: public.notifications
-- Persistent system notifications with relational references and read tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    related_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    related_approval_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
    related_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- -----------------------------------------------------------------------------
-- 10. Table: public.audit_logs
-- Immutable append-only audit trail for administrative, security, and governance events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
