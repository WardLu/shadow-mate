#!/usr/bin/env python3
"""Sync local Supabase Auth email templates/subjects to the shared production project.

The repo copy under supabase/templates/ plus the subjects in supabase/config.toml
is the single source of truth; hosted templates are project config, not DB
migrations, so committing does not deploy them (see docs/internal/auth-setup.md).

Usage (run from repo root, token from supabase.com/dashboard/account/tokens):
  export SUPABASE_ACCESS_TOKEN=...        # or pass via --token
  python3 scripts/sync-auth-email-templates.py            # dry run: show plan
  python3 scripts/sync-auth-email-templates.py --apply    # backup then PATCH
  python3 scripts/sync-auth-email-templates.py --apply --restore <backup.json>
"""

import argparse
import ipaddress
import json
import os
import pathlib
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT_REF = "dutepjyocxcvecmsrtfp"
API_HOST = "api.supabase.com"
API_URL = f"https://{API_HOST}/v1/projects/{PROJECT_REF}/config/auth"
ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "supabase" / "templates"
CONFIG_PATH = ROOT / "supabase" / "config.toml"
TEMPLATE_TYPES = [
    "confirmation",
    "magic_link",
    "recovery",
    "invite",
    "email_change",
    "reauthentication",
]
BRAND_OLD = "Shadow Nexus"
BRAND_NEW = "Shadow Lab"

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    # 固定端点不接受跳转:3xx 视为错误而非跟随
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(_NoRedirect)


def assert_safe_endpoint() -> None:
    """请求前校验:仅 https、主机在白名单、解析结果不为私有/环回/保留地址。"""
    parsed = urllib.parse.urlparse(API_URL)
    if parsed.scheme != "https":
        sys.exit("拒绝发起非 HTTPS 请求")
    if parsed.hostname != API_HOST:
        sys.exit(f"目标主机不在白名单: {parsed.hostname}")
    for info in socket.getaddrinfo(API_HOST, 443, proto=socket.IPPROTO_TCP):
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            sys.exit(f"主机解析到受限地址,拒绝请求: {ip}")


def local_subjects() -> dict:
    subjects = {}
    section = None
    for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
        header = re.match(r"\[auth\.email\.template\.(\w+)\]", line.strip())
        if header:
            section = header.group(1)
            continue
        subject = re.match(r"^subject = '(.*)'$", line.strip())
        if subject and section:
            subjects[section] = subject.group(1)
    return subjects


def api_call(token: str, payload=None):
    assert_safe_endpoint()
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="PATCH" if payload is not None else "GET",
    )
    try:
        with OPENER.open(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"Management API {error.code}: {error.read().decode('utf-8', 'replace')[:400]}")


def local_subjects_guard(subjects: dict) -> None:
    missing = [t for t in TEMPLATE_TYPES if t not in subjects]
    if missing:
        sys.exit(f"config.toml 缺少 subject 段: {missing}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="PATCH the hosted config (default: dry run)")
    parser.add_argument("--token", default="", help="Supabase personal access token (env SUPABASE_ACCESS_TOKEN also works)")
    parser.add_argument("--restore", default="", help="Restore (PATCH) a previously saved backup JSON instead of syncing")
    args = parser.parse_args()

    token = args.token or os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        sys.exit("需要 SUPABASE_ACCESS_TOKEN:在 supabase.com/dashboard/account/tokens 生成后 export 或用 --token 传入")

    current = api_call(token)

    if args.restore:
        backup = json.loads(pathlib.Path(args.restore).read_text(encoding="utf-8"))
        restored = api_call(token, backup)
        print("已回滚。验证:", json.dumps({
            "smtp_sender_name": restored.get("smtp_sender_name"),
            "confirmation_has_old_brand": BRAND_OLD in (restored.get("mailer_templates_confirmation_content") or ""),
        }, ensure_ascii=False))
        return

    subjects = local_subjects()
    local_subjects_guard(subjects)
    bodies = {t: (TEMPLATE_DIR / f"{t}.html").read_text(encoding="utf-8") for t in TEMPLATE_TYPES}
    stale = [t for t, body in bodies.items() if BRAND_OLD in body]
    if stale:
        sys.exit(f"本地模板仍含旧品牌 {BRAND_OLD}: {stale},先完成仓库侧改名再同步")

    payload = {"smtp_sender_name": BRAND_NEW}
    print(f"项目 {PROJECT_REF} 同步计划(dry-run={'是' if not args.apply else '否'}):")
    print(f"  smtp_sender_name: {current.get('smtp_sender_name')!r} -> {BRAND_NEW!r}")
    plan = {"smtp_sender_name": current.get("smtp_sender_name")}
    for t in TEMPLATE_TYPES:
        key_subject = f"mailer_subjects_{t}"
        key_body = f"mailer_templates_{t}_content"
        current_subject = current.get(key_subject) or ""
        current_body = current.get(key_body) or ""
        payload[key_subject] = subjects[t]
        payload[key_body] = bodies[t]
        plan[key_subject] = current_subject
        plan[key_body] = current_body
        print(
            f"  {t}: subject {'变化' if current_subject != subjects[t] else '一致'} | "
            f"正文 {len(current_body)} 字符(旧品牌 x{current_body.count(BRAND_OLD)}) -> 本地版本({len(bodies[t])} 字符)"
        )
    unchanged = all(
        plan[f"mailer_subjects_{t}"] == subjects[t] and plan[f"mailer_templates_{t}_content"] == bodies[t]
        for t in TEMPLATE_TYPES
    ) and current.get("smtp_sender_name") == BRAND_NEW
    if unchanged:
        print("线上已与本地一致,无需同步。")
        return

    if not args.apply:
        print("\n这是 dry-run。确认无误后加 --apply 执行(执行前自动保存线上备份到 .mimosa/)。")
        return

    backup_path = ROOT / ".mimosa" / f"auth-config-backup-{time.strftime('%Y%m%d-%H%M%S')}.json"
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path.write_text(json.dumps(current, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n已保存线上备份: {backup_path.relative_to(ROOT)}(回滚: --apply --restore {backup_path.name})")

    api_call(token, payload)
    verified = api_call(token)
    results = {}
    for t in TEMPLATE_TYPES:
        body = verified.get(f"mailer_templates_{t}_content") or ""
        results[t] = {
            "subject_synced": verified.get(f"mailer_subjects_{t}") == subjects[t],
            "content_synced": body == bodies[t],
            "old_brand_left": body.count(BRAND_OLD),
        }
    print("\n同步后验证:")
    print(json.dumps({
        "smtp_sender_name": verified.get("smtp_sender_name"),
        **results,
    }, ensure_ascii=False, indent=1))
    ok = all(v["subject_synced"] and v["content_synced"] and v["old_brand_left"] == 0 for v in results.values()) \
        and verified.get("smtp_sender_name") == BRAND_NEW
    print("\n同步完成。" if ok else "\n存在未同步项,请对照上方验证输出检查。")


if __name__ == "__main__":
    main()
