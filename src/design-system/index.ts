/**
 * Modrek Plus — Design System
 * المرجع الرسمي الوحيد لكل صفحة/ميزة جديدة.
 * لا يعدّل الصفحات القديمة. للاستخدام: لفّ الصفحة الجديدة بـ <DSProvider>.
 */

export * from "./tokens";
export { DSProvider } from "./DSProvider";

export { DSButton, DSIconButton } from "./components/Button";
export type { DSButtonProps, DSIconButtonProps } from "./components/Button";

export {
  DSCard, DSCardHeader, DSCardTitle, DSCardDescription, DSCardContent, DSCardFooter, DSStatCard,
} from "./components/Card";
export type { DSCardProps, DSStatCardProps } from "./components/Card";

export {
  DSLabel, DSHelpText, DSInput, DSTextarea, DSSearch, DSSelect,
  DSCheckbox, DSRadio, DSSwitch,
} from "./components/Form";

export { DSBadge, DSStatusBadge } from "./components/Badge";
export type { DSBadgeProps, DSBadgeTone, DSBadgeStatus } from "./components/Badge";

export { DSAlert } from "./components/Alert";
export type { DSAlertProps, DSAlertTone } from "./components/Alert";

export { DSDialog, DSConfirmDialog } from "./components/Dialog";
export type { DSDialogProps, DSConfirmDialogProps, DSDialogKind } from "./components/Dialog";

export { DSTabs } from "./components/Tabs";
export type { DSTabsProps, DSTabItem } from "./components/Tabs";

export { DSTable, DSPagination } from "./components/Table";
export type { DSTableProps, DSColumn, DSPaginationProps } from "./components/Table";

export { DSEmptyState } from "./components/EmptyState";
export type { DSEmptyStateProps, DSEmptyKind } from "./components/EmptyState";

export { DSText } from "./components/Typography";
export type { DSTextProps } from "./components/Typography";
