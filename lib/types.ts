export type TxType = "income" | "expense" | "transfer";
export type ExpenseType = "fixed" | "normal" | "casual";
export type AccountType = "checking" | "savings" | "cash" | "credit" | "investment";
export type DebtDirection = "they_owe_me" | "i_owe_them";
export type InvestmentType =
  | "stocks" | "crypto" | "fund" | "real_estate" | "cdt" | "bonds" | "other";
export type PaymentMethod =
  | "cash" | "debit" | "credit" | "transfer" | "deposit" | "check" | "digital_wallet" | "other";
export type Frequency =
  | "once" | "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";
export type ThemePref = "dark" | "light" | "system";
export type BackupFrequency = "daily" | "weekly" | "monthly";

export interface Profile {
  id: string;
  display_name: string | null;
  currency: string;
  avatar_url: string | null;
  language: "es" | "en";
  theme: ThemePref;
  auto_logout_minutes: number;
  auto_backup: boolean;
  backup_frequency: BackupFrequency;
  last_backup_at: string | null;
  report_notifications: boolean;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  bank: string | null;
  type: AccountType;
  currency: string;
  initial_balance: number;
  archived: boolean;
  created_at: string;
}

export interface AccountBalance {
  account_id: string;
  user_id: string;
  name: string;
  bank: string | null;
  type: AccountType;
  currency: string;
  initial_balance: number;
  current_balance: number;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  kind: "income" | "expense";
  expense_type: ExpenseType | null;
  icon: string | null;
  color: string | null;
  is_ant: boolean;
  archived: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  type: TxType;
  expense_type: ExpenseType | null;
  amount: number;
  currency: string;
  description: string | null;
  notes: string | null;
  payment_method: PaymentMethod | null;
  is_ant: boolean;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  recurring_payment_id: string | null;
  occurred_at: string;
  created_at: string;
  attachments?: { id: string }[];
}

export interface Attachment {
  id: string;
  user_id: string;
  transaction_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  kind: "photo" | "image" | "pdf" | "file";
  size_bytes: number | null;
  original_size_bytes: number | null;
  created_at: string;
  transactions?: Pick<Transaction, "id" | "description" | "amount" | "occurred_at" | "type" | "currency"> | null;
}

export interface RecurringPayment {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  category_id: string | null;
  account_id: string | null;
  payment_method: PaymentMethod | null;
  due_date: string;
  frequency: Frequency;
  status: "active" | "paused" | "finished";
  notes: string | null;
  reminders_enabled: boolean;
  reminder_days: number[];
  reminder_hour: number;
  last_paid_at: string | null;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  icon: string | null;
  color: string | null;
  status: "active" | "completed" | "archived";
  notes: string | null;
  created_at: string;
  saved_amount: number;
  first_contribution_at: string | null;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  user_id: string;
  amount: number;
  contributed_at: string;
  note: string | null;
  created_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  counterparty: string;
  direction: DebtDirection;
  principal: number;
  currency: string;
  description: string | null;
  due_date: string | null;
  status: "open" | "settled";
  created_at: string;
}

export interface Investment {
  id: string;
  user_id: string;
  name: string;
  type: InvestmentType;
  amount_invested: number;
  current_value: number;
  currency: string;
  institution: string | null;
  started_at: string | null;
  notes: string | null;
  updated_at: string;
}

export interface MonthlySummary {
  total_income: number;
  total_expense: number;
  net: number;
  fixed_expense: number;
  normal_expense: number;
  casual_expense: number;
  ant_expense: number;
  ant_count: number;
  tx_count: number;
}

export interface CashflowPoint {
  bucket: string;
  income: number;
  expense: number;
  ant: number;
}

export interface CategoryTotal {
  category_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: number;
  tx_count: number;
}
