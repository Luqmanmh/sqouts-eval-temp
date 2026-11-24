import { Link, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronDown } from "lucide-react";
import { auth } from "@/api";
import { loadProfile } from "@/lib/http";
export function Navbar() {
  const cred = loadProfile();
  const navigate = useNavigate();

  async function logOut() {
    try {
      await auth.logout();
    } catch {
      // auth.logout clears the profile even if the request fails, so the
      // app still treats the user as signed out
    }
    navigate("/", { replace: true });
  }
  const getInitials = (identifier:string | undefined) => {
    if (!identifier) return "U";
    const clean = identifier.includes("@")
      ? identifier.split("@")[0]
      : identifier;
    const parts = clean.split(/[._-\s]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
  };

  return (
    <div className="w-full border-b-black border-b shadow h-12 flex bg-primary sticky">
      <div className="max-w-6xl mx-auto flex-1 px-6 flex items-center justify-between">
        <Link to="/scenarios">
          <span className=" text-2xl font-medium text-white tracking-widest">
            MERIT
          </span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button >
              <div className="flex gap-2 h-full align-middle">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
                {getInitials(cred?.username)}
              </div>
                <span className=" text-lg">{cred?.username ?? "account"}</span>
                <ChevronDown className="align-middle size-5 mt-1.5" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-primary text-white rounded-sm">
            <DropdownMenuItem onSelect={logOut}>
              <p>Log out</p> <LogOut className="size-4 text-white" />{" "}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
