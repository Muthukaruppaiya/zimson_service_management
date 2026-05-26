# Zimson AWS hosting — 75 stores (single server)

**File:** [`Zimson-AWS-Monthly-Quote-OnDemand.xlsx`](./Zimson-AWS-Monthly-Quote-OnDemand.xlsx) — **full pack (10 sheets)**  
**Region:** ap-south-1 (Mumbai) · **FX:** ₹96 / USD · **Estimate only (on-demand)**

### Excel workbook sheets

| Sheet | Contents |
|-------|----------|
| **Summary** | One-page overview, costs, package, sheet index |
| **Monthly On-Demand** | Line-item quote with USD/INR formulas |
| **Architecture** | EC2, RDS, S3, Nginx, roles |
| **EC2 Sizing** | medium / large / **xlarge** comparison |
| **Design Comparison** | Old HA design vs current single-server |
| **Assumptions** | 75 stores, Single-AZ, no ALB |
| **Excluded Items** | SMS, WhatsApp, domain, dev work |
| **Production Env** | `.env` variables for go-live |
| **Deploy Checklist** | IT / dev steps |
| **Monitoring** | CPU, RAM, RDS thresholds |

## Architecture

| Layer | Choice |
|--------|--------|
| **Application** | **1 × EC2 t4g.xlarge** (4 vCPU, **16 GB RAM**) — API + React SPA on Nginx |
| **Database** | **RDS PostgreSQL db.t4g.large, Single-AZ**, 100 GB gp3 |
| **Load balancer** | **None** — Elastic IP + HTTPS on EC2 |
| **Files** | **S3** private bucket (~220 GB year-1 average) |

## Monthly cost summary

| Line item | USD | INR (≈) |
|-----------|-----|---------|
| EC2 (1 × t4g.xlarge) | $118 | ₹11,328 |
| RDS db.t4g.large Single-AZ | $96 | ₹9,216 |
| RDS storage 100 GB | $12 | ₹1,152 |
| Elastic IP + HTTPS (no ALB) | $4 | ₹384 |
| EBS 80 GB (app server) | $6 | ₹576 |
| S3 ~220 GB + requests | $14 | ₹1,344 |
| Data transfer & misc. | $10 | ₹960 |
| **Total** | **~$260** | **~₹25,000** |

## Why t4g.xlarge for 75 stores

- **16 GB RAM** — comfortable for Node, Nginx, and invoice PDF spikes (html2pdf).
- **4 vCPU** — handles peak counter activity across many stores without running hot.
- **RDS still separate** — database load stays on RDS; EC2 focuses on API + UI.
- **Single server** — simpler ops; brief downtime on deploy unless you add a second instance later.

## Upgrade path (later)

2× EC2 + ALB + Multi-AZ RDS if you need high availability or zero-downtime deploys.

## Regenerate the Excel

```bash
node scripts/build-aws-quote.mjs
```
