import uuid
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import UUID
from app import db


def utc_now():
    """Returns the current UTC timestamp with timezone awareness."""
    return datetime.now(timezone.utc)


class User(db.Model):
    """
    Application user profile matching public.users.
    Primary key 'id' maps directly 1:1 to Supabase auth.users(id).
    """
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=True), primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(100), nullable=True)
    system_role = db.Column(
        db.String(20),
        nullable=False,
        default="USER",
        index=True
    )
    account_status = db.Column(
        db.String(20),
        nullable=False,
        default="ACTIVE",
        index=True
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    team_memberships = db.relationship(
        "TeamMember",
        backref="user",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="TeamMember.user_id"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "email": self.email,
            "display_name": self.display_name,
            "system_role": self.system_role,
            "account_status": self.account_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Team(db.Model):
    """
    Organizational team matching public.teams.
    """
    __tablename__ = "teams"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    active_status = db.Column(
        db.String(20),
        nullable=False,
        default="ACTIVE",
        index=True
    )
    created_by = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    members = db.relationship(
        "TeamMember",
        backref="team",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="TeamMember.team_id"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "active_status": self.active_status,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TeamMember(db.Model):
    """
    Junction table mapping users to teams matching public.team_members.
    """
    __tablename__ = "team_members"
    __table_args__ = (
        db.UniqueConstraint("team_id", "user_id", name="uq_team_member"),
    )

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    team_role = db.Column(
        db.String(20),
        nullable=False,
        default="MEMBER",
        index=True
    )
    joined_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "team_id": str(self.team_id),
            "user_id": str(self.user_id),
            "team_role": self.team_role,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
        }


class Task(db.Model):
    """
    V4 task model matching public.tasks.
    """
    __tablename__ = "tasks"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    priority = db.Column(
        db.String(20),
        nullable=False,
        default="MEDIUM",
        index=True
    )
    status = db.Column(
        db.String(20),
        nullable=False,
        default="PENDING",
        index=True
    )
    created_by = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    assigned_user_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    assigned_team_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    owner_user_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    due_date = db.Column(db.Date, nullable=True, index=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
            "created_by": str(self.created_by) if self.created_by else None,
            "assigned_user_id": str(self.assigned_user_id) if self.assigned_user_id else None,
            "assigned_team_id": str(self.assigned_team_id) if self.assigned_team_id else None,
            "owner_user_id": str(self.owner_user_id) if self.owner_user_id else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Conversation(db.Model):
    """
    V4 conversation channel for team chat and direct messaging.
    """
    __tablename__ = "conversations"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_type = db.Column(db.String(20), nullable=False, default="DIRECT")
    team_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    created_by = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    dm_status = db.Column(db.String(20), nullable=False, default="ACCEPTED", server_default="ACCEPTED")
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False
    )

    team = db.relationship("Team", backref="conversations", lazy=True)
    creator = db.relationship("User", backref="created_conversations", foreign_keys=[created_by], lazy=True)
    members = db.relationship(
        "ConversationMember",
        backref="conversation",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="ConversationMember.conversation_id"
    )
    messages = db.relationship(
        "Message",
        backref="conversation",
        lazy=True,
        cascade="all, delete-orphan",
        foreign_keys="Message.conversation_id",
        order_by="Message.created_at.asc()"
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "conversation_type": self.conversation_type,
            "team_id": str(self.team_id) if self.team_id else None,
            "team_name": self.team.name if self.team else None,
            "created_by": str(self.created_by) if self.created_by else None,
            "dm_status": self.dm_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ConversationMember(db.Model):
    """
    Junction table for users in a conversation.
    """
    __tablename__ = "conversation_members"
    __table_args__ = (
        db.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_member"),
    )

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    joined_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
    last_read_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True
    )

    user = db.relationship(
        "User",
        backref=db.backref("conversation_memberships", cascade="all, delete-orphan"),
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "conversation_id": str(self.conversation_id),
            "user_id": str(self.user_id),
            "email": self.user.email if self.user else None,
            "display_name": self.user.display_name if self.user else None,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "last_read_at": self.last_read_at.isoformat() if self.last_read_at else None,
        }


class Message(db.Model):
    """
    Individual chat messages in a conversation.
    """
    __tablename__ = "messages"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    sender_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    content = db.Column(db.Text, nullable=False)
    is_edited = db.Column(db.Boolean, default=False, nullable=False)
    edited_at = db.Column(db.DateTime(timezone=True), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )

    sender = db.relationship("User", backref="sent_messages", foreign_keys=[sender_id], lazy=True)

    def to_dict(self):
        return {
            "id": str(self.id),
            "conversation_id": str(self.conversation_id),
            "sender_id": str(self.sender_id) if self.sender_id else None,
            "sender_name": self.sender.display_name if self.sender else None,
            "sender_email": self.sender.email if self.sender else None,
            "content": self.content if not self.is_deleted else "[This message was deleted]",
            "is_edited": self.is_edited,
            "edited_at": self.edited_at.isoformat() if self.edited_at else None,
            "is_deleted": self.is_deleted,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Notification(db.Model):
    """
    Persistent in-app notification model matching public.notifications.
    """
    __tablename__ = "notifications"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    event_type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    related_task_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True
    )
    related_team_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True
    )
    related_conversation_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True
    )
    is_read = db.Column(db.Boolean, default=False, nullable=False, index=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True
    )

    user = db.relationship(
        "User",
        backref=db.backref("notifications", cascade="all, delete-orphan"),
        foreign_keys=[user_id],
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "event_type": self.event_type,
            "title": self.title,
            "message": self.message,
            "related_task_id": str(self.related_task_id) if self.related_task_id else None,
            "related_team_id": str(self.related_team_id) if self.related_team_id else None,
            "related_conversation_id": str(self.related_conversation_id) if self.related_conversation_id else None,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }