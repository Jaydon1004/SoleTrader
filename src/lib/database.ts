import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let db: Database | null = null;
let dbLoad: Promise<Database> | null = null;
let activeWorkspaceId: string | null = null;
let workspaceGeneration = 0;

export function workspaceDatabaseUrl(workspaceId: string) {
  if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(workspaceId))
    throw new Error("Invalid business workspace identifier.");
  return `sqlite:businesses/${workspaceId}/soletrader.db`;
}

export async function selectWorkspaceDatabase(workspaceId: string) {
  if (activeWorkspaceId === workspaceId && (db || dbLoad)) return;
  workspaceGeneration += 1;
  activeWorkspaceId = workspaceId;
  const previous = db;
  db = null;
  dbLoad = null;
  if (previous) await previous.close();
}

export async function closeWorkspaceDatabase() {
  workspaceGeneration += 1;
  activeWorkspaceId = null;
  const previous = db;
  db = null;
  dbLoad = null;
  if (previous) await previous.close();
}

export function getActiveWorkspaceId() {
  if (!activeWorkspaceId)
    throw new Error("Select a business before opening its files.");
  return activeWorkspaceId;
}

export async function getDatabase(): Promise<Database> {
  if (!activeWorkspaceId)
    throw new Error("Select a business before opening its records.");
  if (db) return db;
  if (dbLoad) return dbLoad;
  const workspaceId = activeWorkspaceId;
  const generation = workspaceGeneration;
  const pending = Database.load(workspaceDatabaseUrl(workspaceId)).then(
    async (loaded) => {
      if (
        generation !== workspaceGeneration ||
        workspaceId !== activeWorkspaceId
      ) {
        await loaded.close();
        throw new Error(
          "The active business changed while its records opened.",
        );
      }
      db = loaded;
      return loaded;
    },
  );
  dbLoad = pending;
  try {
    return await pending;
  } finally {
    if (dbLoad === pending) dbLoad = null;
  }
}

export async function query<T>(
  sql: string,
  bindValues?: unknown[],
): Promise<T[]> {
  const database = await getDatabase();
  return database.select<T[]>(sql, bindValues);
}

export async function execute(sql: string, bindValues?: unknown[]) {
  return invoke<{ rowsAffected: number; lastInsertId: number }>(
    "execute_allowed_statement",
    {
      input: {
        workspaceId: getActiveWorkspaceId(),
        sql,
        values: bindValues ?? [],
      },
    },
  );
}

export async function createExpenseFromBank(input: {
  bankTransactionId: number;
  categoryId: number;
  supplier: string;
  description: string;
  vatAmount: number;
  businessPercent: number;
}) {
  return invoke<number>("create_expense_from_bank", {
    input: { workspaceId: getActiveWorkspaceId(), ...input },
  });
}

export async function recordInvoicePaymentFromBank(input: {
  bankTransactionId: number;
  invoiceId: number;
}) {
  return invoke<number>("record_invoice_payment_from_bank", {
    input: { workspaceId: getActiveWorkspaceId(), ...input },
  });
}

export async function linkDocumentExpense(input: {
  documentId: number;
  expenseId: number;
}) {
  return invoke<void>("link_document_expense", {
    input: { workspaceId: getActiveWorkspaceId(), ...input },
  });
}

export async function createExpenseFromDocument(input: {
  documentId: number;
  categoryId: number;
  supplier: string;
  date: string;
  amount: number;
  vatAmount: number;
  bankTransactionId?: number;
}) {
  return invoke<number>("create_expense_from_document", {
    input: { workspaceId: getActiveWorkspaceId(), ...input },
  });
}
