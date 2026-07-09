# Deployment Specification - Screening Tool

Last updated: 2026-07-09

## 1. Where the app runs

- Live URL (frontend + API, same origin): https://d1swcy48l389qg.cloudfront.net
- Health check: https://d1swcy48l389qg.cloudfront.net/health
- API docs (Swagger): https://d1swcy48l389qg.cloudfront.net/docs
- AWS account: 311212292744 (company SSO profile), region: ap-south-1 (Mumbai).
- GitHub repository: https://github.com/VIJAYAKUMAR-17/screeningtool (branch `main` deploys).

## 2. Architecture overview

```
Browser
  -> CloudFront (HTTPS)            d1swcy48l389qg.cloudfront.net, distribution EF5CLXBOBHTEX
  -> Application Load Balancer      screening-alb (HTTP :80, internet-facing)
  -> ECS Fargate task               FastAPI container on port 8011, serves the React SPA from /api/static
  -> RDS PostgreSQL 16              screening-db, database "sanctions"
```

The React frontend is compiled at build time and baked into the backend Docker image, so one container serves both the UI and the API.
CloudFront exists to provide HTTPS (the ALB has no TLS certificate because there is no custom domain yet); caching is disabled, it is a pure pass-through.

## 3. AWS resources in detail

| Resource | Name / ID | Notes |
|---|---|---|
| ECR repository | `screening-backend` | Images tagged `latest` and with the git commit SHA |
| ECS cluster | `screening-cluster` | Fargate only |
| ECS service | `screening-backend` | Desired count 1, rolling deployments, health-check grace 60s |
| Task definition | `screening-backend` | 0.5 vCPU, 1 GB RAM, port 8011, logs to CloudWatch `/ecs/screening-backend` |
| ALB | `screening-alb` | DNS `screening-alb-408233327.ap-south-1.elb.amazonaws.com`, listener HTTP :80 |
| Target group | `screening-tg` | Target type IP, health check `GET /health` every 30s |
| CloudFront | `EF5CLXBOBHTEX` | Origin = ALB over HTTP, viewer protocol redirect-to-HTTPS, CachingDisabled policy, AllViewer origin request policy |
| RDS instance | `screening-db` | PostgreSQL 16.11, db.t4g.micro, 20 GB gp3, private (not publicly accessible), 7-day backups, endpoint `screening-db.cpiyqgqoegai.ap-south-1.rds.amazonaws.com` |
| VPC | `vpc-001dabef15628a4c6` | Default VPC, default subnets in ap-south-1a/b/c |

### Security groups (traffic chain)

- `screening-alb-sg` (sg-0704b15ea4a7573f4): allows 80/443 from the internet.
- `screening-ecs-sg` (sg-043518c9713d2d3d1): allows 8011 only from the ALB security group.
- `screening-rds-sg` (sg-0040a7b77ba75b314): allows 5432 only from the ECS security group.

### Secrets (SSM Parameter Store, SecureString)

- `/screening/database-url` - full SQLAlchemy Postgres URL, injected into the container as `DATABASE_URL`.
- `/screening/tier1-csl-api-key` - data.trade.gov subscription key, injected as `TIER1_CSL_API_KEY`.
- `/screening/db-password` - the raw RDS master password (kept for reference; the app uses database-url).

Secrets are injected by ECS at container start via the task definition; they are never in the image, the repo, or GitHub.

### Clerk authentication (task definition plain environment variables)

The app authenticates with Clerk (organization = tenant).
These non-secret values live directly in the task definition `environment` block (added in revision 7) and are carried forward automatically because CI clones the latest task definition revision on every deploy:

- `CLERK_ISSUER=https://neutral-buzzard-68.clerk.accounts.dev` - dev Clerk instance; the backend verifies session JWTs against its JWKS.
- `CLERK_AUTHORIZED_PARTIES=https://d1swcy48l389qg.cloudfront.net` - accepted `azp` claim values.
- `CLERK_REQUIRE_ORGANIZATION=true` - requests without an organization claim are rejected.
- `CORS_ALLOW_ORIGINS=` (empty) - same-origin only; the SPA is served by the API so no CORS is needed in production.

The frontend build receives `VITE_CLERK_PUBLISHABLE_KEY` (a public key) from the `env:` block of the "Build frontend" step in `.github/workflows/deploy.yml`.

NOTE: there is no Clerk production instance yet because Clerk production requires a custom domain (a `*.cloudfront.net` host cannot be used).
Production currently runs against the Clerk development instance (`pk_test` key, "Development mode" badge in auth modals).
When a custom domain exists: create the Clerk production instance, configure its DNS records, then update `CLERK_ISSUER`/`CLERK_AUTHORIZED_PARTIES` in the task definition and `VITE_CLERK_PUBLISHABLE_KEY` in the workflow.

### IAM

