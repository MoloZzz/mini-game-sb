import { AdminReview } from './AdminReview';

/**
 * Lets a human exercise the review screen against the mocks before app
 * routing wires it in (B6 builds and validates this screen ahead of the
 * full generated batch existing). Not imported anywhere else.
 */
export function AdminSandbox() {
  return <AdminReview />;
}
