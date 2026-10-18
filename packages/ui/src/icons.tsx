import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  ContactRound,
  Cpu,
  Images,
  LockKeyhole,
  LogOut,
  Menu,
  MessagesSquare,
  Minus,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import type { SVGProps } from "react";

// Static imports keep unused icons out of the production bundle.
const icons = {
  roles: ContactRound,
  book: BookOpen,
  models: Cpu,
  sessions: MessagesSquare,
  users: UsersRound,
  resources: Images,
  diagnostics: Activity,
  appearance: Palette,
  search: Search,
  plus: Plus,
  close: X,
  arrow: ChevronRight,
  refresh: RefreshCw,
  logout: LogOut,
  check: Check,
  alert: CircleAlert,
  edit: Pencil,
  trash: Trash2,
  menu: Menu,
  lock: LockKeyhole,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  first: ChevronsLeft,
  last: ChevronsRight,
  sort: ArrowUpDown,
  sortAsc: ArrowUp,
  sortDesc: ArrowDown,
  minus: Minus,
  more: MoreHorizontal,
};

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" {...props} />;
}
