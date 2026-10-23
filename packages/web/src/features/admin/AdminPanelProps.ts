import type { SessionUser } from "@playground/contract"

/** Props every admin panel island receives from the server. */
export interface AdminPanelProps {
  readonly user: SessionUser
}
