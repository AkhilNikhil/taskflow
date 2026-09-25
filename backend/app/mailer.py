import html
import os
import smtplib
import ssl
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


from dotenv import load_dotenv, find_dotenv


def get_smtp_config():
    """Reads SMTP configuration from environment variables."""
    load_dotenv(find_dotenv())
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_SENDER") or user or "notifications@taskflow.local"
    raw_sender_name = os.getenv("SMTP_SENDER_NAME", "TaskFlow")
    # Clean any accidental concatenated text
    sender_name = raw_sender_name.split("\n")[0].split("JWT_")[0].strip() or "TaskFlow"
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "sender": sender,
        "sender_name": sender_name,
    }


def is_smtp_configured():
    config = get_smtp_config()
    return bool(config["user"] and config["password"])


def get_frontend_url():
    """Reads FRONTEND_URL or APP_URL from environment with Render fallback."""
    load_dotenv(find_dotenv())
    return (os.getenv("FRONTEND_URL") or os.getenv("APP_URL") or "https://todo-frontend-v4-1.onrender.com").rstrip("/")


def build_html_email(recipient_name: str, title: str, message: str, event_type: str, cta_url: str = None) -> str:
    """
    Renders a responsive, modern HTML email template matching TaskFlow branding.
    """
    title = html.escape(title or "")
    message = html.escape(message or "")
    recipient_name = html.escape(recipient_name or "")
    cta_url = html.escape(cta_url or get_frontend_url(), quote=True)

    if not cta_url:
        cta_url = get_frontend_url()
    badge_colors = {
        "TASK_ASSIGNED": ("#3b82f6", "#eff6ff", "📌 Task Assignment"),
        "TEAM_INVITE": ("#8b5cf6", "#f5f3ff", "👥 Team Invitation"),
        "MESSAGE": ("#10b981", "#ecfdf5", "💬 Direct Message"),
    }
    accent_color, bg_tint, badge_label = badge_colors.get(
        event_type, ("#3b82f6", "#eff6ff", "🔔 Notification")
    )
    name = recipient_name or "there"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-bottom: 1px solid #334155;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">✓ TaskFlow <span style="font-size: 13px; color: #38bdf8; font-weight: 600; padding: 2px 8px; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); margin-left: 6px;">V4</span></span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; font-weight: 600; color: {accent_color}; background-color: rgba(59, 130, 246, 0.12); padding: 4px 10px; border-radius: 9999px; border: 1px solid rgba(59, 130, 246, 0.25);">
                      {badge_label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #ffffff; line-height: 1.4;">
                {title}
              </h2>
              <p style="margin: 0 0 20px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Hi {name},
              </p>
              <div style="background-color: #0f172a; border-left: 4px solid {accent_color}; border-radius: 6px; padding: 16px 20px; margin-bottom: 28px;">
                <p style="margin: 0; font-size: 14px; color: #e2e8f0; line-height: 1.6;">
                  {message}
                </p>
              </div>

              <!-- Button CTA -->
              <table border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                <tr>
                  <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);">
                    <a href="{cta_url}" target="_blank" style="display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      Open TaskFlow Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0f172a; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                This is an automated notification sent from TaskFlow V4.<br>
                Host: {cta_url}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _send_worker(to_email: str, subject: str, html_content: str, text_content: str = None):
    """
    Background worker that performs the actual SMTP handshake.
    Never raises exceptions back to the caller.
    """
    config = get_smtp_config()
    if not config["user"] or not config["password"]:
        print(f"[Mailer] SMTP credentials missing in environment. Email to {to_email} skipped.")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{config['sender_name']} <{config['sender']}>"
        msg["To"] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        context = ssl.create_default_context()
        with smtplib.SMTP(config["host"], config["port"], timeout=15) as server:
            server.starttls(context=context)
            server.login(config["user"], config["password"])
            server.sendmail(config["sender"], [to_email], msg.as_string())

        print(f"[Mailer] Successfully delivered email to {to_email} via Brevo SMTP ({subject})")
    except Exception as e:
        print(f"[Mailer Error] Failed delivering email to {to_email}: {e}")


def send_notification_email_async(to_email: str, recipient_name: str, title: str, message: str, event_type: str = "NOTIFICATION"):
    """
    Asynchronously fires an email notification in a background thread.
    Zero latency impact on the HTTP request.
    """
    if not to_email:
        return

    subject = " ".join(f"[TaskFlow] {title}".split())
    html = build_html_email(
        recipient_name=recipient_name,
        title=title,
        message=message,
        event_type=event_type
    )
    base_url = get_frontend_url()
    plain_text = f"TaskFlow Notification\n\n{title}\n\n{message}\n\nOpen your dashboard at: {base_url}"

    thread = threading.Thread(
        target=_send_worker,
        args=(to_email, subject, html, plain_text),
        daemon=True
    )
    thread.start()
