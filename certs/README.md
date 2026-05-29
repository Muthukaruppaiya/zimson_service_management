# RDS TLS certificate

For AWS RDS PostgreSQL with `PGSSLMODE=verify-full`, download the CA bundle:

```bash
npm run certs:rds
```

This saves `global-bundle.pem` in this folder. Set in `.env`:

```
PGSSLROOTCERT=./certs/global-bundle.pem
PGSSLMODE=verify-full
```
