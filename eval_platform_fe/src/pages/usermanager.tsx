import { type Paged, type UserList, userManage, type UserSecret } from "@/api";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UserRow } from "@/components/user-row";
import { loadProfile } from "@/lib/http";
import { cn } from "cn";
import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useState, type SubmitEvent } from "react";

export function UserManager() {
  const [loading, setLoading] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [userList, setUserList] = useState<Paged<UserList>>();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [single, setSingle] = useState<UserSecret>();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [randomize, setRandomize] = useState(false);
  const [counter, setCounter] = useState(0)

  const th = "px-4 py-3 text-left text-sm font-medium text-muted-foreground";
  const isSuper = loadProfile()?.role == "super";

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchVal);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchVal]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      try {
        const list = await userManage.list({ query, page });
        if (!ignore) {
          setUserList(list);
        }
      } catch {
        if (!ignore) console.log("faild to fetch user");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [query, page, counter]);

  function handleChangedPass(ins: UserSecret) {
    setSingle(ins);
    setOpen(true);
  }

  function handleCopyAll() {
    const textToCopy = `Username: ${single?.username}\nEmail: ${single?.email}\nPassword: ${single?.password}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAdd(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    const text = (key: string) => (f.get(key) as string | null) ?? "";
    try {
      const created = await userManage.create(
        {
          username: text("newusername"),
          email: text("newemail"),
          password: text("newpassword"),
        },
        randomize,
      );
      setAdding(false);
      handleChangedPass(created);
      setCounter((k) => k+1)
    } catch (e) {
      console.log(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className=" text-3xl mb-4">Manage User</h1>
      <div className="flex justify-between">
        <Field className="w-3/4">
          <Input
            id="search"
            name="search"
            required
            placeholder="Search for a user"
            onChange={(e) => setSearchVal(e.target.value)}
            className=" h-10 border-2"
          />
        </Field>
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogTrigger asChild>
            <Button className="h-10">+ Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleAdd}>
              <DialogHeader className="pb-3">
                <DialogTitle>Add a new user</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>Username</FieldLabel>
                  <Input type="text" id="newusername" name="newusername" />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" id="newemail" name="newemail" />
                </Field>
                <Field>
                  <FieldLabel>Password</FieldLabel>
                  <Input
                    type="text"
                    id="newpassword"
                    name="newpassword"
                    disabled={randomize}
                  />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="random-check"
                    checked={randomize}
                    onCheckedChange={(c) => {
                      setRandomize(c === true);
                    }}
                    name="randomize"
                    className="border-2"
                  />
                  <FieldLabel htmlFor="random-check">
                    Randomize password automatically
                  </FieldLabel>
                </Field>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="h-10">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" className="h-10" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? "Adding…" : "Add User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-6">
        <div className="overflow-x-auto rounded-2xl border-2">
          <div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold">
                    New User Created
                  </DialogTitle>
                  <DialogDescription>
                    Please save these login details securely. You won't be able
                    to see the password again.
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3 border my-2 font-mono text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-sans">
                      Username:
                    </span>
                    <span className="font-medium text-foreground">
                      {single?.username}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-sans">
                      Email:
                    </span>
                    <span className="font-medium text-foreground">
                      {single?.email}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-muted-foreground font-sans">
                      Password:
                    </span>
                    <span className="font-medium text-destructive">
                      {single?.password}
                    </span>
                  </div>
                </div>

                <DialogFooter className="flex sm:justify-between items-center gap-2">
                  {/* Copy Button */}
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={handleCopyAll}
                  >
                    {copied ? (
                      <Check className="size-4 text-green-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copied Info!" : "Copy Details"}
                  </Button>

                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="default"
                      className="h-10 px-6"
                    >
                      Done
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <table className="w-full">
            <thead className="border-b-2 bg-secondary/50">
              <tr>
                <th className={th}>Username</th>
                <th className={th}>Email</th>
                <th className={th}>Staff member</th>
                <th className={th}>Active account</th>
                <th className={th}>Last login</th>
                <th className={cn(th, "text-right min-w-40")}></th>
              </tr>
            </thead>
            <tbody>
              {loading && userList?.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : userList?.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {query ? `No user match "${query}".` : "No user yet."}
                  </td>
                </tr>
              ) : (
                userList?.data.map((user) => (
                  <>
                    <UserRow
                      user={user}
                      isSuper={isSuper}
                      key={user.id}
                      handleDone={(i) => {
                        handleChangedPass(i);
                      }}
                    />
                    <Pager
                    className="mt-4"
                    page={page}
                    length={userList.pagin.total_page ?? 0}
                    onChange={setPage}
                    />  
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
