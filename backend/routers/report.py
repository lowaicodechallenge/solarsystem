import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, WorkoutSession, User
from services.upstage_service import generate_weekly_report

router = APIRouter(prefix="/api/report", tags=["report"])


class WeeklyReportRequest(BaseModel):
    user_id: str
    period_days: int = 7
    symptoms: str = ""
    risk_tags: list[str] = []
    posture_scores: dict = {}  # {"front": 78, "side": 65} — 프론트 localStorage 기반
    gcal_session_count: int = 0  # Google Calendar 이벤트 수 (프론트에서 직접 조회)


def _build_stats(sessions: list[WorkoutSession], period_days: int) -> dict:
    if not sessions:
        return {
            "period_days": period_days,
            "session_count": 0,
            "avg_score": 0.0,
            "best_score": 0.0,
            "worst_score": 0.0,
            "score_trend": "데이터 부족",
            "exercise_breakdown": {},
        }

    scores = [s.avg_score for s in sessions]
    # sessions는 created_at 내림차순 → 시간순(오래된→최신)으로 추세 판단
    chrono = list(reversed(sessions))
    if len(chrono) >= 2:
        half = len(chrono) // 2
        early = sum(s.avg_score for s in chrono[:half]) / max(half, 1)
        late = sum(s.avg_score for s in chrono[half:]) / max(len(chrono) - half, 1)
        diff = late - early
        trend = "상승" if diff > 3 else ("하락" if diff < -3 else "유지")
    else:
        trend = "데이터 부족"

    breakdown: dict[str, int] = {}
    for s in sessions:
        breakdown[s.exercise_type] = breakdown.get(s.exercise_type, 0) + 1

    return {
        "period_days": period_days,
        "session_count": len(sessions),
        "avg_score": sum(scores) / len(scores),
        "best_score": max(scores),
        "worst_score": min(scores),
        "score_trend": trend,
        "exercise_breakdown": breakdown,
    }


