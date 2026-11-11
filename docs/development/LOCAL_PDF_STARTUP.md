# Local PDF service

Run `npm run dev` from `C:\dev\agt-erp`. Its `predev` step loads the same local environment as Next.js, checks the local Docker context, starts Docker Desktop if its Linux engine is stopped, starts the reviewed PDF renderer, and waits for HTTP health before Next.js starts. The existing `dev` command and forwarded Next.js flags remain unchanged.

The current computer uses `GOTENBERG_URL=http://127.0.0.1:16430` in ignored `.env.local`, backed by the existing `algt-f00-renderer` container. Keep that local setting out of Git. The example port 3100 is also supported, using a dedicated `algt-erp-local-pdf-3100` container if needed.

The script accepts only loopback HTTP renderer origins. It never changes a Docker context, deletes/replaces a container, mounts business files, resets a database, changes `.env` files, downloads images, enables workers/providers, or runs production startup. Unexpected existing container settings stop the command for review. New local renderer containers use the reviewed, already-installed image ID pinned in the script, loopback-only port binding and external HTTP-request denial. Updating that image requires a separate review.

Docker startup may take up to 90 seconds; renderer health has a separate 30-second bound. If Docker is missing, needs first-run setup, is in Windows-container mode, has an unavailable image or cannot bind the port, the command explains the prerequisite and exits before starting Next.js. It does not repeatedly launch the ERP with a known unavailable PDF dependency.

You can run `npm run predev` alone to check/restore the service. A ready renderer is reused, so repeated commands do not create duplicate containers. The renderer remains available when the ERP development process stops, and is checked again on the next `npm run dev`.

`npm run build` and `npm start` have no new hooks. Railway and the live renderer remain unchanged. No browser testing or computer control is part of startup verification. Docker Desktop itself may restore other containers according to their existing restart policies; this helper does not change those policies or explicitly start those containers.
