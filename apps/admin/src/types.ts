export interface Source {
  [key: string]: unknown;
  id: string;
  repository: string;
  commit: string;
  license: string;
  attribution: string;
  adaptation: string;
}
export interface Role {
  [key: string]: unknown;
  id: string;
  name: string;
  icon?: string;
  tag: string;
  description: string;
  system: string;
  detail: string;
  greeting: string;
  examples: string;
  persona: string;
  personality?: string;
  scenario?: string;
  postHistory?: string;
  creatorNotes?: string;
  bookIds: string[];
  world: string;
  keys: string[];
  source?: Source;
}
export interface BookEntry {
  uid: number;
  comment?: string;
  key: string[];
  keysecondary: string[];
  content: string;
  constant: boolean;
  selective: boolean;
  useProbability: boolean;
  disable: boolean;
  selectiveLogic: number;
  probability: number;
  order: number;
  position: number;
  [key: string]: unknown;
}
export interface Book {
  [key: string]: unknown;
  id: string;
  name: string;
  keys: string[];
  content: string;
  entries?: BookEntry[];
  source?: Source;
}
export interface Preset {
  [key: string]: unknown;
  context: number;
  maxTokens: number;
  temperature: number;
  pinExamples: boolean;
  postHistory: string;
}
export interface PlanConfig {
  enabled: boolean;
  model: string;
  reasoningEffort: "medium" | "high";
}
export interface Config {
  [key: string]: unknown;
  version: number;
  roles: Role[];
  books: Book[];
  preset: Preset;
  acceptNew: boolean;
  paused: boolean;
  model: { url: string; name: string } | null;
  planBackend: PlanConfig;
}
export interface Conversation {
  id: string;
  role: string;
  name: string;
  title: string;
  createdAt: string;
  configVersion: number;
}
export interface User {
  id: string;
  createdAt: string;
  disabled: boolean;
  conversations: Conversation[];
}
export interface Task {
  id: string;
  userId: string;
  conversation: string;
  mode: string;
  startedAt: string;
}
export interface Audit {
  sequence: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  result: string;
}
export interface CommunityItem {
  id: string;
  name: string;
  type: string;
  language: string;
  scenarios: string;
  quality: string;
  packaging: string;
  entryCount: number;
  sourceURL: string;
}
export interface AdminState {
  csrf: string;
  config: Config;
  users: User[];
  tasks: Task[];
  audit: Audit[];
  model: {
    mode: string;
    connection: string;
    description: string;
    model: string;
    credentialConfigured: boolean;
  };
  plan: { description: string; connection?: string; canGenerate?: boolean; [key: string]: unknown };
  community: {
    verification: string;
    heatEvidence: string;
    evidenceDate: string;
    license: string;
    items: CommunityItem[];
    importBlocker: string;
  };
  diagnostics: Record<string, string | boolean>;
}
