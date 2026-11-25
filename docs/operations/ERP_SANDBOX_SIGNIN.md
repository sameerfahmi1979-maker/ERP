# Local ERP Intake controls

The Agent Center controls require a sandbox database with the scoped control
migration, a bound local worker, and an operator with DMS administration
permission for that company and branch. Keep the sandbox worker in review mode
and use synthetic source files. Bind the ERP and the worker to the same
isolated database. Set `DMS_AGENT_CENTER_CONTROL_API_ENABLED=true` in the local
ERP process. In the Agent Center, select the bound branch and Intake to see
On/Off and Pause/Resume.

## Optional sign-in with an ERP account

Serve the local ERP on a separate loopback port, such as 3001, with
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Confirm that its database and Auth
configuration point to the isolated sandbox. The relay listens on localhost
port 3000 and sends regular ERP traffic to that sandbox.

Create a configuration JSON file outside the repository with these fields.

| Field | Value |
| --- | --- |
| `owner.email` | The single authorized ERP email address |
| `owner.subject` | That account's immutable production Auth user ID |
| `owner.publicKey` | The ERP's production Supabase public key |
| `sandboxLogin.email` | The approved synthetic officer's email ending in `@pilot.example.invalid` |
| `sandboxLogin.password` | The synthetic officer's sandbox password |
| `backendPort` | Local ERP upstream port, default 3001 |

Keep the production ERP password in the normal password entry field only. The
relay uses the existing ERP login endpoint, confirms the exact verified Auth
identity, and closes the verification session. The browser receives the
sandbox session for the scoped test officer. The relay requires a completed
password sign-in and blocks accounts with verified MFA enrollment.

Run the relay and open [localhost:3000](http://localhost:3000/login).

```powershell
node tooling/local/erp-sandbox-signin.cjs C:/dev/scratch/erp-sandbox-login.json
```

Verify the relay with `node --test tooling/local/erp-sandbox-signin.test.cjs`.
