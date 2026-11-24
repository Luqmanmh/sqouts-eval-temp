import { auth } from "@/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from "@/components/ui/input-group";
import { useState, type SubmitEvent } from "react";
import { AlertCircle, EyeOff, Eye, Loader2 } from "lucide-react";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";

function loginError(err: unknown): string {
  if (isAxiosError(err)) {
    if (!err.response) return "Can't reach the server. Check your connection and try again.";
    const data = err.response.data as { detail?: string; error?: string } | undefined;
    if (data?.detail || data?.error) return (data.detail || data.error)!;
    if (err.response.status >= 500) return "The server had a problem. Try again in a moment.";
  }
  return "Couldn't log in. Try again.";
}

export function Login() {
  const navigate = useNavigate();
  // const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [unameInput, setUnameInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [error, setError] = useState("");
  const [persists, setPersists] = useState(false)
  const [isLogging, setisLogging] = useState(false);

  async function handleLogin(e: SubmitEvent<HTMLFormElement>) {
    // Without this the browser reloads the page and the error is gone.
    e.preventDefault();
    setError("");
    setisLogging(true);
    try {
      await auth.login(unameInput, passInput, persists);
      navigate("/scenarios", { replace: true });
    } catch (err) {
      setError(loginError(err));
    } finally {
      setisLogging(false);
    }
  }
  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>
            <span className=" text-2xl font-medium text-primary tracking-widest mb-6">
            MERIT
            </span>
            <CardTitle>Log in</CardTitle>
            <CardDescription>
              Enter your credentials to access the console.
            </CardDescription>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <FieldGroup>
              <Field>
                <FieldLabel>Email / Username</FieldLabel>
                <Input
                  id="unamemail"
                  name="unamemail"
                  required
                  placeholder="Type your email or username"
                  onChange={(e) => setUnameInput(e.target.value)}
                  className=" h-10"
                />
              </Field>
              <Field>
                <FieldLabel>Password</FieldLabel>
                <InputGroup className=" h-10">
                  <InputGroupInput
                    id="password"
                    name="password"
                    required
                    placeholder="Type your password"
                    type={showPassword ? 'text' : 'password'}
                    onChange={(e) => setPassInput(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton variant="secondary" size="icon-xs" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className=" size-4" /> : <Eye className="size-4" />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                checked={persists}
                onCheckedChange={() => setPersists(!persists)}
                id="persist-check"
                name="persists"
                className="border-2"
                />
                <FieldLabel htmlFor="persist-check">Stay logged in</FieldLabel>
              </Field>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Field>
                <Button type="submit" className="w-full h-10" disabled={isLogging}>
                  {isLogging && <Loader2 className="size-4 animate-spin" />}
                  {isLogging ? "Logging in..." : "Log in"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
