import {
  Activity,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  ContactRound,
  Cpu,
  Images,
  LockKeyhole,
  LogOut,
  Menu,
  MessagesSquare,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

// Static imports keep the rest of the library out of the production bundle.
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
};

export type IconName = keyof typeof icons;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const IconComponent = icons[name];
  return <IconComponent size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
