import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateExpenseCategory,
  useExpenseCategories,
  useRenameExpenseCategory,
  useReorderExpenseCategories,
} from "@/lib/queries/expenses";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryManagerDialog({ open, onOpenChange }: Props) {
  const { data: categories } = useExpenseCategories();
  const createCategory = useCreateExpenseCategory();
  const renameCategory = useRenameExpenseCategory();
  const reorderCategories = useReorderExpenseCategories();
  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");

  useEffect(
    () => setOrderedIds((categories ?? []).map((category) => category.id)),
    [categories],
  );

  const ordered = orderedIds
    .map((id) => categories?.find((category) => category.id === id))
    .filter(Boolean);

  const addCategory = async () => {
    if (!newName.trim()) return;
    setError("");
    try {
      await createCategory.mutateAsync(newName);
      setNewName("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Category could not be added.",
      );
    }
  };

  const saveRename = async () => {
    if (!editingId || !editingName.trim()) return;
    setError("");
    try {
      await renameCategory.mutateAsync({ id: editingId, name: editingName });
      setEditingId(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Category could not be renamed.",
      );
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedIds(next);
    await reorderCategories.mutateAsync(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>
            Add custom categories and control the order shown in expense forms.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addCategory();
            }}
            placeholder="New category name"
          />
          <Button
            onClick={() => void addCategory()}
            disabled={!newName.trim() || createCategory.isPending}
          >
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border">
          {ordered.map(
            (category, index) =>
              category && (
                <div
                  className="flex items-center gap-2 border-b p-2 last:border-b-0"
                  key={category.id}
                >
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Move ${category.name} up`}
                      onClick={() => void move(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Move ${category.name} down`}
                      onClick={() => void move(index, 1)}
                      disabled={index === orderedIds.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  {editingId === category.id ? (
                    <>
                      <Input
                        className="h-8"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveRename();
                        }}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => void saveRename()}>
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {category.name}
                      </span>
                      {category.is_system === 1 ? (
                        <span className="text-xs text-muted-foreground">
                          Built in
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Rename ${category.name}`}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditingName(category.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ),
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
