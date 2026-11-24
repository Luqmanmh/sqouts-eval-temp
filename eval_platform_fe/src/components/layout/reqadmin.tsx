import { loadProfile } from "@/lib/http";
import { Navigate, Outlet } from "react-router-dom";

export function ReqAdmin() {
  return loadProfile()?.role !== "user" ? <Outlet/> : <Navigate to="/scenarios" replace/>
}