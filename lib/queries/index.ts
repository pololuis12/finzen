import { supabase } from "../supabase";
import { firstOfMonthISO, toISODate, todayISO, getCurrency, longDate } from "../format";
import { nextDueDate, canPayNow, payableFrom } from "../recurring";
import { notifyDataChanged } from "../dataEvents";
import { t } from "../i18n";
import type {
  Account, AccountBalance, Category, Transaction, Debt, Investment, MonthlySummary, Profile,
  RecurringPayment, SavingsGoal, GoalContribution, Attachment, CashflowPoint, CategoryTotal, TxType,
} from "../types";

const num = (v: unknown) => Number(v ?? 0);

// Supabase limita cada consulta a 1000 filas: este helper pagina hasta traerlas todas.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

// ---------------- Perfil ----------------
export async function getProfile(): Promise<Profile | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(patch: Partial<Profile>) {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) throw new Error("No hay sesión activa");
  const { error } = await supabase.from("profiles").upsert({ id: uid, ...patch, updated_at: new Date().toISOString() });
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- Resúmenes y series ----------------
const EMPTY_SUMMARY: MonthlySummary = {
  total_income: 0, total_expense: 0, net: 0, fixed_expense: 0, normal_expense: 0,
  casual_expense: 0, ant_expense: 0, ant_count: 0, tx_count: 0,
};

export async function getMonthlySummary(month = new Date()): Promise<MonthlySummary> {
  const { data, error } = await supabase.rpc("monthly_summary", { p_month: firstOfMonthISO(month) });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return EMPTY_SUMMARY;
  return Object.fromEntries(Object.entries(EMPTY_SUMMARY).map(([k]) => [k, num(row[k])])) as unknown as MonthlySummary;
}

export async function getCashflow(from: Date, to: Date, bucket: "day" | "week" | "month" | "year"): Promise<CashflowPoint[]> {
  const { data, error } = await supabase.rpc("cashflow_series", {
    p_from: toISODate(from), p_to: toISODate(to), p_bucket: bucket,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    bucket: String(r.bucket).slice(0, 10), income: num(r.income), expense: num(r.expense), ant: num(r.ant),
  }));
}

export async function getCategoryBreakdown(from: Date, to: Date, kind: "income" | "expense" = "expense", onlyAnt = false): Promise<CategoryTotal[]> {
  const { data, error } = await supabase.rpc("category_breakdown", {
    p_from: toISODate(from), p_to: toISODate(to), p_kind: kind, p_only_ant: onlyAnt,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, total: num(r.total), tx_count: num(r.tx_count) }));
}

// ---------------- Cuentas ----------------
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase.from("account_balances").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, initial_balance: num(a.initial_balance), current_balance: num(a.current_balance) }));
}

/** Crea la cuenta y devuelve su id. */
export async function createAccount(a: Partial<Account>, opts: { initialAsIncome?: boolean } = {}): Promise<string> {
  const { initial_balance = 0, ...rest } = a;
  const asIncome = !!opts.initialAsIncome && initial_balance > 0;
  const { data, error } = await supabase.from("accounts")
    .insert({ currency: getCurrency(), ...rest, initial_balance: asIncome ? 0 : initial_balance }).select("id").single();
  if (error) throw error;
  if (asIncome) await registerIncomeFromInitial(data.id, initial_balance, rest.name ?? "");
  notifyDataChanged();
  return data.id;
}

/** Registra el dinero como ingreso de hoy (cuenta en "Ingresos del mes"), en vez de dejarlo como saldo inicial. */
async function registerIncomeFromInitial(accountId: string, amount: number, accountName: string) {
  const { data: cat } = await supabase.from("categories").select("id")
    .eq("kind", "income").eq("archived", false).eq("name", "Salario").limit(1).maybeSingle();
  await saveTransaction({
    type: "income", amount, account_id: accountId, category_id: cat?.id ?? null, occurred_at: todayISO(),
    description: accountName || t("Ingreso"),
  });
}

/** Convierte el saldo inicial de una cuenta existente en un ingreso de hoy. El saldo de la cuenta no cambia. */
export async function convertInitialBalanceToIncome(a: AccountBalance) {
  if (a.initial_balance <= 0) return;
  await registerIncomeFromInitial(a.account_id, a.initial_balance, a.name);
  const { error } = await supabase.from("accounts").update({ initial_balance: 0 }).eq("id", a.account_id);
  if (error) throw error;
  notifyDataChanged();
}

