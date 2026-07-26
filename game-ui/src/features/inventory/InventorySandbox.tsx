import { Inventory } from './Inventory';

/**
 * Named export so a human can look at the inventory screen directly before
 * routing exists. Not imported anywhere else in the app.
 */
export function InventorySandbox() {
  return <Inventory />;
}