- `ecsTaskExecutionRole` - lets ECS pull from ECR, write logs, and read `/screening/*` SSM parameters (inline policy `screening-ssm-read`).
- `screening-github-deploy` - assumed by GitHub Actions via OIDC; trusted only for `repo:VIJAYAKUMAR-17/screeningtool:ref:refs/heads/main`; scoped to push `screening-backend` ECR images and update the `screening-backend` ECS service.
- OIDC provider `token.actions.githubusercontent.com` registered in the account.

## 4. CI/CD - how deployments happen

Workflow file: `.github/workflows/deploy.yml`. Trigger: push to `main` touching `backend/**`, `frontend/**`, or the workflow file.

Steps on every deploy (about 4 minutes):

1. Build the Vite frontend (`VITE_API_BASE_URL=/`) and copy `dist/` into `backend/api/static/`.
2. Assume the AWS role via OIDC (no stored AWS keys in GitHub).
3. Build the Docker image and push to ECR tagged with the commit SHA and `latest`.
4. Register a new task definition revision pointing at the SHA-tagged image.
5. Update the ECS service and wait for it to stabilize (zero-downtime rolling deploy).
6. Smoke test `GET /health` through CloudFront.

Watch runs at: https://github.com/VIJAYAKUMAR-17/screeningtool/actions

## 5. How to change things

All commands assume `--profile company --region ap-south-1` and a valid SSO session (`aws sso login --profile company`).

### Deploy a code change (frontend or backend)

Push to `main`. Nothing else.

### Roll back a bad deploy

Every deploy registers a numbered task definition revision tied to a commit SHA.

```bash
aws ecs describe-task-definition --task-definition screening-backend:<older-revision>   # inspect
aws ecs update-service --cluster screening-cluster --service screening-backend \
  --task-definition screening-backend:<older-revision>
```

### Change a secret (e.g. rotate the CSL API key)

```bash
aws ssm put-parameter --name /screening/tier1-csl-api-key --type SecureString --value "<new>" --overwrite
aws ecs update-service --cluster screening-cluster --service screening-backend --force-new-deployment
```

No rebuild needed; the new value is injected when the new task starts.

### Change frontend build variables (VITE_*)

Edit the `env:` block of the "Build frontend" step in `.github/workflows/deploy.yml` and push.
These values are baked into the JS bundle, so a rebuild (i.e. a push) is required.

### Change backend runtime config (thresholds etc.)

Non-secret settings live in `backend/config.py` defaults and can be overridden with plain environment variables in the task definition.
Secret settings go through SSM as above.

### Scale up or down

```bash
# more parallel capacity
aws ecs update-service --cluster screening-cluster --service screening-backend --desired-count 2
# bigger task: edit cpu/memory in a new task definition revision, then update-service
```

### Database access

RDS is private; connect from inside the VPC (e.g. an ECS exec shell) or temporarily add your IP via a bastion.
Quick option using ECS exec is not enabled by default; easiest is a one-off Fargate task or enabling public access temporarily (not recommended).
Credentials are in SSM (`/screening/db-password`).

### Move the GitHub repository

Update the OIDC trust on the deploy role to the new `org/repo`:

```bash
aws iam update-assume-role-policy --role-name screening-github-deploy --policy-document '<same JSON with new repo sub>'
```

### Add a custom domain later

1. Request an ACM certificate for the domain in us-east-1 (CloudFront requires us-east-1 certs).
2. Add the domain as a CloudFront alternate domain name with that certificate.
3. Point DNS (CNAME/alias) at `d1swcy48l389qg.cloudfront.net`.
4. Update CORS in `backend/api/main.py` to the real origin.

## 6. Monitoring and logs

- Application logs: CloudWatch log group `/ecs/screening-backend`.
- Deploy status: GitHub Actions runs; ECS service events (`aws ecs describe-services`).
- Health: target group health in the EC2 console, or `curl .../health`.
- No alarms are configured yet; recommended next step is a CloudWatch alarm on ALB 5xx and on target health.

## 7. Cost snapshot (approximate, on-demand, ap-south-1)

- Fargate task 0.5 vCPU / 1 GB, 24x7: ~$18/month
- ALB: ~$18-20/month
- RDS db.t4g.micro + 20 GB gp3: ~$15/month
- CloudFront, ECR, SSM, CloudWatch: a few dollars at current traffic
- Total: roughly $50-60/month

## 8. Optional pieces not currently active

- `amplify.yml` is committed for hosting the frontend on AWS Amplify (separate CDN domain, PR previews).
  Activating it requires a one-time GitHub authorization in the Amplify console by someone with admin access to the repository, and setting `VITE_API_BASE_URL=https://d1swcy48l389qg.cloudfront.net` as a branch environment variable.
  The current single-origin setup (SPA served by the backend) works without it and avoids CORS entirely.