export async function archiveAccount(id: string) {
  const { error } = await supabase.from("accounts").update({ archived: true }).eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- Categorías ----------------
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").eq("archived", false).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function saveCategory(c: Partial<Category>) {
  const { error } = c.id
    ? await supabase.from("categories").update(c).eq("id", c.id)
    : await supabase.from("categories").insert(c);
  if (error) throw error;
  notifyDataChanged();
}

export async function archiveCategory(id: string) {
  const { error } = await supabase.from("categories").update({ archived: true }).eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- Transacciones ----------------
export type TxFilters = {
  search?: string;
  type?: TxType | "ant" | "all";
  categoryId?: string | null;
  accountId?: string | null;
  from?: string | null;
  to?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  withInvoice?: boolean;
};

export async function searchTransactions(f: TxFilters, page = 0, pageSize = 40): Promise<{ rows: Transaction[]; count: number }> {
  const select = f.withInvoice ? "*, attachments!inner(id)" : "*, attachments(id)";
  let q = supabase.from("transactions").select(select, { count: "exact" });
  if (f.type === "ant") q = q.eq("is_ant", true);
  else if (f.type && f.type !== "all") q = q.eq("type", f.type);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.accountId) q = q.or(`account_id.eq.${f.accountId},to_account_id.eq.${f.accountId}`);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lte("occurred_at", f.to);
  if (f.minAmount != null) q = q.gte("amount", f.minAmount);
  if (f.maxAmount != null) q = q.lte("amount", f.maxAmount);
  const s = (f.search ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (s) {
    const like = `%${s}%`;
    const parts = [`description.ilike.${like}`, `notes.ilike.${like}`, `location_name.ilike.${like}`];
    const asNum = Number(s.replace(/[.\s]/g, "").replace(",", "."));
    if (isFinite(asNum) && asNum > 0) parts.push(`amount.eq.${asNum}`);
    q = q.or(parts.join(","));
  }
  const { data, error, count } = await q
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Transaction[], count: count ?? 0 };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTransactionsBetween(from: string, to: string, opts: { onlyAnt?: boolean } = {}): Promise<Transaction[]> {
  return fetchAll<Transaction>((a, b) => {
    let q = supabase.from("transactions").select("*").gte("occurred_at", from).lte("occurred_at", to);
    if (opts.onlyAnt) q = q.eq("is_ant", true);
    return q.order("occurred_at", { ascending: false }).range(a, b);
  });
}

/** Inserta o actualiza. Devuelve el id. */
export async function saveTransaction(tx: Partial<Transaction>): Promise<string> {
  const { attachments: _ignore, ...row } = tx;
  if (row.id) {
    const { error } = await supabase.from("transactions").update({ ...row, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw error;
    notifyDataChanged();
    return row.id;
  }
  const { data, error } = await supabase.from("transactions")
    .insert({ currency: getCurrency(), ...row }).select("id").single();
  if (error) throw error;
  notifyDataChanged();
  return data.id;
}

export async function deleteTransaction(id: string) {
  const { data: files } = await supabase.from("attachments").select("storage_path").eq("transaction_id", id);
  if (files?.length) await supabase.storage.from("attachments").remove(files.map((f) => f.storage_path));
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- Pagos recurrentes ----------------
export async function getRecurringPayments(): Promise<RecurringPayment[]> {
  const { data, error } = await supabase.from("recurring_payments").select("*").order("due_date");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, amount: num(r.amount) }));
}

export async function getRecurringPayment(id: string): Promise<RecurringPayment | null> {
  const { data, error } = await supabase.from("recurring_payments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, amount: num(data.amount) } : null;
}

/** Inserta o actualiza. Devuelve el id. */
export async function saveRecurringPayment(p: Partial<RecurringPayment>): Promise<string> {
  const row = { ...p, updated_at: new Date().toISOString() };
  if (p.id) {
    const { error } = await supabase.from("recurring_payments").update(row).eq("id", p.id);
    if (error) throw error;
    notifyDataChanged();
    return p.id;
  }
  const { data, error } = await supabase.from("recurring_payments")
    .insert({ currency: getCurrency(), ...row }).select("id").single();
  if (error) throw error;
  notifyDataChanged();
  return data.id;
}

export async function deleteRecurringPayment(id: string) {
  const { error } = await supabase.from("recurring_payments").delete().eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

/** Cuenta de la que sale el pago: la del pago recurrente o, si no tiene, la primera cuenta activa. */
export async function payingAccount(p: Pick<RecurringPayment, "account_id">): Promise<AccountBalance | null> {
  const accts = await getAccountBalances();
  return accts.find((a) => a.account_id === p.account_id) ?? accts[0] ?? null;
}

/** Registra el pago como gasto (se descuenta del saldo de la cuenta) y mueve el vencimiento al siguiente periodo. */
export async function markRecurringPaid(p: RecurringPayment, paidOn = todayISO()) {
  if (!canPayNow(p)) throw new Error(t("Este pago se podrá registrar desde el {date}", { date: longDate(payableFrom(p)) }));
  const account = await payingAccount(p);
  if (!account) throw new Error(t("Selecciona una cuenta (créala en Más → Cuentas)"));
  await saveTransaction({
    type: "expense", expense_type: "fixed", amount: p.amount, currency: p.currency,
    description: p.name, category_id: p.category_id, account_id: account.account_id,
    payment_method: p.payment_method, recurring_payment_id: p.id, occurred_at: paidOn,
  });
  const next = nextDueDate(p.due_date, p.frequency);
  await saveRecurringPayment({
    id: p.id, last_paid_at: paidOn,
    ...(next ? { due_date: next } : { status: "finished" }),
  });
}

// ---------------- Metas de ahorro ----------------
export async function getGoals(): Promise<SavingsGoal[]> {
  const { data, error } = await supabase.from("goal_progress").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map((g: any) => ({ ...g, target_amount: num(g.target_amount), saved_amount: num(g.saved_amount) }));
}

export async function getGoal(id: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase.from("goal_progress").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, target_amount: num(data.target_amount), saved_amount: num(data.saved_amount) } : null;
}

export async function saveGoal(g: Partial<SavingsGoal>): Promise<string> {
  const { saved_amount: _a, first_contribution_at: _b, ...row } = g;
  if (row.id) {
    const { error } = await supabase.from("savings_goals").update(row).eq("id", row.id);
    if (error) throw error;
    notifyDataChanged();
    return row.id;
  }
  const { data, error } = await supabase.from("savings_goals").insert(row).select("id").single();
  if (error) throw error;
  notifyDataChanged();
  return data.id;
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

export async function getContributions(goalId?: string): Promise<GoalContribution[]> {
  let q = supabase.from("goal_contributions").select("*").order("contributed_at", { ascending: false });
  if (goalId) q = q.eq("goal_id", goalId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ ...c, amount: num(c.amount) }));
}

export async function addContribution(c: Partial<GoalContribution>) {
  const { error } = await supabase.from("goal_contributions").insert(c);
  if (error) throw error;
  notifyDataChanged();
}

export async function deleteContribution(id: string) {
  const { error } = await supabase.from("goal_contributions").delete().eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- Facturas ----------------
export async function getAttachments(transactionId?: string): Promise<Attachment[]> {
  let q = supabase.from("attachments")
    .select("*, transactions(id, description, amount, occurred_at, type, currency)")
    .order("created_at", { ascending: false });
  if (transactionId) q = q.eq("transaction_id", transactionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Attachment[];
}

// ---------------- Deudas ----------------
export async function getDebts(): Promise<Debt[]> {
  const { data, error } = await supabase.from("debts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d: any) => ({ ...d, principal: num(d.principal) }));
}

export async function createDebt(d: Partial<Debt>) {
  const { error } = await supabase.from("debts").insert({ currency: getCurrency(), ...d });
  if (error) throw error;
  notifyDataChanged();
}

export async function settleDebt(id: string) {
  const { error } = await supabase.from("debts").update({ status: "settled" }).eq("id", id);
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- Inversiones ----------------
export async function getInvestments(): Promise<Investment[]> {
  const { data, error } = await supabase.from("investments").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createInvestment(i: Partial<Investment>) {
  const { error } = await supabase.from("investments").insert({ currency: getCurrency(), ...i });
  if (error) throw error;
  notifyDataChanged();
}

// ---------------- IA ----------------
export async function askAI(message: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("ai-assistant", { body: { message } });
  if (error) throw error;
  return (data as { reply?: string }).reply ?? "Sin respuesta.";
}

export async function getAIMessages() {
  const { data, error } = await supabase
    .from("ai_messages").select("*").order("created_at", { ascending: true }).limit(100);
  if (error) throw error;
  return data ?? [];
}

// ---------------- Exportación completa ----------------
const USER_TABLES = [
  "accounts", "categories", "transactions", "recurring_payments", "savings_goals", "goal_contributions",
  "attachments", "debts", "debt_payments", "investments",
] as const;

export async function getAllUserData(): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  const profile = await getProfile();
  out.profile = profile ? [profile] : [];
  for (const table of USER_TABLES) {
    out[table] = await fetchAll<any>((a, b) => supabase.from(table).select("*").range(a, b));
  }
  return out;
}
