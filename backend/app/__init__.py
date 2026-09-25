import os

from dotenv import load_dotenv, find_dotenv
from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from sqlalchemy import event, text

load_dotenv(find_dotenv())

db = SQLAlchemy()

SCHEMA_LOCK_ID = 727272  # arbitrary constant shared by all workers


def _sync_schema(app):
    """Create/patch tables. Serialized across workers with an advisory lock."""
    if os.getenv("RUN_SCHEMA_SYNC", "true").lower() != "true":
        return
    with app.app_context():
        try:
            with db.engine.begin() as conn:
                # Held until this transaction ends, so only one worker migrates at a time.
                conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": SCHEMA_LOCK_ID})
                conn.execute(text("SET search_path TO public, extensions;"))

                col_type = conn.execute(text("""
                    SELECT data_type FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
                """)).scalar()

                if col_type and col_type.lower() in ("integer", "bigint", "smallint"):
                    # NEVER auto-drop user data. Migrate manually instead.
                    app.logger.error(
                        "public.users.id is an integer (legacy V3 schema). "
                        "Refusing to drop tables automatically. Migrate the schema manually."
                    )
                    return

                conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto;"))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS public.users (
                        id UUID PRIMARY KEY,
                        email VARCHAR(255) NOT NULL UNIQUE,
                        display_name VARCHAR(100),
                        system_role VARCHAR(20) NOT NULL DEFAULT 'USER',
                        account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );
                """))

                from app import models  # noqa: F401  (registers tables in metadata)
                db.create_all()

                for ddl in (
                    "ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)",
                    "ADD COLUMN IF NOT EXISTS system_role VARCHAR(20) NOT NULL DEFAULT 'USER'",
                    "ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'",
                    "ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP",
                    "ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP",
                ):
                    conn.execute(text(f"ALTER TABLE IF EXISTS public.users {ddl};"))

                conn.execute(text("ALTER TABLE IF EXISTS public.tasks ADD COLUMN IF NOT EXISTS due_date DATE;"))
                conn.execute(text(
                    "ALTER TABLE IF EXISTS public.conversations "
                    "ADD COLUMN IF NOT EXISTS dm_status VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED';"
                ))
        except Exception as e:
            app.logger.warning(f"Database schema auto-sync notice: {e}")


def create_app():
    app = Flask(__name__)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    # Fail fast, same as DATABASE_URL: there is no hardcoded fallback email
    # anymore, so a missing value here would otherwise mean nobody ever
    # becomes ARCHITECT and the Architect Panel is unreachable.
    if not os.getenv("ROOT_ARCHITECT_EMAIL"):
        raise RuntimeError(
            "ROOT_ARCHITECT_EMAIL environment variable is not set. "
            "Set it to the email that should become the super-admin (Architect) on first signup."
        )

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True, "pool_recycle": 300}

    db.init_app(app)

    origins = [o.strip() for o in (os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_URL") or "").split(",") if o.strip()]
    if not origins:
        app.logger.warning("CORS_ORIGINS/FRONTEND_URL not set: allowing all origins. Set it in production.")
    CORS(app, origins=origins or "*")

    # Make sure public.users (not auth.users) is resolved on every new connection.
    with app.app_context():
        @event.listens_for(db.engine, "connect")
        def set_search_path(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("SET search_path TO public, extensions;")
            cursor.close()

    _sync_schema(app)

    from app.auth import auth_bp
    from app.teams import teams_bp
    from app.tasks import tasks_bp
    from app.admin import admin_bp
    from app.conversations import conversations_bp
    from app.notifications import notifications_bp

    for bp in (auth_bp, teams_bp, tasks_bp, admin_bp, conversations_bp, notifications_bp):
        app.register_blueprint(bp)

    @app.errorhandler(500)
    def internal_error(_e):
        db.session.rollback()
        return jsonify({"message": "Internal server error"}), 500

    @app.route("/")
    def home():
        return {"message": "Todo API is running"}

    @app.route("/health")
    @app.route("/ping")
    @app.route("/api/health")
    def health():
        return {"status": "healthy"}, 200

    return app