# BHCC production operations runbook

## Monitoring and alerts

- Use Coolify's built-in container health status to monitor `/api/health/ready/`. Check application and deployment logs in Coolify after every deployment and whenever the service becomes unhealthy.
- Keep Coolify deployment and server-health notifications disabled unless the clinic later chooses and approves a notification destination.
- Django writes application errors to the backend container's standard output. Review these logs in Coolify; logs must never intentionally include passwords, tokens, request bodies or medical information.
- Review `/api/management/operations/` weekly for email failures, deletion requests and administrator activity. Resend delivery/bounce dashboards remain the source of truth for provider delivery.

## Backups and restore

Run `scripts/backup-postgres.ps1` daily on the VPS. Encrypt and copy backups to a second provider/bucket; retaining only the Coolify server is not a backup. Recommended retention: 7 daily, 4 weekly and 12 monthly copies. Restrict backup access and never commit dumps.

Once per month restore the newest backup into an isolated staging database:

```powershell
.\scripts\restore-postgres.ps1 -Backup .\backups\bhcc-TIMESTAMP.dump -ConfirmRestore
```

Verify patient counts, appointments and a prescription PDF. Record the date, operator, backup identifier and outcome. Target RPO is 24 hours and initial RTO is 4 hours; revise after measured drills.

## Deployment and incident recovery

1. Confirm the pre-deployment backup and CI checks are green.
2. Deploy in Coolify and verify readiness, patient login, admin dashboard, appointment creation and email delivery.
3. If unhealthy, use Coolify rollback to the previous image. Do not delete the PostgreSQL volume.
4. For database corruption, stop application writes, preserve the failed volume, restore the latest verified backup, run migrations, smoke-test, then reopen traffic.
5. For suspected compromise, isolate the service, rotate Django, database, Resend, Google and Razorpay secrets, preserve logs, notify clinic leadership and obtain qualified incident/legal guidance.

## Privacy and security operations

- Review pending deletion requests; deactivate login immediately where appropriate. Retain clinical, prescription, payment and audit records where legally required and document the decision.
- Review admin activity and failed email delivery weekly. Finalized prescriptions are immutable; amendments create a new version and the SHA-256 record signature detects later database alteration.
- Arrange an independent penetration test before real-patient launch and after significant authentication/payment changes. Scope the public site, APIs, Coolify/VPS, role boundaries, IDOR, authentication, file/PDF access, payment manipulation, rate limits and backup exposure. Only test systems with written authorization.
- Have qualified Indian healthcare/privacy counsel approve the Privacy Policy, Terms, consent wording, retention periods and breach response before production patient use.
