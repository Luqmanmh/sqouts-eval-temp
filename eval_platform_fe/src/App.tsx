import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Login } from "./pages/login";
import { Dashboard } from "./pages/dashboard";
import { Logged } from "./components/layout/logged";
import { SceneDetail } from "./pages/scenedetail";
import { TestCaseDetail } from "./pages/testcasedetail";
import { TooltipProvider } from "./components/ui/tooltip";
import { RunDetail } from "./pages/rundetail";
import { ReqAdmin } from "./components/layout/reqadmin";
import { UserManager } from "./pages/usermanager";
// import './App.css'

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} /> //change if ever implementing
          frontpage
          <Route element={<Logged />}>
            <Route path="/scenarios" element={<Dashboard />} />
            <Route path="/scenarios/:sceneid" element={<SceneDetail />} />
            <Route
              path="/scenarios/:sceneid/testcases/:tcid"
              element={<TestCaseDetail />}
            />
            <Route
              path="/scenarios/:sceneid/testcases/:tcid/run/:runid"
              element={<RunDetail />}
            />
            <Route element={<ReqAdmin/>}>
              <Route path="/manage-user" element={<UserManager/>}/>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
