import { userManage, type UserList, type UserSecret } from "@/api";
import dayjs from "dayjs";
import { Check, KeyRound, Loader2, MoreHorizontal, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Field, FieldContent, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function UserRow({
  user,
  isSuper,
  handleDone
}: {
  user: UserList;
  isSuper: boolean;
  handleDone: (ins:UserSecret) => void
}) {
  const [staff, setStaff] = useState(user.is_staff);
  const [active, setActive] = useState(user.is_active);
  const [dirty, setdirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState("");
  const [randomize, setRandomize] = useState(false);
  const [newPass, setNewPAss] = useState("")
  const [dialog, setDialog] = useState<"password" | "delete" | null>(null);
  const canDelete = isSuper || !user.is_staff;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function handleSaveUser() {
    setSaving(true);
    setError("");
    try {
      await userManage.saveStatus(user.id, staff, active);
    } catch {
      setError(`couldn't save user ${user.id}: ${user.username}`);
      console.log(error);
    } finally {
      setSaving(false);
      setdirty(false);
    }
  }
  
  async function handleNewPassUser() {
    setSaving(true);
    setError("");
    try {
      let res
      if(randomize){
         res = await userManage.changePass(user.id, randomize);
      } else {
         res = await userManage.changePass(user.id, false, newPass);
      }
      handleDone(res)
      setDialog(null)
    } catch {
      setError(`couldn't save user ${user.id}: ${user.username}`);
      console.log(error);
    } finally {
      setSaving(false);
      setdirty(false);
    }
  }
  
  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      await userManage.delete(user.id);
      setDialog(null);
    } catch {
      setError(`couldn't delete user ${user.id}: ${user.username}`);
      console.log(error);
    } finally {
      setSaving(false);
      setdirty(false);
    }
  }

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/40">
      <td className="px-4 py-3">{user.username}</td>
      <td className="px-4 py-3">{user.email}</td>
      <td className="px-4 py-3 items-center">
        {isSuper ? (
          <div>
            <Checkbox
              checked={staff}
              onCheckedChange={(c) => {
                setStaff(c === true);
                setdirty(true);
              }}
              className="border-2 size-5"
            />
          </div>
        ) : (
          <span>
            {user.is_staff && 
            <span className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            }
          </span>
        )}
      </td>
      <td className="px-4 py-3 items-center">
        <div>
          <Checkbox
            checked={active}
            onCheckedChange={(c) => {
              setActive(c === true);
              setdirty(true);
            }}
            className="border-2 size-5"
          />
        </div>
      </td>
      <td className="px-4 py-3">
        {dayjs(user.last_login).format("D MMM YYYY, HH:mm")}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {error && (
            <span className="max-w-40 truncate text-xs text-destructive" title={error}>
              {error}
            </span>
          )}

          {dirty && (
            <Button size="sm" disabled={saving} onClick={() => handleSaveUser()}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          )}

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Actions for ${user.username}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setDialog("password")}>
                <KeyRound /> Reset password
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDialog("delete")}
                  >
                    <Trash2 /> Delete user
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog
            open={dialog === "password"}
            onOpenChange={(o) => setDialog(o ? "password" : null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change {user.username}'s password</DialogTitle>
                <DialogDescription></DialogDescription>
              </DialogHeader>

              <Field>
                <FieldLabel>New Password</FieldLabel>
                <FieldContent>
                  <Input
                    name="newpass"
                    type="text"
                    className="border-2"
                    disabled={randomize}
                    value={newPass}
                    onChange={(e) => setNewPAss(e.target.value)}
                  ></Input>
                </FieldContent>
              </Field>

              <Field orientation="horizontal">
                <Checkbox
                  id="random-check"
                  checked={randomize}
                  onCheckedChange={(c) => {setRandomize(c === true); setNewPAss("")}}
                  name="randomize"
                  className="border-2"
                />
                <FieldLabel htmlFor="random-check">
                  Randomize password automatically
                </FieldLabel>
              </Field>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="h-10">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  onClick={() => {handleNewPassUser()}}
                  className="h-10"
                  disabled={saving}
                >
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? "Changing..." : `Change password`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {canDelete && (
            <Dialog
              open={dialog === "delete"}
              onOpenChange={(o) => setDialog(o ? "delete" : null)}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you sure to delete this user: {user.username}?</DialogTitle>
                  <DialogDescription>
                    Doing this will permanently delete this user's data
                  </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="h-10">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    onClick={() => {
                      handleDelete();
                    }}
                    className="h-10 bg-destructive hover:bg-red-800"
                    disabled={saving}
                  >
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    {saving ? "Deleting..." : `Delete user`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </td>
    </tr>
  );
}
