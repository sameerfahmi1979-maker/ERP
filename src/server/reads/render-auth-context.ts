import "server-only";

import { cache } from "react";
import { getAuthContext } from "@/lib/rbac/check";

/** Share the live authorization check only among readers in one server render. */
export const getRenderAuthContext = cache(getAuthContext);
