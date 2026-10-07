import type { Session, User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { signUpOutcome } from "@/lib/auth/signup";

const user = (identities: unknown[] | undefined) => ({ id: "u1", identities }) as unknown as User;

describe("crear cuenta", () => {
  it("con sesión: entra directo", () => {
    expect(signUpOutcome({ user: user([{}]), session: {} as Session })).toBe("sesion");
  });

  it("sin sesión y con identidad nueva: hay que confirmar el correo", () => {
    expect(signUpOutcome({ user: user([{ provider: "email" }]), session: null })).toBe("confirmar");
  });

  it("sin sesión y sin identidades: el correo ya tenía cuenta (Supabase no envía correo)", () => {
    expect(signUpOutcome({ user: user([]), session: null })).toBe("existe");
  });

  it("respuesta sin datos de identidades: se asume que hay que confirmar", () => {
    expect(signUpOutcome({ user: user(undefined), session: null })).toBe("confirmar");
    expect(signUpOutcome({ user: null, session: null })).toBe("confirmar");
  });
});
