import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { Divider } from "@astryxdesign/core/Divider"
import { TextInput } from "@astryxdesign/core/TextInput"
import type { SignInMethods } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { type FormEvent, useState } from "react"
import { defineIsland } from "../../client/hydrateIsland.ts"
import { Icon } from "../../components/Icon.tsx"
import { text } from "../../styles/text.ts"
import { colors, media } from "../../styles/tokens.stylex.ts"
import { authClient } from "./authClient.ts"

export interface LoginProps {
  readonly methods: SignInMethods
  /** Same-origin path to open after signing in. */
  readonly next: string
  readonly error?: string | undefined
}

export const loginIsland = defineIsland("login", LoginIsland)

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
    <Card xstyle={styles.card}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.emblem)} aria-hidden="true">
          <Icon name="leaf" size={22} />
        </div>
        <p {...stylex.props(text.eyebrow, styles.eyebrow)}>CONSERVATORY ACCESS</p>
        <h1 {...stylex.props(text.serif, styles.title)}>
          {mode === "signIn" ? "Welcome back" : "Join the garden"}
        </h1>
        <p {...stylex.props(styles.subtitle, text.pretty)}>
          Sign in to tend shared spaces and sync your preferences.
        </p>
      </header>

      {methods.password && (
        <div {...stylex.props(styles.modeTrack)} role="group" aria-label="Account mode">
          <button
            type="button"
            aria-pressed={mode === "signIn"}
            onClick={() => setMode("signIn")}
            {...stylex.props(styles.modeTab, mode === "signIn" && styles.modeTabActive)}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "signUp"}
            onClick={() => setMode("signUp")}
            {...stylex.props(styles.modeTab, mode === "signUp" && styles.modeTabActive)}
          >
            Create account
          </button>
        </div>
      )}

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
  )
}

const styles = stylex.create({
  card: {
    display: "grid",
    gap: 20,
    maxWidth: 440,
    marginInline: "auto",
    paddingBlock: { default: 32, [media.mobile]: 24 },
    paddingInline: { default: 32, [media.mobile]: 22 },
    borderRadius: 24,
  },
  header: {
    display: "grid",
    gap: 8,
    justifyItems: "center",
    textAlign: "center",
  },
  emblem: {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    color: colors.mossDark,
    marginBottom: 4,
  },
  eyebrow: {
    marginBottom: 0,
  },
  title: {
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 1.1,
    margin: 0,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: colors.muted,
    maxWidth: 320,
  },
  modeTrack: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  modeTab: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: "transparent",
    color: colors.muted,
    font: "inherit",
    fontSize: 12,
    fontWeight: 500,
    paddingBlock: 7,
    paddingInline: 12,
    borderRadius: 999,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out, box-shadow 0.15s ease-out, transform 0.1s ease-out",
  },
  modeTabActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderSubtle,
    boxShadow: colors.shadowSm,
    color: colors.ink,
    fontWeight: 600,
  },
  stack: { display: "grid", gap: 12 },
  switch: { margin: 0, fontSize: 13, color: colors.muted, textAlign: "center" },
  link: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.mossDark,
    font: "inherit",
    fontWeight: 600,
    textDecoration: "underline",
    cursor: "pointer",
  },
})
