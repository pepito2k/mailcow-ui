import { useState, type FormEvent } from "react";
import { Inbox } from "lucide-react";
import { auth } from "../lib/api";
import { Button, Field, TextInput } from "../components/ui";

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await auth.login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-mark brand-mark-lg" aria-hidden>
          <Inbox size={24} />
        </span>
        <h1>Mail Admin</h1>
        <p className="muted">Sign in to manage your mail server.</p>
        <Field label="Username">
          <TextInput autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Password">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <div className="form-error">{error}</div>}
        <Button variant="primary" type="submit" loading={loading} className="btn-block">
          Sign in
        </Button>
      </form>
    </div>
  );
}
