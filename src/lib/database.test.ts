import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  load: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: databaseMock.load },
}));

import {
  closeWorkspaceDatabase,
  getActiveWorkspaceId,
  getDatabase,
  selectWorkspaceDatabase,
  workspaceDatabaseUrl,
} from "@/lib/database";

beforeEach(async () => {
  await closeWorkspaceDatabase();
  databaseMock.close.mockClear();
  databaseMock.load.mockReset();
  databaseMock.load.mockResolvedValue({ close: databaseMock.close });
});

describe("workspace database URLs", () => {
  it("scopes a valid identifier under the businesses directory", () => {
    expect(workspaceDatabaseUrl("01jworkspace-1234")).toBe(
      "sqlite:businesses/01jworkspace-1234/soletrader.db",
    );
  });

  it.each(["", "short", "../escape", "UPPERCASE-ID", "space id"])(
    'rejects unsafe identifier "%s"',
    (workspaceId) => {
      expect(() => workspaceDatabaseUrl(workspaceId)).toThrow(
        "Invalid business workspace identifier",
      );
    },
  );

  it("closes the active database before switching businesses", async () => {
    await selectWorkspaceDatabase("01jworkspace-1234");
    await getDatabase();

    await selectWorkspaceDatabase("01jworkspace-5678");

    expect(databaseMock.close).toHaveBeenCalledOnce();
    expect(getActiveWorkspaceId()).toBe("01jworkspace-5678");
    await getDatabase();
    expect(databaseMock.load).toHaveBeenNthCalledWith(
      1,
      "sqlite:businesses/01jworkspace-1234/soletrader.db",
    );
    expect(databaseMock.load).toHaveBeenNthCalledWith(
      2,
      "sqlite:businesses/01jworkspace-5678/soletrader.db",
    );
  });
});