@router.post("/weekly")
async def weekly_report(req: WeeklyReportRequest, db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=req.period_days)
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == req.user_id)
        .where(WorkoutSession.created_at >= since)
        .order_by(WorkoutSession.created_at.desc())
    )
    sessions = list(result.scalars().all())

    symptoms = req.symptoms
    if not symptoms:
        user = await db.get(User, req.user_id)
        symptoms = user.symptoms if user else ""

    stats = _build_stats(sessions, req.period_days)
    stats["gcal_session_count"] = req.gcal_session_count
    report = await generate_weekly_report(
        stats=stats,
        symptoms=symptoms,
        risk_tags=req.risk_tags,
        posture_scores=req.posture_scores,
    )

    return {
        "stats": stats,
        "report": report,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


class SendReportEmailRequest(BaseModel):
    email: str
    stats: dict
    report: dict
    generated_at: str


def _score_color(score: float) -> str:
    if score >= 80:
        return "#22c55e"
    if score >= 60:
        return "#f59e0b"
    return "#ef4444"


def _build_report_html(stats: dict, report: dict, generated_at: str) -> str:
    total = stats.get("session_count", 0) + stats.get("gcal_session_count", 0)
    avg = stats.get("avg_score", 0)
    trend_map = {"상승": "▲ 상승", "하락": "▼ 하락", "유지": "→ 유지", "데이터 부족": "– 데이터 부족"}
    trend_label = trend_map.get(stats.get("score_trend", ""), stats.get("score_trend", ""))

    achievements = "".join(
        f"<li style='margin:4px 0;color:#166534;'>✓ {a}</li>"
        for a in report.get("achievements", [])
    )
    improvements = "".join(
        f"<li style='margin:4px 0;color:#92400e;'>! {i}</li>"
        for i in report.get("improvements", [])
    )
    focus = "".join(
        f"<li style='margin:4px 0;color:#1e40af;'>→ {f}</li>"
        for f in report.get("next_week_focus", [])
    )
    caution_block = (
        f"<div style='margin-top:16px;padding:12px 16px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;'>"
        f"<p style='margin:0;color:#991b1b;font-size:13px;'>⚠️ {report['caution']}</p></div>"
        if report.get("caution") else ""
    )

    try:
        dt = datetime.fromisoformat(generated_at)
        dt_str = dt.astimezone(timezone(timedelta(hours=9))).strftime("%Y년 %m월 %d일 %H:%M KST")
    except Exception:
        dt_str = generated_at

    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#1d00a5,#4a3aff);padding:32px 36px;">
        <p style="margin:0 0 4px;color:#dad7ff;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Weekly Report</p>
        <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">주간 리포트</h1>
        <p style="margin:8px 0 0;color:#dad7ff;font-size:13px;">최근 {stats.get('period_days', 7)}일간 운동·자세 데이터 분석 결과입니다.</p>
      </td></tr>

      <!-- Headline -->
      <tr><td style="padding:28px 36px 0;">
        <p style="margin:0;padding:16px 20px;background:#eef2ff;border-left:4px solid #4a3aff;border-radius:4px;color:#1e1b4b;font-size:15px;font-weight:600;line-height:1.5;">{report.get('headline', '')}</p>
      </td></tr>

      <!-- Stats -->
      <tr><td style="padding:24px 36px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="25%" align="center" style="padding:12px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">운동 횟수</p>
              <p style="margin:0;font-size:32px;font-weight:700;color:#111827;">{total}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">최근 {stats.get('period_days', 7)}일</p>
            </td>
            <td width="4%"></td>
            <td width="25%" align="center" style="padding:12px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">평균 점수</p>
              <p style="margin:0;font-size:32px;font-weight:700;color:{_score_color(avg)};">{avg:.0f}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">/100</p>
            </td>
            <td width="4%"></td>
            <td width="25%" align="center" style="padding:12px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">점수 추세</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#374151;">{trend_label}</p>
            </td>
            <td width="4%"></td>
            <td width="25%" align="center" style="padding:12px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">최고 / 최저</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#374151;">{stats.get('best_score', 0):.0f} / {stats.get('worst_score', 0):.0f}</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Summary -->
      <tr><td style="padding:24px 36px 0;">
        <h2 style="margin:0 0 10px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">종합 평가</h2>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">{report.get('summary', '')}</p>
        {caution_block}
      </td></tr>

      <!-- 3 columns -->
      <tr><td style="padding:24px 36px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32%" valign="top" style="padding:16px;background:#f0fdf4;border-radius:8px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;">잘한 점</p>
              <ul style="margin:0;padding-left:0;list-style:none;font-size:13px;">{achievements or "<li style='color:#6b7280;'>데이터 없음</li>"}</ul>
            </td>
            <td width="2%"></td>
            <td width="32%" valign="top" style="padding:16px;background:#fffbeb;border-radius:8px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;">개선할 점</p>
              <ul style="margin:0;padding-left:0;list-style:none;font-size:13px;">{improvements or "<li style='color:#6b7280;'>데이터 없음</li>"}</ul>
            </td>
            <td width="2%"></td>
            <td width="32%" valign="top" style="padding:16px;background:#eff6ff;border-radius:8px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;">다음 주 집중</p>
              <ul style="margin:0;padding-left:0;list-style:none;font-size:13px;">{focus or "<li style='color:#6b7280;'>데이터 없음</li>"}</ul>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 36px 32px;">
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;"/>
        <p style="margin:0;font-size:11px;color:#9ca3af;">생성 시각: {dt_str}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">본 리포트는 참고용이며 의료적 처방을 대체하지 않습니다. 통증 발생 시 즉시 중단하고 전문가와 상담하세요.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>"""


@router.post("/send-email")
async def send_report_email(req: SendReportEmailRequest):
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        raise HTTPException(status_code=500, detail="SMTP 설정이 없습니다. backend/.env에 SMTP_USER, SMTP_PASSWORD를 추가해주세요.")

    try:
        dt = datetime.fromisoformat(req.generated_at)
        date_str = dt.astimezone(timezone(timedelta(hours=9))).strftime("%Y.%m.%d")
    except Exception:
        date_str = req.generated_at[:10]

    html = _build_report_html(req.stats, req.report, req.generated_at)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"솔메이트 주간 리포트 — {date_str}"
    msg["From"] = f"솔메이트 <{smtp_user}>"
    msg["To"] = req.email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, req.email, msg.as_string())
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=500, detail="SMTP 인증 실패. 앱 비밀번호를 확인해주세요.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"메일 발송 실패: {e}")

    return {"status": "sent"}
