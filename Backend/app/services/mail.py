"""Outbound mail adapter — console/log for local development."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from app.core.config import Settings, get_settings

logger = logging.getLogger("thos.mail")


@dataclass(frozen=True)
class OutboundMessage:
    to_email: str
    subject: str
    body: str


class MailAdapter(Protocol):
    async def send(self, message: OutboundMessage) -> None: ...


class ConsoleMailAdapter:
    """Records outbound mail in process logs (and returns for tests)."""

    def __init__(self) -> None:
        self.sent: list[OutboundMessage] = []

    async def send(self, message: OutboundMessage) -> None:
        self.sent.append(message)
        logger.info(
            "mail to=%s subject=%s\n%s",
            message.to_email,
            message.subject,
            message.body,
        )


# Shared console adapter so every send in this process lands in one log.
_console_adapter = ConsoleMailAdapter()


class SMTPMailAdapter:
    """Sends outbound mail using SMTP."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.host = self.settings.smtp_host or "localhost"
        self.port = self.settings.smtp_port or 587
        self.user = self.settings.smtp_user
        self.password = (
            self.settings.smtp_password.get_secret_value()
            if self.settings.smtp_password
            else None
        )
        self.from_email = self.settings.smtp_from_email or "noreply@thos.local"

    async def send(self, message: OutboundMessage) -> None:
        msg = EmailMessage()
        msg.set_content(message.body)
        msg["Subject"] = message.subject
        msg["From"] = self.from_email
        msg["To"] = message.to_email

        try:
            await aiosmtplib.send(
                msg,
                hostname=self.host,
                port=self.port,
                username=self.user,
                password=self.password,
                start_tls=self.port == 587,
            )
            logger.info("Sent email to %s", message.to_email)
        except Exception as e:
            logger.error("Failed to send email to %s: %s", message.to_email, str(e))


def get_mail_adapter(settings: Settings | None = None) -> MailAdapter:
    settings = settings or get_settings()
    if settings.smtp_host:
        return SMTPMailAdapter(settings)
    return _console_adapter


async def send_staff_credentials(
    *,
    to_email: str,
    display_name: str,
    organization_name: str,
    role: str,
    temporary_password: str,
    login_url: str = "http://localhost:3000/login",
    settings: Settings | None = None,
) -> None:
    adapter = get_mail_adapter(settings)
    await adapter.send(
        OutboundMessage(
            to_email=to_email,
            subject=f"Your {organization_name} THOS account",
            body=(
                f"Hello {display_name},\n\n"
                f"An administrator created a THOS account for you at {organization_name}.\n"
                f"Role: {role.replace('_', ' ')}\n"
                f"Email: {to_email}\n"
                f"Temporary password: {temporary_password}\n\n"
                f"Sign in at {login_url} and change your password after first login.\n"
            ),
        )
    )

async def send_interview_link(
    *,
    to_email: str,
    candidate_name: str,
    job_title: str,
    organization_name: str,
    interview_url: str,
    settings: Settings | None = None,
) -> None:
    adapter = get_mail_adapter(settings)
    await adapter.send(
        OutboundMessage(
            to_email=to_email,
            subject=f"Interview Request: {job_title} at {organization_name}",
            body=(
                f"Hello {candidate_name},\n\n"
                f"We would like to invite you to an interview for the {job_title} "
                f"position at {organization_name}.\n\n"
                f"Please use the following link to access your interview:\n{interview_url}\n\n"
                f"Best regards,\nThe {organization_name} Team"
            )
        )
    )

async def send_company_decision(
    *,
    to_email: str,
    candidate_name: str,
    job_title: str,
    organization_name: str,
    decision: str,
    message: str,
    settings: Settings | None = None,
) -> None:
    adapter = get_mail_adapter(settings)
    await adapter.send(
        OutboundMessage(
            to_email=to_email,
            subject=f"Update on your application: {job_title} at {organization_name}",
            body=(
                f"Hello {candidate_name},\n\n"
                f"Here is an update regarding your application for the {job_title} "
                f"position at {organization_name}.\n\n"
                f"Decision: {decision}\n\n"
                f"{message}\n\n"
                f"Best regards,\nThe {organization_name} Team"
            )
        )
    )
