import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { Divider } from "@astryxdesign/core/Divider"
import { TextInput } from "@astryxdesign/core/TextInput"
import type { SignInMethods } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { type FormEvent, useState } from "react"
import { AppTheme } from "../../components/AppTheme.tsx"
import { colors } from "../../styles/tokens.stylex.ts"
import { authClient } from "./authClient.ts"

export interface LoginProps {
  readonly methods: SignInMethods
  /** Same-origin path to open after signing in. */
  readonly next: string
  readonly error?: string | undefined
}

const providerLabels = { google: "Google", microsoft: "Microsoft" } as const

type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "sent"; readonly email: string }
  | { readonly kind: "failed"; readonly message: string }

/** Hydrated island. Offers only the sign-in methods the server has configured. */
export default function LoginIsland({ methods, next, error }: LoginProps) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<Status>(
    error
      ? { kind: "failed", message: "Sign-in didn’t complete. Please try again." }
      : { kind: "idle" },
  )
  const pending = status.kind === "pending"

  const settle = (result: { error: { message?: string | undefined } | null }) => {
    if (result.error) {
      setStatus({ kind: "failed", message: result.error.message ?? "Something went wrong." })
      return false
    }
    return true
  }

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault()
    setStatus({ kind: "pending" })
    const result =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name })
    if (settle(result)) window.location.assign(next)
  }

  const sendMagicLink = async () => {
    setStatus({ kind: "pending" })
    const result = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: "/login?error=magic-link",
    })
    if (settle(result)) setStatus({ kind: "sent", email })
  }

  const signInWith = async (provider: SignInMethods["social"][number]) => {
    setStatus({ kind: "pending" })
    settle(
      await authClient.signIn.social({
        provider,
        callbackURL: next,
        errorCallbackURL: "/login?error=oauth",
      }),
    )
  }

  const hasEmailForm = methods.password || methods.magicLink

  return (
    <AppTheme>
      <Card xstyle={styles.card}>
        {status.kind === "failed" && <Banner status="error" title={status.message} />}
        {status.kind === "sent" && (
          <Banner
            status="success"
            title="Check your email"
            description={`We sent a sign-in link to ${status.email}.`}
          />
        )}

        {methods.social.length > 0 && (
          <div {...stylex.props(styles.stack)}>
            {methods.social.map((provider) => (
              <Button
                key={provider}
                label={`Continue with ${providerLabels[provider]}`}
                width="100%"
                isDisabled={pending}
                onClick={() => void signInWith(provider)}
              />
            ))}
          </div>
        )}

        {methods.social.length > 0 && hasEmailForm && <Divider label="or" />}

        {hasEmailForm && (
          <form {...stylex.props(styles.stack)} onSubmit={(event) => void submitPassword(event)}>
            {methods.password && mode === "signUp" && (
              <TextInput
                label="Name"
                value={name}
                onChange={setName}
                autoComplete="name"
                isRequired
              />
            )}
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              isRequired
            />
            {methods.password && (
              <>
                <TextInput
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  {...(mode === "signUp" ? { description: "At least 8 characters." } : {})}
                  isRequired
                />
                <Button
                  type="submit"
                  variant="primary"
                  width="100%"
                  label={mode === "signIn" ? "Sign in" : "Create account"}
                  isLoading={pending}
                  isDisabled={pending}
                />
              </>
            )}
            {methods.magicLink && (
              <Button
                label="Email me a sign-in link"
                width="100%"
                variant={methods.password ? "ghost" : "primary"}
                isDisabled={pending || email === ""}
                onClick={() => void sendMagicLink()}
              />
            )}
          </form>
        )}

        {methods.password && (
          <p {...stylex.props(styles.switch)}>
            {mode === "signIn" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              {...stylex.props(styles.link)}
              onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
            >
              {mode === "signIn" ? "Create an account" : "Sign in"}
            </button>
          </p>
        )}

        {!hasEmailForm && methods.social.length === 0 && (
          <Banner
            status="warning"
            title="No sign-in methods are configured"
            description="Set provider credentials or enable AUTH_PASSWORD in the server environment."
          />
        )}
      </Card>
    </AppTheme>
  )
}

const styles = stylex.create({
  card: { display: "grid", gap: 18, maxWidth: 400, marginInline: "auto" },
  stack: { display: "grid", gap: 12 },
  switch: { margin: 0, fontSize: 13, color: colors.muted, textAlign: "center" },
  link: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.mossDark,
    font: "inherit",
    textDecoration: "underline",
    cursor: "pointer",
  },
})
